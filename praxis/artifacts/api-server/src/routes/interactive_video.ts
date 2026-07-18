import { Router } from "express";
import { db } from "@workspace/db";
import { interactiveVideoQuestionsTable, ivResponsesTable, beatsTable, modulesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { canParticipateInCourse, canStaffActOnCourse } from "../lib/scope";

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
