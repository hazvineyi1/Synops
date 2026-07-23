import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  organisationsTable,
  partnersTable,
  authSessionsTable,
  passwordResetsTable,
  loginEventsTable,
} from "@workspace/db";
import { eq, and, isNull, gt } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { sendSetPasswordEmail, emailEnabled } from "../lib/email";
import {
  hashPassword,
  verifyPassword,
  newSessionToken,
  sessionExpiry,
  cookieOptions,
  passwordProblem,
  sha256,
  clientIp,
  SESSION_COOKIE,
} from "../lib/auth";
import { generateSecret, verifyTotp, otpauthUrl, generateBackupCodes, normalizeBackupCode } from "../lib/totp";
import { PRIVACY_POLICY_VERSION, consentRequired } from "../lib/popia";

const router = Router();

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function publicUser(u: typeof usersTable.$inferSelect, impersonatorId?: string) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    avatarUrl: u.avatarUrl,
    role: u.role,
    status: u.status,
    partnerId: u.partnerId,
    organisationId: u.organisationId,
    coachPersonality: u.coachPersonality,
    // The UI must be able to show an unmissable "you are impersonating" banner.
    impersonating: !!impersonatorId,
    // POPIA: has this user accepted the current privacy-policy version? The SPA
    // shows a blocking consent gate when consentRequired is true.
    consentVersion: u.consentVersion ?? null,
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    consentRequired: consentRequired(u.consentVersion),
  };
}

/** POST /auth/login */
router.post("/auth/login", async (req, res) => {
  const email = String(req.body?.email ?? "").toLowerCase().trim();
  const password = String(req.body?.password ?? "");
  const ip = clientIp(req as any);
  const ua = req.headers["user-agent"] ?? null;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

  // Record failures as well as successes. A login trail that only shows successes is
  // useless for spotting credential stuffing, and useless to a support agent asking
  // "why can't this user get in?".
  const logAttempt = (outcome: "success" | "bad_password" | "unknown_email" | "suspended") =>
    db
      .insert(loginEventsTable)
      .values({
        userId: user?.id ?? null,
        email,
        outcome,
        ipAddress: ip,
        userAgent: typeof ua === "string" ? ua : null,
      })
      .catch(() => {});

  if (!user) {
    await logAttempt("unknown_email");
    // Same message and shape as a bad password: never reveal whether an email exists.
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  if (user.status === "suspended") {
    await logAttempt("suspended");
    res.status(403).json({ error: "This account has been suspended." });
    return;
  }

  if (!verifyPassword(password, user.passwordHash)) {
    await logAttempt("bad_password");
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  // Opt-in second factor. DORMANT for everyone who hasn't enrolled: mfaEnabled defaults false, so
  // this whole block is skipped and login behaves exactly as before. Only an enrolled user is asked
  // for a code — the client re-POSTs email+password+code on the same endpoint.
  if (user.mfaEnabled) {
    const code = String(req.body?.code ?? req.body?.mfaCode ?? "").trim();
    if (!code) {
      // Password was correct; we just need the second factor. No session issued yet.
      res.status(200).json({ mfaRequired: true });
      return;
    }
    const okTotp = user.mfaSecret ? verifyTotp(user.mfaSecret, code) : false;
    let okBackup = false;
    if (!okTotp) {
      const hash = sha256(normalizeBackupCode(code));
      const remaining = user.mfaBackupCodes ?? [];
      if (remaining.includes(hash)) {
        okBackup = true; // one-time: consume it
        await db.update(usersTable).set({ mfaBackupCodes: remaining.filter((c) => c !== hash) }).where(eq(usersTable.id, user.id));
      }
    }
    if (!okTotp && !okBackup) {
      await logAttempt("bad_password");
      res.status(401).json({ error: "Invalid authentication code.", mfaRequired: true });
      return;
    }
  }

  const token = newSessionToken();
  await db.insert(authSessionsTable).values({
    token,
    userId: user.id,
    ipAddress: ip,
    userAgent: typeof ua === "string" ? ua : null,
    expiresAt: sessionExpiry(),
  });

  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date(), status: user.status === "invited" ? "active" : user.status })
    .where(eq(usersTable.id, user.id));

  await logAttempt("success");

  res.cookie(SESSION_COOKIE, token, cookieOptions());
  res.json({ user: publicUser(user) });
});

// ── Opt-in TOTP two-factor auth ─────────────────────────────────────────────────
// Enrolment is done while signed in. A user turns 2FA on for their own account; nothing here can
// enable or read another user's secret. Existing accounts are unaffected until they opt in.

