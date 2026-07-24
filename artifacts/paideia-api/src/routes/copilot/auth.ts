import { Router, type IRouter } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { db, teachersTable, sessionsTable, passwordResetsTable, mfaFactorsTable } from "@workspace/paideia-db";
import { and, eq, gt, isNull, desc } from "drizzle-orm";
import {
  hasVerifiedFactor, availableMethods, verifiedFactors, verifyTotpForTeacher, consumeBackupCode,
  verifyOtpChallenge, createOtpChallenge, otpSendRateLimited, storeWebauthnChallenge, takeWebauthnChallenge,
  authenticationOptions, verifyAssertion, rpFromRequest, sendEmailOtp, maskEmail, markFactorUsed,
  listFactors, factorSummary, backupCodesRemaining, regenerateBackupCodes, setPreferred, removeFactor,
  registrationOptions, verifyRegistration, markVerified, type StoredCredential,
} from "../../lib/mfaCore.js";
import { generateSecret, otpauthUrl, verifyTotp } from "../../lib/totp.js";
import { isEmailConfigured } from "../../lib/email.js";
import {
  hashPassword,
  newSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  sessionExpiry,
  verifyPassword,
} from "../../lib/auth.js";
import { REGION_IDS } from "../../lib/catalog.js";
import { requireAuth } from "../../middlewares/auth.js";
import { rateLimit } from "../../middlewares/rateLimit.js";
import { logEvent } from "../../lib/eventLog.js";

const router: IRouter = Router();

const signupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120),
  region: z.string().refine((v) => REGION_IDS.includes(v), {
    message: "Unknown region",
  }),
  country: z.string().max(120).optional(),
  schoolName: z.string().max(200).optional(),
  subjects: z.array(z.string().max(120)).max(20).default([]),
  yearGroups: z.array(z.string().max(40)).max(20).default([]),
});

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
  // Second factor (any one verified factor satisfies the challenge).
  method: z.string().max(40).optional(),
  code: z.string().max(120).optional(),
  assertion: z.any().optional(),
});

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env["NODE_ENV"] === "production",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

router.post("/signup", rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }), async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const emailLower = data.email.trim().toLowerCase();
  const isFounder = adminEmails().has(emailLower);

  const existing = await db
    .select({ id: teachersTable.id })
    .from(teachersTable)
    .where(eq(teachersTable.email, emailLower))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "An account with that email already exists" });
    return;
  }

  const [teacher] = await db
    .insert(teachersTable)
    .values({
      email: emailLower,
      passwordHash: hashPassword(data.password),
      name: data.name.trim(),
      region: data.region,
      country: data.country?.trim() || null,
      schoolName: data.schoolName?.trim() || null,
      subjects: data.subjects,
      yearGroups: data.yearGroups,
      status: "active",
      approvedAt: new Date(),
    })
    .returning();

  const token = newSessionToken();
  await db.insert(sessionsTable).values({
    token,
    teacherId: teacher.id,
    expiresAt: sessionExpiry(),
  });

  res.cookie(SESSION_COOKIE, token, cookieOptions());
  req.teacher = teacher;
  void logEvent(req, "teacher_signed_up", {
    region: data.region,
    country: data.country ?? null,
    school: data.schoolName ?? null,
  }, { surface: "app" });
  res.json({ teacher: serialiseTeacher(teacher) });
});

router.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const emailLower = parsed.data.email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(teachersTable)
    .where(eq(teachersTable.email, emailLower))
    .limit(1);
  const teacher = rows[0];
  if (!teacher || !verifyPassword(parsed.data.password, teacher.passwordHash)) {
    res.status(401).json({ error: "Email or password is incorrect" });
    return;
  }

  // Second factor. Skipped entirely for teachers with no verified factor, so existing sign-ins are
  // unaffected. Any ONE verified factor satisfies the challenge - the client picks a method.
  if (await hasVerifiedFactor(teacher.id)) {
    const { method, code, assertion } = parsed.data;
    if (!code && !assertion) {
      const avail = await availableMethods(teacher.id);
      res.status(200).json({ mfaRequired: true, methods: avail.methods, hasBackupCodes: avail.hasBackupCodes, preferred: avail.preferred, hints: avail.hints });
      return;
    }
    let ok = false;
    let usedFactorId: string | null = null;
    if (assertion) {
      usedFactorId = await verifyCoachPasskey(teacher.id, assertion, req);
      ok = !!usedFactorId;
    } else if (method === "backup") {
      ok = await consumeBackupCode(teacher.id, code!);
    } else if (method === "email_otp" || method === "email_recovery") {
      ok = await verifyOtpChallenge(teacher.id, method, code!);
    } else {
      const f = await verifyTotpForTeacher(teacher.id, code!);
      ok = !!f; usedFactorId = f?.id ?? null;
      if (!ok) ok = await consumeBackupCode(teacher.id, code!);
    }
    if (!ok) { res.status(401).json({ error: "Invalid authentication code.", mfaRequired: true }); return; }
    if (usedFactorId) await markFactorUsed(usedFactorId);
  }

  const token = newSessionToken();
  await db.insert(sessionsTable).values({
    token,
    teacherId: teacher.id,
    expiresAt: sessionExpiry(),
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  req.teacher = teacher;
  void logEvent(req, "teacher_logged_in", {}, { surface: "app" });
  res.json({ teacher: serialiseTeacher(teacher) });
});

