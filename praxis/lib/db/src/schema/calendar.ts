import { pgTable, text, timestamp, boolean, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const eventTypeEnum = pgEnum("event_type", [
  "assignment",
  "quiz",
  "discussion",
  "class_session",
  "deadline",
  "holiday",
  "other",
]);

export const courseEventsTable = pgTable("course_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id"),
  userId: text("user_id"),
  title: text("title").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  allDay: boolean("all_day").notNull().default(false),
  type: eventTypeEnum("event_type").notNull().default("other"),
  linkedAssignmentId: text("linked_assignment_id"),
  color: text("color"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCourseEventSchema = createInsertSchema(courseEventsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertCourseEvent = z.infer<typeof insertCourseEventSchema>;
export type CourseEvent = typeof courseEventsTable.$inferSelect;

export const coursePagesTable = pgTable("course_pages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id").notNull(),
  authorId: text("author_id").notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  body: text("body").notNull().default(""),
  published: boolean("published").notNull().default(false),
  position: integer("position").notNull().default(0),
  frontPage: boolean("front_page").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCoursePageSchema = createInsertSchema(coursePagesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCoursePage = z.infer<typeof insertCoursePageSchema>;
export type CoursePage = typeof coursePagesTable.$inferSelect;
