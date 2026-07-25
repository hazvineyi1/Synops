import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, eq, inArray } from "drizzle-orm";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Course completeness gate at the route layer.
 *  - GET /courses returns ONLY complete + published courses (the catalogue) for a learner.
 *  - GET /courses/incomplete lists the rest with per-module reasons, Hub-only (learner gets 403).
 *  - GET /courses/:id stays reachable for an incomplete course so authors can finish it.
 *  - Authors can still list drafts via ?includeIncomplete=true.
 *
 * DB-backed; boots the real app over HTTP. Skips cleanly with no database.
 */

const SUFFIX = `crt-${Date.now()}`;
let server: Server;
let base: string;
let dbMod: typeof import("@workspace/db");
let hasDb = false;

const learnerId = `learner-${SUFFIX}`;
const hubId = `hub-${SUFFIX}`;
const learnerTok = `ltok-${SUFFIX}`;
const hubTok = `htok-${SUFFIX}`;
const completeCourse = `cc-complete-${SUFFIX}`;
const incompleteCourse = `cc-incomplete-${SUFFIX}`;
const mComplete = `m-complete-${SUFFIX}`;
const mIncomplete = `m-incomplete-${SUFFIX}`;
const courses = [completeCourse, incompleteCourse];
const modules = [mComplete, mIncomplete];

async function api(path: string, tok: string): Promise<Response> {
  return fetch(`${base}${path}`, { headers: { cookie: `praxis_session=${tok}` } });
}

/** Insert a module with all nine components present and published (each keyed to the module). */
async function buildComplete(courseId: string, moduleId: string) {
  const { db, modulesTable, moduleReadingsTable, beatsTable, interactiveActivitiesTable, caseScenariosTable, assignmentsTable, discussionsTable } = dbMod;
  await db.insert(modulesTable).values({ id: moduleId, courseId, title: "Complete module", status: "published", description: "Real description", objectives: ["Understand X"], beatCount: 1 });
  await db.insert(beatsTable).values([
    { id: `${moduleId}-b`, moduleId, type: "points", order: 1, title: "Intro", narration: "n" },
    { id: `${moduleId}-v`, moduleId, type: "video", order: 2, title: "Video", narration: "n", videoUrl: "https://v.test/x.mp4" },
  ]);
  await db.insert(moduleReadingsTable).values({ id: `${moduleId}-r`, moduleId, title: "Reading", published: true });
  await db.insert(interactiveActivitiesTable).values({ id: `${moduleId}-i`, moduleId, title: "Activity", published: true });
  await db.insert(caseScenariosTable).values({ id: `${moduleId}-c`, moduleId, createdBy: hubId, title: "Case", status: "published" });
  await db.insert(assignmentsTable).values({ id: `${moduleId}-a`, courseId, moduleId, title: "Assignment", published: true });
  await db.insert(discussionsTable).values({ id: `${moduleId}-d`, courseId, moduleId, authorId: hubId, title: "Discussion", body: "b" });
}

