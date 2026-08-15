import { Router } from "express";
import { db } from "@workspace/db";
import { interactiveVideoQuestionsTable, ivResponsesTable, beatsTable, modulesTable, moduleReadingsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { canParticipateInCourse, canStaffActOnCourse } from "../lib/scope";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router();

/**
 * A question hangs off a beat, which hangs off a module, which belongs to a course. Every
 * route here was `requireAuth` only, so any authenticated user could read, author, edit or
 * delete the in-video questions of any course. Resolve the course, then gate.
 */
async function courseOfBeat(beatId: string): Promise<string | null> {
  const beat = await db.query.beatsTable.findFirst({ where: eq(beatsTable.id, beatId) });
  if (!beat) return null;
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, beat.moduleId) });
  return mod?.courseId ?? null;
}
async function gate(req: any, res: any, beatId: string, mode: "staff" | "participant"): Promise<boolean> {
  const courseId = await courseOfBeat(beatId);
  if (!courseId) { res.status(404).json({ error: "Not found" }); return false; }
  const ok = mode === "staff"
    ? await canStaffActOnCourse(req.dbUser!, courseId)
    : await canParticipateInCourse(req.dbUser!, courseId);
  if (!ok) { res.status(403).json({ error: "Forbidden" }); return false; }
  return true;
}
async function participantOnQuestion(req: any, res: any, beatId: string): Promise<boolean> {
  return gate(req, res, beatId, "participant");
}

// GET /beats/:beatId/interactive-questions
router.get("/beats/:beatId/interactive-questions", requireAuth, async (req, res) => {
  if (!(await gate(req, res, req.params.beatId, "participant"))) return;
  const isStaff = await canStaffActOnCourse(req.dbUser!, (await courseOfBeat(req.params.beatId))!);
  const questions = await db.select().from(interactiveVideoQuestionsTable)
    .where(eq(interactiveVideoQuestionsTable.beatId, req.params.beatId))
    .orderBy(asc(interactiveVideoQuestionsTable.videoTimestamp));
  res.json(questions.map(q => {
    const base = {
      ...q,
      videoTimestamp: Number(q.videoTimestamp),
      points: Number(q.points),
    };
    // THE ANSWER KEY WAS BEING SHIPPED TO LEARNERS. correctOptionIds is what the question
    // is scored against, and the client received it before the learner answered -- visible
    // to anyone who opened devtools or read the network tab. Grading happens server-side in
    // /respond, so the client never needed it. Staff still get it: they author these.
    if (!isStaff) {
      const { correctOptionIds, feedbackCorrect, feedbackIncorrect, ...safe } = base;
      return safe;
    }
    return base;
  }));
});

// POST /beats/:beatId/interactive-questions
router.post("/beats/:beatId/interactive-questions", requireAuth, async (req, res) => {
  if (!(await gate(req, res, req.params.beatId, "staff"))) return;
  const { videoTimestamp, questionType, stem, options, correctOptionIds, feedbackCorrect, feedbackIncorrect, pauseOnReach, required, points } = req.body;
  const [question] = await db.insert(interactiveVideoQuestionsTable).values({
    beatId: req.params.beatId,
    videoTimestamp: String(videoTimestamp),
    questionType: questionType ?? "multiple_choice",
    stem,
    options: options ?? [],
    correctOptionIds: correctOptionIds ?? [],
    feedbackCorrect,
    feedbackIncorrect,
    pauseOnReach: pauseOnReach ?? true,
    required: required ?? true,
    points: String(points ?? 1),
  }).returning();
  res.status(201).json({ ...question, videoTimestamp: Number(question.videoTimestamp), points: Number(question.points) });
});

