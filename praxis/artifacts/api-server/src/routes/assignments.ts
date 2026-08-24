import { Router } from "express";
import { db } from "@workspace/db";
import {
  assignmentsTable, assignmentSubmissionsTable, gradebookEntriesTable,
  rubricsTable, usersTable, notificationsTable, enrolmentsTable,
  modulesTable, moduleReadingsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { canGradeInCourse, canStaffActOnCourse, canParticipateInCourse } from "../lib/scope";
import { onGradeEvent } from "../lib/gradebookAlerts";
import { extractFromBuffer } from "../lib/extractText";
import { generateAssignmentGrade } from "../lib/assignmentEngine";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { AssignmentCriterionScore } from "@workspace/db";

const router = Router();

/**
 * Course-scoped guards for this file.
 *
 * The grading routes were gated when they were written; the authoring and reading routes
 * were not, so any authenticated user could create, edit or delete assignments on any
 * course on the platform, and read any course's assignment list and rubrics.
 */
async function staffOn(req: any, res: any, courseId: string): Promise<boolean> {
  if (await canStaffActOnCourse(req.dbUser!, courseId)) return true;
  res.status(403).json({ error: "Forbidden" });
  return false;
}
async function participantOn(req: any, res: any, courseId: string): Promise<boolean> {
  if (await canParticipateInCourse(req.dbUser!, courseId)) return true;
  res.status(403).json({ error: "Forbidden" });
  return false;
}

/**
 * Everything that happens when a submission actually becomes graded.
 *
 * Extracted because there are now two ways in -- a facilitator marking by hand, and a
 * facilitator confirming an AI draft -- and they must be identical. Grading is not a single
 * write: it sets the submission, mirrors the score into the gradebook, notifies the learner,
 * and fires onGradeEvent (off-track recompute, auto study plan, staff alerts). A second copy
 * of this that forgot one step would produce grades that silently behave differently from
 * the others.
 */
async function applyGrade(opts: {
  submissionId: string;
  assignmentId: string;
  learnerId: string;
  courseId: string;
  graderId: string;
  score: number | null;
  letterGrade?: string | null;
  feedback?: string | null;
  rubricAssessment?: AssignmentCriterionScore[] | null;
}) {
  const scoreStr = opts.score === null ? null : String(opts.score);
  const asn = await db.query.assignmentsTable.findFirst({ where: eq(assignmentsTable.id, opts.assignmentId) });

  // Atomic: the submission grade, the gradebook mirror and the learner notification either all land
  // or none do. Previously these were three independent writes, so a failure between them left a
  // graded submission with no gradebook entry (a "score written but entry missing" window).
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(assignmentSubmissionsTable)
      .set({
        score: scoreStr,
        letterGrade: opts.letterGrade ?? null,
        feedback: opts.feedback ?? null,
        rubricAssessment: opts.rubricAssessment ?? null,
        gradedBy: opts.graderId,
        gradedAt: new Date(),
        status: "graded",
        updatedAt: new Date(),
      })
      .where(eq(assignmentSubmissionsTable.id, opts.submissionId))
      .returning();

    // Mirror the score into gradebook_entries via a real UPSERT, race-safe now that a unique index
    // on (assignment_id, user_id) exists (see dbHardening). No more findFirst-then-insert drift.
    await tx.insert(gradebookEntriesTable)
      .values({
        userId: opts.learnerId,
        courseId: opts.courseId,
        assignmentId: opts.assignmentId,
        score: scoreStr,
        possibleScore: String(Number(asn?.pointsPossible ?? 100)),
        letterGrade: opts.letterGrade ?? null,
        missing: false,
      })
      .onConflictDoUpdate({
        target: [gradebookEntriesTable.assignmentId, gradebookEntriesTable.userId],
        set: { score: scoreStr, letterGrade: opts.letterGrade ?? null, missing: false, updatedAt: new Date() },
      });

    await tx.insert(notificationsTable).values({
      userId: opts.learnerId,
      type: "assignment_graded",
      title: "Your assignment has been graded",
      body: `Score: ${opts.score ?? "--"}, ${opts.feedback?.slice(0, 80) ?? "View feedback in gradebook"}`,
      link: `/courses/${opts.courseId}/assignments/${opts.assignmentId}`,
      courseId: opts.courseId,
      actorId: opts.graderId,
    });
    return row;
  });

  // Refresh the learner's unified-gradebook off-track state (+ auto plan / alerts). After commit.
  void onGradeEvent({ sourceType: "assignment", sourceId: opts.assignmentId, courseId: opts.courseId, userId: opts.learnerId });

  return updated;
}

