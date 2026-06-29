import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { requireAdmin, isAdminUser } from "../lib/requireAdmin";
import { requireRole, logAdminAction, getUserRole, isValidRole } from "../lib/roles";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// GET /admin/me - any authenticated user can check their admin status
router.get("/admin/me", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const admin = await isAdminUser(userId);
  const role = await getUserRole(userId);
  res.json({ isAdmin: admin, role });
});

// GET /admin/overview - high level totals
router.get("/admin/overview", requireAuth, requireAdmin, async (_req, res) => {
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM users)::int AS total_users,
      (SELECT count(*) FROM users WHERE created_at >= now() - interval '1 day')::int AS new_users_today,
      (SELECT count(*) FROM users WHERE created_at >= now() - interval '7 days')::int AS new_users_7d,
      (SELECT count(*) FROM users WHERE created_at >= now() - interval '30 days')::int AS new_users_30d,
      (SELECT count(*) FROM users WHERE assessment_complete = true)::int AS assessments_complete,
      (SELECT count(*) FROM users WHERE last_seen_at >= now() - interval '1 day')::int AS active_users_today,
      (SELECT count(*) FROM users WHERE last_seen_at >= now() - interval '7 days')::int AS active_users_7d,
      (SELECT count(*) FROM users WHERE last_seen_at >= now() - interval '30 days')::int AS active_users_30d,
      (SELECT count(*) FROM concepts)::int AS total_concepts,
      (SELECT count(*) FROM coach_messages)::int AS total_messages,
      (SELECT count(*) FROM coach_messages WHERE role = 'user')::int AS total_user_messages,
      (SELECT count(*) FROM checkpoints)::int AS total_checkpoints,
      (SELECT coalesce(round(avg(coach_grade)::numeric, 2), 0)::float8 FROM checkpoints WHERE coach_grade IS NOT NULL) AS avg_checkpoint_grade,
      (SELECT count(*) FROM daily_plans)::int AS total_plans,
      (SELECT count(*) FROM daily_plans WHERE status = 'completed')::int AS completed_plans,
      (SELECT count(*) FROM retrospectives)::int AS total_retros,
      (SELECT count(*) FROM users WHERE subscription_tier = 'pro' AND subscription_status IN ('active','trialing'))::int AS pro_users,
      (SELECT count(*) FROM users WHERE trial_ends_at > now() AND NOT (subscription_tier = 'pro' AND subscription_status IN ('active','trialing')))::int AS trial_users,
      (SELECT count(*) FROM activity_sessions)::int AS total_sessions,
      (SELECT coalesce(sum(extract(epoch FROM (last_seen_at - started_at))), 0)::float8 FROM activity_sessions) AS total_time_seconds,
      (SELECT count(*) FROM institutions)::int AS total_institutions,
      (SELECT count(*) FROM cohorts)::int AS total_cohorts,
      (SELECT coalesce(sum(referral_count), 0)::int FROM users) AS total_referrals,
      (SELECT count(*) FROM api_keys WHERE revoked_at IS NULL)::int AS active_api_keys,
      (SELECT count(*) FROM webhooks WHERE active = true)::int AS active_webhooks
  `);
  res.json((result.rows ?? [])[0] ?? {});
});

// GET /admin/usage - daily time series for the last 30 days
router.get("/admin/usage", requireAuth, requireAdmin, async (_req, res) => {
  const result = await db.execute(sql`
    WITH days AS (
      SELECT to_char(d, 'YYYY-MM-DD') AS day
      FROM generate_series(
        (now() - interval '29 days')::date, now()::date, interval '1 day'
      ) AS d
    )
    SELECT
      days.day,
      COALESCE(m.messages, 0)::int AS messages,
      COALESCE(m.active_users, 0)::int AS active_users,
      COALESCE(u.new_users, 0)::int AS new_users,
      COALESCE(c.checkpoints, 0)::int AS checkpoints
    FROM days
    LEFT JOIN (
      SELECT to_char(created_at, 'YYYY-MM-DD') AS day,
             count(*) AS messages,
             count(DISTINCT user_id) AS active_users
      FROM coach_messages
      WHERE created_at >= now() - interval '30 days'
      GROUP BY 1
    ) m ON m.day = days.day
    LEFT JOIN (
      SELECT to_char(created_at, 'YYYY-MM-DD') AS day, count(*) AS new_users
      FROM users
      WHERE created_at >= now() - interval '30 days'
      GROUP BY 1
    ) u ON u.day = days.day
    LEFT JOIN (
      SELECT to_char(created_at, 'YYYY-MM-DD') AS day, count(*) AS checkpoints
      FROM checkpoints
      WHERE created_at >= now() - interval '30 days'
      GROUP BY 1
    ) c ON c.day = days.day
    ORDER BY days.day
  `);
  res.json(result.rows ?? []);
});

// GET /admin/breakdown - distribution of what the app is used for
router.get("/admin/breakdown", requireAuth, requireAdmin, async (_req, res) => {
  const [personalities, goals, baselines, countries, devices] = await Promise.all([
    db.execute(sql`
      SELECT coach_personality AS key, count(*)::int AS count
      FROM profiles GROUP BY coach_personality ORDER BY count DESC
    `),
    db.execute(sql`
      SELECT goal AS key, count(*)::int AS count
      FROM profiles GROUP BY goal ORDER BY count DESC
    `),
    db.execute(sql`
      SELECT baseline AS key, count(*)::int AS count
      FROM profiles GROUP BY baseline ORDER BY count DESC
    `),
    db.execute(sql`
      SELECT country AS key, count(*)::int AS count
      FROM activity_sessions WHERE country IS NOT NULL
      GROUP BY country ORDER BY count DESC LIMIT 12
    `),
    db.execute(sql`
      SELECT device AS key, count(*)::int AS count
      FROM activity_sessions WHERE device IS NOT NULL
      GROUP BY device ORDER BY count DESC LIMIT 12
    `),
  ]);
  res.json({
    personalities: personalities.rows ?? [],
    goals: goals.rows ?? [],
    baselines: baselines.rows ?? [],
    countries: countries.rows ?? [],
    devices: devices.rows ?? [],
  });
});

// GET /admin/logins - recent login sessions: who, when, from where, on what.
router.get("/admin/logins", requireAuth, requireAdmin, async (_req, res) => {
  const result = await db.execute(sql`
    SELECT
      s.started_at,
      s.last_seen_at,
      extract(epoch FROM (s.last_seen_at - s.started_at))::int AS seconds,
      s.ip_address, s.device, s.city, s.region, s.country,
      u.email, u.name
    FROM activity_sessions s
    LEFT JOIN users u ON u.id = s.user_id
    ORDER BY s.started_at DESC
    LIMIT 100
  `);
  res.json(result.rows ?? []);
});

// GET /admin/users - per-user breakdown
router.get("/admin/users", requireAuth, requireAdmin, async (_req, res) => {
  const result = await db.execute(sql`
    SELECT
      u.id,
      u.email,
      u.name,
      u.role,
      u.created_at,
      u.assessment_complete,
      u.last_seen_at,
      u.referral_count,
      CASE
        WHEN u.subscription_tier = 'pro' AND u.subscription_status IN ('active','trialing') THEN 'pro'
        WHEN u.trial_ends_at > now() THEN 'trial'
        ELSE 'free'
      END AS plan,
      p.goal,
      p.exam_name,
      p.coach_personality,
      p.exam_date,
      p.hours_per_week,
      (SELECT count(*) FROM concepts c WHERE c.user_id = u.id)::int AS concept_count,
      (SELECT count(*) FROM concepts c WHERE c.user_id = u.id AND c.mastery >= 0.8)::int AS mastered_count,
      (SELECT coalesce(round(avg(mastery)::numeric, 2), 0)::float8 FROM concepts c WHERE c.user_id = u.id) AS avg_mastery,
      (SELECT count(*) FROM coach_messages m WHERE m.user_id = u.id)::int AS message_count,
      (SELECT count(*) FROM checkpoints ch WHERE ch.user_id = u.id)::int AS checkpoint_count,
      (SELECT coalesce(round(avg(coach_grade)::numeric, 2), 0)::float8 FROM checkpoints ch WHERE ch.user_id = u.id AND ch.coach_grade IS NOT NULL) AS avg_grade,
      (SELECT count(*) FROM daily_plans dp WHERE dp.user_id = u.id AND dp.status = 'completed')::int AS completed_plans,
      (SELECT count(*) FROM activity_sessions s WHERE s.user_id = u.id)::int AS session_count,
      (SELECT coalesce(sum(extract(epoch FROM (s.last_seen_at - s.started_at))), 0)::float8 FROM activity_sessions s WHERE s.user_id = u.id) AS total_time_seconds,
      (SELECT max(created_at) FROM coach_messages m WHERE m.user_id = u.id) AS last_active
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    ORDER BY u.last_seen_at DESC NULLS LAST, u.created_at DESC
    LIMIT 500
  `);
  res.json(result.rows ?? []);
});

// GET /admin/users/:id - one learner's sessions (login times + durations) + progress.
router.get("/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = String(req.params.id);

  const [profile, sessions, recentCheckpoints] = await Promise.all([
    db.execute(sql`
      SELECT
        u.id, u.email, u.name, u.created_at, u.last_seen_at, u.referral_count, u.referred_by,
        u.subscription_tier, u.subscription_status, u.trial_ends_at,
        p.goal, p.exam_name, p.exam_date, p.hours_per_week, p.baseline, p.calibration, p.coach_personality,
        (SELECT count(*) FROM concepts c WHERE c.user_id = u.id)::int AS concept_count,
        (SELECT count(*) FROM concepts c WHERE c.user_id = u.id AND c.mastery >= 0.8)::int AS mastered_count,
        (SELECT coalesce(round(avg(mastery)::numeric, 2), 0)::float8 FROM concepts c WHERE c.user_id = u.id) AS avg_mastery,
        (SELECT count(*) FROM checkpoints ch WHERE ch.user_id = u.id)::int AS checkpoint_count,
        (SELECT coalesce(round(avg(coach_grade)::numeric, 2), 0)::float8 FROM checkpoints ch WHERE ch.user_id = u.id AND ch.coach_grade IS NOT NULL) AS avg_grade,
        (SELECT count(*) FROM daily_plans dp WHERE dp.user_id = u.id AND dp.status = 'completed')::int AS completed_plans,
        (SELECT count(*) FROM coach_messages m WHERE m.user_id = u.id)::int AS message_count,
        (SELECT count(*) FROM activity_sessions s WHERE s.user_id = u.id)::int AS session_count,
        (SELECT coalesce(sum(extract(epoch FROM (s.last_seen_at - s.started_at))), 0)::float8 FROM activity_sessions s WHERE s.user_id = u.id) AS total_time_seconds
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = ${id}
      LIMIT 1
    `),
    db.execute(sql`
      SELECT started_at, last_seen_at,
             extract(epoch FROM (last_seen_at - started_at))::int AS seconds,
             ip_address, device, city, region, country
      FROM activity_sessions
      WHERE user_id = ${id}
      ORDER BY started_at DESC
      LIMIT 50
    `),
    db.execute(sql`
      SELECT ch.date, ch.coach_grade, ch.confidence_before, c.title AS concept
      FROM checkpoints ch
      LEFT JOIN concepts c ON c.id = ch.concept_id
      WHERE ch.user_id = ${id}
      ORDER BY ch.id DESC
      LIMIT 25
    `),
  ]);

  const row = (profile.rows ?? [])[0];
  if (!row) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    user: row,
    sessions: sessions.rows ?? [],
    recentCheckpoints: recentCheckpoints.rows ?? [],
  });
});

// GET /admin/audit - recent admin actions (moderator and above)
router.get("/admin/audit", requireAuth, requireRole("moderator"), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const result = await db.execute(sql`
    SELECT id, actor_user_id, actor_email, action, target_type, target_id, metadata, created_at
    FROM admin_audit_log
    ORDER BY id DESC
    LIMIT ${limit}
  `);
  res.json({ entries: result.rows ?? [] });
});

// POST /admin/users/:id/role - change a user's admin role (super_admin only)
router.post("/admin/users/:id/role", requireAuth, requireRole("super_admin"), async (req, res) => {
  const targetId = String(req.params.id);
  const role = String((req.body?.role ?? "")).trim();
  if (!isValidRole(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }
  const actorId = (req as any).userId as string;
  const prev = await getUserRole(targetId);
  const updated = await db.execute(sql`
    UPDATE users SET role = ${role} WHERE id = ${targetId} RETURNING id
  `);
  if (!(updated.rows ?? []).length) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await logAdminAction({
    actorUserId: actorId,
    action: "role.set",
    targetType: "user",
    targetId,
    metadata: { from: prev, to: role },
  });
  res.json({ ok: true, role });
});

export default router;
