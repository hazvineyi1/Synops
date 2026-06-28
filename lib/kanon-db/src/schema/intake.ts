import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const intakeProgressTable = pgTable("intake_progress", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().unique(),
  agendaChecks: text("agenda_checks").notNull().default("[]"),
  segStatuses: text("seg_statuses").notNull().default("[]"),
  confirmedPre: text("confirmed_pre").notNull().default("[]"),
  notes: text("notes").notNull().default("{}"),
  inventorySelections: text("inventory_selections").notNull().default("{}"),
  autoRules: text("auto_rules").notNull().default("{}"),
  // Interactive Socratic kickoff answers (rules-based, no AI). Stored separately
  // from the fixed-length SEGMENTS arrays above so it can never clobber the
  // kickoff checklist autosave (and vice versa). Shape: KickoffState JSON.
  kickoffAnswers: text("kickoff_answers").notNull().default("{}"),
  // Rules-based agenda generated from the project/course/objectives. Stored
  // separately from the fixed-length SEGMENTS arrays above so generating it can
  // never clobber the kickoff checklist autosave (and vice versa).
  generatedAgenda: text("generated_agenda").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type IntakeProgressRow = typeof intakeProgressTable.$inferSelect;
