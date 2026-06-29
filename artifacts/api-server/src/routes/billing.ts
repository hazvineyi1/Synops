import { Router } from "express";
import crypto from "node:crypto";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  createCheckoutSession,
  createPortalSession,
  verifyStripeSignature,
  stripeConfigured,
  priceIdFor,
  TRIAL_DAYS,
  flutterwaveConfigured,
  createFlutterwavePayment,
  verifyFlutterwaveTransaction,
  verifyFlutterwaveWebhook,
} from "../lib/billing";

const router = Router();

// Absolute base URL for Stripe redirect URLs, honoring proxy headers.
function appBaseUrl(req: any): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host;
  return `${proto}://${host}`;
}

// GET /billing/status — current plan/trial, for the client to render gates + upsell.
router.get("/billing/status", requireAuth, async (req, res) => {
  const ent = (req as any).entitlement;
  const userId = (req as any).userId;
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  res.json({
    ...ent,
    hasStripeCustomer: !!rows[0]?.stripeCustomerId,
    stripeEnabled: stripeConfigured(),
    flutterwaveEnabled: flutterwaveConfigured(),
    subscriptionExpiresAt: rows[0]?.subscriptionExpiresAt
      ? new Date(rows[0].subscriptionExpiresAt).toISOString()
      : null,
    trialDays: TRIAL_DAYS,
    prices: {
      monthly: { label: "$19 / month", configured: !!priceIdFor("monthly") },
      yearly: { label: "$149 / year", configured: !!priceIdFor("yearly") },
    },
  });
});

// POST /billing/checkout — start Stripe Checkout for the monthly/yearly plan.
router.post("/billing/checkout", requireAuth, async (req, res) => {
  if (!stripeConfigured()) {
    res.status(503).json({ error: "Billing is not configured." });
    return;
  }
  const userId = (req as any).userId;

  // Prefer a catalog plan when the client sends a planId (regional pricing).
  // A Stripe plan carries its own price id; Flutterwave plans can't check out
  // through Stripe yet (that arrives with the Flutterwave integration). When no
  // planId is given we fall back to the env-configured monthly/yearly prices so
  // existing clients keep working.
  let priceId: string | undefined;
  const planId = Number(req.body?.planId);
  if (Number.isFinite(planId) && planId > 0) {
    const row = (
      await db.execute(sql`
        SELECT processor, stripe_price_id FROM plans
        WHERE id = ${planId} AND active = true LIMIT 1
      `)
    ).rows?.[0] as any;
    if (!row) {
      res.status(404).json({ error: "That plan is not available." });
      return;
    }
    if (row.processor !== "stripe") {
      res.status(409).json({ error: "This plan is sold through a different payment method." });
      return;
    }
    priceId = row.stripe_price_id ?? undefined;
  } else {
    const plan = req.body?.plan === "yearly" ? "yearly" : "monthly";
    priceId = priceIdFor(plan);
  }
  if (!priceId) {
    res.status(503).json({ error: "That plan is not available." });
    return;
  }

  const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = rows[0];
  const base = appBaseUrl(req);
  try {
    const { url } = await createCheckoutSession({
      priceId,
      userId,
      customerId: user?.stripeCustomerId ?? null,
      customerEmail: user?.email ?? null,
      successUrl: `${base}/settings?checkout=success`,
      cancelUrl: `${base}/settings?checkout=cancelled`,
    });
    res.json({ url });
  } catch (err) {
    logger.error({ err, userId }, "checkout session failed");
    res.status(502).json({ error: "Could not start checkout. Please try again." });
  }
});

// POST /billing/portal — open the Stripe billing portal to manage/cancel.
router.post("/billing/portal", requireAuth, async (req, res) => {
  if (!stripeConfigured()) {
    res.status(503).json({ error: "Billing is not configured." });
    return;
  }
  const userId = (req as any).userId;
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const customerId = rows[0]?.stripeCustomerId;
  if (!customerId) {
    res.status(400).json({ error: "No billing account yet." });
    return;
  }
  try {
    const { url } = await createPortalSession({ customerId, returnUrl: `${appBaseUrl(req)}/settings` });
    res.json({ url });
  } catch (err) {
    logger.error({ err, userId }, "portal session failed");
    res.status(502).json({ error: "Could not open the billing portal." });
  }
});

