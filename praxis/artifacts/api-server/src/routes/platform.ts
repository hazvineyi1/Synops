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
  opsAnomaliesTable,
} from "@workspace/db";
import { eq, and, isNull, desc, sql, or, ilike, gte, count, type SQL } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/requireAuth";
import { logAudit as audit } from "../lib/audit";
import { healthSnapshot } from "../lib/healthMetrics";
import { computeEngagementRate } from "../lib/platformHealth";
import { runOpsScan } from "../lib/opsAgent";
import { sendSetPasswordEmail, emailEnabled } from "../lib/email";
import { seedEnza } from "../lib/enzaSeed";
import { seedEnzaCohort, resyncEnzaProgress } from "../lib/enzaCohortSeed";
import { seedSynopsDemo } from "../lib/synopsDemoSeed";
import { seedK12 } from "../lib/k12Seed";
import { seedGameLibrary } from "../lib/gameLibrarySeed";
import { seedEnzaHub } from "../lib/enzaHubSeed";
import { seedSkillsCatalog } from "../lib/skillsCatalogSeed";
import { seedFlagshipCourses } from "../lib/flagshipCoursesSeed";
import { seedExecutiveLearning } from "../lib/executiveLearningSeed";
import { seedZambianLeadership, ZCL_DEMO_LEARNER_EMAIL } from "../lib/mrbSeed";
import { seedEducatorPD, EDU_DEMO_LEARNER_EMAIL } from "../lib/educatorSeed";
import { PRACTICE_DDL } from "./practice";
import { enrichEnzaCourses } from "../lib/enzaEnrich";
import {
  newSessionToken,
  sessionExpiry,
  cookieOptions,
  sha256,
  newApiKey,
  hashPassword,
  clientIp,
  SESSION_COOKIE,
} from "../lib/auth";

const router = Router();

/**
 * Platform console, super_admin only.
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

/** GET /platform/users?q=, search every user on the platform. */
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

/** GET /platform/users/:id, full detail incl. sessions, logins, enrolments. */
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
 * POST /platform/users, create a new user with any role and return a one-time set-password link.
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
 * DELETE /platform/users/:id, hard-delete a user and their access rows in one transaction.
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

/** POST /platform/users/:id/suspend, blocks sign-in AND kills live sessions. */
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

/** POST /platform/users/:id/revoke-sessions, force sign-out everywhere. */
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

/** GET /platform/login-activity, platform-wide, including failures. */
/** GET /platform/health - detailed health snapshot for the admin status dashboard. */
router.get("/platform/health", requireAuth, requireSuperAdmin, async (_req, res) => {
  res.json(await healthSnapshot());
});

// GET /platform/ops/anomalies, the ops-agent feed (active by default; ?status=resolved for history).
router.get("/platform/ops/anomalies", requireAuth, requireSuperAdmin, async (req, res) => {
  const status = req.query.status === "resolved" ? "resolved" : "active";
  try {
    const rows = await db
      .select()
      .from(opsAnomaliesTable)
      .where(eq(opsAnomaliesTable.status, status))
      .orderBy(desc(opsAnomaliesTable.lastSeenAt))
      .limit(100);
    res.json(rows);
  } catch {
    res.json([]);
  }
});

// POST /platform/ops/scan, run a scan on demand (the agent also runs every minute on its own).
router.post("/platform/ops/scan", requireAuth, requireSuperAdmin, async (_req, res) => {
  res.json({ firing: await runOpsScan() });
});

router.get("/platform/login-activity", requireAuth, requireSuperAdmin, async (req, res) => {
  const rawLimit = Number(req.query.limit ?? 100);
  const limit = Math.min(Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 100), 500);
  const rawOffset = Number(req.query.offset ?? 0);
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);
  // Optional filters so a large trail is navigable: by outcome (success/failure)
  // and by a specific user id.
  const conds: SQL[] = [];
  const outcome = String(req.query.outcome ?? "").trim();
  const VALID_OUTCOMES = ["success", "bad_password", "unknown_email", "suspended", "impersonated"] as const;
  if ((VALID_OUTCOMES as readonly string[]).includes(outcome)) {
    conds.push(eq(loginEventsTable.outcome, outcome as (typeof VALID_OUTCOMES)[number]));
  }
  const userId = String(req.query.userId ?? "").trim();
  if (userId) conds.push(eq(loginEventsTable.userId, userId));
  const where = conds.length ? and(...conds) : undefined;

  // Total (respecting filters) so the UI can page without silently truncating.
  const [{ value: total }] = await db.select({ value: count() }).from(loginEventsTable).where(where);
  res.setHeader("X-Total-Count", String(total));

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
    .where(where)
    .orderBy(desc(loginEventsTable.createdAt))
    .limit(limit)
    .offset(offset);
  res.json(rows);
});

/** GET /platform/audit, the trail of every privileged action. */
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

// GET /platform/audit/actions, the distinct action + resourceType values, for filter UIs.
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

/** POST /platform/api-keys, the plaintext key is returned ONCE and never stored. */
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

/** GET /platform/overview, headline numbers for the console home. */
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
 * GET /platform/financials, platform-wide financial roll-up aggregated from the REAL per-partner
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
 * GET /platform/alerts, real, platform-wide "attention needed" signals derived from live data:
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
  // Count in SQL (WHERE ... ) instead of pulling whole tables into Node and filtering, these grow
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
  // Distinct learners who hold at least one active enrolment. A learner can be enrolled in several
  // courses, so activeEnrolments (16) can exceed the learner headcount (7); engagement must be
  // measured on distinct active learners, not raw enrolments, or the rate blows past 100%.
  const activeLearners = await safeCount(() => sqlCount(
    db.select({ c: sql<number>`count(distinct ${enrolmentsTable.userId})` })
      .from(enrolmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, enrolmentsTable.userId))
      .where(and(eq(enrolmentsTable.status, "active"), eq(usersTable.role, "learner")))));

  const alerts = [
    { id: "funding", label: "funding agreements expiring", count: expiringFunding, severity: expiringFunding ? "warn" : "ok", detail: "Within 60 days or already expired" },
    { id: "invoices", label: "unpaid invoices", count: unpaidInvoices, severity: unpaidInvoices ? "warn" : "ok", detail: "Awaiting payment across partners" },
    { id: "documents", label: "documents need action", count: actionDocs, severity: actionDocs ? "warn" : "ok", detail: "Filing entries flagged action-required" },
    { id: "onboarding", label: "partners onboarding", count: onboardingPartners, severity: onboardingPartners ? "info" : "ok", detail: "Not yet marked active" },
    { id: "drafts", label: "courses in draft", count: draftCourses, severity: draftCourses ? "info" : "ok", detail: "Not yet published to partners" },
  ];
  const engagementRate = computeEngagementRate(activeLearners, learners);
  res.json({ alerts, health: { learners, activeLearners, activeEnrolments, engagementRate } });
});

