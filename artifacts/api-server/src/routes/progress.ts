import { Router } from "express";
import { db } from "@workspace/db";
import {
  beatProgressTable,
  beatsTable,
  modulesTable,
  coursesTable,
  enrolmentsTable,
} from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

/**
 * Progress tracking.
 *
 * Before this existed the LMS had no idea what a learner had actually done:
 * `enrolments.completedAt` was a column nothing ever wrote to, and there was no
 * per-beat record at all. Completion %, credential issuance and the org_admin
 * workforce dashboard all depend on this.
 */

/** A module only counts toward completion once it is published. */
const PUBLISHED = "published";

/**
 * POST /progress/beat
 * Mark a beat as viewed. IDEMPOTENT: safe to call on every render.
 *
 * The client does not have to remember whether it already reported a beat -- that
 * kind of client-side bookkeeping always drifts. We upsert on (user_id, beat_id):
 * first call inserts, subsequent calls just bump lastViewedAt and add dwell time.
 */
router.post("/progress/beat", requireAuth, async (req, res) => {
  const { beatId, secondsSpent } = req.body as { beatId?: string; secondsSpent?: number };
  if (!beatId) {
    res.status(400).json({ error: "beatId is required" });
    return;
  }

  // Resolve the beat's module + course so completion queries never need a 3-way join.
  const [beat] = await db
    .select({ id: beatsTable.id, moduleId: beatsTable.moduleId })
    .from(beatsTable)
    .where(eq(beatsTable.id, beatId))
    .limit(1);
  if (!beat) {
    res.status(404).json({ error: "Beat not found" });
    return;
  }

  const [mod] = await db
    .select({ courseId: modulesTable.courseId })
    .from(modulesTable)
    .where(eq(modulesTable.id, beat.moduleId))
    .limit(1);
  if (!mod) {
    res.status(404).json({ error: "Module not found" });
    return;
  }

  // Clamp dwell time. An un-clamped client value lets a tab left open overnight
  // report hours of "training time" -- which would quietly corrupt the SETA/B-BBEE
  // training-hours reporting this table is meant to feed.
  const dwell = Math.max(0, Math.min(Number(secondsSpent) || 0, 1800));

  await db
    .insert(beatProgressTable)
    .values({
      userId: req.userId!,
      beatId,
      moduleId: beat.moduleId,
      courseId: mod.courseId,
      secondsSpent: dwell,
    })
    .onConflictDoUpdate({
      target: [beatProgressTable.userId, beatProgressTable.beatId],
      set: {
        lastViewedAt: new Date(),
        secondsSpent: sql`${beatProgressTable.secondsSpent} + ${dwell}`,
      },
    });

  // Completing the last beat of the last module should complete the enrolment.
  const summary = await courseProgress(req.userId!, mod.courseId);
  await maybeCompleteEnrolment(req.userId!, mod.courseId, summary.percent);

  res.json({ ok: true, course: summary });
});

/** Beats viewed / total published beats for one course. */
async function courseProgress(userId: string, courseId: string) {
  const [totals] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(beatsTable)
    .innerJoin(modulesTable, eq(beatsTable.moduleId, modulesTable.id))
    .where(and(eq(modulesTable.courseId, courseId), eq(modulesTable.status, PUBLISHED)));

  const [done] = await db
    .select({ viewed: sql<number>`count(*)::int` })
    .from(beatProgressTable)
    .innerJoin(beatsTable, eq(beatProgressTable.beatId, beatsTable.id))
    .innerJoin(modulesTable, eq(beatsTable.moduleId, modulesTable.id))
    .where(
      and(
        eq(beatProgressTable.userId, userId),
        eq(beatProgressTable.courseId, courseId),
        eq(modulesTable.status, PUBLISHED),
      ),
    );

  const total = totals?.total ?? 0;
  const viewed = Math.min(done?.viewed ?? 0, total);
  // A course with no published beats is 0%, not 100%. Dividing by zero and calling
  // it "complete" would hand out credentials for empty courses.
  const percent = total > 0 ? Math.round((viewed / total) * 100) : 0;
  return { courseId, viewedBeats: viewed, totalBeats: total, percent };
}

/**
 * Flip the enrolment to completed when every published beat has been viewed.
 * Only ever moves an ACTIVE enrolment forward -- never resurrects a withdrawn one,
 * and never un-completes (completedAt is written once).
 */
async function maybeCompleteEnrolment(userId: string, courseId: string, percent: number) {
  if (percent < 100) return;
  await db
    .update(enrolmentsTable)
    .set({ status: "completed", completedAt: new Date() })
    .where(
      and(
        eq(enrolmentsTable.userId, userId),
        eq(enrolmentsTable.courseId, courseId),
        eq(enrolmentsTable.status, "active"),
      ),
    );
}

/**
 * GET /progress/module/:moduleId
 * The beat ids this learner has already viewed in a module.
 *
 * The viewer seeds its "completed" set from this on mount, so progress survives a
 * refresh. Previously the completed set lived only in React state and was wiped on
 * every reload, which meant a learner's progress was fiction.
 */
