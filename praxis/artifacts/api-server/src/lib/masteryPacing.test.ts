import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { sql, eq, and, inArray } from "drizzle-orm";

/**
 * Pacing floor on certification (fix 3 - MASTERY TOO FAST).
 *
 * applyCheckpoint used to certify (set the session "mastered" and issue a credential) the instant the
 * score crossed 0.8 on a solid turn, with no minimum engagement. A learner could be certified in
 * seconds off two lucky answers. The floor requires BOTH a minimum number of learner exchanges AND a
 * minimum elapsed session time before certifying. Below the floor the mastery meter still climbs
 * (real SM-2 progress) but the session stays active and no credential is issued.
 *
 * gradeCheckpoint (a network call) is mocked to a grade-3 result so we test the pacing gate in
 * isolation. Concept mastery is pre-seeded near the bar so one grade-3 turn clears 0.8. DB-backed;
 * skips cleanly when there is no database.
 */

vi.mock("./socraticEngine", () => ({
  gradeCheckpoint: vi.fn(async () => ({ grade: 3, reasoning: "Strong, complete reasoning." })),
}));

const SUFFIX = `pace-${Date.now()}`;
let dbMod: typeof import("@workspace/db");
let mastery: typeof import("./mastery");
let hasDb = false;

const userId = `u-${SUFFIX}`;
const courseId = `c-${SUFFIX}`;

beforeAll(async () => {
  try {
    dbMod = await import("@workspace/db");
    await dbMod.db.execute(sql`select 1`);
    hasDb = true;
  } catch {
    hasDb = false;
    return;
  }
  mastery = await import("./mastery");
  const { db, usersTable, coursesTable, modulesTable } = dbMod;
  await db.insert(usersTable).values([{ id: userId, email: `${userId}@t.test`, role: "learner", status: "active" }]);
  await db.insert(coursesTable).values([{ id: courseId, title: `Course ${SUFFIX}`, tenantId: "t-test", status: "published" }]);
});

afterAll(async () => {
  if (!hasDb) return;
  const { db, usersTable, coursesTable, modulesTable, sessionsTable, conceptMasteryTable, credentialsTable, evidenceRecordsTable } = dbMod;
  await db.delete(evidenceRecordsTable).where(eq(evidenceRecordsTable.userId, userId)).catch(() => {});
  await db.delete(credentialsTable).where(eq(credentialsTable.userId, userId)).catch(() => {});
  await db.delete(conceptMasteryTable).where(eq(conceptMasteryTable.userId, userId)).catch(() => {});
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId)).catch(() => {});
  await db.delete(modulesTable).where(eq(modulesTable.courseId, courseId)).catch(() => {});
  await db.delete(coursesTable).where(eq(coursesTable.id, courseId)).catch(() => {});
  await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
});

/**
 * Set up one scenario: a published module, a concept-mastery row seeded near the bar (0.7 -> a single
 * grade-3 turn lands 0.85), and a session with the given turnCount + createdAt. Returns the session row.
 */
async function scenario(key: string, turnCount: number, ageMs: number) {
  const { db, modulesTable, conceptMasteryTable, sessionsTable } = dbMod;
  const moduleId = `m-${key}-${SUFFIX}`;
  await db.insert(modulesTable).values({ id: moduleId, courseId, title: `Module ${key}`, order: 1, status: "published" });
  await db.insert(conceptMasteryTable).values({ userId, moduleId, moduleTitle: `Module ${key}`, courseId, mastery: "0.7000" });
  await db.insert(sessionsTable).values({
    id: `s-${key}-${SUFFIX}`, moduleId, userId, status: "active", turnCount,
    createdAt: new Date(Date.now() - ageMs),
  });
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, `s-${key}-${SUFFIX}`));
  return { session, moduleId };
}

async function run(session: typeof dbMod.sessionsTable.$inferSelect) {
  return mastery.applyCheckpoint({
    userId,
    session,
    socraticCtx: { turnCount: Number(session.turnCount) },
    learnerResponse: "Here is my reasoning in full.",
    historyOrdered: [],
    tutorReply: "Understood.",
  });
}

describe("mastery pacing floor", () => {
  it("has a database (else skipped)", () => {
    if (!hasDb) console.warn("masteryPacing: no DATABASE_URL, skipping");
    expect(true).toBe(true);
  });

  it("does NOT certify below the floor, but the mastery score still climbs", async () => {
    if (!hasDb) return;
    const { db, sessionsTable, conceptMasteryTable, credentialsTable } = dbMod;
    // turnCount 0 -> 1 exchange (< MIN), createdAt now -> ~0ms elapsed (< MIN). Both fail.
    const { session, moduleId } = await scenario("below", 0, 0);
    const res = await run(session);

    expect(res.newMastery).toBeGreaterThanOrEqual(0.8); // score reached the bar
    expect(res.mastered).toBe(false); // ...but pacing floor holds certification

    const [s] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, session.id));
    expect(s.status).toBe("active");
    expect(s.completedAt).toBeNull();

    // Mastery score is still persisted (climbs) even though not certified.
    const [cm] = await db.select().from(conceptMasteryTable).where(and(eq(conceptMasteryTable.userId, userId), eq(conceptMasteryTable.moduleId, moduleId)));
    expect(Number(cm.mastery)).toBeGreaterThanOrEqual(0.8);

    // No credential issued.
    const creds = await db.select().from(credentialsTable).where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.moduleId, moduleId)));
    expect(creds).toHaveLength(0);
  });

  it("does NOT certify when exchanges are met but elapsed time is not", async () => {
    if (!hasDb) return;
    const { db, sessionsTable, credentialsTable } = dbMod;
    // Enough exchanges (turnCount 10 -> 6), but session is brand new (elapsed < MIN).
    const { session, moduleId } = await scenario("time", 10, 0);
    const res = await run(session);
    expect(res.mastered).toBe(false);
    const [s] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, session.id));
    expect(s.status).toBe("active");
    const creds = await db.select().from(credentialsTable).where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.moduleId, moduleId)));
    expect(creds).toHaveLength(0);
  });

  it("does NOT certify when time is met but exchanges are not", async () => {
    if (!hasDb) return;
    const { db, credentialsTable } = dbMod;
    // Old enough session, but only 1 exchange (turnCount 0 -> 1 < MIN).
    const { session, moduleId } = await scenario("fewturns", 0, mastery.MIN_MASTERY_SESSION_MS + 60_000);
    const res = await run(session);
    expect(res.mastered).toBe(false);
    const creds = await db.select().from(credentialsTable).where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.moduleId, moduleId)));
    expect(creds).toHaveLength(0);
  });

  it("certifies and issues a credential once BOTH floor conditions are met", async () => {
    if (!hasDb) return;
    const { db, sessionsTable, credentialsTable } = dbMod;
    // turnCount 10 -> 6 exchanges (>= MIN), session old enough (elapsed >= MIN).
    const { session, moduleId } = await scenario("above", 10, mastery.MIN_MASTERY_SESSION_MS + 60_000);
    const res = await run(session);

    expect(res.mastered).toBe(true);
    const [s] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, session.id));
    expect(s.status).toBe("mastered");
    expect(s.completedAt).not.toBeNull();

    const creds = await db.select().from(credentialsTable).where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.moduleId, moduleId), eq(credentialsTable.status, "valid")));
    expect(creds).toHaveLength(1);
  });

  it("exposes the floor constants as clear named values", () => {
    expect(mastery.MIN_MASTERY_EXCHANGES).toBeGreaterThanOrEqual(1);
    expect(mastery.MIN_MASTERY_SESSION_MS).toBeGreaterThan(0);
  });
});
