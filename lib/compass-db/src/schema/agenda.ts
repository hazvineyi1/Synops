import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Project meetings: the per-project Agenda workspace. Each row is one logged
 * meeting with a date/time (`scheduledAt`), free-text `notes`, and a persisted
 * `generatedAgenda` JSON blob for the NEXT meeting (built from the next meeting
 * type's standing template plus carried-forward open items, either by the
 * built-in AI or the deterministic rules fallback). `aiProvider` records which
 * path produced the last processing ("openai" | "rules" | null when notes have
 * not been processed yet).
 *
 * Each meeting is one of three types (`meetingType`: "kickoff" | "working" |
 * "final"); a working session may carry an optional `focus` label. `status`
 * ("scheduled" | "in_progress" | "completed") is a workflow signal only and never
 * an authorization boundary. `agendaPlan` is a JSON blob seeded at creation from
 * the chosen type's template and holds the meeting's own pre-work checklist,
 * standing-agenda checklist, and exit-criteria ("Definition of Done") checklist;
 * it is the current meeting's workspace (distinct from `generatedAgenda`, which is
 * the proposal for the NEXT meeting). Project-scoped: tenancy is resolved through
 * the owning project's client organization (see tenancy.ts).
 */
export const projectMeetingsTable = pgTable("project_meetings", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  title: text("title").notNull(),
  meetingType: text("meeting_type").notNull().default("working"),
  focus: text("focus"),
  status: text("status").notNull().default("scheduled"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  notes: text("notes").notNull().default(""),
  agendaPlan: text("agenda_plan").notNull().default("{}"),
  nextMeetingAt: timestamp("next_meeting_at", { withTimezone: true }),
  generatedAgenda: text("generated_agenda").notNull().default("{}"),
  aiProvider: text("ai_provider"),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ProjectMeetingRow = typeof projectMeetingsTable.$inferSelect;

/**
 * Action items tracked off the back of a meeting's notes. `sourceMeetingId` is the
 * meeting whose notes produced the item (nullable so an item can be added by hand).
 * `status` is "open" | "done"; `category` is "general" | "content" | "review" |
 * "accessibility" and drives the accessibility-progress and build-progress signals.
 * `weekIndex` (nullable, zero-based) maps an item to a course week for the weekly
 * build-progress bars. Completing items advances DERIVED progress only; it never
 * mutates the deliberate project stage gates. Project-scoped (see tenancy.ts).
 */
export const meetingActionItemsTable = pgTable("meeting_action_items", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  sourceMeetingId: integer("source_meeting_id"),
  sourceCorrespondenceId: integer("source_correspondence_id"),
  title: text("title").notNull(),
  description: text("description"),
  ownerName: text("owner_name"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  status: text("status").notNull().default("open"),
  category: text("category").notNull().default("general"),
  weekIndex: integer("week_index"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MeetingActionItemRow = typeof meetingActionItemsTable.$inferSelect;

/**
 * Project correspondence: the per-project repository of email/message threads
 * logged by hand (manual paste/upload now; email-account sync deferred). Each row
 * is one piece of correspondence with a `direction` ("inbound" | "outbound"), a
 * counterparty `party` (name/address, nullable), a `subject`, free-text `body`,
 * and an `occurredAt` (when it happened, nullable). Actionable follow-ups are
 * promoted into `meeting_action_items` via `sourceCorrespondenceId`, so they flow
 * into the same agenda summary as meeting-derived items. Project-scoped: tenancy
 * resolves through the owning project's client organization (see tenancy.ts).
 */
export const projectCorrespondenceTable = pgTable("project_correspondence", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  direction: text("direction").notNull().default("inbound"),
  subject: text("subject").notNull(),
  party: text("party"),
  body: text("body").notNull().default(""),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ProjectCorrespondenceRow = typeof projectCorrespondenceTable.$inferSelect;

/**
 * Meeting decisions: one live-capture stream of decisions reached during a
 * meeting. `meetingId` is the meeting where the decision was recorded (nullable so
 * a decision can be logged by hand outside the per-meeting workspace). `decidedBy`
 * is an optional free-text attribution. Decisions form a per-project repository and
 * are NOT carried forward into the next agenda (they are settled). Project-scoped:
 * tenancy resolves through the owning project's client organization (see
 * tenancy.ts).
 */
export const meetingDecisionsTable = pgTable("meeting_decisions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  meetingId: integer("meeting_id"),
  text: text("text").notNull(),
  decidedBy: text("decided_by"),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MeetingDecisionRow = typeof meetingDecisionsTable.$inferSelect;

/**
 * Meeting open questions: one live-capture stream of unresolved questions raised
 * during a meeting. `meetingId` is the meeting where the question was raised
 * (nullable so a question can be logged by hand). `status` is "open" | "resolved";
 * resolving stamps `resolvedAt`. UNRESOLVED questions carry forward into the next
 * meeting's generated agenda. Project-scoped: tenancy resolves through the owning
 * project's client organization (see tenancy.ts).
 */
export const meetingOpenQuestionsTable = pgTable("meeting_open_questions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  meetingId: integer("meeting_id"),
  text: text("text").notNull(),
  status: text("status").notNull().default("open"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MeetingOpenQuestionRow = typeof meetingOpenQuestionsTable.$inferSelect;
