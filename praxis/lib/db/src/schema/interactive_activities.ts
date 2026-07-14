import { pgTable, text, timestamp, numeric, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Interactive HTML activities.
 *
 * An activity is author-supplied HTML (with optional CSS/JS) that a learner completes
 * in a SANDBOXED iframe. The activity reports a result back via postMessage; the parent
 * page -- the only thing holding the session cookie -- persists it as a submission that
 * a coach can review. Modelled on interactive_video (definition table + response table),
 * plus the submissions review flow.
 *
 * SECURITY NOTE for anyone extending this: the HTML is untrusted author content. It is
 * rendered with sandbox="allow-scripts" and WITHOUT allow-same-origin, so it runs in an
 * opaque origin and can never read the parent's cookies or DOM. Do not add
 * allow-same-origin to that iframe.
 */

export const activitySubmissionStatusEnum = pgEnum("activity_submission_status", [
  "submitted",
  "reviewed",
  "approved",
]);

export const interactiveActivitiesTable = pgTable("interactive_activities", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Optional links so an activity can live inside a module/course or stand alone.
  courseId: text("course_id"),
  moduleId: text("module_id"),
  title: text("title").notNull(),
  instructions: text("instructions"),
  // The author-supplied HTML document body. Rendered inside a sandboxed iframe.
  html: text("html").notNull().default(""),
  // Points the activity is worth; the reported result may include a raw score.
  maxScore: numeric("max_score", { precision: 7, scale: 2 }).notNull().default("100"),
  published: boolean("published").notNull().default(false),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInteractiveActivitySchema = createInsertSchema(interactiveActivitiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInteractiveActivity = z.infer<typeof insertInteractiveActivitySchema>;
export type InteractiveActivity = typeof interactiveActivitiesTable.$inferSelect;

export const activitySubmissionsTable = pgTable("activity_submissions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  activityId: text("activity_id").notNull(),
  userId: text("user_id").notNull(),
  // Whatever the activity chose to report: answers, state, a self-reported score, etc.
  payload: jsonb("payload").notNull().default({}),
  // Optional numeric score the activity reported (0..maxScore). Coach can override.
  score: numeric("score", { precision: 7, scale: 2 }),
  status: activitySubmissionStatusEnum("status").notNull().default("submitted"),
  feedback: text("feedback"),
  reviewedBy: text("reviewed_by"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const insertActivitySubmissionSchema = createInsertSchema(activitySubmissionsTable).omit({
  id: true,
  status: true,
  feedback: true,
  reviewedBy: true,
  submittedAt: true,
  reviewedAt: true,
});
export type InsertActivitySubmission = z.infer<typeof insertActivitySubmissionSchema>;
export type ActivitySubmission = typeof activitySubmissionsTable.$inferSelect;
