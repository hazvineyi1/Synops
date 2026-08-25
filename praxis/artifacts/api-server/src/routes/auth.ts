import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  organisationsTable,
  partnersTable,
  coursesTable,
  modulesTable,
  authSessionsTable,
  passwordResetsTable,
  loginEventsTable,
  mfaFactorsTable,
} from "@workspace/db";
import { eq, and, isNull, gt, desc, asc, ne, sql } from "drizzle-orm";
import { notifyLogin, notifyLogout } from "../lib/securityAlerts";
import { requireAuth } from "../middlewares/requireAuth";
import { resetCandidatePractice } from "./practice";
import { startDemoSession, pingDemoSession, endDemoSession } from "../lib/demoTracking";
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
import { verifyTotp, normalizeBackupCode } from "../lib/totp";
import { PRIVACY_POLICY_VERSION, consentRequired } from "../lib/popia";
import { mfaSetupRequired } from "../lib/mfaPolicy";
import {
  availableMethods, verifyTotpForUser, consumeBackupCode, verifyOtpChallenge, createOtpChallenge,
  otpSendRateLimited, storeWebauthnChallenge, takeWebauthnChallenge, verifiedFactors, markFactorUsed,
} from "../lib/mfaService";
import { sendEmailOtp, sendSmsOtp, smsEnabled, maskEmail, maskPhone } from "../lib/otpChannels";
import { rpFromRequest, authenticationOptions, verifyAssertion, type StoredCredential } from "../lib/webauthn";
import { logAudit } from "../lib/audit";

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
    // 2FA policy: admin roles must enrol. The SPA gates the console until they do.
    mfaEnabled: !!u.mfaEnabled,
    mfaSetupRequired: mfaSetupRequired(u),
    // Set when an admin issued a temporary password: the SPA blocks the app behind a "set a new
    // password" screen until the user chooses one (which clears this flag).
    mustChangePassword: !!(u as { mustChangePassword?: boolean }).mustChangePassword,
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

  // Second factor. DORMANT for everyone who hasn't enrolled: mfaEnabled mirrors "has a verified
  // factor", so this block is skipped and login behaves exactly as before for non-MFA users. Any
  // ONE verified factor satisfies the challenge, the client picks a method and re-POSTs here.
  if (user.mfaEnabled) {
    const method = String(req.body?.method ?? "").trim();
    const code = String(req.body?.code ?? req.body?.mfaCode ?? "").trim();
    const assertion = req.body?.assertion;

    // No credential supplied yet: tell the (password-authenticated) client which methods it can use.
    if (!code && !assertion) {
      const avail = await availableMethods(user.id);
      res.status(200).json({ mfaRequired: true, methods: avail.methods, hasBackupCodes: avail.hasBackupCodes, preferred: avail.preferred, hints: avail.hints });
      return;
    }

    let verifiedFactorId: string | null = null;
    let ok = false;
    if (assertion) {
      const result = await verifyPasskeyAssertion(user.id, assertion, req);
      ok = !!result;
      verifiedFactorId = result;
    } else if (method === "backup") {
      ok = (await consumeBackupCode(user.id, code)) || consumeLegacyBackup(user, code);
    } else if (method === "email_otp" || method === "sms_otp" || method === "email_recovery") {
      ok = await verifyOtpChallenge(user.id, method, code);
      if (ok && method === "email_recovery") {
        await logAudit(req as never, "mfa.recovery_used", "user", user.id, {}); // recovery is logged
      }
    } else {
      // Default path (client sent just a code): try any authenticator, then a backup code.
      const f = await verifyTotpForUser(user.id, code);
      ok = !!f;
      verifiedFactorId = f?.id ?? null;
      // Legacy fallback: an existing TOTP user whose inline secret has not yet been backfilled into
      // mfa_factors (brief window right after deploy) can still sign in. Never breaks current users.
      if (!ok && user.mfaSecret && verifyTotp(user.mfaSecret, code)) ok = true;
      if (!ok) ok = (await consumeBackupCode(user.id, code)) || consumeLegacyBackup(user, code);
    }

    if (!ok) {
      await logAttempt("bad_password");
      res.status(401).json({ error: "Invalid authentication code.", mfaRequired: true });
      return;
    }
    if (verifiedFactorId) await markFactorUsed(verifiedFactorId);
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
  // Fire-and-forget security alert to the super admin (partner-side accounts only).
  void notifyLogin(user, ip, typeof ua === "string" ? ua : null);

  res.cookie(SESSION_COOKIE, token, cookieOptions());
  res.json({ user: publicUser(user) });
});