/** Verify a passkey assertion at login for Coach; returns the factor id, or null. */
async function verifyCoachPasskey(teacherId: string, assertion: unknown, req: { headers: { host?: string }; protocol?: string }): Promise<string | null> {
  const challenge = await takeWebauthnChallenge(teacherId, "webauthn_auth");
  if (!challenge) return null;
  const assertionId = (assertion as { id?: string })?.id;
  const factor = (await verifiedFactors(teacherId)).filter((f) => f.type === "passkey")
    .find((f) => (f.credential as unknown as StoredCredential)?.credentialID === assertionId);
  if (!factor) return null;
  const { rpID, origin } = rpFromRequest(req.headers.host, req.protocol);
  try {
    const result = await verifyAssertion({ response: assertion as never, expectedChallenge: challenge, rpID, origin, credential: factor.credential as unknown as StoredCredential });
    if (!result) return null;
    const cred = { ...(factor.credential as unknown as StoredCredential), counter: result.newCounter };
    await db.update(mfaFactorsTable).set({ credential: cred as unknown as Record<string, unknown>, lastUsedAt: new Date() }).where(eq(mfaFactorsTable.id, factor.id));
    return factor.id;
  } catch { return null; }
}

// ── MFA challenge issuer (login-time OTP / passkey) ────────────────────────────────
router.post("/mfa/challenge", async (req, res) => {
  const email = String(req.body?.email ?? "").toLowerCase().trim();
  const password = String(req.body?.password ?? "");
  const method = String(req.body?.method ?? "").trim();
  const [teacher] = await db.select().from(teachersTable).where(eq(teachersTable.email, email)).limit(1);
  if (!teacher || !verifyPassword(password, teacher.passwordHash)) { res.status(401).json({ error: "Email or password is incorrect" }); return; }
  if (!(await hasVerifiedFactor(teacher.id))) { res.json({ mfaRequired: false }); return; }
  if (method === "email_otp" || method === "email_recovery") {
    const factor = (await verifiedFactors(teacher.id)).find((f) => f.type === method);
    const to = factor?.email || teacher.email;
    if (await otpSendRateLimited(teacher.id, method)) { res.status(429).json({ error: "Too many codes requested. Please wait a few minutes." }); return; }
    const code = await createOtpChallenge(teacher.id, method, to);
    await sendEmailOtp(to, code, method === "email_recovery" ? "recovery" : "sign in");
    res.json({ sent: true, sentTo: maskEmail(to) });
    return;
  }
  if (method === "passkey") {
    const creds = (await verifiedFactors(teacher.id)).filter((f) => f.type === "passkey").map((f) => f.credential as unknown as StoredCredential);
    if (!creds.length) { res.status(400).json({ error: "No passkey is enrolled." }); return; }
    const { rpID } = rpFromRequest(req.headers.host, req.protocol);
    const options = await authenticationOptions({ rpID, credentials: creds });
    await storeWebauthnChallenge(teacher.id, "webauthn_auth", options.challenge);
    res.json({ options });
    return;
  }
  res.status(400).json({ error: "Unknown method." });
});

router.post("/logout", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  }
  void logEvent(req, "teacher_logged_out", {}, { surface: "app" });
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  if (!req.teacher) {
    res.json({ teacher: null });
    return;
  }
  res.json({
    teacher: serialiseTeacher(req.teacher),
    impersonator: req.impersonator ? serialiseTeacher(req.impersonator) : null,
  });
});

const onboardingSchema = z.object({
  country: z.string().max(120).optional(),
  schoolName: z.string().max(200).optional(),
  subjects: z.array(z.string().max(120)).max(20).default([]),
  yearGroups: z.array(z.string().max(40)).max(20).default([]),
});

router.post("/complete-onboarding", requireAuth, async (req, res) => {
  const parsed = onboardingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please complete every field" });
    return;
  }
  const [updated] = await db
    .update(teachersTable)
    .set({
      country: parsed.data.country?.trim() ?? null,
      schoolName: parsed.data.schoolName?.trim() ?? null,
      subjects: parsed.data.subjects,
      yearGroups: parsed.data.yearGroups,
      onboardedAt: new Date(),
    })
    .where(eq(teachersTable.id, req.teacher!.id))
    .returning();
  void logEvent(req, "onboarding_completed", {}, { surface: "app" });
  res.json({ teacher: serialiseTeacher(updated) });
});

