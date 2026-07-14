import { pgTable, text, timestamp, integer, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const beatTypeEnum = pgEnum("beat_type", [
  "title_card",
  "points",
  "scenario",
  "compare",
  "diagram",
  "close",
  "video",
]);

export const audioStatusEnum = pgEnum("audio_status", [
  "none",
  "pending",
  "ready",
  "error",
]);

export const beatsTable = pgTable("beats", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  moduleId: text("module_id").notNull(),
  type: beatTypeEnum("beat_type").notNull(),
  order: integer("order").notNull().default(0),
  title: text("title").notNull(),
  narration: text("narration").notNull(),
  bulletPoints: text("bullet_points").array().notNull().default([]),
  scenario: text("scenario"),
  visualData: jsonb("visual_data"),
  videoUrl: text("video_url"),
  videoDurationSeconds: integer("video_duration_seconds"),
  audioUrl: text("audio_url"),
  audioStatus: audioStatusEnum("audio_status").notNull().default("none"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBeatSchema = createInsertSchema(beatsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBeat = z.infer<typeof insertBeatSchema>;
export type Beat = typeof beatsTable.$inferSelect;
