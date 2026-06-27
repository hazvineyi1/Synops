import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const coachMessagesTable = pgTable("coach_messages", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(), // coach | user | system_event
  content: text("content").notNull(),
  richBlocks: jsonb("rich_blocks"), // plan_card, checkpoint, quick_replies
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCoachMessageSchema = createInsertSchema(coachMessagesTable).omit({ id: true, createdAt: true });
export type InsertCoachMessage = z.infer<typeof insertCoachMessageSchema>;
export type CoachMessage = typeof coachMessagesTable.$inferSelect;
