import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * POPIA consent + data-subject-request tables.
 *
 * consent_events is an append-only audit of every time a user accepted the
 * privacy policy: which policy version, when, and from where. The user's
 * current state (their latest accepted version) is denormalised onto users
 * (consent_version / consented_at) so the consent gate is a single-row check,
 * but this table is the durable, tamper-evident record.
 *
 * Managed by the boot-time CREATE-IF-NOT-EXISTS heal in lib/dbHardening.ts, like
 * the rest of the schema (no migration runner), so it exists the instant the
 * build deploys.
 */
export const consentEventsTable = pgTable("consent_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  // Which product the consent was given in. Always "praxis" here; the column
  // exists so the shape matches Coach and a future shared store could merge them.
  app: text("app").notNull().default("praxis"),
  policyVersion: text("policy_version").notNull(),
  consentedAt: timestamp("consented_at").notNull().defaultNow(),
  ip: text("ip"),
  userAgent: text("user_agent"),
});

export type ConsentEvent = typeof consentEventsTable.$inferSelect;

/**
 * A data-subject erasure request (POPIA right to deletion). Never a one-click
 * wipe: a request starts "pending" and a super admin approves it, at which point
 * a de-identify routine runs. Learners who belong to a partner organisation are
 * not deleted here - the request is marked "routed" so it goes to the partner
 * (the responsible party), per the data-subject-request procedure.
 */
export const deletionRequestsTable = pgTable("deletion_requests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  app: text("app").notNull().default("praxis"),
  // pending -> (done | routed | rejected)
  status: text("status").notNull().default("pending"),
  reason: text("reason"),
  // Set when the requester belongs to a partner org: we route, not delete.
  routeToPartner: boolean("route_to_partner").notNull().default(false),
  partnerId: text("partner_id"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  // Fulfilment audit: who decided, when, and what was kept + why (retention note).
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at"),
  retentionNote: text("retention_note"),
});

export type DeletionRequest = typeof deletionRequestsTable.$inferSelect;
