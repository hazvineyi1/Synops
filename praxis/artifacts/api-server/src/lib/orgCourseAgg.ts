/**
 * Pure enrolment-rollup logic for an organisation's course list, extracted from the
 * GET /organisations/:orgId/courses route so it can be unit-tested without a DB.
 *
 * The enrolment rule: a course counts as "in the org" if it is attached to one of the org's
 * classes OR an org member is enrolled in it (union + dedup). For each such course we report the
 * real enrolled count and a completion-based progress %, computed only from real enrolments.
 */

export interface EnrolRow {
  courseId: string;
  status: string | null;
  completedAt: unknown; // Date | string | null — truthy means completed
}
export interface CourseRow {
  id: string;
  title: string;
  status: string | null;
}
export interface OrgCourseRow {
  id: string;
  title: string;
  modality: string;
  enrolled: number;
  avgProgress: number; // 0..100, completion-based
  status: "active" | "draft";
}

/** Union + dedup of the course ids that belong to an org (class-attached OR member-enrolled). */
export function orgCourseIds(
  classCourseRows: { courseId: string }[],
  enrolRows: { courseId: string }[],
): string[] {
  return [...new Set<string>([...classCourseRows.map((r) => r.courseId), ...enrolRows.map((r) => r.courseId)])];
}

/**
 * Roll up the org's courses: enrolled count, completion-based average progress, and a
 * published->active / else->draft status, sorted by title. `courseRows` is authoritative for
 * which courses appear (a course with no matching row is dropped); `enrolRows` drives the counts.
 * An enrolment counts as completed when its status is "completed" OR it has a completedAt.
 */
export function aggregateOrgCourses(courseRows: CourseRow[], enrolRows: EnrolRow[]): OrgCourseRow[] {
  const byCourse: Record<string, { enrolled: number; completed: number }> = {};
  for (const e of enrolRows) {
    const b = (byCourse[e.courseId] ??= { enrolled: 0, completed: 0 });
    b.enrolled++;
    if (e.status === "completed" || e.completedAt) b.completed++;
  }
  return courseRows
    .map((c) => {
      const b = byCourse[c.id] ?? { enrolled: 0, completed: 0 };
      return {
        id: c.id,
        title: c.title,
        modality: "",
        enrolled: b.enrolled,
        avgProgress: b.enrolled ? Math.round((b.completed / b.enrolled) * 100) : 0,
        status: (c.status === "published" ? "active" : "draft") as "active" | "draft",
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}
