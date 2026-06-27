import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const checkpointsTable = pgTable("checkpoints", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  conceptId: integer("concept_id").notNull(),
  date: text("date").notNull(), // ISO date string
  prompt: text("prompt").notNull(),
  userAnswer: text("user_answer"),
  coachGrade: integer("coach_grade"), // 0-3
  coachFeedback: text("coach_feedback"),
  confidenceBefore: integer("confidence_before"), // 0-3
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCheckpointSchema = createInsertSchema(checkpointsTable).omit({ id: true, createdAt: true });
export type InsertCheckpoint = z.infer<typeof insertCheckpointSchema>;
export type Checkpoint = typeof checkpointsTable.$inferSelect;
