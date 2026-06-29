import { Router } from "express";
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
