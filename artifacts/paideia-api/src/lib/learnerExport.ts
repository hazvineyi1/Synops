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
  studyConsentsTable,
  studyDeletionRequestsTable,
} from "@workspace/paideia-db";
import { eq, inArray } from "drizzle-orm";

/**
 * Assemble a complete, machine-readable copy of one learner's own data (POPIA
 * right of access). Single source of truth for both /api/study/account/export
 * and /api/me/data-export. The password hash is never included. Returns null if
 * the account does not exist.
 */
export async function assembleLearnerExport(userId: string): Promise<Record<string, unknown> | null> {
  const [accountRow] = await db.select().from(studyUsersTable).where(eq(studyUsersTable.id, userId));
  if (!accountRow) return null;

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
    consentHistory,
    deletionRequests,
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
    db.select().from(studyConsentsTable).where(eq(studyConsentsTable.userId, userId)),
    db.select().from(studyDeletionRequestsTable).where(eq(studyDeletionRequestsTable.userId, userId)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    app: "coach",
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
    consentHistory,
    deletionRequests,
  };
}
