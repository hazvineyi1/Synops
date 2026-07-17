import { pgTable, text, timestamp, numeric, integer, date, jsonb, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Concept mastery — the invisible SM-2 spaced-repetition engine.
 * One row per (learner, module). Mastery is what the learner sees;
 * ef/interval/reps/dueDate schedule when the Coach brings a concept back.
 * When a PraxisMark credential decays, its module surfaces here as due.
 */
export const conceptMasteryTable = pgTable(
  "concept_mastery",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    moduleId: text("module_id").notNull(),
    moduleTitle: text("module_title").notNull().default(""),
    courseId: text("course_id"),
    mastery: numeric("mastery", { precision: 5, scale: 4 }).notNull().default("0"),
    ef: numeric("ef", { precision: 4, scale: 2 }).notNull().default("2.5"),
    interval: integer("interval").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lastGrade: integer("last_grade"),
    dueDate: date("due_date"),
    lastReviewedAt: timestamp("last_reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userModuleUnique: unique().on(t.userId, t.moduleId),
  })
);

export const insertConceptMasterySchema = createInsertSchema(conceptMasteryTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertConceptMastery = z.infer<typeof insertConceptMasterySchema>;
export type ConceptMastery = typeof conceptMasteryTable.$inferSelect;

/**
 * Coach daily plan — the "spine". Each day the Coach opens with a
 * rationale-backed plan built from due concepts, weakest concepts and
 * yesterday's activity. Stored so tomorrow's plan can reference today.
 */
export const coachPlanStatusEnum = pgEnum("coach_plan_status", [
  "active",
  "completed",
]);

export const coachPlansTable = pgTable("coach_plans", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  planDate: date("plan_date").notNull(),
  rationale: text("rationale").notNull().default(""),
  // [{ moduleId, moduleTitle, courseId, kind: 'review'|'new'|'weak', reason, done }]
  // Gradebook-generated remediation plans store StudyPlanItem[] (schema/gradebook.ts) here.
  items: jsonb("items").notNull().default([]),
  status: coachPlanStatusEnum("coach_plan_status").notNull().default("active"),
  // Which course a gradebook-triggered plan targets (null for the daily Coach spine).
  courseId: text("course_id"),
  // Origin: "coach" (daily spine) | "gradebook_alert" (off-track remediation).
  source: text("source").notNull().default("coach"),
  // For gradebook_alert plans pushed to The Coach (AI study-coach app): the returned magic-link URL
  // the learner opens to work the remedial plan inside the AI coach. Null until pushed/configured.
  coachUrl: text("coach_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCoachPlanSchema = createInsertSchema(coachPlansTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCoachPlan = z.infer<typeof insertCoachPlanSchema>;
export type CoachPlan = typeof coachPlansTable.$inferSelect;

export interface CoachPlanItem {
  moduleId: string;
  moduleTitle: string;
  courseId: string | null;
  kind: "review" | "new" | "weak";
  reason: string;
  done: boolean;
}
