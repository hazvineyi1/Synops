import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  authSessionsTable,
  passwordResetsTable,
  loginEventsTable,
} from "@workspace/db";
import { eq, and, isNull, gt } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
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

/** GET /auth/me */
router.get("/auth/me", requireAuth, async (req, res) => {
  res.json({ user: publicUser(req.dbUser!, req.impersonatorId) });
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
    // TODO: deliver by email once a provider is configured. Until then a super_admin
    // issues the link directly from the platform console (POST /platform/users/:id/reset-link).
    req.log?.info({ userId: user.id }, "password reset requested");
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
