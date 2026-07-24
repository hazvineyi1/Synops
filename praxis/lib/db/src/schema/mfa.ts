import { pgTable, text, timestamp, boolean, integer, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Multi-factor authentication model.
 *
 * A user may enrol several factors and ANY one verified factor satisfies the MFA challenge - no
 * single method is mandatory. This replaces the old TOTP-only design that lived inline on the users
 * table (users.mfa_secret / mfa_enabled / mfa_backup_codes); those columns are kept and backfilled
 * into mfa_factors on boot so existing authenticator users are never broken. users.mfa_enabled is
 * now a maintained mirror of "has at least one verified factor", so the existing gate keeps working.
 *
 * All secrets are stored hashed or as opaque credentials; OTP codes are never stored in the clear.
 * Managed by the boot-time CREATE-IF-NOT-EXISTS heal in lib/dbHardening.ts (no migration runner).
 */

/** Factor types. "email_recovery" is a lockout-recovery channel, treated as recovery not a primary. */
export type MfaFactorType = "totp" | "passkey" | "email_otp" | "sms_otp" | "email_recovery";

export const mfaFactorsTable = pgTable(
  "mfa_factors",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    type: text("type").notNull(), // MfaFactorType
    label: text("label").notNull().default(""),
    // TOTP: base32 secret (authenticator apps need the shared secret itself, not a hash).
    secret: text("secret"),
    // Passkey/WebAuthn: { credentialID, publicKey, counter, transports } (base64url strings).
    credential: jsonb("credential").$type<Record<string, unknown>>(),
    // Destination for OTP/recovery channels.
    phone: text("phone"),
    email: text("email"),
    // Null while the factor is still pending its first successful verification.
    verifiedAt: timestamp("verified_at"),
    lastUsedAt: timestamp("last_used_at"),
    // The user's default challenge method; at most one preferred per user (enforced in the service).
    preferred: boolean("preferred").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("mfa_factors_user_idx").on(t.userId),
  })
);

export type MfaFactor = typeof mfaFactorsTable.$inferSelect;

/**
 * Single-use backup codes. Shown once at generation, stored only as hashes, consumed at login.
 * Regenerating replaces the whole set (old codes are deleted).
 */
export const mfaBackupCodesTable = pgTable(
  "mfa_backup_codes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("mfa_backup_codes_user_idx").on(t.userId),
  })
);

export type MfaBackupCode = typeof mfaBackupCodesTable.$inferSelect;

/**
 * Transient verification state: an issued OTP (email/SMS/recovery, stored hashed) or a WebAuthn
 * challenge (registration or authentication). Short-lived and consumed on use. Rate-limiting reads
 * the recent rows for a user + purpose.
 */
export const mfaChallengesTable = pgTable(
  "mfa_challenges",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    // email_otp | sms_otp | email_recovery | webauthn_reg | webauthn_auth
    purpose: text("purpose").notNull(),
    // OTP: sha-256 of the 6-digit code. WebAuthn: null.
    codeHash: text("code_hash"),
    // WebAuthn: the base64url challenge we generated. OTP: null.
    challenge: text("challenge"),
    // Where an OTP was sent (email address / phone), for the "code sent to ..." hint.
    destination: text("destination"),
    expiresAt: timestamp("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userPurposeIdx: index("mfa_challenges_user_purpose_idx").on(t.userId, t.purpose),
  })
);

export type MfaChallenge = typeof mfaChallengesTable.$inferSelect;
