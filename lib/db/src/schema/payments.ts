import { pgTable, text, integer, serial, timestamp } from "drizzle-orm/pg-core";

// A single payment attempt/record across any processor. Created "pending" when a
// checkout starts and moved to "successful"/"failed" on verify/webhook. The
// unique tx_ref makes grant-on-success idempotent (we only upgrade once per ref).
export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  txRef: text("tx_ref").notNull().unique(), // our reference, sent to the processor
  userId: text("user_id").notNull(),
  processor: text("processor").notNull(), // stripe | flutterwave | paynow | manual
  planId: integer("plan_id"), // plans.id this paid for (nullable for legacy)
  planCode: text("plan_code"), // entitlement granted, e.g. "pro"
  interval: text("interval"), // monthly | yearly
  amountMinor: integer("amount_minor").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull().default("pending"), // pending | successful | failed
  providerRef: text("provider_ref"), // processor transaction id
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Payment = typeof paymentsTable.$inferSelect;
export type InsertPayment = typeof paymentsTable.$inferInsert;
