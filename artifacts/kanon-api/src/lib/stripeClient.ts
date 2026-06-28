import Stripe from "stripe";

/**
 * Stripe access for the API server.
 *
 * Credentials come from the Replit Stripe connector (not an env var). The
 * connector exposes the secret key under `settings.secret` (there is no
 * `secret_key` and no `webhook_secret`), so we own the webhook endpoint
 * ourselves (see lib/stripeWebhook.ts). Credentials are fetched fresh on every
 * call because the connector token can rotate.
 */

export interface StripeConnection {
  secretKey: string;
  publishableKey: string | null;
  /** "test" | "live", derived from the secret key prefix. */
  mode: "test" | "live";
}

async function getStripeConnection(): Promise<StripeConnection> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Missing Replit connector environment. Connect Stripe via the Integrations tab.",
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`);
  }

  const data = (await resp.json()) as {
    items?: Array<{ settings?: { secret?: string; publishable?: string } }>;
  };
  const settings = data.items?.[0]?.settings;
  const secretKey = settings?.secret;

  if (!secretKey) {
    throw new Error(
      "Stripe is not connected or is missing a secret key. Connect Stripe via the Integrations tab first.",
    );
  }

  return {
    secretKey,
    publishableKey: settings?.publishable ?? null,
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