// Auto-graded game formats: a single quiz, plus sequencing puzzles, matching, Jeopardy and level-up.
const GAME_TYPES = ["quiz", "order", "match", "jeopardy", "spot", "levels"];

/** Flatten any question-style game (quiz/spot/levels/jeopardy) into scoreable {id, correct} items. */
function flattenGameQuestions(config: any): { id: string; correct: number }[] {
  if (Array.isArray(config.questions)) return config.questions.map((q: any, i: number) => ({ id: q.id ?? `q${i}`, correct: q.correct }));
  if (Array.isArray(config.rounds)) return config.rounds.map((r: any, i: number) => ({ id: r.id ?? `r${i}`, correct: r.correct }));
  if (Array.isArray(config.levels)) return config.levels.map((l: any, i: number) => ({ id: l.id ?? `l${i}`, correct: l.correct }));
  if (Array.isArray(config.categories)) {
    const out: { id: string; correct: number }[] = [];
    config.categories.forEach((c: any, ci: number) => (c.tiles ?? []).forEach((t: any, ti: number) => out.push({ id: t.id ?? `c${ci}t${ti}`, correct: t.correct })));
    return out;
  }
  return [];
}

/** Recompute correct/total for any supported game type from its config + the learner's submission. */
function gradeGame(config: any, body: any): { correct: number; total: number } | null {
  const t = config.__type;
  if (t === "match" && Array.isArray(config.pairs)) {
    const total = config.pairs.length || 1;
    const matches = body?.matches ?? {};
    const correct = config.pairs.filter((p: any, i: number) => matches[p.left] === p.right || matches[String(i)] === p.right).length;
    return { correct, total };
  }
  if (t === "order" && Array.isArray(config.order)) {
    const total = config.order.length || 1;
    const submitted: string[] = Array.isArray(body?.order) ? body.order : [];
    const correct = config.order.filter((id: string, i: number) => submitted[i] === id).length;
    return { correct, total };
  }
  const qs = flattenGameQuestions(config);
  if (qs.length) {
    const answers = body?.answers ?? {};
    const correct = qs.filter((q) => answers[q.id] === q.correct).length;
    return { correct, total: qs.length };
  }
  return null;
}

/**
 * If the assignment is an auto-graded GAME (its instructions carry a {__type:...} config for quiz,
 * order, match, jeopardy, spot or levels), score it server-side (never trusting the client's number)
 * and grade via applyGrade - which writes the score, the gradebook cell, notifies, and fires
 * onGradeEvent (off-track alert + gap plan + AI coach). Returns the graded submission, or null.
 */
async function maybeAutoGradeGame(
  assignment: typeof assignmentsTable.$inferSelect,
  submissionId: string,
  submissionBody: string | undefined,
  learnerId: string,
) {
  let config: any = null;
  try { const p = JSON.parse(assignment.instructions ?? ""); if (p && GAME_TYPES.includes(p.__type)) config = p; } catch { /* not a config */ }
  if (!config) return null;
  let body: any = {};
  try { body = JSON.parse(submissionBody ?? "") ?? {}; } catch { /* ignore */ }
  const g = gradeGame(config, body);
  if (!g) return null;
  const pct = Math.round((g.correct / g.total) * 100);
  const points = Math.round((g.correct / g.total) * Number(assignment.pointsPossible));
  const feedback = `Auto-graded: ${g.correct} of ${g.total} correct (${pct}%). ${pct >= (config.passingScore ?? 60) ? "Well done - you have got the key ideas." : "Review the module readings and slides, then you can play again to improve."}`;
  return await applyGrade({
    submissionId, assignmentId: assignment.id, learnerId, courseId: assignment.courseId,
    graderId: "auto", score: points, feedback,
  });
}

