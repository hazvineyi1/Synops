import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, and, eq, inArray } from "drizzle-orm";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { issueCredential } from "./mastery";

/**
 * Credential-award path (fix C). A learner reaching mastery must persist a valid credential that
 * then lists under the Credentials tab. These tests prove issueCredential commits, is idempotent
 * (no duplicate on a second call), and that GET /credentials returns it - and that it survives even
 * when the partial unique index is absent (the arbiter-less ON CONFLICT never raises 42P10).
 *
 * DB-backed; boots the real app over HTTP. Skips cleanly with no database.
 */

const SUFFIX = `cred-${Date.now()}`;
let server: Server;
let base: string;
let dbMod: typeof import("@workspace/db");
let hasDb = false;

const userId = `u-${SUFFIX}`;
const moduleId = `m-${SUFFIX}`;
const tok = `tok-${SUFFIX}`;

async function get(path: string, token?: string): Promise<Response> {
  return fetch(`${base}${path}`, { headers: token ? { cookie: `praxis_session=${token}` } : {} });
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
  const { db, usersTable, authSessionsTable } = dbMod;
  await db.insert(usersTable).values([{ id: userId, email: `${userId}@t.test`, role: "learner", status: "active" }]);
  await db.insert(authSessionsTable).values([{ token: tok, userId, expiresAt: new Date(Date.now() + 3600_000) }]);

  const app = (await import("../app")).default;
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!hasDb) return;
  const { db, usersTable, authSessionsTable, credentialsTable } = dbMod;
  await db.delete(credentialsTable).where(eq(credentialsTable.userId, userId)).catch(() => {});
  await db.delete(authSessionsTable).where(inArray(authSessionsTable.token, [tok])).catch(() => {});
  await db.delete(usersTable).where(inArray(usersTable.id, [userId])).catch(() => {});
});

describe("credential award on mastery", () => {
  it("has a database (else skipped)", () => {
    if (!hasDb) console.warn("mastery: no DATABASE_URL, skipping");
    expect(true).toBe(true);
  });

  it("persists a valid credential and is idempotent", async () => {
    if (!hasDb) return;
    const { db, credentialsTable } = dbMod;
    await issueCredential(db, { userId, moduleId, moduleTitle: `Module ${SUFFIX}`, masteryScore: "0.8500", exchanges: 6 });
    const after1 = await db.select().from(credentialsTable).where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.moduleId, moduleId)));
    expect(after1).toHaveLength(1);
    expect(after1[0].status).toBe("valid");

    // Second call must NOT create a duplicate (idempotent) and must NOT throw.
    await issueCredential(db, { userId, moduleId, moduleTitle: `Module ${SUFFIX}`, masteryScore: "0.9000", exchanges: 8 });
    const after2 = await db.select().from(credentialsTable).where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.moduleId, moduleId)));
    expect(after2).toHaveLength(1);
  });

  it("lists the credential under GET /credentials", async () => {
    if (!hasDb) return;
    const res = await get("/credentials", tok);
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((c: { moduleId?: string; moduleTitle?: string }) => c.moduleId === moduleId || c.moduleTitle === `Module ${SUFFIX}`)).toBe(true);
  });

  it("never raises 42P10 even if the partial unique index is dropped", async () => {
    if (!hasDb) return;
    const { db, credentialsTable } = dbMod;
    const otherModule = `m2-${SUFFIX}`;
    // Drop the partial index to simulate an environment where the boot heal has not run yet.
    await db.execute(sql`DROP INDEX IF EXISTS credentials_user_module_valid_uidx`);
    try {
      // Arbiter-less ON CONFLICT DO NOTHING must still succeed (not 42P10).
      await expect(issueCredential(db, { userId, moduleId: otherModule, moduleTitle: `Other ${SUFFIX}`, masteryScore: "0.8100", exchanges: 5 })).resolves.not.toThrow();
      const rows = await db.select().from(credentialsTable).where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.moduleId, otherModule)));
      expect(rows).toHaveLength(1);
    } finally {
      // Restore the index so we leave the shared test DB as we found it.
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS credentials_user_module_valid_uidx ON credentials (user_id, module_id) WHERE credential_status = 'valid'`).catch(() => {});
      await db.delete(credentialsTable).where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.moduleId, otherModule))).catch(() => {});
    }
  });
});
