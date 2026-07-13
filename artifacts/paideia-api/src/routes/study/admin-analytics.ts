// Admin analytics, usage telemetry read-outs, announcements, pricing/payment
// catalogs, audit log, and user management for Coach. Ported from the Arete admin
// and adapted to Coach's study_* schema. Mounted at /admin alongside admin.ts, so
// it shares the requireStudyAdmin gate. Cross-table analytics use raw SQL because
// the column set is fixed and known; the simple CRUD uses the query builder.
import { Router, type IRouter, type Request, type Response } from "express";
import { randomBytes, createHash } from "node:crypto";
import {
  db,
  studyUsersTable,
  studyLearnerProfilesTable,
  studySessionsTable,
  studyApiKeysTable,
  studyAnnouncementsTable,
  studyPlansTable,
  studyPaymentMethodsTable,
  studyAdminAuditLogTable,
} from "@workspace/paideia-db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireStudyAdmin } from "../../middlewares/auth.js";
import { METHODS, COUNTRIES } from "../../lib/billing/config.js";
import {
  hashPassword,
  newSessionToken,
  studySessionExpiry,
  STUDY_SESSION_COOKIE,
  STUDY_IMPERSONATOR_COOKIE,
} from "../../lib/studyAuth.js";
import { createResetToken } from "./auth.js";

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env["NODE_ENV"] === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

const router: IRouter = Router();
router.use(requireStudyAdmin);

// "paid" = an active/trialing subscription or a non-free tier; else free. Unqualified
// column names resolve to study_users in every query below (the only table with them).
const PAID = sql`(subscription_status IN ('active','trialing') OR subscription_tier IN ('plus','pro'))`;

// Best-effort audit row; never blocks or fails the action it records.
async function writeAudit(
  req: Request,
  action: string,
  targetType: string | null,
  targetId: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(studyAdminAuditLogTable).values({
      actorUserId: req.studyUser?.id ?? null,
      actorEmail: req.studyUser?.email ?? null,
      action,
      targetType,
      targetId,
      metadata,
    });
  } catch {
    // audit is advisory only
  }
}

// Mask the last octet/group of an IP so the admin sees enough to spot patterns
// without exposing the full address (privacy by default).
function maskIp(ip: unknown): string | null {
  if (typeof ip !== "string" || !ip) return null;
  if (ip.includes(".")) {
    const p = ip.split(".");
    return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.x` : ip;
  }
  if (ip.includes(":")) {
    return ip.split(":").slice(0, 3).join(":") + "::x";
  }
  return ip;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

// GET /admin/overview — headline KPIs.
router.get("/overview", async (_req, res) => {
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM study_users)::int AS total_users,
      (SELECT count(*) FROM study_users WHERE ${PAID})::int AS paid_users,
      (SELECT count(*) FROM study_users WHERE NOT ${PAID})::int AS free_users,
      (SELECT count(*) FROM study_users WHERE suspended = true)::int AS suspended_users,
      (SELECT count(*) FROM study_users WHERE created_at >= now() - interval '1 day')::int AS new_users_today,
      (SELECT count(*) FROM study_users WHERE created_at >= now() - interval '7 days')::int AS new_users_7d,
      (SELECT count(*) FROM study_users WHERE created_at >= now() - interval '30 days')::int AS new_users_30d,
      (SELECT count(*) FROM study_users WHERE last_active_at >= now() - interval '1 day')::int AS active_users_today,
      (SELECT count(*) FROM study_users WHERE last_active_at >= now() - interval '7 days')::int AS active_users_7d,
      (SELECT count(*) FROM study_users WHERE last_active_at >= now() - interval '30 days')::int AS active_users_30d,
      (SELECT count(*) FROM study_activity_sessions)::int AS total_sessions,
      (SELECT coalesce(sum(extract(epoch FROM (last_seen_at - started_at))), 0)::float8 FROM study_activity_sessions) AS total_time_seconds,
      (SELECT count(*) FROM study_materials)::int AS total_materials,
      (SELECT count(*) FROM study_practice_sessions)::int AS total_practice,
      (SELECT count(*) FROM study_mock_exams)::int AS total_exams,
      (SELECT count(*) FROM study_activity_log)::int AS total_activity_events,
      (SELECT coalesce(sum(amount_minor), 0)::int FROM study_payments WHERE status = 'paid') AS revenue_minor_paid
  `);
  res.json((result.rows ?? [])[0] ?? {});
});

