import { db, studyUsersTable, studyPaymentsTable, studyCouponsTable } from "@workspace/paideia-db";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import { getUncachableStripeClient } from "../stripeClient.js";
import { isTier, type BillingInterval } from "./config.js";
import { creditCommissionForPayment } from "./ambassador.js";

export function computePeriodEnd(interval: BillingInterval, from: Date = new Date()): Date {
  const end = new Date(from);
  if (interval === "year") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

export interface PaymentRow {
  id: string;
  userId: string;
  provider: string;
  method: string;
  country: string;
  currency: string;
  amountMinor: number;
  interval: string;
  reference: string;
  providerRef: string | null;
  pollUrl: string | null;
  status: string;
  mobileNumber: string | null;
}

export async function getPaymentByReference(reference: string) {
  const rows = await db
    .select()
    .from(studyPaymentsTable)
    .where(eq(studyPaymentsTable.reference, reference))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPaymentById(id: string) {
  const rows = await db
    .select()
    .from(studyPaymentsTable)
    .where(eq(studyPaymentsTable.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// Mark a payment paid and reflect Pro access onto the user. Idempotent: a payment
// already marked paid will not extend the subscription again.
export async function activatePayment(
  reference: string,
  raw?: Record<string, unknown>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(studyPaymentsTable)
      .where(eq(studyPaymentsTable.reference, reference))
      .for("update")
      .limit(1);
    const payment = rows[0];
    if (!payment) {
      logger.warn({ reference }, "activatePayment: payment not found");
      return;
    }
    if (payment.status === "paid") return; // already processed

    const interval = (payment.interval === "year" ? "year" : "month") as BillingInterval;
    const periodEnd = computePeriodEnd(interval);
    const tier = isTier(payment.tier) ? payment.tier : "pro";

    await tx
      .update(studyPaymentsTable)
      .set({
        status: "paid",
        paidAt: new Date(),
        updatedAt: new Date(),
        raw: raw ?? payment.raw,
      })
      .where(eq(studyPaymentsTable.id, payment.id));

    await tx
      .update(studyUsersTable)
      .set({
        subscriptionTier: tier,
        subscriptionStatus: "active",
        subscriptionProvider: payment.provider,
        subscriptionInterval: interval,
        billingCountry: payment.country,
        subscriptionCurrentPeriodEnd: periodEnd,
      })
      .where(eq(studyUsersTable.id, payment.userId));

    // Count the redemption once, only now that the payment has cleared. The
    // increment is gated on the cap in the same statement so concurrent
    // checkouts against the last remaining redemption cannot oversubscribe.
    if (payment.couponCode) {
      await tx
        .update(studyCouponsTable)
        .set({ timesRedeemed: sql`${studyCouponsTable.timesRedeemed} + 1` })
        .where(
          and(
            eq(studyCouponsTable.code, payment.couponCode),
            or(
              isNull(studyCouponsTable.maxRedemptions),
              sql`${studyCouponsTable.timesRedeemed} < ${studyCouponsTable.maxRedemptions}`,
            ),
          ),
        );
    }

    // Mint any ambassador residual from this cleared payment, in the same
    // transaction. Idempotent on (sourceKind, sourcePaymentId), so a replayed
    // webhook/poll cannot double-credit.
    await creditCommissionForPayment(
      {
        customerId: payment.userId,
        sourceKind: "local",
        sourcePaymentId: payment.id,
        grossMinor: payment.amountMinor,
        currency: payment.currency,
        paidAt: new Date(),
      },
      tx,
    );
  });
}

// Map a Stripe customer id back to a study learner, if any. Used by the Stripe
// webhook to attribute renewal commissions and refund clawbacks.
export async function getStudyUserIdByStripeCustomer(
  customerId: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: studyUsersTable.id })
    .from(studyUsersTable)
    .where(eq(studyUsersTable.stripeCustomerId, customerId))
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function markPaymentFailed(
  reference: string,
  raw?: Record<string, unknown>,
): Promise<void> {
  await db
    .update(studyPaymentsTable)
    .set({ status: "failed", updatedAt: new Date(), raw: raw ?? null })
    .where(eq(studyPaymentsTable.reference, reference));
}

// Reflect a Stripe subscription onto the matching study user. Called from the
// Stripe webhook so card auto-renew (active, renewals, cancellations) keeps the
// user's Pro access in sync. No-op when the customer is not a study learner.
export async function activateStudyStripeFromCustomer(customerId: string): Promise<void> {
  const rows = await db
    .select({ id: studyUsersTable.id })
    .from(studyUsersTable)
    .where(eq(studyUsersTable.stripeCustomerId, customerId))
    .limit(1);
  const user = rows[0];
  if (!user) return; // not a study customer (likely a teacher)

  const stripe = await getUncachableStripeClient();
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 1,
  });
  const sub = subs.data[0];
  if (!sub) return;

  const active = ["active", "trialing", "past_due"].includes(sub.status);
  const item = sub.items.data[0];
  const interval = item?.price?.recurring?.interval === "year" ? "year" : "month";
  // Tier is stamped onto the subscription metadata at card checkout. Default to
  // pro for older subscriptions created before the three-tier rollout.
  const metaTier = sub.metadata?.["tier"];
  const tier = isTier(metaTier) ? metaTier : "pro";
  // In recent Stripe API versions current_period_end lives on the subscription
  // item rather than the subscription itself.
  const periodEndUnix = item?.current_period_end;
  const periodEnd =
    typeof periodEndUnix === "number" ? new Date(periodEndUnix * 1000) : null;

  await db
    .update(studyUsersTable)
    .set({
      subscriptionTier: active ? tier : "free",
      subscriptionStatus: sub.status,
      subscriptionProvider: "stripe",
      subscriptionInterval: interval,
      autoRenew: active && !sub.cancel_at_period_end,
      stripeSubscriptionId: sub.id,
      ...(periodEnd ? { subscriptionCurrentPeriodEnd: periodEnd } : {}),
    })
    .where(eq(studyUsersTable.id, user.id));
}

export interface SubscriptionView {
  tier: string;
  status: string;
  provider: string | null;
  interval: string | null;
  country: string | null;
  autoRenew: boolean;
  currentPeriodEnd: string | null;
}

export async function getSubscription(userId: string): Promise<SubscriptionView> {
  const rows = await db
    .select({
      tier: studyUsersTable.subscriptionTier,
      status: studyUsersTable.subscriptionStatus,
      provider: studyUsersTable.subscriptionProvider,
      interval: studyUsersTable.subscriptionInterval,
      country: studyUsersTable.billingCountry,
      autoRenew: studyUsersTable.autoRenew,
      currentPeriodEnd: studyUsersTable.subscriptionCurrentPeriodEnd,
    })
    .from(studyUsersTable)
    .where(eq(studyUsersTable.id, userId))
    .limit(1);
  const row = rows[0];
  // Expired subscriptions read as free until renewed.
  const now = new Date();
  const end = row?.currentPeriodEnd ? new Date(row.currentPeriodEnd) : null;
  const expired = end ? end.getTime() < now.getTime() : false;
  return {
    tier: expired ? "free" : row?.tier ?? "free",
    status: expired ? "expired" : row?.status ?? "free",
    provider: row?.provider ?? null,
    interval: row?.interval ?? null,
    country: row?.country ?? null,
    autoRenew: row?.autoRenew ?? false,
    currentPeriodEnd: end ? end.toISOString() : null,
  };
}
