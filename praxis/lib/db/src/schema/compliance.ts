import { pgTable, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";

/**
 * Accreditation compliance (decision doc §10.4).
 *
 * Providers like Enza must report to QCTO/SETA: unit-standard mapping, portfolio of
 * evidence, and auditable completion records. Unit standards are defined here and mapped
 * to the content (course/module/assessment) that delivers them; the per-learner evidence
 * ledger already exists as `evidence_records` (schema/credentials.ts) and is referenced by
 * the compliance report rather than duplicated.
 */

export const complianceFrameworkEnum = pgEnum("compliance_framework", [
  "qcto",
  "seta",
  "nqf",
  "other",
]);

export const unitStandardsTable = pgTable("unit_standards", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull(),
  title: text("title").notNull(),
  framework: complianceFrameworkEnum("framework").notNull().default("qcto"),
  nqfLevel: integer("nqf_level"),
  credits: integer("credits"),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UnitStandard = typeof unitStandardsTable.$inferSelect;

/** Links a unit standard to the content that delivers/assesses it. */
export const unitStandardMappingsTable = pgTable("unit_standard_mappings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  unitStandardId: text("unit_standard_id").notNull(),
  targetType: text("target_type", { enum: ["course", "module", "assessment", "case"] }).notNull(),
  targetId: text("target_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type UnitStandardMapping = typeof unitStandardMappingsTable.$inferSelect;
