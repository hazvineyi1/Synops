import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Membership of a learner (or instructor) in a cohort. One row per (cohort, user).
export const cohortMembersTable = pgTable(
  "cohort_members",
  {
    id: serial("id").primaryKey(),
    cohortId: integer("cohort_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("member"), // instructor | member
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqMember: uniqueIndex("cohort_member_unique").on(t.cohortId, t.userId),
  }),
);

export type CohortMember = typeof cohortMembersTable.$inferSelect;