/**
 * GET /platform/users/:id/login-activity, a user's recent login events (super admin). Real sign-in
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

// A readable temporary password an admin can hand to a locked-out learner. 11 chars, passes the
// length-first password policy, and is unique enough per reset. Shown once to the admin.
function tempPassword(): string { return `Praxis-${Math.floor(1000 + Math.random() * 9000)}`; }

/**
 * POST /partners/:partnerId/members/:userId/credentials  { mode: "temp" | "link" }
 * Partner-admin (of this partner) or super admin credential management for a member.
 *  - "temp": set a temporary password and RETURN it, so the admin can hand it over. Works with no
 *            email provider. Also revokes the user's live sessions.
 *  - "link": mint a one-time set-password link, returned to the admin, and emailed if a provider is set.
 */
router.post("/partners/:partnerId/members/:userId/credentials", requireAuth, async (req, res) => {
  const actor = req.dbUser!;
  const { partnerId, userId } = req.params;
  const isSuper = actor.role === "super_admin";
  const isPartnerAdmin = actor.role === "partner_admin" && actor.partnerId === partnerId;
  if (!isSuper && !isPartnerAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (!isSuper && target.partnerId !== partnerId) { res.status(403).json({ error: "You can only manage accounts inside your own partner." }); return; }

  const mode = String(req.body?.mode ?? "temp");
  if (mode === "temp") {
    const password = tempPassword();
    await db.update(usersTable).set({ passwordHash: hashPassword(password), status: target.status === "invited" ? "active" : target.status }).where(eq(usersTable.id, target.id));
    await db.update(authSessionsTable).set({ revokedAt: new Date() }).where(eq(authSessionsTable.userId, target.id));
    await audit(req, "user.set_temp_password", "user", target.id, { email: target.email });
    res.json({ email: target.email, password });
    return;
  }
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await db.insert(passwordResetsTable).values({ userId: target.id, tokenHash: sha256(token), issuedBy: "admin", issuedByUserId: actor.id, expiresAt });
  await audit(req, "user.reset_link", "user", target.id, { email: target.email });
  const link = `${appBase(req)}/reset-password?token=${token}`;
  const emailed = emailEnabled() ? (await sendSetPasswordEmail(target.email, [target.firstName, target.lastName].filter(Boolean).join(" ") || null, link, "reset")).ok : false;
  res.json({ email: target.email, link, expiresAt, emailed });
});

// Defensive: the archived_at / deleted_at soft-lifecycle columns are added to the schema, but if a
// migration lagged behind a deploy we create them idempotently the first time a lifecycle action runs
// (same pattern used for the hub tables). Cheap, runs once, safe to repeat.
let lifecycleColsReady = false;
async function ensureLifecycleColumns() {
  if (lifecycleColsReady) return;
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_at timestamptz`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz`);
  lifecycleColsReady = true;
}

/**
 * POST /partners/:partnerId/members/:userId/lifecycle  { action }
 * Partner-admin (own partner) or super admin account-lifecycle control. Actions:
 *  - suspend / reactivate : block or restore sign-in (status enum). Suspend revokes live sessions.
 *  - archive / restore    : soft-remove from the active roster but keep everything; restore un-hides.
 *  - delete               : SOFT delete (deletedAt set, sessions revoked) - recoverable via restore.
 * A partner admin can never manage another partner_admin or super_admin, nor act outside its partner.
 */
router.post("/partners/:partnerId/members/:userId/lifecycle", requireAuth, async (req, res) => {
  const actor = req.dbUser!;
  const { partnerId, userId } = req.params;
  const isSuper = actor.role === "super_admin";
  const isPartnerAdmin = actor.role === "partner_admin" && actor.partnerId === partnerId;
  if (!isSuper && !isPartnerAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  await ensureLifecycleColumns();
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (!isSuper && target.partnerId !== partnerId) { res.status(403).json({ error: "You can only manage accounts inside your own partner." }); return; }
  if (target.id === actor.id) { res.status(400).json({ error: "You cannot change your own account here." }); return; }
  // A partner admin may not touch peer/senior tiers; only a super admin can.
  if (!isSuper && (target.role === "partner_admin" || target.role === "super_admin")) {
    res.status(403).json({ error: "Only the platform team can manage admin accounts." }); return;
  }

  const action = String(req.body?.action ?? "");
  const revoke = () => db.update(authSessionsTable).set({ revokedAt: new Date() }).where(eq(authSessionsTable.userId, target.id));
  switch (action) {
    case "suspend":
      await db.update(usersTable).set({ status: "suspended" }).where(eq(usersTable.id, target.id));
      await revoke();
      break;
    case "reactivate":
      await db.update(usersTable).set({ status: "active" }).where(eq(usersTable.id, target.id));
      break;
    case "archive":
      await db.execute(sql`UPDATE users SET archived_at = now() WHERE id = ${target.id}`);
      await revoke();
      break;
    case "restore":
      await db.execute(sql`UPDATE users SET archived_at = NULL, deleted_at = NULL WHERE id = ${target.id}`);
      break;
    case "delete":
      await db.execute(sql`UPDATE users SET deleted_at = now() WHERE id = ${target.id}`);
      await revoke();
      break;
    default:
      res.status(400).json({ error: "Unknown action." }); return;
  }
  await audit(req, `user.lifecycle_${action}`, "user", target.id, { email: target.email, partnerId });
  res.json({ id: target.id, action });
});

/**
 * POST /partners/:partnerId/members/:userId/organisation  { organisationId }
 * Move any member (coach / org-admin / learner) to a different organisation, or to none (null).
 */
router.post("/partners/:partnerId/members/:userId/organisation", requireAuth, async (req, res) => {
  const actor = req.dbUser!;
  const { partnerId, userId } = req.params;
  const isSuper = actor.role === "super_admin";
  const isPartnerAdmin = actor.role === "partner_admin" && actor.partnerId === partnerId;
  if (!isSuper && !isPartnerAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!target || (!isSuper && target.partnerId !== partnerId)) { res.status(404).json({ error: "Member not found in this partner." }); return; }
  const organisationId = req.body?.organisationId ? String(req.body.organisationId) : null;
  if (organisationId) {
    const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, organisationId) });
    if (!org || (!isSuper && org.partnerId !== partnerId)) { res.status(400).json({ error: "That organisation does not belong to this partner." }); return; }
  }
  await db.update(usersTable).set({ organisationId }).where(eq(usersTable.id, target.id));
  await audit(req, "partner.member_reassign", "user", target.id, { organisationId, partnerId });
  res.json({ id: target.id, organisationId });
});

