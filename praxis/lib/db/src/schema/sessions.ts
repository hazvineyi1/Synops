import { pgTable, text, timestamp, numeric, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionStatusEnum = pgEnum("session_status", [
  "active",
  "mastered",
  "abandoned",
]);

export const sessionsTable = pgTable("sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  moduleId: text("module_id").notNull(),
  userId: text("user_id").notNull(),
  status: sessionStatusEnum("session_status").notNull().default("active"),
  masteryScore: numeric("mastery_score", { precision: 5, scale: 4 }).notNull().default("0"),
  currentBeatId: text("current_beat_id"),
  turnCount: integer("turn_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({
  id: true,
  turnCount: true,
  createdAt: true,
  completedAt: true,
});

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;

export const dialogueTurnsTable = pgTable("dialogue_turns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id").notNull(),
  role: text("role", { enum: ["tutor", "learner"] }).notNull(),
  content: text("content").notNull(),
  beatId: text("beat_id"),
  reasoning: text("reasoning"),
  masteryDelta: numeric("mastery_delta", { precision: 5, scale: 4 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDialogueTurnSchema = createInsertSchema(dialogueTurnsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertDialogueTurn = z.infer<typeof insertDialogueTurnSchema>;
export type DialogueTurn = typeof dialogueTurnsTable.$inferSelect;
