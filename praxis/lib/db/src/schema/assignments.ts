import { pgTable, text, timestamp, integer, numeric, boolean, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assignmentTypeEnum = pgEnum("assignment_type", [
  "essay",
  "quiz",
  "file_upload",
  "discussion",
  "peer_review",
  "url_entry",
  "media_recording",
  "external_tool",
]);

export const assignmentSubmissionStatusEnum = pgEnum("assignment_submission_status", [
  "not_submitted",
  "submitted",
  "late",
  "graded",
  "resubmission_requested",
  "excused",
]);

/** Shared with cases: one criterion, its weight, and the levels a marker chooses between. */
export type AssignmentRubricLevel = { label: string; points: number; description: string };
export type AssignmentRubricCriterion = {
  name: string;
  maxPoints: number;
  levels: AssignmentRubricLevel[];
};
/** One criterion's outcome for a single submission. */
export type AssignmentCriterionScore = {
  criterion: string;
  points: number;
  maxPoints: number;
  note: string;
};

export const rubricsTable = pgTable("rubrics", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id").notNull(),
  title: text("title").notNull(),
  // Was untyped jsonb, so nothing could rely on its shape. Typed now that the grader reads it.
  criteria: jsonb("criteria").$type<AssignmentRubricCriterion[]>().notNull().default([]),
  totalPoints: integer("total_points").notNull().default(100),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Rubric = typeof rubricsTable.$inferSelect;

export const assignmentsTable = pgTable("assignments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id").notNull(),
  moduleId: text("module_id"),
  title: text("title").notNull(),
  description: text("description"),
  instructions: text("instructions"),
  submissionType: assignmentTypeEnum("assignment_type").notNull().default("essay"),
  dueDate: timestamp("due_date"),
  availableFrom: timestamp("available_from"),
  availableUntil: timestamp("available_until"),
  pointsPossible: numeric("points_possible", { precision: 7, scale: 2 }).notNull().default("100"),
  allowLateSubmissions: boolean("allow_late_submissions").notNull().default(true),
  latePenaltyPercent: integer("late_penalty_percent").notNull().default(0),
  rubricId: text("rubric_id"),
  groupAssignment: boolean("group_assignment").notNull().default(false),
  peerReviewRequired: boolean("peer_review_required").notNull().default(false),
  peerReviewCount: integer("peer_review_count").notNull().default(0),
  published: boolean("published").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Assignment = typeof assignmentsTable.$inferSelect;

export const assignmentSubmissionsTable = pgTable("assignment_submissions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  assignmentId: text("assignment_id").notNull(),
  userId: text("user_id").notNull(),
  groupId: text("group_id"),
  body: text("body"),
  fileUrls: text("file_urls").array().notNull().default([]),
  url: text("url"),
  mediaUrl: text("media_url"),
  status: assignmentSubmissionStatusEnum("assignment_submission_status").notNull().default("not_submitted"),
  score: numeric("score", { precision: 7, scale: 2 }),
  letterGrade: text("letter_grade"),
  feedback: text("feedback"),
  gradedBy: text("graded_by"),
  gradedAt: timestamp("graded_at"),
  rubricAssessment: jsonb("rubric_assessment").$type<AssignmentCriterionScore[]>(),

  // ── Uploaded work ────────────────────────────────────────────────────────
  // There is no object storage in this stack, so an uploaded file is parsed to text at
  // submit time and only the text is kept. sourceFilename records what it came from, and
  // keeping parsedText separate from `body` preserves the distinction between what the
  // learner typed and what came out of their document.
  parsedText: text("parsed_text"),
  sourceFilename: text("source_filename"),

  // ── AI-drafted assessment ────────────────────────────────────────────────
  // PROVISIONAL, never authoritative. Grading fires onGradeEvent, which recomputes
  // off-track status, generates study plans and emails staff and the learner -- so an AI
  // score landing directly in the gradebook could flag someone off-track and email them
  // about it on the strength of a model's opinion. The draft is written here, shown to the
  // learner as feedback, and becomes a real grade only when staff confirm it.
  aiScore: numeric("ai_score", { precision: 7, scale: 2 }),
  aiFeedback: text("ai_feedback"),
  aiRubricAssessment: jsonb("ai_rubric_assessment").$type<AssignmentCriterionScore[]>(),
  aiGradedAt: timestamp("ai_graded_at"),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AssignmentSubmission = typeof assignmentSubmissionsTable.$inferSelect;

export const gradebookEntriesTable = pgTable("gradebook_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  courseId: text("course_id").notNull(),
  assignmentId: text("assignment_id").notNull(),
  score: numeric("score", { precision: 7, scale: 2 }),
  possibleScore: numeric("possible_score", { precision: 7, scale: 2 }).notNull(),
  letterGrade: text("letter_grade"),
  excused: boolean("excused").notNull().default(false),
  missing: boolean("missing").notNull().default(false),
  late: boolean("late").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type GradebookEntry = typeof gradebookEntriesTable.$inferSelect;
