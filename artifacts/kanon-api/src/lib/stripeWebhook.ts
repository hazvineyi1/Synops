import type Stripe from "stripe";
import type { RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import { db, billingConfigTable } from "@workspace/kanon-db";
import { getStripeRuntime } from "./stripeClient";
import { applySubscriptionToOrg } from "./stripeBilling";

/**
 * Managed Stripe webhook.
 *
 * The Replit Stripe connector does not provide a webhook signing secret, so we
 * create and own the webhook endpoint via the Stripe API and hold its signing
 * secret in memory (also persisted in billing_config). On boot we verify the
 * persisted endpoint still exists and points at the current URL, recreating it
 * only when missing or mismatched, so the signing secret is stable across
 * restarts. The signing secret is never logged.
 *
 * Webhooks are the long-term source of truth for subscription state; the authed
 * reconcile endpoint covers the moment right after checkout so the UI updates
 * immediately even before the webhook arrives.
 */

const WEBHOOK_PATH = "/api/stripe/webhook";

const ENABLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

// Held in memory after initStripe. The handler refuses webhooks until set.
let cachedStripe: Stripe | null = null;
let cachedSigningSecret: string | null = null;

interface InitLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

function resolveWebhookUrl(): string | null {
  const domains = (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  const host = domains[0] ?? process.env.REPLIT_DEV_DOMAIN;
  return host ? `https://${host}${WEBHOOK_PATH}` : null;
}

async function resolveAccountId(stripe: Stripe): Promise<string> {
  try {
    // With no id, accounts.retrieve() hits GET /v1/account and returns the
    // account the API key belongs to. The typings require an id, so narrow the
    // call signature to the zero-arg form.
    const retrieveSelf = stripe.accounts.retrieve as unknown as () => Promise<Stripe.Account>;
    const account = await retrieveSelf();
    return account.id ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Set up the managed webhook and cache the signing secret. Degrades gracefully:
 * any failure (Stripe unreachable, not connected) is logged and the server
 * continues to boot. Billing then runs in reconcile-only mode until the next
 * successful init.
 */
export async function initStripe(log: InitLogger): Promise<void> {
  try {
    const { stripe, connection } = await getStripeRuntime();
    cachedStripe = stripe;

    const webhookUrl = resolveWebhookUrl();
    if (!webhookUrl) {
      log.warn(
        {},
        "No public domain resolved; Stripe webhook setup skipped (reconcile still works).",
      );
      return;
    }

    const accountId = await resolveAccountId(stripe);

    const [existing] = await db
      .select()
      .from(billingConfigTable)
      .where(
        and(
          eq(billingConfigTable.stripeAccountId, accountId),
          eq(billingConfigTable.mode, connection.mode),
          eq(billingConfigTable.webhookUrl, webhookUrl),
        ),
      );

    if (existing) {
      let valid = false;
      try {
        const ep = await stripe.webhookEndpoints.retrieve(existing.webhookEndpointId);
        valid = ep.url === webhookUrl && ep.status !== "disabled";
      } catch {
        valid = false;
      }
      if (valid) {
        cachedSigningSecret = existing.webhookSigningSecret;
        log.info(
          { endpointId: existing.webhookEndpointId, mode: connection.mode },
          "Stripe webhook verified",
        );
        return;
      }
    }

    // Missing or mismatched: create a fresh endpoint and persist its secret.
    const created = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: ENABLED_EVENTS as unknown as Stripe.WebhookEndpointCreateParams.EnabledEvent[],
      description: "Compass managed billing webhook",
    });
    if (!created.secret) {
      throw new Error("Stripe did not return a webhook signing secret");
    }

    if (existing) {
      await db
        .update(billingConfigTable)
        .set({ webhookEndpointId: created.id, webhookSigningSecret: created.secret })
        .where(eq(billingConfigTable.id, existing.id));
    } else {
      await db.insert(billingConfigTable).values({
        stripeAccountId: accountId,
        mode: connection.mode,
        webhookUrl,
        webhookEndpointId: created.id,
        webhookSigningSecret: created.secret,
      });
    }
    cachedSigningSecret = created.secret;
    log.info({ endpointId: created.id, mode: connection.mode }, "Stripe webhook created");
  } catch (err) {
    log.error({ err }, "Stripe initialization failed; billing webhooks degraded to reconcile-only");
  }
}

export const handleStripeWebhook: RequestHandler = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  if (!sig || Array.isArray(sig)) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }
  if (!cachedStripe || !cachedSigningSecret) {
    req.log.warn("Stripe webhook received but billing is not initialized");
    res.status(503).json({ error: "Billing not initialized" });
    return;
  }
  if (!Buffer.isBuffer(req.body)) {
    req.log.error(
      "Stripe webhook body is not a Buffer; the raw route must be registered before express.json()",
    );
    res.status(500).json({ error: "Webhook misconfigured" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = cachedStripe.webhooks.constructEvent(req.body, sig, cachedSigningSecret);
  } catch (err) {
    req.log.warn({ err }, "Stripe webhook signature verification failed");
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  // Process BEFORE acknowledging so a transient failure returns a non-2xx and
  // Stripe redelivers the event (webhooks are the long-term source of truth).
  // Stripe allows ~20s; our handlers do a couple of API reads plus one DB write,
  // and applySubscriptionToOrg is idempotent so redelivery is safe.
  try {
    await handleEvent(event);
  } catch (err) {
    req.log.error({ err, type: event.type }, "Stripe webhook handler error");
    res.status(500).json({ error: "Webhook processing failed" });
    return;
  }
  res.status(200).json({ received: true });
};

async function handleEvent(event: Stripe.Event): Promise<void> {
  if (!cachedStripe) return;
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return;
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
      if (!subId) return;
      const sub = await cachedStripe.subscriptions.retrieve(subId);
      await applySubscriptionToOrg(sub);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await applySubscriptionToOrg(event.data.object as Stripe.Subscription);
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as unknown as {
        subscription?: string | { id: string };
      };
      const subId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;
      if (subId) {
        const sub = await cachedStripe.subscriptions.retrieve(subId);
        await applySubscriptionToOrg(sub);
      }
      break;
    }
    default:
      break;
  }
}
