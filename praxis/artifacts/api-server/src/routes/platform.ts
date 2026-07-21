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
  courseGroupMembersTable,
  billingSubscriptionsTable,
  billingInvoicesTable,
  fundingAgreementsTable,
  platformFilingsTable,
  partnerDocumentsTable,
  coursesTable,
} from "@workspace/db";
import { eq, and, isNull, desc, sql, or, ilike, gte, type SQL } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/requireAuth";
import { logAudit as audit } from "../lib/audit";
import { sendSetPasswordEmail, emailEnabled } from "../lib/email";
import { seedEnza } from "../lib/enzaSeed";
import { seedEnzaCohort, resyncEnzaProgress } from "../lib/enzaCohortSeed";
import { seedEnzaHub } from "../lib/enzaHubSeed";
import { seedSkillsCatalog } from "../lib/skillsCatalogSeed";
import { enrichEnzaCourses } from "../lib/enzaEnrich";
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

/**
 * Absolute base URL for the set-password / reset links we hand to admins. Uses APP_URL when set,
 * otherwise the current request's host -- so links are always clickable even if APP_URL is not
 * configured (this was returning a relative `/reset-password?...` that could not be opened).
 * `app.set("trust proxy", 1)` makes req.protocol honour Railway's x-forwarded-proto.
 */
function appBase(req: { protocol: string; get: (h: string) => string | undefined }): string {
  const configured = process.env.APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

const CREATABLE_ROLES = ["super_admin", "partner_admin", "org_admin", "coach", "learner", "instructional_designer", "funder"];

// The audit helper now lives in ../lib/audit (imported above as `audit`) so every route
// file can write to the same tamper-evident trail, not just the platform console.

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
 * POST /platform/users — create a new user with any role and return a one-time set-password link.
 * The account starts as "invited" with no password; the returned link lets them set one (or an admin
 * hands it over). This is the missing "add a user" path: users used to only be creatable against an
 * organisation (org member add), so there was no way to mint a platform admin from the console.
 */
router.post("/platform/users", requireAuth, requireSuperAdmin, async (req, res) => {
  const email = String(req.body?.email ?? "").toLowerCase().trim();
  const firstName = (req.body?.firstName ?? "").trim() || null;
  const lastName = (req.body?.lastName ?? "").trim() || null;
  const role = String(req.body?.role ?? "");
  const partnerId = req.body?.partnerId ? String(req.body.partnerId) : null;
  const organisationId = req.body?.organisationId ? String(req.body.organisationId) : null;

  if (!email || !email.includes("@")) { res.status(400).json({ error: "A valid email is required." }); return; }
  if (!CREATABLE_ROLES.includes(role)) { res.status(400).json({ error: "A valid role is required." }); return; }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length) { res.status(409).json({ error: "A user with that email already exists. Edit them from the list instead." }); return; }

  const [created] = await db.insert(usersTable).values({
    email, firstName, lastName, role: role as any, status: "invited", partnerId, organisationId,
  }).returning();

  // Mint the one-time set-password link immediately, so onboarding is a single step.
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await db.insert(passwordResetsTable).values({
    userId: created.id, tokenHash: sha256(token), issuedBy: "admin", issuedByUserId: req.userId!, expiresAt,
  });
  await audit(req, "user.create", "user", created.id, { email, role });

  const link = `${appBase(req)}/reset-password?token=${token}`;
  const emailed = emailEnabled() ? (await sendSetPasswordEmail(email, firstName, link, "invite")).ok : false;

  res.status(201).json({ id: created.id, email, role, status: "invited", link, expiresAt, emailed });
});

/**
 * DELETE /platform/users/:id — hard-delete a user and their access rows in one transaction.
 * Removes login ability and the PII in the auth trail (sessions, resets, login events) plus their
 * enrolments and section memberships, so dashboards do not dangle. Content they authored (courses,
 * cases) is intentionally left. You cannot delete your own account.
 */
