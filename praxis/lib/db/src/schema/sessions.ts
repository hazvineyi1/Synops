import { pgTable, text, timestamp, numeric, integer, pgEnum, jsonb } from "drizzle-orm/pg-core";
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
  /** When launched from a catch-up (off-track) plan item: the weak area the coach concentrates on. */
  remedialFocus: text("remedial_focus"),
  /**
   * The learner-chosen number of interactions (their own answers) for this session, set before they
   * start. It is a HARD cap: once the learner has given this many answers the session ends and an
   * analysis is produced. Null means "not chosen yet" (the setup gate has not run) and the session
   * falls back to the default soft budget.
   */
  plannedInteractions: integer("planned_interactions"),
  /** Why the session ended: "mastered" (bar reached) or "reached_limit" (planned interactions used). */
  endedReason: text("ended_reason"),
  /** End-of-session analysis + recommendation, generated once when the session ends and cached here. */
  analysis: jsonb("analysis"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({
  id: true,
  turnCount: true,
  endedReason: true,
  analysis: true,
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
  // For tutor questions: selectable answer choices the learner can pick instead of typing, plus the
  // mode ("single" = choose one, "multi" = pick all that apply, "free" = write your own).
  options: jsonb("options").$type<string[]>(),
  selectMode: text("select_mode"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDialogueTurnSchema = createInsertSchema(dialogueTurnsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertDialogueTurn = z.infer<typeof insertDialogueTurnSchema>;
export type DialogueTurn = typeof dialogueTurnsTable.$inferSelect;
