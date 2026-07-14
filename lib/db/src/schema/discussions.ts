import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const discussionsTable = pgTable("discussions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id").notNull(),
  authorId: text("author_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  isPinned: boolean("is_pinned").notNull().default(false),
  isAnnouncement: boolean("is_announcement").notNull().default(false),
  isClosed: boolean("is_closed").notNull().default(false),
  requireInitialPost: boolean("require_initial_post").notNull().default(false),
  graded: boolean("graded").notNull().default(false),
  assignmentId: text("assignment_id"),
  replyCount: integer("reply_count").notNull().default(0),
  likeCount: integer("like_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDiscussionSchema = createInsertSchema(discussionsTable).omit({
  id: true,
  replyCount: true,
  likeCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDiscussion = z.infer<typeof insertDiscussionSchema>;
export type Discussion = typeof discussionsTable.$inferSelect;

export const discussionRepliesTable = pgTable("discussion_replies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  discussionId: text("discussion_id").notNull(),
  parentReplyId: text("parent_reply_id"),
  authorId: text("author_id").notNull(),
  body: text("body").notNull(),
  likeCount: integer("like_count").notNull().default(0),
  isInstructorReply: boolean("is_instructor_reply").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDiscussionReplySchema = createInsertSchema(discussionRepliesTable).omit({
  id: true,
  likeCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDiscussionReply = z.infer<typeof insertDiscussionReplySchema>;
export type DiscussionReply = typeof discussionRepliesTable.$inferSelect;