router.delete("/platform/users/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  if (id === req.userId) { res.status(400).json({ error: "You cannot delete your own account." }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  await db.transaction(async (tx) => {
    await tx.delete(authSessionsTable).where(eq(authSessionsTable.userId, id));
    await tx.delete(passwordResetsTable).where(eq(passwordResetsTable.userId, id));
    await tx.delete(loginEventsTable).where(eq(loginEventsTable.userId, id));
    await tx.delete(enrolmentsTable).where(eq(enrolmentsTable.userId, id));
    await tx.delete(courseGroupMembersTable).where(eq(courseGroupMembersTable.userId, id));
    await tx.delete(usersTable).where(eq(usersTable.id, id));
  });
  await audit(req, "user.delete", "user", id, { email: user.email });
  res.status(204).send();
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

  const link = `${appBase(req)}/reset-password?token=${token}`;
  const emailed = emailEnabled() ? (await sendSetPasswordEmail(user.email, [user.firstName, user.lastName].filter(Boolean).join(" ") || null, link, "reset")).ok : false;
  res.json({ link, expiresAt, email: user.email, emailed });
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
  const q = req.query as Record<string, string | undefined>;
  const limit = Math.min(Number(q.limit ?? 100), 1000);
  const conds: SQL[] = [];
  if (q.action) conds.push(eq(auditEventsTable.action, q.action));
  if (q.resourceType) conds.push(eq(auditEventsTable.resourceType, q.resourceType));
  if (q.actorId) conds.push(eq(auditEventsTable.actorId, q.actorId));
  if (q.since) conds.push(gte(auditEventsTable.createdAt, new Date(Date.now() - Number(q.since) * 86400000)));

  const rows = await db
    .select()
    .from(auditEventsTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditEventsTable.createdAt))
    .limit(limit);

  if (q.format === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["When", "Action", "Resource type", "Resource id", "Actor id", "Actor role", "Metadata"];
    const csv = [
      header.map(esc).join(","),
      ...rows.map((r) =>
        [r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt, r.action, r.resourceType, r.resourceId, r.actorId, r.actorRole, r.metadata]
          .map(esc)
          .join(","),
      ),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="audit-log.csv"');
    res.send(csv);
    return;
  }
  res.json(rows);
});

