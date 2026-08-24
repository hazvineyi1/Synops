import { db } from "@workspace/db";
import {
  modulesTable,
  moduleReadingsTable,
  beatsTable,
  interactiveActivitiesTable,
  caseScenariosTable,
  assignmentsTable,
  discussionsTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";

/**
 * Course completeness gate.
 *
 * Only a fully-built course reaches the learner catalogue; anything unfinished is diverted to the
 * author-only "Incomplete courses" repository, which shows EXACTLY what each module is missing.
 *
 * A MODULE is complete only when all nine components are present, and each component counts ONLY when
 * it is published / finalised (a draft never counts):
 *   1 description   - modules.description is non-empty
 *   2 objectives    - modules.objectives has at least one entry
 *   3 readings      - >=1 module_readings (published)
 *   4 videos        - >=1 beats of type 'video' with a video_url
 *   5 interactives  - >=1 interactive_activities (published)
 *   6 case study    - >=1 case_scenarios (exists; publishing the module publishes it)
 *   7 assignment    - >=1 assignments (exists; publishing the module publishes it)
 *   8 discussion    - >=1 discussions (existence counts; the table has no published flag)
 *   9 structure     - modules.beatCount > 0 (ordered beats exist)
 *
 * COURSE-LEVEL fallback: for assignment (7) and discussion (8), an item attached to the whole course
 * (module_id NULL, same course_id) satisfies EVERY module of that course. The case_scenarios table has
 * no course_id column, so a case study can only be satisfied per module (there is no course-level
 * case study to fall back on).
 *
 * A COURSE is catalogue-eligible only when courses.status = 'published', it has at least one module,
 * and every module is modules.status = 'published' AND complete.
 *
 * The evaluation itself is pure (evaluateModule / evaluateCourse) so it is unit-testable without a
 * database; loadCourseCompleteness does the batched counting (one grouped query per component table)
 * and hands the tallies to the pure evaluators.
 */

/** Stable keys for the nine components, in display order. */
export type ComponentKey =
  | "description"
  | "objectives"
  | "readings"
  | "videos"
  | "interactives"
  | "caseStudy"
  | "assignment"
  | "discussion"
  | "structure";

/** Human-readable label for each component (plain hyphens only, learner/author-facing). */
export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  description: "Module description",
  objectives: "Learning objectives",
  readings: "A published reading",
  videos: "A video lesson",
  interactives: "A published interactive activity",
  caseStudy: "A case study",
  assignment: "An assignment",
  discussion: "A discussion",
  structure: "Lesson structure (ordered beats)",
};

export const COMPONENT_ORDER: ComponentKey[] = [
  "description",
  "objectives",
  "readings",
  "videos",
  "interactives",
  "caseStudy",
  "assignment",
  "discussion",
  "structure",
];

/** One missing component: a stable key plus its human-readable label. */
export interface MissingComponent {
  key: ComponentKey;
  label: string;
}

/** The nine presence signals for a single module (true = that component is present and finalised). */
export interface ModuleSignals {
  hasDescription: boolean;
  hasObjectives: boolean;
  hasReading: boolean;
  hasVideo: boolean;
  hasInteractive: boolean;
  hasCaseStudy: boolean;
  hasAssignment: boolean;
  hasDiscussion: boolean;
  hasStructure: boolean;
}

export interface ModuleCompleteness {
  moduleId: string;
  moduleTitle: string;
  /** The module's own publish status (a module must be 'published' for its course to be eligible). */
  status: string;
  published: boolean;
  /** All nine components present. Independent of the module's publish status. */
  complete: boolean;
  missing: MissingComponent[];
  /**
   * Optional add-on module. Optional modules NEVER block course publishing. An optional module that is
   * excluded from the delivered course (draft / not published) is ignored entirely. An optional module
   * that the author has INCLUDED (published) must still be complete, exactly like a core module.
   * Absent/undefined is treated as a required (core) module.
   */
  optional?: boolean;
}

/** Per-module reason a course is not catalogue-eligible (drives the repository UI). */
export interface IncompleteModuleReason {
  moduleId: string;
  moduleTitle: string;
  moduleStatus: string;
  /** Component labels the module is missing, plus a publish note when the module is still a draft. */
  missing: string[];
}

export interface CourseCompleteness {
  courseId: string;
  /** Catalogue-eligible: published course, >=1 module, every module published AND complete. */
  complete: boolean;
  courseStatus: string;
  moduleCount: number;
  /** Course-wide blockers not tied to one module (course not published yet, or no modules). */
  courseIssues: string[];
  /** One entry per module that blocks eligibility (incomplete and/or not published). */
  incompleteReasons: IncompleteModuleReason[];
  /** Full per-module detail (every module), for a rich repository view. */
  modules: ModuleCompleteness[];
}

