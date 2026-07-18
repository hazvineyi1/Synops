import { pgTable, text, timestamp, integer, numeric, pgEnum } from "drizzle-orm/pg-core";

/**
 * Blended-delivery tracking (decision doc §10.3).
 *
 * Enza and providers like it run in-person cohorts, virtual sessions, 1:1 mentoring and
 * workshops alongside the online modules. Attendance and coaching-hour logging must live
 * in the platform (not a bolted-on calendar), because logged coaching hours are central
 * to how impact is measured and reported to funders. These two tables are that store; the
 * funder report's coaching-hour totals aggregate from attendance_records.
 */

export const deliverySessionTypeEnum = pgEnum("delivery_session_type", [
  "in_person",
  "virtual",
  "mentoring",
  "workshop",
]);

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "absent",
  "excused",
  "late",
]);

export const deliverySessionsTable = pgTable("delivery_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Owning organisation — scopes who may manage the session (mirrors courses.tenant_id).
  tenantId: text("tenant_id").notNull(),
  // Optional link to a course/program; null for a standalone session (e.g. a workshop).
  courseId: text("course_id"),
  // Optional link to a specific module, so a live/hybrid module can surface its own
  // workshop in the learner's module view. Null = a course-wide or standalone session.
  // Kept nullable on purpose: most sessions are cohort-level, not module-level.
  moduleId: text("module_id"),
  facilitatorId: text("facilitator_id"),
  title: text("title").notNull(),
  sessionType: deliverySessionTypeEnum("session_type").notNull().default("in_person"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  location: text("location"),
  // Joining link for a virtual session. Distinct from `location`, which is free text for
  // a physical venue -- a learner needs to know which one they are looking at.
  joinUrl: text("join_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type DeliverySession = typeof deliverySessionsTable.$inferSelect;

export const attendanceRecordsTable = pgTable("attendance_records", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id").notNull(),
  userId: text("user_id").notNull(),
  status: attendanceStatusEnum("status").notNull().default("present"),
  // Coaching hours credited to this learner for this session (esp. 1:1 mentoring).
  coachingHours: numeric("coaching_hours"),
  recordedBy: text("recorded_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AttendanceRecord = typeof attendanceRecordsTable.$inferSelect;