router.get("/progress/module/:moduleId", requireAuth, async (req, res) => {
  const rows = await db
    .select({ beatId: beatProgressTable.beatId })
    .from(beatProgressTable)
    .where(
      and(
        eq(beatProgressTable.userId, req.userId!),
        eq(beatProgressTable.moduleId, req.params.moduleId),
      ),
    );
  res.json({ viewedBeatIds: rows.map((r) => r.beatId) });
});

/**
 * GET /progress/course/:courseId
 * Completion for one course, broken down by module (drives the course detail page).
 */
router.get("/progress/course/:courseId", requireAuth, async (req, res) => {
  const { courseId } = req.params;
  const userId = req.userId!;

  const mods = await db
    .select({ id: modulesTable.id, title: modulesTable.title, order: modulesTable.order })
    .from(modulesTable)
    .where(and(eq(modulesTable.courseId, courseId), eq(modulesTable.status, PUBLISHED)))
    .orderBy(modulesTable.order);

  const moduleIds = mods.map((m) => m.id);

  const beatCounts = moduleIds.length
    ? await db
        .select({ moduleId: beatsTable.moduleId, total: sql<number>`count(*)::int` })
        .from(beatsTable)
        .where(inArray(beatsTable.moduleId, moduleIds))
        .groupBy(beatsTable.moduleId)
    : [];

  const viewedCounts = moduleIds.length
    ? await db
        .select({ moduleId: beatProgressTable.moduleId, viewed: sql<number>`count(*)::int` })
        .from(beatProgressTable)
        .where(
          and(
            eq(beatProgressTable.userId, userId),
            inArray(beatProgressTable.moduleId, moduleIds),
          ),
        )
        .groupBy(beatProgressTable.moduleId)
    : [];

  const totalBy = new Map(beatCounts.map((r) => [r.moduleId, r.total]));
  const viewedBy = new Map(viewedCounts.map((r) => [r.moduleId, r.viewed]));

  const modules = mods.map((m) => {
    const total = totalBy.get(m.id) ?? 0;
    const viewed = Math.min(viewedBy.get(m.id) ?? 0, total);
    return {
      moduleId: m.id,
      title: m.title,
      order: m.order,
      viewedBeats: viewed,
      totalBeats: total,
      percent: total > 0 ? Math.round((viewed / total) * 100) : 0,
      complete: total > 0 && viewed >= total,
    };
  });

  const summary = await courseProgress(userId, courseId);
  res.json({ ...summary, modules });
});

/**
 * GET /progress/me
 * Completion across every course the learner is enrolled in, plus a streak.
 * Drives the learner dashboard.
 */
router.get("/progress/me", requireAuth, async (req, res) => {
  const userId = req.userId!;

  const enrolments = await db
    .select({
      courseId: enrolmentsTable.courseId,
      status: enrolmentsTable.status,
      completedAt: enrolmentsTable.completedAt,
      title: coursesTable.title,
    })
    .from(enrolmentsTable)
    .leftJoin(coursesTable, eq(enrolmentsTable.courseId, coursesTable.id))
    .where(eq(enrolmentsTable.userId, userId));

  const courses = await Promise.all(
    enrolments.map(async (e) => ({
      ...(await courseProgress(userId, e.courseId)),
      title: e.title,
      status: e.status,
      completedAt: e.completedAt,
    })),
  );

  const [agg] = await db
    .select({
      totalSeconds: sql<number>`coalesce(sum(${beatProgressTable.secondsSpent}), 0)::int`,
      activeDays: sql<number>`count(distinct date(${beatProgressTable.lastViewedAt}))::int`,
    })
    .from(beatProgressTable)
    .where(eq(beatProgressTable.userId, userId));

  res.json({
    courses,
    coursesCompleted: courses.filter((c) => c.percent >= 100).length,
    coursesInProgress: courses.filter((c) => c.percent > 0 && c.percent < 100).length,
    // Training hours: the raw material for SETA / B-BBEE skills-development reporting.
    totalMinutes: Math.round((agg?.totalSeconds ?? 0) / 60),
    activeDays: agg?.activeDays ?? 0,
    streak: await currentStreak(userId),
  });
});

/**
 * Consecutive days (ending today or yesterday) with at least one beat viewed.
 * Yesterday still counts so a learner mid-streak isn't told it's broken before
 * they've had a chance to study today.
 */
async function currentStreak(userId: string): Promise<number> {
  const rows = await db
    .select({ day: sql<string>`date(${beatProgressTable.lastViewedAt})::text` })
    .from(beatProgressTable)
    .where(eq(beatProgressTable.userId, userId))
    .groupBy(sql`date(${beatProgressTable.lastViewedAt})`)
    .orderBy(sql`date(${beatProgressTable.lastViewedAt}) desc`);

  const days = new Set(rows.map((r) => r.day));
  if (days.size === 0) return 0;

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const cursor = new Date();
  if (!days.has(iso(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(iso(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(iso(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default router;
