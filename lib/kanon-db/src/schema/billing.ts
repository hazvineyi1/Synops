import { pgTable, text, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Record of the Stripe webhook endpoint this deployment manages.
 *
 * The Replit Stripe connector does not expose a webhook signing secret, so we
 * create and own the webhook endpoint through the Stripe API and persist its id
 * and signing secret here. On boot we verify the stored endpoint still exists
 * and points at the current URL, recreating it only when missing or mismatched
 * so the signing secret stays stable across restarts (never recreated on every
 * boot). One row per (account, mode, url); the signing secret is never logged.
 */
export const billingConfigTable = pgTable(
  "billing_config",
  {
    id: serial("id").primaryKey(),
    // The Stripe account the managed endpoint belongs to (best-effort; "unknown"
    // when the account id cannot be resolved). Combined with mode + url to scope
    // the singleton so a test/live or account switch creates a fresh endpoint.
    stripeAccountId: text("stripe_account_id").notNull(),
    mode: text("mode").notNull(), // "test" | "live"
    webhookUrl: text("webhook_url").notNull(),
    webhookEndpointId: text("webhook_endpoint_id").notNull(),
    webhookSigningSecret: text("webhook_signing_secret").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    accountModeUrl: uniqueIndex("billing_config_account_mode_url_idx").on(
      t.stripeAccountId,
      t.mode,
      t.webhookUrl,
    ),
  }),
);

export type BillingConfigRow = typeof billingConfigTable.$inferSelect;