/** Insert a published module that is missing its video (structure present, video absent). */
async function buildIncomplete(courseId: string, moduleId: string) {
  const { db, modulesTable, moduleReadingsTable, beatsTable, interactiveActivitiesTable, caseScenariosTable, assignmentsTable, discussionsTable } = dbMod;
  await db.insert(modulesTable).values({ id: moduleId, courseId, title: "Half-built module", status: "published", description: "Real description", objectives: ["Understand X"], beatCount: 1 });
  await db.insert(beatsTable).values({ id: `${moduleId}-b`, moduleId, type: "points", order: 1, title: "Intro", narration: "n" }); // no video beat
  await db.insert(moduleReadingsTable).values({ id: `${moduleId}-r`, moduleId, title: "Reading", published: true });
  await db.insert(interactiveActivitiesTable).values({ id: `${moduleId}-i`, moduleId, title: "Activity", published: true });
  await db.insert(caseScenariosTable).values({ id: `${moduleId}-c`, moduleId, createdBy: hubId, title: "Case", status: "published" });
  await db.insert(assignmentsTable).values({ id: `${moduleId}-a`, courseId, moduleId, title: "Assignment", published: true });
  await db.insert(discussionsTable).values({ id: `${moduleId}-d`, courseId, moduleId, authorId: hubId, title: "Discussion", body: "b" });
}

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "test-only-secret-32-chars-minimum-length";
  try {
    dbMod = await import("@workspace/db");
    await dbMod.db.execute(sql`select 1`);
    hasDb = true;
  } catch {
    hasDb = false;
    return;
  }
  const { db, usersTable, authSessionsTable, coursesTable } = dbMod;
  // Learner with no partner/org: their catalogue scope is their own id, so courses they "own"
  // (tenantId == their id) are visible to them - lets us test the catalogue filter in isolation.
  await db.insert(usersTable).values([
    { id: learnerId, email: `${learnerId}@t.test`, role: "learner", status: "active" },
    { id: hubId, email: `${hubId}@t.test`, role: "super_admin", status: "active" },
  ]);
  await db.insert(authSessionsTable).values([
    { token: learnerTok, userId: learnerId, expiresAt: new Date(Date.now() + 3600_000) },
    { token: hubTok, userId: hubId, expiresAt: new Date(Date.now() + 3600_000) },
  ]);
  await db.insert(coursesTable).values([
    { id: completeCourse, title: `Complete ${SUFFIX}`, tenantId: learnerId, status: "published" },
    { id: incompleteCourse, title: `Incomplete ${SUFFIX}`, tenantId: learnerId, status: "published" },
  ]);
  await buildComplete(completeCourse, mComplete);
  await buildIncomplete(incompleteCourse, mIncomplete);

  const app = (await import("../app")).default;
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!hasDb) return;
  const { db, usersTable, authSessionsTable, coursesTable, modulesTable, moduleReadingsTable, beatsTable, interactiveActivitiesTable, caseScenariosTable, assignmentsTable, discussionsTable } = dbMod;
  await db.delete(beatsTable).where(inArray(beatsTable.moduleId, modules)).catch(() => {});
  await db.delete(moduleReadingsTable).where(inArray(moduleReadingsTable.moduleId, modules)).catch(() => {});
  await db.delete(interactiveActivitiesTable).where(inArray(interactiveActivitiesTable.moduleId, modules)).catch(() => {});
  await db.delete(caseScenariosTable).where(inArray(caseScenariosTable.moduleId, modules)).catch(() => {});
  await db.delete(assignmentsTable).where(inArray(assignmentsTable.courseId, courses)).catch(() => {});
  await db.delete(discussionsTable).where(inArray(discussionsTable.courseId, courses)).catch(() => {});
  await db.delete(modulesTable).where(inArray(modulesTable.courseId, courses)).catch(() => {});
  await db.delete(coursesTable).where(inArray(coursesTable.id, courses)).catch(() => {});
  await db.delete(authSessionsTable).where(inArray(authSessionsTable.token, [learnerTok, hubTok])).catch(() => {});
  await db.delete(usersTable).where(inArray(usersTable.id, [learnerId, hubId])).catch(() => {});
});

describe("course completeness gate (routes)", () => {
  it("has a database (else skipped)", () => {
    if (!hasDb) console.warn("courses route: no DATABASE_URL, skipping");
    expect(true).toBe(true);
  });

  it("GET /courses returns ONLY the complete course to a learner", async () => {
    if (!hasDb) return;
    const res = await api("/courses", learnerTok);
    expect(res.status).toBe(200);
    const list = (await res.json()) as { id: string; complete: boolean }[];
    const ids = list.map((c) => c.id);
    expect(ids).toContain(completeCourse);
    expect(ids).not.toContain(incompleteCourse);
    expect(list.find((c) => c.id === completeCourse)?.complete).toBe(true);
  });

  it("GET /courses/incomplete lists the incomplete course with the exact missing component, for a Hub user", async () => {
    if (!hasDb) return;
    const res = await api("/courses/incomplete", hubTok);
    expect(res.status).toBe(200);
    const list = (await res.json()) as { id: string; incompleteReasons: { missing: string[] }[] }[];
    const row = list.find((c) => c.id === incompleteCourse);
    expect(row).toBeTruthy();
    // The complete course must NOT be in the incomplete repository.
    expect(list.find((c) => c.id === completeCourse)).toBeFalsy();
    const missing = row!.incompleteReasons.flatMap((r) => r.missing).join(" ");
    expect(missing).toMatch(/video/i);
  });

  it("GET /courses/incomplete is forbidden for a learner", async () => {
    if (!hasDb) return;
    const res = await api("/courses/incomplete", learnerTok);
    expect(res.status).toBe(403);
  });

  it("keeps GET /courses/:id reachable for an incomplete course (authors can open it to finish)", async () => {
    if (!hasDb) return;
    const res = await api(`/courses/${incompleteCourse}`, learnerTok);
    expect(res.status).toBe(200);
    const c = (await res.json()) as { id: string; complete: boolean };
    expect(c.id).toBe(incompleteCourse);
    expect(c.complete).toBe(false);
  });

  it("lets an author opt in to incomplete courses via ?includeIncomplete=true", async () => {
    if (!hasDb) return;
    const res = await api("/courses?includeIncomplete=true", hubTok);
    const ids = ((await res.json()) as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(completeCourse);
    expect(ids).toContain(incompleteCourse);
  });
});
