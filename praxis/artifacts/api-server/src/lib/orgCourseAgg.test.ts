import { describe, it, expect } from "vitest";
import { orgCourseIds, aggregateOrgCourses, type CourseRow, type EnrolRow } from "./orgCourseAgg";

// Enrolment rollup for the org courses list (the "In classes" / progress data the partner sees).
// Pure, no DB. Guards the rule that a course is in the org if it's class-attached OR a member is
// enrolled, and that enrolled counts + completion-based progress are computed correctly.

describe("orgCourseIds (union + dedup)", () => {
  it("unions class-attached and member-enrolled courses, de-duplicating overlaps", () => {
    const ids = orgCourseIds(
      [{ courseId: "c1" }, { courseId: "c2" }],
      [{ courseId: "c2" }, { courseId: "c3" }], // c2 overlaps
    );
    expect([...ids].sort()).toEqual(["c1", "c2", "c3"]);
    expect(ids.length).toBe(3); // c2 appears once
  });

  it("returns empty when the org has no class courses and no enrolments", () => {
    expect(orgCourseIds([], [])).toEqual([]);
  });

  it("includes a class-attached course even with zero enrolments", () => {
    expect(orgCourseIds([{ courseId: "c1" }], [])).toEqual(["c1"]);
  });
});

describe("aggregateOrgCourses (counts + progress + status)", () => {
  const course = (over: Partial<CourseRow> = {}): CourseRow => ({ id: "c1", title: "A course", status: "published", ...over });

  it("counts enrolled and completes progress from status OR completedAt", () => {
    const enrol: EnrolRow[] = [
      { courseId: "c1", status: "completed", completedAt: null },       // completed via status
      { courseId: "c1", status: "active", completedAt: "2026-01-01" },  // completed via completedAt
      { courseId: "c1", status: "active", completedAt: null },          // not completed
    ];
    const [row] = aggregateOrgCourses([course()], enrol);
    expect(row.enrolled).toBe(3);
    expect(row.avgProgress).toBe(67); // 2/3 -> 66.67 -> 67 (rounded)
  });

  it("shows a class-attached course with no enrolments as 0 enrolled / 0 progress", () => {
    const [row] = aggregateOrgCourses([course()], []);
    expect(row.enrolled).toBe(0);
    expect(row.avgProgress).toBe(0);
  });

  it("maps published->active and anything else->draft", () => {
    const rows = aggregateOrgCourses(
      [course({ id: "c1", title: "Live", status: "published" }), course({ id: "c2", title: "WIP", status: "draft" })],
      [],
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));
    expect(byId.c1).toBe("active");
    expect(byId.c2).toBe("draft");
  });

  it("attributes each enrolment to its own course and sorts by title", () => {
    const rows = aggregateOrgCourses(
      [course({ id: "c1", title: "Zebra" }), course({ id: "c2", title: "Alpha" })],
      [
        { courseId: "c1", status: "completed", completedAt: null },
        { courseId: "c2", status: "active", completedAt: null },
      ],
    );
    expect(rows.map((r) => r.title)).toEqual(["Alpha", "Zebra"]); // sorted
    const zebra = rows.find((r) => r.id === "c1")!;
    const alpha = rows.find((r) => r.id === "c2")!;
    expect(zebra.avgProgress).toBe(100); // 1/1 complete
    expect(alpha.avgProgress).toBe(0);   // 0/1 complete
  });

  it("drops enrolment rows for courses not in courseRows (e.g. a deleted course)", () => {
    const rows = aggregateOrgCourses([course({ id: "c1", title: "Only one" })], [
      { courseId: "c1", status: "active", completedAt: null },
      { courseId: "ghost", status: "completed", completedAt: null },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["c1"]);
  });
});