// GET /platform/audit/actions — the distinct action + resourceType values, for filter UIs.
router.get("/platform/audit/actions", requireAuth, requireSuperAdmin, async (_req, res) => {
  const rows = await db
    .selectDistinct({ action: auditEventsTable.action, resourceType: auditEventsTable.resourceType })
    .from(auditEventsTable);
  res.json({
    actions: [...new Set(rows.map((r) => r.action))].sort(),
    resourceTypes: [...new Set(rows.map((r) => r.resourceType))].sort(),
  });
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

/**
 * GET /platform/financials — platform-wide financial roll-up aggregated from the REAL per-partner
 * billing + funding data (billing_subscriptions, billing_invoices, funding_agreements). Returns a
 * per-partner breakdown and platform totals. Missing tables (pre-first-write) are treated as empty.
 */
router.get("/platform/financials", requireAuth, requireSuperAdmin, async (_req, res) => {
  const VAT = 0.15;
  const partners = await db.select().from(partnersTable);
  let subs: any[] = [], invs: any[] = [], funds: any[] = [];
  try { subs = await db.select().from(billingSubscriptionsTable); } catch { /* table not created */ }
  try { invs = await db.select().from(billingInvoicesTable); } catch { /* table not created */ }
  try { funds = await db.select().from(fundingAgreementsTable); } catch { /* table not created */ }

  // Pre-index each dataset by partner in a SINGLE pass, instead of filtering the whole arrays once
  // per partner (that was O(partners x rows) and fanned out with both tenant count and history).
  const mrrNetBy = new Map<string, number>();
  const outstandingNetBy = new Map<string, number>();
  const paidNetBy = new Map<string, number>();
  const funderValueBy = new Map<string, number>();
  const overdueBy = new Map<string, boolean>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const s of subs) add(mrrNetBy, s.partnerId, (s.pricePerSeat || 0) * (s.seats || 0));
  for (const i of invs) {
    if (i.status === "paid") add(paidNetBy, i.partnerId, i.net || 0);
    else add(outstandingNetBy, i.partnerId, i.net || 0);
    if (i.status === "overdue") overdueBy.set(i.partnerId, true);
  }
  for (const f of funds) add(funderValueBy, f.partnerId, f.value || 0);

  const byPartner = partners.map((p) => ({
    id: p.id, name: p.name,
    mrrGross: Math.round((mrrNetBy.get(p.id) ?? 0) * (1 + VAT)),
    outstanding: Math.round((outstandingNetBy.get(p.id) ?? 0) * (1 + VAT)),
    funderValue: funderValueBy.get(p.id) ?? 0,
    vatCollected: Math.round((paidNetBy.get(p.id) ?? 0) * VAT),
    overdue: overdueBy.get(p.id) ?? false,
  }));
  const totals = byPartner.reduce(
    (t, p) => ({ mrrGross: t.mrrGross + p.mrrGross, outstanding: t.outstanding + p.outstanding, funderValue: t.funderValue + p.funderValue, vatCollected: t.vatCollected + p.vatCollected, overdue: t.overdue || p.overdue }),
    { mrrGross: 0, outstanding: 0, funderValue: 0, vatCollected: 0, overdue: false },
  );
  res.json({ partners: byPartner, totals });
});

/**
 * GET /platform/alerts — real, platform-wide "attention needed" signals derived from live data:
 * funding agreements expiring/expired, unpaid invoices, action-required documents, partners still
 * onboarding, and courses still in draft. Plus a small real health block (learners, active
 * enrolments). Missing tables (pre-first-write) count as zero.
 */
router.get("/platform/alerts", requireAuth, requireSuperAdmin, async (_req, res) => {
  const now = Date.now();
  const soon = now + 60 * 24 * 60 * 60 * 1000; // 60 days
  const safeCount = async (fn: () => Promise<number>) => { try { return await fn(); } catch { return 0; } };

  const expiringFunding = await safeCount(async () => {
    const rows = await db.select({ expiry: fundingAgreementsTable.expiry, status: fundingAgreementsTable.status }).from(fundingAgreementsTable);
    return rows.filter((r) => {
      if (r.status === "expired") return true;
      if (!r.expiry) return false;
      const t = Date.parse(r.expiry);
      return Number.isFinite(t) && t <= soon;
    }).length;
  });
  // Count in SQL (WHERE ... ) instead of pulling whole tables into Node and filtering — these grow
  // linearly with platform size; the users/enrolments scans especially would hurt at scale.
  const sqlCount = async (q: Promise<Array<{ c: number }>>) => { const [r] = await q; return Number(r?.c ?? 0); };
  const unpaidInvoices = await safeCount(() => sqlCount(
    db.select({ c: sql<number>`count(*)` }).from(billingInvoicesTable).where(sql`${billingInvoicesTable.status} <> 'paid'`)));
  const actionDocs = await safeCount(() => sqlCount(
    db.select({ c: sql<number>`count(*)` }).from(partnerDocumentsTable).where(eq(partnerDocumentsTable.status, "action-required"))));
  const onboardingPartners = await safeCount(() => sqlCount(
    db.select({ c: sql<number>`count(*)` }).from(partnersTable).where(eq(partnersTable.status, "onboarding"))));
  const draftCourses = await safeCount(() => sqlCount(
    db.select({ c: sql<number>`count(*)` }).from(coursesTable).where(eq(coursesTable.status, "draft"))));
  const learners = await safeCount(() => sqlCount(
    db.select({ c: sql<number>`count(*)` }).from(usersTable).where(eq(usersTable.role, "learner"))));
  const activeEnrolments = await safeCount(() => sqlCount(
    db.select({ c: sql<number>`count(*)` }).from(enrolmentsTable).where(eq(enrolmentsTable.status, "active"))));

  const alerts = [
    { id: "funding", label: "funding agreements expiring", count: expiringFunding, severity: expiringFunding ? "warn" : "ok", detail: "Within 60 days or already expired" },
    { id: "invoices", label: "unpaid invoices", count: unpaidInvoices, severity: unpaidInvoices ? "warn" : "ok", detail: "Awaiting payment across partners" },
    { id: "documents", label: "documents need action", count: actionDocs, severity: actionDocs ? "warn" : "ok", detail: "Filing entries flagged action-required" },
    { id: "onboarding", label: "partners onboarding", count: onboardingPartners, severity: onboardingPartners ? "info" : "ok", detail: "Not yet marked active" },
    { id: "drafts", label: "courses in draft", count: draftCourses, severity: draftCourses ? "info" : "ok", detail: "Not yet published to partners" },
  ];
  const engagementRate = learners > 0 ? Math.min(100, Math.round((activeEnrolments / learners) * 100)) : 0;
  res.json({ alerts, health: { learners, activeEnrolments, engagementRate } });
});

/**
 * GET /platform/users/:id/login-activity — a user's recent login events (super admin). Real sign-in
 * trail (successes + failures + impersonations) from login_events, newest first.
 */
router.get("/platform/users/:id/login-activity", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(loginEventsTable)
      .where(eq(loginEventsTable.userId, req.params.id))
      .orderBy(desc(loginEventsTable.createdAt))
      .limit(10);
    res.json(rows.map((r) => ({
      at: r.createdAt.toISOString(),
      outcome: r.outcome,
      ip: r.ipAddress ?? "-",
      device: r.userAgent ?? "-",
      impersonated: !!r.impersonatorId,
    })));
  } catch {
    res.json([]);
  }
});

