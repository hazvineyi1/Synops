import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  authSessionsTable,
  passwordResetsTable,
  loginEventsTable,
  apiKeysTable,
  auditEventsTable,
  partnersTable,
  organisationsTable,
  enrolmentsTable,
} from "@workspace/db";
import { eq, and, isNull, desc, sql, or, ilike } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/requireAuth";
import {
  newSessionToken,
  sessionExpiry,
  cookieOptions,
  sha256,
  newApiKey,
  clientIp,
  SESSION_COOKIE,
} from "../lib/auth";

const router = Router();

/**
 * Platform console — super_admin only.
 *
 * Everything here is destructive or privileged, so EVERY action writes an audit event.
 * A console that can impersonate any user and reset any password without leaving a
 * trace is a liability, not a feature.
 */

const RESET_TTL_MS = 60 * 60 * 1000;

/** Cookie holding the admin's own session while they impersonate someone else. */
const IMPERSONATOR_COOKIE = "praxis_impersonator";

async function audit(
  req: any,
  action: string,
  resourceType: string,
  resourceId: string | null,
  metadata?: unknown,
) {
  await db
    .insert(auditEventsTable)
    .values({
      action,
      resourceType,
      resourceId,
      actorId: req.userId ?? null,
      actorRole: req.dbUser?.role ?? null,
      partnerId: req.dbUser?.partnerId ?? null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    })
    .catch(() => {
      // Never fail the operation because the audit write failed, but do surface it.
      req.log?.error({ action, resourceType }, "audit write failed");
    });
}

/* ───────────────────────────── Users ───────────────────────────── */

/** GET /platform/users?q= — search every user on the platform. */
router.get("/platform/users", requireAuth, requireSuperAdmin, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const limit = Math.min(Number(req.query.limit ?? 50), 200);

  const where = q
    ? or(
        ilike(usersTable.email, `%${q}%`),
        ilike(usersTable.firstName, `%${q}%`),
        ilike(usersTable.lastName, `%${q}%`),
      )
    : undefined;

  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: usersTable.role,
      status: usersTable.status,
      partnerId: usersTable.partnerId,
      organisationId: usersTable.organisationId,
      lastLoginAt: usersTable.lastLoginAt,
      hasPassword: sql<boolean>`${usersTable.passwordHash} is not null`,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(where)
    .orderBy(desc(usersTable.createdAt))
    .limit(limit);

  res.json(rows);
});

/** GET /platform/users/:id — full detail incl. sessions, logins, enrolments. */
router.get("/platform/users/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [sessions, logins, enrolments] = await Promise.all([
    db
      .select()
      .from(authSessionsTable)
      .where(and(eq(authSessionsTable.userId, id), isNull(authSessionsTable.revokedAt)))
      .orderBy(desc(authSessionsTable.lastSeenAt))
      .limit(20),
    db
      .select()
      .from(loginEventsTable)
      .where(eq(loginEventsTable.userId, id))
      .orderBy(desc(loginEventsTable.createdAt))
      .limit(50),
    db.select().from(enrolmentsTable).where(eq(enrolmentsTable.userId, id)),
  ]);

  const { passwordHash, ...safe } = user;
  res.json({ user: { ...safe, hasPassword: !!passwordHash }, sessions, logins, enrolments });
});

/**
 * POST /platform/users/:id/impersonate
 *
 * Mints a session for the target and stashes the admin's own session token in a
 * separate cookie so "stop impersonating" restores it exactly. The new session records
 * impersonatorId, so every downstream action knows who is really behind it.
 */
