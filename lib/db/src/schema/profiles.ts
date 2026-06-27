import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const profilesTable = pgTable("profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  goal: text("goal").notNull(), // bar | certification | university | general
  examName: text("exam_name"), // specific exam/credential, e.g. "CompTIA Security+", "PMP", "MCAT"
  examDate: text("exam_date"), // ISO date string or null
  hoursPerWeek: integer("hours_per_week").notNull().default(8),
  baseline: text("baseline").notNull(), // zero | foundations | solid | rusty
  calibration: text("calibration").notNull(), // accurate | mostly | overestimate | underestimate
  coachPersonality: text("coach_personality").notNull().default("warm"), // drill | socratic | warm | analyst
  recommendedCoach: text("recommended_coach"),
  assessmentComplete: boolean("assessment_complete").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({ id: true, createdAt: true });
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
