import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const submissionStatusEnum = pgEnum("submission_status", [
  "submitted",
  "reviewed",
  "approved",
]);

export const submissionsTable = pgTable("submissions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  moduleId: text("module_id").notNull(),
  moduleTitle: text("module_title").notNull().default(""),
  title: text("title").notNull(),
  contentText: text("content_text"),
  status: submissionStatusEnum("submission_status").notNull().default("submitted"),
  coachFeedback: text("coach_feedback"),
  coachId: text("coach_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const insertSubmissionSchema = createInsertSchema(submissionsTable).omit({
  id: true,
  status: true,
  coachFeedback: true,
  coachId: true,
  createdAt: true,
  reviewedAt: true,
});

export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type Submission = typeof submissionsTable.$inferSelect;