// ── Platform contract / MOU filing cabinet (super admin) ─────────────────────
async function ensureFilingsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS platform_filings (
      id text PRIMARY KEY,
      title text NOT NULL,
      doc_type text NOT NULL DEFAULT 'MOU',
      partner text DEFAULT 'Platform',
      counterparty text,
      status text NOT NULL DEFAULT 'active',
      signed text,
      expires text,
      size text,
      file_url text,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
}

router.get("/platform/filings", requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    const rows = await db.select().from(platformFilingsTable).orderBy(desc(platformFilingsTable.createdAt));
    res.json(rows);
  } catch {
    res.json([]);
  }
});

router.post("/platform/filings", requireAuth, requireSuperAdmin, async (req, res) => {
  const b = req.body ?? {};
  if (!b.title || !String(b.title).trim()) { res.status(400).json({ error: "A title is required." }); return; }
  await ensureFilingsTable();
  const [row] = await db.insert(platformFilingsTable).values({
    title: String(b.title).trim(),
    docType: b.docType ? String(b.docType) : "MOU",
    partner: b.partner ? String(b.partner) : "Platform",
    counterparty: b.counterparty ? String(b.counterparty) : null,
    status: b.status ? String(b.status) : "active",
    signed: b.signed ? String(b.signed) : null,
    expires: b.expires ? String(b.expires) : null,
    size: b.size ? String(b.size) : null,
    createdBy: req.userId,
  }).returning();
  await audit(req, "filing.create", "platform_filing", row.id, { title: row.title, docType: row.docType });
  res.status(201).json(row);
});

