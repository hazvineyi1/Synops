import { pgTable, text, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const credentialStatusEnum = pgEnum("credential_status", [
  "valid",
  "expired",
  "revoked",
]);

export const credentialsTable = pgTable("credentials", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  moduleId: text("module_id").notNull(),
  moduleTitle: text("module_title").notNull(),
  partnerId: text("partner_id").notNull(),
  partnerName: text("partner_name").notNull(),
  status: credentialStatusEnum("credential_status").notNull().default("valid"),
  masteryScore: numeric("mastery_score", { precision: 5, scale: 4 }).notNull(),
  evidenceSummary: text("evidence_summary").notNull().default(""),
  badgeUrl: text("badge_url"),
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  decayDate: timestamp("decay_date").notNull(),
  revokedAt: timestamp("revoked_at"),
});

export const insertCredentialSchema = createInsertSchema(credentialsTable).omit({
  id: true,
  issuedAt: true,
});

export type InsertCredential = z.infer<typeof insertCredentialSchema>;
export type Credential = typeof credentialsTable.$inferSelect;

// Append-only evidence ledger — never updated, only inserted
export const evidenceRecordsTable = pgTable("evidence_records", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  credentialId: text("credential_id"),
  userId: text("user_id").notNull(),
  sessionId: text("session_id"),
  attemptId: text("attempt_id"),
  type: text("type", {
    enum: ["session_response", "assessment_result", "coach_attestation", "submission_review"],
  }).notNull(),
  description: text("description").notNull(),
  score: numeric("score", { precision: 5, scale: 4 }),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export const insertEvidenceRecordSchema = createInsertSchema(evidenceRecordsTable).omit({
  id: true,
  recordedAt: true,
});

export type InsertEvidenceRecord = z.infer<typeof insertEvidenceRecordSchema>;
export type EvidenceRecord = typeof evidenceRecordsTable.$inferSelect;
