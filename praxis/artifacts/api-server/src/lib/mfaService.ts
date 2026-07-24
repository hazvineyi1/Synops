import { and, eq, isNull, gte, desc, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  mfaFactorsTable,
  mfaBackupCodesTable,
  mfaChallengesTable,
  type MfaFactor,
  type MfaFactorType,
} from "@workspace/db";
import { sha256 } from "./auth";
import { verifyTotp, generateBackupCodes, normalizeBackupCode } from "./totp";
import { generateOtp, hashOtp, verifyOtpHash, OTP_EXPIRY_MS, maskEmail, maskPhone } from "./otpChannels";

/**
 * Core MFA service: factor CRUD and verification, over the mfa_factors / mfa_backup_codes /
 * mfa_challenges tables. Any ONE verified factor satisfies the challenge; no method is mandatory.
 *
 * users.mfa_enabled is kept as a maintained mirror of "has at least one verified factor" so the
 * existing gate (mfaSetupRequired) and publicUser payload keep working unchanged. Nothing here
 * logs a secret or an OTP code.
 */

export interface FactorSummary {
  id: string;
  type: MfaFactorType;
  label: string;
  verified: boolean;
  preferred: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  // A masked destination hint for OTP/recovery factors (never the raw address).
  hint?: string;
}

export function factorSummary(f: MfaFactor): FactorSummary {
  const s: FactorSummary = {
    id: f.id,
    type: f.type as MfaFactorType,
    label: f.label,
    verified: !!f.verifiedAt,
    preferred: f.preferred,
    lastUsedAt: f.lastUsedAt,
    createdAt: f.createdAt,
  };
  if (f.type === "sms_otp" && f.phone) s.hint = maskPhone(f.phone);
  if ((f.type === "email_otp" || f.type === "email_recovery") && f.email) s.hint = maskEmail(f.email);
  return s;
}

export async function listFactors(userId: string): Promise<MfaFactor[]> {
  return db.select().from(mfaFactorsTable).where(eq(mfaFactorsTable.userId, userId)).orderBy(desc(mfaFactorsTable.createdAt));
}

export async function verifiedFactors(userId: string): Promise<MfaFactor[]> {
  return (await listFactors(userId)).filter((f) => f.verifiedAt);
}

/** Recompute users.mfa_enabled = (user has >=1 verified factor). Call after any factor change. */
export async function syncMfaEnabled(userId: string): Promise<boolean> {
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mfaFactorsTable)
    .where(and(eq(mfaFactorsTable.userId, userId), sql`${mfaFactorsTable.verifiedAt} is not null`));
  const enabled = Number(n) > 0;
  await db.update(usersTable).set({ mfaEnabled: enabled }).where(eq(usersTable.id, userId));
  return enabled;
}

/** The verified methods a user can be challenged with, for the login method picker + hints. */
export async function availableMethods(userId: string): Promise<{
  methods: MfaFactorType[];
  hasBackupCodes: boolean;
  preferred: MfaFactorType | "backup" | null;
  hints: Partial<Record<string, string>>;
}> {
  const factors = await verifiedFactors(userId);
  const methods = Array.from(new Set(factors.map((f) => f.type as MfaFactorType)));
  const hints: Partial<Record<string, string>> = {};
  for (const f of factors) {
    const summary = factorSummary(f);
    if (summary.hint) hints[f.type] = summary.hint;
  }
  const backupLeft = await backupCodesRemaining(userId);
  const preferredFactor = factors.find((f) => f.preferred);
  return {
    methods,
    hasBackupCodes: backupLeft > 0,
    preferred: preferredFactor ? (preferredFactor.type as MfaFactorType) : methods[0] ?? (backupLeft > 0 ? "backup" : null),
    hints,
  };
}

// ── Preferred + removal ─────────────────────────────────────────────────────────

export async function setPreferred(userId: string, factorId: string): Promise<void> {
  await db.update(mfaFactorsTable).set({ preferred: false }).where(eq(mfaFactorsTable.userId, userId));
  await db.update(mfaFactorsTable).set({ preferred: true }).where(and(eq(mfaFactorsTable.id, factorId), eq(mfaFactorsTable.userId, userId)));
}

export async function removeFactor(userId: string, factorId: string): Promise<void> {
  await db.delete(mfaFactorsTable).where(and(eq(mfaFactorsTable.id, factorId), eq(mfaFactorsTable.userId, userId)));
  await syncMfaEnabled(userId);
}

// ── TOTP ─────────────────────────────────────────────────────────────────────────

/** Verify a TOTP code against ANY of the user's verified authenticator factors. */
export async function verifyTotpForUser(userId: string, code: string): Promise<MfaFactor | null> {
  const factors = (await verifiedFactors(userId)).filter((f) => f.type === "totp" && f.secret);
  for (const f of factors) {
    if (verifyTotp(f.secret!, code)) return f;
  }
  return null;
}

// ── Backup codes ──────────────────────────────────────────────────────────────────

