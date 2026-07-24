import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { sql, eq, inArray } from "drizzle-orm";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Session pacing lifecycle (adaptive coach goal): the learner chooses an interaction limit before
 * they start, that limit is a HARD cap, and when it is reached the session ends and an end-of-session
 * analysis is produced. Also covers the setup gate (PATCH /plan) clamping and its "before you start"
 * guard. Anthropic is mocked so the coach turns, grading and analysis are deterministic and offline.
 *
 * DB-backed; boots the real app over HTTP. Skips cleanly with no database.
 */

// The coach's streamed reply.
function makeStream(text: string) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: "content_block_delta", delta: { type: "text_delta", text } };
    },
  };
}
// One combined JSON blob that satisfies every non-streaming consumer (grader reads .grade, options
// reads .mode, analysis reads .summary/.strengths/.focusAreas/.recommendation).
const combined = JSON.stringify({
  grade: 3,
  reasoning: "clear, applied reasoning",
  mode: "free",
  options: [],
  summary: "You reasoned well across the session.",
  strengths: ["Applied the idea", "Built on prior answers"],
  focusAreas: ["Extending to new situations"],
  recommendation: "Move on to the next module and review this soon.",
});
const create = vi.fn(async () => ({ content: [{ type: "text", text: combined }] }));
const streamFn = vi.fn(() => makeStream("That is a good start. What would you weigh up next?"));
vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: { messages: { create: (...a: unknown[]) => create(...a), stream: (...a: unknown[]) => streamFn(...a) } },
}));

const SUFFIX = `sess-${Date.now()}`;
let server: Server;
let base: string;
let dbMod: typeof import("@workspace/db");
let hasDb = false;

const userId = `u-${SUFFIX}`;
const courseId = `c-${SUFFIX}`;
const moduleId = `m-${SUFFIX}`;
const beatId = `b-${SUFFIX}`;
const tok = `tok-${SUFFIX}`;

const H = { "content-type": "application/json", cookie: `praxis_session=${tok}` };