// ── Login-time second-factor challenge ─────────────────────────────────────────────
// Factor ENROLMENT + management lives in routes/mfa.ts (authenticated, self-service). This endpoint
// is the login-time challenge issuer: it needs the password (so nothing is revealed to an
// unauthenticated caller) and then either sends an OTP or returns WebAuthn options for the chosen
// method, ready for the client to complete on /auth/login.

/** POST /auth/mfa/challenge { email, password, method }, issue an OTP or passkey challenge at login. */
router.post("/auth/mfa/challenge", async (req, res) => {
  const email = String(req.body?.email ?? "").toLowerCase().trim();
  const password = String(req.body?.password ?? "");
  const method = String(req.body?.method ?? "").trim();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  // Same generic failure as login for a bad password / unknown email: reveal nothing.
  if (!user || user.status === "suspended" || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }
  if (!user.mfaEnabled) { res.json({ mfaRequired: false }); return; }

  if (method === "email_otp" || method === "email_recovery") {
    const factor = (await verifiedFactors(user.id)).find((f) => f.type === method);
    const to = factor?.email || user.email;
    if (await otpSendRateLimited(user.id, method)) { res.status(429).json({ error: "Too many codes requested. Please wait a few minutes." }); return; }
    const code = await createOtpChallenge(user.id, method, to);
    await sendEmailOtp(to, code, method === "email_recovery" ? "recovery" : "sign in");
    res.json({ sent: true, sentTo: maskEmail(to) });
    return;
  }
  if (method === "sms_otp") {
    if (!smsEnabled()) { res.status(400).json({ error: "SMS is not available." }); return; }
    const factor = (await verifiedFactors(user.id)).find((f) => f.type === "sms_otp");
    if (!factor?.phone) { res.status(400).json({ error: "No phone is enrolled." }); return; }
    if (await otpSendRateLimited(user.id, "sms_otp")) { res.status(429).json({ error: "Too many codes requested. Please wait a few minutes." }); return; }
    const code = await createOtpChallenge(user.id, "sms_otp", factor.phone);
    await sendSmsOtp(factor.phone, code);
    res.json({ sent: true, sentTo: maskPhone(factor.phone) });
    return;
  }
  if (method === "passkey") {
    const creds = (await verifiedFactors(user.id)).filter((f) => f.type === "passkey").map((f) => f.credential as unknown as StoredCredential);
    if (!creds.length) { res.status(400).json({ error: "No passkey is enrolled." }); return; }
    const { rpID } = rpFromRequest(req.headers.host, req.protocol);
    const options = await authenticationOptions({ rpID, credentials: creds });
    await storeWebauthnChallenge(user.id, "webauthn_auth", options.challenge);
    res.json({ options });
    return;
  }
  res.status(400).json({ error: "Unknown method." });
});

/**
 * Legacy backup-code fallback for a pre-migration TOTP user whose codes have not yet been backfilled
 * into mfa_backup_codes. Consumes one from the inline users.mfa_backup_codes array. Fire-and-forget
 * update; returns whether the code matched. Purely additive - it never blocks the new path.
 */
