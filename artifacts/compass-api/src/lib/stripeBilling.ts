import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, organizationsTable } from "@workspace/compass-db";
import { isPlanTier, tierFromLookupKey, PLANS, type PlanTier } from "./billing";
import { getUncachableStripeClient } from "./stripeClient";

/**
 * Stripe <-> organization synchronization helpers.
 *
 * These map a Stripe subscription/customer back onto the owning organization's
 * billing columns. The org is the customer (tenant subscribes). All writes are
 * idempotent so webhooks and the reconcile endpoint can both apply the same
 * subscription without conflict. None of this is ever used for authorization.
 */

export type BillingInterval = "month" | "year";

function customerIdOf(sub: Stripe.Subscription): string | null {
  return typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null);
}

/**
 * The subscription's current period end. Read from the subscription top-level
 * field, falling back to the first item, to tolerate Stripe API-version
 * differences in where the field lives.
 */
export function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const top = (sub as unknown as { current_period_end?: number }).current_period_end;
  const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  const unix = top ?? item?.current_period_end;
  return typeof unix === "number" ? new Date(unix * 1000) : null;
}

/** Map a subscription to a plan tier via the price metadata.tier or lookup_key. */
export function tierFromSubscription(sub: Stripe.Subscription): PlanTier | null {
  const price = sub.items?.data?.[0]?.price;
  if (!price) return null;
  const metaTier = price.metadata?.tier;
  if (isPlanTier(metaTier)) return metaTier;
  return tierFromLookupKey(price.lookup_key);
}

/**
 * Apply a Stripe subscription's state to the owning organization. Matches the
 * org by stored stripeCustomerId, falling back to the customer's
 * metadata.organizationId. Returns the updated orgId, or null when no org could
 * be matched (logged by the caller).
 */
export async function applySubscriptionToOrg(sub: Stripe.Subscription): Promise<number | null> {
  const customerId = customerIdOf(sub);
  if (!customerId) return null;

  const [byCustomer] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.stripeCustomerId, customerId));
  let orgId = byCustomer?.id ?? null;

  if (orgId == null) {
    const stripe = await getUncachableStripeClient();
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted) {
      const metaOrg = Number(customer.metadata?.organizationId);
      if (Number.isInteger(metaOrg) && metaOrg > 0) orgId = metaOrg;
    }
  }
  if (orgId == null) return null;

  const tier = tierFromSubscription(sub);
  const updates: Record<string, unknown> = {
    subscriptionStatus: sub.status,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: customerId,
    currentPeriodEnd: subscriptionPeriodEnd(sub),
  };
  if (tier) updates.planTier = tier;

  await db.update(organizationsTable).set(updates).where(eq(organizationsTable.id, orgId));
  return orgId;
}

/**
 * Ensure the organization has a Stripe customer, creating one if needed and
 * persisting its id. The customer carries metadata.organizationId so a webhook
 * can recover the org even before the id round-trips back to our DB.
 */
export async function ensureStripeCustomer(
  orgId: number,
  fallbackEmail: string,
): Promise<string> {
  const [org] = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      stripeCustomerId: organizationsTable.stripeCustomerId,
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId));

  if (!org) throw new Error(`Organization ${orgId} not found`);
  if (org.stripeCustomerId) return org.stripeCustomerId;

  const stripe = await getUncachableStripeClient();
  const customer = await stripe.customers.create({
    email: fallbackEmail,
    name: org.name,
    metadata: { organizationId: String(orgId) },
  });

  await db
    .update(organizationsTable)
    .set({ stripeCustomerId: customer.id })
    .where(eq(organizationsTable.id, orgId));
  return customer.id;
}

/**
 * Resolve the Stripe Price id for a plan tier + interval from its lookup_key.
 * We never accept a client-supplied price id; the client picks a tier+interval
 * and the server resolves the trusted price. Returns null when the price is not
 * configured in Stripe (the seed-products script has not been run for it).
 */
export async function resolvePriceId(
  stripe: Stripe,
  tier: PlanTier,
  interval: BillingInterval,
): Promise<string | null> {
  const plan = PLANS[tier];
  const lookupKey = interval === "year" ? plan.yearlyLookupKey : plan.monthlyLookupKey;
  if (!lookupKey) return null;
  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  return prices.data[0]?.id ?? null;
}