// POST /billing/webhook — Stripe events. No requireAuth (Stripe is the caller);
// the raw body needed for signature verification is wired up in app.ts.
router.post("/billing/webhook", async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    res.status(503).end();
    return;
  }
  const raw = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : typeof req.body === "string"
      ? req.body
      : "";
  const sig = req.headers["stripe-signature"] as string | undefined;
  if (!verifyStripeSignature(raw, sig, secret)) {
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    res.status(400).end();
    return;
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    logger.error({ err, type: event?.type }, "stripe webhook handler error");
    // Still acknowledge so Stripe does not retry on our internal errors.
  }
  res.json({ received: true });
});

// ---------------------------------------------------------------------------
// Flutterwave: hosted-payment flow for African regional plans (one-off charge
// granting a fixed Pro period). Stripe stays the rail for auto-renewing plans.
// ---------------------------------------------------------------------------

// Period end for a paid interval, extending an existing future expiry (renewal).
function periodEnd(interval: string | null | undefined, fromMs: number): Date {
  const days = interval === "yearly" ? 365 : 30;
  return new Date(fromMs + days * 86400000);
}

// Idempotently mark a payment successful and grant the Pro period. Safe to call
// from both the redirect verify and the webhook — only the first one upgrades.
async function grantFlutterwavePeriod(opts: {
  txRef: string;
  providerRef: string | null;
}): Promise<{ granted: boolean; status: string }> {
  const rows = (
    await db.execute(sql`
      SELECT id, user_id, plan_code, interval, status FROM payments
      WHERE tx_ref = ${opts.txRef} LIMIT 1
    `)
  ).rows as any[];
  const pay = rows?.[0];
  if (!pay) return { granted: false, status: "not_found" };
  if (pay.status === "successful") return { granted: false, status: "already" };

  const userId = pay.user_id as string;
  // Extend from the later of now / current expiry so renewals stack.
  const cur = (
    await db.execute(sql`SELECT subscription_expires_at FROM users WHERE id = ${userId} LIMIT 1`)
  ).rows?.[0] as any;
  const curExp = cur?.subscription_expires_at ? new Date(cur.subscription_expires_at).getTime() : 0;
  const base = Math.max(Date.now(), curExp);
  const expires = periodEnd(pay.interval, base);

  await db.execute(sql`
    UPDATE payments SET status = 'successful', provider_ref = ${opts.providerRef}, updated_at = now()
    WHERE tx_ref = ${opts.txRef}
  `);
  await db.execute(sql`
    UPDATE users SET
      subscription_tier = 'pro',
      subscription_status = 'active',
      subscription_expires_at = ${expires.toISOString()}
    WHERE id = ${userId}
  `);
  return { granted: true, status: "granted" };
}

// POST /billing/flutterwave/checkout — start a Flutterwave payment for a plan.
router.post("/billing/flutterwave/checkout", requireAuth, async (req, res) => {
  if (!flutterwaveConfigured()) {
    res.status(503).json({ error: "Mobile money / card payments are not configured yet." });
    return;
  }
  const userId = (req as any).userId as string;
  const planId = Number(req.body?.planId);
  if (!Number.isFinite(planId) || planId <= 0) {
    res.status(400).json({ error: "A plan is required." });
    return;
  }
  const plan = (
    await db.execute(sql`
      SELECT id, code, name, interval, currency, amount_minor, processor
      FROM plans WHERE id = ${planId} AND active = true LIMIT 1
    `)
  ).rows?.[0] as any;
  if (!plan) {
    res.status(404).json({ error: "That plan is not available." });
    return;
  }
  if (plan.processor !== "flutterwave") {
    res.status(409).json({ error: "This plan is sold through a different payment method." });
    return;
  }

  const user = (
    await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1)
  )[0];
  if (!user?.email) {
    res.status(400).json({ error: "Your account needs an email before paying." });
    return;
  }

  const txRef = `arete-${crypto.randomUUID()}`;
  const amountMinor = Number(plan.amount_minor);
  await db.execute(sql`
    INSERT INTO payments (tx_ref, user_id, processor, plan_id, plan_code, interval, amount_minor, currency, status)
    VALUES (${txRef}, ${userId}, 'flutterwave', ${plan.id}, ${plan.code}, ${plan.interval}, ${amountMinor}, ${plan.currency}, 'pending')
  `);

  try {
    const { link } = await createFlutterwavePayment({
      txRef,
      amountMajor: amountMinor / 100,
      currency: plan.currency,
      customerEmail: user.email,
      customerName: user.name ?? undefined,
      redirectUrl: `${appBaseUrl(req)}/settings?flw=return`,
      title: `Arete ${plan.name} (${plan.interval})`,
      meta: { userId, planId: plan.id, txRef },
    });
    res.json({ url: link });
  } catch (err) {
    logger.error({ err, userId, planId }, "flutterwave checkout failed");
    await db.execute(sql`UPDATE payments SET status = 'failed', updated_at = now() WHERE tx_ref = ${txRef}`);
    res.status(502).json({ error: "Could not start payment. Please try again." });
  }
});

