import Stripe from "stripe";

/**
 * Stripe access for the API server.
 *
 * Credentials come from environment variables (`STRIPE_SECRET_KEY`, and
 * optionally `STRIPE_PUBLISHABLE_KEY` for the browser Checkout flow). The
 * webhook signing secret is owned per-tenant in `billing_config` (see
 * lib/stripeWebhook.ts), not here. Mode (test/live) is derived from the secret
 * key prefix.
 */

export interface StripeConnection {
  secretKey: string;
  publishableKey: string | null;
  /** "test" | "live", derived from the secret key prefix. */
  mode: "test" | "live";
}

// eslint-disable-next-line @typescript-eslint/require-await
async function getStripeConnection(): Promise<StripeConnection> {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add your Stripe secret key to the environment to enable billing.",
    );
  }

  return {
    secretKey,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
    mode: secretKey.startsWith("sk_live_") ? "live" : "test",
  };
}

/**
 * Returns a fresh authenticated Stripe client. Not cached: credentials are
 * re-fetched each call so a rotated connector key is picked up immediately.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeConnection();
  return new Stripe(secretKey);
}

/**
 * Returns a Stripe client together with the resolved connection metadata
 * (mode + publishable key). Used where the caller needs the mode (webhook
 * config keying) or the publishable key (handed to the browser for Checkout).
 */
export async function getStripeRuntime(): Promise<{
  stripe: Stripe;
  connection: StripeConnection;
}> {
  const connection = await getStripeConnection();
  return { stripe: new Stripe(connection.secretKey), connection };
}
