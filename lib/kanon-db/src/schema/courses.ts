import { pgTable, text, serial, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const coursesTable = pgTable("courses", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  title: text("title").notNull(),
  creditHours: integer("credit_hours"),
  termWeeks: integer("term_weeks"),
  moduleCount: integer("module_count"),
  modality: text("modality"),
  accreditors: text("accreditors"),
  seatTimeHours: real("seat_time_hours"),
  courseDescription: text("course_description"),
  instructorName: text("instructor_name"),
  instructorEmail: text("instructor_email"),
  instructorTitle: text("instructor_title"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCourseSchema = createInsertSchema(coursesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof coursesTable.$inferSelect;