/** Pure: which of the nine components a module is missing, given its presence signals. */
export function evaluateModule(signals: ModuleSignals): { complete: boolean; missing: MissingComponent[] } {
  const present: Record<ComponentKey, boolean> = {
    description: signals.hasDescription,
    objectives: signals.hasObjectives,
    readings: signals.hasReading,
    videos: signals.hasVideo,
    interactives: signals.hasInteractive,
    caseStudy: signals.hasCaseStudy,
    assignment: signals.hasAssignment,
    discussion: signals.hasDiscussion,
    structure: signals.hasStructure,
  };
  const missing = COMPONENT_ORDER.filter((k) => !present[k]).map((key) => ({ key, label: COMPONENT_LABELS[key] }));
  return { complete: missing.length === 0, missing };
}

export interface CourseInput {
  courseId: string;
  courseStatus: string;
  modules: ModuleCompleteness[];
}

/** Pure: roll module results up to a course verdict (catalogue eligibility + the reasons it is not). */
export function evaluateCourse(input: CourseInput): CourseCompleteness {
  const courseIssues: string[] = [];
  if (input.courseStatus !== "published") courseIssues.push("Course is not published yet");
  if (input.modules.length === 0) courseIssues.push("Course has no modules yet");

  // Does this module block catalogue eligibility?
  //  - Core (required) module: must be published AND complete.
  //  - Optional add-on module that is INCLUDED (published): must be complete (but its "not published"
  //    state can never apply — it is published to be included).
  //  - Optional add-on module that is EXCLUDED (draft / not published): ignored entirely; never blocks.
  const blocksEligibility = (m: ModuleCompleteness): boolean => {
    if (m.optional) return m.published ? !m.complete : false;
    return !m.published || !m.complete;
  };

  const incompleteReasons: IncompleteModuleReason[] = [];
  for (const m of input.modules) {
    if (!blocksEligibility(m)) continue;
    const missing = m.missing.map((x) => x.label);
    // The "not published" note only makes sense for a core module still in draft. An included optional
    // module is published by definition; an excluded optional module never reaches this branch.
    if (!m.optional && !m.published) missing.push("Module is not published yet (still a draft or in review)");
    incompleteReasons.push({ moduleId: m.moduleId, moduleTitle: m.moduleTitle, moduleStatus: m.status, missing });
  }

  const complete =
    input.courseStatus === "published" &&
    input.modules.length > 0 &&
    !input.modules.some(blocksEligibility);

  return {
    courseId: input.courseId,
    complete,
    courseStatus: input.courseStatus,
    moduleCount: input.modules.length,
    courseIssues,
    incompleteReasons,
    modules: input.modules,
  };
}

/** count(*) grouped by a column, returned as a Map(groupValue -> count). */
async function groupedCounts(rows: Promise<{ key: string | null; n: number }[]>): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const r of await rows) if (r.key != null) map.set(r.key, Number(r.n));
  return map;
}

/**
 * Evaluate completeness for a set of courses with a fixed, small number of batched queries: the
 * modules, then one grouped count per component table (module-level, plus a course-level pass for the
 * assignment and discussion fallbacks). Returns a Map keyed by courseId. Courses with no modules still
 * get an entry (marked incomplete). An empty input returns an empty Map with no queries.
 */
