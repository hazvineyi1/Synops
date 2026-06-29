import { pgTable, text, integer, boolean, serial, timestamp } from "drizzle-orm/pg-core";

// Regional pricing catalog. One row = one purchasable price for a region.
//
// A "plan" is the offering (code -> entitlement tier the buyer receives, e.g.
// "pro") sold at a given interval, in a given region/currency, through a given
// processor. Region "global" is the default/fallback; otherwise region is an
// ISO-3166 country code (e.g. "ZW") or a group key (e.g. "africa").
//
// Stripe needs a pre-created price id (stripePriceId). Flutterwave charges an
// arbitrary amount+currency directly, so amountMinor + currency is enough.
export const plansTable = pgTable("plans", {
  id: serial("id").primaryKey(),
  product: text("product").notNull().default("arete"), // multi-product ready
  code: text("code").notNull(), // entitlement tier granted, e.g. "pro"
  name: text("name").notNull(), // display name, e.g. "Pro"
  interval: text("interval").notNull(), // monthly | yearly
  region: text("region").notNull().default("global"), // global | ISO country | group
  currency: text("currency").notNull().default("USD"), // ISO 4217
  amountMinor: integer("amount_minor").notNull(), // price in minor units (cents)
  processor: text("processor").notNull().default("stripe"), // stripe | flutterwave
  stripePriceId: text("stripe_price_id"), // required when processor = stripe
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Plan = typeof plansTable.$inferSelect;
export type InsertPlan = typeof plansTable.$inferInsert;
