import { Router } from "express";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db, mfaFactorsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { mfaRequiredForRole } from "../lib/mfaPolicy";
import { generateSecret, otpauthUrl, verifyTotp } from "../lib/totp";
import {
  listFactors, factorSummary, verifiedFactors, syncMfaEnabled, setPreferred, removeFactor,
  backupCodesRemaining, regenerateBackupCodes, createOtpChallenge, verifyOtpChallenge,
  otpSendRateLimited, storeWebauthnChallenge, takeWebauthnChallenge,
} from "../lib/mfaService";
import { smsEnabled, sendEmailOtp, sendSmsOtp, maskEmail, maskPhone } from "../lib/otpChannels";
import { emailEnabled } from "../lib/email";
import { rpFromRequest, registrationOptions, verifyRegistration, type StoredCredential } from "../lib/webauthn";

/**
 * MFA enrolment + management (authenticated, self-service). A user may enrol several factors of
 * different types; ANY one verified factor satisfies the login challenge. Every enrol/verify/remove
 * is audit-logged; no secret or code is ever logged. Removing the last verified factor is blocked
 * while the user's role requires MFA.
 */
const router = Router();

const rp = (req: { headers: Record<string, unknown>; protocol?: string }) =>
  rpFromRequest(req.headers.host as string | undefined, (req as { protocol?: string }).protocol);

// GET /auth/mfa/factors — the user's enrolled methods + capabilities for the /security page.
router.get("/auth/mfa/factors", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  const [factors, backupLeft] = await Promise.all([listFactors(u.id), backupCodesRemaining(u.id)]);
  res.json({
    factors: factors.map(factorSummary),
    backupCodesRemaining: backupLeft,
    smsAvailable: smsEnabled(),
    emailAvailable: emailEnabled(),
    mfaRequired: mfaRequiredForRole(u.role),
  });
});

// ── TOTP authenticator ─────────────────────────────────────────────────────────
router.post("/auth/mfa/totp/setup", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  const secret = generateSecret();
  // Replace any prior pending (unverified) totp factor so re-starting setup is clean.
  await db.delete(mfaFactorsTable).where(and(eq(mfaFactorsTable.userId, u.id), eq(mfaFactorsTable.type, "totp"), isNull(mfaFactorsTable.verifiedAt)));
  const [factor] = await db.insert(mfaFactorsTable).values({ userId: u.id, type: "totp", label: "Authenticator app", secret }).returning();
  res.json({ factorId: factor.id, secret, otpauthUrl: otpauthUrl(secret, u.email) });
});

router.post("/auth/mfa/totp/verify", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  const code = String(req.body?.code ?? "").trim();
  const [pending] = await db.select().from(mfaFactorsTable)
    .where(and(eq(mfaFactorsTable.userId, u.id), eq(mfaFactorsTable.type, "totp"), isNull(mfaFactorsTable.verifiedAt)))
    .orderBy(desc(mfaFactorsTable.createdAt)).limit(1);
  if (!pending || !pending.secret) { res.status(400).json({ error: "Start setup first." }); return; }
  if (!verifyTotp(pending.secret, code)) { res.status(400).json({ error: "That code did not match. Check your authenticator app and try again." }); return; }
  await db.update(mfaFactorsTable).set({ verifiedAt: new Date() }).where(eq(mfaFactorsTable.id, pending.id));
  await syncMfaEnabled(u.id);
  await logAudit(req, "mfa.enroll", "mfa_factor", pending.id, { type: "totp" });
  res.json(await firstTimeBackupPayload(u.id, req));
});

// ── Email OTP ────────────────────────────────────────────────────────────────────
router.post("/auth/mfa/email/setup", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  if (!emailEnabled()) { res.status(400).json({ error: "Email delivery is not configured." }); return; }
  const email = String(req.body?.email ?? u.email).trim().toLowerCase();
  await db.delete(mfaFactorsTable).where(and(eq(mfaFactorsTable.userId, u.id), eq(mfaFactorsTable.type, "email_otp"), isNull(mfaFactorsTable.verifiedAt)));
  const [factor] = await db.insert(mfaFactorsTable).values({ userId: u.id, type: "email_otp", label: "Email code", email }).returning();
  if (await otpSendRateLimited(u.id, "email_otp")) { res.status(429).json({ error: "Too many codes requested. Please wait a few minutes." }); return; }
  const code = await createOtpChallenge(u.id, "email_otp", email);
  await sendEmailOtp(email, code);
  res.json({ factorId: factor.id, sentTo: maskEmail(email) });
});

