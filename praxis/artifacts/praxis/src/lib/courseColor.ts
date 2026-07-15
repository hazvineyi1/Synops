/**
 * A stable per-course accent so a course looks the same everywhere (dashboard, course
 * grid, detail). Courses have no colour field, so we hash the id into a small,
 * deliberately calm palette. Keeping this in one place is what makes the learner
 * surfaces feel consistent, which the usability research flags as a top driver.
 */
export const COURSE_ACCENTS = [
  { bar: "bg-indigo-500", soft: "bg-indigo-500/10", text: "text-indigo-600", ring: "ring-indigo-500/20" },
  { bar: "bg-emerald-500", soft: "bg-emerald-500/10", text: "text-emerald-600", ring: "ring-emerald-500/20" },
  { bar: "bg-amber-500", soft: "bg-amber-500/10", text: "text-amber-600", ring: "ring-amber-500/20" },
  { bar: "bg-sky-500", soft: "bg-sky-500/10", text: "text-sky-600", ring: "ring-sky-500/20" },
  { bar: "bg-rose-500", soft: "bg-rose-500/10", text: "text-rose-600", ring: "ring-rose-500/20" },
] as const;

export type CourseAccent = (typeof COURSE_ACCENTS)[number];

export function courseAccent(id: string): CourseAccent {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COURSE_ACCENTS[h % COURSE_ACCENTS.length]!;
}
