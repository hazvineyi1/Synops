import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  studyFlashcardsTable,
} from "@workspace/paideia-db";
import { eq, and, or, isNull, lte, gte } from "drizzle-orm";
import { requireStudyUser } from "../../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireStudyUser);

const flashcardInputSchema = z.object({
  materialId: z.string().nullable().optional(),
  conceptId: z.string().nullable().optional(),
  front: z.string().min(1),
  back: z.string().min(1),
  hint: z.string().nullable().optional(),
});

const flashcardUpdateSchema = z.object({
  front: z.string().min(1).optional(),
  back: z.string().min(1).optional(),
  hint: z.string().nullable().optional(),
});

const reviewInputSchema = z.object({
  quality: z.number().int().min(0).max(5),
});

// SM-2 Algorithm
function sm2Update(quality: number, intervalDays: number, repetitions: number, easeFactor: number) {
  let newInterval = intervalDays;
  let newRepetitions = repetitions;
  let newEaseFactor = easeFactor;

  if (quality < 3) {
    newRepetitions = 0;
    newInterval = 1;
  } else {
    newRepetitions = repetitions + 1;
    if (newRepetitions === 1) newInterval = 1;
    else if (newRepetitions === 2) newInterval = 6;
    else newInterval = Math.round(intervalDays * easeFactor);
  }

  newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (newEaseFactor < 1.3) newEaseFactor = 1.3;

  return { intervalDays: newInterval, repetitions: newRepetitions, easeFactor: newEaseFactor };
}

router.get("/", async (req, res) => {
  const userId = req.studyUser!.id;
  const rows = await db
    .select()
    .from(studyFlashcardsTable)
    .where(eq(studyFlashcardsTable.userId, userId))
    .orderBy(studyFlashcardsTable.createdAt);
  res.json(rows);
});

router.post("/", async (req, res) => {
  const parsed = flashcardInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const data = parsed.data;
  const userId = req.studyUser!.id;
  const [card] = await db
    .insert(studyFlashcardsTable)
    .values({
      userId,
      materialId: data.materialId ?? null,
      conceptId: data.conceptId ?? null,
      front: data.front,
      back: data.back,
      hint: data.hint ?? null,
      nextReviewAt: new Date(),
      intervalDays: 1,
      repetitions: 0,
      easeFactor: 2.5,
      reviewCount: 0,
    })
    .returning();
  res.status(201).json(card);
});

router.patch("/:flashcardId", async (req, res) => {
  const userId = req.studyUser!.id;
  const flashcardId = req.params.flashcardId;
  const parsed = flashcardUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [card] = await db
    .update(studyFlashcardsTable)
    .set({
      front: parsed.data.front,
      back: parsed.data.back,
      hint: parsed.data.hint ?? undefined,
    })
    .where(and(eq(studyFlashcardsTable.userId, userId), eq(studyFlashcardsTable.id, flashcardId)))
    .returning();
  if (!card) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(card);
});

router.delete("/:flashcardId", async (req, res) => {
  const userId = req.studyUser!.id;
  const flashcardId = req.params.flashcardId;
  await db
    .delete(studyFlashcardsTable)
    .where(and(eq(studyFlashcardsTable.userId, userId), eq(studyFlashcardsTable.id, flashcardId)));
  res.json({ success: true });
});

router.get("/review-queue", async (req, res) => {
  const userId = req.studyUser!.id;
  const now = new Date();
  // Cards due for review
  const dueCards = await db
    .select()
    .from(studyFlashcardsTable)
    .where(
      and(
        eq(studyFlashcardsTable.userId, userId),
        or(
          isNull(studyFlashcardsTable.nextReviewAt),
          lte(studyFlashcardsTable.nextReviewAt, now),
        ),
      ),
    )
    .orderBy(studyFlashcardsTable.nextReviewAt);

  // New cards not yet reviewed
  const newCards = await db
    .select()
    .from(studyFlashcardsTable)
    .where(
      and(
        eq(studyFlashcardsTable.userId, userId),
        eq(studyFlashcardsTable.reviewCount, 0),
      ),
    )
    .limit(10);

  // Calculate streak (simplified: check daily reviews in last 7 days)
  const streakDays = 0; // Would need review history table for accurate tracking

  res.json({
    dueToday: dueCards,
    newCards: newCards.filter((c) => !dueCards.find((d) => d.id === c.id)),
    totalDue: dueCards.length,
    streakDays,
  });
});

router.post("/:flashcardId/review", async (req, res) => {
  const userId = req.studyUser!.id;
  const flashcardId = req.params.flashcardId;
  const parsed = reviewInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const quality = parsed.data.quality;

  const rows = await db
    .select()
    .from(studyFlashcardsTable)
    .where(and(eq(studyFlashcardsTable.userId, userId), eq(studyFlashcardsTable.id, flashcardId)))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const card = rows[0];

  const updated = sm2Update(quality, card.intervalDays, card.repetitions, card.easeFactor);

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + updated.intervalDays);

  const [result] = await db
    .update(studyFlashcardsTable)
    .set({
      intervalDays: updated.intervalDays,
      repetitions: updated.repetitions,
      easeFactor: updated.easeFactor,
      nextReviewAt: nextReview,
      lastReviewedAt: new Date(),
      reviewCount: card.reviewCount + 1,
    })
    .where(and(eq(studyFlashcardsTable.userId, userId), eq(studyFlashcardsTable.id, flashcardId)))
    .returning();

  res.json(result);
});

export default router;
