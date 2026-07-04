import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import type { Express } from "express";

/**
 * DB-backed proof for the two public demo-capture endpoints added alongside the
 * existing anonymous reading-demo logger:
 *
 *   POST /api/demo/curriculum-sessions  -- anonymous usage counting
 *   POST /api/demo/leads                -- opt-in lead capture (name/email/org)
 *
 * Both are unauthenticated and internet-reachable, so the security-relevant
 * branches are locked in here: Zod rejection (400), the lead honeypot (silent
 * 201 with NO row persisted), and the happy path (201 + a real row written with
 * the expected tenant-neutral shape). A regression that drops validation, the
 * honeypot, or persistence fails this test.
 *
 * The test imports `app` (not the server entrypoint), so the startup seed does
 * not run. Rows are created under unique markers and removed afterwards.
 */

const SUFFIX = `democap-${Date.now()}`;

let app: Express;
let dbMod: typeof import("@workspace/compass-db");

// Rows created during the suite, cleaned up in afterAll.
const createdSessionIds: number[] = [];
const createdSubmissionIds: number[] = [];
// A unique email used by the honeypot case to prove nothing was persisted.
const honeypotEmail = `honeypot-${SUFFIX}@demo.test`;
const leadEmail = `lead-${SUFFIX}@demo.test`;

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "test-only-secret";
  dbMod = await import("@workspace/compass-db");
  app = (await import("../app")).default;
}, 30000);

afterAll(async () => {
  const { db, curriculumDemoSessionsTable, contactSubmissionsTable } = dbMod;
  const steps: Array<[string, () => Promise<unknown>]> = [
    [
      "curriculum-sessions",
      () =>
        createdSessionIds.length > 0
          ? db
              .delete(curriculumDemoSessionsTable)
              .where(inArray(curriculumDemoSessionsTable.id, createdSessionIds))
          : Promise.resolve(),
    ],
    [
      "contact-submissions",
      () =>
        createdSubmissionIds.length > 0
          ? db
              .delete(contactSubmissionsTable)
              .where(inArray(contactSubmissionsTable.id, createdSubmissionIds))
          : Promise.resolve(),
    ],
    // Defensive: remove any lead/honeypot rows by their unique emails in case an
    // assertion failed before the id was captured.
    [
      "lead-by-email",
      () =>
        db
          .delete(contactSubmissionsTable)
          .where(eq(contactSubmissionsTable.email, leadEmail)),
    ],
    [
      "honeypot-by-email",
      () =>
        db
          .delete(contactSubmissionsTable)
          .where(eq(contactSubmissionsTable.email, honeypotEmail)),
    ],
  ];
  for (const [name, run] of steps) {
    try {
      await run();
    } catch (err) {
      // Surface, do not fail: unique markers mean leftovers cannot collide.
      console.error(`demo-capture teardown step "${name}" failed`, err);
    }
  }
});

describe("POST /api/demo/curriculum-sessions", () => {
  it("persists an anonymous run and returns 201", async () => {
    const res = await request(app)
      .post("/api/demo/curriculum-sessions")
      .send({
        courseTitle: "Test Course",
        gradeBand: "6-8",
        objectiveCount: 4,
        assessmentCount: 3,
        qaScore: 82,
        stageReached: "qa",
      });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.id).toBe("number");
    createdSessionIds.push(res.body.id);

    const { db, curriculumDemoSessionsTable } = dbMod;
    const rows = await db
      .select()
      .from(curriculumDemoSessionsTable)
      .where(eq(curriculumDemoSessionsTable.id, res.body.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].stageReached).toBe("qa");
    expect(rows[0].qaScore).toBe(82);
  });

  it("rejects an invalid stage with 400", async () => {
    const res = await request(app)
      .post("/api/demo/curriculum-sessions")
      .send({
        objectiveCount: 4,
        assessmentCount: 3,
        qaScore: 82,
        stageReached: "not-a-stage",
      });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/demo/leads", () => {
  it("persists an opt-in lead and returns 201", async () => {
    const res = await request(app)
      .post("/api/demo/leads")
      .send({
        name: "Lead Person",
        email: leadEmail,
        organization: "Lead Org",
        demo: "curriculum",
        summary: "Course: Test\nQA score: 82%",
      });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.id).toBe("number");
    createdSubmissionIds.push(res.body.id);

    const { db, contactSubmissionsTable } = dbMod;
    const rows = await db
      .select()
      .from(contactSubmissionsTable)
      .where(eq(contactSubmissionsTable.id, res.body.id));
    expect(rows).toHaveLength(1);
    // Email is normalized and the source records the originating demo.
    expect(rows[0].email).toBe(leadEmail);
    expect(rows[0].source).toBe("demo-curriculum");
  });

  it("accepts a honeypot hit silently and persists nothing", async () => {
    const res = await request(app)
      .post("/api/demo/leads")
      .send({
        name: "Bot",
        email: honeypotEmail,
        demo: "reading",
        website: "http://spam.example",
      });
    // Silent accept: 201 but no id, because no row is written.
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.id).toBeUndefined();

    const { db, contactSubmissionsTable } = dbMod;
    const rows = await db
      .select()
      .from(contactSubmissionsTable)
      .where(eq(contactSubmissionsTable.email, honeypotEmail));
    expect(rows).toHaveLength(0);
  });

  it("rejects a malformed email with 400", async () => {
    const res = await request(app)
      .post("/api/demo/leads")
      .send({ name: "Bad Email", email: "not-an-email", demo: "reading" });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown demo with 400", async () => {
    const res = await request(app)
      .post("/api/demo/leads")
      .send({ name: "Bad Demo", email: `enum-${SUFFIX}@demo.test`, demo: "nope" });
    expect(res.status).toBe(400);
  });
});