// GET /admin/funnel — activation funnel + a simple return-rate, over non-suspended
// learners. Built entirely on data we already collect (signups, materials,
// practice/exams, last-active). Percentages are computed client-side.
router.get("/funnel", async (_req, res) => {
  const result = await db.execute(sql`
    WITH u AS (SELECT id, created_at, last_active_at FROM study_users WHERE suspended = false)
    SELECT
      (SELECT count(*) FROM u)::int AS signups,
      (SELECT count(DISTINCT m.user_id) FROM study_materials m JOIN u ON u.id = m.user_id)::int AS activated,
      (SELECT count(DISTINCT e.user_id) FROM (
          SELECT user_id FROM study_practice_sessions
          UNION SELECT user_id FROM study_mock_exams
        ) e JOIN u ON u.id = e.user_id)::int AS engaged,
      (SELECT count(*) FROM u
         WHERE last_active_at IS NOT NULL
           AND last_active_at >= now() - interval '7 days'
           AND created_at < now() - interval '7 days')::int AS retained,
      (SELECT count(*) FROM u WHERE created_at < now() - interval '1 day')::int AS eligible_return,
      (SELECT count(*) FROM u
         WHERE created_at < now() - interval '1 day'
           AND last_active_at IS NOT NULL
           AND last_active_at >= created_at + interval '1 day')::int AS returned_after_day1
  `);
  res.json((result.rows ?? [])[0] ?? {});
});

// GET /admin/feedback — in-app feedback submissions (stored in the activity log).
router.get("/feedback", async (_req, res) => {
  const result = await db.execute(sql`
    SELECT a.id, a.created_at, a.metadata, u.email, u.name
    FROM study_activity_log a
    LEFT JOIN study_users u ON u.id = a.user_id
    WHERE a.activity_type = 'feedback'
    ORDER BY a.created_at DESC
    LIMIT 200
  `);
  res.json(result.rows ?? []);
});

// GET /admin/usage — 30-day daily time series.
router.get("/usage", async (_req, res) => {
  const result = await db.execute(sql`
    WITH days AS (
      SELECT to_char(d, 'YYYY-MM-DD') AS day
      FROM generate_series((now() - interval '29 days')::date, now()::date, interval '1 day') AS d
    )
    SELECT days.day,
      COALESCE(nu.new_users, 0)::int AS new_users,
      COALESCE(ev.events, 0)::int AS events,
      COALESCE(ev.active_users, 0)::int AS active_users,
      COALESCE(se.sessions, 0)::int AS sessions
    FROM days
    LEFT JOIN (SELECT to_char(created_at, 'YYYY-MM-DD') AS day, count(*) AS new_users
               FROM study_users WHERE created_at >= now() - interval '30 days' GROUP BY 1) nu ON nu.day = days.day
    LEFT JOIN (SELECT to_char(created_at, 'YYYY-MM-DD') AS day, count(*) AS events, count(DISTINCT user_id) AS active_users
               FROM study_activity_log WHERE created_at >= now() - interval '30 days' GROUP BY 1) ev ON ev.day = days.day
    LEFT JOIN (SELECT to_char(started_at, 'YYYY-MM-DD') AS day, count(*) AS sessions
               FROM study_activity_sessions WHERE started_at >= now() - interval '30 days' GROUP BY 1) se ON se.day = days.day
    ORDER BY days.day
  `);
  res.json(result.rows ?? []);
});

// GET /admin/breakdown — distributions (plan, tier, country, device, activity type).
router.get("/breakdown", async (_req, res) => {
  const [plans, tiers, countries, devices, activities] = await Promise.all([
    db.execute(sql`SELECT CASE WHEN ${PAID} THEN 'paid' ELSE 'free' END AS key, count(*)::int AS count FROM study_users GROUP BY 1 ORDER BY count DESC`),
    db.execute(sql`SELECT subscription_tier AS key, count(*)::int AS count FROM study_users GROUP BY 1 ORDER BY count DESC`),
    db.execute(sql`SELECT country AS key, count(*)::int AS count FROM study_activity_sessions WHERE country IS NOT NULL GROUP BY 1 ORDER BY count DESC LIMIT 12`),
    db.execute(sql`SELECT device AS key, count(*)::int AS count FROM study_activity_sessions WHERE device IS NOT NULL GROUP BY 1 ORDER BY count DESC LIMIT 12`),
    db.execute(sql`SELECT activity_type AS key, count(*)::int AS count FROM study_activity_log GROUP BY 1 ORDER BY count DESC LIMIT 15`),
  ]);
  res.json({
    plans: plans.rows ?? [],
    tiers: tiers.rows ?? [],
    countries: countries.rows ?? [],
    devices: devices.rows ?? [],
    activities: activities.rows ?? [],
  });
});

