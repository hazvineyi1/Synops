import { db } from "@workspace/db";
import { beatProgressTable, beatsTable, modulesTable, enrolmentsTable, credentialsTable } from "@workspace/db";
import { eq, and, or, sql, inArray, isNotNull } from "drizzle-orm";

/**
 * Course-progress math, shared by the progress routes AND the coach path (lib/mastery.ts) so a
 * module completed EITHER way counts the same everywhere.
 *
 * Two independent signals can complete a module:
 *   - content viewed  -> beat_progress rows for the module's beats
 *   - mastered via the coach -> a VALID credential for the module (the coach never writes beat_progress)
 * Either satisfies. Historically only the first counted, so a module mastered through the Socratic
 * coach read 0% on the dashboard, the course page, and the gradebook. Here a certified module's beats
 * are treated as fully viewed, so the percentage reflects real completion however it was earned.
 */

const PUBLISHED = "published";

/** Module ids the learner holds a VALID credential for, grouped by course. */
export async function certifiedModuleIds(userId: string): Promise<Map<string, Set<string>>> {
  const rows = await db
    .select({ moduleId: credentialsTable.moduleId, courseId: modulesTable.courseId })
    .from(credentialsTable)
    .innerJoin(modulesTable, eq(credentialsTable.moduleId, modulesTable.id))
    .where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.status, "valid")));
  const byCourse = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byCourse.has(r.courseId)) byCourse.set(r.courseId, new Set());
    byCourse.get(r.courseId)!.add(r.moduleId);
  }
  return byCourse;
}

export interface CourseProgressSummary {
  courseId: string;
  viewedBeats: number;
  totalBeats: number;
  percent: number;
}

/**
 * Content-completion percentage for one course. A beat counts as "done" when the learner viewed it
 * OR when it belongs to a module they hold a valid credential for. `certModuleIds` can be passed in
 * (callers that already loaded the credential map avoid a re-query); otherwise it is fetched.
 */
export async function courseProgress(userId: string, courseId: string, certModuleIds?: Set<string>): Promise<CourseProgressSummary> {
  const [totals] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(beatsTable)
    .innerJoin(modulesTable, eq(beatsTable.moduleId, modulesTable.id))
    .where(and(eq(modulesTable.courseId, courseId), eq(modulesTable.status, PUBLISHED)));

  const certIds = certModuleIds ? [...certModuleIds] : [...((await certifiedModuleIds(userId)).get(courseId) ?? new Set<string>())];

  // Count DISTINCT published beats that are either viewed by this learner or in a certified module,
  // via a left join so a certified-but-unviewed beat still counts. This keeps beat-level granularity
  // for content while treating a mastered module's beats as fully done.
  const [done] = await db
    .select({ viewed: sql<number>`count(distinct ${beatsTable.id})::int` })
    .from(beatsTable)
    .innerJoin(modulesTable, eq(beatsTable.moduleId, modulesTable.id))
    .leftJoin(
      beatProgressTable,
      and(eq(beatProgressTable.beatId, beatsTable.id), eq(beatProgressTable.userId, userId)),
    )
    .where(
      and(
        eq(modulesTable.courseId, courseId),
        eq(modulesTable.status, PUBLISHED),
        or(
          isNotNull(beatProgressTable.beatId),
          certIds.length ? inArray(modulesTable.id, certIds) : sql`false`,
        ),
      ),
    );

  const total = totals?.total ?? 0;
  const viewed = Math.min(done?.viewed ?? 0, total);
  // A course with no published beats is 0%, not 100% - never hand out completion for an empty course.
  const percent = total > 0 ? Math.round((viewed / total) * 100) : 0;
  return { courseId, viewedBeats: viewed, totalBeats: total, percent };
}

/**
 * Flip the enrolment to completed when the course reads 100% (content viewed and/or modules mastered).
 * Only ever moves an ACTIVE enrolment forward - never resurrects a withdrawn one, never un-completes.
 * Callers may pass a pre-computed percent; otherwise it is computed (credential-aware).
 */
export async function maybeCompleteEnrolment(userId: string, courseId: string, percent?: number): Promise<void> {
  const pct = percent ?? (await courseProgress(userId, courseId)).percent;
  if (pct < 100) return;
  await db
    .update(enrolmentsTable)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(eq(enrolmentsTable.userId, userId), eq(enrolmentsTable.courseId, courseId), eq(enrolmentsTable.status, "active")));
}