function consumeLegacyBackup(user: typeof usersTable.$inferSelect, code: string): boolean {
  const hash = sha256(normalizeBackupCode(code));
  const remaining = user.mfaBackupCodes ?? [];
  if (!remaining.includes(hash)) return false;
  void db.update(usersTable).set({ mfaBackupCodes: remaining.filter((c) => c !== hash) }).where(eq(usersTable.id, user.id));
  return true;
}

/**
 * Verify a passkey assertion at login against the stored webauthn_auth challenge + the matching
 * credential. Returns the factor id on success (so lastUsedAt can be stamped), else null.
 */
async function verifyPasskeyAssertion(userId: string, assertion: unknown, req: { headers: { host?: string }; protocol?: string }): Promise<string | null> {
  const challenge = await takeWebauthnChallenge(userId, "webauthn_auth");
  if (!challenge) return null;
  const assertionId = (assertion as { id?: string })?.id;
  const factors = (await verifiedFactors(userId)).filter((f) => f.type === "passkey");
  const factor = factors.find((f) => (f.credential as unknown as StoredCredential)?.credentialID === assertionId);
  if (!factor) return null;
  const { rpID, origin } = rpFromRequest(req.headers.host, req.protocol);
  try {
    const result = await verifyAssertion({
      response: assertion as never,
      expectedChallenge: challenge,
      rpID,
      origin,
      credential: factor.credential as unknown as StoredCredential,
    });
    if (!result) return null;
    // Persist the new signature counter (replay defence) and the last-used stamp.
    const cred = { ...(factor.credential as unknown as StoredCredential), counter: result.newCounter };
    await db.update(mfaFactorsTable).set({ credential: cred as unknown as Record<string, unknown>, lastUsedAt: new Date() }).where(eq(mfaFactorsTable.id, factor.id));
    return factor.id;
  } catch {
    return null;
  }
}

/**
 * POST /auth/demo-login  { role: "student" | "admin" }
 *
 * One-click, password-free sign-in for sales/demo use on the Enza site. DELIBERATELY
 * NARROW: it can only ever produce a session for one of two fixed demo identities, chosen
 * by an allow-listed keyword, never an arbitrary user id or email from the request. So it
 * cannot be turned into "log me in as anyone".
 *
 *   student -> enza@student1.test  (an existing seeded demo learner)
 *   admin   -> demo.admin@enzaglobalmedia.co.za  (a dedicated demo partner_admin, lazily
 *              created against the Enza partner; it holds no secret, its password is random
 *              and unusable, the only way in is this button)
 *
 * Guarded by ENABLE_DEMO_LOGIN: set it to "0" to switch the whole feature off without a
 * code change. Anything else (including unset) leaves it ON, which is what the demo needs.
 */
