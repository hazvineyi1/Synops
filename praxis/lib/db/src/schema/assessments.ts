import { pgTable, text, timestamp, integer, numeric, boolean, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assessmentTypeEnum = pgEnum("assessment_type", [
  "diagnostic",
  "mastery",
  "formative",
]);

export const assessmentStatusEnum = pgEnum("assessment_status_enum", [
  "draft",
  "active",
  "archived",
]);

export const assessmentsTable = pgTable("assessments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  description: text("description"),
  type: assessmentTypeEnum("assessment_type").notNull(),
  status: assessmentStatusEnum("assessment_status_enum").notNull().default("draft"),
  tenantId: text("tenant_id").notNull(),
  competencyTags: text("competency_tags").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAssessmentSchema = createInsertSchema(assessmentsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAssessment = z.infer<typeof insertAssessmentSchema>;
export type Assessment = typeof assessmentsTable.$inferSelect;

export const assessmentItemsTable = pgTable("assessment_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  assessmentId: text("assessment_id").notNull(),
  stem: text("stem").notNull(),
  options: jsonb("options").notNull(),
  correctOptionId: text("correct_option_id").notNull(),
  difficulty: numeric("difficulty", { precision: 5, scale: 4 }).notNull().default("0.5"),
  competencyTag: text("competency_tag"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAssessmentItemSchema = createInsertSchema(assessmentItemsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAssessmentItem = z.infer<typeof insertAssessmentItemSchema>;
export type AssessmentItem = typeof assessmentItemsTable.$inferSelect;

export const attemptStatusEnum = pgEnum("attempt_status", [
  "in_progress",
  "complete",
]);

export const attemptsTable = pgTable("attempts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  assessmentId: text("assessment_id").notNull(),
  userId: text("user_id").notNull(),
  status: attemptStatusEnum("attempt_status").notNull().default("in_progress"),
  currentItemId: text("current_item_id"),
  overallAbility: numeric("overall_ability", { precision: 5, scale: 4 }),
  competencyScores: jsonb("competency_scores").notNull().default({}),
  itemCount: integer("item_count").notNull().default(0),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const itemResponsesTable = pgTable("item_responses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  attemptId: text("attempt_id").notNull(),
  itemId: text("item_id").notNull(),
  selectedOptionId: text("selected_option_id").notNull(),
  correct: boolean("correct").notNull(),
  responseTimeMs: integer("response_time_ms"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});