router.post("/platform/users/:id/impersonate", requireAuth, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;

  if (id === req.userId) {
    res.status(400).json({ error: "You are already yourself." });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const adminToken = req.cookies?.[SESSION_COOKIE];
  const token = newSessionToken();

  await db.insert(authSessionsTable).values({
    token,
    userId: target.id,
    impersonatorId: req.userId!,
    ipAddress: clientIp(req as any),
    userAgent: (req.headers["user-agent"] as string) ?? null,
    // Impersonation sessions are short-lived on purpose: an admin should not be able
    // to leave one lying around for 30 days.
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  await db.insert(loginEventsTable).values({
    userId: target.id,
    email: target.email,
    outcome: "impersonated",
    ipAddress: clientIp(req as any),
    impersonatorId: req.userId!,
  });

  await audit(req, "user.impersonate", "user", target.id, { email: target.email });

  if (adminToken) {
    res.cookie(IMPERSONATOR_COOKIE, adminToken, cookieOptions(60 * 60 * 1000));
  }
  res.cookie(SESSION_COOKIE, token, cookieOptions(60 * 60 * 1000));
  res.json({ ok: true, impersonating: { id: target.id, email: target.email } });
});

/**
 * POST /platform/stop-impersonating
 * Available to ANY signed-in user: while impersonating, the caller IS the target, not
 * an admin -- so a super_admin gate here would make it impossible to get back.
 */
router.post("/platform/stop-impersonating", requireAuth, async (req, res) => {
  const adminToken = req.cookies?.[IMPERSONATOR_COOKIE];
  if (!adminToken) {
    res.status(400).json({ error: "You are not impersonating anyone." });
    return;
  }

  // Burn the impersonation session so the token can't be reused.
  const current = req.cookies?.[SESSION_COOKIE];
  if (current) {
    await db
      .update(authSessionsTable)
      .set({ revokedAt: new Date() })
      .where(eq(authSessionsTable.token, current));
  }

  res.cookie(SESSION_COOKIE, adminToken, cookieOptions());
  res.clearCookie(IMPERSONATOR_COOKIE, { path: "/", sameSite: "lax" });
  res.json({ ok: true });
});

/**
 * POST /platform/users/:id/reset-link
 * Master password reset: mints a one-time link for an admin to hand to a locked-out
 * user. Works with no email provider configured. The raw token is returned ONCE and
 * never stored (only its hash is).
 */
router.post("/platform/users/:id/reset-link", requireAuth, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  await db.insert(passwordResetsTable).values({
    userId: user.id,
    tokenHash: sha256(token),
    issuedBy: "admin",
    issuedByUserId: req.userId!,
    expiresAt,
  });

  await audit(req, "user.reset_link", "user", user.id, { email: user.email });

  const base = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  res.json({ link: `${base}/reset-password?token=${token}`, expiresAt, email: user.email });
});

/** POST /platform/users/:id/suspend — blocks sign-in AND kills live sessions. */
router.post("/platform/users/:id/suspend", requireAuth, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  if (id === req.userId) {
    res.status(400).json({ error: "You cannot suspend yourself." });
    return;
  }

  await db.update(usersTable).set({ status: "suspended" }).where(eq(usersTable.id, id));

  // Suspending without revoking sessions would leave the user signed in for up to 30
  // days -- the suspension would be cosmetic.
  await db
    .update(authSessionsTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessionsTable.userId, id), isNull(authSessionsTable.revokedAt)));

  await audit(req, "user.suspend", "user", id);
  res.json({ ok: true });
});

/** POST /platform/users/:id/reactivate */
router.post("/platform/users/:id/reactivate", requireAuth, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  await db.update(usersTable).set({ status: "active" }).where(eq(usersTable.id, id));
  await audit(req, "user.reactivate", "user", id);
  res.json({ ok: true });
});

/** POST /platform/users/:id/role */
router.post("/platform/users/:id/role", requireAuth, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const role = String(req.body?.role ?? "");
  const allowed = ["super_admin", "partner_admin", "org_admin", "coach", "learner"];
  if (!allowed.includes(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }
  if (id === req.userId && role !== "super_admin") {
    // Stops an admin locking themselves out of the console they are standing in.
    res.status(400).json({ error: "You cannot demote yourself." });
    return;
  }
  await db.update(usersTable).set({ role: role as any }).where(eq(usersTable.id, id));
  await audit(req, "user.role_change", "user", id, { role });
  res.json({ ok: true });
});

/** POST /platform/users/:id/revoke-sessions — force sign-out everywhere. */
router.post("/platform/users/:id/revoke-sessions", requireAuth, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  await db
    .update(authSessionsTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessionsTable.userId, id), isNull(authSessionsTable.revokedAt)));
  await audit(req, "user.revoke_sessions", "user", id);
  res.json({ ok: true });
});

/* ───────────────────────── Login activity & audit ───────────────────────── */