export async function loadCourseCompleteness(courseInfos: { id: string; status: string }[]): Promise<Map<string, CourseCompleteness>> {
  const result = new Map<string, CourseCompleteness>();
  if (courseInfos.length === 0) return result;

  const courseIds = courseInfos.map((c) => c.id);
  const statusById = new Map(courseInfos.map((c) => [c.id, c.status]));

  const modules = await db
    .select({
      id: modulesTable.id,
      courseId: modulesTable.courseId,
      title: modulesTable.title,
      description: modulesTable.description,
      objectives: modulesTable.objectives,
      status: modulesTable.status,
      beatCount: modulesTable.beatCount,
      optional: modulesTable.optional,
    })
    .from(modulesTable)
    .where(inArray(modulesTable.courseId, courseIds));

  const moduleIds = modules.map((m) => m.id);

  // Empty-safe grouped counts. A grouped count over an empty IN () is skipped entirely.
  const empty = new Map<string, number>();
  const [readings, videos, interactives, cases, asgModule, asgCourse, discModule, discCourse] = await Promise.all([
    moduleIds.length
      ? groupedCounts(
          db
            .select({ key: moduleReadingsTable.moduleId, n: sql<number>`count(*)::int` })
            .from(moduleReadingsTable)
            .where(and(inArray(moduleReadingsTable.moduleId, moduleIds), eq(moduleReadingsTable.published, true)))
            .groupBy(moduleReadingsTable.moduleId),
        )
      : Promise.resolve(empty),
    moduleIds.length
      ? groupedCounts(
          db
            .select({ key: beatsTable.moduleId, n: sql<number>`count(*)::int` })
            .from(beatsTable)
            .where(and(inArray(beatsTable.moduleId, moduleIds), eq(beatsTable.type, "video"), isNotNull(beatsTable.videoUrl), sql`${beatsTable.videoUrl} <> ''`))
            .groupBy(beatsTable.moduleId),
        )
      : Promise.resolve(empty),
    moduleIds.length
      ? groupedCounts(
          db
            .select({ key: interactiveActivitiesTable.moduleId, n: sql<number>`count(*)::int` })
            .from(interactiveActivitiesTable)
            .where(and(inArray(interactiveActivitiesTable.moduleId, moduleIds), eq(interactiveActivitiesTable.published, true)))
            .groupBy(interactiveActivitiesTable.moduleId),
        )
      : Promise.resolve(empty),
    // A case study counts once the author has built one for the module. There is no separate author
    // step to "publish" a case scenario (unlike readings/interactives), so requiring published status
    // deadlocked every authored course. Publishing the module pushes its case studies live (see the
    // module publish route), so an existing case study is the right completeness signal here.
    moduleIds.length
      ? groupedCounts(
          db
            .select({ key: caseScenariosTable.moduleId, n: sql<number>`count(*)::int` })
            .from(caseScenariosTable)
            .where(inArray(caseScenariosTable.moduleId, moduleIds))
            .groupBy(caseScenariosTable.moduleId),
        )
      : Promise.resolve(empty),
    // Likewise an assignment counts once it exists on the module; publishing the module publishes it.
    moduleIds.length
      ? groupedCounts(
          db
            .select({ key: assignmentsTable.moduleId, n: sql<number>`count(*)::int` })
            .from(assignmentsTable)
            .where(inArray(assignmentsTable.moduleId, moduleIds))
            .groupBy(assignmentsTable.moduleId),
        )
      : Promise.resolve(empty),
    // Course-level assignment fallback: an assignment with module_id NULL satisfies every module of
    // that course.
    groupedCounts(
      db
        .select({ key: assignmentsTable.courseId, n: sql<number>`count(*)::int` })
        .from(assignmentsTable)
        .where(and(inArray(assignmentsTable.courseId, courseIds), isNull(assignmentsTable.moduleId)))
        .groupBy(assignmentsTable.courseId),
    ),
    moduleIds.length
      ? groupedCounts(
          db
            .select({ key: discussionsTable.moduleId, n: sql<number>`count(*)::int` })
            .from(discussionsTable)
            .where(inArray(discussionsTable.moduleId, moduleIds))
            .groupBy(discussionsTable.moduleId),
        )
      : Promise.resolve(empty),
    // Course-level discussion fallback: a discussion with module_id NULL satisfies every module.
    groupedCounts(
      db
        .select({ key: discussionsTable.courseId, n: sql<number>`count(*)::int` })
        .from(discussionsTable)
        .where(and(inArray(discussionsTable.courseId, courseIds), isNull(discussionsTable.moduleId)))
        .groupBy(discussionsTable.courseId),
    ),
  ]);

  // Build per-module completeness.
  const modulesByCourse = new Map<string, ModuleCompleteness[]>();
  for (const m of modules) {
    const courseAsg = (asgCourse.get(m.courseId) ?? 0) > 0;
    const courseDisc = (discCourse.get(m.courseId) ?? 0) > 0;
    const signals: ModuleSignals = {
      hasDescription: !!m.description && m.description.trim().length > 0,
      hasObjectives: (m.objectives?.length ?? 0) > 0,
      hasReading: (readings.get(m.id) ?? 0) > 0,
      hasVideo: (videos.get(m.id) ?? 0) > 0,
      hasInteractive: (interactives.get(m.id) ?? 0) > 0,
      hasCaseStudy: (cases.get(m.id) ?? 0) > 0,
      hasAssignment: (asgModule.get(m.id) ?? 0) > 0 || courseAsg,
      hasDiscussion: (discModule.get(m.id) ?? 0) > 0 || courseDisc,
      hasStructure: Number(m.beatCount) > 0,
    };
    const evalResult = evaluateModule(signals);
    const mc: ModuleCompleteness = {
      moduleId: m.id,
      moduleTitle: m.title,
      status: m.status,
      published: m.status === "published",
      complete: evalResult.complete,
      missing: evalResult.missing,
      optional: m.optional ?? false,
    };
    if (!modulesByCourse.has(m.courseId)) modulesByCourse.set(m.courseId, []);
    modulesByCourse.get(m.courseId)!.push(mc);
  }

  for (const id of courseIds) {
    result.set(
      id,
      evaluateCourse({
        courseId: id,
        courseStatus: statusById.get(id) ?? "draft",
        modules: modulesByCourse.get(id) ?? [],
      }),
    );
  }
  return result;
}