/**
 * Draft an AI assessment for a submission, after the submission itself is safely stored.
 *
 * Best-effort and deliberately fire-and-forget: a slow or failed model call must never cost
 * a learner their submission. Writes only to the ai_* columns -- see the schema comment for
 * why this is not allowed to become a grade on its own.
 */
async function draftAiAssessment(submissionId: string, assignment: typeof assignmentsTable.$inferSelect, text: string) {
  try {
    const rubric = assignment.rubricId
      ? await db.query.rubricsTable.findFirst({ where: eq(rubricsTable.id, assignment.rubricId) })
      : null;
    const draft = await generateAssignmentGrade({
      title: assignment.title,
      instructions: assignment.instructions ?? assignment.description,
      pointsPossible: Number(assignment.pointsPossible),
      criteria: rubric?.criteria ?? [],
      submissionText: text,
    });
    if (!draft.ok) return;
    await db.update(assignmentSubmissionsTable)
      .set({
        aiScore: draft.score === null ? null : String(draft.score),
        aiFeedback: draft.feedback,
        aiRubricAssessment: draft.rubricScores,
        aiGradedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(assignmentSubmissionsTable.id, submissionId));
  } catch {
    // Swallowed on purpose: the submission is already saved and valid without this.
  }
}

function toAssignmentResponse(a: typeof assignmentsTable.$inferSelect) {
  return {
    id: a.id, courseId: a.courseId, moduleId: a.moduleId, title: a.title,
    description: a.description, instructions: a.instructions,
    submissionType: a.submissionType, dueDate: a.dueDate?.toISOString() ?? null,
    availableFrom: a.availableFrom?.toISOString() ?? null,
    availableUntil: a.availableUntil?.toISOString() ?? null,
    pointsPossible: Number(a.pointsPossible), allowLateSubmissions: a.allowLateSubmissions,
    latePenaltyPercent: a.latePenaltyPercent, rubricId: a.rubricId,
    groupAssignment: a.groupAssignment, peerReviewRequired: a.peerReviewRequired,
    published: a.published, position: a.position,
    createdAt: a.createdAt.toISOString(),
  };
}

/**
 * GET /courses/:courseId/assignments
 *
 * Each row carries `mySubmitted` for the CALLING learner. Without it the module page can
 * only see that an assignment exists, not whether this learner handed it in -- which makes
 * any "have you finished everything?" gate guesswork. One extra query for the caller's own
 * submissions, never anyone else's.
 */
router.get("/courses/:courseId/assignments", requireAuth, async (req, res) => {
  if (!(await participantOn(req, res, req.params.courseId))) return;
  const assignments = await db.select().from(assignmentsTable)
    .where(eq(assignmentsTable.courseId, req.params.courseId))
    .orderBy(assignmentsTable.position);

  const mine = await db
    .select({ assignmentId: assignmentSubmissionsTable.assignmentId })
    .from(assignmentSubmissionsTable)
    .where(eq(assignmentSubmissionsTable.userId, req.userId!));
  const submitted = new Set(mine.map((r) => r.assignmentId));

  res.json(assignments.map((a) => ({
    ...toAssignmentResponse(a),
    mySubmitted: submitted.has(a.id),
  })));
});

// POST /courses/:courseId/assignments
router.post("/courses/:courseId/assignments", requireAuth, async (req, res) => {
  if (!(await staffOn(req, res, req.params.courseId))) return;
  const { title, description, instructions, submissionType, dueDate, pointsPossible, published, position } = req.body;
  const [assignment] = await db.insert(assignmentsTable).values({
    courseId: req.params.courseId, title, description, instructions,
    submissionType, dueDate: dueDate ? new Date(dueDate) : null,
    pointsPossible: pointsPossible ?? "100", published: published ?? false,
    position: position ?? 0,
  }).returning();

  // Create gradebook entries for all enrolled learners
  const enrolled = await db.select().from(enrolmentsTable).where(eq(enrolmentsTable.courseId, req.params.courseId));
  if (enrolled.length > 0) {
    await db.insert(gradebookEntriesTable).values(
      enrolled.map(e => ({
        userId: e.userId, courseId: req.params.courseId, assignmentId: assignment.id,
        possibleScore: assignment.pointsPossible, missing: true,
      }))
    );
  }

  res.status(201).json(toAssignmentResponse(assignment));
});

// POST /modules/:moduleId/assignments/generate -- draft an assessment (assignment) from THIS
// module's own content and attach it to the module + course as an unpublished draft to review.
router.post("/modules/:moduleId/assignments/generate", requireAuth, async (req, res) => {
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, req.params.moduleId) });
  if (!mod) { res.status(404).json({ error: "Module not found" }); return; }
  if (!(await staffOn(req, res, mod.courseId))) return;

  const readings = await db.select().from(moduleReadingsTable).where(eq(moduleReadingsTable.moduleId, mod.id));
  const material = [
    `Module: ${mod.title}`,
    mod.description ? `Overview: ${mod.description}` : "",
    (mod.objectives?.length ? `Objectives:\n${mod.objectives.map((o) => `- ${o}`).join("\n")}` : ""),
    ...readings.map((r) => (r.content ? `Reading (${r.title}):\n${String(r.content).slice(0, 6000)}` : "")),
  ].filter(Boolean).join("\n\n").slice(0, 18000);
  if (material.trim().length < 60) { res.status(400).json({ error: "This module has too little content to build an assessment from." }); return; }

  const prompt = `You are an expert instructional designer writing a summative assessment for this module, aligned to its objectives. Produce a JSON object:\n- "title": a specific assessment title\n- "description": one sentence describing the assessment and what it evaluates\n- "instructions": clear, numbered student instructions (what to produce, scope, and how it will be judged), 120 to 250 words\nNo em dashes. Return ONLY the JSON object.\n\nMODULE CONTENT:\n${material}`;
  const call = async (usePrefill: boolean): Promise<any> => {
    const messages = usePrefill
      ? [{ role: "user" as const, content: prompt }, { role: "assistant" as const, content: "{" }]
      : [{ role: "user" as const, content: prompt + "\n\nReturn ONLY the JSON object, starting with {." }];
    const message = await anthropic.messages.create({ model: "claude-sonnet-4-6", max_tokens: 1500, messages }, { timeout: 90000, maxRetries: 2 });
    const c = message.content[0];
    const body = c && c.type === "text" ? c.text : "";
    const raw = usePrefill ? "{" + body : body;
    try { return JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; }
  };

  try {
    let parsed: any = {};
    try { parsed = await call(true); if (!parsed?.instructions) parsed = await call(false); }
    catch { parsed = await call(false); }

    const [assignment] = await db.insert(assignmentsTable).values({
      courseId: mod.courseId, moduleId: mod.id,
      title: String(parsed.title || `${mod.title} assessment`).slice(0, 200),
      description: parsed.description ? String(parsed.description).slice(0, 1000) : null,
      instructions: parsed.instructions ? String(parsed.instructions).slice(0, 4000) : null,
      pointsPossible: "100", published: false, position: 0,
    }).returning();
    res.status(201).json(toAssignmentResponse(assignment));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("assignment gen failed:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: `Could not generate an assessment. Details: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}` });
  }
});

