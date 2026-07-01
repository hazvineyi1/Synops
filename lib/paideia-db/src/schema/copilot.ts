import {
  pgTable,
  text,
  serial,
  timestamp,
  jsonb,
  integer,
  uuid,
  index,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const teachersTable = pgTable("copilot_teachers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  region: text("region").notNull(),
  country: text("country"),
  schoolName: text("school_name"),
  subjects: jsonb("subjects").$type<string[]>().notNull().default([]),
  yearGroups: jsonb("year_groups").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("active"),
  onboardedAt: timestamp("onboarded_at"),
  approvedAt: timestamp("approved_at"),
  approvedBy: uuid("approved_by"),
  subscriptionStatus: text("subscription_status").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const FREE_MONTHLY_GENERATIONS = 10;

export const passwordResetsTable = pgTable("copilot_password_resets", {
  id: uuid("id").primaryKey().defaultRandom(),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => teachersTable.id, { onDelete: "cascade" }),
  token: text("token").unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  issuedByAdminId: uuid("issued_by_admin_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  teacherIdx: index("copilot_password_resets_teacher_idx").on(t.teacherId),
}));

export const sessionsTable = pgTable("copilot_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").unique().notNull(),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => teachersTable.id, { onDelete: "cascade" }),
  impersonatedTeacherId: uuid("impersonated_teacher_id").references(() => teachersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lessonPlansTable = pgTable("copilot_lesson_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => teachersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  region: text("region").notNull(),
  subject: text("subject").notNull(),
  yearGroup: text("year_group").notNull(),
  topic: text("topic").notNull(),
  priorKnowledge: text("prior_knowledge"),
  durationMinutes: integer("duration_minutes").default(50).notNull(),
  groupContext: text("group_context"),
  content: jsonb("content").$type<unknown>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const worksheetsTable = pgTable("copilot_worksheets", {
  id: uuid("id").primaryKey().defaultRandom(),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => teachersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  region: text("region").notNull(),
  subject: text("subject").notNull(),
  yearGroup: text("year_group").notNull(),
  topic: text("topic").notNull(),
  difficulty: text("difficulty").notNull(),
  questionCount: integer("question_count").notNull(),
  content: jsonb("content").$type<unknown>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const parentDraftsTable = pgTable("copilot_parent_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => teachersTable.id, { onDelete: "cascade" }),
  studentName: text("student_name").notNull(),
  region: text("region").notNull(),
  yearGroup: text("year_group"),
  tone: text("tone").notNull(),
  keyPoints: text("key_points").notNull(),
  content: jsonb("content").$type<unknown>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const quizzesTable = pgTable("copilot_quizzes", {
  id: uuid("id").primaryKey().defaultRandom(),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => teachersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  region: text("region").notNull(),
  subject: text("subject").notNull(),
  yearGroup: text("year_group").notNull(),
  topic: text("topic").notNull(),
  format: text("format").notNull(),
  questionCount: integer("question_count").notNull(),
  content: jsonb("content").$type<unknown>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const samplesTable = pgTable("copilot_samples", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  region: text("region").notNull(),
  subject: text("subject").notNull(),
  yearGroup: text("year_group").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  content: jsonb("content").$type<unknown>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const classesTable = pgTable("copilot_classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => teachersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subject: text("subject"),
  yearGroup: text("year_group").notNull(),
  region: text("region").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  teacherIdx: index("copilot_classes_teacher_idx").on(t.teacherId),
}));

export const studentsTable = pgTable("copilot_students", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id")
    .notNull()
    .references(() => classesTable.id, { onDelete: "cascade" }),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => teachersTable.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastInitial: text("last_initial").notNull(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  joinCode: text("join_code").unique().notNull(),
  learningStyle: jsonb("learning_style").$type<{
    schemaVersion: 1;
    processingStyle: "sequential" | "conceptual" | "mixed";
    pace: "quick" | "deliberate" | "moderate";
    strengthByQuestionType: { recall: number; comprehension: number; application: number };
    confidencePattern: "improving" | "fatiguing" | "consistent";
    inferenceConfidence: "low" | "developing" | "moderate" | "strong";
    sampleSize: number;
  }>(),
  diagnosticTakenAt: timestamp("diagnostic_taken_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  classIdx: index("copilot_students_class_idx").on(t.classId),
  teacherIdx: index("copilot_students_teacher_idx").on(t.teacherId),
}));

export const studentSessionsTable = pgTable("copilot_student_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").unique().notNull(),
  studentId: uuid("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "cascade" }),
  impersonatedStudentId: uuid("impersonated_student_id").references(() => studentsTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const assignmentsTable = pgTable("copilot_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => teachersTable.id, { onDelete: "cascade" }),
  classId: uuid("class_id")
    .notNull()
    .references(() => classesTable.id, { onDelete: "cascade" }),
  resourceKind: text("resource_kind").notNull(),
  worksheetId: uuid("worksheet_id").references(() => worksheetsTable.id, { onDelete: "cascade" }),
  quizId: uuid("quiz_id").references(() => quizzesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  deliveryMode: text("delivery_mode").notNull(),
  shareCode: text("share_code").unique().notNull(),
  closed: boolean("closed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  teacherIdx: index("copilot_assignments_teacher_idx").on(t.teacherId),
  classIdx: index("copilot_assignments_class_idx").on(t.classId),
}));

export const submissionsTable = pgTable("copilot_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id")
    .notNull()
    .references(() => assignmentsTable.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").references(() => studentsTable.id, { onDelete: "set null" }),
  displayName: text("display_name").notNull(),
  answers: jsonb("answers").$type<Record<string, string>>().notNull(),
  autoScore: integer("auto_score").notNull(),
  maxAutoScore: integer("max_auto_score").notNull(),
  needsReviewCount: integer("needs_review_count").notNull().default(0),
  feedback: jsonb("feedback").$type<unknown>(),
  gradingStatus: text("grading_status").notNull().default("pending"),
  gradedAt: timestamp("graded_at"),
  aiSummary: jsonb("ai_summary").$type<{
    overall: string;
    strengths: string[];
    gaps: string[];
    recommendations: string[];
  } | null>(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
}, (t) => ({
  assignIdx: index("copilot_submissions_assignment_idx").on(t.assignmentId),
  gradingIdx: index("copilot_submissions_grading_idx").on(t.gradingStatus),
  studentIdx: index("copilot_submissions_student_idx").on(t.studentId),
  oneSubmissionPerStudent: uniqueIndex("copilot_submissions_unique_per_student")
    .on(t.assignmentId, t.studentId)
    .where(sql`${t.studentId} IS NOT NULL`),
}));

export const pilotRequestsTable = pgTable("copilot_pilot_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  schoolName: text("school_name"),
  country: text("country"),
  gradeLevels: text("grade_levels"),
  organization: text("organization"),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  message: text("message"),
  status: text("status").notNull().default("new"),
  notes: text("notes"),
  contactedAt: timestamp("contacted_at"),
  sourcePath: text("source_path"),
  sourceReferrer: text("source_referrer"),
  sourceUtm: jsonb("source_utm").$type<Record<string, string>>(),
  anonymousId: text("anonymous_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  createdIdx: index("copilot_pilot_requests_created_idx").on(t.createdAt),
  statusIdx: index("copilot_pilot_requests_status_idx").on(t.status),
}));

export const analyticsEventsTable = pgTable("copilot_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  teacherId: uuid("teacher_id").references(() => teachersTable.id, { onDelete: "set null" }),
  studentId: uuid("student_id").references(() => studentsTable.id, { onDelete: "set null" }),
  anonymousId: text("anonymous_id"),
  sessionId: text("session_id"),
  surface: text("surface").notNull(),
  eventName: text("event_name").notNull(),
  path: text("path"),
  referrer: text("referrer"),
  props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
  userAgent: text("user_agent"),
  ipHash: text("ip_hash"),
}, (t) => ({
  occurredIdx: index("copilot_events_occurred_idx").on(t.occurredAt),
  teacherIdx: index("copilot_events_teacher_idx").on(t.teacherId),
  nameIdx: index("copilot_events_name_idx").on(t.eventName),
  anonIdx: index("copilot_events_anon_idx").on(t.anonymousId),
  sessionIdx: index("copilot_events_session_idx").on(t.sessionId),
  nameSurfaceTimeIdx: index("copilot_events_name_surface_time_idx").on(
    t.eventName,
    t.surface,
    t.occurredAt,
  ),
}));

export const aiUsageTable = pgTable("copilot_ai_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  teacherId: uuid("teacher_id").references(() => teachersTable.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  costMicrosUsd: integer("cost_micros_usd").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  success: boolean("success").notNull().default(true),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  teacherIdx: index("copilot_ai_usage_teacher_idx").on(t.teacherId),
  createdIdx: index("copilot_ai_usage_created_idx").on(t.createdAt),
  kindIdx: index("copilot_ai_usage_kind_idx").on(t.kind),
}));

export const classProfilesTable = pgTable("copilot_class_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  teacherId: uuid("teacher_id").notNull().references(() => teachersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  yearGroup: text("year_group").notNull(),
  syllabus: text("syllabus"),
  languageLevel: text("language_level"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  teacherIdx: index("copilot_class_profiles_teacher_idx").on(t.teacherId),
}));

export const resourceSharesTable = pgTable("copilot_resource_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  resourceType: text("resource_type").notNull(),
  resourceId: uuid("resource_id").notNull(),
  fromTeacherId: uuid("from_teacher_id").notNull().references(() => teachersTable.id, { onDelete: "cascade" }),
  toEmail: text("to_email").notNull(),
  toTeacherId: uuid("to_teacher_id").references(() => teachersTable.id, { onDelete: "set null" }),
  copiedResourceId: uuid("copied_resource_id"),
  message: text("message"),
  sharedAt: timestamp("shared_at").defaultNow().notNull(),
  viewedAt: timestamp("viewed_at"),
}, (t) => ({
  toEmailIdx: index("copilot_resource_shares_to_email_idx").on(t.toEmail),
  fromIdx: index("copilot_resource_shares_from_idx").on(t.fromTeacherId),
}));

export type PilotRequest = typeof pilotRequestsTable.$inferSelect;
export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;
export type AiUsage = typeof aiUsageTable.$inferSelect;

export type Teacher = typeof teachersTable.$inferSelect;
export type InsertTeacher = typeof teachersTable.$inferInsert;
export type LessonPlan = typeof lessonPlansTable.$inferSelect;
export type Worksheet = typeof worksheetsTable.$inferSelect;
export type ParentDraft = typeof parentDraftsTable.$inferSelect;
export type Quiz = typeof quizzesTable.$inferSelect;
export type Sample = typeof samplesTable.$inferSelect;
export type ClassRow = typeof classesTable.$inferSelect;
export type Student = typeof studentsTable.$inferSelect;
export type Assignment = typeof assignmentsTable.$inferSelect;
export type Submission = typeof submissionsTable.$inferSelect;
export type ClassProfile = typeof classProfilesTable.$inferSelect;
export type ResourceShare = typeof resourceSharesTable.$inferSelect;

export const paidPlanWaitlistTable = pgTable("copilot_paid_plan_waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  teacherId: uuid("teacher_id").notNull().references(() => teachersTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  fulfilledAt: timestamp("fulfilled_at"),
}, (t) => ({
  teacherUniq: uniqueIndex("copilot_paid_plan_waitlist_teacher_uniq").on(t.teacherId),
  createdIdx: index("copilot_paid_plan_waitlist_created_idx").on(t.createdAt),
}));

export type PaidPlanWaitlistEntry = typeof paidPlanWaitlistTable.$inferSelect;

export const tutorConversationsTable = pgTable("copilot_tutor_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "cascade" }),
  classId: uuid("class_id")
    .notNull()
    .references(() => classesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  socraticMode: boolean("socratic_mode").notNull().default(false),
  scope: text("scope").notNull().default("all_material"),
  scopeRefId: text("scope_ref_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  studentIdx: index("copilot_tutor_conversations_student_idx").on(t.studentId),
  classIdx: index("copilot_tutor_conversations_class_idx").on(t.classId),
}));

export const tutorMessagesTable = pgTable("copilot_tutor_messages", {
  id: serial("id").primaryKey(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => tutorConversationsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  citations: jsonb("citations").$type<Array<{ type: "concept" | "source"; title: string; url?: string }>>(),
  usedPersonalization: boolean("used_personalization").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  conversationIdx: index("copilot_tutor_messages_conversation_idx").on(t.conversationId),
}));

export type TutorConversation = typeof tutorConversationsTable.$inferSelect;
export type TutorMessage = typeof tutorMessagesTable.$inferSelect;
