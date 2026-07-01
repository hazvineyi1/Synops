// ─── Ambassador residual-commission engine ───
//
// Compliance invariants enforced here (do not weaken):
//   1. Commission is ONLY ever minted from a real, cleared customer payment
//      (creditCommissionForPayment is called from the payment-clearing paths).
//      Nothing here mints commission on sign-up, on opting in, or on referring.
//   2. Depth is exactly one: a referral links one ambassador to one customer.
//      We never read or build a chain upward, so no override / downline exists.
//   3. Earnings sit pending through a holdback window, then become confirmed.
//      A refund / chargeback claws the matching event back.
//   4. Balances are always derived from the ledger, never stored as a mutable total.

import {
  db,
  studyAmbassadorsTable,
  studyReferralsTable,
  studyCommissionEventsTable,
  studyPayoutsTable,
  studyAmbassadorSettingsTable,
  studyUsersTable,
} from "@workspace/paideia-db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { logger } from "../logger.js";

export type AmbassadorSettings = typeof studyAmbassadorSettingsTable.$inferSelect;

// The transaction handle drizzle hands to db.transaction(cb). Accepting either the
// root db or a tx lets the commission credit run inside the payment-clearing tx.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

const VALID_PAYOUT_METHODS = ["ecocash", "mpesa", "mukuru", "bank_transfer"] as const;
export type PayoutMethod = (typeof VALID_PAYOUT_METHODS)[number];

export function isPayoutMethod(value: unknown): value is PayoutMethod {
  return typeof value === "string" && (VALID_PAYOUT_METHODS as readonly string[]).includes(value);
}

// ─── Settings (singleton, lazily seeded) ───

export async function getAmbassadorSettings(): Promise<AmbassadorSettings> {
  const rows = await db.select().from(studyAmbassadorSettingsTable).limit(1);
  if (rows[0]) return rows[0];
  const inserted = await db
    .insert(studyAmbassadorSettingsTable)
    .values({})
    .returning();
  return inserted[0]!;
}

export interface AmbassadorSettingsInput {
  schedule?: Array<{ minMonth: number; maxMonth: number | null; ratePct: number }>;
  standardCapMonths?: number;
  lifetimeThresholdReferrals?: number;
  holdbackDays?: number;
  payoutMethods?: string[];
  fxRatesToUsd?: Record<string, number>;
  cashoutIncrementUsdMinor?: number;
}

export async function updateAmbassadorSettings(
  input: AmbassadorSettingsInput,
): Promise<AmbassadorSettings> {
  const current = await getAmbassadorSettings();
  const updated = await db
    .update(studyAmbassadorSettingsTable)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(studyAmbassadorSettingsTable.id, current.id))
    .returning();
  return updated[0]!;
}

// ─── Rate resolution ───

// Resolve the commission percent for a given ambassador tier + customer tenure
// month (1-based). Standard ambassadors stop earning past the cap; lifetime
// ambassadors keep earning whatever the open-ended tail bracket pays. Returns 0
// when no commission is due (so the caller can still mark attribution without
// minting an event).
export function resolveRatePct(
  settings: AmbassadorSettings,
  tier: string,
  tenureMonth: number,
): number {
  if (tier !== "lifetime" && tenureMonth > settings.standardCapMonths) return 0;
  for (const bracket of settings.schedule) {
    const max = bracket.maxMonth ?? Number.POSITIVE_INFINITY;
    if (tenureMonth >= bracket.minMonth && tenureMonth <= max) {
      return bracket.ratePct;
    }
  }
  return 0;
}

// Whole months elapsed between two dates (used to index the tenure bracket).
function monthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

// Convert a minor amount in `currency` to USD cents using the configured FX rate.
export function toUsdMinor(
  settings: AmbassadorSettings,
  amountMinor: number,
  currency: string,
): number {
  const rate = settings.fxRatesToUsd[currency];
  const effective = typeof rate === "number" && rate > 0 ? rate : 1;
  return Math.round(amountMinor * effective);
}

