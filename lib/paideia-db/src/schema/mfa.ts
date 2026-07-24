import { pgTable, text, timestamp, boolean, integer, jsonb, uuid, index } from "drizzle-orm/pg-core";

/**
 * Coach (Paideia) multi-factor authentication model. Mirrors the Praxis design: a teacher may
 * enrol several factors and ANY one verified factor satisfies the sign-in challenge. All secrets
 * and codes are stored hashed or as opaque credentials. Reconciled by drizzle-kit push and the
 * boot-time CREATE-IF-NOT-EXISTS heal in lib/mfaSchema.ts.
 */

export type CoachMfaFactorType = "totp" | "passkey" | "email_otp" | "email_recovery";

export const mfaFactorsTable = pgTable(
  "copilot_mfa_factors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id").notNull(),
    type: text("type").notNull(),
    label: text("label").notNull().default(""),
    secret: text("secret"),
    credential: jsonb("credential").$type<Record<string, unknown>>(),
    email: text("email"),
    verifiedAt: timestamp("verified_at"),
    lastUsedAt: timestamp("last_used_at"),
    preferred: boolean("preferred").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ teacherIdx: index("copilot_mfa_factors_teacher_idx").on(t.teacherId) }),
);

export type CoachMfaFactor = typeof mfaFactorsTable.$inferSelect;

export const mfaBackupCodesTable = pgTable(
  "copilot_mfa_backup_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id").notNull(),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ teacherIdx: index("copilot_mfa_backup_codes_teacher_idx").on(t.teacherId) }),
);

export type CoachMfaBackupCode = typeof mfaBackupCodesTable.$inferSelect;

export const mfaChallengesTable = pgTable(
  "copilot_mfa_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id").notNull(),
    purpose: text("purpose").notNull(),
    codeHash: text("code_hash"),
    challenge: text("challenge"),
    destination: text("destination"),
    expiresAt: timestamp("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ teacherPurposeIdx: index("copilot_mfa_challenges_teacher_purpose_idx").on(t.teacherId, t.purpose) }),
);

export type CoachMfaChallenge = typeof mfaChallengesTable.$inferSelect;