// GET /admin/logins — recent sessions: who, when, how long, from where, on what.
router.get("/logins", async (_req, res) => {
  const result = await db.execute(sql`
    SELECT s.started_at, s.last_seen_at,
      extract(epoch FROM (s.last_seen_at - s.started_at))::int AS seconds,
      s.ip_address, s.device, s.city, s.region, s.country,
      u.email, u.name,
      CASE WHEN ${PAID} THEN 'paid' ELSE 'free' END AS plan
    FROM study_activity_sessions s
    LEFT JOIN study_users u ON u.id = s.user_id
    ORDER BY s.started_at DESC
    LIMIT 150
  `);
  const rows = (result.rows ?? []).map((r) => ({ ...r, ip_address: maskIp((r as Record<string, unknown>)["ip_address"]) }));
  res.json(rows);
});

// GET /admin/users — per-user list with usage counts (search via ?q=).
router.get("/users", async (req, res) => {
  const q = typeof req.query["q"] === "string" ? req.query["q"].trim().toLowerCase() : "";
  const like = `%${q}%`;
  const result = await db.execute(sql`
    SELECT u.id, u.email, u.name, u.subscription_tier, u.subscription_status, u.is_admin, u.suspended, u.role,
      u.billing_country, u.created_at, u.last_active_at,
      (${PAID}) AS is_paid,
      (SELECT count(*) FROM study_activity_sessions s WHERE s.user_id = u.id)::int AS session_count,
      (SELECT coalesce(sum(extract(epoch FROM (s.last_seen_at - s.started_at))), 0)::float8 FROM study_activity_sessions s WHERE s.user_id = u.id) AS total_time_seconds,
      (SELECT count(*) FROM study_activity_log a WHERE a.user_id = u.id)::int AS event_count,
      (SELECT count(*) FROM study_materials m WHERE m.user_id = u.id)::int AS material_count,
      (SELECT count(*) FROM study_practice_sessions p WHERE p.user_id = u.id)::int AS practice_count,
      (SELECT count(*) FROM study_mock_exams e WHERE e.user_id = u.id)::int AS exam_count
    FROM study_users u
    ${q ? sql`WHERE lower(u.email) LIKE ${like} OR lower(u.name) LIKE ${like}` : sql``}
    ORDER BY u.last_active_at DESC NULLS LAST, u.created_at DESC
    LIMIT 500
  `);
  res.json(result.rows ?? []);
});

// GET /admin/users/:id — one learner's full profile, sessions, activity, payments.
router.get("/users/:id", async (req, res) => {
  const id = String(req.params.id);
  const [profile, sessions, activity, payments] = await Promise.all([
    db.execute(sql`
      SELECT u.id, u.email, u.name, u.subscription_tier, u.subscription_status, u.subscription_provider,
        u.billing_country, u.is_admin, u.suspended, u.role, u.created_at, u.last_active_at, (${PAID}) AS is_paid,
        (SELECT count(*) FROM study_activity_sessions s WHERE s.user_id = u.id)::int AS session_count,
        (SELECT coalesce(sum(extract(epoch FROM (s.last_seen_at - s.started_at))), 0)::float8 FROM study_activity_sessions s WHERE s.user_id = u.id) AS total_time_seconds,
        (SELECT count(*) FROM study_materials m WHERE m.user_id = u.id)::int AS material_count,
        (SELECT count(*) FROM study_practice_sessions p WHERE p.user_id = u.id)::int AS practice_count,
        (SELECT count(*) FROM study_mock_exams e WHERE e.user_id = u.id)::int AS exam_count,
        (SELECT count(*) FROM study_activity_log a WHERE a.user_id = u.id)::int AS event_count
      FROM study_users u WHERE u.id = ${id} LIMIT 1
    `),
    db.execute(sql`SELECT started_at, last_seen_at, extract(epoch FROM (last_seen_at - started_at))::int AS seconds,
      ip_address, device, city, region, country FROM study_activity_sessions WHERE user_id = ${id} ORDER BY started_at DESC LIMIT 50`),
    db.execute(sql`SELECT activity_type, entity_type, duration_seconds, created_at FROM study_activity_log WHERE user_id = ${id} ORDER BY created_at DESC LIMIT 50`),
    db.execute(sql`SELECT provider, method, amount_minor, currency, status, tier, created_at, paid_at FROM study_payments WHERE user_id = ${id} ORDER BY created_at DESC LIMIT 25`),
  ]);
  const row = (profile.rows ?? [])[0];
  if (!row) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user: row, sessions: sessions.rows ?? [], activity: activity.rows ?? [], payments: payments.rows ?? [] });
});

