import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const retrospectivesTable = pgTable("retrospectives", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  weekStart: text("week_start").notNull(), // ISO date (Monday)
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRetrospectiveSchema = createInsertSchema(retrospectivesTable).omit({ id: true, createdAt: true });
export type InsertRetrospective = z.infer<typeof insertRetrospectiveSchema>;
export type Retrospective = typeof retrospectivesTable.$inferSelect;
