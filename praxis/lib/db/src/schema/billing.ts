import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Partner billing — subscriptions and invoices. Backs the Partner Financial Hub, replacing the
 * seeded demo. Deliberately simple: a partner owns subscriptions (one per organisation, with a
 * plan name, per-seat price and seat counts) and invoices (net amount, period, status). VAT and
 * monthly totals are derived in the UI, not stored. No payment gateway — status is set manually.
 */
export const billingSubscriptionsTable = pgTable("billing_subscriptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  partnerId: text("partner_id").notNull(),
  orgId: text("org_id"),
  orgName: text("org_name"),
  planName: text("plan_name").notNull().default("Standard"),
  pricePerSeat: integer("price_per_seat").notNull().default(0),
  seats: integer("seats").notNull().default(0),
  activeSeats: integer("active_seats").notNull().default(0),
  // Where this seat entitlement came from. B2B pooled licence today; a future B2C storefront
  // purchase is the same row with source='b2c_purchase' and seats=1 - no schema change needed.
  source: text("source").notNull().default("b2b_pool"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const billingInvoicesTable = pgTable("billing_invoices", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  partnerId: text("partner_id").notNull(),
  orgId: text("org_id"),
  orgName: text("org_name"),
  number: text("number").notNull(),
  period: text("period"),
  net: integer("net").notNull().default(0),
  status: text("status").notNull().default("due"),
  issued: text("issued"),
  due: text("due"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type BillingSubscription = typeof billingSubscriptionsTable.$inferSelect;
export type BillingInvoice = typeof billingInvoicesTable.$inferSelect;