// GET /admin/upgrade-targets — free users ranked by an engagement score, for
// marketing/upgrade outreach. Score weights high-intent actions and heavy usage;
// days_since_active surfaces how warm the lead is.
router.get("/upgrade-targets", async (_req, res) => {
  const result = await db.execute(sql`
    SELECT u.id, u.email, u.name, u.billing_country, u.created_at, u.last_active_at,
      COALESCE(s.session_count, 0)::int AS session_count,
      COALESCE(s.total_time_seconds, 0)::float8 AS total_time_seconds,
      COALESCE(a.event_count, 0)::int AS event_count,
      COALESCE(m.material_count, 0)::int AS material_count,
      COALESCE(p.practice_count, 0)::int AS practice_count,
      (COALESCE(s.session_count, 0) * 2
        + COALESCE(a.event_count, 0)
        + COALESCE(m.material_count, 0) * 3
        + COALESCE(p.practice_count, 0) * 2
        + LEAST(COALESCE(s.total_time_seconds, 0) / 600, 50))::int AS engagement_score,
      EXTRACT(day FROM now() - u.last_active_at)::int AS days_since_active
    FROM study_users u
    LEFT JOIN (SELECT user_id, count(*) AS session_count, coalesce(sum(extract(epoch FROM (last_seen_at - started_at))), 0) AS total_time_seconds FROM study_activity_sessions GROUP BY user_id) s ON s.user_id = u.id
    LEFT JOIN (SELECT user_id, count(*) AS event_count FROM study_activity_log GROUP BY user_id) a ON a.user_id = u.id
    LEFT JOIN (SELECT user_id, count(*) AS material_count FROM study_materials GROUP BY user_id) m ON m.user_id = u.id
    LEFT JOIN (SELECT user_id, count(*) AS practice_count FROM study_practice_sessions GROUP BY user_id) p ON p.user_id = u.id
    WHERE NOT ${PAID}
    ORDER BY engagement_score DESC, u.last_active_at DESC NULLS LAST
    LIMIT 100
  `);
  res.json(result.rows ?? []);
});

// ─── Announcements ───────────────────────────────────────────────────────────

router.get("/announcements", async (_req, res) => {
  const rows = await db.select().from(studyAnnouncementsTable).orderBy(desc(studyAnnouncementsTable.createdAt));
  res.json({ announcements: rows });
});

router.post("/announcements", async (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  const body = String(req.body?.body ?? "").trim();
  if (!title || !body) {
    res.status(400).json({ error: "title and body are required" });
    return;
  }
  const audience = ["all", "free", "paid"].includes(req.body?.audience) ? req.body.audience : "all";
  const level = ["info", "success", "warning", "promo"].includes(req.body?.level) ? req.body.level : "info";
  const inserted = await db
    .insert(studyAnnouncementsTable)
    .values({ title, body, audience, level, createdByEmail: req.studyUser?.email ?? null })
    .returning();
  await writeAudit(req, "announcement.create", "announcement", String(inserted[0]?.id ?? ""), { title, audience });
  res.status(201).json({ announcement: inserted[0] });
});

router.patch("/announcements/:id", async (req, res) => {
  const id = Number(req.params.id);
  const set: Record<string, unknown> = {};
  if (typeof req.body?.active === "boolean") {
    set["active"] = req.body.active;
    set["deactivatedAt"] = req.body.active ? null : new Date();
  }
  if (typeof req.body?.title === "string") set["title"] = req.body.title.trim();
  if (typeof req.body?.body === "string") set["body"] = req.body.body.trim();
  if (typeof req.body?.audience === "string" && ["all", "free", "paid"].includes(req.body.audience)) set["audience"] = req.body.audience;
  if (typeof req.body?.level === "string") set["level"] = req.body.level;
  const updated = await db.update(studyAnnouncementsTable).set(set).where(eq(studyAnnouncementsTable.id, id)).returning();
  if (!updated[0]) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }
  res.json({ announcement: updated[0] });
});

