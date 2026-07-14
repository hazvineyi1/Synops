import { Router } from "express";
import { db } from "@workspace/db";
import { interactiveVideoQuestionsTable, ivResponsesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// GET /beats/:beatId/interactive-questions
router.get("/beats/:beatId/interactive-questions", requireAuth, async (req, res) => {
  const questions = await db.select().from(interactiveVideoQuestionsTable)
    .where(eq(interactiveVideoQuestionsTable.beatId, req.params.beatId))
    .orderBy(asc(interactiveVideoQuestionsTable.videoTimestamp));
  res.json(questions.map(q => ({
    ...q,
    videoTimestamp: Number(q.videoTimestamp),
    points: Number(q.points),
  })));
});

// POST /beats/:beatId/interactive-questions
router.post("/beats/:beatId/interactive-questions", requireAuth, async (req, res) => {
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
  const { videoTimestamp, stem, options, correctOptionIds, feedbackCorrect, feedbackIncorrect } = req.body;
  const [updated] = await db.update(interactiveVideoQuestionsTable)
    .set({ videoTimestamp: videoTimestamp ? String(videoTimestamp) : undefined, stem, options, correctOptionIds, feedbackCorrect, feedbackIncorrect })
    .where(eq(interactiveVideoQuestionsTable.id, req.params.questionId))
    .returning();
  res.json(updated);
});

// DELETE /interactive-questions/:questionId
router.delete("/interactive-questions/:questionId", requireAuth, async (req, res) => {
  await db.delete(interactiveVideoQuestionsTable).where(eq(interactiveVideoQuestionsTable.id, req.params.questionId));
  res.status(204).send();
});

// POST /interactive-questions/:questionId/respond
router.post("/interactive-questions/:questionId/respond", requireAuth, async (req, res) => {
  const { response, sessionId } = req.body;
  const question = await db.query.interactiveVideoQuestionsTable.findFirst({ where: eq(interactiveVideoQuestionsTable.id, req.params.questionId) });
  if (!question) { res.status(404).json({ error: "Not found" }); return; }

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
