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

router.post("/auth/demo-login", async (req, res) => {
  if (process.env.ENABLE_DEMO_LOGIN === "0") {
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
      res.status(503).json({ error: "The demo learner is not provisioned yet. Seed the Enza cohort first." });
      return;
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
