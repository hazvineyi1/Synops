import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/requireAuth";
import { requireRole, logAdminAction } from "../lib/roles";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

const INTERVALS = ["monthly", "yearly"];
const PROCESSORS = ["stripe", "flutterwave"];
const RAILS = ["stripe", "flutterwave", "paynow", "manual"];

// Best-effort region for a user: the country on their most recent session.
// Plans are matched by region == this value; admins set plan.region to whatever
// the geo provider emits (an ISO country code or name). Falls back to "global".
async function resolveRegion(userId: string): Promise<string> {
  try {
    const r = await db.execute(sql`
      SELECT country FROM activity_sessions
      WHERE user_id = ${userId} AND country IS NOT NULL AND country <> ''
      ORDER BY started_at DESC LIMIT 1
    `);
    const c = (r.rows?.[0] as any)?.country;
    return c ? String(c) : "global";
  } catch {
    return "global";
  }
}

// GET /billing/plans - active plans for the caller's region (falls back to the
// global catalog when the region has no plans of its own).
router.get("/billing/plans", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const region = await resolveRegion(userId);
  const cols = sql`id, code, name, interval, region, currency, amount_minor, processor`;
  const regional = await db.execute(sql`
    SELECT ${cols} FROM plans
    WHERE active = true AND region = ${region}
    ORDER BY sort, amount_minor
  `);
  let rows = regional.rows ?? [];
  let effectiveRegion = region;
  if (rows.length === 0) {
    const global = await db.execute(sql`
      SELECT ${cols} FROM plans
      WHERE active = true AND region = 'global'
      ORDER BY sort, amount_minor
    `);
    rows = global.rows ?? [];
    effectiveRegion = "global";
  }
  res.json({ region: effectiveRegion, detectedRegion: region, plans: rows });
});

// GET /admin/plans - full pricing catalog incl. inactive (moderator and above).
router.get("/admin/plans", requireAuth, requireRole("moderator"), async (_req, res) => {
  const result = await db.execute(sql`
    SELECT id, product, code, name, interval, region, currency,
           amount_minor, processor, stripe_price_id, active, sort, updated_at
    FROM plans
    ORDER BY region, code, interval, amount_minor
  `);
  res.json({ plans: result.rows ?? [] });
});

function validatePlan(b: any): { ok: true; v: any } | { ok: false; error: string } {
  const code = String(b?.code ?? "").trim().toLowerCase();
  const name = String(b?.name ?? "").trim();
  const interval = String(b?.interval ?? "").trim();
  const region = String(b?.region ?? "global").trim() || "global";
  const currency = (String(b?.currency ?? "USD").trim().toUpperCase()) || "USD";
  const amountMinor = Math.round(Number(b?.amountMinor));
  const processor = String(b?.processor ?? "stripe").trim();
  const stripePriceId = b?.stripePriceId ? String(b.stripePriceId).trim() : null;
  const sort = Number.isFinite(Number(b?.sort)) ? Math.round(Number(b.sort)) : 0;
  if (!code) return { ok: false, error: 'Plan code is required (e.g. "pro").' };
  if (!name) return { ok: false, error: "Display name is required." };
  if (!INTERVALS.includes(interval)) return { ok: false, error: "Interval must be monthly or yearly." };
  if (!PROCESSORS.includes(processor)) return { ok: false, error: "Processor must be stripe or flutterwave." };
  if (!Number.isFinite(amountMinor) || amountMinor < 0) return { ok: false, error: "Amount must be a non-negative number of minor units." };
  if (processor === "stripe" && !stripePriceId) return { ok: false, error: "Stripe plans need a Stripe price id." };
  return { ok: true, v: { code, name, interval, region, currency, amountMinor, processor, stripePriceId, sort } };
}

// POST /admin/plans - add a price to the catalog (super admin only).
router.post("/admin/plans", requireAuth, requireRole("super_admin"), async (req, res) => {
  const parsed = validatePlan(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const v = parsed.v;
  const inserted = await db.execute(sql`
    INSERT INTO plans (code, name, interval, region, currency, amount_minor, processor, stripe_price_id, sort)
    VALUES (${v.code}, ${v.name}, ${v.interval}, ${v.region}, ${v.currency}, ${v.amountMinor}, ${v.processor}, ${v.stripePriceId}, ${v.sort})
    RETURNING id
  `);
  const id = (inserted.rows?.[0] as any)?.id;
  await logAdminAction({
    actorUserId: (req as any).userId,
    action: "plan.create",
    targetType: "plan",
    targetId: String(id),
    metadata: { code: v.code, region: v.region, interval: v.interval, currency: v.currency, amountMinor: v.amountMinor, processor: v.processor },
  });
  res.json({ ok: true, id });
});

// PATCH /admin/plans/:id - edit a price (super admin only).
router.patch("/admin/plans/:id", requireAuth, requireRole("super_admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid plan id" });
    return;
  }
  const parsed = validatePlan(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const v = parsed.v;
  await db.execute(sql`
    UPDATE plans SET
      code = ${v.code}, name = ${v.name}, interval = ${v.interval}, region = ${v.region},
      currency = ${v.currency}, amount_minor = ${v.amountMinor}, processor = ${v.processor},
      stripe_price_id = ${v.stripePriceId}, sort = ${v.sort}, updated_at = now()
    WHERE id = ${id}
  `);
  await logAdminAction({
    actorUserId: (req as any).userId,
    action: "plan.update",
    targetType: "plan",
    targetId: String(id),
    metadata: { code: v.code, region: v.region, interval: v.interval, currency: v.currency, amountMinor: v.amountMinor, processor: v.processor },
  });
  res.json({ ok: true });
});

