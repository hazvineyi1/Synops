import { Router, type IRouter } from "express";
import {
  db,
  studyCouponsTable,
  studyAmbassadorsTable,
  studyReferralsTable,
  studyCommissionEventsTable,
  studyPayoutsTable,
  studyUsersTable,
} from "@workspace/paideia-db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireStudyAdmin } from "../../middlewares/auth.js";
import {
  getAmbassadorSettings,
  updateAmbassadorSettings,
  getAmbassadorBalances,
  setAmbassadorTier,
  setAmbassadorStatus,
  updatePayoutStatus,
  clawbackByEventId,
  type AmbassadorSettingsInput,
} from "../../lib/billing/ambassador.js";
import { normalizeCode } from "../../lib/billing/coupons.js";
import { isTier } from "../../lib/billing/config.js";
import { isWhatsAppConfigured } from "../../lib/notifications/whatsapp.js";
import {
  recentNotifications,
  runBriefReady,
  runRenewalReminders,
  runReviewNudges,
  type RunSummary,
} from "../../lib/notifications/service.js";

const router: IRouter = Router();
router.use(requireStudyAdmin);

const CURRENCIES = ["USD", "ZAR", "ZMW", "BWP"];

interface CouponInput {
  code?: unknown;
  description?: unknown;
  discountType?: unknown;
  percentOff?: unknown;
  amountOffMinor?: unknown;
  currency?: unknown;
  appliesToTier?: unknown;
  active?: unknown;
  maxRedemptions?: unknown;
  expiresAt?: unknown;
}

// Validate + normalize a coupon payload. Returns either parsed values or an error
// string for the caller to surface as a 400.
function parseCoupon(body: CouponInput): { error: string } | {
  values: {
    code: string;
    description: string | null;
    discountType: string;
    percentOff: number | null;
    amountOffMinor: number | null;
    currency: string | null;
    appliesToTier: string | null;
    active: boolean;
    maxRedemptions: number | null;
    expiresAt: Date | null;
  };
} {
  const discountType = body.discountType;
  if (discountType !== "percent" && discountType !== "fixed") {
    return { error: "discountType must be 'percent' or 'fixed'" };
  }

  let percentOff: number | null = null;
  let amountOffMinor: number | null = null;
  let currency: string | null = null;

  if (discountType === "percent") {
    const pct = Number(body.percentOff);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
      return { error: "percentOff must be between 1 and 100" };
    }
    percentOff = Math.round(pct);
  } else {
    const amt = Number(body.amountOffMinor);
    if (!Number.isFinite(amt) || amt < 1) {
      return { error: "amountOffMinor must be a positive integer (minor units)" };
    }
    amountOffMinor = Math.round(amt);
    if (typeof body.currency !== "string" || !CURRENCIES.includes(body.currency)) {
      return { error: `currency must be one of ${CURRENCIES.join(", ")} for fixed coupons` };
    }
    currency = body.currency;
  }

  let appliesToTier: string | null = null;
  if (body.appliesToTier != null && body.appliesToTier !== "") {
    if (!isTier(body.appliesToTier)) {
      return { error: "appliesToTier must be 'plus', 'pro', or empty" };
    }
    appliesToTier = body.appliesToTier;
  }

  let maxRedemptions: number | null = null;
  if (body.maxRedemptions != null && body.maxRedemptions !== "") {
    const max = Number(body.maxRedemptions);
    if (!Number.isFinite(max) || max < 1) {
      return { error: "maxRedemptions must be a positive integer or empty" };
    }
    maxRedemptions = Math.round(max);
  }

  let expiresAt: Date | null = null;
  if (body.expiresAt != null && body.expiresAt !== "") {
    const d = new Date(body.expiresAt as string);
    if (Number.isNaN(d.getTime())) {
      return { error: "expiresAt must be a valid date or empty" };
    }
    expiresAt = d;
  }

  return {
    values: {
      code: typeof body.code === "string" ? normalizeCode(body.code) : "",
      description:
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null,
      discountType,
      percentOff,
      amountOffMinor,
      currency,
      appliesToTier,
      active: body.active === undefined ? true : Boolean(body.active),
      maxRedemptions,
      expiresAt,
    },
  };
}

