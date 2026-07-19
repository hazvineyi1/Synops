import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Real funding agreements per partner (SETA / CSI / public / other funders). Backs the Partner
 * Funders Hub, replacing the seeded FunderAgreement demo data. Kept deliberately simple: a partner
 * owns agreements, each optionally scoped to one organisation, with a funded-seats count, a rand
 * value, a validity window, a status, and free-form conditions.
 */
export const fundingAgreementsTable = pgTable("funding_agreements", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  partnerId: text("partner_id").notNull(),
  funderName: text("funder_name").notNull(),
  funderType: text("funder_type").notNull().default("SETA"),
  orgId: text("org_id"),
  orgName: text("org_name"),
  seatsFunded: integer("seats_funded").notNull().default(0),
  value: integer("value").notNull().default(0),
  startDate: text("start_date"),
  expiry: text("expiry"),
  status: text("status").notNull().default("active"),
  conditions: jsonb("conditions").$type<string[]>().notNull().default([]),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type FundingAgreement = typeof fundingAgreementsTable.$inferSelect;