/** POST /respond and drain the SSE stream, returning the final done-event payload. */
async function respond(sessionId: string, text: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${base}/sessions/${sessionId}/respond`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ response: text, beatId, isSelection: false }),
  });
  const body = await res.text();
  let done: Record<string, unknown> = {};
  for (const line of body.split("\n")) {
    if (line.startsWith("data: ")) {
      try {
        const d = JSON.parse(line.slice(6));
        if (d.done) done = d;
      } catch { /* ignore partial */ }
    }
  }
  return done;
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
  const { db, usersTable, authSessionsTable, coursesTable, modulesTable, beatsTable, enrolmentsTable } = dbMod;
  await db.insert(usersTable).values([{ id: userId, email: `${userId}@t.test`, role: "learner", status: "active" }]);
  await db.insert(authSessionsTable).values([{ token: tok, userId, expiresAt: new Date(Date.now() + 3600_000) }]);
  await db.insert(coursesTable).values([{ id: courseId, title: `Course ${SUFFIX}`, tenantId: "t-test", status: "published" }]);
  await db.insert(modulesTable).values([{ id: moduleId, courseId, title: "Module", order: 1, status: "published" }]);
  await db.insert(beatsTable).values([{ id: beatId, moduleId, type: "points", order: 1, title: "Beat", narration: "n" }]);
  await db.insert(enrolmentsTable).values([{ userId, courseId, status: "active" }]);

  const app = (await import("../app")).default;
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!hasDb) return;
  const { db, usersTable, authSessionsTable, coursesTable, modulesTable, beatsTable, enrolmentsTable, sessionsTable, dialogueTurnsTable, conceptMasteryTable, credentialsTable, evidenceRecordsTable } = dbMod;
  const sessions = await db.select({ id: sessionsTable.id }).from(sessionsTable).where(eq(sessionsTable.userId, userId));
  const sids = sessions.map((s) => s.id);
  if (sids.length) await db.delete(dialogueTurnsTable).where(inArray(dialogueTurnsTable.sessionId, sids)).catch(() => {});
  await db.delete(evidenceRecordsTable).where(eq(evidenceRecordsTable.userId, userId)).catch(() => {});
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId)).catch(() => {});
  await db.delete(conceptMasteryTable).where(eq(conceptMasteryTable.userId, userId)).catch(() => {});
  await db.delete(credentialsTable).where(eq(credentialsTable.userId, userId)).catch(() => {});
  await db.delete(enrolmentsTable).where(eq(enrolmentsTable.userId, userId)).catch(() => {});
  await db.delete(beatsTable).where(eq(beatsTable.id, beatId)).catch(() => {});
  await db.delete(modulesTable).where(eq(modulesTable.id, moduleId)).catch(() => {});
  await db.delete(coursesTable).where(eq(coursesTable.id, courseId)).catch(() => {});
  await db.delete(authSessionsTable).where(eq(authSessionsTable.token, tok)).catch(() => {});
  await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
});

async function newSession(plannedInteractions?: number): Promise<string> {
  const res = await fetch(`${base}/sessions`, { method: "POST", headers: H, body: JSON.stringify({ moduleId, plannedInteractions }) });
  const s = await res.json();
  return s.id as string;
}

describe("session pacing lifecycle", () => {
  it("has a database (else skipped)", () => {
    if (!hasDb) console.warn("sessions: no DATABASE_URL, skipping");
    expect(true).toBe(true);
  });

  it("clamps the interaction limit at creation to the allowed range", async () => {
    if (!hasDb) return;
    const id = await newSession(999); // absurdly high -> clamped to the max (20)
    const res = await fetch(`${base}/sessions/${id}`, { headers: H });
    const s = await res.json();
    expect(s.plannedInteractions).toBe(20);
  });

  it("PATCH /plan sets the limit before the learner starts, and clamps it", async () => {
    if (!hasDb) return;
    const id = await newSession(); // no limit yet -> setup gate would run on the client
    const res = await fetch(`${base}/sessions/${id}/plan`, { method: "PATCH", headers: H, body: JSON.stringify({ plannedInteractions: 1 }) });
    expect(res.status).toBe(200);
    const s = await res.json();
    expect(s.plannedInteractions).toBe(3); // 1 -> clamped up to the minimum (3)
  });

  it("enforces the limit as a HARD cap: the session ends with an analysis, and further answers are rejected", async () => {
    if (!hasDb) return;
    const id = await newSession(3);
    const a1 = await respond(id, "A business can be profitable but still run out of cash to pay its suppliers.");
    expect(a1.ended).toBe(false);
    expect(a1.plannedInteractions).toBe(3);
    expect(a1.interactionsUsed).toBe(1);
    expect(typeof a1.difficulty).toBe("number");

    const a2 = await respond(id, "So timing of inflows and outflows is what determines whether it can keep operating.");
    expect(a2.ended).toBe(false);
    expect(a2.interactionsUsed).toBe(2);

    const a3 = await respond(id, "You manage it by forecasting cash, keeping a buffer, and speeding up receivables.");
    expect(a3.ended).toBe(true);
    expect(a3.endedReason).toBe("reached_limit");
    expect(a3.analysis).toBeTruthy();
    expect((a3.analysis as { recommendation?: string }).recommendation).toBeTruthy();
    expect(a3.interactionsUsed).toBe(3);

    // The session is now closed: persisted end-state, and a 4th answer is refused.
    const sres = await fetch(`${base}/sessions/${id}`, { headers: H });
    const s = await sres.json();
    expect(s.completedAt).toBeTruthy();
    expect(s.endedReason).toBe("reached_limit");
    expect(s.analysis).toBeTruthy();

    const late = await fetch(`${base}/sessions/${id}/respond`, { method: "POST", headers: H, body: JSON.stringify({ response: "one more?", beatId }) });
    expect(late.status).toBe(400);

    // The analysis endpoint returns the cached report.
    const ares = await fetch(`${base}/sessions/${id}/analysis`, { headers: H });
    expect(ares.status).toBe(200);
    const aj = await ares.json();
    expect(aj.ready).toBe(true);
    expect(aj.analysis.recommendation).toBeTruthy();
  });

  it("refuses to set a plan once the learner has already answered", async () => {
    if (!hasDb) return;
    const id = await newSession(8);
    await respond(id, "Cash flow is the movement of money in and out, and it can be tight even when profitable.");
    const res = await fetch(`${base}/sessions/${id}/plan`, { method: "PATCH", headers: H, body: JSON.stringify({ plannedInteractions: 5 }) });
    expect(res.status).toBe(400);
  });

  it("does NOT certify early: it runs the full chosen count, then certifies at the end on strong answers", async () => {
    if (!hasDb) return;
    const id = await newSession(5); // 5 measured grade-3 answers reach the 0.8 bar exactly at the end
    const answers = [
      "A website lives on a server, a computer that stays on and is reachable over the internet.",
      "The browser sends a request to that server, which responds with the page's files.",
      "The server finds the right HTML, CSS and images and sends them back to render.",
      "DNS turns the typed address into the server's IP so the request reaches the right machine.",
      "Then the browser assembles the HTML into the page the customer finally sees.",
    ];
    const metas: Record<string, unknown>[] = [];
    for (const a of answers) metas.push(await respond(id, a));

    // Crucially, the session never ended before the final answer - no mastery after one question.
    expect(metas.slice(0, 4).every((m) => m.ended === false)).toBe(true);
    // The mastery meter climbed in measured steps, staying under the bar until near the end.
    expect(Number(metas[0].masteryScore)).toBeLessThan(0.4);
    // The final answer completes the plan AND certifies (session mastery reached the bar).
    const last = metas[4];
    expect(last.ended).toBe(true);
    expect(last.endedReason).toBe("mastered");
    expect(last.mastered).toBe(true);

    const sres = await fetch(`${base}/sessions/${id}`, { headers: H });
    const s = await sres.json();
    expect(s.status).toBe("mastered");
    expect(s.analysis).toBeTruthy();
  });
});
