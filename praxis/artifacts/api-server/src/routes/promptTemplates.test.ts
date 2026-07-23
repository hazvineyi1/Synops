import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, inArray, eq } from "drizzle-orm";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { approvedOrgPromptOverlay } from "../lib/orgPromptOverlay";

/**
 * Prompt-template review gate + activation proof.
 *
 * A template only shapes live AI tutoring once a super admin approves it. This asserts the
 * full lifecycle: an org author's draft is NOT in the overlay; approval puts it in; editing
 * the wording sends it back to draft (and out of the overlay) so changed text can never keep
 * shaping sessions un-reviewed.
 *
 * DB-backed; boots the real app over HTTP. Skips cleanly with no database.
 */

const SUFFIX = `pt-${Date.now()}`;
let server: Server;
let base: string;
let dbMod: typeof import("@workspace/db");
let hasDb = false;

const partnerId = `p-${SUFFIX}`;
const orgId = `o-${SUFFIX}`;
const superId = `u-sa-${SUFFIX}`;
const orgAdminId = `u-oa-${SUFFIX}`;
const tokSuper = `tok-sa-${SUFFIX}`;
const tokOrg = `tok-oa-${SUFFIX}`;
let templateId = "";

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

  const { db, partnersTable, organisationsTable, usersTable, authSessionsTable } = dbMod;
  const exp = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(partnersTable).values([{ id: partnerId, name: `P ${SUFFIX}`, slug: `p-${SUFFIX}`, contactEmail: `p-${SUFFIX}@t.test` }]);
  await db.insert(organisationsTable).values([{ id: orgId, name: `Org ${SUFFIX}`, partnerId }]);
  await db.insert(usersTable).values([
    { id: superId, email: `sa-${SUFFIX}@t.test`, role: "super_admin", status: "active" },
    { id: orgAdminId, email: `oa-${SUFFIX}@t.test`, role: "org_admin", partnerId, organisationId: orgId, status: "active" },
  ]);
  await db.insert(authSessionsTable).values([
    { token: tokSuper, userId: superId, expiresAt: exp },
    { token: tokOrg, userId: orgAdminId, expiresAt: exp },
  ]);

  const app = (await import("../app")).default;
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}/api`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!hasDb) return;
  const { db, partnersTable, organisationsTable, usersTable, authSessionsTable, promptTemplatesTable } = dbMod;
  if (templateId) await db.delete(promptTemplatesTable).where(eq(promptTemplatesTable.id, templateId)).catch(() => {});
  await db.delete(authSessionsTable).where(inArray(authSessionsTable.token, [tokSuper, tokOrg])).catch(() => {});
  await db.delete(usersTable).where(inArray(usersTable.id, [superId, orgAdminId])).catch(() => {});
  await db.delete(organisationsTable).where(inArray(organisationsTable.id, [orgId])).catch(() => {});
  await db.delete(partnersTable).where(inArray(partnersTable.id, [partnerId])).catch(() => {});
});

describe("prompt-template review + activation", () => {
  it("has a database (else skipped)", () => {
    if (!hasDb) console.warn("promptTemplates: no DATABASE_URL, skipping");
    expect(true).toBe(true);
  });

  it("a new template is a draft and does NOT shape the overlay", async () => {
    if (!hasDb) return;
    const res = await req(`/orgs/${orgId}/prompt-templates`, tokOrg, {
      method: "POST",
      body: JSON.stringify({ title: "House style", promptText: `Always relate answers to township retail ${SUFFIX}` }),
    });
    expect(res.status).toBe(201);
    const row = await res.json();
    templateId = row.id;
    expect(row.status).toBe("draft");
    expect(await approvedOrgPromptOverlay(orgId)).toBeNull();
  });

  it("a learner/org_admin cannot self-approve; only super_admin reviews", async () => {
    if (!hasDb) return;
    // org_admin is not a reviewer
    expect((await req(`/prompt-templates/${templateId}/review`, tokOrg, { method: "POST", body: JSON.stringify({ decision: "approve" }) })).status).toBe(403);
  });

  it("super_admin approval activates the template in the overlay", async () => {
    if (!hasDb) return;
    const res = await req(`/prompt-templates/${templateId}/review`, tokSuper, { method: "POST", body: JSON.stringify({ decision: "approve" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("approved");
    const overlay = await approvedOrgPromptOverlay(orgId);
    expect(overlay).toContain("township retail");
  });

  it("editing the wording sends it back to draft and out of the overlay", async () => {
    if (!hasDb) return;
    const res = await req(`/prompt-templates/${templateId}`, tokOrg, { method: "PATCH", body: JSON.stringify({ promptText: `Reworded ${SUFFIX}` }) });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("draft");
    expect(await approvedOrgPromptOverlay(orgId)).toBeNull();
  });
});
