import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  studentsTable,
  studentSessionsTable,
  assignmentsTable,
  classesTable,
  worksheetsTable,
  quizzesTable,
  submissionsTable,
} from "@workspace/paideia-db";
import { and, desc, eq } from "drizzle-orm";
import {
  newSessionToken,
  STUDENT_SESSION_COOKIE,
  SESSION_TTL_DAYS,
  sessionExpiry,
  verifyPassword,
} from "../../lib/auth.js";
import { requireStudent } from "../../middlewares/auth.js";
import { gradeQuiz, gradeWorksheet } from "../../lib/grading.js";
import { enqueueGrading } from "../../lib/gradingQueue.js";
import { isLearningProfile } from "../../lib/prompts.js";

const router: IRouter = Router();

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env["NODE_ENV"] === "production",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

const loginSchema = z.object({
  identifier: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const id = parsed.data.identifier.trim();
  const idLower = id.toLowerCase();
  const idUpper = id.toUpperCase();
  const byEmail = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.email, idLower))
    .limit(1);
  let student = byEmail[0];
  if (!student) {
    const byCode = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.joinCode, idUpper))
      .limit(1);
    student = byCode[0];
  }
  if (!student || !student.passwordHash || !verifyPassword(parsed.data.password, student.passwordHash)) {
    res.status(401).json({ error: "Login details are incorrect" });
    return;
  }
  const token = newSessionToken();
  await db.insert(studentSessionsTable).values({
    token,
    studentId: student.id,
    expiresAt: sessionExpiry(),
  });
  res.cookie(STUDENT_SESSION_COOKIE, token, cookieOptions());
  const { passwordHash: _ph, ...safe } = student;
  res.json({ student: safe });
});

