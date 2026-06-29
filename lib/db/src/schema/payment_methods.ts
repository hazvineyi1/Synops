import { pgTable, text, boolean, serial, integer, timestamp } from "drizzle-orm/pg-core";

// Consumer-facing payment options shown at checkout, each routed to a settlement
// "rail" (the integration that actually charges the money):
//   - stripe      : cards/Apple Pay for the diaspora (live)
//   - flutterwave : cards + African mobile money (Orange Money, MTN MoMo, Airtel,
//                   M-Pesa), bank transfer, USSD — slice 2
//   - paynow      : Zimbabwe (EcoCash, OneMoney, bank) — later
//   - manual      : customer pays out-of-band (Remitly, bank deposit) and an
//                   admin marks them paid; `instructions` tells them how.
//
// `regions` is a list of region codes the method is offered in ("global" matches
// everyone). This is the catalog the pricing page reads; live charging for each
// rail lights up as that processor is integrated.
export const paymentMethodsTable = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  product: text("product").notNull().default("arete"),
  code: text("code").notNull(), // ecocash | orange_money | mtn_momo | card | remitly | ...
  label: text("label").notNull(), // display name, e.g. "EcoCash"
  rail: text("rail").notNull().default("manual"), // stripe | flutterwave | paynow | manual
  regions: text("regions").array().notNull().default(["global"]),
  instructions: text("instructions"), // shown for manual rail (how to pay)
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PaymentMethod = typeof paymentMethodsTable.$inferSelect;
export type InsertPaymentMethod = typeof paymentMethodsTable.$inferInsert;
