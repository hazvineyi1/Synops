import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, eq, inArray } from "drizzle-orm";
import {
  evaluateModule,
  evaluateCourse,
  loadCourseCompleteness,
  COMPONENT_LABELS,
  type ModuleSignals,
  type ModuleCompleteness,
} from "./courseCompleteness";

/**
 * Course completeness gate. The pure evaluators (evaluateModule / evaluateCourse) are tested with no
 * database; a DB-backed block then proves the batched loader end to end, including the course-level
 * assignment/discussion fallback and that a draft component never counts.
 */

const allPresent = (): ModuleSignals => ({
  hasDescription: true,
  hasObjectives: true,
  hasReading: true,
  hasVideo: true,
  hasInteractive: true,
  hasCaseStudy: true,
  hasAssignment: true,
  hasDiscussion: true,
  hasStructure: true,
});

// signal field -> expected missing component key
const SIGNAL_TO_KEY: [keyof ModuleSignals, keyof typeof COMPONENT_LABELS][] = [
  ["hasDescription", "description"],
  ["hasObjectives", "objectives"],
  ["hasReading", "readings"],
  ["hasVideo", "videos"],
  ["hasInteractive", "interactives"],
  ["hasCaseStudy", "caseStudy"],
  ["hasAssignment", "assignment"],
  ["hasDiscussion", "discussion"],
  ["hasStructure", "structure"],
];

const completeModule = (over: Partial<ModuleCompleteness> = {}): ModuleCompleteness => ({
  moduleId: "m1",
  moduleTitle: "Module 1",
  status: "published",
  published: true,
  complete: true,
  missing: [],
  ...over,
});

describe("evaluateModule (pure)", () => {
  it("is complete with no missing components when all nine are present", () => {
    const r = evaluateModule(allPresent());
    expect(r.complete).toBe(true);
    expect(r.missing).toHaveLength(0);
  });

  it("is incomplete and names the reason when ANY one of the nine is absent", () => {
    for (const [signal, key] of SIGNAL_TO_KEY) {
      const r = evaluateModule({ ...allPresent(), [signal]: false });
      expect(r.complete, `${signal} absent should be incomplete`).toBe(false);
      expect(r.missing.map((m) => m.key), `${signal} absent should name ${key}`).toContain(key);
      expect(r.missing.find((m) => m.key === key)?.label).toBe(COMPONENT_LABELS[key]);
      // Only the one component is reported missing.
      expect(r.missing).toHaveLength(1);
    }
  });

  it("reports every missing component when several are absent", () => {
    const r = evaluateModule({ ...allPresent(), hasReading: false, hasVideo: false, hasStructure: false });
    expect(r.complete).toBe(false);
    expect(r.missing.map((m) => m.key).sort()).toEqual(["readings", "structure", "videos"]);
  });
});

describe("evaluateCourse (pure)", () => {
  it("is catalogue-eligible when published, has modules, and every module is published AND complete", () => {
    const r = evaluateCourse({ courseId: "c1", courseStatus: "published", modules: [completeModule(), completeModule({ moduleId: "m2" })] });
    expect(r.complete).toBe(true);
    expect(r.incompleteReasons).toHaveLength(0);
    expect(r.courseIssues).toHaveLength(0);
  });

  it("is NOT eligible when a single module is incomplete, and names that module's reasons", () => {
    const bad = completeModule({ moduleId: "m2", moduleTitle: "Weak module", complete: false, missing: [{ key: "readings", label: COMPONENT_LABELS.readings }] });
    const r = evaluateCourse({ courseId: "c1", courseStatus: "published", modules: [completeModule(), bad] });
    expect(r.complete).toBe(false);
    expect(r.incompleteReasons).toHaveLength(1);
    expect(r.incompleteReasons[0].moduleTitle).toBe("Weak module");
    expect(r.incompleteReasons[0].missing).toContain(COMPONENT_LABELS.readings);
  });

  it("is NOT eligible when a module is complete but still a draft, and says so", () => {
    const draftMod = completeModule({ moduleId: "m2", status: "draft", published: false, complete: true, missing: [] });
    const r = evaluateCourse({ courseId: "c1", courseStatus: "published", modules: [draftMod] });
    expect(r.complete).toBe(false);
    expect(r.incompleteReasons[0].missing.some((x) => /not published/i.test(x))).toBe(true);
  });

  it("is NOT eligible when the course itself is a draft, or has no modules", () => {
    const draftCourse = evaluateCourse({ courseId: "c1", courseStatus: "draft", modules: [completeModule()] });
    expect(draftCourse.complete).toBe(false);
    expect(draftCourse.courseIssues.some((x) => /not published/i.test(x))).toBe(true);

    const noModules = evaluateCourse({ courseId: "c2", courseStatus: "published", modules: [] });
    expect(noModules.complete).toBe(false);
    expect(noModules.courseIssues.some((x) => /no modules/i.test(x))).toBe(true);
  });
});