router.patch("/platform/filings/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  const b = req.body ?? {};
  const patch: Record<string, unknown> = {};
  for (const k of ["title", "docType", "partner", "counterparty", "status", "signed", "expires"] as const) {
    if (b[k] !== undefined) patch[k] = b[k] ? String(b[k]) : null;
  }
  const [row] = await db.update(platformFilingsTable).set(patch).where(eq(platformFilingsTable.id, req.params.id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/platform/filings/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  await db.delete(platformFilingsTable).where(eq(platformFilingsTable.id, req.params.id));
  await audit(req, "filing.delete", "platform_filing", req.params.id);
  res.status(204).send();
});

/**
 * POST /platform/seed-enza - one-click provisioning of the real partner Enza Global Media: partner,
 * brand theme, organisation, faculty author, and a catalogue of 15 professional SMME courses (each
 * with modules, objectives, a case study, a reading, an interactive, a discussion and an assignment),
 * all assigned to the Enza partner. Idempotent - safe to click more than once.
 */
router.post("/platform/seed-enza", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const result = await seedEnza();
    await audit(req, "platform.seed_enza", "partner", result.partnerId ?? "enza", { created: result.created, courses: result.courses });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Seed failed";
    res.status(500).json({ error: message });
  }
});

/**
 * POST /partners/:partnerId/members - a Partner (or super admin) provisions an account in one of its
 * organisations: a coach, an org admin, or a learner. Creates the user as "invited" and returns a
 * one-time set-password link (also emailed if mail is configured) so the Partner can hand it over or
 * share it. Delegated admins keep their own endpoint (/partners/:id/delegated-admins).
 */
const PARTNER_ASSIGNABLE_ROLES = ["coach", "org_admin", "learner"];
router.post("/partners/:partnerId/members", requireAuth, async (req, res) => {
  const actor = req.dbUser!;
  const { partnerId } = req.params;
  const isSuper = actor.role === "super_admin";
  const isPartnerAdmin = actor.role === "partner_admin" && actor.partnerId === partnerId;
  if (!isSuper && !isPartnerAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const email = String(req.body?.email ?? "").toLowerCase().trim();
  const role = String(req.body?.role ?? "");
  const organisationId = req.body?.organisationId ? String(req.body.organisationId) : null;
  const firstName = (req.body?.firstName ?? "").trim() || null;
  const lastName = (req.body?.lastName ?? "").trim() || null;

  if (!email || !email.includes("@")) { res.status(400).json({ error: "A valid email is required." }); return; }
  if (!PARTNER_ASSIGNABLE_ROLES.includes(role)) { res.status(400).json({ error: "Role must be coach, org_admin or learner." }); return; }
  if (!organisationId) { res.status(400).json({ error: "Select an organisation for this account." }); return; }

  const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, organisationId) });
  if (!org || org.partnerId !== partnerId) { res.status(400).json({ error: "That organisation does not belong to this partner." }); return; }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length) { res.status(409).json({ error: "A user with that email already exists." }); return; }

  const [created] = await db.insert(usersTable).values({
    email, firstName, lastName, role: role as any, status: "invited", partnerId, organisationId,
  }).returning();

  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await db.insert(passwordResetsTable).values({ userId: created.id, tokenHash: sha256(token), issuedBy: "admin", issuedByUserId: actor.id, expiresAt });
  await audit(req, "partner.member_create", "user", created.id, { email, role, organisationId, partnerId });

  const link = `${appBase(req)}/reset-password?token=${token}`;
  const emailed = emailEnabled() ? (await sendSetPasswordEmail(email, firstName, link, "invite")).ok : false;
  res.status(201).json({ id: created.id, email, role, status: "invited", link, expiresAt, emailed });
});

/**
 * POST /partners/:partnerId/impersonate/:userId - real "View as learner". A Partner admin (scoped to
 * its own accounts) or a super admin becomes the target user for a short-lived session, so they see
 * and navigate the app exactly as that learner does. Mirrors /platform/users/:id/impersonate but is
 * available to partner_admin for users inside their own partner.
 */