router.post("/auth/mfa/email/verify", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  const code = String(req.body?.code ?? "").trim();
  if (!(await verifyOtpChallenge(u.id, "email_otp", code))) { res.status(400).json({ error: "That code is not valid or has expired." }); return; }
  await markVerified(u.id, "email_otp");
  await logAudit(req, "mfa.enroll", "mfa_factor", null, { type: "email_otp" });
  res.json(await firstTimeBackupPayload(u.id, req));
});

// ── SMS OTP (graceful when Twilio unconfigured) ────────────────────────────────────
router.post("/auth/mfa/sms/setup", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  if (!smsEnabled()) { res.status(400).json({ error: "SMS is not available." }); return; }
  const phone = String(req.body?.phone ?? "").trim();
  if (!/^\+?[0-9]{7,15}$/.test(phone.replace(/[\s-]/g, ""))) { res.status(400).json({ error: "Enter a valid phone number in international format, e.g. +27821234567." }); return; }
  await db.delete(mfaFactorsTable).where(and(eq(mfaFactorsTable.userId, u.id), eq(mfaFactorsTable.type, "sms_otp"), isNull(mfaFactorsTable.verifiedAt)));
  const [factor] = await db.insert(mfaFactorsTable).values({ userId: u.id, type: "sms_otp", label: "Text message", phone }).returning();
  if (await otpSendRateLimited(u.id, "sms_otp")) { res.status(429).json({ error: "Too many codes requested. Please wait a few minutes." }); return; }
  const code = await createOtpChallenge(u.id, "sms_otp", phone);
  await sendSmsOtp(phone, code);
  res.json({ factorId: factor.id, sentTo: maskPhone(phone) });
});

router.post("/auth/mfa/sms/verify", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  const code = String(req.body?.code ?? "").trim();
  if (!(await verifyOtpChallenge(u.id, "sms_otp", code))) { res.status(400).json({ error: "That code is not valid or has expired." }); return; }
  await markVerified(u.id, "sms_otp");
  await logAudit(req, "mfa.enroll", "mfa_factor", null, { type: "sms_otp" });
  res.json(await firstTimeBackupPayload(u.id, req));
});

// ── Email recovery (lockout recovery channel) ──────────────────────────────────────
router.post("/auth/mfa/recovery/setup", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  if (!emailEnabled()) { res.status(400).json({ error: "Email delivery is not configured." }); return; }
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { res.status(400).json({ error: "Enter a valid recovery email." }); return; }
  await db.delete(mfaFactorsTable).where(and(eq(mfaFactorsTable.userId, u.id), eq(mfaFactorsTable.type, "email_recovery"), isNull(mfaFactorsTable.verifiedAt)));
  const [factor] = await db.insert(mfaFactorsTable).values({ userId: u.id, type: "email_recovery", label: "Recovery email", email }).returning();
  if (await otpSendRateLimited(u.id, "email_recovery")) { res.status(429).json({ error: "Too many codes requested. Please wait a few minutes." }); return; }
  const code = await createOtpChallenge(u.id, "email_recovery", email);
  await sendEmailOtp(email, code, "recovery");
  res.json({ factorId: factor.id, sentTo: maskEmail(email) });
});

router.post("/auth/mfa/recovery/verify", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  const code = String(req.body?.code ?? "").trim();
  if (!(await verifyOtpChallenge(u.id, "email_recovery", code))) { res.status(400).json({ error: "That code is not valid or has expired." }); return; }
  await markVerified(u.id, "email_recovery");
  await logAudit(req, "mfa.enroll", "mfa_factor", null, { type: "email_recovery" });
  res.json(await firstTimeBackupPayload(u.id, req));
});