// ---- DB-backed integration: the batched loader, incl. the course-level fallback and draft exclusion ----

const SUFFIX = `cc-${Date.now()}`;
let dbMod: typeof import("@workspace/db");
let hasDb = false;

const U = `u-${SUFFIX}`;
// A: fully complete. B: missing a published reading (has only a draft one). C: satisfied by course-level items.
const CA = `cA-${SUFFIX}`, CB = `cB-${SUFFIX}`, CC = `cC-${SUFFIX}`;
const MA = `mA-${SUFFIX}`, MB = `mB-${SUFFIX}`, MC1 = `mC1-${SUFFIX}`, MC2 = `mC2-${SUFFIX}`;
const allCourses = [CA, CB, CC];
const allModules = [MA, MB, MC1, MC2];

/** Give a module all nine components (each published), optionally skipping some for negative cases. */
async function buildFullModule(courseId: string, moduleId: string, opts: { skipReading?: boolean; skipAssignment?: boolean; skipDiscussion?: boolean } = {}) {
  const { db, modulesTable, moduleReadingsTable, beatsTable, interactiveActivitiesTable, caseScenariosTable, assignmentsTable, discussionsTable } = dbMod;
  await db.insert(modulesTable).values({ id: moduleId, courseId, title: `Module ${moduleId}`, status: "published", description: "A real description", objectives: ["Do the thing"], beatCount: 1 });
  await db.insert(beatsTable).values([
    { id: `${moduleId}-b1`, moduleId, type: "points", order: 1, title: "Intro", narration: "n" },
    { id: `${moduleId}-vid`, moduleId, type: "video", order: 2, title: "Watch", narration: "n", videoUrl: "https://v.test/x.mp4" },
  ]);
  if (!opts.skipReading) {
    await db.insert(moduleReadingsTable).values({ id: `${moduleId}-r`, moduleId, title: "Reading", published: true });
  } else {
    // A DRAFT reading must NOT count.
    await db.insert(moduleReadingsTable).values({ id: `${moduleId}-rdraft`, moduleId, title: "Draft reading", published: false });
  }
  await db.insert(interactiveActivitiesTable).values({ id: `${moduleId}-i`, moduleId, title: "Activity", published: true });
  await db.insert(caseScenariosTable).values({ id: `${moduleId}-case`, moduleId, createdBy: U, title: "Case", status: "published" });
  if (!opts.skipAssignment) await db.insert(assignmentsTable).values({ id: `${moduleId}-a`, courseId, moduleId, title: "Assignment", published: true });
  if (!opts.skipDiscussion) await db.insert(discussionsTable).values({ id: `${moduleId}-d`, courseId, moduleId, authorId: U, title: "Discussion", body: "b" });
}