// POST /beats/:beatId/interactive-questions/generate -- draft checkpoint MCQs from the module's
// content and insert them at spaced timestamps. Staff-only.
router.post("/beats/:beatId/interactive-questions/generate", requireAuth, async (req, res) => {
  if (!(await gate(req, res, req.params.beatId, "staff"))) return;
  const beat = await db.query.beatsTable.findFirst({ where: eq(beatsTable.id, req.params.beatId) });
  if (!beat) { res.status(404).json({ error: "Not found" }); return; }
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, beat.moduleId) });
  const readings = await db.select().from(moduleReadingsTable).where(eq(moduleReadingsTable.moduleId, beat.moduleId));
  // Prefer a pasted transcript (persisted on the beat) so checkpoints come from what the video
  // ACTUALLY says, keyed to real timestamps, rather than the lesson notes at fixed spacing.
  const bodyTranscript = String((req.body as { transcript?: string } | undefined)?.transcript ?? "").trim();
  const storedTranscript = ((beat as { transcript?: string }).transcript ?? "").trim();
  const transcript = bodyTranscript || storedTranscript;
  if (bodyTranscript && bodyTranscript !== storedTranscript) {
    await db.update(beatsTable).set({ transcript: bodyTranscript }).where(eq(beatsTable.id, beat.id));
  }
  const fromTranscript = transcript.length >= 60;

  const lessonContent = [
    `Module: ${mod?.title ?? ""}`,
    mod?.objectives?.length ? `Objectives: ${mod.objectives.join("; ")}` : "",
    beat.title ? `Video: ${beat.title}` : "",
    beat.narration ? `Video notes: ${beat.narration}` : "",
    readings.map((r) => r.content ?? "").filter(Boolean).join("\n\n"),
  ].filter(Boolean).join("\n\n").slice(0, 6000);
  const content = fromTranscript ? transcript.slice(0, 12000) : lessonContent;
  if (content.trim().length < 60) {
    res.status(400).json({ error: fromTranscript ? "The transcript is too short to generate checkpoints from." : "Not enough content to generate checkpoints. Paste the video transcript to generate from what the video actually says." });
    return;
  }

  const wantRaw = Number((req.body as { count?: number } | undefined)?.count);
  const want = Number.isFinite(wantRaw) ? Math.max(1, Math.min(8, Math.round(wantRaw))) : (fromTranscript ? 5 : 3);
  const prompt = fromTranscript
    ? `You are given the TRANSCRIPT of a video. Write ${want} multiple-choice CHECKPOINT questions that pop up while a learner watches it. Each question must check understanding of a specific point the speaker actually makes in the transcript (not trivia), phrased so a learner who has just watched that part can answer it. Give 4 options, one correct, and one line of feedback for the correct answer.\nFor EACH question set "timestampSeconds" to the moment the point is made: if the transcript contains timestamps (e.g. 0:45, [01:20], 1:03:12), convert the relevant one to seconds; if it has none, estimate an increasing, sensibly spaced value. Order the questions by timestamp.\nReturn ONLY strict JSON: { "questions": [ { "stem": "…", "options": ["A","B","C","D"], "correctIndex": 0, "feedback": "…", "timestampSeconds": 45 } ] }\n\n=== TRANSCRIPT ===\n${content}\n\nReturn ONLY the JSON object.`
    : `Write ${want} multiple-choice CHECKPOINT questions to pop up while a learner watches a video on this topic. Each checks understanding of a key idea (not trivia), with 4 options and one correct answer, plus one line of feedback for the correct answer. Ground them in the content below.\n\nReturn ONLY strict JSON: { "questions": [ { "stem": "…", "options": ["A","B","C","D"], "correctIndex": 0, "feedback": "…" } ] }\n\n=== CONTENT ===\n${content}\n\nReturn ONLY the JSON object.`;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }, { timeout: 90000, maxRetries: 1 });
    const text = (msg.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("");
    // Parse defensively: the model can wrap the JSON in ``` fences or add a stray sentence, and a
    // truncated response leaves malformed JSON. Try each candidate in turn and NEVER let a parse
    // error escape -- an unguarded JSON.parse here used to throw and surface as a 502.
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const candidates = [cleaned, cleaned.match(/\{[\s\S]*\}/)?.[0] ?? ""];
    let parsed: any = {};
    for (const cand of candidates) {
      if (!cand) continue;
      try { parsed = JSON.parse(cand); break; } catch { /* try the next candidate */ }
    }
    const qs = Array.isArray(parsed.questions) ? parsed.questions : [];
    const created = [];
    let i = 0;
    for (const q of qs.slice(0, want)) {
      const opts = Array.isArray(q?.options) ? q.options.map((t: any, k: number) => ({ id: `o${k}`, text: String(t).slice(0, 300) })).filter((o: any) => o.text.trim()) : [];
      const ci = Math.max(0, Math.min(opts.length - 1, Number(q?.correctIndex) || 0));
      if (!q?.stem || opts.length < 2) continue;
      // From a transcript, place the checkpoint at the moment the point is made; otherwise space them.
      const tsModel = Number(q?.timestampSeconds);
      const ts = fromTranscript && Number.isFinite(tsModel) && tsModel > 0
        ? Math.min(Math.round(tsModel), 6 * 3600)
        : 45 + i * 75;
      const [row] = await db.insert(interactiveVideoQuestionsTable).values({
        beatId: req.params.beatId, videoTimestamp: String(ts), questionType: "multiple_choice",
        stem: String(q.stem).slice(0, 500), options: opts, correctOptionIds: [`o${ci}`],
        feedbackCorrect: q?.feedback ? String(q.feedback).slice(0, 500) : null, pauseOnReach: true, required: true, points: "1",
      }).returning();
      created.push(row.id); i++;
    }
    if (!created.length) { res.status(422).json({ error: "Could not generate checkpoints. Try again." }); return; }
    res.status(201).json({ created: created.length });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("checkpoint gen failed:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Could not generate checkpoints. Please try again." });
  }
});

