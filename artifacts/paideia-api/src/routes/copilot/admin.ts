import { Router, type IRouter, type RequestHandler } from "express";
import { z } from "zod";
import {
  db,
  teachersTable,
  sessionsTable,
  studentSessionsTable,
  classesTable,
  studentsTable,
  lessonPlansTable,
  worksheetsTable,
  quizzesTable,
  parentDraftsTable,
  assignmentsTable,
  submissionsTable,
  pilotRequestsTable,
  analyticsEventsTable,
  aiUsageTable,
} from "@workspace/paideia-db";
import { mintPasswordReset, serialiseTeacher } from "./auth.js";
import { SESSION_COOKIE, STUDENT_SESSION_COOKIE, SESSION_TTL_DAYS } from "../../lib/auth.js";
import { sql, desc, eq, asc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/auth.js";

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env["NODE_ENV"] === "production",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

const router: IRouter = Router();

function adminEmails(): Set<string> {
  return new Set(
    (process.env["ADMIN_EMAILS"] ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

const requireAdmin: RequestHandler = (req, res, next) => {
  const real = req.impersonator ?? req.teacher;
  if (!real) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  if (!adminEmails().has(real.email.toLowerCase())) {
    res.status(403).json({ error: "Admin access only" });
    return;
  }
  next();
};

// ── Impersonation routes ────────────────────────────
router.post("/impersonate/teacher/:id", requireAuth, requireAdmin, async (req, res) => {
  const rawId = req.params["id"];
  const id = (typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "") as string;
  if (!id) {
    res.status(400).json({ error: "Missing teacher id" });
    return;
  }
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) {
    res.status(401).json({ error: "No session" });
    return;
  }
  const targetRows = await db.select().from(teachersTable).where(eq(teachersTable.id, id)).limit(1);
  if (targetRows.length === 0) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  await db.update(sessionsTable).set({ impersonatedTeacherId: id }).where(eq(sessionsTable.token, token));
  const [target] = targetRows;
  const { passwordHash: _ph, ...safe } = target;
  res.json({ teacher: safe });
});

router.post("/impersonate/student/:id", requireAuth, requireAdmin, async (req, res) => {
  const rawId = req.params["id"];
  const id = (typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "") as string;
  if (!id) {
    res.status(400).json({ error: "Missing student id" });
    return;
  }
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) {
    res.status(401).json({ error: "No session" });
    return;
  }
  const targetRows = await db.select().from(studentsTable).where(eq(studentsTable.id, id)).limit(1);
  if (targetRows.length === 0) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  const target = targetRows[0];
  // If admin isn't already in a student session, create a fresh one.
  // If already has one, just update the impersonated id.
  const existing = await db
    .select()
    .from(studentSessionsTable)
    .where(eq(studentSessionsTable.token, token))
    .limit(1);
  if (existing.length > 0) {
    await db.update(studentSessionsTable).set({ impersonatedStudentId: id }).where(eq(studentSessionsTable.token, token));
  } else {
    await db.insert(studentSessionsTable).values({
      token,
      studentId: target.id,
      impersonatedStudentId: id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  }
  // Set the student session cookie so the admin browser becomes this student too
  res.cookie(STUDENT_SESSION_COOKIE, token, cookieOpts());
  const { passwordHash: _ph, ...safe } = target;
  res.json({ student: safe });
});

router.post("/impersonate/stop", requireAuth, requireAdmin, async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (token) {
    await db.update(sessionsTable).set({ impersonatedTeacherId: null }).where(eq(sessionsTable.token, token));
  }
  const studentToken = req.cookies?.[STUDENT_SESSION_COOKIE] as string | undefined;
  if (studentToken) {
    await db.update(studentSessionsTable).set({ impersonatedStudentId: null }).where(eq(studentSessionsTable.token, studentToken));
    res.clearCookie(STUDENT_SESSION_COOKIE, { path: "/" });
  }
  res.json({ ok: true });
});

router.get("/impersonate/status", requireAuth, (req, res) => {
  res.json({
    teacher: req.teacher ? serialiseTeacher(req.teacher) : null,
    impersonator: req.impersonator ? serialiseTeacher(req.impersonator) : null,
  });
});

router.use(requireAuth, requireAdmin);

interface Row {
  [k: string]: unknown;
}

router.get("/stats", async (_req, res) => {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const fourWeeksAgo = new Date(now - 28 * 24 * 60 * 60 * 1000);
  const twelveWeeksAgo = new Date(now - 12 * 7 * 24 * 60 * 60 * 1000);

  const [
    teachers,
    classes,
    students,
    lessonPlans,
    worksheets,
    quizzes,
    parentDrafts,
    assignments,
    submissions,
    pilotRequestsCount,
    activeTeachersRows,
    activeTeachersTodayRows,
    eventCountRows,
    aiCostRows,
  ] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(teachersTable),
    db.select({ c: sql<number>`count(*)::int` }).from(classesTable),
    db.select({ c: sql<number>`count(*)::int` }).from(studentsTable),
    db.select({ c: sql<number>`count(*)::int` }).from(lessonPlansTable),
    db.select({ c: sql<number>`count(*)::int` }).from(worksheetsTable),
    db.select({ c: sql<number>`count(*)::int` }).from(quizzesTable),
    db.select({ c: sql<number>`count(*)::int` }).from(parentDraftsTable),
    db.select({ c: sql<number>`count(*)::int` }).from(assignmentsTable),
    db.select({ c: sql<number>`count(*)::int` }).from(submissionsTable),
    db.select({ c: sql<number>`count(*)::int` }).from(pilotRequestsTable),
    db.execute(sql`
      SELECT COUNT(DISTINCT teacher_id)::int AS c FROM (
        SELECT teacher_id FROM copilot_lesson_plans WHERE created_at >= ${weekAgo}
        UNION ALL
        SELECT teacher_id FROM copilot_worksheets WHERE created_at >= ${weekAgo}
        UNION ALL
        SELECT teacher_id FROM copilot_quizzes WHERE created_at >= ${weekAgo}
        UNION ALL
        SELECT teacher_id FROM copilot_parent_drafts WHERE created_at >= ${weekAgo}
        UNION ALL
        SELECT teacher_id FROM copilot_assignments WHERE created_at >= ${weekAgo}
        UNION ALL
        SELECT teacher_id FROM copilot_events WHERE occurred_at >= ${weekAgo} AND teacher_id IS NOT NULL
      ) AS activity
    `),
    db.execute(sql`
      SELECT COUNT(DISTINCT teacher_id)::int AS c FROM copilot_events
      WHERE occurred_at >= ${dayAgo} AND teacher_id IS NOT NULL
    `),
    db.select({ c: sql<number>`count(*)::int` }).from(analyticsEventsTable),
    db.execute(sql`
      SELECT
        COALESCE(SUM(cost_micros_usd), 0)::bigint AS micros,
        COALESCE(SUM(total_tokens), 0)::bigint AS tokens,
        COUNT(*)::int AS calls
      FROM copilot_ai_usage
    `),
  ]);

  const activeTeachersThisWeek = Number((activeTeachersRows.rows?.[0] as Row | undefined)?.["c"] ?? 0);
  const activeTeachersToday = Number((activeTeachersTodayRows.rows?.[0] as Row | undefined)?.["c"] ?? 0);
  const aiCostMicros = Number((aiCostRows.rows?.[0] as Row | undefined)?.["micros"] ?? 0);
  const aiTokens = Number((aiCostRows.rows?.[0] as Row | undefined)?.["tokens"] ?? 0);
  const aiCalls = Number((aiCostRows.rows?.[0] as Row | undefined)?.["calls"] ?? 0);

  // Weekly resource activity (last 4 weeks) - kept for overview tab
  const weekly = await db.execute(sql`
    WITH weeks AS (
      SELECT generate_series(
        date_trunc('week', ${fourWeeksAgo}::timestamp),
        date_trunc('week', now()),
        interval '1 week'
      ) AS week_start
    )
    SELECT
      w.week_start,
      COALESCE(t.c, 0)::int AS teachers,
      COALESCE(r.c, 0)::int AS resources,
      COALESCE(s.c, 0)::int AS submissions
    FROM weeks w
    LEFT JOIN (
      SELECT date_trunc('week', created_at) AS wk, COUNT(*)::int AS c
      FROM copilot_teachers GROUP BY wk
    ) t ON t.wk = w.week_start
    LEFT JOIN (
      SELECT wk, SUM(c)::int AS c FROM (
        SELECT date_trunc('week', created_at) AS wk, COUNT(*)::int AS c FROM copilot_lesson_plans GROUP BY 1
        UNION ALL
        SELECT date_trunc('week', created_at), COUNT(*)::int FROM copilot_worksheets GROUP BY 1
        UNION ALL
        SELECT date_trunc('week', created_at), COUNT(*)::int FROM copilot_quizzes GROUP BY 1
        UNION ALL
        SELECT date_trunc('week', created_at), COUNT(*)::int FROM copilot_parent_drafts GROUP BY 1
      ) u GROUP BY wk
    ) r ON r.wk = w.week_start
    LEFT JOIN (
      SELECT date_trunc('week', submitted_at) AS wk, COUNT(*)::int AS c
      FROM copilot_submissions GROUP BY wk
    ) s ON s.wk = w.week_start
    ORDER BY w.week_start ASC
  `);
  const weeklyActivity = (weekly.rows as Array<Row>).map((r) => ({
    weekStart: new Date(r["week_start"] as string | Date).toISOString(),
    teachers: Number(r["teachers"] ?? 0),
    resources: Number(r["resources"] ?? 0),
    submissions: Number(r["submissions"] ?? 0),
  }));

  // Daily active users (last 30 days), based on events
  const dailyActive = await db.execute(sql`
    WITH days AS (
      SELECT generate_series(
        date_trunc('day', ${thirtyDaysAgo}::timestamp),
        date_trunc('day', now()),
        interval '1 day'
      ) AS day
    )
    SELECT
      d.day,
      COALESCE(t.c, 0)::int AS active_teachers,
      COALESCE(a.c, 0)::int AS sessions
    FROM days d
    LEFT JOIN (
      SELECT date_trunc('day', occurred_at) AS day, COUNT(DISTINCT teacher_id)::int AS c
      FROM copilot_events WHERE teacher_id IS NOT NULL GROUP BY 1
    ) t ON t.day = d.day
    LEFT JOIN (
      SELECT date_trunc('day', occurred_at) AS day, COUNT(DISTINCT session_id)::int AS c
      FROM copilot_events WHERE session_id IS NOT NULL GROUP BY 1
    ) a ON a.day = d.day
    ORDER BY d.day ASC
  `);
  const dailyActivity = (dailyActive.rows as Array<Row>).map((r) => ({
    day: new Date(r["day"] as string | Date).toISOString(),
    activeTeachers: Number(r["active_teachers"] ?? 0),
    sessions: Number(r["sessions"] ?? 0),
  }));

  // Weekly active users (last 12 weeks)
  const weeklyActive = await db.execute(sql`
    WITH weeks AS (
      SELECT generate_series(
        date_trunc('week', ${twelveWeeksAgo}::timestamp),
        date_trunc('week', now()),
        interval '1 week'
      ) AS week_start
    )
    SELECT
      w.week_start,
      COALESCE(t.c, 0)::int AS active_teachers
    FROM weeks w
    LEFT JOIN (
      SELECT date_trunc('week', occurred_at) AS wk, COUNT(DISTINCT teacher_id)::int AS c
      FROM copilot_events WHERE teacher_id IS NOT NULL GROUP BY 1
    ) t ON t.wk = w.week_start
    ORDER BY w.week_start ASC
  `);
  const weeklyActiveTeachers = (weeklyActive.rows as Array<Row>).map((r) => ({
    weekStart: new Date(r["week_start"] as string | Date).toISOString(),
    activeTeachers: Number(r["active_teachers"] ?? 0),
  }));

  // Signup funnel: signups -> first resource -> returned 2nd week
  const funnel = await db.execute(sql`
    WITH t AS (
      SELECT id, created_at FROM copilot_teachers
    ), first_resource AS (
      SELECT teacher_id, MIN(created_at) AS first_at FROM (
        SELECT teacher_id, created_at FROM copilot_lesson_plans
        UNION ALL SELECT teacher_id, created_at FROM copilot_worksheets
        UNION ALL SELECT teacher_id, created_at FROM copilot_quizzes
        UNION ALL SELECT teacher_id, created_at FROM copilot_parent_drafts
      ) x GROUP BY teacher_id
    )
    SELECT
      (SELECT COUNT(*)::int FROM t) AS signups,
      (SELECT COUNT(*)::int FROM first_resource) AS created_resource,
      (SELECT COUNT(*)::int FROM first_resource fr
        JOIN t ON t.id = fr.teacher_id
        WHERE fr.first_at >= t.created_at + interval '7 days') AS returned_after_week
  `);
  const f = funnel.rows[0] as Row | undefined;
  const signupFunnel = {
    signups: Number(f?.["signups"] ?? 0),
    createdResource: Number(f?.["created_resource"] ?? 0),
    returnedAfterWeek: Number(f?.["returned_after_week"] ?? 0),
  };

  // Recent signups + recent pilot requests
  const recentSignups = await db
    .select({
      id: teachersTable.id,
      name: teachersTable.name,
      email: teachersTable.email,
      schoolName: teachersTable.schoolName,
      country: teachersTable.country,
      region: teachersTable.region,
      createdAt: teachersTable.createdAt,
    })
    .from(teachersTable)
    .orderBy(desc(teachersTable.createdAt))
    .limit(20);

  res.json({
    totals: {
      teachers: teachers[0]?.c ?? 0,
      activeTeachersToday,
      activeTeachersThisWeek,
      classes: classes[0]?.c ?? 0,
      students: students[0]?.c ?? 0,
      lessonPlans: lessonPlans[0]?.c ?? 0,
      worksheets: worksheets[0]?.c ?? 0,
      quizzes: quizzes[0]?.c ?? 0,
      parentDrafts: parentDrafts[0]?.c ?? 0,
      assignments: assignments[0]?.c ?? 0,
      submissions: submissions[0]?.c ?? 0,
      pilotRequests: pilotRequestsCount[0]?.c ?? 0,
      events: eventCountRows[0]?.c ?? 0,
      aiCalls,
      aiTokens,
      aiCostUsd: aiCostMicros / 1_000_000,
    },
    weeklyActivity,
    dailyActivity,
    weeklyActiveTeachers,
    signupFunnel,
    recentSignups: recentSignups.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
  });
});

// Weekly digest: this 7d window vs prior 7d window
router.get("/digest", async (_req, res) => {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  async function windowStats(from: Date, to: Date) {
    const [signups, pilots, plans, sheets, quizzes, drafts, assigns, subs, active, ai, events] =
      await Promise.all([
        db.execute(sql`SELECT COUNT(*)::int AS c FROM copilot_teachers WHERE created_at >= ${from} AND created_at < ${to}`),
        db.execute(sql`SELECT COUNT(*)::int AS c FROM copilot_pilot_requests WHERE created_at >= ${from} AND created_at < ${to}`),
        db.execute(sql`SELECT COUNT(*)::int AS c FROM copilot_lesson_plans WHERE created_at >= ${from} AND created_at < ${to}`),
        db.execute(sql`SELECT COUNT(*)::int AS c FROM copilot_worksheets WHERE created_at >= ${from} AND created_at < ${to}`),
        db.execute(sql`SELECT COUNT(*)::int AS c FROM copilot_quizzes WHERE created_at >= ${from} AND created_at < ${to}`),
        db.execute(sql`SELECT COUNT(*)::int AS c FROM copilot_parent_drafts WHERE created_at >= ${from} AND created_at < ${to}`),
        db.execute(sql`SELECT COUNT(*)::int AS c FROM copilot_assignments WHERE created_at >= ${from} AND created_at < ${to}`),
        db.execute(sql`SELECT COUNT(*)::int AS c FROM copilot_submissions WHERE submitted_at >= ${from} AND submitted_at < ${to}`),
        db.execute(sql`
          SELECT COUNT(DISTINCT teacher_id)::int AS c FROM (
            SELECT teacher_id FROM copilot_lesson_plans WHERE created_at >= ${from} AND created_at < ${to}
            UNION ALL SELECT teacher_id FROM copilot_worksheets WHERE created_at >= ${from} AND created_at < ${to}
            UNION ALL SELECT teacher_id FROM copilot_quizzes WHERE created_at >= ${from} AND created_at < ${to}
            UNION ALL SELECT teacher_id FROM copilot_parent_drafts WHERE created_at >= ${from} AND created_at < ${to}
            UNION ALL SELECT teacher_id FROM copilot_assignments WHERE created_at >= ${from} AND created_at < ${to}
            UNION ALL SELECT teacher_id FROM copilot_events WHERE occurred_at >= ${from} AND occurred_at < ${to} AND teacher_id IS NOT NULL
          ) a
        `),
        db.execute(sql`
          SELECT COALESCE(SUM(cost_micros_usd),0)::bigint AS micros,
                 COALESCE(SUM(total_tokens),0)::bigint AS tokens,
                 COUNT(*)::int AS calls
          FROM copilot_ai_usage WHERE created_at >= ${from} AND created_at < ${to}
        `),
        db.execute(sql`SELECT COUNT(*)::int AS c FROM copilot_events WHERE occurred_at >= ${from} AND occurred_at < ${to}`),
      ]);
    const get = (r: { rows?: Row[] }, k: string) => Number((r.rows?.[0] as Row | undefined)?.[k] ?? 0);
    return {
      signups: get(signups, "c"),
      pilots: get(pilots, "c"),
      lessonPlans: get(plans, "c"),
      worksheets: get(sheets, "c"),
      quizzes: get(quizzes, "c"),
      parentDrafts: get(drafts, "c"),
      assignments: get(assigns, "c"),
      submissions: get(subs, "c"),
      activeTeachers: get(active, "c"),
      aiCalls: get(ai, "calls"),
      aiTokens: get(ai, "tokens"),
      aiCostUsd: get(ai, "micros") / 1_000_000,
      events: get(events, "c"),
    };
  }

  const [current, previous, topEventsRows, newPilotsRows, topTeachersRows] = await Promise.all([
    windowStats(weekAgo, now),
    windowStats(twoWeeksAgo, weekAgo),
    db.execute(sql`
      SELECT event_name AS name, surface, COUNT(*)::int AS c
      FROM copilot_events
      WHERE occurred_at >= ${weekAgo}
      GROUP BY event_name, surface
      ORDER BY c DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT id::text AS id, contact_name AS "contactName", contact_email AS "contactEmail",
             organization, school_name AS "schoolName", country, status, created_at AS "createdAt"
      FROM copilot_pilot_requests
      WHERE created_at >= ${weekAgo}
      ORDER BY created_at DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT t.id::text AS id, t.name, t.email, t.school_name AS "schoolName",
             COUNT(e.id)::int AS events
      FROM copilot_teachers t
      LEFT JOIN copilot_events e ON e.teacher_id = t.id AND e.occurred_at >= ${weekAgo}
      GROUP BY t.id, t.name, t.email, t.school_name
      HAVING COUNT(e.id) > 0
      ORDER BY events DESC LIMIT 5
    `),
  ]);

  res.json({
    windowStart: weekAgo.toISOString(),
    windowEnd: now.toISOString(),
    previousStart: twoWeeksAgo.toISOString(),
    current,
    previous,
    topEvents: (topEventsRows.rows ?? []).map((r) => ({
      name: String((r as Row)["name"] ?? ""),
      surface: ((r as Row)["surface"] as string | null) ?? null,
      count: Number((r as Row)["c"] ?? 0),
    })),
    newPilots: (newPilotsRows.rows ?? []).map((r) => {
      const row = r as Row;
      return {
        id: String(row["id"] ?? ""),
        contactName: String(row["contactName"] ?? ""),
        contactEmail: String(row["contactEmail"] ?? ""),
        organization: (row["organization"] as string | null) ?? null,
        schoolName: (row["schoolName"] as string | null) ?? null,
        country: (row["country"] as string | null) ?? null,
        status: String(row["status"] ?? "new"),
        createdAt: (row["createdAt"] as Date).toISOString(),
      };
    }),
    topTeachers: (topTeachersRows.rows ?? []).map((r) => {
      const row = r as Row;
      return {
        id: String(row["id"] ?? ""),
        name: String(row["name"] ?? ""),
        email: String(row["email"] ?? ""),
        schoolName: (row["schoolName"] as string | null) ?? null,
        events: Number(row["events"] ?? 0),
      };
    }),
  });
});

// Engagement: retention cohorts, teacher leaderboard, feature usage
router.get("/engagement", async (_req, res) => {
  const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);

  // Weekly retention cohorts: for each cohort week, percent active in weeks 0..7
  const cohorts = await db.execute(sql`
    WITH cohorts AS (
      SELECT
        id AS teacher_id,
        date_trunc('week', created_at) AS cohort_week
      FROM copilot_teachers
      WHERE created_at >= ${eightWeeksAgo}
    ), activity AS (
      SELECT DISTINCT teacher_id, date_trunc('week', occurred_at) AS active_week
      FROM copilot_events WHERE teacher_id IS NOT NULL
      UNION
      SELECT DISTINCT teacher_id, date_trunc('week', created_at) FROM copilot_lesson_plans
      UNION
      SELECT DISTINCT teacher_id, date_trunc('week', created_at) FROM copilot_worksheets
      UNION
      SELECT DISTINCT teacher_id, date_trunc('week', created_at) FROM copilot_quizzes
      UNION
      SELECT DISTINCT teacher_id, date_trunc('week', created_at) FROM copilot_parent_drafts
    )
    SELECT
      c.cohort_week,
      COUNT(DISTINCT c.teacher_id)::int AS cohort_size,
      EXTRACT(EPOCH FROM (a.active_week - c.cohort_week)) / 604800 AS weeks_since,
      COUNT(DISTINCT a.teacher_id)::int AS active
    FROM cohorts c
    LEFT JOIN activity a ON a.teacher_id = c.teacher_id AND a.active_week >= c.cohort_week
    GROUP BY c.cohort_week, weeks_since
    ORDER BY c.cohort_week DESC, weeks_since ASC
  `);

  type CohortRow = { cohort_week: string | Date; cohort_size: number; weeks_since: number | null; active: number };
  const map = new Map<string, { weekStart: string; size: number; retention: number[] }>();
  for (const raw of cohorts.rows as Array<CohortRow>) {
    const wk = new Date(raw.cohort_week).toISOString();
    const entry = map.get(wk) ?? { weekStart: wk, size: 0, retention: [] };
    entry.size = Math.max(entry.size, Number(raw.cohort_size ?? 0));
    const w = raw.weeks_since === null ? null : Math.floor(Number(raw.weeks_since));
    if (w !== null && w >= 0 && w < 8) {
      while (entry.retention.length <= w) entry.retention.push(0);
      entry.retention[w] = Number(raw.active ?? 0);
    }
    map.set(wk, entry);
  }
  const retentionCohorts = Array.from(map.values()).sort((a, b) => b.weekStart.localeCompare(a.weekStart));

  // Teacher leaderboard: total resources + events + last seen
  const leaderboard = await db.execute(sql`
    SELECT
      t.id, t.name, t.email, t.school_name, t.country, t.region, t.created_at,
      COALESCE(lp.c, 0)::int AS lesson_plans,
      COALESCE(ws.c, 0)::int AS worksheets,
      COALESCE(qz.c, 0)::int AS quizzes,
      COALESCE(pd.c, 0)::int AS parent_drafts,
      COALESCE(asg.c, 0)::int AS assignments,
      COALESCE(ev.c, 0)::int AS events,
      ev.last_seen
    FROM copilot_teachers t
    LEFT JOIN (SELECT teacher_id, COUNT(*)::int AS c FROM copilot_lesson_plans GROUP BY 1) lp ON lp.teacher_id = t.id
    LEFT JOIN (SELECT teacher_id, COUNT(*)::int AS c FROM copilot_worksheets GROUP BY 1) ws ON ws.teacher_id = t.id
    LEFT JOIN (SELECT teacher_id, COUNT(*)::int AS c FROM copilot_quizzes GROUP BY 1) qz ON qz.teacher_id = t.id
    LEFT JOIN (SELECT teacher_id, COUNT(*)::int AS c FROM copilot_parent_drafts GROUP BY 1) pd ON pd.teacher_id = t.id
    LEFT JOIN (SELECT teacher_id, COUNT(*)::int AS c FROM copilot_assignments GROUP BY 1) asg ON asg.teacher_id = t.id
    LEFT JOIN (SELECT teacher_id, COUNT(*)::int AS c, MAX(occurred_at) AS last_seen FROM copilot_events WHERE teacher_id IS NOT NULL GROUP BY 1) ev ON ev.teacher_id = t.id
    ORDER BY (COALESCE(lp.c,0) + COALESCE(ws.c,0) + COALESCE(qz.c,0) + COALESCE(pd.c,0) + COALESCE(asg.c,0)) DESC, ev.last_seen DESC NULLS LAST
    LIMIT 50
  `);
  type LbRow = Row;
  const teacherLeaderboard = (leaderboard.rows as Array<LbRow>).map((r) => ({
    id: r["id"] as string,
    name: r["name"] as string,
    email: r["email"] as string,
    schoolName: (r["school_name"] as string | null) ?? null,
    country: (r["country"] as string | null) ?? null,
    region: r["region"] as string,
    createdAt: new Date(r["created_at"] as string | Date).toISOString(),
    lessonPlans: Number(r["lesson_plans"] ?? 0),
    worksheets: Number(r["worksheets"] ?? 0),
    quizzes: Number(r["quizzes"] ?? 0),
    parentDrafts: Number(r["parent_drafts"] ?? 0),
    assignments: Number(r["assignments"] ?? 0),
    events: Number(r["events"] ?? 0),
    lastSeen: r["last_seen"] ? new Date(r["last_seen"] as string | Date).toISOString() : null,
  }));

  // Feature usage breakdown
  const featureUsage = await db.execute(sql`
    SELECT
      'lesson_plan' AS feature, COUNT(*)::int AS total, COUNT(DISTINCT teacher_id)::int AS unique_teachers FROM copilot_lesson_plans
    UNION ALL SELECT 'worksheet', COUNT(*)::int, COUNT(DISTINCT teacher_id)::int FROM copilot_worksheets
    UNION ALL SELECT 'quiz', COUNT(*)::int, COUNT(DISTINCT teacher_id)::int FROM copilot_quizzes
    UNION ALL SELECT 'parent_draft', COUNT(*)::int, COUNT(DISTINCT teacher_id)::int FROM copilot_parent_drafts
    UNION ALL SELECT 'assignment', COUNT(*)::int, COUNT(DISTINCT teacher_id)::int FROM copilot_assignments
    UNION ALL SELECT 'class', COUNT(*)::int, COUNT(DISTINCT teacher_id)::int FROM copilot_classes
    ORDER BY total DESC
  `);
  const features = (featureUsage.rows as Array<Row>).map((r) => ({
    feature: r["feature"] as string,
    total: Number(r["total"] ?? 0),
    uniqueTeachers: Number(r["unique_teachers"] ?? 0),
  }));

  res.json({ retentionCohorts, teacherLeaderboard, featureUsage: features });
});