router.post("/logout", async (req, res) => {
  const token = req.cookies?.[STUDENT_SESSION_COOKIE];
  if (token) {
    await db.delete(studentSessionsTable).where(eq(studentSessionsTable.token, token));
  }
  res.clearCookie(STUDENT_SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  if (!req.student) {
    res.json({ student: null });
    return;
  }
  const { passwordHash: _ph, ...safe } = req.student;
  res.json({ student: safe });
});

// Evidence-based cognitive diagnostic.
// We DO NOT use VARK or other fixed learning-styles theories - they are not supported by evidence.
// Instead we sample brief cognitive items across three Bloom levels (recall, comprehension, application),
// plus two self-report items (processing style and pace), and infer a soft prior the system can use
// to adjust pacing, scaffolding, and item-type balance.

type ItemType = "recall" | "comprehension" | "application";

interface DiagnosticItem {
  id: string;
  type: ItemType;
  prompt: string;
  options: string[];
  correctIndex: number;
}

const DIAGNOSTIC_ITEMS: DiagnosticItem[] = [
  { id: "r1", type: "recall", prompt: "Photosynthesis converts sunlight, water, and which gas into glucose?",
    options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"], correctIndex: 2 },
  { id: "r2", type: "recall", prompt: "Which part of a plant cell captures sunlight for photosynthesis?",
    options: ["Nucleus", "Chloroplast", "Mitochondrion", "Vacuole"], correctIndex: 1 },
  { id: "c1", type: "comprehension", prompt: "Why do most plant leaves appear green to our eyes?",
    options: ["They absorb mostly green light", "They reflect mostly green light", "Green dye is added by the soil", "Green is the colour of the cell wall"], correctIndex: 1 },
  { id: "c2", type: "comprehension", prompt: "If a healthy plant is kept in complete darkness for several days, what happens to its glucose production?",
    options: ["It increases", "It stays the same", "It stops almost entirely", "It changes colour"], correctIndex: 2 },
  { id: "a1", type: "application", prompt: "A potted plant on a sunny windowsill wilts after a week with no water. What is the most likely reason it stopped making glucose?",
    options: ["The sunlight became too strong", "Water, which is a required reactant, ran out", "Carbon dioxide ran out", "The leaves got too cold"], correctIndex: 1 },
  { id: "a2", type: "application", prompt: "You want to design a fair test to measure how light intensity affects the rate of photosynthesis. Which one variable should you deliberately change?",
    options: ["The species of plant", "The temperature of the water", "The brightness of the light", "The amount of soil"], correctIndex: 2 },
];

const diagnosticSchema = z.object({
  answers: z.record(z.string(), z.number().int().min(0).max(3)),
  processingStylePref: z.enum(["sequential", "conceptual"]),
  pacePref: z.enum(["quick", "deliberate", "moderate"]),
});

function inferConfidencePattern(itemResults: Array<{ correct: boolean }>): "improving" | "fatiguing" | "consistent" {
  if (itemResults.length < 4) return "consistent";
  const half = Math.floor(itemResults.length / 2);
  const firstHalf = itemResults.slice(0, half).filter((r) => r.correct).length;
  const secondHalf = itemResults.slice(half).filter((r) => r.correct).length;
  if (secondHalf - firstHalf >= 1) return "improving";
  if (firstHalf - secondHalf >= 1) return "fatiguing";
  return "consistent";
}

router.post("/diagnostic", requireStudent, async (req, res) => {
  const parsed = diagnosticSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const totals: Record<ItemType, { correct: number; answered: number }> = {
    recall: { correct: 0, answered: 0 },
    comprehension: { correct: 0, answered: 0 },
    application: { correct: 0, answered: 0 },
  };
  const ordered: Array<{ correct: boolean }> = [];
  for (const item of DIAGNOSTIC_ITEMS) {
    const idx = parsed.data.answers[item.id];
    if (idx == null) continue;
    const correct = idx === item.correctIndex;
    totals[item.type].answered += 1;
    if (correct) totals[item.type].correct += 1;
    ordered.push({ correct });
  }
  const pct = (t: { correct: number; answered: number }) =>
    t.answered === 0 ? 50 : Math.round((t.correct / t.answered) * 100);

  const sampleSize = ordered.length;
  const profile = {
    schemaVersion: 1 as const,
    processingStyle: parsed.data.processingStylePref,
    pace: parsed.data.pacePref,
    strengthByQuestionType: {
      recall: pct(totals.recall),
      comprehension: pct(totals.comprehension),
      application: pct(totals.application),
    },
    confidencePattern: inferConfidencePattern(ordered),
    // A 6-item one-shot diagnostic is intentionally a "low" confidence prior.
    // It will be revised by later study/assessment behaviour rather than treated as a label.
    inferenceConfidence: "low" as const,
    sampleSize,
  };

  await db
    .update(studentsTable)
    .set({ learningStyle: profile, diagnosticTakenAt: new Date() })
    .where(eq(studentsTable.id, req.student!.id));
  res.json({ profile });
});

router.get("/diagnostic", requireStudent, async (req, res) => {
  const rows = await db.select({ learningStyle: studentsTable.learningStyle, diagnosticTakenAt: studentsTable.diagnosticTakenAt })
    .from(studentsTable)
    .where(eq(studentsTable.id, req.student!.id))
    .limit(1);
  const row = rows[0];
  // Validate persisted profile against canonical schema; legacy / pre-canonical rows return null.
  const persisted = row?.learningStyle;
  const profile = isLearningProfile(persisted) ? persisted : null;
  res.json({
    taken: !!row?.diagnosticTakenAt,
    profile,
    notice: "This is a brief cognitive diagnostic, not a learning-styles questionnaire. The signal is a starting prior - it will be refined as you study.",
    items: DIAGNOSTIC_ITEMS.map(({ id, type, prompt, options }) => ({ id, type, prompt, options })),
    selfReport: [
      {
        id: "processingStylePref",
        prompt: "When you start a new topic, which usually helps you more?",
        options: [
          { value: "sequential", label: "Building up step by step, then seeing how the pieces fit" },
          { value: "conceptual", label: "Getting the big picture first, then filling in the steps" },
        ],
      },
      {
        id: "pacePref",
        prompt: "Which best describes the pace you prefer when learning something challenging?",
        options: [
          { value: "quick", label: "Quick - I like to move fast and come back to fix things" },
          { value: "moderate", label: "Moderate - steady, checking in as I go" },
          { value: "deliberate", label: "Deliberate - I prefer to take my time and get it right the first time" },
        ],
      },
    ],
  });
});

router.get("/assignments", requireStudent, async (req, res) => {
  const rows = await db
    .select({
      assignment: assignmentsTable,
      class: classesTable,
    })
    .from(assignmentsTable)
    .innerJoin(classesTable, eq(assignmentsTable.classId, classesTable.id))
    .where(and(eq(assignmentsTable.classId, req.student!.classId), eq(assignmentsTable.deliveryMode, "accounts")))
    .orderBy(desc(assignmentsTable.createdAt));
  const mine = await db
    .select({ assignmentId: submissionsTable.assignmentId, id: submissionsTable.id })
    .from(submissionsTable)
    .where(eq(submissionsTable.studentId, req.student!.id));
  const submissionByAssignment = new Map(mine.map((m) => [m.assignmentId, m.id]));
  res.json({
    assignments: rows.map((r) => ({
      ...r.assignment,
      className: r.class.name,
      submitted: submissionByAssignment.has(r.assignment.id),
      submissionId: submissionByAssignment.get(r.assignment.id) ?? null,
    })),
  });
});

router.get("/assignments/:id", requireStudent, async (req, res) => {
  const id = req.params["id"] as string;
  const rows = await db
    .select()
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.classId, req.student!.classId), eq(assignmentsTable.deliveryMode, "accounts")))
    .limit(1);
  const assignment = rows[0];
  if (!assignment) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const existing = await db
    .select()
    .from(submissionsTable)
    .where(and(eq(submissionsTable.assignmentId, id), eq(submissionsTable.studentId, req.student!.id)))
    .orderBy(desc(submissionsTable.submittedAt))
    .limit(1);
  const resource = await loadResource(assignment);
  if (!resource) {
    res.status(500).json({ error: "Resource missing" });
    return;
  }
  res.json({
    assignment: { id: assignment.id, title: assignment.title, resourceKind: assignment.resourceKind, closed: assignment.closed },
    resource: stripAnswers(resource, assignment.resourceKind),
    submission: existing[0] ?? null,
  });
});

