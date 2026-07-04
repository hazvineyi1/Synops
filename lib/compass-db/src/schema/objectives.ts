import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const objectivesTable = pgTable("objectives", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  level: text("level").notNull().default("course"),
  text: text("text").notNull(),
  parentId: integer("parent_id"),
  moduleId: integer("module_id"),
  masteryEvidence: text("mastery_evidence"),
  // Engine-derived, backfilled on QA evaluate. Nullable until first evaluation.
  // cognitiveLevel is a Bloom's taxonomy level (Remember..Create);
  // measurabilityStatus is "measurable" | "vague" | "unmeasurable".
  cognitiveLevel: text("cognitive_level"),
  measurabilityStatus: text("measurability_status"),
  isFlagged: boolean("is_flagged").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertObjectiveSchema = createInsertSchema(objectivesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertObjective = z.infer<typeof insertObjectiveSchema>;
export type Objective = typeof objectivesTable.$inferSelect;