// Product analytics: top events, top pages, click attribution
router.get("/product", async (_req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [topEvents, topPagesApp, topPagesSite, surfaceBreakdown] = await Promise.all([
    db.execute(sql`
      SELECT event_name, surface, COUNT(*)::int AS c, COUNT(DISTINCT COALESCE(teacher_id::text, anonymous_id))::int AS unique_users
      FROM copilot_events
      WHERE occurred_at >= ${thirtyDaysAgo}
      GROUP BY event_name, surface
      ORDER BY c DESC
      LIMIT 50
    `),
    db.execute(sql`
      SELECT path, COUNT(*)::int AS c, COUNT(DISTINCT COALESCE(teacher_id::text, anonymous_id))::int AS unique_users
      FROM copilot_events
      WHERE occurred_at >= ${thirtyDaysAgo} AND event_name = 'page_view' AND surface = 'app'
      GROUP BY path
      ORDER BY c DESC
      LIMIT 30
    `),
    db.execute(sql`
      SELECT path, COUNT(*)::int AS c, COUNT(DISTINCT anonymous_id)::int AS unique_users
      FROM copilot_events
      WHERE occurred_at >= ${thirtyDaysAgo} AND event_name = 'page_view' AND surface = 'site'
      GROUP BY path
      ORDER BY c DESC
      LIMIT 30
    `),
    db.execute(sql`
      SELECT surface, COUNT(*)::int AS c, COUNT(DISTINCT COALESCE(teacher_id::text, anonymous_id))::int AS unique_users
      FROM copilot_events
      WHERE occurred_at >= ${thirtyDaysAgo}
      GROUP BY surface
      ORDER BY c DESC
    `),
  ]);
  const norm = (rows: Row[]) => rows.map((r) => ({
    label: (r["event_name"] ?? r["path"] ?? r["surface"] ?? "") as string,
    surface: (r["surface"] as string) ?? null,
    count: Number(r["c"] ?? 0),
    uniqueUsers: Number(r["unique_users"] ?? 0),
  }));
  res.json({
    topEvents: norm(topEvents.rows as Row[]),
    topPagesApp: norm(topPagesApp.rows as Row[]),
    topPagesSite: norm(topPagesSite.rows as Row[]),
    surfaceBreakdown: norm(surfaceBreakdown.rows as Row[]),
  });
});