beforeAll(async () => {
  try {
    dbMod = await import("@workspace/db");
    await dbMod.db.execute(sql`select 1`);
    hasDb = true;
  } catch {
    hasDb = false;
    return;
  }
  const { db, usersTable, coursesTable, assignmentsTable, discussionsTable } = dbMod;
  await db.insert(usersTable).values([{ id: U, email: `${U}@t.test`, role: "instructional_designer", status: "active" }]);
  await db.insert(coursesTable).values([
    { id: CA, title: "Complete course", tenantId: "platform", status: "published" },
    { id: CB, title: "Missing reading course", tenantId: "platform", status: "published" },
    { id: CC, title: "Course-level items course", tenantId: "platform", status: "published" },
  ]);

  await buildFullModule(CA, MA); // fully complete
  await buildFullModule(CB, MB, { skipReading: true }); // only a draft reading -> readings missing

  // Course C: two modules that have everything EXCEPT a module-level assignment and discussion; a
  // single course-level (module_id NULL) assignment and discussion should satisfy BOTH modules.
  await buildFullModule(CC, MC1, { skipAssignment: true, skipDiscussion: true });
  await buildFullModule(CC, MC2, { skipAssignment: true, skipDiscussion: true });
  await db.insert(assignmentsTable).values({ id: `${CC}-courseasg`, courseId: CC, moduleId: null, title: "Course assignment", published: true });
  await db.insert(discussionsTable).values({ id: `${CC}-coursedisc`, courseId: CC, moduleId: null, authorId: U, title: "Course discussion", body: "b" });
});

afterAll(async () => {
  if (!hasDb) return;
  const { db, usersTable, coursesTable, modulesTable, moduleReadingsTable, beatsTable, interactiveActivitiesTable, caseScenariosTable, assignmentsTable, discussionsTable } = dbMod;
  await db.delete(beatsTable).where(inArray(beatsTable.moduleId, allModules)).catch(() => {});
  await db.delete(moduleReadingsTable).where(inArray(moduleReadingsTable.moduleId, allModules)).catch(() => {});
  await db.delete(interactiveActivitiesTable).where(inArray(interactiveActivitiesTable.moduleId, allModules)).catch(() => {});
  await db.delete(caseScenariosTable).where(inArray(caseScenariosTable.moduleId, allModules)).catch(() => {});
  await db.delete(assignmentsTable).where(inArray(assignmentsTable.courseId, allCourses)).catch(() => {});
  await db.delete(discussionsTable).where(inArray(discussionsTable.courseId, allCourses)).catch(() => {});
  await db.delete(modulesTable).where(inArray(modulesTable.courseId, allCourses)).catch(() => {});
  await db.delete(coursesTable).where(inArray(coursesTable.id, allCourses)).catch(() => {});
  await db.delete(usersTable).where(eq(usersTable.id, U)).catch(() => {});
});

describe("loadCourseCompleteness (DB-backed)", () => {
  it("has a database (else skipped)", () => {
    if (!hasDb) console.warn("courseCompleteness: no DATABASE_URL, skipping");
    expect(true).toBe(true);
  });

  it("marks a fully-built published course complete", async () => {
    if (!hasDb) return;
    const map = await loadCourseCompleteness([{ id: CA, status: "published" }]);
    const c = map.get(CA)!;
    expect(c.complete).toBe(true);
    expect(c.incompleteReasons).toHaveLength(0);
  });

  it("marks a course incomplete when a module has only a DRAFT reading (a draft never counts)", async () => {
    if (!hasDb) return;
    const map = await loadCourseCompleteness([{ id: CB, status: "published" }]);
    const c = map.get(CB)!;
    expect(c.complete).toBe(false);
    expect(c.incompleteReasons).toHaveLength(1);
    expect(c.incompleteReasons[0].missing).toContain(COMPONENT_LABELS.readings);
    // Everything else was present, so readings is the ONLY missing component.
    expect(c.incompleteReasons[0].missing).toEqual([COMPONENT_LABELS.readings]);
  });

  it("lets a course-level assignment AND discussion satisfy every module of the course", async () => {
    if (!hasDb) return;
    const map = await loadCourseCompleteness([{ id: CC, status: "published" }]);
    const c = map.get(CC)!;
    expect(c.moduleCount).toBe(2);
    expect(c.complete).toBe(true); // both modules satisfied via the course-level items
    expect(c.incompleteReasons).toHaveLength(0);
    expect(c.modules.every((m) => m.complete)).toBe(true);
  });

  it("evaluates many courses in one batched pass", async () => {
    if (!hasDb) return;
    const map = await loadCourseCompleteness(allCourses.map((id) => ({ id, status: "published" })));
    expect(map.get(CA)?.complete).toBe(true);
    expect(map.get(CB)?.complete).toBe(false);
    expect(map.get(CC)?.complete).toBe(true);
  });
});