// GET /assignments/:assignmentId
router.get("/assignments/:assignmentId", requireAuth, async (req, res) => {
  const assignment = await db.query.assignmentsTable.findFirst({ where: eq(assignmentsTable.id, req.params.assignmentId) });
  if (!assignment) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await participantOn(req, res, assignment.courseId))) return;
  res.json(toAssignmentResponse(assignment));
});

// PATCH /assignments/:assignmentId
router.patch("/assignments/:assignmentId", requireAuth, async (req, res) => {
  const existing = await db.query.assignmentsTable.findFirst({ where: eq(assignmentsTable.id, req.params.assignmentId) });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await staffOn(req, res, existing.courseId))) return;
  const { title, description, instructions, dueDate, pointsPossible, published, position } = req.body;
  const [updated] = await db.update(assignmentsTable)
    .set({ title, description, instructions, dueDate: dueDate ? new Date(dueDate) : undefined, pointsPossible, published, position, updatedAt: new Date() })
    .where(eq(assignmentsTable.id, req.params.assignmentId))
    .returning();
  res.json(toAssignmentResponse(updated));
});

// DELETE /assignments/:assignmentId
router.delete("/assignments/:assignmentId", requireAuth, async (req, res) => {
  const existing = await db.query.assignmentsTable.findFirst({ where: eq(assignmentsTable.id, req.params.assignmentId) });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await staffOn(req, res, existing.courseId))) return;
  await db.delete(assignmentsTable).where(eq(assignmentsTable.id, req.params.assignmentId));
  res.status(204).send();
});

