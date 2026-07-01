import { Router, type IRouter } from "express";
import {
  db,
  studyMaterialsTable,
  studyConceptsTable,
  studyFlashcardsTable,
  studyPracticeSessionsTable,
  studyMockExamsTable,
  studyTutorConversationsTable,
} from "@workspace/paideia-db";
import { eq, and, gte, count, sql } from "drizzle-orm";
import { requireStudyUser } from "../../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireStudyUser);

router.get("/", async (req, res) => {
  const userId = req.studyUser!.id;

  const [materialCount] = await db
    .select({ count: count() })
    .from(studyMaterialsTable)
    .where(eq(studyMaterialsTable.userId, userId));

  const [conceptCount] = await db
    .select({ count: count() })
    .from(studyConceptsTable)
    .where(eq(studyConceptsTable.userId, userId));

  const [flashcardCount] = await db
    .select({ count: count() })
    .from(studyFlashcardsTable)
    .where(eq(studyFlashcardsTable.userId, userId));

  const now = new Date();
  const [dueFlashcards] = await db
    .select({ count: count() })
    .from(studyFlashcardsTable)
    .where(
      and(
        eq(studyFlashcardsTable.userId, userId),
        sql`${studyFlashcardsTable.nextReviewAt} <= ${now}`,
      ),
    );

  // Practice sessions this week
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const [practiceThisWeek] = await db
    .select({ count: count() })
    .from(studyPracticeSessionsTable)
    .where(
      and(
        eq(studyPracticeSessionsTable.userId, userId),
        gte(studyPracticeSessionsTable.createdAt, weekAgo),
      ),
    );

  const [examsTaken] = await db
    .select({ count: count() })
    .from(studyMockExamsTable)
    .where(
      and(
        eq(studyMockExamsTable.userId, userId),
        eq(studyMockExamsTable.status, "completed"),
      ),
    );

  // Average accuracy from completed practice sessions
  const completedSessions = await db
    .select()
    .from(studyPracticeSessionsTable)
    .where(
      and(
        eq(studyPracticeSessionsTable.userId, userId),
        eq(studyPracticeSessionsTable.status, "completed"),
      ),
    );

  let totalAccuracy = 0;
  for (const s of completedSessions) {
    if (s.questionCount > 0) {
      totalAccuracy += s.correctCount / s.questionCount;
    }
  }
  const averageAccuracy = completedSessions.length > 0
    ? Math.round((totalAccuracy / completedSessions.length) * 100) / 100
    : 0;

  const [tutorMessagesWeek] = await db
    .select({ count: count() })
    .from(studyTutorConversationsTable)
    .where(
      and(
        eq(studyTutorConversationsTable.userId, userId),
        gte(studyTutorConversationsTable.updatedAt, weekAgo),
      ),
    );

  // Simple streak calculation (daily reviews in last 7 days)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let currentStreak = 0;
  for (let i = 0; i < 30; i++) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    const dayReviews = await db
      .select({ count: count() })
      .from(studyFlashcardsTable)
      .where(
        and(
          eq(studyFlashcardsTable.userId, userId),
          sql`${studyFlashcardsTable.lastReviewedAt} >= ${day}`,
          sql`${studyFlashcardsTable.lastReviewedAt} < ${nextDay}`,
        ),
      );

    if (Number(dayReviews[0]?.count ?? 0) > 0) {
      currentStreak++;
    } else if (i > 0) {
      break;
    }
  }

  res.json({
    materialCount: Number(materialCount?.count ?? 0),
    conceptCount: Number(conceptCount?.count ?? 0),
    flashcardCount: Number(flashcardCount?.count ?? 0),
    dueFlashcards: Number(dueFlashcards?.count ?? 0),
    currentStreak,
    longestStreak: currentStreak, // Would need historical tracking
    practiceSessionsThisWeek: Number(practiceThisWeek?.count ?? 0),
    mockExamsTaken: Number(examsTaken?.count ?? 0),
    averageAccuracy,
    tutorMessagesThisWeek: Number(tutorMessagesWeek?.count ?? 0),
    subscriptionStatus: req.studyUser!.subscriptionStatus,
    subscriptionExpiresAt: req.studyUser!.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
  });
});

export default router;