// ─── Pricing / plans ─────────────────────────────────────────────────────────

router.get("/plans", async (_req, res) => {
  const rows = await db.select().from(studyPlansTable).orderBy(studyPlansTable.sortOrder);
  if (rows.length > 0) {
    res.json({ plans: rows, fromConfig: false });
    return;
  }
  // No custom plans saved yet — surface the live pricing config (USD anchor) as
  // read-only rows (negative id = config-derived, not editable) so the table isn't blank.
  const zw = COUNTRIES.ZW;
  const plans = (["plus", "pro"] as const).map((key, i) => ({
    id: -(i + 1),
    key,
    name: key[0]!.toUpperCase() + key.slice(1),
    description: null,
    priceMinor: Math.round(zw.price[key].month * 100),
    currency: zw.currency,
    interval: "month",
    features: [] as string[],
    monthlyGenerationCap: null,
    active: true,
    sortOrder: i,
  }));
  res.json({ plans, fromConfig: true });
});

router.post("/plans", async (req, res) => {
  const key = String(req.body?.key ?? "").trim().toLowerCase();
  const name = String(req.body?.name ?? "").trim();
  if (!key || !name) {
    res.status(400).json({ error: "key and name are required" });
    return;
  }
  const cap = req.body?.monthlyGenerationCap;
  const inserted = await db
    .insert(studyPlansTable)
    .values({
      key,
      name,
      description: req.body?.description ? String(req.body.description) : null,
      priceMinor: Number.isFinite(Number(req.body?.priceMinor)) ? Math.round(Number(req.body.priceMinor)) : 0,
      currency: String(req.body?.currency ?? "USD"),
      interval: ["month", "year", "once"].includes(req.body?.interval) ? req.body.interval : "month",
      features: Array.isArray(req.body?.features) ? req.body.features.map((f: unknown) => String(f)) : [],
      monthlyGenerationCap: cap == null || cap === "" ? null : Math.round(Number(cap)),
      active: req.body?.active === undefined ? true : Boolean(req.body.active),
      sortOrder: Number.isFinite(Number(req.body?.sortOrder)) ? Math.round(Number(req.body.sortOrder)) : 0,
    })
    .returning();
  await writeAudit(req, "plan.create", "plan", key, {});
  res.status(201).json({ plan: inserted[0] });
});

router.patch("/plans/:id", async (req, res) => {
  const id = Number(req.params.id);
  const set: Record<string, unknown> = {};
  for (const f of ["name", "description", "currency", "interval"] as const) {
    if (typeof req.body?.[f] === "string") set[f] = req.body[f];
  }
  if (req.body?.priceMinor !== undefined) set["priceMinor"] = Math.round(Number(req.body.priceMinor));
  if (Array.isArray(req.body?.features)) set["features"] = req.body.features.map((f: unknown) => String(f));
  if (typeof req.body?.active === "boolean") set["active"] = req.body.active;
  if (req.body?.sortOrder !== undefined) set["sortOrder"] = Math.round(Number(req.body.sortOrder));
  if (req.body?.monthlyGenerationCap !== undefined) {
    const cap = req.body.monthlyGenerationCap;
    set["monthlyGenerationCap"] = cap === null || cap === "" ? null : Math.round(Number(cap));
  }
  const updated = await db.update(studyPlansTable).set(set).where(eq(studyPlansTable.id, id)).returning();
  if (!updated[0]) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  await writeAudit(req, "plan.update", "plan", String(id), {});
  res.json({ plan: updated[0] });
});

// ─── Payment methods ─────────────────────────────────────────────────────────

router.get("/payment-methods", async (_req, res) => {
  const rows = await db.select().from(studyPaymentMethodsTable).orderBy(studyPaymentMethodsTable.sortOrder);
  if (rows.length > 0) {
    res.json({ paymentMethods: rows, fromConfig: false });
    return;
  }
  // No custom methods saved yet — surface the configured gateways as read-only rows.
  const paymentMethods = Object.values(METHODS).map((m, i) => ({
    id: -(i + 1),
    key: m.id,
    label: m.label,
    provider: m.kind === "card" ? "paynow / flutterwave" : m.id === "ecocash" || m.id === "onemoney" ? "paynow" : "flutterwave",
    countries: [] as string[],
    enabled: true,
    sortOrder: i,
  }));
  res.json({ paymentMethods, fromConfig: true });
});

