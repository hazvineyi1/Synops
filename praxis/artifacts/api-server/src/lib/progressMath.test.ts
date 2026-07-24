import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, eq, inArray } from "drizzle-orm";
import { courseProgress, certifiedModuleIds, maybeCompleteEnrolment } from "./progressMath";

/**
 * Progress math when a module is completed via the Socratic coach (fix 1 - PROGRESS SYNC).
 *
 * The coach path writes a VALID credential but never writes beat_progress. Before this fix a module
 * mastered through the coach read 0% everywhere. These tests prove that a certified module's beats
 * count as fully done in courseProgress, that content-viewed and coach-mastered modules BOTH count
 * (either satisfies), that a certified module with no beats is neither counted nor penalised, and
 * that maybeCompleteEnrolment fires off credential-driven 100%.
 *
 * DB-backed; skips cleanly when there is no database.
 */

const SUFFIX = `pm-${Date.now()}`;
let dbMod: typeof import("@workspace/db");
let hasDb = false;

const userId = `u-${SUFFIX}`;
const courseId = `c-${SUFFIX}`;
// modA: content viewed. modB: mastered via coach (credential, no beats viewed). modZ: certified, 0 beats.
const modA = `mA-${SUFFIX}`;
const modB = `mB-${SUFFIX}`;
const modZ = `mZ-${SUFFIX}`;

beforeAll(async () => {
  try {
    dbMod = await import("@workspace/db");
    await dbMod.db.execute(sql`select 1`);
    hasDb = true;
  } catch {
    hasDb = false;
    return;
  }
  const { db, usersTable, coursesTable, modulesTable, beatsTable, beatProgressTable, credentialsTable, enrolmentsTable } = dbMod;

  await db.insert(usersTable).values([{ id: userId, email: `${userId}@t.test`, role: "learner", status: "active" }]);
  await db.insert(coursesTable).values([{ id: courseId, title: `Course ${SUFFIX}`, tenantId: "t-test", status: "published" }]);
  await db.insert(modulesTable).values([
    { id: modA, courseId, title: "Content module", order: 1, status: "published" },
    { id: modB, courseId, title: "Coach-mastered module", order: 2, status: "published" },
    { id: modZ, courseId, title: "Zero-beat mastered module", order: 3, status: "published" },
  ]);
  // modA has 2 beats, modB has 2 beats, modZ has none.
  await db.insert(beatsTable).values([
    { id: `${modA}-b1`, moduleId: modA, type: "points", order: 1, title: "A1", narration: "n" },
    { id: `${modA}-b2`, moduleId: modA, type: "points", order: 2, title: "A2", narration: "n" },
    { id: `${modB}-b1`, moduleId: modB, type: "points", order: 1, title: "B1", narration: "n" },
    { id: `${modB}-b2`, moduleId: modB, type: "points", order: 2, title: "B2", narration: "n" },
  ]);
  await db.insert(enrolmentsTable).values([{ userId, courseId, status: "active" }]);
});

afterAll(async () => {
  if (!hasDb) return;
  const { db, usersTable, coursesTable, modulesTable, beatsTable, beatProgressTable, credentialsTable, enrolmentsTable } = dbMod;
  await db.delete(beatProgressTable).where(eq(beatProgressTable.userId, userId)).catch(() => {});
  await db.delete(credentialsTable).where(eq(credentialsTable.userId, userId)).catch(() => {});
  await db.delete(enrolmentsTable).where(eq(enrolmentsTable.userId, userId)).catch(() => {});
  await db.delete(beatsTable).where(inArray(beatsTable.moduleId, [modA, modB, modZ])).catch(() => {});
  await db.delete(modulesTable).where(inArray(modulesTable.id, [modA, modB, modZ])).catch(() => {});
  await db.delete(coursesTable).where(eq(coursesTable.id, courseId)).catch(() => {});
  await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
});

describe("progress math: credential counts as module completion", () => {
  it("has a database (else skipped)", () => {
    if (!hasDb) console.warn("progressMath: no DATABASE_URL, skipping");
    expect(true).toBe(true);
  });

  it("counts only viewed beats before any credential is issued", async () => {
    if (!hasDb) return;
    const { db, beatProgressTable } = dbMod;
    // View both beats of modA only. Total published beats across A+B = 4, so this is 50%.
    await db.insert(beatProgressTable).values([
      { userId, beatId: `${modA}-b1`, moduleId: modA, courseId },
      { userId, beatId: `${modA}-b2`, moduleId: modA, courseId },
    ]);
    const p = await courseProgress(userId, courseId);
    expect(p.totalBeats).toBe(4);
    expect(p.viewedBeats).toBe(2);
    expect(p.percent).toBe(50);
  });

  it("counts a coach-mastered module's beats as done, reaching 100% with no beat_progress for it", async () => {
    if (!hasDb) return;
    const { db, credentialsTable } = dbMod;
    // Master modB via the coach: a valid credential, NO beat_progress rows for its beats.
    await db.insert(credentialsTable).values({
      userId, moduleId: modB, moduleTitle: "Coach-mastered module", partnerId: "platform",
      partnerName: "Synops Praxis", masteryScore: "0.8500", decayDate: new Date(Date.now() + 3600_000), status: "valid",
    });
    const p = await courseProgress(userId, courseId);
    // modA (2 viewed) + modB (2 beats, certified) = 4/4 = 100%, even though modB was never opened.
    expect(p.viewedBeats).toBe(4);
    expect(p.totalBeats).toBe(4);
    expect(p.percent).toBe(100);
  });

  it("groups certified modules by course via certifiedModuleIds", async () => {
    if (!hasDb) return;
    const byCourse = await certifiedModuleIds(userId);
    expect(byCourse.get(courseId)?.has(modB)).toBe(true);
    expect(byCourse.get(courseId)?.has(modA)).toBe(false);
  });

  it("neither counts nor penalises a certified module that has zero beats", async () => {
    if (!hasDb) return;
    const { db, credentialsTable } = dbMod;
    // Certify modZ (0 beats). It must not add to the denominator (would drop below 100%) nor break math.
    await db.insert(credentialsTable).values({
      userId, moduleId: modZ, moduleTitle: "Zero-beat mastered module", partnerId: "platform",
      partnerName: "Synops Praxis", masteryScore: "0.9000", decayDate: new Date(Date.now() + 3600_000), status: "valid",
    });
    const p = await courseProgress(userId, courseId);
    expect(p.totalBeats).toBe(4); // modZ contributes no beats
    expect(p.percent).toBe(100);
  });

  it("maybeCompleteEnrolment flips an active enrolment to completed at credential-driven 100%", async () => {
    if (!hasDb) return;
    const { db, enrolmentsTable } = dbMod;
    await maybeCompleteEnrolment(userId, courseId);
    const [row] = await db.select().from(enrolmentsTable).where(eq(enrolmentsTable.userId, userId));
    expect(row.status).toBe("completed");
    expect(row.completedAt).not.toBeNull();
  });
});
