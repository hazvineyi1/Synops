import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

/**
 * Learning Hub persistence (super-admin content home).
 *
 * - learning_content: the platform content library. Files (video/document/image/scorm) live in
 *   Supabase Storage; only the returned public/signed URL + storage path are kept here. Links keep
 *   the URL in `url` with no storage object.
 * - course_templates: reusable course / lesson / assessment templates.
 * - course_assignments: which course template is granted to which partner (surfaced in the partner's
 *   org catalog). Uniqueness of (course_id, partner_id) is enforced in the route by replace-on-write.
 */

export const learningContentTable = pgTable("learning_content", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  kind: text("kind").notNull(), // 'video' | 'document' | 'image' | 'link' | 'scorm'
  meta: text("meta"),           // size string, duration, or the URL for links
  url: text("url"),             // Supabase public/signed URL, or the external link
  storagePath: text("storage_path"), // object path in the bucket (for delete), null for links
  tags: text("tags"),           // comma-separated
  reviewed: boolean("reviewed").notNull().default(false),
  addedBy: text("added_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const courseTemplatesTable = pgTable("course_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  level: text("level").notNull(),     // Foundational | Intermediate | Advanced
  modality: text("modality").notNull(),
  modules: integer("modules").notNull().default(1),
  hours: integer("hours").notNull().default(1),
  standard: text("standard"),
  description: text("description"),
  kind: text("kind").notNull().default("course"), // course | lesson | assessment
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const courseAssignmentsTable = pgTable("course_assignments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id").notNull(),
  partnerId: text("partner_id").notNull(),
  assignedBy: text("assigned_by"),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
});

export type LearningContent = typeof learningContentTable.$inferSelect;
export type CourseTemplate = typeof courseTemplatesTable.$inferSelect;
export type CourseAssignment = typeof courseAssignmentsTable.$inferSelect;
