import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Security audit trail for impersonation. A super admin may temporarily act as
 * another user for support; every start and stop is recorded here (separately
 * from the curriculum `audit_events`) so the platform has a queryable record of
 * who impersonated whom and when. Branding/host resolution never grants this;
 * only an authenticated super_admin can create a start event.
 */
export const IMPERSONATION_ACTIONS = ["start", "stop"] as const;
export type ImpersonationAction = (typeof IMPERSONATION_ACTIONS)[number];

export const impersonationEventsTable = pgTable("impersonation_events", {
  id: serial("id").primaryKey(),
  impersonatorUserId: integer("impersonator_user_id").notNull(),
  targetUserId: integer("target_user_id").notNull(),
  action: text("action").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertImpersonationEventSchema = createInsertSchema(impersonationEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertImpersonationEvent = z.infer<typeof insertImpersonationEventSchema>;
export type ImpersonationEvent = typeof impersonationEventsTable.$inferSelect;
