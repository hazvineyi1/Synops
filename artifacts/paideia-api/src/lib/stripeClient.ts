// Stripe connector via Replit-managed integration. Do not cache the client;
// always call getUncachableStripeClient() to obtain a fresh instance.
import Stripe from "stripe";

let connectionSettings: { settings: { publishable: string; secret: string } } | undefined;

async function getCredentials(): Promise<{ publishableKey: string; secretKey: string }> {
  // Env-first (Railway / any non-Replit host): use plain Stripe keys when present.
  // Falls back to the Replit-managed connector only when these are unset (dev on Replit).
  const envSecret = process.env["STRIPE_SECRET_KEY"];
  if (envSecret) {
    return {
      publishableKey: process.env["STRIPE_PUBLISHABLE_KEY"] ?? "",
      secretKey: envSecret,
    };
  }

  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? "repl " + process.env["REPL_IDENTITY"]
    : process.env["WEB_REPL_RENEWAL"]
      ? "depl " + process.env["WEB_REPL_RENEWAL"]
      : null;
  if (!xReplitToken) throw new Error("X-Replit-Token not found for repl/depl");

  const isProduction = process.env["REPLIT_DEPLOYMENT"] === "1";
  const targetEnvironment = isProduction ? "production" : "development";
  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", "stripe");
  url.searchParams.set("environment", targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
  });
  const data = (await response.json()) as { items?: Array<{ settings: { publishable: string; secret: string } }> };
  connectionSettings = data.items?.[0];
  if (!connectionSettings || !connectionSettings.settings.publishable || !connectionSettings.settings.secret) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }
  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret,
  };
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, { apiVersion: "2025-11-17.clover" });
}

export async function getStripeSecretKey(): Promise<string> {
  const { secretKey } = await getCredentials();
  return secretKey;
}

let stripeSync: unknown = null;
export async function getStripeSync(): Promise<{
  findOrCreateManagedWebhook: (url: string) => Promise<{ webhook: { id: string } }>;
  syncBackfill: () => Promise<void>;
  processWebhook: (payload: Buffer, signature: string) => Promise<{ type: string; data: { object: { customer?: string } } } | undefined>;
}> {
  if (!stripeSync) {
    const { StripeSync } = await import("stripe-replit-sync");
    const secretKey = await getStripeSecretKey();
    stripeSync = new StripeSync({
      poolConfig: { connectionString: process.env["DATABASE_URL"]!, max: 2 },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync as Awaited<ReturnType<typeof getStripeSync>>;
}
