import { Router } from "express";
import { db } from "@workspace/db";
import { billingSubscriptionsTable, billingInvoicesTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { isSuperAdmin, isFacilitator } from "../lib/roles";
import { logAudit } from "../lib/audit";

/**
 * Partner Financial Hub backend: real subscriptions + invoices per partner. Super admin manages any
 * partner; a partner_admin manages their own. Endpoints self-create the tables so no separate
 * migration step is needed. VAT / monthly totals are derived in the UI, not stored here.
 */
const router = Router();

function canManage(user: { role: string; partnerId?: string | null }, partnerId: string) {
  // Tenant match AND a facilitator-tier role. A learner/coach carries partnerId too, so a bare
  // tenant match let them read/write billing + invoices — this adds the role gate.
  return isSuperAdmin(user.role) || (isFacilitator(user.role) && user.partnerId === partnerId);
}
const int = (v: unknown, d = 0) => (Number.isFinite(+(v as number)) ? Math.max(0, Math.trunc(+(v as number))) : d);

async function ensureTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS billing_subscriptions (
      id text PRIMARY KEY,
      partner_id text NOT NULL,
      org_id text,
      org_name text,
      plan_name text NOT NULL DEFAULT 'Standard',
      price_per_seat integer NOT NULL DEFAULT 0,
      seats integer NOT NULL DEFAULT 0,
      active_seats integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS billing_invoices (
      id text PRIMARY KEY,
      partner_id text NOT NULL,
      org_id text,
      org_name text,
      number text NOT NULL,
      period text,
      net integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'due',
      issued text,
      due text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
}

// GET /partners/:partnerId/billing — subscriptions + invoices for a partner.
router.get("/partners/:partnerId/billing", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  if (!canManage(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const [subscriptions, invoices] = await Promise.all([
      db.select().from(billingSubscriptionsTable).where(eq(billingSubscriptionsTable.partnerId, partnerId)).orderBy(desc(billingSubscriptionsTable.createdAt)),
      db.select().from(billingInvoicesTable).where(eq(billingInvoicesTable.partnerId, partnerId)).orderBy(desc(billingInvoicesTable.createdAt)),
    ]);
    res.json({ subscriptions, invoices });
  } catch {
    res.json({ subscriptions: [], invoices: [] }); // tables not created yet
  }
});

// POST /partners/:partnerId/subscriptions
router.post("/partners/:partnerId/subscriptions", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  if (!canManage(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const b = req.body ?? {};
  await ensureTables();
  const [row] = await db.insert(billingSubscriptionsTable).values({
    partnerId,
    orgId: b.orgId ? String(b.orgId) : null,
    orgName: b.orgName ? String(b.orgName) : null,
    planName: b.planName ? String(b.planName) : "Standard",
    pricePerSeat: int(b.pricePerSeat),
    seats: int(b.seats),
    activeSeats: int(b.activeSeats),
  }).returning();
  await logAudit(req, "billing.subscription_create", "subscription", row.id, { org: row.orgName });
  res.status(201).json(row);
});

// PATCH /partners/:partnerId/subscriptions/:id
router.patch("/partners/:partnerId/subscriptions/:id", requireAuth, async (req, res) => {
  const { partnerId, id } = req.params;
  if (!canManage(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const b = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (b.planName !== undefined) patch.planName = String(b.planName);
  if (b.pricePerSeat !== undefined) patch.pricePerSeat = int(b.pricePerSeat);
  if (b.seats !== undefined) patch.seats = int(b.seats);
  if (b.activeSeats !== undefined) patch.activeSeats = int(b.activeSeats);
  if (b.orgName !== undefined) patch.orgName = b.orgName ? String(b.orgName) : null;
  const [row] = await db.update(billingSubscriptionsTable).set(patch)
    .where(and(eq(billingSubscriptionsTable.id, id), eq(billingSubscriptionsTable.partnerId, partnerId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// DELETE /partners/:partnerId/subscriptions/:id
router.delete("/partners/:partnerId/subscriptions/:id", requireAuth, async (req, res) => {
  const { partnerId, id } = req.params;
  if (!canManage(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(billingSubscriptionsTable).where(and(eq(billingSubscriptionsTable.id, id), eq(billingSubscriptionsTable.partnerId, partnerId)));
  res.status(204).send();
});

// POST /partners/:partnerId/invoices
router.post("/partners/:partnerId/invoices", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  if (!canManage(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const b = req.body ?? {};
  await ensureTables();
  const number = b.number ? String(b.number) : `INV-${Date.now().toString().slice(-6)}`;
  const [row] = await db.insert(billingInvoicesTable).values({
    partnerId,
    orgId: b.orgId ? String(b.orgId) : null,
    orgName: b.orgName ? String(b.orgName) : null,
    number,
    period: b.period ? String(b.period) : null,
    net: int(b.net),
    status: b.status ? String(b.status) : "due",
    issued: b.issued ? String(b.issued) : null,
    due: b.due ? String(b.due) : null,
  }).returning();
  await logAudit(req, "billing.invoice_create", "invoice", row.id, { number: row.number, net: row.net });
  res.status(201).json(row);
});

// PATCH /partners/:partnerId/invoices/:id — edit net / mark paid.
router.patch("/partners/:partnerId/invoices/:id", requireAuth, async (req, res) => {
  const { partnerId, id } = req.params;
  if (!canManage(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const b = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (b.net !== undefined) patch.net = int(b.net);
  if (b.status !== undefined) patch.status = String(b.status);
  if (b.period !== undefined) patch.period = b.period ? String(b.period) : null;
  if (b.orgName !== undefined) patch.orgName = b.orgName ? String(b.orgName) : null;
  const [row] = await db.update(billingInvoicesTable).set(patch)
    .where(and(eq(billingInvoicesTable.id, id), eq(billingInvoicesTable.partnerId, partnerId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (b.status === "paid") await logAudit(req, "billing.invoice_paid", "invoice", row.id, { number: row.number });
  res.json(row);
});

// DELETE /partners/:partnerId/invoices/:id
router.delete("/partners/:partnerId/invoices/:id", requireAuth, async (req, res) => {
  const { partnerId, id } = req.params;
  if (!canManage(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(billingInvoicesTable).where(and(eq(billingInvoicesTable.id, id), eq(billingInvoicesTable.partnerId, partnerId)));
  res.status(204).send();
});

export default router;
