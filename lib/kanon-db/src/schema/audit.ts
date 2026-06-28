import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const auditEventsTable = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityTitle: text("entity_title").notNull(),
  projectTitle: text("project_title"),
  // Actor attribution. Nullable because legacy/system events predate it; new
  // curriculum mutations record who performed them so school admins can review
  // per-builder activity. `actorName` is denormalized for cheap display.
  actorUserId: integer("actor_user_id"),
  actorName: text("actor_name"),
  // When the acting user is being impersonated, this records the REAL operator
  // (the super admin) behind the action so attribution survives impersonation.
  impersonatorUserId: integer("impersonator_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuditEventSchema = createInsertSchema(auditEventsTable).omit({ id: true, createdAt: true });
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;
export type AuditEvent = typeof auditEventsTable.$inferSelect;
