import { pgTable, text, integer, real, boolean, date, timestamp, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Adaptive remediation content — the multi-modal "close the gap" material the in-LMS Coach
 * generates for an off-track learner. For each gap (a gradebook category on the learner's
 * active remedial plan) we generate, ONCE, a set of flashcards + knowledge questions grounded
 * in that learner's actual course content, then track their spaced-repetition + quiz progress.
 * Everything is keyed to (userId, planId, category) so it stays scoped to the learner's own gap.
 */

// One generated set per (learner, plan, gap category).
export const remedialSetsTable = pgTable(
  "remedial_sets",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    planId: text("plan_id"),
    courseId: text("course_id"),
    category: text("category").notNull(),
    learnerName: text("learner_name"),
    // "ready" once content is generated; "empty" if the course had no usable content.
    status: text("status").notNull().default("ready"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    byUser: index("remedial_sets_user_idx").on(t.userId),
  }),
);

// A flashcard with its own invisible SM-2 schedule (front prompt -> back answer).
export const remedialFlashcardsTable = pgTable(
  "remedial_flashcards",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    setId: text("set_id").notNull(),
    userId: text("user_id").notNull(),
    front: text("front").notNull(),
    back: text("back").notNull(),
    hint: text("hint"),
    order: integer("order").notNull().default(0),
    // SM-2 state (mirrors concept_mastery; the learner never sees these numbers).
    mastery: real("mastery").notNull().default(0),
    ef: real("ef").notNull().default(2.5),
    interval: integer("interval").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    dueDate: date("due_date"),
    lastReviewedAt: timestamp("last_reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    bySet: index("remedial_flashcards_set_idx").on(t.setId),
  }),
);

// A multiple-choice knowledge question with its correct answer + explanation.
export const remedialQuestionsTable = pgTable(
  "remedial_questions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    setId: text("set_id").notNull(),
    userId: text("user_id").notNull(),
    prompt: text("prompt").notNull(),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    correctIndex: integer("correct_index").notNull(),
    explanation: text("explanation"),
    difficulty: text("difficulty").notNull().default("medium"),
    order: integer("order").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    lastChoice: integer("last_choice"),
    lastCorrect: boolean("last_correct"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    bySet: index("remedial_questions_set_idx").on(t.setId),
  }),
);

// One gamification row per learner: XP earned, current + longest daily streak.
export const coachGamificationTable = pgTable("coach_gamification", {
  userId: text("user_id").primaryKey(),
  xp: integer("xp").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActivityDate: date("last_activity_date"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type RemedialSet = typeof remedialSetsTable.$inferSelect;
export type RemedialFlashcard = typeof remedialFlashcardsTable.$inferSelect;
export type RemedialQuestion = typeof remedialQuestionsTable.$inferSelect;
export type CoachGamification = typeof coachGamificationTable.$inferSelect;