export async function backupCodesRemaining(userId: string): Promise<number> {
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mfaBackupCodesTable)
    .where(and(eq(mfaBackupCodesTable.userId, userId), isNull(mfaBackupCodesTable.usedAt)));
  return Number(n);
}

/** Regenerate the whole set: delete existing, insert ~10 fresh hashed codes, return the plaintext once. */
export async function regenerateBackupCodes(userId: string, count = 10): Promise<string[]> {
  const codes = generateBackupCodes(count);
  await db.delete(mfaBackupCodesTable).where(eq(mfaBackupCodesTable.userId, userId));
  await db.insert(mfaBackupCodesTable).values(codes.map((c) => ({ userId, codeHash: sha256(normalizeBackupCode(c)) })));
  return codes;
}

/** Consume a backup code (single use, constant set membership by hash). Returns true if it matched. */
export async function consumeBackupCode(userId: string, code: string): Promise<boolean> {
  const hash = sha256(normalizeBackupCode(code));
  const [row] = await db
    .select()
    .from(mfaBackupCodesTable)
    .where(and(eq(mfaBackupCodesTable.userId, userId), eq(mfaBackupCodesTable.codeHash, hash), isNull(mfaBackupCodesTable.usedAt)))
    .limit(1);
  if (!row) return false;
  await db.update(mfaBackupCodesTable).set({ usedAt: new Date() }).where(eq(mfaBackupCodesTable.id, row.id));
  return true;
}

// ── OTP challenges (email / SMS / recovery) ────────────────────────────────────────

const MAX_SENDS_PER_WINDOW = 5; // per user+purpose within the OTP TTL
const MAX_VERIFY_ATTEMPTS = 5;

/** True if the user has sent too many codes for this purpose recently (rate limit). */
export async function otpSendRateLimited(userId: string, purpose: string): Promise<boolean> {
  const since = new Date(Date.now() - OTP_EXPIRY_MS);
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mfaChallengesTable)
    .where(and(eq(mfaChallengesTable.userId, userId), eq(mfaChallengesTable.purpose, purpose), gte(mfaChallengesTable.createdAt, since)));
  return Number(n) >= MAX_SENDS_PER_WINDOW;
}

/** Create + store a hashed OTP challenge and return the plaintext code (to be sent, never stored). */
export async function createOtpChallenge(userId: string, purpose: string, destination: string): Promise<string> {
  const code = generateOtp();
  await db.insert(mfaChallengesTable).values({
    userId,
    purpose,
    codeHash: hashOtp(code),
    destination,
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
  });
  return code;
}

/**
 * Verify an OTP against the latest unconsumed, unexpired challenge for this user+purpose.
 * Enforces an attempt cap and consumes the challenge on success. Constant-time hash compare.
 */
export async function verifyOtpChallenge(userId: string, purpose: string, code: string): Promise<boolean> {
  const [ch] = await db
    .select()
    .from(mfaChallengesTable)
    .where(and(eq(mfaChallengesTable.userId, userId), eq(mfaChallengesTable.purpose, purpose), isNull(mfaChallengesTable.consumedAt)))
    .orderBy(desc(mfaChallengesTable.createdAt))
    .limit(1);
  if (!ch || !ch.codeHash) return false;
  if (ch.expiresAt.getTime() < Date.now()) return false;
  if (ch.attempts >= MAX_VERIFY_ATTEMPTS) return false;
  await db.update(mfaChallengesTable).set({ attempts: ch.attempts + 1 }).where(eq(mfaChallengesTable.id, ch.id));
  if (!verifyOtpHash(code, ch.codeHash)) return false;
  await db.update(mfaChallengesTable).set({ consumedAt: new Date() }).where(eq(mfaChallengesTable.id, ch.id));
  return true;
}

// ── WebAuthn challenge persistence ─────────────────────────────────────────────────

export async function storeWebauthnChallenge(userId: string, purpose: "webauthn_reg" | "webauthn_auth", challenge: string): Promise<void> {
  await db.insert(mfaChallengesTable).values({
    userId,
    purpose,
    challenge,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min to complete the ceremony
  });
}

/** Take (consume) the latest unexpired WebAuthn challenge for this user+purpose. */
export async function takeWebauthnChallenge(userId: string, purpose: "webauthn_reg" | "webauthn_auth"): Promise<string | null> {
  const [ch] = await db
    .select()
    .from(mfaChallengesTable)
    .where(and(eq(mfaChallengesTable.userId, userId), eq(mfaChallengesTable.purpose, purpose), isNull(mfaChallengesTable.consumedAt)))
    .orderBy(desc(mfaChallengesTable.createdAt))
    .limit(1);
  if (!ch || !ch.challenge) return null;
  await db.update(mfaChallengesTable).set({ consumedAt: new Date() }).where(eq(mfaChallengesTable.id, ch.id));
  if (ch.expiresAt.getTime() < Date.now()) return null;
  return ch.challenge;
}

export async function markFactorUsed(factorId: string): Promise<void> {
  await db.update(mfaFactorsTable).set({ lastUsedAt: new Date() }).where(eq(mfaFactorsTable.id, factorId));
}