const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(200),
});

router.post("/reset-password", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const rows = await db
    .select()
    .from(passwordResetsTable)
    .where(
      and(
        eq(passwordResetsTable.token, parsed.data.token),
        isNull(passwordResetsTable.usedAt),
        gt(passwordResetsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const reset = rows[0];
  if (!reset) {
    res.status(400).json({ error: "This reset link is invalid or has expired." });
    return;
  }
  await db
    .update(teachersTable)
    .set({ passwordHash: hashPassword(parsed.data.password) })
    .where(eq(teachersTable.id, reset.teacherId));
  await db
    .update(passwordResetsTable)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetsTable.id, reset.id));
  // Invalidate all existing sessions for this teacher.
  await db.delete(sessionsTable).where(eq(sessionsTable.teacherId, reset.teacherId));
  void logEvent(req, "password_reset_completed", {}, { surface: "app" });
  res.json({ ok: true });
});

export async function mintPasswordReset(teacherId: string, adminId: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db
    .insert(passwordResetsTable)
    .values({ teacherId, token, expiresAt, issuedByAdminId: adminId });
  return { token, expiresAt };
}

const updateProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  region: z
    .string()
    .refine((v) => REGION_IDS.includes(v), { message: "Unknown region" })
    .optional(),
  country: z.string().max(120).nullable().optional(),
  schoolName: z.string().max(200).nullable().optional(),
  subjects: z.array(z.string().max(120)).max(20).optional(),
  yearGroups: z.array(z.string().max(40)).max(20).optional(),
});

router.patch("/me", requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [updated] = await db
    .update(teachersTable)
    .set(parsed.data)
    .where(eq(teachersTable.id, req.teacher!.id))
    .returning();
  res.json({ teacher: serialiseTeacher(updated) });
});

// ── MFA enrolment + management (authenticated, self-service) ───────────────────────
// A teacher may enrol several methods; any one verified method satisfies the sign-in challenge.

async function firstTimeBackup(teacherId: string): Promise<{ enrolled: true; backupCodes?: string[] }> {
  if ((await backupCodesRemaining(teacherId)) === 0) {
    return { enrolled: true, backupCodes: await regenerateBackupCodes(teacherId) };
  }
  return { enrolled: true };
}

router.get("/mfa/factors", requireAuth, async (req, res) => {
  const id = req.teacher!.id;
  const [factors, backupLeft] = await Promise.all([listFactors(id), backupCodesRemaining(id)]);
  res.json({
    factors: factors.map(factorSummary),
    backupCodesRemaining: backupLeft,
    emailAvailable: isEmailConfigured(),
    isAdmin: adminEmails().has(req.teacher!.email.toLowerCase()),
  });
});

router.post("/mfa/totp/setup", requireAuth, async (req, res) => {
  const t = req.teacher!;
  const secret = generateSecret();
  await db.delete(mfaFactorsTable).where(and(eq(mfaFactorsTable.teacherId, t.id), eq(mfaFactorsTable.type, "totp"), isNull(mfaFactorsTable.verifiedAt)));
  const [factor] = await db.insert(mfaFactorsTable).values({ teacherId: t.id, type: "totp", label: "Authenticator app", secret }).returning();
  res.json({ factorId: factor.id, secret, otpauthUrl: otpauthUrl(secret, t.email) });
});

router.post("/mfa/totp/verify", requireAuth, async (req, res) => {
  const t = req.teacher!;
  const [pending] = await db.select().from(mfaFactorsTable).where(and(eq(mfaFactorsTable.teacherId, t.id), eq(mfaFactorsTable.type, "totp"), isNull(mfaFactorsTable.verifiedAt))).orderBy(desc(mfaFactorsTable.createdAt)).limit(1);
  if (!pending?.secret) { res.status(400).json({ error: "Start setup first." }); return; }
  if (!verifyTotp(pending.secret, String(req.body?.code ?? "").trim())) { res.status(400).json({ error: "That code did not match." }); return; }
  await db.update(mfaFactorsTable).set({ verifiedAt: new Date() }).where(eq(mfaFactorsTable.id, pending.id));
  res.json(await firstTimeBackup(t.id));
});

