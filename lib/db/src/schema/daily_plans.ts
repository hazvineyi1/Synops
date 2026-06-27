import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dailyPlansTable = pgTable("daily_plans", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  goalText: text("goal_text").notNull(),
  conceptIds: jsonb("concept_ids").notNull().$type<number[]>().default([]),
  estimatedMinutes: integer("estimated_minutes").notNull().default(30),
  status: text("status").notNull().default("proposed"), // proposed | active | completed | missed
  completedConceptIds: jsonb("completed_concept_ids").notNull().$type<number[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDailyPlanSchema = createInsertSchema(dailyPlansTable).omit({ id: true, createdAt: true });
export type InsertDailyPlan = z.infer<typeof insertDailyPlanSchema>;
export type DailyPlan = typeof dailyPlansTable.$inferSelect;
