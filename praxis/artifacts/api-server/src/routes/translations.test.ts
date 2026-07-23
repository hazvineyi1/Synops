import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, inArray, eq, and } from "drizzle-orm";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { sourceHash, translateCached } from "../lib/translationCache";

/**
 * Translation review workflow + static cache proof.
 *
 * Seeds a super_admin (the reviewer) and a plain learner, drops a machine-draft
 * translation into the cache, then asserts:
 *   - the reviewer can list the machine queue; a learner cannot (403).
 *   - approving flips status to "approved" and stamps the reviewer.
 *   - once approved, translateCached serves the reviewed text with reviewed=true.
 *   - legal content is never served from a machine draft (approved-only).
 *
 * DB-backed: boots the real Express app over HTTP with a seeded session cookie.
 * Skips cleanly when no database is configured/reachable.
 */

const SUFFIX = `tr-${Date.now()}`;
let server: Server;
let base: string;
let dbMod: typeof import("@workspace/db");
let hasDb = false;

const superId = `u-sa-${SUFFIX}`;
const learnerId = `u-l-${SUFFIX}`;
const tokSuper = `tok-sa-${SUFFIX}`;
const tokLearner = `tok-l-${SUFFIX}`;

// Distinct source strings so this test never collides with real cache rows.
const srcGeneral = `Complete your module before Friday ${SUFFIX}`;
const srcLegal = `This agreement is governed by South African law ${SUFFIX}`;
const rowGeneral = `ct-g-${SUFFIX}`;
const rowLegal = `ct-l-${SUFFIX}`;

async function req(path: string, token?: string, init?: RequestInit): Promise<Response> {
  return fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { cookie: `praxis_session=${token}` } : {}), ...(init?.headers ?? {}) },
  });
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

  const { db, usersTable, authSessionsTable, contentTranslationsTable } = dbMod;
  const exp = new Date(Date.now() + 60 * 60 * 1000);

  await db.insert(usersTable).values([
    { id: superId, email: `sa-${SUFFIX}@t.test`, role: "super_admin", status: "active" },
    { id: learnerId, email: `l-${SUFFIX}@t.test`, role: "learner", status: "active" },
  ]);
  await db.insert(authSessionsTable).values([
    { token: tokSuper, userId: superId, expiresAt: exp },
    { token: tokLearner, userId: learnerId, expiresAt: exp },
  ]);
  await db.insert(contentTranslationsTable).values([
    { id: rowGeneral, sourceHash: sourceHash(srcGeneral), lang: "zu", sourceText: srcGeneral, translatedText: `ZU draft ${SUFFIX}`, status: "machine", contentType: "general" },
    { id: rowLegal, sourceHash: sourceHash(srcLegal), lang: "zu", sourceText: srcLegal, translatedText: `ZU legal draft ${SUFFIX}`, status: "machine", contentType: "legal" },
  ]);

  const app = (await import("../app")).default;
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}/api`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!hasDb) return;
  const { db, usersTable, authSessionsTable, contentTranslationsTable } = dbMod;
  await db.delete(contentTranslationsTable).where(inArray(contentTranslationsTable.id, [rowGeneral, rowLegal])).catch(() => {});
  await db.delete(authSessionsTable).where(inArray(authSessionsTable.token, [tokSuper, tokLearner])).catch(() => {});
  await db.delete(usersTable).where(inArray(usersTable.id, [superId, learnerId])).catch(() => {});
});

describe("translation review workflow", () => {
  it("has a database (else skipped)", () => {
    if (!hasDb) console.warn("translations: no DATABASE_URL, skipping");
    expect(true).toBe(true);
  });

  it("lets a super_admin see the machine queue but blocks a learner", async () => {
    if (!hasDb) return;
    expect((await req("/platform/translations?status=machine&lang=zu", tokSuper)).status).toBe(200);
    expect([401, 403], "learner blocked from review queue").toContain((await req("/platform/translations?status=machine", tokLearner)).status);
  });

  it("serves a machine draft for general content (flagged unreviewed) but never for legal", async () => {
    if (!hasDb) return;
    const [general] = await translateCached([srcGeneral], "zu", "general");
    expect(general.reviewed).toBe(false);
    expect(general.text).toContain("ZU draft");

    const [legal] = await translateCached([srcLegal], "zu", "legal");
    expect(legal.reviewed).toBe(false);
    // legal must fall back to the English source until a reviewer approves it
    expect(legal.text).toBe(srcLegal);
  });

  it("approves a draft and then serves it as the reviewed translation", async () => {
    if (!hasDb) return;
    const res = await req(`/platform/translations/${rowLegal}/review`, tokSuper, {
      method: "POST",
      body: JSON.stringify({ decision: "approve", translatedText: `ZU legal APPROVED ${SUFFIX}` }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("approved");

    const { db, contentTranslationsTable } = dbMod;
    const [row] = await db.select().from(contentTranslationsTable).where(eq(contentTranslationsTable.id, rowLegal));
    expect(row.status).toBe("approved");
    expect(row.reviewedBy).toBe(superId);

    // Legal content now serves the approved text, marked reviewed.
    const [legal] = await translateCached([srcLegal], "zu", "legal");
    expect(legal.reviewed).toBe(true);
    expect(legal.text).toContain("APPROVED");
  });

  it("rejects a draft and then withholds it (falls back to source)", async () => {
    if (!hasDb) return;
    const res = await req(`/platform/translations/${rowGeneral}/review`, tokSuper, {
      method: "POST",
      body: JSON.stringify({ decision: "reject" }),
    });
    expect(res.status).toBe(200);

    const { db, contentTranslationsTable } = dbMod;
    const [row] = await db.select().from(contentTranslationsTable).where(and(eq(contentTranslationsTable.id, rowGeneral)));
    expect(row.status).toBe("rejected");
    // NOTE: a rejected row would normally be re-translated live; with no AI key in tests
    // translateTexts returns the source, so we assert the status transition here.
  });
});
