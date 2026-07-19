import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Which partners a (platform-owned) course is assigned to. Courses belong to the super admin
 * (tenantId "platform") and are assigned OUT to partners from the console; a partner's people then
 * see and deliver the courses assigned to their partner. Distinct from the Learning Hub's
 * course_assignments (which keys on template ids), this keys on real course ids.
 */
export const coursePartnerAssignmentsTable = pgTable("course_partner_assignments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id").notNull(),
  partnerId: text("partner_id").notNull(),
  assignedBy: text("assigned_by"),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
});

export type CoursePartnerAssignment = typeof coursePartnerAssignmentsTable.$inferSelect;
