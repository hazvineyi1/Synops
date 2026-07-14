import { pgTable, text, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const enrolmentStatusEnum = pgEnum("enrolment_status", [
  "active",
  "completed",
  "withdrawn",
  "waitlisted",
]);

export const enrolmentsTable = pgTable("enrolments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  courseId: text("course_id").notNull(),
  status: enrolmentStatusEnum("enrolment_status").notNull().default("active"),
  role: text("role", { enum: ["student", "ta", "observer"] }).notNull().default("student"),
  finalGrade: numeric("final_grade", { precision: 5, scale: 2 }),
  finalLetterGrade: text("final_letter_grade"),
  enrolledAt: timestamp("enrolled_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertEnrolmentSchema = createInsertSchema(enrolmentsTable).omit({
  id: true,
  enrolledAt: true,
});

export type InsertEnrolment = z.infer<typeof insertEnrolmentSchema>;
export type Enrolment = typeof enrolmentsTable.$inferSelect;
