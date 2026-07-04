import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Allocation targets. A "program" is modeled as a whole project; allocations can
 * also target a single course or a class/section.
 */
export const ALLOCATION_SCOPE_TYPES = ["project", "course", "class"] as const;
export type AllocationScopeType = (typeof ALLOCATION_SCOPE_TYPES)[number];

export const ALLOCATION_STATUSES = ["active", "revoked"] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

/**
 * An allocation assigns a builder to a curriculum scope (project/course/class)
 * within a single organization. Same-org validation (the scope must belong to
 * `organization_id`) is enforced in application logic because the scope is
 * polymorphic and cannot be a single FK. A partial unique index guarantees at
 * most one ACTIVE allocation per target. Create/revoke/status changes are
 * audited where the allocation endpoints live (a later task owns those).
 */
export const allocationsTable = pgTable(
  "allocations",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull(),
    builderUserId: integer("builder_user_id").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeId: integer("scope_id").notNull(),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("allocations_active_target_unique")
      .on(t.scopeType, t.scopeId)
      .where(sql`${t.status} = 'active'`),
  ],
);

export const insertAllocationSchema = createInsertSchema(allocationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAllocation = z.infer<typeof insertAllocationSchema>;
export type Allocation = typeof allocationsTable.$inferSelect;
