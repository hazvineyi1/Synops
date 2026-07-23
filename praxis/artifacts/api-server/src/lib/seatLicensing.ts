import { and, eq, inArray, count } from "drizzle-orm";
import {
  db,
  usersTable,
  organisationsTable,
  billingSubscriptionsTable,
  billingInvoicesTable,
  fundingAgreementsTable,
  fundedSeatAssignmentsTable,
} from "@workspace/db";

/**
 * Seat-licensing reconciliation - the commercial core of the B2B model.
 *
 * A partner licenses seats (pooled: a partner-wide pool plus optional per-org allocations) and
 * those seats are CONSUMED by real active learners. This service computes the truth - licensed
 * vs. consumed vs. funder-funded vs. net billable - instead of trusting the hand-entered
 * active_seats number, exactly the single-source-of-truth discipline the tenant counts use.
 *
 * Billable = consumed - funded: a learner sitting on a funder (SETA/CSI) seat is paid for by the
 * grant, so only the remaining commercial learners bill to the org. Per-org billable x price
 * drives the invoice draft (a human still reviews and issues; there is no payment gateway).
 *
 * B2C-ready by construction: a seat entitlement is just a subscription row. A future B2C
 * storefront purchase is a subscription with source='b2c_purchase' and seats=1 for an individual
 * - the same accounting applies with no schema change.
 */

export interface OrgSeatUsage {
  orgId: string;
  orgName: string;
  licensedSeats: number; // seats allocated to this org specifically
  consumedSeats: number; // real active learners in this org
  fundedSeats: number; // learners covered by a funder agreement
  billableSeats: number; // consumed - funded (never below 0)
  pricePerSeat: number; // in rand, from the org's subscription
  projectedNet: number; // billableSeats * pricePerSeat
  overage: number; // consumed beyond licensed (capacity warning)
}

export interface PartnerSeatSummary {
  partnerId: string;
  poolLicensed: number; // partner-wide pool (subscriptions with no org)
  totalLicensed: number; // pool + all per-org allocations
  totalConsumed: number;
  totalFunded: number;
  totalBillable: number;
  projectedNet: number;
  orgs: OrgSeatUsage[];
}

/** Active-learner count per org (seat consumption). role='learner' and not suspended/deleted. */
async function consumedByOrg(orgIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!orgIds.length) return map;
  const rows = await db
    .select({ oid: usersTable.organisationId, c: count() })
    .from(usersTable)
    .where(and(inArray(usersTable.organisationId, orgIds), eq(usersTable.role, "learner"), eq(usersTable.status, "active")))
    .groupBy(usersTable.organisationId);
  for (const r of rows) if (r.oid) map.set(r.oid, Number(r.c));
  return map;
}

/**
 * Funder-funded seats per org: count of funded_seat_assignments whose agreement is scoped to the
 * org, capped at the agreement's funded capacity so an over-assigned grant can't zero out billing.
 */
async function fundedByOrg(partnerId: string, orgIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!orgIds.length) return map;
  // agreements scoped to these orgs, with their capacity
  const agreements = await db
    .select({ id: fundingAgreementsTable.id, orgId: fundingAgreementsTable.orgId, cap: fundingAgreementsTable.seatsFunded })
    .from(fundingAgreementsTable)
    .where(and(eq(fundingAgreementsTable.partnerId, partnerId), inArray(fundingAgreementsTable.orgId, orgIds)));
  if (!agreements.length) return map;
  const used = await db
    .select({ agreementId: fundedSeatAssignmentsTable.agreementId, c: count() })
    .from(fundedSeatAssignmentsTable)
    .where(inArray(fundedSeatAssignmentsTable.agreementId, agreements.map((a) => a.id)))
    .groupBy(fundedSeatAssignmentsTable.agreementId);
  const usedById = new Map(used.map((u) => [u.agreementId, Number(u.c)]));
  for (const a of agreements) {
    if (!a.orgId) continue;
    const capped = Math.min(usedById.get(a.id) ?? 0, a.cap ?? 0);
    map.set(a.orgId, (map.get(a.orgId) ?? 0) + capped);
  }
  return map;
}

/** Full seat-usage reconciliation for a partner. */
export async function partnerSeatSummary(partnerId: string): Promise<PartnerSeatSummary> {
  const [subs, orgs] = await Promise.all([
    db.select().from(billingSubscriptionsTable).where(eq(billingSubscriptionsTable.partnerId, partnerId)),
    db.select({ id: organisationsTable.id, name: organisationsTable.name }).from(organisationsTable).where(eq(organisationsTable.partnerId, partnerId)),
  ]);

  const orgIds = orgs.map((o) => o.id);
  const [consumed, funded] = await Promise.all([consumedByOrg(orgIds), fundedByOrg(partnerId, orgIds)]);

  // Per-org licensed seats + price come from that org's subscription(s); org-less subs are the pool.
  const licensedByOrg = new Map<string, number>();
  const priceByOrg = new Map<string, number>();
  let poolLicensed = 0;
  for (const s of subs) {
    if (s.orgId) {
      licensedByOrg.set(s.orgId, (licensedByOrg.get(s.orgId) ?? 0) + (s.seats ?? 0));
      priceByOrg.set(s.orgId, Math.max(priceByOrg.get(s.orgId) ?? 0, s.pricePerSeat ?? 0));
    } else {
      poolLicensed += s.seats ?? 0;
    }
  }
  // A partner-wide pool sets a default price for orgs with no dedicated subscription.
  const poolPrice = Math.max(0, ...subs.filter((s) => !s.orgId).map((s) => s.pricePerSeat ?? 0), 0);

  const orgUsage: OrgSeatUsage[] = orgs.map((o) => {
    const consumedSeats = consumed.get(o.id) ?? 0;
    const fundedSeats = Math.min(funded.get(o.id) ?? 0, consumedSeats);
    const licensedSeats = licensedByOrg.get(o.id) ?? 0;
    const billableSeats = Math.max(0, consumedSeats - fundedSeats);
    const pricePerSeat = priceByOrg.get(o.id) ?? poolPrice;
    return {
      orgId: o.id,
      orgName: o.name,
      licensedSeats,
      consumedSeats,
      fundedSeats,
      billableSeats,
      pricePerSeat,
      projectedNet: billableSeats * pricePerSeat,
      overage: Math.max(0, consumedSeats - licensedSeats),
    };
  });

  const totalLicensed = poolLicensed + orgUsage.reduce((s, o) => s + o.licensedSeats, 0);
  return {
    partnerId,
    poolLicensed,
    totalLicensed,
    totalConsumed: orgUsage.reduce((s, o) => s + o.consumedSeats, 0),
    totalFunded: orgUsage.reduce((s, o) => s + o.fundedSeats, 0),
    totalBillable: orgUsage.reduce((s, o) => s + o.billableSeats, 0),
    projectedNet: orgUsage.reduce((s, o) => s + o.projectedNet, 0),
    orgs: orgUsage,
  };
}

/** Next sequential invoice number for a partner, e.g. INV-2026-0007. Best-effort, gap-tolerant. */
export async function nextInvoiceNumber(partnerId: string, year: number): Promise<string> {
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(billingInvoicesTable)
    .where(eq(billingInvoicesTable.partnerId, partnerId));
  return `INV-${year}-${String((Number(n) || 0) + 1).padStart(4, "0")}`;
}
