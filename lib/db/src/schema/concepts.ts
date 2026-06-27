import { pgTable, serial, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const conceptsTable = pgTable("concepts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  source: text("source").notNull().default("paste"), // paste | url | file
  visualSvg: text("visual_svg"),
  mastery: real("mastery").notNull().default(0),
  dueDate: text("due_date").notNull(), // ISO date string
  ef: real("ef").notNull().default(2.5), // SM-2 ease factor
  interval: integer("interval").notNull().default(1), // days
  reps: integer("reps").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertConceptSchema = createInsertSchema(conceptsTable).omit({ id: true, createdAt: true });
export type InsertConcept = z.infer<typeof insertConceptSchema>;
export type Concept = typeof conceptsTable.$inferSelect;
