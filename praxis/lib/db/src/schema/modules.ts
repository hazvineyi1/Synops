import { pgTable, text, timestamp, integer, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const moduleStatusEnum = pgEnum("module_status", [
  "draft",
  "review",
  "published",
]);

export const lessonTypeEnum = pgEnum("lesson_type", [
  "socratic",
  "video",
  "slides",
  "quiz",
]);

// Delivery modality for a module/class. Async = self-paced; sync = live/scheduled;
// hybrid = a mix. Drives the modality badge and (later) session scheduling surfaces.
export const moduleModalityEnum = pgEnum("module_modality", [
  "async",
  "sync",
  "hybrid",
]);

export const modulesTable = pgTable("modules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  // Optional magazine-style banner image for the module hero.
  bannerUrl: text("banner_url"),
  // Small JSON of overview customisations (rich HTML for overview/objectives/how-to, styling).
  overviewConfig: text("overview_config"),
  // Section-menu (rail) customisations that apply to EVERY viewer: { order, hidden, labels }.
  railConfig: text("rail_config"),
  status: moduleStatusEnum("module_status").notNull().default("draft"),
  lessonType: lessonTypeEnum("lesson_type").notNull().default("socratic"),
  // Learner-facing module-level learning objectives (what you will be able to do).
  objectives: text("objectives").array().notNull().default([]),
  // How this module/class is delivered.
  modality: moduleModalityEnum("module_modality").notNull().default("async"),
  order: integer("order").notNull().default(0),
  // Optional add-on: a module that is not part of the core (source-manual) course, clearly labelled and
  // freely includable/removable. Purely additive; core modules stay optional=false.
  optional: boolean("is_optional").notNull().default(false),
  beatCount: integer("beat_count").notNull().default(0),
  estimatedMinutes: integer("estimated_minutes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertModuleSchema = createInsertSchema(modulesTable).omit({
  id: true,
  beatCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertModule = z.infer<typeof insertModuleSchema>;
export type Module = typeof modulesTable.$inferSelect;