// POST /admin/plans/:id/toggle - activate/deactivate (super admin only).
router.post("/admin/plans/:id/toggle", requireAuth, requireRole("super_admin"), async (req, res) => {
  const id = Number(req.params.id);
  const active = !!req.body?.active;
  await db.execute(sql`UPDATE plans SET active = ${active}, updated_at = now() WHERE id = ${id}`);
  await logAdminAction({
    actorUserId: (req as any).userId,
    action: active ? "plan.activate" : "plan.deactivate",
    targetType: "plan",
    targetId: String(id),
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Payment methods catalog (the options shown at checkout, routed to a rail).
// ---------------------------------------------------------------------------

// GET /billing/methods - active methods offered in the caller's region.
router.get("/billing/methods", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const region = await resolveRegion(userId);
  const result = await db.execute(sql`
    SELECT id, code, label, rail, regions, instructions
    FROM payment_methods
    WHERE active = true AND (${region} = ANY(regions) OR 'global' = ANY(regions))
    ORDER BY sort, label
  `);
  res.json({ region, methods: result.rows ?? [] });
});

// GET /admin/payment-methods - full catalog incl. inactive (moderator and above).
router.get("/admin/payment-methods", requireAuth, requireRole("moderator"), async (_req, res) => {
  const result = await db.execute(sql`
    SELECT id, product, code, label, rail, regions, instructions, active, sort, updated_at
    FROM payment_methods
    ORDER BY sort, label
  `);
  res.json({ methods: result.rows ?? [] });
});

function parseRegions(input: any): string[] {
  let arr: string[] = [];
  if (Array.isArray(input)) arr = input.map((x) => String(x));
  else if (typeof input === "string") arr = input.split(",");
  arr = arr.map((s) => s.trim()).filter(Boolean);
  return arr.length > 0 ? Array.from(new Set(arr)) : ["global"];
}

function validateMethod(b: any): { ok: true; v: any } | { ok: false; error: string } {
  const code = String(b?.code ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  const label = String(b?.label ?? "").trim();
  const rail = String(b?.rail ?? "manual").trim();
  const regions = parseRegions(b?.regions);
  const instructions = b?.instructions ? String(b.instructions).trim() : null;
  const sort = Number.isFinite(Number(b?.sort)) ? Math.round(Number(b.sort)) : 0;
  if (!code) return { ok: false, error: "Method code is required (e.g. \"ecocash\")." };
  if (!label) return { ok: false, error: "Display label is required." };
  if (!RAILS.includes(rail)) return { ok: false, error: "Rail must be stripe, flutterwave, paynow, or manual." };
  if (rail === "manual" && !instructions) return { ok: false, error: "Manual methods need payment instructions for the customer." };
  return { ok: true, v: { code, label, rail, regions, instructions, sort } };
}

// POST /admin/payment-methods - add a method (super admin only).
router.post("/admin/payment-methods", requireAuth, requireRole("super_admin"), async (req, res) => {
  const parsed = validateMethod(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const v = parsed.v;
  const inserted = await db.execute(sql`
    INSERT INTO payment_methods (code, label, rail, regions, instructions, sort)
    VALUES (${v.code}, ${v.label}, ${v.rail}, ${v.regions}, ${v.instructions}, ${v.sort})
    RETURNING id
  `);
  const id = (inserted.rows?.[0] as any)?.id;
  await logAdminAction({
    actorUserId: (req as any).userId,
    action: "payment_method.create",
    targetType: "payment_method",
    targetId: String(id),
    metadata: { code: v.code, rail: v.rail, regions: v.regions },
  });
  res.json({ ok: true, id });
});

// PATCH /admin/payment-methods/:id - edit a method (super admin only).
router.patch("/admin/payment-methods/:id", requireAuth, requireRole("super_admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid method id" });
    return;
  }
  const parsed = validateMethod(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const v = parsed.v;
  await db.execute(sql`
    UPDATE payment_methods SET
      code = ${v.code}, label = ${v.label}, rail = ${v.rail}, regions = ${v.regions},
      instructions = ${v.instructions}, sort = ${v.sort}, updated_at = now()
    WHERE id = ${id}
  `);
  await logAdminAction({
    actorUserId: (req as any).userId,
    action: "payment_method.update",
    targetType: "payment_method",
    targetId: String(id),
    metadata: { code: v.code, rail: v.rail, regions: v.regions },
  });
  res.json({ ok: true });
});

// POST /admin/payment-methods/:id/toggle - activate/deactivate (super admin only).
router.post("/admin/payment-methods/:id/toggle", requireAuth, requireRole("super_admin"), async (req, res) => {
  const id = Number(req.params.id);
  const active = !!req.body?.active;
  await db.execute(sql`UPDATE payment_methods SET active = ${active}, updated_at = now() WHERE id = ${id}`);
  await logAdminAction({
    actorUserId: (req as any).userId,
    action: active ? "payment_method.activate" : "payment_method.deactivate",
    targetType: "payment_method",
    targetId: String(id),
  });
  res.json({ ok: true });
});

export default router;
