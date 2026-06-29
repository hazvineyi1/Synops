import { pgTable, text, timestamp, jsonb, serial } from "drizzle-orm/pg-core";

// Append-only log of admin-panel actions. Every elevated/destructive action
// (role changes, suspensions, resets, etc.) records who did what, to whom, when.
// Never updated or deleted in normal operation.
export const adminAuditLogTable = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  actorUserId: text("actor_user_id").notNull(), // Clerk user id of the admin who acted
  actorEmail: text("actor_email"), // denormalized for readability if the user is later removed
  action: text("action").notNull(), // e.g. "role.set", "user.suspend", "progress.reset"
  targetType: text("target_type"), // e.g. "user"
  targetId: text("target_id"), // e.g. the affected Clerk user id
  metadata: jsonb("metadata"), // arbitrary before/after detail
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AdminAuditLog = typeof adminAuditLogTable.$inferSelect;
