import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Organisation classes (cohorts). A real, persistent cohort inside an organisation that groups
 * learners + courses + staff. Replaces the client-side orgClassStore. Assigning learners+courses to
 * a class can create real enrolments (see the enrol endpoint), so a class is a genuine delivery unit
 * rather than an in-memory mock.
 */
export const orgClassesTable = pgTable("org_classes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull(),
  partnerId: text("partner_id"),
  name: text("name").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const orgClassLearnersTable = pgTable("org_class_learners", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  classId: text("class_id").notNull(),
  learnerId: text("learner_id").notNull(),
});

export const orgClassCoursesTable = pgTable("org_class_courses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  classId: text("class_id").notNull(),
  courseId: text("course_id").notNull(),
});

export const orgClassStaffTable = pgTable("org_class_staff", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  classId: text("class_id").notNull(),
  staffId: text("staff_id").notNull(),
  role: text("role").notNull().default("facilitator"),
});

export type OrgClass = typeof orgClassesTable.$inferSelect;
