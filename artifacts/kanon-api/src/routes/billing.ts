import { Router } from "express";
import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, organizationsTable, usersTable } from "@workspace/kanon-db";
import { CreateBillingCheckoutBody, ReconcileBillingBody } from "@workspace/kanon-api-zod";
import {
  PLANS,
  effectiveTier,
  activeCourseLimit,
  countActiveCourses,
  hasTrialExpired,
  type OrgBilling,
} from "../lib/billing";
import { getUncachableStripeClient } from "../lib/stripeClient";
import {
  ensureStripeCustomer,
  resolvePriceId,
  applySubscriptionToOrg,
  type BillingInterval,
} from "../lib/stripeBilling";
import { blockWhileImpersonating } from "../lib/auth";

/**
 * Billing routes.
 *
 * Engine routes (mounted inside /compass, already authenticated + product-gated
 * + actor-loaded) let an org-bound school_admin subscribe and manage billing for
 * their OWN organization. We never accept an organization id from the client: the
 * billed org is always the actor's org. Builders and global admins without an org
 * cannot manage billing, and every mutation is blocked while impersonating.
 */

// ── Engine (inside /compass) ────────────────────────────────────
const router: Router = Router();

/**
 * The organization the acting user may bill. Always the actor's own org; never
 * client-supplied. Builders and accounts with no org are refused. Writes the
 * 403 itself and returns null when the actor cannot manage billing.
 */
function resolveBillingOrg(req: Request, res: Response): number | null {
  const actor = req.actor!;
  if (actor.role === "builder") {
    res.status(403).json({ error: "Builders cannot manage billing." });
    return null;
  }
  if (actor.organizationId == null) {
    res.status(403).json({ error: "No organization is associated with this account." });
    return null;
  }
  return actor.organizationId;
}

function appBaseUrl(req: Request): string {
  const domains = (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (domains[0]) return `https://${domains[0]}`;
  return `${req.protocol}://${req.get("host")}`;
}

async function buildSubscriptionView(orgId: number) {
  const [org] = await db
    .select({
      id: organizationsTable.id,
      type: organizationsTable.type,
      name: organizationsTable.name,
      planTier: organizationsTable.planTier,
      subscriptionStatus: organizationsTable.subscriptionStatus,
      trialEndsAt: organizationsTable.trialEndsAt,
      currentPeriodEnd: organizationsTable.currentPeriodEnd,
      stripeCustomerId: organizationsTable.stripeCustomerId,
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId));
  if (!org) return null;

  const billing: OrgBilling = {
    id: org.id,
    type: org.type,
    planTier: org.planTier,
    subscriptionStatus: org.subscriptionStatus,
    trialEndsAt: org.trialEndsAt,
    currentPeriodEnd: org.currentPeriodEnd,
  };
  const tier = effectiveTier(billing);
  const plan = PLANS[tier];
  const activeCourseCount = await countActiveCourses(orgId);

  return {
    tier,
    planLabel: plan.label,
    planTier: org.planTier,
    subscriptionStatus: org.subscriptionStatus,
    trialEndsAt: org.trialEndsAt ? org.trialEndsAt.toISOString() : null,
    currentPeriodEnd: org.currentPeriodEnd ? org.currentPeriodEnd.toISOString() : null,
    activeCourseLimit: activeCourseLimit(billing),
    activeCourseCount,
    features: plan.features,
    trialExpired: hasTrialExpired(billing),
    hasStripeCustomer: org.stripeCustomerId != null,
  };
}

router.get("/billing/subscription", async (req, res): Promise<void> => {
  const orgId = resolveBillingOrg(req, res);
  if (orgId == null) return;
  const view = await buildSubscriptionView(orgId);
  if (!view) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  res.json(view);
});

router.post("/billing/checkout", blockWhileImpersonating, async (req, res): Promise<void> => {
  const orgId = resolveBillingOrg(req, res);
  if (orgId == null) return;

  const parsed = CreateBillingCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tier = parsed.data.tier;
  const interval = parsed.data.interval as BillingInterval;

  try {
    const stripe = await getUncachableStripeClient();
    const priceId = await resolvePriceId(stripe, tier, interval);
    if (!priceId) {
      req.log.error({ tier, interval }, "No Stripe price configured for plan");
      res.status(400).json({ error: "That plan is not available for purchase yet." });
      return;
    }

    const [actorUser] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, req.actor!.userId));
    if (!actorUser) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const customerId = await ensureStripeCustomer(orgId, actorUser.email);
    const base = appBaseUrl(req);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: String(orgId),
      subscription_data: { metadata: { organizationId: String(orgId) } },
      allow_promotion_codes: true,
      success_url: `${base}/compass/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/compass/billing?checkout=cancel`,
    });

    if (!session.url) {
      res.status(502).json({ error: "Stripe did not return a checkout URL." });
      return;
    }
    res.json({ url: session.url });
  } catch (err) {
    req.log.error({ err }, "Stripe checkout creation failed");
    res.status(502).json({ error: "Could not start checkout. Please try again." });
  }
});

router.post("/billing/portal", blockWhileImpersonating, async (req, res): Promise<void> => {
  const orgId = resolveBillingOrg(req, res);
  if (orgId == null) return;

  try {
    const [org] = await db
      .select({ stripeCustomerId: organizationsTable.stripeCustomerId })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId));
    if (!org?.stripeCustomerId) {
      res.status(400).json({ error: "No billing account yet. Start a subscription first." });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const base = appBaseUrl(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${base}/compass/billing`,
    });
    res.json({ url: session.url });
  } catch (err) {
    req.log.error({ err }, "Stripe billing portal creation failed");
    res.status(502).json({ error: "Could not open the billing portal. Please try again." });
  }
});

router.post("/billing/reconcile", blockWhileImpersonating, async (req, res): Promise<void> => {
  const orgId = resolveBillingOrg(req, res);
  if (orgId == null) return;

  const parsed = ReconcileBillingBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const sessionId = parsed.data.sessionId;

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      // Only reconcile a session that belongs to THIS org, so a leaked session
      // id cannot attach another tenant's subscription to the caller.
      if (session.client_reference_id !== String(orgId)) {
        res.status(404).json({ error: "Checkout session not found" });
        return;
      }
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        await applySubscriptionToOrg(sub);
      }
    } else {
      // No session id: refresh from the org's stored subscription, if any.
      const [org] = await db
        .select({ stripeSubscriptionId: organizationsTable.stripeSubscriptionId })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, orgId));
      if (org?.stripeSubscriptionId) {
        const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
        await applySubscriptionToOrg(sub);
      }
    }

    const view = await buildSubscriptionView(orgId);
    if (!view) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }
    res.json(view);
  } catch (err) {
    req.log.error({ err }, "Stripe reconcile failed");
    res.status(502).json({ error: "Could not refresh billing. Please try again." });
  }
});

export default router;
