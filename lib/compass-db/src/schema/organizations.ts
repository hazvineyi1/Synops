import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Organizations are the tenant boundary for the curriculum (Compass) platform.
 * `type` distinguishes the consulting firm's own tenant ("internal") from an
 * external, white-labeled school tenant ("school"). The curriculum tree roots at
 * `clients.organization_id`; everything below inherits tenancy through it.
 */
export const organizationsTable = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: text("type").notNull().default("school"),
  // Optional white-label branding. Used to theme a tenant's surfaces; never used
  // for authorization. Host/DNS resolution is a later task.
  accentColor: text("accent_color"),
  tagline: text("tagline"),
  logoUrl: text("logo_url"),
  domain: text("domain"),
  // Billing / subscription state. Compass is sold per organization (the tenant
  // subscribes). `planTier` is the entitlement tier (trial/starter/professional/
  // enterprise); `subscriptionStatus` mirrors the Stripe subscription lifecycle
  // (trialing/active/past_due/canceled/incomplete). The internal tenant is always
  // treated as enterprise/unlimited regardless of these columns. Stripe ids let
  // us open the billing portal and reconcile webhooks; never used for authz.
  planTier: text("plan_tier").notNull().default("trial"),
  subscriptionStatus: text("subscription_status").notNull().default("trialing"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrganizationSchema = createInsertSchema(organizationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationsTable.$inferSelect;
