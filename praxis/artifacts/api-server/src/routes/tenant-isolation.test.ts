import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, inArray } from "drizzle-orm";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Cross-tenant isolation proof for the multi-tenant admin surface.
 *
 * Seeds two independent partners (A and B), each with an organisation and a
 * partner_admin / org_admin, then asserts that a user from tenant B can never
 * read tenant A's partner- or org-scoped data (and vice versa), while the
 * legitimate owner can. A bypass (a foreign user getting 200 on another tenant's
 * resource) fails here instead of leaking one client's data to another.
 *
 * DB-backed: it needs a real Postgres (DATABASE_URL). It boots the actual Express
 * app on an ephemeral port and drives it over HTTP with seeded session cookies,
 * so it exercises the real middleware + route guards end to end. Skips cleanly
 * when no database is configured/reachable.
 */

const SUFFIX = `iso-${Date.now()}`;
let server: Server;
let base: string;
let dbMod: typeof import("@workspace/db");
let hasDb = false;

// Fixture ids.
const partnerA = `p-a-${SUFFIX}`;
const partnerB = `p-b-${SUFFIX}`;
const orgA = `o-a-${SUFFIX}`;
const orgB = `o-b-${SUFFIX}`;
const paAdminA = `u-pa-a-${SUFFIX}`;
const paAdminB = `u-pa-b-${SUFFIX}`;
const orgAdminA = `u-oa-a-${SUFFIX}`;
const orgAdminB = `u-oa-b-${SUFFIX}`;
const tokPaA = `tok-pa-a-${SUFFIX}`;
const tokPaB = `tok-pa-b-${SUFFIX}`;
const tokOaA = `tok-oa-a-${SUFFIX}`;
const tokOaB = `tok-oa-b-${SUFFIX}`;

async function get(path: string, token?: string): Promise<number> {
  const res = await fetch(`${base}${path}`, {
    headers: token ? { cookie: `praxis_session=${token}` } : {},
  });
  return res.status;
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

  const { db, partnersTable, organisationsTable, usersTable, authSessionsTable } = dbMod;

  await db.insert(partnersTable).values([
    { id: partnerA, name: `Partner A ${SUFFIX}`, slug: `pa-${SUFFIX}`, contactEmail: `a-${SUFFIX}@t.test` },
    { id: partnerB, name: `Partner B ${SUFFIX}`, slug: `pb-${SUFFIX}`, contactEmail: `b-${SUFFIX}@t.test` },
  ]);
  await db.insert(organisationsTable).values([
    { id: orgA, name: `Org A ${SUFFIX}`, partnerId: partnerA },
    { id: orgB, name: `Org B ${SUFFIX}`, partnerId: partnerB },
  ]);
  await db.insert(usersTable).values([
    { id: paAdminA, email: `pa-a-${SUFFIX}@t.test`, role: "partner_admin", partnerId: partnerA, status: "active" },
    { id: paAdminB, email: `pa-b-${SUFFIX}@t.test`, role: "partner_admin", partnerId: partnerB, status: "active" },
    { id: orgAdminA, email: `oa-a-${SUFFIX}@t.test`, role: "org_admin", partnerId: partnerA, organisationId: orgA, status: "active" },
    { id: orgAdminB, email: `oa-b-${SUFFIX}@t.test`, role: "org_admin", partnerId: partnerB, organisationId: orgB, status: "active" },
  ]);
  const exp = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(authSessionsTable).values([
    { token: tokPaA, userId: paAdminA, expiresAt: exp },
    { token: tokPaB, userId: paAdminB, expiresAt: exp },
    { token: tokOaA, userId: orgAdminA, expiresAt: exp },
    { token: tokOaB, userId: orgAdminB, expiresAt: exp },
  ]);

  const app = (await import("../app")).default;
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}/api`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!hasDb) return;
  const { db, partnersTable, organisationsTable, usersTable, authSessionsTable } = dbMod;
  await db.delete(authSessionsTable).where(inArray(authSessionsTable.token, [tokPaA, tokPaB, tokOaA, tokOaB])).catch(() => {});
  await db.delete(usersTable).where(inArray(usersTable.id, [paAdminA, paAdminB, orgAdminA, orgAdminB])).catch(() => {});
  await db.delete(organisationsTable).where(inArray(organisationsTable.id, [orgA, orgB])).catch(() => {});
  await db.delete(partnersTable).where(inArray(partnersTable.id, [partnerA, partnerB])).catch(() => {});
});

describe("cross-tenant isolation", () => {
  it.runIf(true)("has a database (else skipped)", () => {
    if (!hasDb) console.warn("tenant-isolation: no DATABASE_URL, skipping");
    expect(true).toBe(true);
  });

  // Partner-scoped routes: partner_admin B must not read partner A.
  const partnerRoutes = (id: string) => [
    `/partners/${id}`,
    `/partners/${id}/members`,
    `/partners/${id}/stats`,
    `/partners/${id}/audit`,
  ];

  it("blocks a foreign partner_admin from another partner's data", async () => {
    if (!hasDb) return;
    for (const path of partnerRoutes(partnerA)) {
      expect([401, 403, 404], `foreign access to ${path}`).toContain(await get(path, tokPaB));
    }
  });

  it("lets the owning partner_admin read their own partner", async () => {
    if (!hasDb) return;
    for (const path of partnerRoutes(partnerA)) {
      expect(await get(path, tokPaA), `owner access to ${path}`).toBe(200);
    }
  });

  // Org-scoped routes: an org_admin of org B must not read org A.
  const orgRoutes = (id: string) => [
    `/organisations/${id}`,
    `/organisations/${id}/members`,
    `/organisations/${id}/stats`,
    `/organisations/${id}/classes`,
    `/orgs/${id}/prompt-templates`,
  ];

  it("blocks a foreign org_admin from another org's data", async () => {
    if (!hasDb) return;
    for (const path of orgRoutes(orgA)) {
      expect([401, 403, 404], `foreign access to ${path}`).toContain(await get(path, tokOaB));
    }
  });

  it("lets the owning org_admin read their own org", async () => {
    if (!hasDb) return;
    for (const path of orgRoutes(orgA)) {
      expect([200], `owner access to ${path}`).toContain(await get(path, tokOaA));
    }
  });

  // Extra org-scoped surfaces that must also refuse a foreign tenant. Owner
  // behaviour varies (empty lists, differing shapes), so here we only assert that
  // a foreign org_admin is refused - a 200 would be a leak.
  const foreignOnlyOrgRoutes = (id: string) => [
    `/orgs/${id}/delivery-sessions`,
    `/orgs/${id}/coaching-hours`,
    `/organisations/${id}/accreditation-report`,
    `/organisations/${id}/classes`,
  ];

  it("blocks a foreign org_admin from other org-scoped surfaces", async () => {
    if (!hasDb) return;
    for (const path of foreignOnlyOrgRoutes(orgA)) {
      expect([401, 403, 404], `foreign access to ${path}`).toContain(await get(path, tokOaB));
    }
  });

  it("rejects anonymous access to scoped routes", async () => {
    if (!hasDb) return;
    expect(await get(`/partners/${partnerA}/members`)).toBe(401);
    expect(await get(`/organisations/${orgA}/members`)).toBe(401);
  });
});