router.post("/payment-methods", async (req, res) => {
  const key = String(req.body?.key ?? "").trim().toLowerCase();
  const label = String(req.body?.label ?? "").trim();
  const provider = String(req.body?.provider ?? "").trim();
  if (!key || !label || !provider) {
    res.status(400).json({ error: "key, label and provider are required" });
    return;
  }
  const inserted = await db
    .insert(studyPaymentMethodsTable)
    .values({
      key,
      label,
      provider,
      countries: Array.isArray(req.body?.countries) ? req.body.countries.map((c: unknown) => String(c)) : [],
      enabled: req.body?.enabled === undefined ? true : Boolean(req.body.enabled),
      sortOrder: Number.isFinite(Number(req.body?.sortOrder)) ? Math.round(Number(req.body.sortOrder)) : 0,
    })
    .returning();
  await writeAudit(req, "payment_method.create", "payment_method", key, {});
  res.status(201).json({ paymentMethod: inserted[0] });
});

router.patch("/payment-methods/:id", async (req, res) => {
  const id = Number(req.params.id);
  const set: Record<string, unknown> = {};
  for (const f of ["label", "provider"] as const) {
    if (typeof req.body?.[f] === "string") set[f] = req.body[f];
  }
  if (Array.isArray(req.body?.countries)) set["countries"] = req.body.countries.map((c: unknown) => String(c));
  if (typeof req.body?.enabled === "boolean") set["enabled"] = req.body.enabled;
  if (req.body?.sortOrder !== undefined) set["sortOrder"] = Math.round(Number(req.body.sortOrder));
  const updated = await db.update(studyPaymentMethodsTable).set(set).where(eq(studyPaymentMethodsTable.id, id)).returning();
  if (!updated[0]) {
    res.status(404).json({ error: "Payment method not found" });
    return;
  }
  await writeAudit(req, "payment_method.update", "payment_method", String(id), {});
  res.json({ paymentMethod: updated[0] });
});

// ─── Audit log ───────────────────────────────────────────────────────────────

router.get("/audit", async (_req, res) => {
  const rows = await db.select().from(studyAdminAuditLogTable).orderBy(desc(studyAdminAuditLogTable.createdAt)).limit(200);
  res.json({ audit: rows });
});

// ─── User management ─────────────────────────────────────────────────────────

router.post("/users/:id/suspend", async (req, res) => {
  const id = String(req.params.id);
  const updated = await db.update(studyUsersTable).set({ suspended: true }).where(eq(studyUsersTable.id, id)).returning({ id: studyUsersTable.id });
  if (!updated[0]) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await writeAudit(req, "user.suspend", "user", id, {});
  res.json({ ok: true });
});

router.post("/users/:id/reactivate", async (req, res) => {
  const id = String(req.params.id);
  const updated = await db.update(studyUsersTable).set({ suspended: false }).where(eq(studyUsersTable.id, id)).returning({ id: studyUsersTable.id });
  if (!updated[0]) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await writeAudit(req, "user.reactivate", "user", id, {});
  res.json({ ok: true });
});

