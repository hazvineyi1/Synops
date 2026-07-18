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
  // Post-before-you-read. This column already existed but nothing ever enforced it;
  // the reply route now does.
  requireInitialPost: boolean("require_initial_post").notNull().default(false),
  graded: boolean("graded").notNull().default(false),
  assignmentId: text("assignment_id"),
  // Optional module scoping. Null = a course-wide thread, which is what every existing
  // row is, so the module Participate tab stops showing every thread in the course.
  moduleId: text("module_id"),
  // An AI facilitator posts a prodding follow-up after a learner contributes, so a quiet
  // thread still asks the next good question instead of going dead.
  aiFacilitated: boolean("ai_facilitated").notNull().default(false),
  // Language the thread was authored in. Learners may answer in any supported language.
  language: text("language").notNull().default("en"),
  // Participation requirements, stored per thread rather than hard-coded so a facilitator
  // can set a different bar without a redeploy. Defaults encode the standard ask:
  // one initial post of 100-150 words, then four further replies of at least 50 words.
  minInitialWords: integer("min_initial_words").notNull().default(100),
  maxInitialWords: integer("max_initial_words").notNull().default(150),
  minReplyWords: integer("min_reply_words").notNull().default(50),
  requiredInteractions: integer("required_interactions").notNull().default(5),
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
  // Posted by the AI facilitator rather than a person. Rendered distinctly and never
  // counted towards a learner's own participation requirement.
  isAiFacilitator: boolean("is_ai_facilitator").notNull().default(false),
  // Language this contribution was written in, so translation knows the source.
  language: text("language").notNull().default("en"),
  // Stored at write time: the rule is enforced server-side and the count is what it was
  // judged on, so a later edit cannot silently drop a post below the bar it passed.
  wordCount: integer("word_count").notNull().default(0),
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
