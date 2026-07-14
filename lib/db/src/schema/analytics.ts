import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const activityEventTypeEnum = pgEnum("activity_event_type", [
  "enrolment",
  "completion",
  "credential_issued",
  "submission",
  "session_mastered",
]);

export const activityEventsTable = pgTable("activity_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: activityEventTypeEnum("activity_event_type").notNull(),
  description: text("description").notNull(),
  userId: text("user_id"),
  moduleId: text("module_id"),
  partnerId: text("partner_id"),
  organisationId: text("organisation_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertActivityEventSchema = createInsertSchema(activityEventsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertActivityEvent = z.infer<typeof insertActivityEventSchema>;
export type ActivityEvent = typeof activityEventsTable.$inferSelect;

// Immutable audit log
export const auditEventsTable = pgTable("audit_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  actorId: text("actor_id"),
  actorRole: text("actor_role"),
  partnerId: text("partner_id"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
