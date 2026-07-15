import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Funder / sponsor scope (decision doc §10.2).
 *
 * A funder finances one or more organizations' programs and needs read-only visibility
 * into AGGREGATE outcomes for exactly those — nothing else. Each row grants a funder
 * (users.id, role = 'funder') visibility into one organization, optionally narrowed to a
 * single funded program (courseId). No row here ever exposes individual learner data;
 * it only defines which orgs' aggregate numbers a funder may see.
 */
export const funderScopesTable = pgTable("funder_scopes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  funderId: text("funder_id").notNull(),
  organisationId: text("organisation_id").notNull(),
  // Optional finer scope: a specific funded program/course. Null = all programs in the org.
  courseId: text("course_id"),
  // Human label for the funding relationship, e.g. "BizAscend 2026 grant".
  label: text("label"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type FunderScope = typeof funderScopesTable.$inferSelect;