// Create a user from the admin side (mirrors self-signup: hashed password + a
// default learner profile). Lets an admin add accounts directly.
router.post("/users", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const name = String(req.body?.name ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!email || !name) {
    res.status(400).json({ error: "email and name are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "password must be at least 8 characters" });
    return;
  }
  const existing = await db
    .select({ id: studyUsersTable.id })
    .from(studyUsersTable)
    .where(eq(studyUsersTable.email, email))
    .limit(1);
  if (existing[0]) {
    res.status(409).json({ error: "A user with that email already exists" });
    return;
  }
  const tier = ["free", "plus", "pro"].includes(req.body?.tier) ? req.body.tier : "free";
  const makeAdmin = Boolean(req.body?.isAdmin);
  const [user] = await db
    .insert(studyUsersTable)
    .values({
      email,
      name,
      passwordHash: hashPassword(password),
      subscriptionTier: tier,
      subscriptionStatus: tier === "free" ? "free" : "active",
      isAdmin: makeAdmin,
      role: makeAdmin ? "super_admin" : "user",
    })
    .returning({ id: studyUsersTable.id, email: studyUsersTable.email });
  await db.insert(studyLearnerProfilesTable).values({
    userId: user.id,
    studyStyle: "balanced",
    preferredSessionLength: 25,
    preferredDifficulty: "mixed",
    dailyStudyMinutes: 30,
  });
  await writeAudit(req, "user.create", "user", user.id, { email, tier, isAdmin: makeAdmin });
  res.status(201).json({ user });
});

// Permanently delete a user and all their data (rows in study_* tables cascade via
// their FK onDelete). Irreversible; an admin cannot delete their own account.
router.delete("/users/:id", async (req, res) => {
  const id = String(req.params.id);
  if (req.studyUser?.id === id) {
    res.status(400).json({ error: "You cannot delete your own account" });
    return;
  }
  const deleted = await db
    .delete(studyUsersTable)
    .where(eq(studyUsersTable.id, id))
    .returning({ id: studyUsersTable.id, email: studyUsersTable.email });
  if (!deleted[0]) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await writeAudit(req, "user.delete", "user", id, { email: deleted[0].email });
  res.json({ ok: true });
});

router.post("/users/:id/set-admin", async (req, res) => {
  const id = String(req.params.id);
  const makeAdmin = Boolean(req.body?.isAdmin);
  const updated = await db
    .update(studyUsersTable)
    .set({ isAdmin: makeAdmin, role: makeAdmin ? "super_admin" : "user" })
    .where(eq(studyUsersTable.id, id))
    .returning({ id: studyUsersTable.id });
  if (!updated[0]) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await writeAudit(req, "user.set_admin", "user", id, { isAdmin: makeAdmin });
  res.json({ ok: true });
});

// Admin: directly set (comp/upgrade/downgrade) a user's plan without payment.
// tier: free | plus | pro. days: duration for a paid grant (empty/0 = indefinite).
// Grants are marked autoRenew=false, so a dated grant auto-downgrades to free when
// its period ends (the lazy-expiry reconcile in loadTeacher handles that); an
// indefinite grant (no period end) never lapses until changed here.
// Issue a one-time password reset link for a user, for an admin to pass to them
// directly. Exists because email delivery is optional on this deployment: during a
// hand-onboarded private beta an admin can unlock a locked-out user without any mail
// provider. The raw token is returned ONCE and never stored (only its hash is).
router.post("/users/:id/reset-link", async (req, res) => {
  const id = String(req.params.id);
  const [user] = await db
    .select({ id: studyUsersTable.id, email: studyUsersTable.email })
    .from(studyUsersTable)
    .where(eq(studyUsersTable.id, id))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { link, expiresAt } = await createResetToken(user.id, "admin");
  await writeAudit(req, "user.reset_link", "user", user.id, { email: user.email });
  res.json({ link, expiresAt, email: user.email });
});

router.post("/users/:id/set-plan", async (req, res) => {
  const id = String(req.params.id);
  const tier = req.body?.tier;
  if (!["free", "plus", "pro"].includes(tier)) {
    res.status(400).json({ error: "tier must be 'free', 'plus', or 'pro'" });
    return;
  }
  let periodEnd: Date | null = null;
  let grantDays: number | null = null;
  if (tier !== "free" && req.body?.days != null && req.body.days !== "") {
    const days = Number(req.body.days);
    if (!Number.isFinite(days) || days < 1) {
      res.status(400).json({ error: "days must be a positive number, or empty for indefinite" });
      return;
    }
    grantDays = Math.round(days);
    periodEnd = new Date(Date.now() + grantDays * 24 * 60 * 60 * 1000);
  }
  const updated = await db
    .update(studyUsersTable)
    .set({
      subscriptionTier: tier,
      subscriptionStatus: tier === "free" ? "free" : "active",
      subscriptionCurrentPeriodEnd: tier === "free" ? null : periodEnd,
      autoRenew: false,
    })
    .where(eq(studyUsersTable.id, id))
    .returning({ id: studyUsersTable.id, email: studyUsersTable.email });
  if (!updated[0]) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await writeAudit(req, "user.set_plan", "user", id, { tier, days: grantDays });
  res.json({ ok: true, tier, subscriptionCurrentPeriodEnd: periodEnd?.toISOString() ?? null });
});

// ─── Impersonation ───────────────────────────────────────────────────────────

// Become another user: mint a fresh session as the target and swap the session
// cookie, stashing the admin's own token in a second cookie so it can be restored
// via POST /auth/stop-impersonating. The admin sees exactly what the learner sees.
router.post("/users/:id/impersonate", async (req, res) => {
  const targetId = String(req.params.id);
  if (req.studyUser?.id === targetId) {
    res.status(400).json({ error: "You are already yourself" });
    return;
  }
  const target = await db
    .select({ id: studyUsersTable.id })
    .from(studyUsersTable)
    .where(eq(studyUsersTable.id, targetId))
    .limit(1);
  if (!target[0]) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const adminToken = (req.cookies as Record<string, string> | undefined)?.[STUDY_SESSION_COOKIE];
  const token = newSessionToken();
  await db.insert(studySessionsTable).values({ token, userId: targetId, expiresAt: studySessionExpiry() });
  if (adminToken) res.cookie(STUDY_IMPERSONATOR_COOKIE, adminToken, sessionCookieOptions());
  res.cookie(STUDY_SESSION_COOKIE, token, sessionCookieOptions());
  await writeAudit(req, "user.impersonate", "user", targetId, {});
  res.json({ ok: true });
});

// ─── Developer API keys ──────────────────────────────────────────────────────

function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const plaintext = `sk_live_${randomBytes(24).toString("base64url")}`;
  const hash = createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, hash, prefix: plaintext.slice(0, 14) };
}

