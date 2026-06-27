// Arete's entitlement model. The Stripe REST plumbing now lives in the shared
// @workspace/billing package and is re-exported here so existing importers
// (routes/billing, apiAuth, etc.) keep their import paths.

export {
  stripeConfigured,
  priceIdFor,
  createCheckoutSession,
  createPortalSession,
  verifyStripeSignature,
} from "@workspace/billing";

// ----------------------------------------------------------------------------
// Plans & entitlements (product-specific to Arete)
// ----------------------------------------------------------------------------

// Free tier is capped at this many concepts; Pro is unlimited.
export const FREE_CONCEPT_LIMIT = 20;

// 7-day free trial of Pro, no card required.
export const TRIAL_DAYS = 7;

export type Entitlement = {
  tier: "free" | "pro";
  isPro: boolean;
  inTrial: boolean; // Pro access granted by the free trial (no paid subscription)
  status: string; // none | trialing | active | past_due | canceled
  trialEndsAt: string | null; // ISO
};

// A user is "pro" if they have an active/trialing paid subscription OR are
// within their free-trial window.
export function getEntitlement(user: {
  subscriptionTier?: string | null;
  subscriptionStatus?: string | null;
  trialEndsAt?: Date | null;
}): Entitlement {
  const now = Date.now();
  const trialEnds = user.trialEndsAt ? new Date(user.trialEndsAt).getTime() : null;
  const inTrialWindow = trialEnds != null && trialEnds > now;
  const paidActive =
    user.subscriptionTier === "pro" &&
    (user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing");
  const isPro = paidActive || inTrialWindow;
  return {
    tier: isPro ? "pro" : "free",
    isPro,
    inTrial: inTrialWindow && !paidActive,
    status: user.subscriptionStatus ?? "none",
    trialEndsAt: user.trialEndsAt ? new Date(user.trialEndsAt).toISOString() : null,
  };
}