/** GET /platform/login-activity — platform-wide, including failures. */
router.get("/platform/login-activity", requireAuth, requireSuperAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const rows = await db
    .select({
      id: loginEventsTable.id,
      userId: loginEventsTable.userId,
      email: loginEventsTable.email,
      outcome: loginEventsTable.outcome,
      ipAddress: loginEventsTable.ipAddress,
      userAgent: loginEventsTable.userAgent,
      impersonatorId: loginEventsTable.impersonatorId,
      createdAt: loginEventsTable.createdAt,
    })
    .from(loginEventsTable)
    .orderBy(desc(loginEventsTable.createdAt))
    .limit(limit);
  res.json(rows);
});

/** GET /platform/audit — the trail of every privileged action. */
router.get("/platform/audit", requireAuth, requireSuperAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const rows = await db
    .select()
    .from(auditEventsTable)
    .orderBy(desc(auditEventsTable.createdAt))
    .limit(limit);
  res.json(rows);
});

/* ───────────────────────────── API keys ───────────────────────────── */

/** GET /platform/api-keys */
router.get("/platform/api-keys", requireAuth, requireSuperAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      prefix: apiKeysTable.prefix,
      partnerId: apiKeysTable.partnerId,
      scopes: apiKeysTable.scopes,
      lastUsedAt: apiKeysTable.lastUsedAt,
      expiresAt: apiKeysTable.expiresAt,
      revokedAt: apiKeysTable.revokedAt,
      createdAt: apiKeysTable.createdAt,
    })
    .from(apiKeysTable)
    .orderBy(desc(apiKeysTable.createdAt));
  res.json(rows);
});

/** POST /platform/api-keys — the plaintext key is returned ONCE and never stored. */
router.post("/platform/api-keys", requireAuth, requireSuperAdmin, async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "A name is required." });
    return;
  }
  const { key, prefix, hash } = newApiKey();
  const [row] = await db
    .insert(apiKeysTable)
    .values({
      name,
      keyHash: hash,
      prefix,
      partnerId: req.body?.partnerId ?? null,
      scopes: Array.isArray(req.body?.scopes) ? req.body.scopes : [],
      createdByUserId: req.userId!,
    })
    .returning({ id: apiKeysTable.id });

  await audit(req, "api_key.create", "api_key", row?.id ?? null, { name });

  res.status(201).json({
    id: row?.id,
    name,
    prefix,
    // Shown once. We store only the hash, so this can never be recovered.
    key,
  });
});

/** DELETE /platform/api-keys/:id */
router.delete("/platform/api-keys/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  await db.update(apiKeysTable).set({ revokedAt: new Date() }).where(eq(apiKeysTable.id, id));
  await audit(req, "api_key.revoke", "api_key", id);
  res.json({ ok: true });
});

/* ───────────────────────── Tenancy overview ───────────────────────── */

/** GET /platform/overview — headline numbers for the console home. */
router.get("/platform/overview", requireAuth, requireSuperAdmin, async (_req, res) => {
  const [users] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${usersTable.status} = 'active')::int`,
      suspended: sql<number>`count(*) filter (where ${usersTable.status} = 'suspended')::int`,
      invited: sql<number>`count(*) filter (where ${usersTable.status} = 'invited')::int`,
      noPassword: sql<number>`count(*) filter (where ${usersTable.passwordHash} is null)::int`,
    })
    .from(usersTable);

  const [partners] = await db.select({ total: sql<number>`count(*)::int` }).from(partnersTable);
  const [orgs] = await db.select({ total: sql<number>`count(*)::int` }).from(organisationsTable);
  const [enrolments] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(enrolmentsTable);

  const [logins24h] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(loginEventsTable)
    .where(sql`${loginEventsTable.createdAt} > now() - interval '24 hours'`);

  const [failed24h] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(loginEventsTable)
    .where(
      sql`${loginEventsTable.createdAt} > now() - interval '24 hours' and ${loginEventsTable.outcome} <> 'success'`,
    );

  res.json({
    users,
    partners: partners?.total ?? 0,
    organisations: orgs?.total ?? 0,
    enrolments: enrolments?.total ?? 0,
    logins24h: logins24h?.total ?? 0,
    failedLogins24h: failed24h?.total ?? 0,
  });
});

export default router;