// List all coupons, newest first.
router.get("/coupons", async (_req, res) => {
  const coupons = await db
    .select()
    .from(studyCouponsTable)
    .orderBy(desc(studyCouponsTable.createdAt));
  res.json({ coupons });
});

// Create a coupon.
router.post("/coupons", async (req, res) => {
  const parsed = parseCoupon(req.body ?? {});
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  if (!parsed.values.code) {
    res.status(400).json({ error: "A coupon code is required" });
    return;
  }

  const existing = await db
    .select({ id: studyCouponsTable.id })
    .from(studyCouponsTable)
    .where(eq(studyCouponsTable.code, parsed.values.code))
    .limit(1);
  if (existing[0]) {
    res.status(409).json({ error: "A coupon with that code already exists" });
    return;
  }

  const inserted = await db
    .insert(studyCouponsTable)
    .values(parsed.values)
    .returning();
  res.status(201).json({ coupon: inserted[0] });
});

// Update a coupon.
router.patch("/coupons/:id", async (req, res) => {
  const parsed = parseCoupon(req.body ?? {});
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  if (!parsed.values.code) {
    res.status(400).json({ error: "A coupon code is required" });
    return;
  }

  // Guard against renaming onto another coupon's code.
  const clash = await db
    .select({ id: studyCouponsTable.id })
    .from(studyCouponsTable)
    .where(eq(studyCouponsTable.code, parsed.values.code))
    .limit(1);
  if (clash[0] && clash[0].id !== req.params.id) {
    res.status(409).json({ error: "A coupon with that code already exists" });
    return;
  }

  const updated = await db
    .update(studyCouponsTable)
    .set(parsed.values)
    .where(eq(studyCouponsTable.id, req.params.id))
    .returning();
  if (!updated[0]) {
    res.status(404).json({ error: "Coupon not found" });
    return;
  }
  res.json({ coupon: updated[0] });
});

// Delete a coupon.
router.delete("/coupons/:id", async (req, res) => {
  const deleted = await db
    .delete(studyCouponsTable)
    .where(eq(studyCouponsTable.id, req.params.id))
    .returning({ id: studyCouponsTable.id });
  if (!deleted[0]) {
    res.status(404).json({ error: "Coupon not found" });
    return;
  }
  res.json({ ok: true });
});

// ─── WhatsApp notifications (Phase 1) ───

// Whether the Twilio credentials are wired up yet.
router.get("/notifications/status", (_req, res) => {
  res.json({ whatsappConfigured: isWhatsAppConfigured() });
});

// Recent notification log, newest first.
router.get("/notifications", async (_req, res) => {
  const notifications = await recentNotifications(100);
  res.json({ notifications });
});

// Guards against overlapping batch runs in this process. The per-notification dedupe
// claim already prevents double sends; this just stops accidental concurrent batches
// (e.g. a double-click or an overlapping scheduler tick) from doing redundant work.
let notificationRunInProgress = false;

// Trigger a notification batch. Until a scheduler is wired up, this is the manual /
// externally-callable entry point. kind: renewal | brief | review | all.
router.post("/notifications/run", async (req, res) => {
  const kind = (req.body?.kind ?? "all") as string;
  const valid = ["renewal", "brief", "review", "all"];
  if (!valid.includes(kind)) {
    res.status(400).json({ error: `kind must be one of ${valid.join(", ")}` });
    return;
  }

  if (notificationRunInProgress) {
    res.status(409).json({ error: "A notification run is already in progress" });
    return;
  }
  notificationRunInProgress = true;

  const summaries: RunSummary[] = [];
  try {
    if (kind === "renewal" || kind === "all") summaries.push(await runRenewalReminders());
    if (kind === "brief" || kind === "all") summaries.push(await runBriefReady());
    if (kind === "review" || kind === "all") summaries.push(await runReviewNudges());
  } catch (err) {
    res.status(500).json({ error: "Notification run failed", detail: err instanceof Error ? err.message : String(err) });
    return;
  } finally {
    notificationRunInProgress = false;
  }

  res.json({ whatsappConfigured: isWhatsAppConfigured(), summaries });
});

// ─── Ambassador program admin ───

// Read the program settings (rates, caps, holdback, FX, payout rails).
router.get("/ambassador/settings", async (_req, res) => {
  const settings = await getAmbassadorSettings();
  res.json({ settings });
});