/** GET /auth/mfa/status — is 2FA on for me, and how many backup codes are left. */
router.get("/auth/mfa/status", requireAuth, (req, res) => {
  const u = req.dbUser!;
  res.json({ enabled: !!u.mfaEnabled, backupCodesRemaining: (u.mfaBackupCodes ?? []).length });
});

/** POST /auth/mfa/setup — issue a fresh secret + otpauth URI. NOT active until /enable confirms it. */
router.post("/auth/mfa/setup", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  if (u.mfaEnabled) { res.status(409).json({ error: "Two-factor is already on. Turn it off first to re-enrol." }); return; }
  const secret = generateSecret();
  await db.update(usersTable).set({ mfaSecret: secret }).where(eq(usersTable.id, u.id));
  res.json({ secret, otpauthUrl: otpauthUrl(secret, u.email) });
});

/** POST /auth/mfa/enable { code } — confirm a live code, activate 2FA, return one-time backup codes. */
router.post("/auth/mfa/enable", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  if (u.mfaEnabled) { res.status(409).json({ error: "Two-factor is already on." }); return; }
  if (!u.mfaSecret) { res.status(400).json({ error: "Start setup first." }); return; }
  const code = String(req.body?.code ?? "").trim();
  if (!verifyTotp(u.mfaSecret, code)) {
    res.status(400).json({ error: "That code didn't match. Check your authenticator app and try again." });
    return;
  }
  const backupCodes = generateBackupCodes(10);
  const hashes = backupCodes.map((c) => sha256(normalizeBackupCode(c)));
  await db.update(usersTable).set({ mfaEnabled: true, mfaBackupCodes: hashes }).where(eq(usersTable.id, u.id));
  // Backup codes are shown exactly once, here.
  res.json({ enabled: true, backupCodes });
});

/** POST /auth/mfa/disable { code } — needs a current authenticator or backup code, so a stolen
 *  session can't silently strip 2FA off the account. */
router.post("/auth/mfa/disable", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  if (!u.mfaEnabled) { res.json({ enabled: false }); return; }
  const code = String(req.body?.code ?? "").trim();
  const okTotp = u.mfaSecret ? verifyTotp(u.mfaSecret, code) : false;
  const okBackup = (u.mfaBackupCodes ?? []).includes(sha256(normalizeBackupCode(code)));
  if (!okTotp && !okBackup) {
    res.status(400).json({ error: "Enter a current authenticator or backup code to turn off two-factor." });
    return;
  }
  await db.update(usersTable).set({ mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] }).where(eq(usersTable.id, u.id));
  res.json({ enabled: false });
});

/**
 * POST /auth/demo-login  { role: "student" | "admin" }
 *
 * One-click, password-free sign-in for sales/demo use on the Enza site. DELIBERATELY
 * NARROW: it can only ever produce a session for one of two fixed demo identities, chosen
 * by an allow-listed keyword — never an arbitrary user id or email from the request. So it
 * cannot be turned into "log me in as anyone".
 *
 *   student -> enza@student1.test  (an existing seeded demo learner)
 *   admin   -> demo.admin@enzaglobalmedia.co.za  (a dedicated demo partner_admin, lazily
 *              created against the Enza partner; it holds no secret — its password is random
 *              and unusable, the only way in is this button)
 *
 * Guarded by ENABLE_DEMO_LOGIN: set it to "0" to switch the whole feature off without a
 * code change. Anything else (including unset) leaves it ON, which is what the demo needs.
 */
const DEMO_STUDENT_EMAIL = "enza@student1.test";
const DEMO_ADMIN_EMAIL = "demo.admin@enzaglobalmedia.co.za";
const ENZA_PARTNER_SLUG = "enza-global";
// Safe-by-default host allowlist: with DEMO_LOGIN_HOSTS unset, the one-click demo only works on the
// known demo host and is invisible (404) on every other host — so standing up a new tenant on a new
// domain can never accidentally expose it. Override with DEMO_LOGIN_HOSTS to add demo hosts.
const DEFAULT_DEMO_HOSTS = ["enza.synops-consulting.com"];

