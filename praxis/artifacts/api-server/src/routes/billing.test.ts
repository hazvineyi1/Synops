import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, inArray, eq } from "drizzle-orm";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { partnerSeatSummary } from "../lib/seatLicensing";

/**
 * Seat-licensing reconciliation + invoice generation proof.
 *
 * Seeds a partner with one org, 5 active learners, a 10-seat subscription at R500/seat, and a
 * funder agreement covering 2 of those learners. Asserts the pooled-seat maths (consumed=5,
 * funded=2, billable=3, net=1500) and that invoice generation drafts exactly one invoice for
 * that net. This is the commercial core: billable = consumed - funded, priced per seat.
 *
 * DB-backed; boots the real app over HTTP. Skips cleanly with no database.
 */

const SUFFIX = `bl-${Date.now()}`;
let server: Server;
let base: string;
let dbMod: typeof import("@workspace/db");
let hasDb = false;

const partnerId = `p-${SUFFIX}`;
const orgId = `o-${SUFFIX}`;
const paId = `u-pa-${SUFFIX}`;
const tokPa = `tok-pa-${SUFFIX}`;
const learnerIds = [1, 2, 3, 4, 5].map((n) => `u-l${n}-${SUFFIX}`);
const subId = `sub-${SUFFIX}`;
const agreementId = `fa-${SUFFIX}`;
const seatIds = [1, 2].map((n) => `fs${n}-${SUFFIX}`);

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

  const { db, partnersTable, organisationsTable, usersTable, authSessionsTable, billingSubscriptionsTable, fundingAgreementsTable, fundedSeatAssignmentsTable } = dbMod;
  const exp = new Date(Date.now() + 60 * 60 * 1000);

  await db.insert(partnersTable).values([{ id: partnerId, name: `P ${SUFFIX}`, slug: `p-${SUFFIX}`, contactEmail: `p-${SUFFIX}@t.test` }]);
  await db.insert(organisationsTable).values([{ id: orgId, name: `Org ${SUFFIX}`, partnerId }]);
  await db.insert(usersTable).values([
    { id: paId, email: `pa-${SUFFIX}@t.test`, role: "partner_admin", partnerId, status: "active" },
    ...learnerIds.map((id) => ({ id, email: `${id}@t.test`, role: "learner", partnerId, organisationId: orgId, status: "active" })),
  ]);
  await db.insert(authSessionsTable).values([{ token: tokPa, userId: paId, expiresAt: exp }]);
  await db.insert(billingSubscriptionsTable).values([
    { id: subId, partnerId, orgId, orgName: `Org ${SUFFIX}`, planName: "Standard", pricePerSeat: 500, seats: 10, activeSeats: 0 },
  ]);
  await db.insert(fundingAgreementsTable).values([
    { id: agreementId, partnerId, funderName: "SETA", funderType: "SETA", orgId, orgName: `Org ${SUFFIX}`, seatsFunded: 3, value: 0, status: "active" },
  ]);
  await db.insert(fundedSeatAssignmentsTable).values(
    seatIds.map((id, i) => ({ id, partnerId, agreementId, learnerId: learnerIds[i], learnerName: learnerIds[i] })),
  );

  const app = (await import("../app")).default;
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}/api`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!hasDb) return;
  const { db, partnersTable, organisationsTable, usersTable, authSessionsTable, billingSubscriptionsTable, billingInvoicesTable, fundingAgreementsTable, fundedSeatAssignmentsTable } = dbMod;
  await db.delete(fundedSeatAssignmentsTable).where(inArray(fundedSeatAssignmentsTable.id, seatIds)).catch(() => {});
  await db.delete(fundingAgreementsTable).where(eq(fundingAgreementsTable.id, agreementId)).catch(() => {});
  await db.delete(billingInvoicesTable).where(eq(billingInvoicesTable.partnerId, partnerId)).catch(() => {});
  await db.delete(billingSubscriptionsTable).where(eq(billingSubscriptionsTable.id, subId)).catch(() => {});
  await db.delete(authSessionsTable).where(inArray(authSessionsTable.token, [tokPa])).catch(() => {});
  await db.delete(usersTable).where(inArray(usersTable.id, [paId, ...learnerIds])).catch(() => {});
  await db.delete(organisationsTable).where(eq(organisationsTable.id, orgId)).catch(() => {});
  await db.delete(partnersTable).where(eq(partnersTable.id, partnerId)).catch(() => {});
});

describe("seat licensing + invoicing", () => {
  it("has a database (else skipped)", () => {
    if (!hasDb) console.warn("billing: no DATABASE_URL, skipping");
    expect(true).toBe(true);
  });

  it("reconciles pooled seats: billable = consumed - funder-funded", async () => {
    if (!hasDb) return;
    const s = await partnerSeatSummary(partnerId);
    const org = s.orgs.find((o) => o.orgId === orgId)!;
    expect(org.consumedSeats).toBe(5);
    expect(org.fundedSeats).toBe(2);
    expect(org.billableSeats).toBe(3);
    expect(org.licensedSeats).toBe(10);
    expect(org.overage).toBe(0);
    expect(org.projectedNet).toBe(1500); // 3 x R500
    expect(s.totalBillable).toBe(3);
    expect(s.projectedNet).toBe(1500);
  });

  it("exposes seat usage over the API to the partner admin", async () => {
    if (!hasDb) return;
    const res = await req(`/partners/${partnerId}/seat-usage`, tokPa);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalConsumed).toBe(5);
    expect(body.totalBillable).toBe(3);
  });

  it("generates exactly one draft invoice for the net billable amount", async () => {
    if (!hasDb) return;
    const res = await req(`/partners/${partnerId}/invoices/generate`, tokPa, {
      method: "POST",
      body: JSON.stringify({ period: "2026-07" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.invoices[0].net).toBe(1500);
    expect(body.invoices[0].status).toBe("draft");
    expect(body.invoices[0].orgId).toBe(orgId);
  });
});
