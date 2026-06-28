import { pgTable, text, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import type { QaReport } from "@workspace/kanon-curriculum-engine";

export const qaChecksTable = pgTable("qa_checks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  checkType: text("check_type").notNull().default("oedi_rubric"),
  status: text("status").notNull().default("pending"),
  findings: text("findings"),
  remediationNotes: text("remediation_notes"),
  gateBlock: boolean("gate_block").notNull().default(false),
  passedCount: integer("passed_count"),
  failedCount: integer("failed_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertQACheckSchema = createInsertSchema(qaChecksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQACheck = z.infer<typeof insertQACheckSchema>;
export type QACheck = typeof qaChecksTable.$inferSelect;

// Persisted, scored output of the shared curriculum engine for a whole project.
// The full structured QaReport is stored as jsonb; score/status/gateBlock are
// denormalized columns so the latest result can be queried without parsing json.
export const qaReportsTable = pgTable("qa_reports", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  report: jsonb("report").$type<QaReport>().notNull(),
  score: integer("score").notNull(),
  // Overall result derived from finding counts: "pass" | "warn" | "fail".
  status: text("status").notNull().default("pass"),
  // True when the report contains a blocking (fail) finding that should hold the QA gate.
  gateBlock: boolean("gate_block").notNull().default(false),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  // The real operator who ran the evaluation (attributed to the impersonator, not the target).
  runByUserId: integer("run_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertQAReportSchema = createInsertSchema(qaReportsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQAReport = z.infer<typeof insertQAReportSchema>;
export type QAReportRow = typeof qaReportsTable.$inferSelect;