// ─── Referral codes ───

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let out = "";
  for (let i = 0; i < 7; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const existing = await db
      .select({ id: studyAmbassadorsTable.id })
      .from(studyAmbassadorsTable)
      .where(eq(studyAmbassadorsTable.referralCode, code))
      .limit(1);
    if (!existing[0]) return code;
  }
  // Extremely unlikely; fall back to a longer code.
  return randomCode() + randomCode();
}

// ─── Opt-in / profile ───

export async function getAmbassadorByUserId(userId: string) {
  const rows = await db
    .select()
    .from(studyAmbassadorsTable)
    .where(eq(studyAmbassadorsTable.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAmbassadorByCode(code: string) {
  const rows = await db
    .select()
    .from(studyAmbassadorsTable)
    .where(eq(studyAmbassadorsTable.referralCode, normalizeReferralCode(code)))
    .limit(1);
  return rows[0] ?? null;
}

// Free opt-in for any logged-in user. Idempotent: returns the existing row if the
// user already joined. payoutMethod/handle are optional at join time.
export async function joinAmbassadorProgram(
  userId: string,
  payoutMethod?: string,
  payoutHandle?: string,
): Promise<typeof studyAmbassadorsTable.$inferSelect> {
  const existing = await getAmbassadorByUserId(userId);
  if (existing) return existing;
  const referralCode = await generateUniqueReferralCode();
  const inserted = await db
    .insert(studyAmbassadorsTable)
    .values({
      userId,
      referralCode,
      payoutMethod: isPayoutMethod(payoutMethod) ? payoutMethod : null,
      payoutHandle: payoutHandle?.trim() || null,
    })
    .returning();
  return inserted[0]!;
}

// ─── Attribution (called at signup, never mints commission) ───

// Record that `customerId` was referred via `code`. Safe to call best-effort:
// returns silently when the code is unknown/inactive, when the customer would
// refer themselves, or when the customer is already attributed.
export async function attributeReferral(customerId: string, code: string): Promise<void> {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return;
  const ambassador = await getAmbassadorByCode(normalized);
  if (!ambassador || ambassador.status !== "active") return;
  if (ambassador.userId === customerId) return; // cannot refer self

  // customerId is unique on the table; first attribution wins.
  await db
    .insert(studyReferralsTable)
    .values({ ambassadorId: ambassador.id, customerId })
    .onConflictDoNothing({ target: studyReferralsTable.customerId });
}

// ─── Commission crediting (THE only mint path) ───

export interface ClearedPaymentInput {
  customerId: string;
  sourceKind: "local" | "stripe";
  sourcePaymentId: string; // local payment uuid OR stripe invoice id
  grossMinor: number; // cleared amount in payment currency (after any coupon)
  currency: string; // USD | ZAR | ZMW | BWP
  paidAt: Date;
}

// Mint a commission event for one cleared customer payment, if (and only if) the
// customer was referred and a non-zero rate applies. Idempotent on
// (sourceKind, sourcePaymentId). Accepts an optional transaction handle so it can
// run inside the same transaction that clears a local payment.
export async function creditCommissionForPayment(
  input: ClearedPaymentInput,
  tx: DbOrTx = db,
): Promise<void> {
  if (input.grossMinor <= 0) return;

  const referralRows = await tx
    .select()
    .from(studyReferralsTable)
    .where(eq(studyReferralsTable.customerId, input.customerId))
    .limit(1);
  const referral = referralRows[0];
  if (!referral) return; // organic customer, no ambassador

  const ambassadorRows = await tx
    .select()
    .from(studyAmbassadorsTable)
    .where(eq(studyAmbassadorsTable.id, referral.ambassadorId))
    .limit(1);
  const ambassador = ambassadorRows[0];
  if (!ambassador || ambassador.status !== "active") return;

  const settings = await getAmbassadorSettings();

  // First cleared payment stamps firstPaidAt and activates the referral.
  const firstPaidAt = referral.firstPaidAt ?? input.paidAt;
  const tenureMonth = monthsBetween(firstPaidAt, input.paidAt) + 1;

  if (!referral.firstPaidAt || referral.status !== "active") {
    await tx
      .update(studyReferralsTable)
      .set({ status: "active", firstPaidAt })
      .where(eq(studyReferralsTable.id, referral.id));
  }

  const ratePct = resolveRatePct(settings, ambassador.tier, tenureMonth);
  if (ratePct <= 0) return; // attribution recorded, but nothing to mint

  const amountMinor = Math.round((input.grossMinor * ratePct) / 100);
  const grossUsdMinor = toUsdMinor(settings, input.grossMinor, input.currency);
  const amountUsdMinor = Math.round((grossUsdMinor * ratePct) / 100);
  if (amountUsdMinor <= 0) return;

  const confirmAt = new Date(input.paidAt.getTime() + settings.holdbackDays * 86_400_000);

  // Idempotent insert: a repeated webhook/poll for the same source payment is a no-op.
  const inserted = await tx
    .insert(studyCommissionEventsTable)
    .values({
      referralId: referral.id,
      ambassadorId: ambassador.id,
      sourceKind: input.sourceKind,
      sourcePaymentId: input.sourcePaymentId,
      grossMinor: input.grossMinor,
      currency: input.currency,
      grossUsdMinor,
      rateApplied: ratePct,
      amountMinor,
      amountUsdMinor,
      customerTenureMonth: tenureMonth,
      confirmAt,
    })
    .onConflictDoNothing({
      target: [studyCommissionEventsTable.sourceKind, studyCommissionEventsTable.sourcePaymentId],
    })
    .returning({ id: studyCommissionEventsTable.id });

  // Only consider a lifetime upgrade when we actually minted a new event.
  if (inserted[0] && ambassador.tier === "standard") {
    await maybeUpgradeToLifetime(ambassador.id, settings, tx);
  }
}

// Auto-promote a standard ambassador to lifetime once they hit the active-referral
// threshold. Manual admin grants use setAmbassadorTier instead.
async function maybeUpgradeToLifetime(
  ambassadorId: string,
  settings: AmbassadorSettings,
  tx: DbOrTx = db,
): Promise<void> {
  const countRows = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(studyReferralsTable)
    .where(
      and(
        eq(studyReferralsTable.ambassadorId, ambassadorId),
        eq(studyReferralsTable.status, "active"),
      ),
    );
  const activeReferrals = countRows[0]?.n ?? 0;
  if (activeReferrals >= settings.lifetimeThresholdReferrals) {
    await tx
      .update(studyAmbassadorsTable)
      .set({ tier: "lifetime", updatedAt: new Date() })
      .where(eq(studyAmbassadorsTable.id, ambassadorId));
  }
}

// ─── Clawback (refund / chargeback reversal) ───

// Reverse the commission event minted from a given source payment. Used by the
// Stripe webhook (automatic) and the admin panel (manual, for mobile money which
// has no programmatic refund event). Idempotent.
export async function clawbackBySourcePayment(
  sourceKind: "local" | "stripe",
  sourcePaymentId: string,
  reason: string,
): Promise<boolean> {
  const updated = await db
    .update(studyCommissionEventsTable)
    .set({ state: "clawed_back", clawedBackAt: new Date(), clawbackReason: reason })
    .where(
      and(
        eq(studyCommissionEventsTable.sourceKind, sourceKind),
        eq(studyCommissionEventsTable.sourcePaymentId, sourcePaymentId),
        inArray(studyCommissionEventsTable.state, ["pending", "confirmed"]),
      ),
    )
    .returning({ id: studyCommissionEventsTable.id });
  return updated.length > 0;
}

export async function clawbackByEventId(eventId: string, reason: string): Promise<boolean> {
  const updated = await db
    .update(studyCommissionEventsTable)
    .set({ state: "clawed_back", clawedBackAt: new Date(), clawbackReason: reason })
    .where(
      and(
        eq(studyCommissionEventsTable.id, eventId),
        inArray(studyCommissionEventsTable.state, ["pending", "confirmed"]),
      ),
    )
    .returning({ id: studyCommissionEventsTable.id });
  return updated.length > 0;
}

// ─── Lazy holdback confirmation (no cron infra) ───

// Promote any pending events whose holdback window has elapsed. Cheap and
// idempotent; call before reading balances (dashboard, admin, cash-out).
export async function confirmDueCommissionEvents(): Promise<number> {
  const updated = await db
    .update(studyCommissionEventsTable)
    .set({ state: "confirmed", confirmedAt: new Date() })
    .where(
      and(
        eq(studyCommissionEventsTable.state, "pending"),
        sql`${studyCommissionEventsTable.confirmAt} <= now()`,
      ),
    )
    .returning({ id: studyCommissionEventsTable.id });
  return updated.length;
}

// ─── Balance derivation (always from the ledger) ───

export interface AmbassadorBalances {
  pendingUsdMinor: number; // inside holdback, not yet available
  confirmedUsdMinor: number; // cleared holdback, not clawed back
  clawedBackUsdMinor: number;
  committedUsdMinor: number; // sum of requested|processing|paid payouts
  availableUsdMinor: number; // confirmed minus committed (can go negative via post-payout clawback)
  cashableUsdMinor: number; // largest whole-increment amount that can be cashed out now
  lifetimeEarnedUsdMinor: number; // pending + confirmed (excludes clawed back)
}

export async function getAmbassadorBalances(
  ambassadorId: string,
  settings?: AmbassadorSettings,
): Promise<AmbassadorBalances> {
  const cfg = settings ?? (await getAmbassadorSettings());

  const eventAgg = await db
    .select({
      state: studyCommissionEventsTable.state,
      total: sql<number>`coalesce(sum(${studyCommissionEventsTable.amountUsdMinor}), 0)::int`,
    })
    .from(studyCommissionEventsTable)
    .where(eq(studyCommissionEventsTable.ambassadorId, ambassadorId))
    .groupBy(studyCommissionEventsTable.state);

  let pending = 0;
  let confirmed = 0;
  let clawedBack = 0;
  for (const row of eventAgg) {
    if (row.state === "pending") pending = row.total;
    else if (row.state === "confirmed") confirmed = row.total;
    else if (row.state === "clawed_back") clawedBack = row.total;
  }

  const payoutAgg = await db
    .select({
      total: sql<number>`coalesce(sum(${studyPayoutsTable.amountUsdMinor}), 0)::int`,
    })
    .from(studyPayoutsTable)
    .where(
      and(
        eq(studyPayoutsTable.ambassadorId, ambassadorId),
        inArray(studyPayoutsTable.status, ["requested", "processing", "paid"]),
      ),
    );
  const committed = payoutAgg[0]?.total ?? 0;

  const available = confirmed - committed;
  const increment = cfg.cashoutIncrementUsdMinor > 0 ? cfg.cashoutIncrementUsdMinor : 2000;
  const cashable = available > 0 ? Math.floor(available / increment) * increment : 0;

  return {
    pendingUsdMinor: pending,
    confirmedUsdMinor: confirmed,
    clawedBackUsdMinor: clawedBack,
    committedUsdMinor: committed,
    availableUsdMinor: available,
    cashableUsdMinor: cashable,
    lifetimeEarnedUsdMinor: pending + confirmed,
  };
}

// ─── Cash-out ───

export type CashoutResult =
  | { ok: true; payout: typeof studyPayoutsTable.$inferSelect }
  | { ok: false; error: string };

// Request a payout of the largest whole-increment amount currently available.
// Re-derives the balance inside a transaction and re-checks against committed
// payouts so two concurrent requests cannot over-draw.
export async function requestCashout(ambassadorId: string): Promise<CashoutResult> {
  const settings = await getAmbassadorSettings();
  const increment = settings.cashoutIncrementUsdMinor > 0 ? settings.cashoutIncrementUsdMinor : 2000;

  return db.transaction(async (tx) => {
    // Lock the ambassador row for the duration of the transaction so two
    // concurrent cash-out requests serialize and cannot both read the same
    // available balance and over-draw it.
    const ambassadorRows = await tx
      .select()
      .from(studyAmbassadorsTable)
      .where(eq(studyAmbassadorsTable.id, ambassadorId))
      .limit(1)
      .for("update");
    const ambassador = ambassadorRows[0];
    if (!ambassador) return { ok: false as const, error: "Ambassador not found" };
    if (ambassador.status !== "active") return { ok: false as const, error: "Account is not active" };
    if (!isPayoutMethod(ambassador.payoutMethod) || !ambassador.payoutHandle) {
      return { ok: false as const, error: "Set a payout method before cashing out" };
    }

    const confirmedRows = await tx
      .select({
        total: sql<number>`coalesce(sum(${studyCommissionEventsTable.amountUsdMinor}), 0)::int`,
      })
      .from(studyCommissionEventsTable)
      .where(
        and(
          eq(studyCommissionEventsTable.ambassadorId, ambassadorId),
          eq(studyCommissionEventsTable.state, "confirmed"),
        ),
      );
    const confirmed = confirmedRows[0]?.total ?? 0;

    const committedRows = await tx
      .select({
        total: sql<number>`coalesce(sum(${studyPayoutsTable.amountUsdMinor}), 0)::int`,
      })
      .from(studyPayoutsTable)
      .where(
        and(
          eq(studyPayoutsTable.ambassadorId, ambassadorId),
          inArray(studyPayoutsTable.status, ["requested", "processing", "paid"]),
        ),
      );
    const committed = committedRows[0]?.total ?? 0;

    const available = confirmed - committed;
    const payable = available > 0 ? Math.floor(available / increment) * increment : 0;
    if (payable < increment) {
      return {
        ok: false as const,
        error: `You need at least ${(increment / 100).toFixed(0)} USD in confirmed earnings to cash out`,
      };
    }

    const inserted = await tx
      .insert(studyPayoutsTable)
      .values({
        ambassadorId,
        amountUsdMinor: payable,
        method: ambassador.payoutMethod!,
        handle: ambassador.payoutHandle!,
      })
      .returning();
    return { ok: true as const, payout: inserted[0]! };
  });
}

// ─── Admin operations ───

export async function setAmbassadorTier(ambassadorId: string, tier: "standard" | "lifetime") {
  const updated = await db
    .update(studyAmbassadorsTable)
    .set({ tier, updatedAt: new Date() })
    .where(eq(studyAmbassadorsTable.id, ambassadorId))
    .returning();
  return updated[0] ?? null;
}

export async function setAmbassadorStatus(ambassadorId: string, status: "active" | "suspended") {
  const updated = await db
    .update(studyAmbassadorsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(studyAmbassadorsTable.id, ambassadorId))
    .returning();
  return updated[0] ?? null;
}

export async function setPayoutMethod(
  userId: string,
  method: string,
  handle: string,
): Promise<typeof studyAmbassadorsTable.$inferSelect | null> {
  if (!isPayoutMethod(method)) return null;
  const updated = await db
    .update(studyAmbassadorsTable)
    .set({ payoutMethod: method, payoutHandle: handle.trim(), updatedAt: new Date() })
    .where(eq(studyAmbassadorsTable.userId, userId))
    .returning();
  return updated[0] ?? null;
}

export async function updatePayoutStatus(
  payoutId: string,
  status: "requested" | "processing" | "paid" | "failed",
  note?: string,
) {
  const settled = status === "paid" || status === "failed";
  const updated = await db
    .update(studyPayoutsTable)
    .set({
      status,
      note: note?.trim() || null,
      settledAt: settled ? new Date() : null,
    })
    .where(eq(studyPayoutsTable.id, payoutId))
    .returning();
  return updated[0] ?? null;
}

// ─── Read models for the dashboards ───

export interface ReferredCustomerView {
  referralId: string;
  customerName: string;
  customerEmail: string;
  status: string;
  firstPaidAt: string | null;
  tenureMonth: number | null;
  currentRatePct: number;
  earnedUsdMinor: number;
}

export async function getReferredCustomers(
  ambassador: typeof studyAmbassadorsTable.$inferSelect,
  settings: AmbassadorSettings,
): Promise<ReferredCustomerView[]> {
  const rows = await db
    .select({
      referralId: studyReferralsTable.id,
      status: studyReferralsTable.status,
      firstPaidAt: studyReferralsTable.firstPaidAt,
      customerName: studyUsersTable.name,
      customerEmail: studyUsersTable.email,
    })
    .from(studyReferralsTable)
    .innerJoin(studyUsersTable, eq(studyUsersTable.id, studyReferralsTable.customerId))
    .where(eq(studyReferralsTable.ambassadorId, ambassador.id))
    .orderBy(desc(studyReferralsTable.attributedAt));

  const earnedRows = await db
    .select({
      referralId: studyCommissionEventsTable.referralId,
      total: sql<number>`coalesce(sum(${studyCommissionEventsTable.amountUsdMinor}), 0)::int`,
    })
    .from(studyCommissionEventsTable)
    .where(
      and(
        eq(studyCommissionEventsTable.ambassadorId, ambassador.id),
        inArray(studyCommissionEventsTable.state, ["pending", "confirmed"]),
      ),
    )
    .groupBy(studyCommissionEventsTable.referralId);
  const earnedByReferral = new Map(earnedRows.map((r) => [r.referralId, r.total]));

  const now = new Date();
  return rows.map((r) => {
    const tenureMonth = r.firstPaidAt ? monthsBetween(new Date(r.firstPaidAt), now) + 1 : null;
    const currentRatePct =
      tenureMonth != null ? resolveRatePct(settings, ambassador.tier, tenureMonth) : 0;
    return {
      referralId: r.referralId,
      customerName: r.customerName,
      customerEmail: maskEmail(r.customerEmail),
      status: r.status,
      firstPaidAt: r.firstPaidAt ? new Date(r.firstPaidAt).toISOString() : null,
      tenureMonth,
      currentRatePct,
      earnedUsdMinor: earnedByReferral.get(r.referralId) ?? 0,
    };
  });
}

// Privacy: ambassadors should not see referred customers' full email addresses.
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export async function getRecentCommissionEvents(ambassadorId: string, limit = 20) {
  return db
    .select({
      id: studyCommissionEventsTable.id,
      amountUsdMinor: studyCommissionEventsTable.amountUsdMinor,
      grossUsdMinor: studyCommissionEventsTable.grossUsdMinor,
      rateApplied: studyCommissionEventsTable.rateApplied,
      currency: studyCommissionEventsTable.currency,
      customerTenureMonth: studyCommissionEventsTable.customerTenureMonth,
      state: studyCommissionEventsTable.state,
      confirmAt: studyCommissionEventsTable.confirmAt,
      createdAt: studyCommissionEventsTable.createdAt,
    })
    .from(studyCommissionEventsTable)
    .where(eq(studyCommissionEventsTable.ambassadorId, ambassadorId))
    .orderBy(desc(studyCommissionEventsTable.createdAt))
    .limit(limit);
}

export async function getPayoutHistory(ambassadorId: string) {
  return db
    .select()
    .from(studyPayoutsTable)
    .where(eq(studyPayoutsTable.ambassadorId, ambassadorId))
    .orderBy(desc(studyPayoutsTable.requestedAt));
}

// Best-effort wrapper used by webhook paths where we never want commission
// bookkeeping to break the primary payment flow.
export async function safeCreditCommission(input: ClearedPaymentInput): Promise<void> {
  try {
    await creditCommissionForPayment(input);
  } catch (err) {
    logger.error({ err, sourcePaymentId: input.sourcePaymentId }, "commission credit failed");
  }
}