/**
 * PARTNER LEARNER POOL. A learner can belong to the PARTNER before being placed into an
 * organisation (organisationId null = unassigned pool), then assigned into one or more orgs.
 * POST creates a pool learner; test=true sets a temp password and returns it; GET lists the whole
 * partner's learners (with org, null = pool); assign sets/clears the learner's organisation.
 */
router.post("/partners/:partnerId/learners", requireAuth, async (req, res) => {
  const actor = req.dbUser!;
  const { partnerId } = req.params;
  const isSuper = actor.role === "super_admin";
  const isPartnerAdmin = actor.role === "partner_admin" && actor.partnerId === partnerId;
  if (!isSuper && !isPartnerAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  const email = String(req.body?.email ?? "").toLowerCase().trim();
  const firstName = (req.body?.firstName ?? "").trim() || null;
  const lastName = (req.body?.lastName ?? "").trim() || null;
  const test = req.body?.test === true;
  if (!email || !email.includes("@")) { res.status(400).json({ error: "A valid email is required." }); return; }
  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length) { res.status(409).json({ error: "A user with that email already exists." }); return; }

  if (test) {
    const password = tempPassword();
    const [created] = await db.insert(usersTable).values({ email, firstName, lastName, role: "learner", status: "active", partnerId, organisationId: null, passwordHash: hashPassword(password) }).returning();
    await audit(req, "partner.learner_pool_create", "user", created.id, { email, test: true });
    res.status(201).json({ id: created.id, email, status: "active", password, test: true });
    return;
  }
  const [created] = await db.insert(usersTable).values({ email, firstName, lastName, role: "learner", status: "invited", partnerId, organisationId: null }).returning();
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await db.insert(passwordResetsTable).values({ userId: created.id, tokenHash: sha256(token), issuedBy: "admin", issuedByUserId: actor.id, expiresAt });
  await audit(req, "partner.learner_pool_create", "user", created.id, { email });
  const link = `${appBase(req)}/reset-password?token=${token}`;
  const emailed = emailEnabled() ? (await sendSetPasswordEmail(email, firstName, link, "invite")).ok : false;
  res.status(201).json({ id: created.id, email, status: "invited", link, expiresAt, emailed });
});

router.get("/partners/:partnerId/learners", requireAuth, async (req, res) => {
  const actor = req.dbUser!;
  const { partnerId } = req.params;
  const isSuper = actor.role === "super_admin";
  const isPartnerAdmin = actor.role === "partner_admin" && actor.partnerId === partnerId;
  if (!isSuper && !isPartnerAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db.select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName, status: usersTable.status, organisationId: usersTable.organisationId })
    .from(usersTable).where(and(eq(usersTable.partnerId, partnerId), eq(usersTable.role, "learner")));
  const orgs = await db.select({ id: organisationsTable.id, name: organisationsTable.name }).from(organisationsTable).where(eq(organisationsTable.partnerId, partnerId));
  const orgName: Record<string, string> = Object.fromEntries(orgs.map((o) => [o.id, o.name]));
  res.json(rows.map((r) => ({ ...r, orgName: r.organisationId ? (orgName[r.organisationId] ?? null) : null })));
});

router.post("/partners/:partnerId/learners/:userId/assign", requireAuth, async (req, res) => {
  const actor = req.dbUser!;
  const { partnerId, userId } = req.params;
  const isSuper = actor.role === "super_admin";
  const isPartnerAdmin = actor.role === "partner_admin" && actor.partnerId === partnerId;
  if (!isSuper && !isPartnerAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!target || (!isSuper && target.partnerId !== partnerId)) { res.status(404).json({ error: "Learner not found in this partner." }); return; }
  const organisationId = req.body?.organisationId ? String(req.body.organisationId) : null;
  if (organisationId) {
    const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, organisationId) });
    if (!org || org.partnerId !== partnerId) { res.status(400).json({ error: "That organisation does not belong to this partner." }); return; }
  }
  await db.update(usersTable).set({ organisationId }).where(eq(usersTable.id, target.id));
  await audit(req, "partner.learner_assign", "user", target.id, { organisationId, partnerId });
  res.json({ id: target.id, organisationId });
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
 * POST /platform/seed-synops-demo - provisions the public "Synops Demo" tenant used for the demo
 * link sent to investors and prospects (demo.synops-consulting.com): its own partner, graphite/amber
 * brand, organisation and cohort, the platform courses (reused from Enza), a demo admin, a coach, and
 * learners including "Demo Learner". Idempotent - safe to click more than once. Run seed-enza first so
 * there is a course catalogue to reuse.
 */
router.post("/platform/seed-synops-demo", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const result = await seedSynopsDemo();
    await audit(req, "platform.seed_synops_demo", "partner", result.partnerId ?? "synops-demo", { courses: result.courses, learners: result.learners });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Seed failed" });
  }
});

/**
 * POST /platform/seed-k12 - provisions the public "Synops Academy (Grade 6)" K-12 demo tenant used
 * for the K-12 investor/prospect link (praxis.synops-consulting.com/k12): its own partner + brand,
 * 5 Grade-6 courses across Math/ELA/Science/Social Studies/History aligned to Common Core / NGSS / C3,
 * and two learners - Maya (two subjects complete + badges) and Leo (accommodations profile). Fully
 * self-contained (authors its own courses); idempotent - safe to click more than once. Super admin only.
 */
router.post("/platform/seed-k12", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const result = await seedK12();
    await audit(req, "platform.seed_k12", "partner", result.partnerId ?? "synops-k12", { courses: result.courses, learners: result.learners, standards: result.standards });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Seed failed" });
  }
});

/**
 * POST /platform/seed-game-library - seeds the reusable Game Library repository: ready-to-use
 * game-show activities (Jeopardy, Family Feud, Bingo, Password, Wheel/Guess-the-Word, Escape Room)
 * rendered per grade band, plus a curated linked catalog of commercial digital titles. All are
 * platform library items (isLibrary, org null) so every tenant can browse and add them to classes.
 * Idempotent. Super admin only.
 */
router.post("/platform/seed-game-library", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const result = await seedGameLibrary(req.userId!);
    await audit(req, "platform.seed_game_library", "activity", "game-library", result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Seed failed" });
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
 * POST /platform/seed-flagship-courses - seeds the 3 priority "flagship" courses (Business Model
 * Canvas, Costing/Pricing/Margin, Compliance Essentials), built to the agreed 8-module architecture:
 * phone-sized competency units, Socratic scenario openers, an observable DO outcome each, and a
 * coach-reviewed artifact per course. Platform-owned, assigned to Enza. Run enrich-enza afterwards
 * to fully build every module. Idempotent. Super admin only.
 */
router.post("/platform/seed-flagship-courses", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const r = await seedFlagshipCourses();
    await audit(req, "platform.seed_flagship_courses", "partner", "enza", { created: r.created, assigned: r.assigned });
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Seed failed" });
  }
});

