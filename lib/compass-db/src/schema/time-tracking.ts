import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Per-project billing time entries. Each row is a span of time a user spent on a
 * project, captured either with a live stopwatch (`source = "timer"`, which may
 * still be running while `endedAt` is null) or entered after the fact
 * (`source = "manual"`, which always has an `endedAt`). Time only: there are no
 * rates or money here. Duration is derived from `endedAt - startedAt`.
 * Project-scoped: tenancy is resolved through the owning project's client
 * organization (see tenancy.ts). Attributed to the acting user via `userId`.
 */
export const projectTimeEntriesTable = pgTable("project_time_entries", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  userId: integer("user_id").notNull(),
  description: text("description"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  source: text("source").notNull().default("timer"), // "timer" | "manual"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  // At most one running timer (endedAt IS NULL) per user per project. The
  // route also pre-checks, but this partial unique index is the real guarantee
  // against two concurrent starts both inserting a running row.
  uniqueIndex("project_time_entries_one_running_per_user")
    .on(table.projectId, table.userId)
    .where(sql`${table.endedAt} is null`),
]);

export type ProjectTimeEntryRow = typeof projectTimeEntriesTable.$inferSelect;
