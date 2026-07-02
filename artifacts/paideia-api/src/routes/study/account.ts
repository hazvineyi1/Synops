import { Router, type IRouter } from "express";
import {
  db,
  studyUsersTable,
  studyLearnerProfilesTable,
  studyCognitiveProfilesTable,
  studyLearningStyleProfilesTable,
  studyMaterialsTable,
  studyConceptsTable,
  studyFlashcardsTable,
  studyPracticeSessionsTable,
  studyMockExamsTable,
  studyAssessmentsTable,
  studyTutorConversationsTable,
  studyTutorMessagesTable,
  studyWeeklyBriefsTable,
  studyKnowledgeNodesTable,
  studyKnowledgeEdgesTable,
  studyContentChunksTable,
  studyAnnotationsTable,
  studyContentSourcesTable,
  studyLearningPathsTable,
  studyLearningPathStepsTable,
  studyActivityLogTable,
  studyNotificationsTable,
  studyPaymentsTable,
} from "@workspace/paideia-db";
import { eq, inArray } from "drizzle-orm";
import { requireStudyUser } from "../../middlewares/auth.js";
import {
  verifyPassword,
  STUDY_SESSION_COOKIE,
  STUDY_IMPERSONATOR_COOKIE,
} from "../../lib/studyAuth.js";
import { logger } from "../../lib/logger.js";

// Learner data rights (GDPR): a self-service export of everything we hold on the
// signed-in learner, and a password-confirmed self-deletion of their account.
const router: IRouter = Router();
router.use(requireStudyUser);

// GET /export — a complete machine-readable copy of the learner's own data.
// Streamed as a downloadable JSON attachment. The password hash is never included.
router.get("/export", async (req, res) => {
  const userId = req.studyUser!.id;

  const [accountRow] = await db
    .select()
    .from(studyUsersTable)
    .where(eq(studyUsersTable.id, userId));
  if (!accountRow) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  // Never export the password hash.
  const account: Record<string, unknown> = { ...accountRow };
  delete account["passwordHash"];

  const conversations = await db
    .select()
    .from(studyTutorConversationsTable)
    .where(eq(studyTutorConversationsTable.userId, userId));
  const conversationIds = conversations.map((c) => c.id);
  const tutorMessages = conversationIds.length
    ? await db
        .select()
        .from(studyTutorMessagesTable)
        .where(inArray(studyTutorMessagesTable.conversationId, conversationIds))
    : [];

  const [
    learnerProfile,
    cognitiveProfile,
    learningStyleProfile,
    materials,
    concepts,
    flashcards,
    practiceSessions,
    mockExams,
    assessments,
    weeklyBriefs,
    knowledgeNodes,
    knowledgeEdges,
    contentChunks,
    annotations,
    contentSources,
    learningPaths,
    learningPathSteps,
    activityLog,
    notifications,
    payments,
  ] = await Promise.all([
    db.select().from(studyLearnerProfilesTable).where(eq(studyLearnerProfilesTable.userId, userId)),
    db.select().from(studyCognitiveProfilesTable).where(eq(studyCognitiveProfilesTable.userId, userId)),
    db.select().from(studyLearningStyleProfilesTable).where(eq(studyLearningStyleProfilesTable.userId, userId)),
    db.select().from(studyMaterialsTable).where(eq(studyMaterialsTable.userId, userId)),
    db.select().from(studyConceptsTable).where(eq(studyConceptsTable.userId, userId)),
    db.select().from(studyFlashcardsTable).where(eq(studyFlashcardsTable.userId, userId)),
    db.select().from(studyPracticeSessionsTable).where(eq(studyPracticeSessionsTable.userId, userId)),
    db.select().from(studyMockExamsTable).where(eq(studyMockExamsTable.userId, userId)),
    db.select().from(studyAssessmentsTable).where(eq(studyAssessmentsTable.userId, userId)),
    db.select().from(studyWeeklyBriefsTable).where(eq(studyWeeklyBriefsTable.userId, userId)),
    db.select().from(studyKnowledgeNodesTable).where(eq(studyKnowledgeNodesTable.userId, userId)),
    db.select().from(studyKnowledgeEdgesTable).where(eq(studyKnowledgeEdgesTable.userId, userId)),
    db.select().from(studyContentChunksTable).where(eq(studyContentChunksTable.userId, userId)),
    db.select().from(studyAnnotationsTable).where(eq(studyAnnotationsTable.userId, userId)),
    db.select().from(studyContentSourcesTable).where(eq(studyContentSourcesTable.userId, userId)),
    db.select().from(studyLearningPathsTable).where(eq(studyLearningPathsTable.userId, userId)),
    db.select().from(studyLearningPathStepsTable).where(eq(studyLearningPathStepsTable.userId, userId)),
    db.select().from(studyActivityLogTable).where(eq(studyActivityLogTable.userId, userId)),
    db.select().from(studyNotificationsTable).where(eq(studyNotificationsTable.userId, userId)),
    db.select().from(studyPaymentsTable).where(eq(studyPaymentsTable.userId, userId)),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    account,
    learnerProfile,
    cognitiveProfile,
    learningStyleProfile,
    materials,
    concepts,
    flashcards,
    practiceSessions,
    mockExams,
    assessments,
    tutor: { conversations, messages: tutorMessages },
    weeklyBriefs,
    knowledgeNodes,
    knowledgeEdges,
    contentChunks,
    annotations,
    contentSources,
    learningPaths,
    learningPathSteps,
    activityLog,
    notifications,
    payments,
  };

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="synops-coach-data-${userId.slice(0, 8)}.json"`,
  );
  res.send(JSON.stringify(payload, null, 2));
});

// POST /delete — permanently delete the learner's own account and all their data.
// Requires the account password to confirm (also blocks an impersonating admin,
// who would not know it). Every study_* row cascades from the user row, including
// sessions, so this is a hard delete.
router.post("/delete", async (req, res) => {
  const userId = req.studyUser!.id;
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password) {
    res.status(400).json({ error: "Your password is required to delete your account" });
    return;
  }

  const [acct] = await db
    .select({ passwordHash: studyUsersTable.passwordHash })
    .from(studyUsersTable)
    .where(eq(studyUsersTable.id, userId));
  if (!acct || !verifyPassword(password, acct.passwordHash)) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }

  await db.delete(studyUsersTable).where(eq(studyUsersTable.id, userId));
  res.clearCookie(STUDY_SESSION_COOKIE, { path: "/", sameSite: "lax" });
  res.clearCookie(STUDY_IMPERSONATOR_COOKIE, { path: "/", sameSite: "lax" });
  logger.info({ userId }, "learner self-deleted account and all data");
  res.json({ ok: true });
});

export default router;