/**
 * POST /platform/seed-executive-learning - provisions the partner "Executive Learning" and houses the
 * Project Expedite Justice interactive training course (PEJ-EVD-01) under it: a partner-owned, published
 * course with two modules (Documenting the scene, Getting the account), each launching its self-contained
 * interactive station at /demos/pej-evd-01 and /demos/pej-evd-02. Idempotent - safe to click more than once.
 */
router.post("/platform/seed-executive-learning", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const r = await seedExecutiveLearning();
    await audit(req, "platform.seed_executive_learning", "partner", r.partnerId, { created: r.created, courseId: r.courseId });
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Seed failed" });
  }
});

/**
 * POST /platform/seed-zambian-leadership - provisions the partner "Zambian Clinician Leadership" and
 * houses the "Leading with Purpose" demo course under it: a partner-owned, published course with two
 * decision-first modules (The first 48 hours; The overloaded team and the next 90 days), each with a
 * Decision Station, reading, the Mutale AI coach, a published assignment and a discussion, plus a demo
 * learner enrolled. Idempotent - safe to click more than once.
 */
router.post("/platform/seed-zambian-leadership", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const r = await seedZambianLeadership();
    await audit(req, "platform.seed_zambian_leadership", "partner", r.partnerId, { created: r.created, courseId: r.courseId });
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

// POST /platform/reset-enza -- wipe Enza's SEEDED CONTENT back to an empty branded partner: remove
// every organisation, the whole cohort (org-scoped users + their records), partner-owned courses and
// their content, and the seeded hub data (billing/funding/documents/announcements/delegated). KEEPS
// the partner row, its branding, and the partner-level admin login(s) so you can build from scratch.
router.post("/platform/reset-enza", requireAuth, requireSuperAdmin, async (req, res) => {
  const partner = await db.query.partnersTable.findFirst({ where: eq(partnersTable.slug, "enza-global") });
  if (!partner) { res.status(404).json({ error: "Enza partner not found." }); return; }
  const pid = partner.id;

  const orgsSub = sql`(SELECT id FROM organisations WHERE partner_id = ${pid})`;
  // Cohort = users scoped to Enza's orgs. Partner-level admins (organisation_id NULL) are KEPT.
  const usersSub = sql`(SELECT id FROM users WHERE organisation_id IN ${orgsSub})`;
  const classSub = sql`(SELECT id FROM org_classes WHERE org_id IN ${orgsSub})`;
  const coursesSub = sql`(SELECT id FROM courses WHERE tenant_id = ${pid})`;
  const modulesSub = sql`(SELECT id FROM modules WHERE course_id IN ${coursesSub})`;

  const statements = [
    // Cohort learner records.
    sql`DELETE FROM enrolments WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM beat_progress WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM assignment_submissions WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM submissions WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM activity_submissions WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM case_sessions WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM gradebook_entries WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM gradebook_cells WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM gradebook_alerts WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM coach_plans WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM attendance_records WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM notifications WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM auth_sessions WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM password_resets WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM login_events WHERE user_id IN ${usersSub}`,
    // Classes.
    sql`DELETE FROM org_class_learners WHERE class_id IN ${classSub}`,
    sql`DELETE FROM org_class_courses WHERE class_id IN ${classSub}`,
    sql`DELETE FROM org_class_staff WHERE class_id IN ${classSub}`,
    sql`DELETE FROM class_join_codes WHERE class_id IN ${classSub}`,
    sql`DELETE FROM org_classes WHERE org_id IN ${orgsSub}`,
    // Org-scoped delivery + content + org-level branding.
    sql`DELETE FROM delivery_sessions WHERE tenant_id IN ${orgsSub}`,
    sql`DELETE FROM interactive_activities WHERE organisation_id IN ${orgsSub}`,
    sql`DELETE FROM case_scenarios WHERE organisation_id IN ${orgsSub}`,
    sql`DELETE FROM brand_themes WHERE tenant_id IN ${orgsSub}`,
    // Partner-OWNED courses and their content (platform courses are only unassigned, below).
    sql`DELETE FROM beats WHERE module_id IN ${modulesSub}`,
    sql`DELETE FROM module_readings WHERE course_id IN ${coursesSub}`,
    sql`DELETE FROM modules WHERE course_id IN ${coursesSub}`,
    sql`DELETE FROM assignments WHERE course_id IN ${coursesSub}`,
    sql`DELETE FROM discussions WHERE course_id IN ${coursesSub}`,
    sql`DELETE FROM gradebook_items WHERE course_id IN ${coursesSub}`,
    sql`DELETE FROM courses WHERE tenant_id = ${pid}`,
    // Unassign any platform courses from Enza (keeps the platform course itself).
    sql`DELETE FROM course_partner_assignments WHERE partner_id = ${pid}`,
    // Seeded partner hub data.
    sql`DELETE FROM delegated_admins WHERE partner_id = ${pid}`,
    sql`DELETE FROM funding_agreements WHERE partner_id = ${pid}`,
    sql`DELETE FROM funded_seat_assignments WHERE partner_id = ${pid}`,
    sql`DELETE FROM billing_subscriptions WHERE partner_id = ${pid}`,
    sql`DELETE FROM billing_invoices WHERE partner_id = ${pid}`,
    sql`DELETE FROM partner_documents WHERE partner_id = ${pid}`,
    sql`DELETE FROM partner_announcements WHERE partner_id = ${pid}`,
    sql`DELETE FROM platform_filings WHERE partner_id = ${pid}`,
    // Finally the cohort users, then the orgs. Partner row + brand + partner-level admins are kept.
    sql`DELETE FROM users WHERE organisation_id IN ${orgsSub}`,
    sql`DELETE FROM organisations WHERE partner_id = ${pid}`,
  ];
  for (const s of statements) {
    try { await db.execute(s); } catch { /* table absent or column drift - skip, others still run */ }
  }
  await audit(req, "platform.reset_enza", "partner", pid, { name: partner.name });
  res.json({ ok: true, partner: partner.name });
});

// POST /platform/remove-all-learners -- delete every learner-role account and its learning records
// across the whole platform. Keeps courses, organisations, coaches and admins. Optional ?partnerId=
// scopes the purge to one partner's orgs. Best-effort per statement so column/table drift never aborts.
router.post("/platform/remove-all-learners", requireAuth, requireSuperAdmin, async (req, res) => {
  const scope = typeof req.query.partnerId === "string" && req.query.partnerId ? req.query.partnerId : null;
  // Learners in scope: role 'learner', optionally limited to a partner's organisations.
  const usersSub = scope
    ? sql`(SELECT id FROM users WHERE role = 'learner' AND organisation_id IN (SELECT id FROM organisations WHERE partner_id = ${scope}))`
    : sql`(SELECT id FROM users WHERE role = 'learner')`;

  const countRows = await db.execute(sql`SELECT count(*)::int AS n FROM users WHERE id IN ${usersSub}`);
  const removed = Number((countRows.rows?.[0] as { n?: number } | undefined)?.n ?? 0);

  const statements = [
    sql`DELETE FROM org_class_learners WHERE learner_id IN ${usersSub}`,
    sql`DELETE FROM enrolments WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM beat_progress WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM assignment_submissions WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM submissions WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM activity_submissions WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM case_sessions WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM gradebook_entries WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM gradebook_cells WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM gradebook_alerts WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM coach_plans WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM attendance_records WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM notifications WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM auth_sessions WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM password_resets WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM login_events WHERE user_id IN ${usersSub}`,
    scope
      ? sql`DELETE FROM users WHERE role = 'learner' AND organisation_id IN (SELECT id FROM organisations WHERE partner_id = ${scope})`
      : sql`DELETE FROM users WHERE role = 'learner'`,
  ];
  for (const s of statements) {
    try { await db.execute(s); } catch { /* table absent or column drift - skip, others still run */ }
  }
  await audit(req, "platform.remove_all_learners", "platform", scope ?? "all", { removed, scope });
  res.json({ ok: true, removed });
});

// The MRB executive Practice Credentials. Practice-first: each names a leadership practice a candidate
// can evidence from their own work, not a body of content to be taught. Gateway guidance is common
// (G1 relevant activity, G2 personal contribution, G3 learning from practice); no pass/fail.
const MRB_GATEWAY =
  "There is no pass or fail. A reviewer either recognises your portfolio or refers it for resubmission, and both come with developmental feedback. Reviewers look for three things: " +
  "G1 Relevant activity - you have actually done something substantially relevant to this credential. " +
  "G2 Personal contribution - your own actions, decisions or contribution can be clearly identified. " +
  "G3 Learning from practice - your reflection shows what you learned from doing the activity. " +
  "You may use an activity you completed in the last six months; you do not have to start something new.";

const MRB_PRACTICE_CREDENTIALS = [
  { code: "ETHICAL-LEADERSHIP", title: "Ethical Leadership in Practice", sort: 1,
    summary: "Recognise and articulate the ethical principles already underlying how you lead.",
    rationale: "Ethical decisions under pressure are where leadership is really tested. Research on moral courage and ethical climate shows that a leader who can name and stand behind a principled call sets the tone that shapes a whole team's behaviour. The ability to make that call, and account for it afterwards, is what distinguishes leadership from compliance.",
    brief: "Complete an activity that demonstrates your ability to make and stand behind a leadership decision on ethical grounds, especially where fairness, honesty, accountability or the interests of the vulnerable were at stake." },
  { code: "TEAM-FORMATION", title: "Team Formation", sort: 2,
    summary: "Establish or develop an effective team capable of achieving defined objectives.",
    rationale: "How a team is formed predicts how it performs. Tuckman's stages and decades of team-effectiveness research show that deliberate composition, a clear shared purpose and early trust, not luck, decide whether a group can do good work. This is upstream of almost everything else the team will go on to achieve.",
    brief: "You are required to complete an activity that demonstrates your ability to establish or develop an effective team capable of achieving defined objectives. Different professional experiences produce different, valid evidence; a team you built over weeks or an existing team you reshaped both count." },
  { code: "SERVANT-LEADERSHIP", title: "Servant Leadership", sort: 3,
    summary: "Lead by listening and removing obstacles before commanding.",
    rationale: "Hearing a team member's real constraint before acting is consistently linked to higher trust, engagement and psychological safety (Greenleaf; Edmondson). Teams that feel heard surface the problems and take the risks that keep work, and patients, safe. This is not softness; it is what makes a team willing to follow you when it counts.",
    brief: "Complete an activity that demonstrates your ability to hear a team member's actual constraint and act on it, putting the team's capacity to do good work ahead of your own standing." },
  { code: "TRANSFORMATIONAL-LEADERSHIP", title: "Transformational Leadership", sort: 4,
    summary: "Form a clear vision, test it with others, and grow people through it.",
    rationale: "Transformational leadership, forming a vision and taking people with you, is among the most robustly evidenced predictors of team performance and successful change (Bass). A vision without earned trust is just an announcement; this credential is about the trust that lets a vision actually move.",
    brief: "Complete an activity that demonstrates your ability to develop a vision, test it with the people it affects, and take them with you, earning the trust the change depends on." },
  { code: "SOCIAL-VALUE-LEADERSHIP", title: "Social-Value & Equity Leadership", sort: 5,
    summary: "Name who benefits and who risks being left out, and design for the most vulnerable.",
    rationale: "Decisions that name who benefits and who is at risk of being left out separate equitable leadership from well-meaning harm. Health-equity research shows neutral decisions tend to advantage the already-advantaged; designing deliberately for the hardest-to-reach is how a leader closes gaps rather than widens them.",
    brief: "Complete an activity that demonstrates your ability to make a leadership decision that names who benefits and, deliberately, who is at risk of being left out, and to mitigate that gap for the poorest or hardest-to-reach group." },
  { code: "LEADING-CHANGE", title: "Leading Change", sort: 6,
    summary: "Design and lead a change that improves outcomes without leaving the vulnerable behind.",
    rationale: "Most change efforts fail on people, not plans (Kotter). Change that improves outcomes without leaving the vulnerable behind depends on an honest account of who it might exclude. This credential is about leading change that is both effective and fair, and being candid about the trade-offs in your own design.",
    brief: "Complete an activity that demonstrates your ability to design and lead a change to improve effectiveness, pressure-tested against who it might exclude, with an honest account of the equity gaps in your own design." },
];

const MRB_EXAMPLE_ASSIGNMENT =
  "Example (Team Formation): A service manager establishes a multidisciplinary project team to address a workplace challenge and justifies the team's composition; it takes several weeks and meetings. A surgeon reviews the composition of a constantly changing theatre team and recommends changes to improve effectiveness from one chaired meeting plus preparation. The volume and quality of evidence differ, yet both give strong evidence of Team Formation through different professional experiences. Show what YOU did, and what you learned from doing it.";

// POST /platform/seed-mrb-practice -- provision the MRB executive programme as PRACTICE CREDENTIALS
// (Option 5), replacing the course-based experience. Idempotent. Ensures the partner + demo candidate
// exist (reusing the Zambian seed), creates the credential catalogue, and pre-selects two for the demo.
router.post("/platform/seed-mrb-practice", requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    await db.execute(sql.raw(PRACTICE_DDL));
    // Reuse the proven Zambian seed to guarantee the partner, org and demo candidate exist.
    await seedZambianLeadership();
    const p = await db.execute(sql`SELECT id FROM partners WHERE slug = 'zambian-leadership' LIMIT 1`);
    const pid = (p.rows?.[0] as { id?: string } | undefined)?.id;
    if (!pid) throw new Error("Zambian Leadership partner not found after seed.");

    for (const c of MRB_PRACTICE_CREDENTIALS) {
      await db.execute(sql`
        INSERT INTO practice_credentials (partner_id, code, title, summary, activity_brief, gateway_guidance, example_assignment, rationale, sort)
        VALUES (${pid}, ${c.code}, ${c.title}, ${c.summary}, ${c.brief}, ${MRB_GATEWAY}, ${MRB_EXAMPLE_ASSIGNMENT}, ${c.rationale}, ${c.sort})
        ON CONFLICT (partner_id, code) DO UPDATE SET
          title = EXCLUDED.title, summary = EXCLUDED.summary, activity_brief = EXCLUDED.activity_brief,
          gateway_guidance = EXCLUDED.gateway_guidance, example_assignment = EXCLUDED.example_assignment, rationale = EXCLUDED.rationale, sort = EXCLUDED.sort`);
    }

    // Professional MRB brand: the whole environment skins to the Manchester Review Board (deep petrol
    // blue, warm gold accent). Best-effort so a column difference never fails the seed.
    try {
      await db.execute(sql`UPDATE brand_themes SET display_name = 'Manchester Review Board', primary_color = '#1B4965', secondary_color = '#2C6E8E', accent_color = '#C58B2C', credential_title = 'Practice Credential', updated_at = now() WHERE tenant_id = ${pid}`);
      await db.execute(sql`INSERT INTO brand_themes (tenant_id, tenant_type, display_name, primary_color, secondary_color, accent_color, credential_title)
        SELECT ${pid}, 'partner', 'Manchester Review Board', '#1B4965', '#2C6E8E', '#C58B2C', 'Practice Credential'
        WHERE NOT EXISTS (SELECT 1 FROM brand_themes WHERE tenant_id = ${pid})`);
    } catch { /* branding is best-effort */ }

    // Build a realistic, walkthrough-ready portfolio for the demo candidate (persona: Chanda Mulenga),
    // so /demos/mrb shows the whole journey live: Ethical Leadership just started, Team Formation
    // mid-cycle (reflections + evidence, wheel ~3/4), Servant Leadership already recognised.
    const dl = await db.execute(sql`SELECT id FROM users WHERE email = ${ZCL_DEMO_LEARNER_EMAIL} LIMIT 1`);
    const demoId = (dl.rows?.[0] as { id?: string } | undefined)?.id;
    if (demoId) {
      await db.execute(sql`UPDATE users SET first_name = 'Chanda', last_name = 'Mulenga' WHERE id = ${demoId}`);
      const credId = async (code: string): Promise<{ id: string; sort: number } | null> => {
        const r = await db.execute(sql`SELECT id, sort FROM practice_credentials WHERE partner_id = ${pid} AND code = ${code} LIMIT 1`);
        return (r.rows?.[0] as { id: string; sort: number } | undefined) ?? null;
      };

      const eth = await credId("ETHICAL-LEADERSHIP");
      if (eth) await db.execute(sql`
        INSERT INTO candidate_credentials (candidate_id, credential_id, partner_id, sort, justification, status)
        VALUES (${demoId}, ${eth.id}, ${pid}, ${eth.sort}, ${"I want the fairness I already lead by to be recognised."}, 'chosen')
        ON CONFLICT (candidate_id, credential_id) DO UPDATE SET status = 'chosen'`);

      const tf = await credId("TEAM-FORMATION");
      if (tf) {
        const cc = await db.execute(sql`
          INSERT INTO candidate_credentials (candidate_id, credential_id, partner_id, sort, justification, status, self_g1, self_g2)
          VALUES (${demoId}, ${tf.id}, ${pid}, ${tf.sort}, ${"I build teams every week. I just never named it."}, 'in_progress', true, true)
          ON CONFLICT (candidate_id, credential_id) DO UPDATE SET status = 'in_progress', justification = EXCLUDED.justification, self_g1 = true, self_g2 = true RETURNING id`);
        const id = (cc.rows?.[0] as { id?: string } | undefined)?.id;
        if (id) {
          await db.execute(sql`DELETE FROM reflection_entries WHERE candidate_credential_id = ${id}`);
          await db.execute(sql`DELETE FROM evidence_items WHERE candidate_credential_id = ${id}`);
          await db.execute(sql`INSERT INTO reflection_entries (candidate_credential_id, stage, content) VALUES
            (${id}, 'description', 'During the measles cluster I pulled six people from different roles into one team in a day.'),
            (${id}, 'feelings', 'When two of the nurses declined it felt like failure. Later I saw that I never told them why it mattered.'),
            (${id}, 'analysis', 'I chose people for what each could do, not for rank. That is servant leadership, and I have done it for years.')`);
          await db.execute(sql`INSERT INTO evidence_items (candidate_credential_id, kind, title, body) VALUES
            (${id}, 'text', 'Measles response duty roster', 'The roster I drew up, showing each role on the team and why they were chosen.')`);
        }
      }

      const sv = await credId("SERVANT-LEADERSHIP");
      if (sv) {
        const cc = await db.execute(sql`
          INSERT INTO candidate_credentials (candidate_id, credential_id, partner_id, sort, justification, status, self_g1, self_g2, self_g3, submitted_at, reviewed_at)
          VALUES (${demoId}, ${sv.id}, ${pid}, ${sv.sort}, ${"I lead by listening first, and I want that recognised."}, 'reviewed', true, true, true, now() - interval '10 days', now() - interval '3 days')
          ON CONFLICT (candidate_id, credential_id) DO UPDATE SET status = 'reviewed', self_g1 = true, self_g2 = true, self_g3 = true RETURNING id`);
        const id = (cc.rows?.[0] as { id?: string } | undefined)?.id;
        if (id) {
          await db.execute(sql`DELETE FROM reflection_entries WHERE candidate_credential_id = ${id}`);
          await db.execute(sql`DELETE FROM evidence_items WHERE candidate_credential_id = ${id}`);
          await db.execute(sql`DELETE FROM credential_reviews WHERE candidate_credential_id = ${id}`);
          await db.execute(sql`INSERT INTO reflection_entries (candidate_credential_id, stage, content) VALUES
            (${id}, 'description', 'A team member came to me overwhelmed. I asked what was really going on before reassigning anything.'),
            (${id}, 'action', 'Next time I will check capacity before I draw up the roster, not after.')`);
          await db.execute(sql`INSERT INTO evidence_items (candidate_credential_id, kind, title, body) VALUES
            (${id}, 'text', 'Note to a colleague', 'The note I wrote her afterward, redistributing two of her rounds.')`);
          await db.execute(sql`INSERT INTO credential_reviews (candidate_credential_id, reviewer_id, g1, g2, g3, outcome, feedback) VALUES
            (${id}, ${demoId}, true, true, true, 'reviewed', 'You clearly listen before you act, and the note to your colleague is strong evidence. To go deeper next time, name the moment you chose not to solve it yourself. Recognised.')`);
        }
      }
    }
    await audit(_req, "platform.seed_mrb_practice", "partner", pid, { credentials: MRB_PRACTICE_CREDENTIALS.length });
    res.json({ ok: true, credentials: MRB_PRACTICE_CREDENTIALS.length, demoSeeded: !!demoId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Seed failed" });
  }
});

// ── Educator Professional Development demo (Thoughtful AI in teaching) ─────────
const EDU_GATEWAY =
  "There is no pass or fail. A reviewer either recognises your portfolio or refers it for resubmission, and both come with developmental feedback. Reviewers look for three things: " +
  "G1 Relevant activity, you actually did something real with your own students or colleagues. " +
  "G2 Personal contribution, your own teaching decisions and judgement are visible. " +
  "G3 Learning from practice, your reflection shows what you learned and would do differently. " +
  "Use something from your own classroom this term; you do not have to start something new. This is adult learning: it builds on your experience and professional judgement, not on being told the answer.";

const EDU_EXAMPLE =
  "Example (AI-Assisted Lesson Design): One teacher uses an AI tool to draft a unit plan, then documents every change they made and why, showing where their judgement overrode the machine. Another keeps a week of planning notes showing which tasks they let AI carry (finding examples, differentiating a text) and which they kept for themselves (deciding what mattered, knowing their students). Different practice, both strong evidence. Show what YOU decided, and what you learned.";

const EDU_PRACTICE_CREDENTIALS = [
  { code: "AI-ASSISTED-PLANNING", title: "AI-Assisted Lesson Design", sort: 1,
    summary: "Plan with AI while keeping the pedagogical judgement only you can make.",
    rationale: "Planning is where a teacher's expertise actually lives. Research on cognitive offloading (Risko and Gilbert) shows that handing routine load to a tool can free your attention for the harder judgement, knowing your students and anticipating their misconceptions, but offloading that judgement itself quietly erodes the skill. Getting deliberate about which is which is what keeps AI a planning assistant rather than a planning replacement.",
    brief: "Complete an activity where you used an AI tool to help plan teaching, and can show where you kept the thinking that matters, deciding what your students needed, and where you let AI carry the load that did not. Name the difference between offloading that freed you to teach and offloading that would have replaced your judgement." },
  { code: "INTEGRITY-AI", title: "Assessment Integrity in the Age of AI", sort: 2,
    summary: "Redesign an assessment so it stays meaningful when students can use AI.",
    rationale: "An assessment is only worth something if it measures the student, not the tool. The moment a task can be completed by a generative model, its validity collapses and the results start quietly misleading your teaching decisions. Redesigning toward what AI cannot do for them, reasoning in the moment and defending their own work, is what restores an assessment you can actually trust.",
    brief: "Complete an activity where you rethought an assessment so it still tells you what a student can actually do, in a world where AI is available. Show the change you made and your reasoning, and be honest about the trade-offs." },
  { code: "TEACHING-WITH-AI-STUDENTS", title: "Teaching Students to Use AI Well", sort: 3,
    summary: "Help students use AI as a thinking partner, not a shortcut around thinking.",
    rationale: "Students are already using AI, and unguided use tends toward over-reliance that removes the very effort that builds learning, recent studies link heavy AI use to weaker metacognition and self-regulation. Teaching students to use it as a scaffold rather than a shortcut preserves the productive struggle, the desirable difficulty, that makes learning durable.",
    brief: "Complete an activity where you taught students to use AI in a way that strengthened their thinking rather than replaced it. Show what you did, how students responded, and what you learned about the line between help and harm." },
  { code: "AI-FEEDBACK", title: "Feedback in an AI-Rich Classroom", sort: 4,
    summary: "Use AI to give more and better feedback without losing the human relationship in it.",
    rationale: "Feedback is one of the highest-impact things a teacher does, Hattie's synthesis of thousands of studies ranks it near the top, but its power depends on trust, timing and specificity. AI can multiply the volume and speed of feedback; what it cannot do is hold the relationship that makes a student act on it. This is about using the machine for reach while you keep the human core that makes feedback land.",
    brief: "Complete an activity where AI helped you give students more, or better, feedback, while you kept the relational core that makes feedback land. Show where the machine helped and where you had to be the teacher." },
  { code: "AI-EQUITY", title: "Equity and Access with AI", sort: 5,
    summary: "Make AI narrow the gaps between your students rather than widen them.",
    rationale: "New technology usually widens gaps before it narrows them. The digital divide and the Matthew effect mean the best-supported students tend to benefit most, so uncritical adoption can entrench disadvantage. A deliberate equity decision, naming who could be left behind and protecting them, is what turns AI from a gap-widener into a leveller.",
    brief: "Complete an activity where you made a deliberate choice about AI use with equity in mind, naming who could be advantaged, who could be left behind, and what you did to protect the students most at risk of falling behind." },
  { code: "AI-TEACHING-STANCE", title: "Your Principled AI Teaching Stance", sort: 6,
    summary: "Articulate and defend your own considered position on AI in your classroom.",
    rationale: "Teachers' beliefs shape classroom practice more than any policy does. Transformative professional learning (Mezirow) comes from surfacing and testing your own assumptions, not from being handed rules. Articulating a stance you can defend turns reactive, inconsistent AI decisions into principled practice your students can rely on.",
    brief: "Complete an activity, a written stance, a staff-meeting contribution, a policy you drafted, where you set out your own principled position on AI in teaching and tested it against a colleague or your students. Show how your thinking changed through the process." },
];

// POST /platform/seed-educator-pd -- provision the educator PD demo (separate partner + credentials),
// reusing the whole practice engine. Idempotent. Brands the tenant and seeds a walkthrough portfolio.
router.post("/platform/seed-educator-pd", requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    await db.execute(sql.raw(PRACTICE_DDL));
    const seeded = await seedEducatorPD();
    const pid = seeded.partnerId;
    for (const c of EDU_PRACTICE_CREDENTIALS) {
      await db.execute(sql`
        INSERT INTO practice_credentials (partner_id, code, title, summary, activity_brief, gateway_guidance, example_assignment, rationale, sort)
        VALUES (${pid}, ${c.code}, ${c.title}, ${c.summary}, ${c.brief}, ${EDU_GATEWAY}, ${EDU_EXAMPLE}, ${c.rationale}, ${c.sort})
        ON CONFLICT (partner_id, code) DO UPDATE SET
          title = EXCLUDED.title, summary = EXCLUDED.summary, activity_brief = EXCLUDED.activity_brief,
          gateway_guidance = EXCLUDED.gateway_guidance, example_assignment = EXCLUDED.example_assignment, rationale = EXCLUDED.rationale, sort = EXCLUDED.sort`);
    }

    // Brand the educator programme (indigo + teal, distinct from the MRB petrol blue). Best-effort.
    try {
      await db.execute(sql`UPDATE brand_themes SET display_name = 'Educator Professional Development', primary_color = '#3B4CB8', secondary_color = '#5B6EE1', accent_color = '#12A594', credential_title = 'Practice Credential', updated_at = now() WHERE tenant_id = ${pid}`);
      await db.execute(sql`INSERT INTO brand_themes (tenant_id, tenant_type, display_name, primary_color, secondary_color, accent_color, credential_title)
        SELECT ${pid}, 'partner', 'Educator Professional Development', '#3B4CB8', '#5B6EE1', '#12A594', 'Practice Credential'
        WHERE NOT EXISTS (SELECT 1 FROM brand_themes WHERE tenant_id = ${pid})`);
    } catch { /* branding best-effort */ }

    // Keep the ENTRY learner (Sam Rivera) empty so /demos/educator starts from the very beginning.
    await db.execute(sql`DELETE FROM reflection_entries WHERE candidate_credential_id IN (SELECT id FROM candidate_credentials WHERE candidate_id = ${seeded.demoLearnerId})`);
    await db.execute(sql`DELETE FROM evidence_items WHERE candidate_credential_id IN (SELECT id FROM candidate_credentials WHERE candidate_id = ${seeded.demoLearnerId})`);
    await db.execute(sql`DELETE FROM candidate_credentials WHERE candidate_id = ${seeded.demoLearnerId}`);

    // Walkthrough portfolio for the SHOWCASE educator (Maria Alvarez): AI-Assisted Planning mid-cycle,
    // Assessment Integrity recognised (mints a verifiable credential). Kept off the demo entry account.
    const demoId = seeded.showcaseLearnerId;
    if (demoId) {
      const credId = async (code: string): Promise<string | null> => {
        const r = await db.execute(sql`SELECT id FROM practice_credentials WHERE partner_id = ${pid} AND code = ${code} LIMIT 1`);
        return (r.rows?.[0] as { id?: string } | undefined)?.id ?? null;
      };
      const chooseCc = async (code: string, status: string, justification: string, sort: number): Promise<string | null> => {
        const cid = await credId(code);
        if (!cid) return null;
        const r = await db.execute(sql`
          INSERT INTO candidate_credentials (candidate_id, credential_id, partner_id, sort, justification, status)
          VALUES (${demoId}, ${cid}, ${pid}, ${sort}, ${justification}, ${status})
          ON CONFLICT (candidate_id, credential_id) DO UPDATE SET status = EXCLUDED.status, justification = EXCLUDED.justification
          RETURNING id`);
        return (r.rows?.[0] as { id?: string } | undefined)?.id ?? null;
      };
      const refl = async (ccId: string, stage: string, content: string) => {
        await db.execute(sql`INSERT INTO reflection_entries (candidate_credential_id, stage, content, source) VALUES (${ccId}, ${stage}, ${content}, 'typed')`);
      };

      const plan = await chooseCc("AI-ASSISTED-PLANNING", "in_progress", "I plan with AI every week and want to be clearer about what I keep for myself.", 0);
      if (plan) {
        await db.execute(sql`DELETE FROM reflection_entries WHERE candidate_credential_id = ${plan}`);
        await refl(plan, "description", "I used an AI tool to draft a week of Year 9 lessons on persuasive writing, then rebuilt half of it.");
        await refl(plan, "feelings", "Relieved at first, then uneasy. The draft was fluent but it did not know my students, the three who freeze at a blank page.");
        await refl(plan, "prediction", "I expected the AI plan would save me time and I would use it almost as-is.");
        await refl(plan, "surprise", "It saved time on examples and structure, but I spent that time redesigning the opening for my reluctant writers. The judgement moved, it did not disappear.");
        await db.execute(sql`INSERT INTO evidence_items (candidate_credential_id, kind, title, body) VALUES (${plan}, 'text', 'Annotated plan', 'My AI draft with every change I made marked in the margin, and why.')`);
        await db.execute(sql`UPDATE candidate_credentials SET self_g1 = true, self_g2 = true WHERE id = ${plan}`);
      }

      const integrity = await chooseCc("INTEGRITY-AI", "reviewed", "I redesigned my coursework task after half the class used AI on the last one.", 1);
      if (integrity) {
        await db.execute(sql`DELETE FROM reflection_entries WHERE candidate_credential_id = ${integrity}`);
        await refl(integrity, "description", "I changed my history source-analysis task from a take-home essay to an in-class annotated response plus a short spoken defence.");
        await refl(integrity, "analysis", "The old task measured polish, which AI produces cheaply. The new one measures whether they can actually reason with a source in front of them and me.");
        await refl(integrity, "conclusion", "Integrity is not about banning AI, it is about assessing the thing AI cannot do for them.");
        await db.execute(sql`INSERT INTO evidence_items (candidate_credential_id, kind, title, body) VALUES (${integrity}, 'text', 'Old and new task', 'Both versions of the task, with my reasoning for the redesign.')`);
        await db.execute(sql`UPDATE candidate_credentials SET self_g1 = true, self_g2 = true, self_g3 = true, reviewed_at = now() WHERE id = ${integrity}`);
        const rev = await db.execute(sql`SELECT id FROM credential_reviews WHERE candidate_credential_id = ${integrity} AND calibration = false LIMIT 1`);
        if (!(rev.rows?.[0])) {
          await db.execute(sql`INSERT INTO credential_reviews (candidate_credential_id, reviewer_id, g1, g2, g3, outcome, feedback)
            VALUES (${integrity}, ${demoId}, true, true, true, 'reviewed', 'A sharp redesign. You name exactly what the old task measured and why it no longer holds. To go further, gather one piece of student work under the new task and reflect on what it let you see. Recognised.')`);
        }
        await db.execute(sql`INSERT INTO issued_credentials (candidate_credential_id, public_id, recipient_name, credential_title, g1, g2, g3)
          VALUES (${integrity}, ${"edu-" + Math.random().toString(16).slice(2, 12)}, 'Maria Alvarez', 'Assessment Integrity in the Age of AI', true, true, true)
          ON CONFLICT (candidate_credential_id) DO NOTHING`);
      }
    }

    await audit(_req, "platform.seed_educator_pd", "partner", pid, { credentials: EDU_PRACTICE_CREDENTIALS.length });
    res.json({ ok: true, credentials: EDU_PRACTICE_CREDENTIALS.length, demoSeeded: !!demoId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Seed failed" });
  }
});

export default router;
