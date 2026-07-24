import { randomInt, createHash, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, gte, desc, sql } from "drizzle-orm";
import {
  db,
  mfaFactorsTable,
  mfaBackupCodesTable,
  mfaChallengesTable,
  type CoachMfaFactor,
  type CoachMfaFactorType,
} from "@workspace/paideia-db";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { RegistrationResponseJSON, AuthenticationResponseJSON, AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { verifyTotp, generateBackupCodes, normalizeBackupCode } from "./totp.js";
import { sendEmail, isEmailConfigured } from "./email.js";

/**
 * Coach MFA core: OTP + WebAuthn helpers and the factor service (over copilot_mfa_*). Any one
 * verified factor satisfies the sign-in challenge. Secrets/backup codes are hashed; OTP codes are
 * never stored in clear; WebAuthn credentials are stored as base64url. Mirrors the Praxis design.
 */

const OTP_TTL_MS = 10 * 60 * 1000;
const sha = (v: string): string => createHash("sha256").update(v).digest("hex");

// ── OTP codes ─────────────────────────────────────────────────────────────────
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
function verifyOtpHash(submitted: string, storedHash: string): boolean {
  const a = Buffer.from(sha(String(submitted ?? "").trim()));
  const b = Buffer.from(String(storedHash ?? ""));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
export function maskEmail(email: string): string {
  const [u, d] = String(email ?? "").split("@");
  if (!d) return "your email";
  return `${u.slice(0, 1)}${"*".repeat(Math.max(1, u.length - 1))}@${d}`;
}
export async function sendEmailOtp(to: string, code: string, purpose: "sign in" | "recovery" = "sign in") {
  if (!isEmailConfigured()) return { ok: false };
  return sendEmail({
    to,
    subject: `Your verification code: ${code}`,
    html: `<p>Your ${purpose} verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:3px">${code}</p><p>It expires in 10 minutes.</p>`,
    text: `Your verification code is ${code} (expires in 10 minutes).`,
  });
}

// ── WebAuthn ──────────────────────────────────────────────────────────────────
const RP_NAME = "The Coach";
export interface StoredCredential { credentialID: string; publicKey: string; counter: number; transports?: AuthenticatorTransportFuture[] }
const b64url = (u: Uint8Array): string => Buffer.from(u).toString("base64url");
const fromB64url = (s: string): Uint8Array<ArrayBuffer> => {
  const buf = Buffer.from(s, "base64url");
  const ab = new ArrayBuffer(buf.byteLength);
  const out = new Uint8Array(ab);
  out.set(buf);
  return out;
};
export function rpFromRequest(host: string | undefined, proto: string | undefined): { rpID: string; origin: string } {
  const cleanHost = String(host ?? "localhost").split(":")[0];
  const scheme = proto === "http" ? "http" : "https";
  return { rpID: process.env["WEBAUTHN_RP_ID"] || cleanHost, origin: process.env["WEBAUTHN_ORIGIN"] || `${scheme}://${host ?? "localhost"}` };
}
export async function registrationOptions(opts: { rpID: string; teacherId: string; userName: string; existing: StoredCredential[] }) {
  return generateRegistrationOptions({
    rpName: RP_NAME, rpID: opts.rpID, userName: opts.userName, userID: new TextEncoder().encode(opts.teacherId),
    attestationType: "none",
    excludeCredentials: opts.existing.map((c) => ({ id: c.credentialID, transports: c.transports })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
}
export async function verifyRegistration(opts: { response: RegistrationResponseJSON; expectedChallenge: string; rpID: string; origin: string }): Promise<StoredCredential | null> {
  const v = await verifyRegistrationResponse({ response: opts.response, expectedChallenge: opts.expectedChallenge, expectedOrigin: opts.origin, expectedRPID: opts.rpID, requireUserVerification: false });
  if (!v.verified || !v.registrationInfo) return null;
  const c = v.registrationInfo.credential;
  return { credentialID: c.id, publicKey: b64url(c.publicKey), counter: c.counter, transports: c.transports };
}
export async function authenticationOptions(opts: { rpID: string; credentials: StoredCredential[] }) {
  return generateAuthenticationOptions({ rpID: opts.rpID, userVerification: "preferred", allowCredentials: opts.credentials.map((c) => ({ id: c.credentialID, transports: c.transports })) });
}
export async function verifyAssertion(opts: { response: AuthenticationResponseJSON; expectedChallenge: string; rpID: string; origin: string; credential: StoredCredential }): Promise<{ newCounter: number } | null> {
  const v = await verifyAuthenticationResponse({
    response: opts.response, expectedChallenge: opts.expectedChallenge, expectedOrigin: opts.origin, expectedRPID: opts.rpID, requireUserVerification: false,
    credential: { id: opts.credential.credentialID, publicKey: fromB64url(opts.credential.publicKey), counter: opts.credential.counter, transports: opts.credential.transports },
  });
  if (!v.verified) return null;
  return { newCounter: v.authenticationInfo.newCounter };
}

// ── Factor service ────────────────────────────────────────────────────────────
export interface FactorSummary { id: string; type: CoachMfaFactorType; label: string; verified: boolean; preferred: boolean; hint?: string; lastUsedAt: Date | null }
export function factorSummary(f: CoachMfaFactor): FactorSummary {
  const s: FactorSummary = { id: f.id, type: f.type as CoachMfaFactorType, label: f.label, verified: !!f.verifiedAt, preferred: f.preferred, lastUsedAt: f.lastUsedAt };
  if ((f.type === "email_otp" || f.type === "email_recovery") && f.email) s.hint = maskEmail(f.email);
  return s;
}
export async function listFactors(teacherId: string): Promise<CoachMfaFactor[]> {
  return db.select().from(mfaFactorsTable).where(eq(mfaFactorsTable.teacherId, teacherId)).orderBy(desc(mfaFactorsTable.createdAt));
}
export async function verifiedFactors(teacherId: string): Promise<CoachMfaFactor[]> {
  return (await listFactors(teacherId)).filter((f) => f.verifiedAt);
}
export async function hasVerifiedFactor(teacherId: string): Promise<boolean> {
  return (await verifiedFactors(teacherId)).length > 0;
}
export async function availableMethods(teacherId: string) {
  const factors = await verifiedFactors(teacherId);
  const methods = Array.from(new Set(factors.map((f) => f.type as CoachMfaFactorType)));
  const hints: Record<string, string> = {};
  for (const f of factors) { const s = factorSummary(f); if (s.hint) hints[f.type] = s.hint; }
  const backupLeft = await backupCodesRemaining(teacherId);
  const preferred = factors.find((f) => f.preferred);
  return { methods, hasBackupCodes: backupLeft > 0, preferred: preferred ? (preferred.type as string) : methods[0] ?? (backupLeft > 0 ? "backup" : null), hints };
}
export async function setPreferred(teacherId: string, factorId: string) {
  await db.update(mfaFactorsTable).set({ preferred: false }).where(eq(mfaFactorsTable.teacherId, teacherId));
  await db.update(mfaFactorsTable).set({ preferred: true }).where(and(eq(mfaFactorsTable.id, factorId), eq(mfaFactorsTable.teacherId, teacherId)));
}
export async function removeFactor(teacherId: string, factorId: string) {
  await db.delete(mfaFactorsTable).where(and(eq(mfaFactorsTable.id, factorId), eq(mfaFactorsTable.teacherId, teacherId)));
}
export async function verifyTotpForTeacher(teacherId: string, code: string): Promise<CoachMfaFactor | null> {
  for (const f of (await verifiedFactors(teacherId)).filter((f) => f.type === "totp" && f.secret)) {
    if (verifyTotp(f.secret!, code)) return f;
  }
  return null;
}
export async function backupCodesRemaining(teacherId: string): Promise<number> {
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(mfaBackupCodesTable).where(and(eq(mfaBackupCodesTable.teacherId, teacherId), isNull(mfaBackupCodesTable.usedAt)));
  return Number(n);
}
export async function regenerateBackupCodes(teacherId: string, count = 10): Promise<string[]> {
  const codes = generateBackupCodes(count);
  await db.delete(mfaBackupCodesTable).where(eq(mfaBackupCodesTable.teacherId, teacherId));
  await db.insert(mfaBackupCodesTable).values(codes.map((c) => ({ teacherId, codeHash: sha(normalizeBackupCode(c)) })));
  return codes;
}
export async function consumeBackupCode(teacherId: string, code: string): Promise<boolean> {
  const hash = sha(normalizeBackupCode(code));
  const [row] = await db.select().from(mfaBackupCodesTable).where(and(eq(mfaBackupCodesTable.teacherId, teacherId), eq(mfaBackupCodesTable.codeHash, hash), isNull(mfaBackupCodesTable.usedAt))).limit(1);
  if (!row) return false;
  await db.update(mfaBackupCodesTable).set({ usedAt: new Date() }).where(eq(mfaBackupCodesTable.id, row.id));
  return true;
}
export async function otpSendRateLimited(teacherId: string, purpose: string): Promise<boolean> {
  const since = new Date(Date.now() - OTP_TTL_MS);
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(mfaChallengesTable).where(and(eq(mfaChallengesTable.teacherId, teacherId), eq(mfaChallengesTable.purpose, purpose), gte(mfaChallengesTable.createdAt, since)));
  return Number(n) >= 5;
}
export async function createOtpChallenge(teacherId: string, purpose: string, destination: string): Promise<string> {
  const code = generateOtp();
  await db.insert(mfaChallengesTable).values({ teacherId, purpose, codeHash: sha(code), destination, expiresAt: new Date(Date.now() + OTP_TTL_MS) });
  return code;
}
export async function verifyOtpChallenge(teacherId: string, purpose: string, code: string): Promise<boolean> {
  const [ch] = await db.select().from(mfaChallengesTable).where(and(eq(mfaChallengesTable.teacherId, teacherId), eq(mfaChallengesTable.purpose, purpose), isNull(mfaChallengesTable.consumedAt))).orderBy(desc(mfaChallengesTable.createdAt)).limit(1);
  if (!ch || !ch.codeHash) return false;
  if (ch.expiresAt.getTime() < Date.now()) return false;
  if (ch.attempts >= 5) return false;
  await db.update(mfaChallengesTable).set({ attempts: ch.attempts + 1 }).where(eq(mfaChallengesTable.id, ch.id));
  if (!verifyOtpHash(code, ch.codeHash)) return false;
  await db.update(mfaChallengesTable).set({ consumedAt: new Date() }).where(eq(mfaChallengesTable.id, ch.id));
  return true;
}
export async function storeWebauthnChallenge(teacherId: string, purpose: "webauthn_reg" | "webauthn_auth", challenge: string) {
  await db.insert(mfaChallengesTable).values({ teacherId, purpose, challenge, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
}
export async function takeWebauthnChallenge(teacherId: string, purpose: "webauthn_reg" | "webauthn_auth"): Promise<string | null> {
  const [ch] = await db.select().from(mfaChallengesTable).where(and(eq(mfaChallengesTable.teacherId, teacherId), eq(mfaChallengesTable.purpose, purpose), isNull(mfaChallengesTable.consumedAt))).orderBy(desc(mfaChallengesTable.createdAt)).limit(1);
  if (!ch || !ch.challenge) return null;
  await db.update(mfaChallengesTable).set({ consumedAt: new Date() }).where(eq(mfaChallengesTable.id, ch.id));
  if (ch.expiresAt.getTime() < Date.now()) return null;
  return ch.challenge;
}
export async function markVerified(teacherId: string, type: string) {
  const [pending] = await db.select().from(mfaFactorsTable).where(and(eq(mfaFactorsTable.teacherId, teacherId), eq(mfaFactorsTable.type, type), isNull(mfaFactorsTable.verifiedAt))).orderBy(desc(mfaFactorsTable.createdAt)).limit(1);
  if (pending) await db.update(mfaFactorsTable).set({ verifiedAt: new Date() }).where(eq(mfaFactorsTable.id, pending.id));
}
export async function markFactorUsed(factorId: string) {
  await db.update(mfaFactorsTable).set({ lastUsedAt: new Date() }).where(eq(mfaFactorsTable.id, factorId));
}