// Registry of demo tenants, keyed by a stable slug. Each has fixed demo identities. `student` is the
// primary learner; `studentAlt` is an optional second learner persona (e.g. the K-12 accommodations
// learner). `adminRole` is the global role the "admin" button lands in (partner_admin -> partner hub).
// Every tenant here is safe to expose on the allow-listed demo hosts below.
// `personas` (optional) maps a short key -> a fixed learner email, so a tenant can offer several
// named learner personas the landing picks by key (e.g. K-12's six students across grades).
type DemoTenant = { slug: string; student: string; studentAlt?: string; admin: string; adminRole: "partner_admin" | "org_admin"; personas?: Record<string, string> };
const DEMO_TENANTS: Record<string, DemoTenant> = {
  "enza-global": { slug: "enza-global", student: "enza@student1.test", admin: "demo.admin@enzaglobalmedia.co.za", adminRole: "partner_admin" },
  "synops-demo": { slug: "synops-demo", student: "demo.learner@synops-demo.test", admin: "demo.admin@synops-demo.test", adminRole: "partner_admin" },
  // Justice-sector demo: the public /demos/pej link enters the full PEJ course as this enrolled learner.
  "executive-learning": { slug: "executive-learning", student: "demo.learner@exec-learning.test", admin: "demo.admin@exec-learning.test", adminRole: "partner_admin" },
  // Zambian clinician leadership demo: the public /demos/mrb link enters the full "Leading with Purpose" course.
  "zambian-leadership": { slug: "zambian-leadership", student: "demo.learner@zcl.test", admin: "demo.admin@zcl.test", adminRole: "partner_admin" },
  // Educator PD demo: the public /demos/educator link enters the "Thoughtful AI in teaching" practice class.
  "educator-pd": { slug: "educator-pd", student: "demo.educator@edupd.test", admin: "demo.admin@edupd.test", adminRole: "partner_admin" },
  // PEJ Justice Practice demo: the public /demos/pej-practice link enters the justice-sector practice class.
  "pej-practice": { slug: "pej-practice", student: "demo.learner@pej-practice.test", admin: "demo.admin@pej-practice.test", adminRole: "partner_admin" },
  "synops-k12": {
    slug: "synops-k12", student: "maya.k12@synops-demo.test", studentAlt: "leo.k12@synops-demo.test",
    admin: "teacher.k12@synops-demo.test", adminRole: "partner_admin",
    personas: {
      mateo: "mateo.k12@synops-demo.test", sofia: "sofia.k12@synops-demo.test", aiden: "aiden.k12@synops-demo.test",
      maya: "maya.k12@synops-demo.test", leo: "leo.k12@synops-demo.test", jordan: "jordan.k12@synops-demo.test",
      emma: "emma.k12@synops-demo.test",
    },
  },
};
// Which tenant a demo host defaults to when the request doesn't name one. Multiple demos can share a
// host (e.g. praxis.../demo and praxis.../k12) by passing `tenant` in the body; this is the fallback.
const HOST_DEFAULT_TENANT: Record<string, string> = {
  "enza.synops-consulting.com": "enza-global",
  "demo.synops-consulting.com": "synops-demo",
  "praxis.synops-consulting.com": "synops-demo",
};
// Safe-by-default host allowlist: with DEMO_LOGIN_HOSTS unset, the one-click demo only works on the
// known demo hosts above and is invisible (404) on every other host. Override with DEMO_LOGIN_HOSTS.
const DEFAULT_DEMO_HOSTS = Object.keys(HOST_DEFAULT_TENANT);

