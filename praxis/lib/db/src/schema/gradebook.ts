import { pgTable, text, timestamp, numeric, integer, boolean, jsonb, unique } from "drizzle-orm/pg-core";

/**
 * Unified gradebook — the layer that pulls every graded thing in a course into one place.
 *
 * Praxis already had a course-assignment gradebook (`gradebook_entries` in assignments.ts).
 * That only ever covered `assignments`. This adds a thin, source-agnostic REGISTRY so that
 * cases (case_sessions), interactive activities (activity_submissions) and hand-entered
 * ("manual") items can also appear as gradebook columns — categorised, tagged formative or
 * summative, and rolled into a single mastery percentage per learner.
 *
 * Design:
 *  - `gradebook_items`  = the column definitions for a course (one row per graded thing that
 *                         has been "included in the gradebook"). Assignments are included by
 *                         default without a row; a row can OVERRIDE an assignment's category /
 *                         type / weight, or EXCLUDE it. Cases / activities / manual columns
 *                         exist ONLY as rows here.
 *  - `gradebook_cells`  = per-(item, learner) overlay. Holds the manual score for a manual
 *                         item, and holds a per-cell feedback note for ANY item. Scores for
 *                         source-backed items are read from their native tables at request
 *                         time (assignment_submissions / case_sessions / activity_submissions)
 *                         so the gradebook never goes stale.
 *  - `gradebook_alerts` = the off-track state machine per (course, learner): a multi-signal
 *                         evaluation (mastery low, trend down, missing overdue summative) that
 *                         drives in-app alerts and the auto-generated adaptive study plan.
 *
 * No table uses real FK constraints (matches the rest of this schema — ids are joined in app).
 */

/** A gradebook column. `source_type` says where its per-learner scores come from. */
export const gradebookItemsTable = pgTable(
  "gradebook_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    courseId: text("course_id").notNull(),
    /** Where scores are read from. "manual" = entered by hand into gradebook_cells. */
    // NOTE: a text column with a TS-only enum, not a pgEnum, so adding a value needs no
    // migration. "attendance" points at a delivery_sessions row.
    sourceType: text("source_type", { enum: ["assignment", "case", "activity", "manual", "attendance"] }).notNull(),
    /** The assignment / case / activity id. null for manual columns. */
    sourceId: text("source_id"),
    title: text("title").notNull(),
    /** Learning target / standard / group heading the column is filed under. */
    category: text("category").notNull().default("General"),
    /** Formative practice (excluded from the grade by default) vs summative (counts). */
    itemType: text("item_type", { enum: ["formative", "summative"] }).notNull().default("summative"),
    /**
     * How the score is expressed. "points" = X/Y, "pass_fail" = Pass/Fail at a threshold,
     * "completion" = shown as a %. TS-only enum on a text column so values need no migration.
     */
    gradeType: text("grade_type", { enum: ["points", "pass_fail", "completion"] }).notNull().default("points"),
    pointsPossible: numeric("points_possible", { precision: 7, scale: 2 }).notNull().default("100"),
    dueDate: timestamp("due_date"),
    /** If false the column is shown for reference but never counts toward mastery. */
    includeInGrade: boolean("include_in_grade").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    // One inclusion per (course, source). Manual rows have null source_id → treated distinct
    // by Postgres, so a course can hold many manual columns. Source-backed rows are unique.
    courseSourceUnique: unique().on(t.courseId, t.sourceType, t.sourceId),
  }),
);

export type GradebookItem = typeof gradebookItemsTable.$inferSelect;

/** Per-(item, learner) overlay: manual score and/or a feedback note. */
export const gradebookCellsTable = pgTable(
  "gradebook_cells",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    itemId: text("item_id").notNull(),
    userId: text("user_id").notNull(),
    /** The score for a MANUAL item (0..points_possible). null for source-backed items. */
    manualScore: numeric("manual_score", { precision: 7, scale: 2 }),
    /** Instructor feedback attached to this specific cell (any item type). */
    note: text("note"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    itemUserUnique: unique().on(t.itemId, t.userId),
  }),
);

export type GradebookCell = typeof gradebookCellsTable.$inferSelect;

/** AI-generated coaching guidance for an at-risk learner (cached on the alert). */
export interface CoachAssist {
  summary: string;
  talkingPoints: string[];
  sessionFocus: string;
  suggestedMessage: string;
}

/**
 * Off-track state per (course, learner). Recomputed whenever a score changes and on demand.
 * `status` transitions on_track -> at_risk -> off_track drive in-app notifications (we only
 * notify on a NEW off_track transition, tracked via notified_at, to avoid alert spam).
 */
export const gradebookAlertsTable = pgTable(
  "gradebook_alerts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    courseId: text("course_id").notNull(),
    userId: text("user_id").notNull(),
    status: text("status", { enum: ["on_track", "at_risk", "off_track"] }).notNull().default("on_track"),
    /** Which signals fired: "mastery_low" | "trend_down" | "missing_summative". */
    reasons: text("reasons").array().notNull().default([]),
    masteryPct: numeric("mastery_pct", { precision: 5, scale: 2 }),
    /** coach_plans.id of the most recent auto-generated remediation plan, if any. */
    planId: text("plan_id"),
    /** Last time an off_track in-app alert was sent to the learner/staff. */
    notifiedAt: timestamp("notified_at"),
    /** Coach's private working note on this intervention. */
    coachNote: text("coach_note"),
    /** Cached AI coaching talking points (see CoachAssist). */
    coachAssist: jsonb("coach_assist").$type<CoachAssist>(),
    coachAssistAt: timestamp("coach_assist_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => ({
    courseUserUnique: unique().on(t.courseId, t.userId),
  }),
);

export type GradebookAlert = typeof gradebookAlertsTable.$inferSelect;

export interface LetterBand { label: string; min: number }

/**
 * Per-course grading configuration: category + type weighting, and letter-grade bands.
 * Absent row => defaults (points-based, no letters). weighting is hierarchical: a category's
 * average is points-based within the category; categories are weighted by category_weights
 * inside each type bucket; the two buckets blend by summative_weight / formative_weight.
 */
export const gradebookSettingsTable = pgTable(
  "gradebook_settings",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    courseId: text("course_id").notNull(),
    weightingEnabled: boolean("weighting_enabled").notNull().default(false),
    summativeWeight: integer("summative_weight").notNull().default(100),
    formativeWeight: integer("formative_weight").notNull().default(0),
    categoryWeights: jsonb("category_weights").$type<Record<string, number>>().notNull().default({}),
    lettersEnabled: boolean("letters_enabled").notNull().default(false),
    letterBands: jsonb("letter_bands").$type<LetterBand[]>().notNull().default([]),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({ courseUnique: unique().on(t.courseId) }),
);

export type GradebookSettingsRow = typeof gradebookSettingsTable.$inferSelect;

/** Two-way coach <-> learner conversation attached to an intervention (gradebook alert). */
export const coachMessagesTable = pgTable("coach_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  alertId: text("alert_id").notNull(),
  fromUserId: text("from_user_id").notNull(),
  fromRole: text("from_role", { enum: ["coach", "learner"] }).notNull().default("coach"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CoachMessage = typeof coachMessagesTable.$inferSelect;

/** Shape stored in coach_plans.items for gradebook-generated adaptive study plans. */
export interface StudyPlanItem {
  kind: "case" | "activity" | "review";
  refType: "case" | "activity" | "module" | null;
  refId: string | null;
  title: string;
  why: string;
  category: string | null;
  done: boolean;
}