// Validate + apply a settings update. Every field is optional; only provided
// fields change.
function parseSettings(body: Record<string, unknown>): { error: string } | { values: AmbassadorSettingsInput } {
  const out: AmbassadorSettingsInput = {};

  if (body["schedule"] !== undefined) {
    if (!Array.isArray(body["schedule"])) return { error: "schedule must be an array" };
    const schedule: Array<{ minMonth: number; maxMonth: number | null; ratePct: number }> = [];
    for (const raw of body["schedule"]) {
      const b = raw as Record<string, unknown>;
      const minMonth = Number(b["minMonth"]);
      const ratePct = Number(b["ratePct"]);
      const maxMonth = b["maxMonth"] === null || b["maxMonth"] === undefined || b["maxMonth"] === ""
        ? null
        : Number(b["maxMonth"]);
      if (!Number.isFinite(minMonth) || minMonth < 1) return { error: "Each bracket needs a minMonth >= 1" };
      if (maxMonth !== null && (!Number.isFinite(maxMonth) || maxMonth < minMonth)) {
        return { error: "maxMonth must be >= minMonth or empty" };
      }
      if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
        return { error: "ratePct must be between 0 and 100" };
      }
      schedule.push({ minMonth: Math.round(minMonth), maxMonth: maxMonth === null ? null : Math.round(maxMonth), ratePct });
    }
    out.schedule = schedule;
  }

  for (const key of ["standardCapMonths", "lifetimeThresholdReferrals", "holdbackDays", "cashoutIncrementUsdMinor"] as const) {
    if (body[key] !== undefined) {
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < 0) return { error: `${key} must be a non-negative number` };
      out[key] = Math.round(n);
    }
  }

  if (body["payoutMethods"] !== undefined) {
    if (!Array.isArray(body["payoutMethods"])) return { error: "payoutMethods must be an array" };
    out.payoutMethods = body["payoutMethods"].map((m) => String(m));
  }

  if (body["fxRatesToUsd"] !== undefined) {
    const fx = body["fxRatesToUsd"];
    if (typeof fx !== "object" || fx === null) return { error: "fxRatesToUsd must be an object" };
    const rates: Record<string, number> = {};
    for (const [code, val] of Object.entries(fx as Record<string, unknown>)) {
      const n = Number(val);
      if (!Number.isFinite(n) || n <= 0) return { error: `fxRatesToUsd.${code} must be a positive number` };
      rates[code] = n;
    }
    out.fxRatesToUsd = rates;
  }

  return { values: out };
}

router.put("/ambassador/settings", async (req, res) => {
  const parsed = parseSettings(req.body ?? {});
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const settings = await updateAmbassadorSettings(parsed.values);
  res.json({ settings });
});

