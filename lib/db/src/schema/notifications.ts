import { pgTable, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";

export const notificationTypeEnum = pgEnum("notification_type", [
  "assignment_due",
  "assignment_graded",
  "discussion_reply",
  "announcement",
  "enrolment",
  "credential_issued",
  "submission_feedback",
  "mention",
  "course_update",
  "system",
]);

export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  type: notificationTypeEnum("notification_type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"),
  read: boolean("read").notNull().default(false),
  courseId: text("course_id"),
  actorId: text("actor_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  readAt: timestamp("read_at"),
});

export type Notification = typeof notificationsTable.$inferSelect;