router.post("/auth/demo-login", async (req, res) => {
  if (process.env.ENABLE_DEMO_LOGIN === "0") {
    res.status(404).json({ error: "Not found." });
    return;
  }
  // Defence in depth: the one-click demo only works on an allow-listed host (defaulting to the Enza
  // demo site) and is invisible everywhere else, so it can never be used to enter another tenant.
  // Off entirely with ENABLE_DEMO_LOGIN=0.
  const configured = (process.env.DEMO_LOGIN_HOSTS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const allowHosts = configured.length ? configured : DEFAULT_DEMO_HOSTS;
  const host = String(req.headers.host || "").toLowerCase().split(":")[0];
  if (!allowHosts.includes(host)) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  // Which demo tenant to enter: the request may name one (must be allow-listed in DEMO_TENANTS),
  // otherwise the host's default. This lets several demos share one host at different paths.
  const requested = String(req.body?.tenant ?? "").trim();
  const tenantKey = (requested && DEMO_TENANTS[requested]) ? requested : (HOST_DEFAULT_TENANT[host] ?? "synops-demo");
  const tenant = DEMO_TENANTS[tenantKey] ?? DEMO_TENANTS["synops-demo"];
  const role = String(req.body?.role ?? "").toLowerCase().trim();
  if (role !== "student" && role !== "student_alt" && role !== "admin") {
    res.status(400).json({ error: "Unknown demo role." });
    return;
  }

  const ip = clientIp(req as any);
  const ua = req.headers["user-agent"];

  let user: typeof usersTable.$inferSelect | undefined;

  if (role === "student" || role === "student_alt") {
    // A named persona (body.persona) selects a specific learner from the tenant's persona map; else
    // student_alt picks the second learner, and plain student picks the primary one.
    const personaKey = String(req.body?.persona ?? "").trim().toLowerCase();
    const personaEmail = personaKey && tenant.personas ? tenant.personas[personaKey] : undefined;
    const targetEmail = personaEmail ?? (role === "student_alt" ? (tenant.studentAlt ?? tenant.student) : tenant.student);
    [user] = await db.select().from(usersTable).where(eq(usersTable.email, targetEmail)).limit(1);
    if (!user) {
      // Fall back to a real active learner inside this demo tenant, so the button works even if the
      // dedicated demo learner was never seeded. Still narrow: only ever an ACTIVE learner belonging
      // to the demo partner, never an arbitrary account from the request.
      const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.slug, tenant.slug)).limit(1);
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
        res.status(503).json({ error: "The demo learner is not provisioned yet. Seed the demo tenant first." });
        return;
      }
    }
  } else {
    // admin: find-or-create a dedicated demo admin on this demo tenant's partner.
    [user] = await db.select().from(usersTable).where(eq(usersTable.email, tenant.admin)).limit(1);
    if (!user) {
      const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.slug, tenant.slug)).limit(1);
      if (!partner) {
        res.status(503).json({ error: "The demo partner is not provisioned yet. Seed the demo tenant first." });
        return;
      }
      [user] = await db
        .insert(usersTable)
        .values({
          email: tenant.admin,
          firstName: "Demo",
          lastName: "Admin",
          role: tenant.adminRole,
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

  // The guided practice demos (educator PD, PEJ Justice) always start from the very beginning: wipe the
  // entry learner's portfolio on every sign-in (so it opens at 0%), and personalise to the entered name.
  const visitorName = String(req.body?.name ?? "").trim().slice(0, 60).replace(/[^\p{L}\p{M} .'-]/gu, "").trim();
  if ((tenantKey === "educator-pd" || tenantKey === "pej-practice") && role === "student" && user.email === tenant.student) {
    await resetCandidatePractice(user.id);
    if (visitorName) {
      const first = visitorName.split(/\s+/)[0];
      await db.update(usersTable).set({ firstName: first, lastName: "" }).where(eq(usersTable.id, user.id));
      user = { ...user, firstName: first, lastName: "" } as typeof user;
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
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  await db
    .insert(loginEventsTable)
    .values({ userId: user.id, email: user.email, outcome: "success", ipAddress: ip, userAgent: typeof ua === "string" ? ua : null })
    .catch(() => {});

  // Record the demo access and email a notification (best-effort). Returns an id the client pings so we
  // can also capture how long they stayed.
  const demoSessionId = await startDemoSession({ tenantKey, name: visitorName || null, ip, ua: typeof ua === "string" ? ua : null });

  res.cookie(SESSION_COOKIE, token, cookieOptions());
  res.json({ user: publicUser(user), demoSessionId });
});

// PUBLIC: demo tracking heartbeat + end (called by the demo pages to measure time spent). Host-locked.
router.post("/auth/demo-track", async (req, res) => {
  const configured = (process.env.DEMO_LOGIN_HOSTS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const allowHosts = configured.length ? configured : DEFAULT_DEMO_HOSTS;
  const host = String(req.headers.host || "").toLowerCase().split(":")[0];
  if (!allowHosts.includes(host)) { res.status(404).json({ error: "Not found." }); return; }
  const id = String(req.body?.id ?? "").trim();
  const action = String(req.body?.action ?? "ping");
  if (!id) { res.json({ ok: false }); return; }
  if (action === "end") { await endDemoSession(id); } else { await pingDemoSession(id); }
  res.json({ ok: true });
});

/**
 * GET /auth/demo-course?tenant=executive-learning
 *
 * Public, host-locked (same allow-list as demo-login): returns the newest published course owned by
 * the named demo tenant's partner. A public demo landing calls this to deep-link a visitor straight
 * into the FULL course after the one-click demo sign-in, rather than dropping them at the dashboard.
 */
router.get("/auth/demo-course", async (req, res) => {
  if (process.env.ENABLE_DEMO_LOGIN === "0") { res.status(404).json({ error: "Not found." }); return; }
  const configured = (process.env.DEMO_LOGIN_HOSTS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const allowHosts = configured.length ? configured : DEFAULT_DEMO_HOSTS;
  const host = String(req.headers.host || "").toLowerCase().split(":")[0];
  if (!allowHosts.includes(host)) { res.status(404).json({ error: "Not found." }); return; }

  const requested = String(req.query?.tenant ?? "").trim();
  const tenantKey = (requested && DEMO_TENANTS[requested]) ? requested : (HOST_DEFAULT_TENANT[host] ?? "synops-demo");
  const tenant = DEMO_TENANTS[tenantKey] ?? DEMO_TENANTS["synops-demo"];

  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.slug, tenant.slug)).limit(1);
  if (!partner) { res.status(404).json({ error: "Demo tenant is not provisioned yet." }); return; }
  const [course] = await db
    .select()
    .from(coursesTable)
    .where(and(eq(coursesTable.tenantId, partner.id), eq(coursesTable.status, "published")))
    .orderBy(desc(coursesTable.createdAt))
    .limit(1);
  if (!course) { res.status(404).json({ error: "No published course for this demo tenant yet." }); return; }
  // Also return the first published module so the demo can drop the visitor straight into the module
  // experience (readings, video, activities, case, discussion) rather than the course-home page.
  const [firstModule] = await db
    .select({ id: modulesTable.id })
    .from(modulesTable)
    .where(and(eq(modulesTable.courseId, course.id), eq(modulesTable.status, "published")))
    .orderBy(asc(modulesTable.order))
    .limit(1);
  res.json({ courseId: course.id, moduleId: firstModule?.id ?? null, title: course.title });
});

/** POST /auth/logout, revokes THIS session only. */
router.post("/auth/logout", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    // Before revoking, email the super admin a session summary (duration + activity) for partner-side
    // accounts. Best-effort; must not block logout. Look up the user via the session token.
    try {
      const [session] = await db.select({ userId: authSessionsTable.userId }).from(authSessionsTable).where(eq(authSessionsTable.token, token)).limit(1);
      if (session) {
        const [u] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId)).limit(1);
        if (u) void notifyLogout(u, token);
      }
    } catch { /* best-effort */ }
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
 * DISABLES the query when partnerId is null/undefined, so the Overview hung on an infinite
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

/** POST /auth/change-password, for a signed-in user. */
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
    .set({ passwordHash: hashPassword(next), mustChangePassword: false })
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

/**
 * POST /auth/force-set-password — used only by the forced first-login gate. The caller is already
 * authenticated (they signed in with the temporary password), so no current password is required; but
 * it ONLY works while must_change_password is set, so it can't be used as a normal password change.
 * Clears the flag and rotates other sessions.
 */
router.post("/auth/force-set-password", requireAuth, async (req, res) => {
  if (req.impersonatorId) { res.status(403).json({ error: "You cannot change a password while impersonating." }); return; }
  if (!(req.dbUser as { mustChangePassword?: boolean }).mustChangePassword) {
    res.status(400).json({ error: "No password change is required." });
    return;
  }
  const next = String(req.body?.newPassword ?? "");
  const problem = passwordProblem(next);
  if (problem) { res.status(400).json({ error: problem }); return; }
  await db.update(usersTable).set({ passwordHash: hashPassword(next), mustChangePassword: false }).where(eq(usersTable.id, req.userId!));
  // Rotate: revoke every other session, keep this one.
  const keep = req.cookies?.[SESSION_COOKIE];
  await db.update(authSessionsTable).set({ revokedAt: new Date() })
    .where(and(eq(authSessionsTable.userId, req.userId!), isNull(authSessionsTable.revokedAt), keep ? ne(authSessionsTable.token, keep) : sql`true`));
  res.json({ ok: true });
});

export default router;