router.get("/api-keys", async (req, res) => {
  const rows = await db
    .select({
      id: studyApiKeysTable.id,
      name: studyApiKeysTable.name,
      prefix: studyApiKeysTable.prefix,
      lastUsedAt: studyApiKeysTable.lastUsedAt,
      revokedAt: studyApiKeysTable.revokedAt,
      createdAt: studyApiKeysTable.createdAt,
    })
    .from(studyApiKeysTable)
    .where(eq(studyApiKeysTable.ownerId, req.studyUser?.id ?? ""))
    .orderBy(desc(studyApiKeysTable.createdAt));
  res.json({ apiKeys: rows });
});

router.post("/api-keys", async (req, res) => {
  const name = String(req.body?.name ?? "").trim() || "Untitled key";
  const { plaintext, hash, prefix } = generateApiKey();
  const [row] = await db
    .insert(studyApiKeysTable)
    .values({ ownerId: req.studyUser?.id ?? "", name, keyHash: hash, prefix })
    .returning({
      id: studyApiKeysTable.id,
      name: studyApiKeysTable.name,
      prefix: studyApiKeysTable.prefix,
      createdAt: studyApiKeysTable.createdAt,
    });
  await writeAudit(req, "api_key.create", "api_key", String(row?.id ?? ""), { name });
  // Return the plaintext ONCE; only its hash is stored.
  res.status(201).json({ key: plaintext, apiKey: row });
});

router.delete("/api-keys/:id", async (req, res) => {
  const id = Number(req.params.id);
  const updated = await db
    .update(studyApiKeysTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(studyApiKeysTable.id, id), eq(studyApiKeysTable.ownerId, req.studyUser?.id ?? "")))
    .returning({ id: studyApiKeysTable.id });
  if (!updated[0]) {
    res.status(404).json({ error: "Key not found" });
    return;
  }
  await writeAudit(req, "api_key.revoke", "api_key", String(id), {});
  res.json({ ok: true });
});

// ─── Ambassador referrals ────────────────────────────────────────────────────

// Who signed up via one ambassador's link: each referred customer with signup date,
// plan, engagement, and referral status. (Ambassador list, balances, payouts, events
// and settings live in admin.ts; this fills in the per-ambassador customer roster.)
router.get("/ambassadors/:id/referrals", async (req, res) => {
  const id = String(req.params.id);
  const result = await db.execute(sql`
    SELECT r.id AS referral_id, r.status, r.attributed_at, r.first_paid_at,
      u.id AS user_id, u.email, u.name, u.subscription_tier, u.subscription_status,
      u.created_at AS signed_up_at, u.last_active_at,
      (${PAID}) AS is_paid,
      (SELECT count(*) FROM study_activity_sessions s WHERE s.user_id = u.id)::int AS session_count,
      (SELECT coalesce(sum(extract(epoch FROM (s.last_seen_at - s.started_at))), 0)::float8 FROM study_activity_sessions s WHERE s.user_id = u.id) AS total_time_seconds
    FROM study_referrals r
    JOIN study_users u ON u.id = r.customer_id
    WHERE r.ambassador_id = ${id}
    ORDER BY r.attributed_at DESC NULLS LAST
  `);
  res.json({ referrals: result.rows ?? [] });
});

export default router;