// PATCH /interactive-questions/:questionId
router.patch("/interactive-questions/:questionId", requireAuth, async (req, res) => {
  const q = await db.query.interactiveVideoQuestionsTable.findFirst({ where: eq(interactiveVideoQuestionsTable.id, req.params.questionId) });
  if (!q) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await gate(req, res, q.beatId, "staff"))) return;
  const { videoTimestamp, stem, options, correctOptionIds, feedbackCorrect, feedbackIncorrect } = req.body;
  const [updated] = await db.update(interactiveVideoQuestionsTable)
    .set({ videoTimestamp: videoTimestamp ? String(videoTimestamp) : undefined, stem, options, correctOptionIds, feedbackCorrect, feedbackIncorrect })
    .where(eq(interactiveVideoQuestionsTable.id, req.params.questionId))
    .returning();
  res.json(updated);
});

// DELETE /interactive-questions/:questionId
router.delete("/interactive-questions/:questionId", requireAuth, async (req, res) => {
  const q = await db.query.interactiveVideoQuestionsTable.findFirst({ where: eq(interactiveVideoQuestionsTable.id, req.params.questionId) });
  if (!q) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await gate(req, res, q.beatId, "staff"))) return;
  await db.delete(interactiveVideoQuestionsTable).where(eq(interactiveVideoQuestionsTable.id, req.params.questionId));
  res.status(204).send();
});

// POST /interactive-questions/:questionId/respond
router.post("/interactive-questions/:questionId/respond", requireAuth, async (req, res) => {
  const { response, sessionId } = req.body;
  const question = await db.query.interactiveVideoQuestionsTable.findFirst({ where: eq(interactiveVideoQuestionsTable.id, req.params.questionId) });
  if (!question) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await participantOnQuestion(req, res, question.beatId))) return;

  let correct: boolean | null = null;
  let score = 0;
  if (question.questionType === "multiple_choice" || question.questionType === "check_all") {
    const selected: string[] = Array.isArray(response) ? response : [response];
    const correct_ids = question.correctOptionIds;
    correct = selected.length === correct_ids.length && selected.every(s => correct_ids.includes(s));
    score = correct ? Number(question.points) : 0;
  }

  const [ivResponse] = await db.insert(ivResponsesTable).values({
    questionId: req.params.questionId,
    sessionId: sessionId ?? null,
    userId: req.userId!,
    response,
    correct,
    score: String(score),
  }).returning();

  res.json({
    ...ivResponse,
    correct,
    score,
    feedback: correct ? question.feedbackCorrect : question.feedbackIncorrect,
    correctOptionIds: correct === false ? question.correctOptionIds : undefined,
  });
});

export default router;
