import { pgTable, text, timestamp, numeric, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";

export const ivQuestionTypeEnum = pgEnum("iv_question_type", [
  "multiple_choice",
  "check_all",
  "fill_blank",
  "reflection",
  "poll",
  "hotspot",
]);

export const interactiveVideoQuestionsTable = pgTable("interactive_video_questions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  beatId: text("beat_id").notNull(),
  videoTimestamp: numeric("video_timestamp", { precision: 8, scale: 2 }).notNull(),
  questionType: ivQuestionTypeEnum("iv_question_type").notNull().default("multiple_choice"),
  stem: text("stem").notNull(),
  options: jsonb("options").notNull().default([]),
  correctOptionIds: text("correct_option_ids").array().notNull().default([]),
  feedbackCorrect: text("feedback_correct"),
  feedbackIncorrect: text("feedback_incorrect"),
  pauseOnReach: boolean("pause_on_reach").notNull().default(true),
  required: boolean("required").notNull().default(true),
  points: numeric("points", { precision: 5, scale: 2 }).notNull().default("1"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type InteractiveVideoQuestion = typeof interactiveVideoQuestionsTable.$inferSelect;

export const ivResponsesTable = pgTable("iv_responses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  questionId: text("question_id").notNull(),
  sessionId: text("session_id"),
  userId: text("user_id").notNull(),
  response: jsonb("response").notNull(),
  correct: boolean("correct"),
  score: numeric("score", { precision: 5, scale: 2 }),
  answeredAt: timestamp("answered_at").notNull().defaultNow(),
});

export type IvResponse = typeof ivResponsesTable.$inferSelect;