// GET /billing/flutterwave/verify — called from the redirect-back page. Verifies
// the transaction server-side and grants the Pro period on success.
router.get("/billing/flutterwave/verify", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const transactionId = String(req.query.transaction_id ?? "").trim();
  const txRefQ = String(req.query.tx_ref ?? "").trim();
  if (!transactionId) {
    res.status(400).json({ ok: false, error: "Missing transaction id." });
    return;
  }
  try {
    const v = await verifyFlutterwaveTransaction(transactionId);
    const txRef = v.txRef || txRefQ;
    if (!txRef) {
      res.status(400).json({ ok: false, error: "Could not match this payment." });
      return;
    }
    const pay = (
      await db.execute(sql`SELECT user_id, amount_minor, currency, status FROM payments WHERE tx_ref = ${txRef} LIMIT 1`)
    ).rows?.[0] as any;
    if (!pay || pay.user_id !== userId) {
      res.status(404).json({ ok: false, error: "Payment not found." });
      return;
    }
    if (pay.status === "successful") {
      res.json({ ok: true, status: "already_active" });
      return;
    }
    // Guard against tampering: amount + currency must match what we charged.
    const amountOk = Math.round(v.amount * 100) >= Number(pay.amount_minor);
    const currencyOk = v.currency.toUpperCase() === String(pay.currency).toUpperCase();
    if (!v.successful || !amountOk || !currencyOk) {
      await db.execute(sql`UPDATE payments SET status = 'failed', updated_at = now() WHERE tx_ref = ${txRef}`);
      res.json({ ok: false, status: v.status });
      return;
    }
    await grantFlutterwavePeriod({ txRef, providerRef: String(v.transactionId ?? transactionId) });
    res.json({ ok: true, status: "active" });
  } catch (err) {
    logger.error({ err, userId, transactionId }, "flutterwave verify failed");
    res.status(502).json({ ok: false, error: "Could not verify the payment." });
  }
});

// POST /billing/flutterwave/webhook — Flutterwave server-to-server confirmation.
router.post("/billing/flutterwave/webhook", async (req, res) => {
  const sig = req.headers["verif-hash"] as string | undefined;
  if (!verifyFlutterwaveWebhook(sig)) {
    res.status(401).end();
    return;
  }
  const event = req.body ?? {};
  const data = event?.data ?? {};
  try {
    if (event?.event === "charge.completed" && data?.status === "successful" && data?.tx_ref) {
      // Re-verify with the API before granting (don't trust the body alone).
      const v = await verifyFlutterwaveTransaction(data.id ?? data.tx_ref);
      if (v.successful && (v.txRef === data.tx_ref || !v.txRef)) {
        await grantFlutterwavePeriod({ txRef: data.tx_ref, providerRef: String(v.transactionId ?? data.id ?? "") });
      }
    }
  } catch (err) {
    logger.error({ err, type: event?.event }, "flutterwave webhook handler error");
  }
  res.json({ received: true });
});

async function handleStripeEvent(event: any): Promise<void> {
  const obj = event?.data?.object ?? {};
  switch (event?.type) {
    case "checkout.session.completed": {
      const userId = obj.client_reference_id;
      const customerId = obj.customer;
      if (userId) {
        await db
          .update(usersTable)
          .set({
            stripeCustomerId: customerId ?? null,
            subscriptionTier: "pro",
            subscriptionStatus: "active",
          })
          .where(eq(usersTable.id, userId));
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const customerId = obj.customer;
      const status = obj.status; // active | trialing | past_due | canceled | unpaid | ...
      const tier = status === "active" || status === "trialing" ? "pro" : "free";
      if (customerId) {
        await db
          .update(usersTable)
          .set({ subscriptionStatus: status ?? "none", subscriptionTier: tier })
          .where(eq(usersTable.stripeCustomerId, customerId));
      }
      break;
    }
    case "customer.subscription.deleted": {
      const customerId = obj.customer;
      if (customerId) {
        await db
          .update(usersTable)
          .set({ subscriptionStatus: "canceled", subscriptionTier: "free" })
          .where(eq(usersTable.stripeCustomerId, customerId));
      }
      break;
    }
    default:
      break;
  }
}

export default router;