router.post("/partners/:partnerId/impersonate/:userId", requireAuth, async (req, res) => {
  const actor = req.dbUser!;
  const { partnerId, userId } = req.params;
  const isSuper = actor.role === "super_admin";
  const isPartnerAdmin = actor.role === "partner_admin" && actor.partnerId === partnerId;
  if (!isSuper && !isPartnerAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  if (userId === req.userId) { res.status(400).json({ error: "You are already yourself." }); return; }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (!isSuper && target.partnerId !== partnerId) { res.status(403).json({ error: "You can only view accounts inside your own partner." }); return; }

  const adminToken = req.cookies?.[SESSION_COOKIE];
  const token = newSessionToken();
  await db.insert(authSessionsTable).values({
    token, userId: target.id, impersonatorId: req.userId!,
    ipAddress: clientIp(req as any), userAgent: (req.headers["user-agent"] as string) ?? null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  await db.insert(loginEventsTable).values({ userId: target.id, email: target.email, outcome: "impersonated", ipAddress: clientIp(req as any), impersonatorId: req.userId! });
  await audit(req, "user.impersonate", "user", target.id, { email: target.email, via: "partner" });

  if (adminToken) res.cookie(IMPERSONATOR_COOKIE, adminToken, cookieOptions(60 * 60 * 1000));
  res.cookie(SESSION_COOKIE, token, cookieOptions(60 * 60 * 1000));
  res.json({ ok: true, impersonating: { id: target.id, email: target.email } });
});

/**
 * POST /platform/seed-enza-cohort - seeds a realistic delivery organisation under the Enza partner:
 * a cohort of four township/rural SMME learners at four distinct levels of understanding, an org
 * admin and a coach, enrolments into Enza's assigned courses, and progress / grades / coaching data.
 * Requires seed-enza to have run first. Idempotent - safe to click more than once.
 */
router.post("/platform/seed-enza-cohort", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const result = await seedEnzaCohort();
    await audit(req, "platform.seed_enza_cohort", "organisation", result.orgId ?? "enza-cohort", { created: result.created, learners: result.learners });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Seed failed";
    res.status(500).json({ error: message });
  }
});

/**
 * POST /platform/resync-enza-progress - re-points the demo learners' progress at the current content
 * (rebuilding courses orphans their beat progress), recomputes off-track state and clears stale
 * notifications. Super admin only.
 */
router.post("/platform/resync-enza-progress", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const r = await resyncEnzaProgress();
    await audit(req, "platform.resync_enza_progress", "partner", "enza", { learners: r.learners, beats: r.beats });
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Resync failed" });
  }
});

/**
 * POST /platform/seed-enza-hub - seed REAL partner-hub records (billing, funding, documents,
 * delegated admins) for the live Enza partner so the Financial/Funders/Documents/Accounts hubs
 * show genuine figures instead of empty. Idempotent. Super admin only.
 */
router.post("/platform/seed-enza-hub", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const r = await seedEnzaHub();
    await audit(req, "platform.seed_enza_hub", "partner", "enza", { seeded: r.seeded });
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Seed failed" });
  }
});

/**
 * POST /platform/seed-skills-catalog - seeds 10 full, high-demand South African vocational courses
 * (digital & data literacy, web/software dev, data analytics, digital marketing, solar PV, skilled
 * trades, BPO/GBS, tourism, financial literacy/SMME, ECD/care economy). Each is platform-owned,
 * NQF-levelled and SETA-mapped, built as a full curriculum, and assigned to the Enza partner. Run
 * enrich-enza afterwards to fully build every module. Idempotent. Super admin only.
 */
router.post("/platform/seed-skills-catalog", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const r = await seedSkillsCatalog();
    await audit(req, "platform.seed_skills_catalog", "partner", "enza", { created: r.created, assigned: r.assigned });
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Seed failed" });
  }
});

/**
 * POST /platform/enrich-enza - builds every Enza module into a full, comprehensive lesson (no greyed
 * tabs): slide-deck lesson + quizzes, a narrated video lesson, two readings, an interactive case-study
 * workshop, a case scenario, a module assignment, a discussion, and a live workshop. Idempotent per
 * module. Super admin only.
 */
router.post("/platform/enrich-enza", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const r = await enrichEnzaCourses();
    await audit(req, "platform.enrich_enza", "partner", "enza", { modules: r.modules, enriched: r.enriched });
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Enrich failed" });
  }
});

export default router;
