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
 * Set up one scenario: a published module and a session seeded with a SESSION-LOCAL mastery, turnCount
 * and createdAt. A high conceptMastery is ALSO seeded to prove certification never rides on carried-over
 * per-concept score - only the session's own mastery counts. Returns the session row.
 */
async function scenario(key: string, opts: { sessionMastery: string; turnCount: number; ageMs: number; plannedInteractions?: number | null }) {
  const { db, modulesTable, conceptMasteryTable, sessionsTable } = dbMod;
  const moduleId = `m-${key}-${SUFFIX}`;
  await db.insert(modulesTable).values({ id: moduleId, courseId, title: `Module ${key}`, order: 1, status: "published" });
  // Deliberately HIGH carried-over per-concept score. It must not leak into session certification.
  await db.insert(conceptMasteryTable).values({ userId, moduleId, moduleTitle: `Module ${key}`, courseId, mastery: "0.9500" });
  await db.insert(sessionsTable).values({
    id: `s-${key}-${SUFFIX}`, moduleId, userId, status: "active",
    masteryScore: opts.sessionMastery, turnCount: opts.turnCount,
    plannedInteractions: opts.plannedInteractions ?? null,
    createdAt: new Date(Date.now() - opts.ageMs),
  });
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, `s-${key}-${SUFFIX}`));
  return { session, moduleId };
}

async function run(session: typeof dbMod.sessionsTable.$inferSelect, pacing?: { hasLimit: boolean; isFinalInteraction: boolean }) {
  return mastery.applyCheckpoint({
    userId,
    session,
    socraticCtx: { turnCount: Number(session.turnCount) },
    learnerResponse: "Here is my reasoning in full.",
    historyOrdered: [],
    tutorReply: "Understood.",
    pacing,
  });
}

describe("mastery certification pacing", () => {
  it("has a database (else skipped)", () => {
    if (!hasDb) console.warn("masteryPacing: no DATABASE_URL, skipping");
    expect(true).toBe(true);
  });

  it("session mastery is SESSION-LOCAL: a fresh session's first answer moves it a measured step, never near-full from carried-over score", async () => {
    if (!hasDb) return;
    // Session starts at 0, conceptMastery seeded at 0.95. One strong answer must land ~0.16, not ~0.95.
    const { session } = await scenario("local", { sessionMastery: "0", turnCount: 1, ageMs: 0 });
    const res = await run(session);
    expect(res.newMastery).toBeLessThanOrEqual(mastery.MASTERY_THRESHOLD - 0.4); // nowhere near the bar
    expect(res.newMastery).toBeGreaterThan(0); // but it did climb
    expect(res.mastered).toBe(false);
  });

  describe("no-limit (legacy / WhatsApp) sessions use the pacing floor", () => {
    it("does NOT certify below the floor, though the session score still climbs", async () => {
      if (!hasDb) return;
      const { db, sessionsTable, credentialsTable } = dbMod;
      // Session score already near the bar, but turnCount 0 -> 1 exchange (< MIN) and fresh (< MIN time).
      const { session, moduleId } = await scenario("below", { sessionMastery: "0.7000", turnCount: 0, ageMs: 0 });
      const res = await run(session);
      expect(res.newMastery).toBeGreaterThanOrEqual(0.8); // the score crosses the bar this turn
      expect(res.mastered).toBe(false); // ...but pacing holds certification
      const [s] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, session.id));
      expect(s.status).toBe("active");
      expect(s.completedAt).toBeNull();
      const creds = await db.select().from(credentialsTable).where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.moduleId, moduleId)));
      expect(creds).toHaveLength(0);
    });

    it("does NOT certify when exchanges are met but elapsed time is not", async () => {
      if (!hasDb) return;
      const { db, credentialsTable } = dbMod;
      const { session, moduleId } = await scenario("time", { sessionMastery: "0.7000", turnCount: 10, ageMs: 0 });
      const res = await run(session);
      expect(res.mastered).toBe(false);
      const creds = await db.select().from(credentialsTable).where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.moduleId, moduleId)));
      expect(creds).toHaveLength(0);
    });

    it("certifies once BOTH floor conditions are met", async () => {
      if (!hasDb) return;
      const { db, sessionsTable, credentialsTable } = dbMod;
      const { session, moduleId } = await scenario("above", { sessionMastery: "0.7000", turnCount: 10, ageMs: mastery.MIN_MASTERY_SESSION_MS + 60_000 });
      const res = await run(session);
      expect(res.mastered).toBe(true);
      const [s] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, session.id));
      expect(s.status).toBe("mastered");
      expect(s.completedAt).not.toBeNull();
      const creds = await db.select().from(credentialsTable).where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.moduleId, moduleId), eq(credentialsTable.status, "valid")));
      expect(creds).toHaveLength(1);
    });
  });

  describe("limited (learner-chosen count) sessions certify only at the end", () => {
    it("does NOT certify mid-session even when the session score is over the bar", async () => {
      if (!hasDb) return;
      const { db, sessionsTable, credentialsTable } = dbMod;
      // Score already over the bar, but this is NOT the final interaction of the chosen plan.
      const { session, moduleId } = await scenario("mid", { sessionMastery: "0.8000", turnCount: 6, ageMs: 60_000, plannedInteractions: 8 });
      const res = await run(session, { hasLimit: true, isFinalInteraction: false });
      expect(res.mastered).toBe(false);
      const [s] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, session.id));
      expect(s.status).toBe("active");
      expect(s.completedAt).toBeNull();
      const creds = await db.select().from(credentialsTable).where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.moduleId, moduleId)));
      expect(creds).toHaveLength(0);
    });

    it("certifies on the final interaction when the session mastery reached the bar", async () => {
      if (!hasDb) return;
      const { db, sessionsTable, credentialsTable } = dbMod;
      const { session, moduleId } = await scenario("final", { sessionMastery: "0.7000", turnCount: 8, ageMs: 60_000, plannedInteractions: 5 });
      const res = await run(session, { hasLimit: true, isFinalInteraction: true });
      expect(res.mastered).toBe(true);
      const [s] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, session.id));
      expect(s.status).toBe("mastered");
      const creds = await db.select().from(credentialsTable).where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.moduleId, moduleId), eq(credentialsTable.status, "valid")));
      expect(creds).toHaveLength(1);
    });

    it("does NOT certify on the final interaction if the session mastery fell short", async () => {
      if (!hasDb) return;
      const { db, credentialsTable } = dbMod;
      // Only reached ~0.48 across the session; the final answer cannot alone carry it to the bar.
      const { session, moduleId } = await scenario("short", { sessionMastery: "0.4000", turnCount: 8, ageMs: 60_000, plannedInteractions: 5 });
      const res = await run(session, { hasLimit: true, isFinalInteraction: true });
      expect(res.mastered).toBe(false);
      const creds = await db.select().from(credentialsTable).where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.moduleId, moduleId)));
      expect(creds).toHaveLength(0);
    });
  });

  it("exposes the floor constants as clear named values", () => {
    if (!hasDb) return;
    expect(mastery.MIN_MASTERY_EXCHANGES).toBeGreaterThanOrEqual(1);
    expect(mastery.MIN_MASTERY_SESSION_MS).toBeGreaterThan(0);
  });
});
