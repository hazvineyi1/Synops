/**
 * The level badge shown on a course.
 *
 * US / K-12 courses carry a "Grade N" competency tag (set by the K-12 seed) and show that; every
 * other course falls back to the South African NQF label. This keeps a K-12 tenant reading as US
 * education, while leaving vocational (NQF / SETA) tenants like Enza completely unchanged.
 */
export function courseLevelLabel(course: { nqfLevel?: number | null; competencyTags?: string[] | null }): string | null {
  const grade = (course.competencyTags ?? []).find((t) => /^\s*grade\s+\d+/i.test(t));
  if (grade) return grade.trim().replace(/^grade\s+/i, "Grade ");
  if (course.nqfLevel != null) return `NQF Level ${course.nqfLevel}`;
  return null;
}
