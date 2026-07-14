import { pgTable, text, timestamp, integer, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Beat-level progress.
 *
 * This is the atom the whole LMS was missing: without it there is no way to know
 * what a learner has actually seen, so "course completion %", enrolment completion,
 * credential issuance and the org_admin workforce dashboard all had nothing real to
 * stand on.
 *
 * The UNIQUE (user_id, beat_id) constraint makes marking progress IDEMPOTENT: the
 * client can fire "I viewed this beat" on every render without double-counting, and
 * the API upserts. That is deliberate -- it means we never need the client to track
 * whether it already reported a beat, which is exactly the kind of state that drifts.
 */
export const beatProgressTable = pgTable(
  "beat_progress",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    beatId: text("beat_id").notNull(),
    // Denormalised so completion queries don't need a 3-way join on every request.
    // Beats never move between modules/courses, so these can't drift.
    moduleId: text("module_id").notNull(),
    courseId: text("course_id").notNull(),
    // Cumulative seconds spent on this beat. Additive across visits, which is what
    // B-BBEE / SETA "training hours" reporting needs (Phase 2 in the spec).
    secondsSpent: integer("seconds_spent").notNull().default(0),
    firstViewedAt: timestamp("first_viewed_at").notNull().defaultNow(),
    lastViewedAt: timestamp("last_viewed_at").notNull().defaultNow(),
  },
  (t) => ({
    userBeatUnique: unique("beat_progress_user_beat_unique").on(t.userId, t.beatId),
    userCourseIdx: index("beat_progress_user_course_idx").on(t.userId, t.courseId),
    userModuleIdx: index("beat_progress_user_module_idx").on(t.userId, t.moduleId),
  }),
);

export const insertBeatProgressSchema = createInsertSchema(beatProgressTable).omit({
  id: true,
  firstViewedAt: true,
  lastViewedAt: true,
});

export type InsertBeatProgress = z.infer<typeof insertBeatProgressSchema>;
export type BeatProgress = typeof beatProgressTable.$inferSelect;