const otpSetup = (type: "email_otp" | "email_recovery", purpose: "sign in" | "recovery") =>
  async (req: import("express").Request, res: import("express").Response) => {
    const t = req.teacher!;
    if (!isEmailConfigured()) { res.status(400).json({ error: "Email delivery is not configured." }); return; }
    const email = String(req.body?.email ?? (type === "email_otp" ? t.email : "")).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { res.status(400).json({ error: "Enter a valid email." }); return; }
    await db.delete(mfaFactorsTable).where(and(eq(mfaFactorsTable.teacherId, t.id), eq(mfaFactorsTable.type, type), isNull(mfaFactorsTable.verifiedAt)));
    await db.insert(mfaFactorsTable).values({ teacherId: t.id, type, label: type === "email_otp" ? "Email code" : "Recovery email", email });
    if (await otpSendRateLimited(t.id, type)) { res.status(429).json({ error: "Too many codes requested. Please wait a few minutes." }); return; }
    const code = await createOtpChallenge(t.id, type, email);
    await sendEmailOtp(email, code, purpose);
    res.json({ sentTo: maskEmail(email) });
  };
const otpVerify = (type: "email_otp" | "email_recovery") =>
  async (req: import("express").Request, res: import("express").Response) => {
    const t = req.teacher!;
    if (!(await verifyOtpChallenge(t.id, type, String(req.body?.code ?? "").trim()))) { res.status(400).json({ error: "That code is not valid or has expired." }); return; }
    await markVerified(t.id, type);
    res.json(await firstTimeBackup(t.id));
  };
router.post("/mfa/email/setup", requireAuth, otpSetup("email_otp", "sign in"));
router.post("/mfa/email/verify", requireAuth, otpVerify("email_otp"));
router.post("/mfa/recovery/setup", requireAuth, otpSetup("email_recovery", "recovery"));
router.post("/mfa/recovery/verify", requireAuth, otpVerify("email_recovery"));

router.post("/mfa/passkey/register/options", requireAuth, async (req, res) => {
  const t = req.teacher!;
  const { rpID } = rpFromRequest(req.headers.host, req.protocol);
  const existing = (await verifiedFactors(t.id)).filter((f) => f.type === "passkey").map((f) => f.credential as unknown as StoredCredential);
  const options = await registrationOptions({ rpID, teacherId: t.id, userName: t.email, existing });
  await storeWebauthnChallenge(t.id, "webauthn_reg", options.challenge);
  res.json(options);
});
router.post("/mfa/passkey/register/verify", requireAuth, async (req, res) => {
  const t = req.teacher!;
  const { rpID, origin } = rpFromRequest(req.headers.host, req.protocol);
  const challenge = await takeWebauthnChallenge(t.id, "webauthn_reg");
  if (!challenge) { res.status(400).json({ error: "Your passkey setup expired. Please try again." }); return; }
  let credential: StoredCredential | null = null;
  try { credential = await verifyRegistration({ response: req.body?.response, expectedChallenge: challenge, rpID, origin }); } catch { credential = null; }
  if (!credential) { res.status(400).json({ error: "We could not register that passkey." }); return; }
  const label = String(req.body?.label ?? "Passkey").trim().slice(0, 60) || "Passkey";
  await db.insert(mfaFactorsTable).values({ teacherId: t.id, type: "passkey", label, credential: credential as unknown as Record<string, unknown>, verifiedAt: new Date() });
  res.json(await firstTimeBackup(t.id));
});

router.post("/mfa/backup/regenerate", requireAuth, async (req, res) => {
  res.json({ backupCodes: await regenerateBackupCodes(req.teacher!.id) });
});
router.post("/mfa/preferred", requireAuth, async (req, res) => {
  await setPreferred(req.teacher!.id, String(req.body?.factorId ?? ""));
  res.json({ ok: true });
});
router.delete("/mfa/factors/:id", requireAuth, async (req, res) => {
  const t = req.teacher!;
  const verified = await verifiedFactors(t.id);
  const target = verified.find((f) => f.id === req.params.id);
  // Admins must keep at least one method (MFA is enforced for the privileged tier).
  if (target && verified.length === 1 && adminEmails().has(t.email.toLowerCase())) {
    res.status(400).json({ error: "Admins must keep at least one sign-in method. Add another first." });
    return;
  }
  await removeFactor(t.id, String(req.params.id));
  res.json({ ok: true });
});

export function adminEmails(): Set<string> {
  return new Set(
    (process.env["ADMIN_EMAILS"] ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function serialiseTeacher(t: typeof teachersTable.$inferSelect) {
  const { passwordHash: _ignored, ...rest } = t;
  return {
    ...rest,
    isAdmin: adminEmails().has(t.email.toLowerCase()),
    onboardedAt: t.onboardedAt ? t.onboardedAt.toISOString() : null,
    approvedAt: t.approvedAt ? t.approvedAt.toISOString() : null,
    subscriptionCurrentPeriodEnd: t.subscriptionCurrentPeriodEnd ? t.subscriptionCurrentPeriodEnd.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  };
}

export default router;