// AI usage: per-teacher breakdown, totals, daily series
router.get("/ai-usage", async (_req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totals, byTeacher, daily, byKind] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int AS calls,
        COUNT(*) FILTER (WHERE success = true)::int AS successful,
        COUNT(*) FILTER (WHERE success = false)::int AS failed,
        COALESCE(SUM(prompt_tokens), 0)::bigint AS prompt_tokens,
        COALESCE(SUM(completion_tokens), 0)::bigint AS completion_tokens,
        COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(cost_micros_usd), 0)::bigint AS cost_micros,
        COALESCE(AVG(latency_ms), 0)::int AS avg_latency_ms
      FROM copilot_ai_usage
    `),
    db.execute(sql`
      SELECT t.id, t.name, t.email, t.school_name,
        COUNT(u.id)::int AS calls,
        COALESCE(SUM(u.total_tokens), 0)::bigint AS tokens,
        COALESCE(SUM(u.cost_micros_usd), 0)::bigint AS cost_micros
      FROM copilot_ai_usage u
      LEFT JOIN copilot_teachers t ON t.id = u.teacher_id
      GROUP BY t.id, t.name, t.email, t.school_name
      ORDER BY cost_micros DESC
      LIMIT 25
    `),
    db.execute(sql`
      WITH days AS (
        SELECT generate_series(date_trunc('day', ${thirtyDaysAgo}::timestamp), date_trunc('day', now()), interval '1 day') AS day
      )
      SELECT d.day,
        COALESCE(u.calls, 0)::int AS calls,
        COALESCE(u.cost_micros, 0)::bigint AS cost_micros
      FROM days d
      LEFT JOIN (
        SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS calls, SUM(cost_micros_usd)::bigint AS cost_micros
        FROM copilot_ai_usage GROUP BY 1
      ) u ON u.day = d.day
      ORDER BY d.day ASC
    `),
    db.execute(sql`
      SELECT kind, COUNT(*)::int AS calls, COALESCE(SUM(total_tokens),0)::bigint AS tokens, COALESCE(SUM(cost_micros_usd),0)::bigint AS cost_micros
      FROM copilot_ai_usage GROUP BY kind ORDER BY cost_micros DESC
    `),
  ]);
  const tRow = (totals.rows[0] as Row | undefined) ?? {};
  const usdFromMicros = (m: unknown) => Number(m ?? 0) / 1_000_000;
  res.json({
    totals: {
      calls: Number(tRow["calls"] ?? 0),
      successful: Number(tRow["successful"] ?? 0),
      failed: Number(tRow["failed"] ?? 0),
      promptTokens: Number(tRow["prompt_tokens"] ?? 0),
      completionTokens: Number(tRow["completion_tokens"] ?? 0),
      totalTokens: Number(tRow["total_tokens"] ?? 0),
      costUsd: usdFromMicros(tRow["cost_micros"]),
      avgLatencyMs: Number(tRow["avg_latency_ms"] ?? 0),
    },
    byTeacher: (byTeacher.rows as Row[]).map((r) => ({
      id: (r["id"] as string | null) ?? null,
      name: (r["name"] as string | null) ?? "(unknown)",
      email: (r["email"] as string | null) ?? null,
      schoolName: (r["school_name"] as string | null) ?? null,
      calls: Number(r["calls"] ?? 0),
      tokens: Number(r["tokens"] ?? 0),
      costUsd: usdFromMicros(r["cost_micros"]),
    })),
    daily: (daily.rows as Row[]).map((r) => ({
      day: new Date(r["day"] as string | Date).toISOString(),
      calls: Number(r["calls"] ?? 0),
      costUsd: usdFromMicros(r["cost_micros"]),
    })),
    byKind: (byKind.rows as Row[]).map((r) => ({
      kind: r["kind"] as string,
      calls: Number(r["calls"] ?? 0),
      tokens: Number(r["tokens"] ?? 0),
      costUsd: usdFromMicros(r["cost_micros"]),
    })),
  });
});

// Lightweight inbox counter for the admin nav badge
router.get("/inbox-counts", async (_req, res) => {
  const [t] = await db.execute(sql`SELECT COUNT(*)::int AS c FROM copilot_teachers WHERE status = 'pending'`).then((r) => r.rows as Row[]);
  const [p] = await db.execute(sql`SELECT COUNT(*)::int AS c FROM copilot_pilot_requests WHERE status = 'new'`).then((r) => r.rows as Row[]);
  const [w] = await db.execute(sql`SELECT COUNT(*)::int AS c FROM copilot_paid_plan_waitlist WHERE fulfilled_at IS NULL`).then((r) => r.rows as Row[]);
  res.json({
    pendingTeachers: Number(t?.["c"] ?? 0),
    newPilots: Number(p?.["c"] ?? 0),
    waitlist: Number(w?.["c"] ?? 0),
  });
});

// Paid plan waitlist
router.get("/waitlist", async (_req, res) => {
  const rows = (await db.execute(sql`
    SELECT w.id, w.teacher_id, w.email, w.note, w.created_at, w.fulfilled_at,
           t.name AS teacher_name, t.school_name, t.country, t.region
    FROM copilot_paid_plan_waitlist w
    JOIN copilot_teachers t ON t.id = w.teacher_id
    ORDER BY w.created_at DESC
    LIMIT 500
  `)).rows as Row[];
  res.json({
    waitlist: rows.map((r) => ({
      id: String(r["id"]),
      teacherId: String(r["teacher_id"]),
      teacherName: String(r["teacher_name"]),
      email: String(r["email"]),
      schoolName: r["school_name"] ? String(r["school_name"]) : null,
      country: r["country"] ? String(r["country"]) : null,
      region: String(r["region"]),
      note: r["note"] ? String(r["note"]) : null,
      createdAt: new Date(r["created_at"] as string | Date).toISOString(),
      fulfilledAt: r["fulfilled_at"] ? new Date(r["fulfilled_at"] as string | Date).toISOString() : null,
    })),
  });
});

router.post("/waitlist/:id/fulfilled", async (req, res) => {
  const id = req.params["id"];
  if (!id) { res.status(400).json({ error: "Missing id" }); return; }
  await db.execute(sql`UPDATE copilot_paid_plan_waitlist SET fulfilled_at = NOW() WHERE id = ${id}`);
  res.json({ ok: true });
});

router.delete("/waitlist/:id/fulfilled", async (req, res) => {
  const id = req.params["id"];
  if (!id) { res.status(400).json({ error: "Missing id" }); return; }
  await db.execute(sql`UPDATE copilot_paid_plan_waitlist SET fulfilled_at = NULL WHERE id = ${id}`);
  res.json({ ok: true });
});

// Pending teachers awaiting founder approval
router.get("/pending-teachers", async (_req, res) => {
  const rows = await db
    .select({
      id: teachersTable.id,
      email: teachersTable.email,
      name: teachersTable.name,
      region: teachersTable.region,
      country: teachersTable.country,
      schoolName: teachersTable.schoolName,
      subjects: teachersTable.subjects,
      yearGroups: teachersTable.yearGroups,
      status: teachersTable.status,
      createdAt: teachersTable.createdAt,
    })
    .from(teachersTable)
    .where(eq(teachersTable.status, "pending"))
    .orderBy(desc(teachersTable.createdAt))
    .limit(200);
  res.json({
    pending: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  });
});

router.post("/teachers/:id/approve", async (req, res) => {
  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const [updated] = await db
    .update(teachersTable)
    .set({ status: "active", approvedAt: new Date(), approvedBy: req.teacher!.id })
    .where(eq(teachersTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  res.json({ ok: true });
});

router.post("/teachers/:id/suspend", async (req, res) => {
  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  await db
    .update(teachersTable)
    .set({ status: "suspended" })
    .where(eq(teachersTable.id, id));
  // Kill any active sessions so they're booted immediately.
  await db.delete(sessionsTable).where(eq(sessionsTable.teacherId, id));
  res.json({ ok: true });
});

router.post("/teachers/:id/reset-link", async (req, res) => {
  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const rows = await db
    .select({ email: teachersTable.email })
    .from(teachersTable)
    .where(eq(teachersTable.id, id))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  const { token, expiresAt } = await mintPasswordReset(id, req.teacher!.id);
  res.json({ token, expiresAt: expiresAt.toISOString(), email: rows[0].email });
});

// Pilot pipeline: pilots grouped by status, with status counts
router.get("/pilots", async (req, res) => {
  const statusFilter = typeof req.query["status"] === "string" ? req.query["status"] : null;
  const counts = await db.execute(sql`
    SELECT status, COUNT(*)::int AS c FROM copilot_pilot_requests GROUP BY status
  `);
  const list = await (statusFilter
    ? db
        .select()
        .from(pilotRequestsTable)
        .where(eq(pilotRequestsTable.status, statusFilter))
        .orderBy(desc(pilotRequestsTable.createdAt))
        .limit(200)
    : db.select().from(pilotRequestsTable).orderBy(desc(pilotRequestsTable.createdAt)).limit(200));
  res.json({
    statusCounts: (counts.rows as Row[]).map((r) => ({
      status: r["status"] as string,
      count: Number(r["c"] ?? 0),
    })),
    pilots: list.map((p) => ({
      id: p.id,
      source: p.source,
      schoolName: p.schoolName,
      country: p.country,
      organization: p.organization,
      contactName: p.contactName,
      contactEmail: p.contactEmail,
      gradeLevels: p.gradeLevels,
      message: p.message,
      status: p.status,
      notes: p.notes,
      contactedAt: p.contactedAt ? p.contactedAt.toISOString() : null,
      sourcePath: p.sourcePath,
      sourceReferrer: p.sourceReferrer,
      sourceUtm: p.sourceUtm,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
});

const pilotUpdateSchema = z.object({
  status: z.enum(["new", "contacted", "scheduled", "in_pilot", "won", "lost"]).optional(),
  notes: z.string().max(4000).optional().nullable(),
  contactedAt: z.string().datetime().optional().nullable(),
});

router.patch("/pilots/:id", async (req, res) => {
  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const parsed = pilotUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.status !== undefined) patch["status"] = parsed.data.status;
  if (parsed.data.notes !== undefined) patch["notes"] = parsed.data.notes;
  if (parsed.data.contactedAt !== undefined) {
    patch["contactedAt"] = parsed.data.contactedAt ? new Date(parsed.data.contactedAt) : null;
  } else if (parsed.data.status === "contacted") {
    patch["contactedAt"] = new Date();
  }
  const [row] = await db
    .update(pilotRequestsTable)
    .set(patch)
    .where(eq(pilotRequestsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    pilot: {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      contactedAt: row.contactedAt ? row.contactedAt.toISOString() : null,
    },
  });
});

// CSV exports
function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]!);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : v instanceof Date ? v.toISOString() : JSON.stringify(v);
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => escape(r[k])).join(","))].join("\n");
}

router.get("/export/pilots.csv", async (_req, res) => {
  const rows = await db.select().from(pilotRequestsTable).orderBy(desc(pilotRequestsTable.createdAt));
  res.type("text/csv").attachment("pilot-requests.csv").send(toCsv(rows));
});

router.get("/export/teachers.csv", async (_req, res) => {
  const rows = await db
    .select({
      id: teachersTable.id,
      email: teachersTable.email,
      name: teachersTable.name,
      region: teachersTable.region,
      country: teachersTable.country,
      schoolName: teachersTable.schoolName,
      createdAt: teachersTable.createdAt,
    })
    .from(teachersTable)
    .orderBy(desc(teachersTable.createdAt));
  res.type("text/csv").attachment("teachers.csv").send(toCsv(rows));
});

router.get("/export/events.csv", async (_req, res) => {
  const rows = await db
    .select()
    .from(analyticsEventsTable)
    .orderBy(desc(analyticsEventsTable.occurredAt))
    .limit(10000);
  res.type("text/csv").attachment("events.csv").send(toCsv(rows));
});

router.get("/export/ai-usage.csv", async (_req, res) => {
  const rows = await db
    .select()
    .from(aiUsageTable)
    .orderBy(desc(aiUsageTable.createdAt))
    .limit(10000);
  res.type("text/csv").attachment("ai-usage.csv").send(toCsv(rows));
});

router.get("/students", async (_req, res) => {
  const rows = await db
    .select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastInitial: studentsTable.lastInitial,
      email: studentsTable.email,
      joinCode: studentsTable.joinCode,
      classId: studentsTable.classId,
      teacherId: studentsTable.teacherId,
      learningStyle: studentsTable.learningStyle,
      diagnosticTakenAt: studentsTable.diagnosticTakenAt,
      createdAt: studentsTable.createdAt,
    })
    .from(studentsTable)
    .orderBy(asc(studentsTable.createdAt))
    .limit(200);
  res.json({ students: rows });
});

export default router;
