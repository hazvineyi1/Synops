import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const standardsFrameworksTable = pgTable("standards_frameworks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  acronym: text("acronym"),
  frameworkType: text("framework_type").notNull().default("accreditor"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const standardCompetenciesTable = pgTable("standard_competencies", {
  id: serial("id").primaryKey(),
  frameworkId: integer("framework_id").notNull(),
  code: text("code").notNull(),
  description: text("description").notNull(),
  domain: text("domain"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const crosswalkLinksTable = pgTable("crosswalk_links", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  competencyId: integer("competency_id").notNull(),
  objectiveId: integer("objective_id"),
  assessmentId: integer("assessment_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStandardsFrameworkSchema = createInsertSchema(standardsFrameworksTable).omit({ id: true, createdAt: true });
export type InsertStandardsFramework = z.infer<typeof insertStandardsFrameworkSchema>;
export type StandardsFramework = typeof standardsFrameworksTable.$inferSelect;

export const insertStandardCompetencySchema = createInsertSchema(standardCompetenciesTable).omit({ id: true, createdAt: true });
export type InsertStandardCompetency = z.infer<typeof insertStandardCompetencySchema>;
export type StandardCompetency = typeof standardCompetenciesTable.$inferSelect;

export const insertCrosswalkLinkSchema = createInsertSchema(crosswalkLinksTable).omit({ id: true, createdAt: true });
export type InsertCrosswalkLink = z.infer<typeof insertCrosswalkLinkSchema>;
export type CrosswalkLink = typeof crosswalkLinksTable.$inferSelect;