router.post("/assignments/:id/submit", requireStudent, async (req, res) => {
  const id = req.params["id"] as string;
  const schema = z.object({ answers: z.record(z.string(), z.string().max(4000)) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const rows = await db
    .select()
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.classId, req.student!.classId), eq(assignmentsTable.deliveryMode, "accounts")))
    .limit(1);
  const assignment = rows[0];
  if (!assignment || assignment.closed) {
    res.status(403).json({ error: "Assignment is not open" });
    return;
  }
  const existing = await db
    .select({ id: submissionsTable.id })
    .from(submissionsTable)
    .where(and(eq(submissionsTable.assignmentId, id), eq(submissionsTable.studentId, req.student!.id)))
    .limit(1);
  if (existing[0]) {
    res.status(409).json({ error: "You have already submitted this assignment." });
    return;
  }
  const resource = await loadResource(assignment);
  if (!resource) {
    res.status(500).json({ error: "Resource missing" });
    return;
  }
  const graded = gradeResource(resource, assignment.resourceKind, parsed.data.answers);
  const displayName = `${req.student!.firstName} ${req.student!.lastInitial}`;
  let submission;
  try {
    [submission] = await db
      .insert(submissionsTable)
      .values({
        assignmentId: id,
        studentId: req.student!.id,
        displayName,
        answers: parsed.data.answers,
        autoScore: graded.autoScore,
        maxAutoScore: graded.maxAutoScore,
        needsReviewCount: graded.needsReviewCount,
        feedback: graded.feedback,
      })
      .returning();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      res.status(409).json({ error: "You have already submitted this assignment." });
      return;
    }
    throw err;
  }
  if (!submission) {
    res.status(500).json({ error: "Could not save submission" });
    return;
  }
  enqueueGrading(submission.id);
  res.json({
    submission: {
      id: submission.id,
      autoScore: submission.autoScore,
      maxAutoScore: submission.maxAutoScore,
      needsReviewCount: submission.needsReviewCount,
      feedback: graded.feedback,
      gradingStatus: submission.gradingStatus,
    },
  });
});

router.get("/submissions/:id", requireStudent, async (req, res) => {
  const id = req.params["id"] as string;
  const rows = await db
    .select()
    .from(submissionsTable)
    .where(and(eq(submissionsTable.id, id), eq(submissionsTable.studentId, req.student!.id)))
    .limit(1);
  const sub = rows[0];
  if (!sub) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const aRows = await db
    .select({
      id: assignmentsTable.id,
      title: assignmentsTable.title,
      resourceKind: assignmentsTable.resourceKind,
    })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, sub.assignmentId))
    .limit(1);
  res.json({
    submission: {
      id: sub.id,
      autoScore: sub.autoScore,
      maxAutoScore: sub.maxAutoScore,
      needsReviewCount: sub.needsReviewCount,
      feedback: sub.feedback,
      gradingStatus: sub.gradingStatus,
      gradedAt: sub.gradedAt,
      submittedAt: sub.submittedAt,
    },
    assignment: aRows[0] ?? null,
  });
});

async function loadResource(a: { resourceKind: string; worksheetId: string | null; quizId: string | null }) {
  if (a.resourceKind === "worksheet" && a.worksheetId) {
    const r = await db.select().from(worksheetsTable).where(eq(worksheetsTable.id, a.worksheetId)).limit(1);
    return r[0] ?? null;
  }
  if (a.resourceKind === "quiz" && a.quizId) {
    const r = await db.select().from(quizzesTable).where(eq(quizzesTable.id, a.quizId)).limit(1);
    return r[0] ?? null;
  }
  return null;
}

function stripAnswers(resource: { content: unknown }, kind: string) {
  const c = JSON.parse(JSON.stringify(resource.content)) as Record<string, unknown>;
  if (kind === "worksheet" && Array.isArray(c["questions"])) {
    c["questions"] = (c["questions"] as Array<Record<string, unknown>>).map((q) => {
      const { answer: _a, workingOrRubric: _w, ...rest } = q;
      return rest;
    });
  }
  if (kind === "quiz" && Array.isArray(c["items"])) {
    c["items"] = (c["items"] as Array<Record<string, unknown>>).map((q) => {
      const { correctAnswer: _a, ...rest } = q;
      return rest;
    });
  }
  return c;
}

function gradeResource(resource: { content: unknown }, kind: string, answers: Record<string, string>) {
  const c = resource.content as Record<string, unknown>;
  if (kind === "quiz") {
    return gradeQuiz((c["items"] as never) ?? [], answers);
  }
  return gradeWorksheet((c["questions"] as never) ?? [], answers);
}

export default router;
