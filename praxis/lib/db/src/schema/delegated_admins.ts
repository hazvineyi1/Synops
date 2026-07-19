import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Delegated organisation admins — a junior admin a partner scopes to ONE organisation with only the
 * powers granted. This table is the persistent register (who is delegated, to which org, with which
 * powers). Enforcement of the granular powers in the delivery routes is a separate authz step.
 */
export const delegatedAdminsTable = pgTable("delegated_admins", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  partnerId: text("partner_id").notNull(),
  orgId: text("org_id"),
  orgName: text("org_name"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  powers: jsonb("powers").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("invited"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DelegatedAdmin = typeof delegatedAdminsTable.$inferSelect;