/**
 * POST /assignments/:assignmentId/submit
 *
 * Accepts typed text, a link, and/or an uploaded document. There is no object storage in
 * this stack, so an upload is parsed to text at submit time and only the text is kept --
 * the same approach module readings take. parsedText stays separate from body so what the
 * learner typed remains distinguishable from what their document contained.
 *
 * After the submission is safely stored, an AI assessment is drafted (see assignmentEngine).
 * It is written to the ai_* columns only and is NOT a grade: the learner gets fast, specific
 * feedback, and staff confirm before anything reaches the gradebook.
 */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // express.json caps at 25mb; base64 inflates ~33%
const ALLOWED_EXT = ["pdf", "docx", "txt", "md", "markdown", "rtf", "html", "htm", "odt", "pptx"];
const extOf = (name: string) => (name.split(".").pop() ?? "").toLowerCase();

router.post("/assignments/:assignmentId/submit", requireAuth, async (req, res) => {
  const { body: submissionBody, url, fileUrls, filename, dataBase64 } = req.body;
  const assignment = await db.query.assignmentsTable.findFirst({ where: eq(assignmentsTable.id, req.params.assignmentId) });
  if (!assignment) { res.status(404).json({ error: "Not found" }); return; }

  // FOUND BY TESTING THIS FEATURE LIVE: a learner from one organisation submitted work to
  // another organisation's course, because this route only ever checked that the assignment
  // EXISTED. Submitting is participation, so the caller must be on the course. Nothing bad
  // came of the test only because that learner had no gradebook row for the score to land
  // in -- which is luck, not a guard.
  if (!(await participantOn(req, res, assignment.courseId))) return;

  // Parse an uploaded document to text before anything is written, so a bad file fails the
  // submission outright rather than half-saving it.
  let parsedText: string | null = null;
  let sourceFilename: string | null = null;
  if (dataBase64 && filename) {
    const ext = extOf(filename);
    if (!ALLOWED_EXT.includes(ext)) {
      res.status(400).json({ error: `Unsupported file type ".${ext}". Try PDF, Word, or a text file.` });
      return;
    }
    const buf = Buffer.from(dataBase64, "base64");
    if (buf.length > MAX_UPLOAD_BYTES) {
      res.status(400).json({ error: "That file is too large (15MB maximum)." });
      return;
    }
    try {
      parsedText = await extractFromBuffer(filename, buf);
      sourceFilename = filename;
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "Could not read that file." });
      return;
    }
  }

  const isLate = assignment.dueDate && new Date() > assignment.dueDate;

  const existing = await db.query.assignmentSubmissionsTable.findFirst({
    where: and(eq(assignmentSubmissionsTable.assignmentId, req.params.assignmentId), eq(assignmentSubmissionsTable.userId, req.userId!)),
  });

  let submission;
  if (existing) {
    [submission] = await db.update(assignmentSubmissionsTable)
      .set({
        body: submissionBody, url, fileUrls: fileUrls ?? [],
        // A resubmission without a file must not keep the previous file's text, or the
        // learner would be assessed on work they just replaced.
        parsedText, sourceFilename,
        // Any prior AI draft describes the old submission. Clear it rather than leave stale
        // feedback attached to new work.
        aiScore: null, aiFeedback: null, aiRubricAssessment: null, aiGradedAt: null,
        status: isLate ? "late" : "submitted", submittedAt: new Date(), updatedAt: new Date(),
      })
      .where(eq(assignmentSubmissionsTable.id, existing.id))
      .returning();
  } else {
    [submission] = await db.insert(assignmentSubmissionsTable).values({
      assignmentId: req.params.assignmentId, userId: req.userId!,
      body: submissionBody, url, fileUrls: fileUrls ?? [],
      parsedText, sourceFilename,
      status: isLate ? "late" : "submitted", submittedAt: new Date(),
    }).returning();
    // Update gradebook, mark as submitted (upsert: a learner who enrolled after the
    // assignment was created has no seeded entry row, so a bare UPDATE would no-op and the
    // work would still read as "missing").
    const existingEntry = await db.query.gradebookEntriesTable.findFirst({
      where: and(eq(gradebookEntriesTable.assignmentId, req.params.assignmentId), eq(gradebookEntriesTable.userId, req.userId!)),
    });
    if (existingEntry) {
      await db.update(gradebookEntriesTable)
        .set({ missing: false, late: isLate ?? false })
        .where(eq(gradebookEntriesTable.id, existingEntry.id));
    } else {
      await db.insert(gradebookEntriesTable).values({
        userId: req.userId!, courseId: assignment.courseId, assignmentId: req.params.assignmentId,
        possibleScore: String(Number(assignment.pointsPossible ?? 100)), missing: false, late: isLate ?? false,
      });
    }
  }

  // Auto-graded game? Score it now so the learner gets an instant grade (this also fires the
  // off-track engine: gap analysis + study plan + AI coach for a low score).
  const autoGraded = await maybeAutoGradeGame(assignment, submission.id, submissionBody, req.userId!);

  // Respond with the graded submission when auto-graded, else the saved submission.
  res.status(201).json(autoGraded ?? submission);

  // Only draft AI feedback for open-ended work - an auto-graded quiz already has its grade.
  if (!autoGraded) {
    const assessable = [parsedText, submissionBody].filter(Boolean).join("\n\n").trim();
    if (assessable) void draftAiAssessment(submission.id, assignment, assessable);
  }
});

