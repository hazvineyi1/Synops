import {
  db,
  studyMockExamsTable,
  studyPracticeSessionsTable,
  studyTutorMessagesTable,
  studyTutorConversationsTable,
} from "@workspace/paideia-db";
import { and, eq, gte, sql } from "drizzle-orm";

// Free-tier caps for the hybrid model: a free learner gets a taste of every paid
// feature, then hits these limits. Paid tiers (plus/pro) are uncapped. Tune here.
export const FREE_LIMITS = {
  practiceQuestionsPerDay: 15,
  tutorMessagesPerDay: 10,
  mockExamsTotal: 1,
};

export function isPaidTier(tier: string | null | undefined): boolean {
  return tier === "plus" || tier === "pro";
}

function startOfTodayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function countMockExams(userId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(studyMockExamsTable)
    .where(eq(studyMockExamsTable.userId, userId));
  return rows[0]?.c ?? 0;
}

export async function countPracticeQuestionsToday(userId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`coalesce(sum(${studyPracticeSessionsTable.questionCount}), 0)::int` })
    .from(studyPracticeSessionsTable)
    .where(
      and(
        eq(studyPracticeSessionsTable.userId, userId),
        gte(studyPracticeSessionsTable.createdAt, startOfTodayUtc()),
      ),
    );
  return rows[0]?.c ?? 0;
}

export async function countTutorMessagesToday(userId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(studyTutorMessagesTable)
    .innerJoin(
      studyTutorConversationsTable,
      eq(studyTutorConversationsTable.id, studyTutorMessagesTable.conversationId),
    )
    .where(
      and(
        eq(studyTutorConversationsTable.userId, userId),
        eq(studyTutorMessagesTable.role, "user"),
        gte(studyTutorMessagesTable.createdAt, startOfTodayUtc()),
      ),
    );
  return rows[0]?.c ?? 0;
}
