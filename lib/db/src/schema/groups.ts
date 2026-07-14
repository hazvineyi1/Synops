import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const courseGroupsTable = pgTable("course_groups", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  maxMembers: integer("max_members"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCourseGroupSchema = createInsertSchema(courseGroupsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertCourseGroup = z.infer<typeof insertCourseGroupSchema>;
export type CourseGroup = typeof courseGroupsTable.$inferSelect;

export const courseGroupMembersTable = pgTable("course_group_members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text("group_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role", { enum: ["leader", "member"] }).notNull().default("member"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export type CourseGroupMember = typeof courseGroupMembersTable.$inferSelect;