// GET /assignments/:assignmentId/my-submission
router.get("/assignments/:assignmentId/my-submission", requireAuth, async (req, res) => {
  const submission = await db.query.assignmentSubmissionsTable.findFirst({
    where: and(eq(assignmentSubmissionsTable.assignmentId, req.params.assignmentId), eq(assignmentSubmissionsTable.userId, req.userId!)),
  });
  res.json(submission ?? null);
});

// GET /assignments/:assignmentId/submissions, instructor view
router.get("/assignments/:assignmentId/submissions", requireAuth, async (req, res) => {
  const assignment = await db.query.assignmentsTable.findFirst({
    where: eq(assignmentsTable.id, req.params.assignmentId),
  });
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }
  if (!(await canStaffActOnCourse(req.dbUser!, assignment.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rows = await db
    .select({ submission: assignmentSubmissionsTable, user: usersTable })
    .from(assignmentSubmissionsTable)
    .leftJoin(usersTable, eq(assignmentSubmissionsTable.userId, usersTable.id))
    .where(eq(assignmentSubmissionsTable.assignmentId, req.params.assignmentId))
    .orderBy(desc(assignmentSubmissionsTable.submittedAt));
  res.json(rows.map(r => ({
    ...r.submission,
    user: r.user ? { id: r.user.id, firstName: r.user.firstName, lastName: r.user.lastName, email: r.user.email } : null,
  })));
});

// PATCH /assignment-submissions/:submissionId/grade
router.patch("/assignment-submissions/:submissionId/grade", requireAuth, async (req, res) => {
  // Grading is delivery staff only, scoped (decision §4.3): a Facilitator within the
  // course's org, or a Co-facilitator only for learners in the section(s) they lead.
  const submission = await db.query.assignmentSubmissionsTable.findFirst({
    where: eq(assignmentSubmissionsTable.id, req.params.submissionId),
  });
  if (!submission) { res.status(404).json({ error: "Submission not found" }); return; }
  const assignment = await db.query.assignmentsTable.findFirst({
    where: eq(assignmentsTable.id, submission.assignmentId),
  });
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }
  if (!(await canGradeInCourse(req.dbUser!, assignment.courseId, submission.userId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { score, letterGrade, feedback, rubricAssessment } = req.body;
  const updated = await applyGrade({
    submissionId: submission.id,
    assignmentId: submission.assignmentId,
    learnerId: submission.userId,
    courseId: assignment.courseId,
    graderId: req.userId!,
    score: score === null || score === undefined || score === "" ? null : Number(score),
    letterGrade, feedback, rubricAssessment,
  });
  res.json(updated);
});

/**
 * POST /assignment-submissions/:submissionId/confirm-ai-grade
 *
 * The moment a draft becomes a grade. Staff-gated by exactly the same check as marking by
 * hand, and it records the CONFIRMING STAFF MEMBER as gradedBy -- not the model. Whoever
 * clicks this owns the mark, which is the entire reason a confirmation step exists.
 *
 * The body may override score and feedback, so confirming with an edit is one action rather
 * than a confirm followed by a correction the learner would see twice.
 */
router.post("/assignment-submissions/:submissionId/confirm-ai-grade", requireAuth, async (req, res) => {
  const submission = await db.query.assignmentSubmissionsTable.findFirst({
    where: eq(assignmentSubmissionsTable.id, req.params.submissionId),
  });
  if (!submission) { res.status(404).json({ error: "Submission not found" }); return; }
  if (!submission.aiGradedAt) { res.status(409).json({ error: "There is no AI draft on this submission." }); return; }
  const assignment = await db.query.assignmentsTable.findFirst({
    where: eq(assignmentsTable.id, submission.assignmentId),
  });
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }
  if (!(await canGradeInCourse(req.dbUser!, assignment.courseId, submission.userId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { score: overrideScore, feedback: overrideFeedback } = req.body ?? {};
  const score = overrideScore === undefined || overrideScore === null || overrideScore === ""
    ? (submission.aiScore === null ? null : Number(submission.aiScore))
    : Number(overrideScore);

  const updated = await applyGrade({
    submissionId: submission.id,
    assignmentId: submission.assignmentId,
    learnerId: submission.userId,
    courseId: assignment.courseId,
    graderId: req.userId!,
    score,
    feedback: overrideFeedback ?? submission.aiFeedback,
    rubricAssessment: submission.aiRubricAssessment ?? null,
  });
  res.json(updated);
});

// Rubrics
router.get("/courses/:courseId/rubrics", requireAuth, async (req, res) => {
  if (!(await participantOn(req, res, req.params.courseId))) return;
  const rubrics = await db.select().from(rubricsTable).where(eq(rubricsTable.courseId, req.params.courseId));
  res.json(rubrics);
});

// POST /assignments/:assignmentId/rubric/generate -- AI-generate a content-aware rubric for an
// assignment from its brief + the module's objectives and reading text, save it to the rubrics table
// (the one the grader reads) and attach it. Staff only.
router.post("/assignments/:assignmentId/rubric/generate", requireAuth, async (req, res) => {
  const a = await db.query.assignmentsTable.findFirst({ where: eq(assignmentsTable.id, req.params.assignmentId) });
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await staffOn(req, res, a.courseId))) return;
  let objectives: string[] = [];
  let readingText = "";
  if (a.moduleId) {
    const m = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, a.moduleId) });
    objectives = (m?.objectives ?? []).filter(Boolean);
    const readings = await db.select({ content: moduleReadingsTable.content }).from(moduleReadingsTable).where(eq(moduleReadingsTable.moduleId, a.moduleId));
    readingText = readings.map((r) => r.content ?? "").join("\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
  }
  const total = Math.round(Number(a.pointsPossible) || 100);
  const context = `Assignment title: ${a.title}\nType: ${a.submissionType}\nDescription: ${a.description ?? ""}\nInstructions: ${(a.instructions ?? "").replace(/<[^>]+>/g, " ")}\nModule objectives: ${objectives.join("; ")}\nModule content:\n${readingText}`.slice(0, 12000);
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 1500,
      messages: [{ role: "user", content: `You are an assessment designer. Build a grading rubric for the assignment below, grounded in its actual content and the module objectives, so each criterion measures something this assignment genuinely asks the learner to do. Produce 4 to 5 criteria. Each criterion has a short name, a maxPoints, and 3 to 4 performance levels from strongest to weakest, each with a label, points (0 to maxPoints, top level = maxPoints and lowest = 0), and a one sentence description specific to THIS assignment. The criteria maxPoints must sum to ${total}. Never use em dashes.\n\n${context}\n\nReturn ONLY JSON, no markdown: {"criteria":[{"name":"...","maxPoints":25,"levels":[{"label":"Excellent","points":25,"description":"..."},{"label":"Proficient","points":18,"description":"..."},{"label":"Developing","points":10,"description":"..."},{"label":"Beginning","points":0,"description":"..."}]}]}` }],
    }, { timeout: 60000, maxRetries: 1 });
    const raw = (msg.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("").replace(/[—–]/g, ", ");
    const mm = raw.match(/\{[\s\S]*\}/);
    const parsed = mm ? JSON.parse(mm[0]) : null;
    const criteria = Array.isArray(parsed?.criteria) ? parsed.criteria.map((c: any) => ({
      name: String(c.name || "Criterion").slice(0, 120),
      maxPoints: Math.max(0, Math.round(Number(c.maxPoints) || 0)),
      levels: (Array.isArray(c.levels) ? c.levels : []).map((l: any) => ({ label: String(l.label || "").slice(0, 40), points: Math.max(0, Math.round(Number(l.points) || 0)), description: String(l.description || "").slice(0, 300) })),
    })).filter((c: any) => c.name && c.levels.length) : [];
    if (!criteria.length) { res.status(502).json({ error: "Could not generate a rubric. Try again." }); return; }
    const totalPoints = criteria.reduce((s: number, c: any) => s + c.maxPoints, 0) || total;
    const [rubric] = await db.insert(rubricsTable).values({ courseId: a.courseId, title: `${a.title} rubric`, criteria, totalPoints }).returning();
    await db.update(assignmentsTable).set({ rubricId: rubric.id }).where(eq(assignmentsTable.id, a.id));
    res.json(rubric);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Rubric generation failed" });
  }
});

router.post("/rubrics", requireAuth, async (req, res) => {
  const { courseId, title, criteria, totalPoints } = req.body;
  // courseId arrives in the BODY here, so it is caller-supplied and must be checked before
  // anything is written -- otherwise a rubric can be planted on any course by asking.
  if (!courseId) { res.status(400).json({ error: "courseId is required" }); return; }
  if (!(await staffOn(req, res, courseId))) return;
  const [rubric] = await db.insert(rubricsTable).values({ courseId, title, criteria: criteria ?? [], totalPoints: totalPoints ?? 100 }).returning();
  res.status(201).json(rubric);
});

export default router;