router.post("/auth/demo-login", async (req, res) => {
  if (process.env.ENABLE_DEMO_LOGIN === "0") {
    res.status(404).json({ error: "Not found." });
    return;
  }
  // Defence in depth: the one-click demo only works on an allow-listed host (defaulting to the Enza
  // demo site) and is invisible everywhere else — so it can never be used to enter another tenant.
  // Off entirely with ENABLE_DEMO_LOGIN=0.
  const configured = (process.env.DEMO_LOGIN_HOSTS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const allowHosts = configured.length ? configured : DEFAULT_DEMO_HOSTS;
  const host = String(req.headers.host || "").toLowerCase().split(":")[0];
  if (!allowHosts.includes(host)) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  const role = String(req.body?.role ?? "").toLowerCase().trim();
  if (role !== "student" && role !== "admin") {
    res.status(400).json({ error: "Unknown demo role." });
    return;
  }

  const ip = clientIp(req as any);
  const ua = req.headers["user-agent"];

  let user: typeof usersTable.$inferSelect | undefined;

  if (role === "student") {
    [user] = await db.select().from(usersTable).where(eq(usersTable.email, DEMO_STUDENT_EMAIL)).limit(1);
    if (!user) {
      // Fall back to a real active learner inside the Enza partner, so the demo button works even
      // if the dedicated demo learner was never seeded. Still narrow: only ever an ACTIVE learner
      // belonging to the Enza partner, never an arbitrary account from the request.
      const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.slug, ENZA_PARTNER_SLUG)).limit(1);
      if (partner) {
        const learners = await db
          .select()
          .from(usersTable)
          .where(and(eq(usersTable.partnerId, partner.id), eq(usersTable.role, "learner"), eq(usersTable.status, "active")))
          .limit(200);
        const live = learners
          .filter((u) => !(u as { deletedAt?: Date | null }).deletedAt && !(u as { archivedAt?: Date | null }).archivedAt)
          .sort((a, b) => a.email.localeCompare(b.email));
        // Prefer a learner already placed in an organisation (they have real course context).
        user = live.find((u) => !!u.organisationId) ?? live[0];
      }
      if (!user) {
        res.status(503).json({ error: "The demo learner is not provisioned yet. Seed the Enza cohort first." });
        return;
      }
    }
  } else {
    // admin: find-or-create a dedicated demo partner_admin on the Enza partner.
    [user] = await db.select().from(usersTable).where(eq(usersTable.email, DEMO_ADMIN_EMAIL)).limit(1);
    if (!user) {
      const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.slug, ENZA_PARTNER_SLUG)).limit(1);
      if (!partner) {
        res.status(503).json({ error: "The Enza partner is not provisioned yet." });
        return;
      }
      [user] = await db
        .insert(usersTable)
        .values({
          email: DEMO_ADMIN_EMAIL,
          firstName: "Demo",
          lastName: "Admin",
          role: "partner_admin",
          status: "active",
          partnerId: partner.id,
          organisationId: null,
          // Random, unusable password: this account is reachable only via this button.
          passwordHash: hashPassword(newSessionToken()),
        })
        .returning();
    }
  }

  if (!user) {
    res.status(500).json({ error: "Could not start the demo session." });
    return;
  }

  const token = newSessionToken();
  await db.insert(authSessionsTable).values({
    token,
    userId: user.id,
    ipAddress: ip,
    userAgent: typeof ua === "string" ? ua : null,
    expiresAt: sessionExpiry(),
  });
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  await db
    .insert(loginEventsTable)
    .values({ userId: user.id, email: user.email, outcome: "success", ipAddress: ip, userAgent: typeof ua === "string" ? ua : null })
    .catch(() => {});

  res.cookie(SESSION_COOKIE, token, cookieOptions());
  res.json({ user: publicUser(user) });
});

/** POST /auth/logout — revokes THIS session only. */
router.post("/auth/logout", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    await db
      .update(authSessionsTable)
      .set({ revokedAt: new Date() })
      .where(eq(authSessionsTable.token, token));
  }
  res.clearCookie(SESSION_COOKIE, { path: "/", sameSite: "lax" });
  res.json({ ok: true });
});

/**
 * Heal a facilitator-tier account that is missing its partnerId. A partner_admin/org_admin
 * created through some provisioning paths ended up with organisationId set but partnerId
 * null. The dashboard keys the partner-stats query off partnerId, and the generated hook
 * DISABLES the query when partnerId is null/undefined — so the Overview hung on an infinite
 * loading skeleton. Backfill partnerId from the owning organisation (and persist it so the
 * repair is permanent), then the query enables and real numbers render.
 */