// List all ambassadors with derived balances and referral counts.
router.get("/ambassadors", async (_req, res) => {
  const settings = await getAmbassadorSettings();
  const rows = await db
    .select({
      id: studyAmbassadorsTable.id,
      tier: studyAmbassadorsTable.tier,
      status: studyAmbassadorsTable.status,
      referralCode: studyAmbassadorsTable.referralCode,
      payoutMethod: studyAmbassadorsTable.payoutMethod,
      payoutHandle: studyAmbassadorsTable.payoutHandle,
      createdAt: studyAmbassadorsTable.createdAt,
      userName: studyUsersTable.name,
      userEmail: studyUsersTable.email,
    })
    .from(studyAmbassadorsTable)
    .innerJoin(studyUsersTable, eq(studyUsersTable.id, studyAmbassadorsTable.userId))
    .orderBy(desc(studyAmbassadorsTable.createdAt));

  const referralCounts = await db
    .select({
      ambassadorId: studyReferralsTable.ambassadorId,
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${studyReferralsTable.status} = 'active')::int`,
    })
    .from(studyReferralsTable)
    .groupBy(studyReferralsTable.ambassadorId);
  const countsById = new Map(referralCounts.map((r) => [r.ambassadorId, r]));

  const ambassadors = await Promise.all(
    rows.map(async (r) => {
      const balances = await getAmbassadorBalances(r.id, settings);
      const counts = countsById.get(r.id);
      return {
        id: r.id,
        tier: r.tier,
        status: r.status,
        referralCode: r.referralCode,
        payoutMethod: r.payoutMethod,
        payoutHandle: r.payoutHandle,
        userName: r.userName,
        userEmail: r.userEmail,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        referralsTotal: counts?.total ?? 0,
        referralsActive: counts?.active ?? 0,
        balances,
      };
    }),
  );
  res.json({ ambassadors });
});

// Per-ambassador commission ledger.
router.get("/ambassadors/:id/events", async (req, res) => {
  const events = await db
    .select()
    .from(studyCommissionEventsTable)
    .where(eq(studyCommissionEventsTable.ambassadorId, req.params.id))
    .orderBy(desc(studyCommissionEventsTable.createdAt))
    .limit(200);
  res.json({ events });
});

// Grant / revoke lifetime tier.
router.patch("/ambassadors/:id/tier", async (req, res) => {
  const tier = req.body?.tier;
  if (tier !== "standard" && tier !== "lifetime") {
    res.status(400).json({ error: "tier must be 'standard' or 'lifetime'" });
    return;
  }
  const updated = await setAmbassadorTier(req.params.id, tier);
  if (!updated) {
    res.status(404).json({ error: "Ambassador not found" });
    return;
  }
  res.json({ ambassador: updated });
});

// Suspend / reactivate an ambassador.
router.patch("/ambassadors/:id/status", async (req, res) => {
  const status = req.body?.status;
  if (status !== "active" && status !== "suspended") {
    res.status(400).json({ error: "status must be 'active' or 'suspended'" });
    return;
  }
  const updated = await setAmbassadorStatus(req.params.id, status);
  if (!updated) {
    res.status(404).json({ error: "Ambassador not found" });
    return;
  }
  res.json({ ambassador: updated });
});

// Payout queue, newest first, with ambassador identity attached.
router.get("/payouts", async (req, res) => {
  const statusFilter = typeof req.query["status"] === "string" ? req.query["status"] : null;
  const validStatuses = ["requested", "processing", "paid", "failed"];
  const conditions =
    statusFilter && validStatuses.includes(statusFilter)
      ? [eq(studyPayoutsTable.status, statusFilter)]
      : [];
  const rows = await db
    .select({
      id: studyPayoutsTable.id,
      ambassadorId: studyPayoutsTable.ambassadorId,
      amountUsdMinor: studyPayoutsTable.amountUsdMinor,
      method: studyPayoutsTable.method,
      handle: studyPayoutsTable.handle,
      status: studyPayoutsTable.status,
      note: studyPayoutsTable.note,
      requestedAt: studyPayoutsTable.requestedAt,
      settledAt: studyPayoutsTable.settledAt,
      userName: studyUsersTable.name,
      userEmail: studyUsersTable.email,
      referralCode: studyAmbassadorsTable.referralCode,
    })
    .from(studyPayoutsTable)
    .innerJoin(studyAmbassadorsTable, eq(studyAmbassadorsTable.id, studyPayoutsTable.ambassadorId))
    .innerJoin(studyUsersTable, eq(studyUsersTable.id, studyAmbassadorsTable.userId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(studyPayoutsTable.requestedAt))
    .limit(200);
  res.json({ payouts: rows });
});

// Move a payout through its lifecycle (processing | paid | failed).
router.patch("/payouts/:id", async (req, res) => {
  const status = req.body?.status;
  const valid = ["requested", "processing", "paid", "failed"];
  if (!valid.includes(status)) {
    res.status(400).json({ error: `status must be one of ${valid.join(", ")}` });
    return;
  }
  const note = typeof req.body?.note === "string" ? req.body.note : undefined;
  const updated = await updatePayoutStatus(req.params.id, status, note);
  if (!updated) {
    res.status(404).json({ error: "Payout not found" });
    return;
  }
  res.json({ payout: updated });
});

// Manually claw back a commission event (used for mobile-money refunds, which
// have no programmatic refund webhook).
router.post("/ambassador/clawback", async (req, res) => {
  const eventId = req.body?.eventId;
  if (typeof eventId !== "string" || !eventId) {
    res.status(400).json({ error: "eventId is required" });
    return;
  }
  const reason = typeof req.body?.reason === "string" && req.body.reason.trim()
    ? req.body.reason.trim()
    : "admin clawback";
  const ok = await clawbackByEventId(eventId, reason);
  if (!ok) {
    res.status(404).json({ error: "No reversible commission event found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