// ── Passkey / WebAuthn ─────────────────────────────────────────────────────────────
router.post("/auth/mfa/passkey/register/options", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  const { rpID } = rp(req);
  const existing = (await verifiedFactors(u.id)).filter((f) => f.type === "passkey").map((f) => f.credential as unknown as StoredCredential);
  const options = await registrationOptions({ rpID, userId: u.id, userName: u.email, existing });
  await storeWebauthnChallenge(u.id, "webauthn_reg", options.challenge);
  res.json(options);
});

router.post("/auth/mfa/passkey/register/verify", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  const { rpID, origin } = rp(req);
  const challenge = await takeWebauthnChallenge(u.id, "webauthn_reg");
  if (!challenge) { res.status(400).json({ error: "Your passkey setup expired. Please try again." }); return; }
  let credential: StoredCredential | null = null;
  try {
    credential = await verifyRegistration({ response: req.body?.response, expectedChallenge: challenge, rpID, origin });
  } catch {
    credential = null;
  }
  if (!credential) { res.status(400).json({ error: "We could not register that passkey. Please try again." }); return; }
  const label = String(req.body?.label ?? "Passkey").trim().slice(0, 60) || "Passkey";
  const [factor] = await db.insert(mfaFactorsTable).values({
    userId: u.id, type: "passkey", label,
    credential: credential as unknown as Record<string, unknown>, verifiedAt: new Date(),
  }).returning();
  await syncMfaEnabled(u.id);
  await logAudit(req, "mfa.enroll", "mfa_factor", factor.id, { type: "passkey" });
  res.json(await firstTimeBackupPayload(u.id, req));
});

// ── Backup codes ────────────────────────────────────────────────────────────────
router.post("/auth/mfa/backup/regenerate", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  const codes = await regenerateBackupCodes(u.id);
  await logAudit(req, "mfa.backup_regenerate", "mfa_backup_codes", null, { count: codes.length });
  res.json({ backupCodes: codes });
});

// ── Preferred + removal ───────────────────────────────────────────────────────────
router.post("/auth/mfa/preferred", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  const factorId = String(req.body?.factorId ?? "");
  await setPreferred(u.id, factorId);
  res.json({ ok: true });
});

router.delete("/auth/mfa/factors/:id", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  const verified = await verifiedFactors(u.id);
  const target = verified.find((f) => f.id === req.params.id);
  // Block removing the last verified factor while this role must keep MFA on.
  if (target && verified.length === 1 && mfaRequiredForRole(u.role)) {
    res.status(400).json({ error: "You must keep at least one sign-in method while two-factor is required for your role. Add another method first." });
    return;
  }
  await removeFactor(u.id, req.params.id);
  await logAudit(req, "mfa.remove", "mfa_factor", req.params.id, { type: target?.type });
  res.json({ ok: true });
});

// ── Helpers ────────────────────────────────────────────────────────────────────
async function markVerified(userId: string, type: string): Promise<void> {
  const [pending] = await db.select().from(mfaFactorsTable)
    .where(and(eq(mfaFactorsTable.userId, userId), eq(mfaFactorsTable.type, type), isNull(mfaFactorsTable.verifiedAt)))
    .orderBy(desc(mfaFactorsTable.createdAt)).limit(1);
  if (pending) await db.update(mfaFactorsTable).set({ verifiedAt: new Date() }).where(eq(mfaFactorsTable.id, pending.id));
  await syncMfaEnabled(userId);
}

/**
 * When a user has just enrolled their FIRST verified factor, mint one-time backup codes and return
 * them (shown once). On later enrolments there is nothing to reveal. Keeps the "backup codes shown
 * once" contract without a separate step.
 */
async function firstTimeBackupPayload(userId: string, req: Parameters<typeof logAudit>[0]): Promise<{ enrolled: true; backupCodes?: string[] }> {
  const remaining = await backupCodesRemaining(userId);
  if (remaining === 0) {
    const codes = await regenerateBackupCodes(userId);
    await logAudit(req, "mfa.backup_generate", "mfa_backup_codes", null, { count: codes.length });
    return { enrolled: true, backupCodes: codes };
  }
  return { enrolled: true };
}

export default router;