async function healPartnerId(u: typeof usersTable.$inferSelect): Promise<typeof usersTable.$inferSelect> {
  if (u.partnerId || !u.organisationId) return u;
  if (u.role !== "partner_admin" && u.role !== "org_admin" && u.role !== "coach") return u;
  try {
    const [org] = await db
      .select({ partnerId: organisationsTable.partnerId })
      .from(organisationsTable)
      .where(eq(organisationsTable.id, u.organisationId))
      .limit(1);
    if (org?.partnerId) {
      await db.update(usersTable).set({ partnerId: org.partnerId }).where(eq(usersTable.id, u.id));
      return { ...u, partnerId: org.partnerId };
    }
  } catch {
    /* best-effort; fall through to the un-healed user */
  }
  return u;
}

/** GET /auth/me */
router.get("/auth/me", requireAuth, async (req, res) => {
  const healed = await healPartnerId(req.dbUser!);
  res.json({ user: publicUser(healed, req.impersonatorId) });
});

/**
 * POST /auth/forgot-password
 * Always answers 200 with the same body whether or not the address exists -- a
 * different response would let anyone enumerate who has an account.
 */
router.post("/auth/forgot-password", async (req, res) => {
  const email = String(req.body?.email ?? "").toLowerCase().trim();
  if (!email) {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (user) {
    const token = newSessionToken();
    await db.insert(passwordResetsTable).values({
      userId: user.id,
      tokenHash: sha256(token),
      issuedBy: "self_service",
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    // Deliver by email when a provider is configured (RESEND_API_KEY + EMAIL_FROM). Without it,
    // a super_admin still issues the link from the platform console (POST /platform/users/:id/reset-link).
    if (emailEnabled()) {
      const base = (process.env.APP_URL?.replace(/\/$/, "")) || `${req.protocol}://${req.get("host") ?? "localhost"}`;
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
      void sendSetPasswordEmail(user.email, name, `${base}/reset-password?token=${token}`, "reset");
    }
    req.log?.info({ userId: user.id, emailed: emailEnabled() }, "password reset requested");
  }

  res.json({
    ok: true,
    message: "If that email has an account, we have sent a reset link. It expires in 1 hour.",
  });
});

/**
 * POST /auth/reset-password
 * Consumes a single-use token, sets the new password, and REVOKES EVERY SESSION for
 * that user -- so a thief holding a stolen cookie is kicked out too.
 */
router.post("/auth/reset-password", async (req, res) => {
  const token = String(req.body?.token ?? "");
  const password = String(req.body?.password ?? "");

  const problem = passwordProblem(password);
  if (!token || problem) {
    res.status(400).json({ error: problem ?? "A reset token is required." });
    return;
  }

  const [row] = await db
    .select()
    .from(passwordResetsTable)
    .where(
      and(
        eq(passwordResetsTable.tokenHash, sha256(token)),
        isNull(passwordResetsTable.usedAt),
        gt(passwordResetsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) {
    res.status(400).json({ error: "This reset link is invalid or has expired." });
    return;
  }

  await db
    .update(usersTable)
    .set({ passwordHash: hashPassword(password), status: "active" })
    .where(eq(usersTable.id, row.userId));

  await db
    .update(passwordResetsTable)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetsTable.id, row.id));

  await db
    .update(authSessionsTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessionsTable.userId, row.userId), isNull(authSessionsTable.revokedAt)));

  res.clearCookie(SESSION_COOKIE, { path: "/", sameSite: "lax" });
  res.json({ ok: true, message: "Password updated. You can now sign in." });
});

/** POST /auth/change-password — for a signed-in user. */
router.post("/auth/change-password", requireAuth, async (req, res) => {
  const current = String(req.body?.currentPassword ?? "");
  const next = String(req.body?.newPassword ?? "");

  // An impersonating admin must never be able to change the victim's password.
  // Without this, "impersonate" would quietly become "take over the account".
  if (req.impersonatorId) {
    res.status(403).json({ error: "You cannot change a password while impersonating." });
    return;
  }

  const problem = passwordProblem(next);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  if (!verifyPassword(current, req.dbUser!.passwordHash)) {
    res.status(400).json({ error: "Your current password is incorrect." });
    return;
  }

  await db
    .update(usersTable)
    .set({ passwordHash: hashPassword(next) })
    .where(eq(usersTable.id, req.userId!));

  // Keep the current session; revoke all the others.
  await db
    .update(authSessionsTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(authSessionsTable.userId, req.userId!),
        isNull(authSessionsTable.revokedAt),
      ),
    );

  const token = newSessionToken();
  await db.insert(authSessionsTable).values({
    token,
    userId: req.userId!,
    ipAddress: clientIp(req as any),
    expiresAt: sessionExpiry(),
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());

  res.json({ ok: true });
});

export default router;
