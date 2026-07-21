import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  sessionsTable,
  credentialsTable,
  submissionsTable,
  assignmentSubmissionsTable,
  assignmentsTable,
  activityEventsTable,
  gradebookAlertsTable,
  coachPlansTable,
  coursesTable,
  notificationsTable,
  coachMessagesTable,
  courseGroupsTable,
  courseGroupMembersTable,
  type StudyPlanItem,
  type CoachAssist,
} from "@workspace/db";
import { eq, and, or, desc, sql, inArray, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { isSuperAdmin, canAdministerOrg, isCoFacilitator } from "../lib/roles";
import { leaderCourseIds, coFacLeadsLearnerInCourse, canGradeInCourse, learnerIdsForCoFacilitator, type StaffUser } from "../lib/scope";
import { REASON_LABEL } from "../lib/gradebookEngine";
import { generateCoachAssist } from "../lib/coachAssist";
import { mailerConfigured, sendMail, appUrl, emailShell } from "../lib/mailer";
import { resolveEmailBrand } from "../lib/emailBrand";

const router = Router();

/**
 * Which learner ids may this staff user see? null = all (super admin). [] = none (a non-staff
 * caller, e.g. a learner, has no business on the coach surface). Used to scope coach routes that
 * previously trusted a path param and leaked cross-tenant / cross-section learner data.
 */
async function viewableLearnerIds(user: any): Promise<string[] | null> {
  if (isSuperAdmin(user.role)) return null;
  if (isCoFacilitator(user.role)) return await learnerIdsForCoFacilitator(user.id);
  if (canAdministerOrg(user.role)) {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        user.organisationId
          ? and(eq(usersTable.organisationId, user.organisationId), eq(usersTable.role, "learner"))
          : and(eq(usersTable.partnerId, user.partnerId ?? "__none__"), eq(usersTable.role, "learner")),
      );
    return rows.map((r) => r.id);
  }
  return [];
}
async function canViewLearner(user: any, learnerId: string): Promise<boolean> {
  const ids = await viewableLearnerIds(user);
  return ids === null || ids.includes(learnerId);
}

// ── Coach intervention layer ────────────────────────────────────────────────────
// Connects off-track detection + the auto-generated adaptive plan to the coach: the coach
// sees their flagged learners, works the plan with them, gets AI talking points, notes the
// intervention, nudges the learner, and marks it resolved.

type AlertRow = typeof gradebookAlertsTable.$inferSelect;

/** Shape one alert into a rich intervention item (learner + course + plan + progress). */
async function buildIntervention(a: AlertRow) {
  const [learner, course] = await Promise.all([
    db.query.usersTable.findFirst({ where: eq(usersTable.id, a.userId) }),
    db.query.coursesTable.findFirst({ where: eq(coursesTable.id, a.courseId) }),
  ]);
  let plan: null | { planId: string; rationale: string | null; items: StudyPlanItem[]; done: number; total: number } = null;
  if (a.planId) {
    const p = await db.query.coachPlansTable.findFirst({ where: eq(coachPlansTable.id, a.planId) });
    if (p) {
      const items = (Array.isArray(p.items) ? p.items : []) as StudyPlanItem[];
      plan = {
        planId: p.id,
        rationale: p.rationale,
        items,
        done: items.filter((i) => i.done).length,
        total: items.length,
      };
    }
  }
  const name = learner ? `${learner.firstName ?? ""} ${learner.lastName ?? ""}`.trim() || learner.email : "Learner";
  return {
    alertId: a.id,
    courseId: a.courseId,
    courseTitle: course?.title ?? "Course",
    userId: a.userId,
    learnerName: name,
    learnerEmail: learner?.email ?? null,
    status: a.status,
    reasons: (a.reasons || []).map((r) => REASON_LABEL[r as keyof typeof REASON_LABEL] || r),
    masteryPct: a.masteryPct != null ? Number(a.masteryPct) : null,
    plan,
    coachNote: a.coachNote,
    coachAssist: a.coachAssist,
    coachAssistAt: a.coachAssistAt?.toISOString() ?? null,
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
    notifiedAt: a.notifiedAt?.toISOString() ?? null,
    updatedAt: a.updatedAt.toISOString(),
  };
}

/** Load an alert and 403 unless the caller may act on it (super/facilitator, or the leading coach). */
async function loadActionableAlert(req: any, res: any): Promise<AlertRow | null> {
  const alert = await db.query.gradebookAlertsTable.findFirst({ where: eq(gradebookAlertsTable.id, req.params.alertId) });
  if (!alert) { res.status(404).json({ error: "Not found" }); return null; }
  const ok = await canGradeInCourse(req.dbUser as StaffUser, alert.courseId, alert.userId);
  if (!ok) { res.status(403).json({ error: "Forbidden" }); return null; }
  return alert;
}

const STATUS_RANK: Record<string, number> = { off_track: 0, at_risk: 1, on_track: 2 };

// GET /coach/interventions — the caller's flagged, unresolved learners with their plan.
router.get("/coach/interventions", requireAuth, async (req, res) => {
  const user = req.dbUser as StaffUser & { id: string; organisationId?: string | null; partnerId?: string | null };
  const flagged = await db
    .select()
    .from(gradebookAlertsTable)
    .where(and(inArray(gradebookAlertsTable.status, ["off_track", "at_risk"]), isNull(gradebookAlertsTable.resolvedAt)));

  let allowed: AlertRow[] = [];
  if (isSuperAdmin(user.role)) {
    allowed = flagged;
  } else if (canAdministerOrg(user.role)) {
    // Facilitator: learners in their org (or partner if no org).
    const learners = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        user.organisationId
          ? and(eq(usersTable.organisationId, user.organisationId), eq(usersTable.role, "learner"))
          : and(eq(usersTable.partnerId, user.partnerId!), eq(usersTable.role, "learner")),
      );
    const ids = new Set(learners.map((l) => l.id));
    allowed = flagged.filter((a) => ids.has(a.userId));
  } else if (isCoFacilitator(user.role)) {
    // Coach: alerts in a course they lead, for a learner in their section of that course.
    const led = await leaderCourseIds(user.id);
    const candidates = flagged.filter((a) => led.has(a.courseId));
    const checks = await Promise.all(candidates.map((a) => coFacLeadsLearnerInCourse(user.id, a.userId, a.courseId)));
    allowed = candidates.filter((_, i) => checks[i]);
  } else {
    res.json([]);
    return;
  }

  allowed.sort((a, b) => (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || (b.updatedAt.getTime() - a.updatedAt.getTime()));
  const items = await Promise.all(allowed.map(buildIntervention));
  res.json(items);
});

// POST /coach/interventions/:alertId/assist — generate + cache AI coaching talking points.
router.post("/coach/interventions/:alertId/assist", requireAuth, async (req, res) => {
  const alert = await loadActionableAlert(req, res);
  if (!alert) return;
  const item = await buildIntervention(alert);
  const assist = await generateCoachAssist({
    learnerName: item.learnerName,
    courseTitle: item.courseTitle,
    reasonLabels: item.reasons,
    masteryPct: item.masteryPct,
    weakAreas: [...new Set((item.plan?.items ?? []).map((i) => i.category).filter(Boolean) as string[])],
    planItems: (item.plan?.items ?? []).map((i) => ({ title: i.title, why: i.why, done: i.done })),
  });
  await db
    .update(gradebookAlertsTable)
    .set({ coachAssist: assist, coachAssistAt: new Date(), updatedAt: new Date() })
    .where(eq(gradebookAlertsTable.id, alert.id));
  res.json(assist);
});

// PATCH /coach/interventions/:alertId/note — set the coach's working note.
router.patch("/coach/interventions/:alertId/note", requireAuth, async (req, res) => {
  const alert = await loadActionableAlert(req, res);
  if (!alert) return;
  const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 4000) : null;
  await db.update(gradebookAlertsTable).set({ coachNote: note, updatedAt: new Date() }).where(eq(gradebookAlertsTable.id, alert.id));
  res.json({ coachNote: note });
});

// POST /coach/interventions/:alertId/plan/toggle — coach ticks/unticks a plan step for the learner.
router.post("/coach/interventions/:alertId/plan/toggle", requireAuth, async (req, res) => {
  const alert = await loadActionableAlert(req, res);
  if (!alert) return;
  if (!alert.planId) { res.status(400).json({ error: "No plan on this alert" }); return; }
  const idx = Number(req.body?.index);
  const plan = await db.query.coachPlansTable.findFirst({ where: eq(coachPlansTable.id, alert.planId) });
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  const items = (Array.isArray(plan.items) ? [...(plan.items as StudyPlanItem[])] : []);
  if (idx < 0 || idx >= items.length) { res.status(400).json({ error: "Bad index" }); return; }
  items[idx] = { ...items[idx], done: req.body?.done !== false };
  const allDone = items.every((i) => i.done);
  await db
    .update(coachPlansTable)
    .set({ items, status: allDone ? "completed" : "active", updatedAt: new Date() })
    .where(eq(coachPlansTable.id, plan.id));
  res.json(await buildIntervention((await db.query.gradebookAlertsTable.findFirst({ where: eq(gradebookAlertsTable.id, alert.id) }))!));
});

// POST /coach/interventions/:alertId/plan/step — coach adds a custom step to the plan.
router.post("/coach/interventions/:alertId/plan/step", requireAuth, async (req, res) => {
  const alert = await loadActionableAlert(req, res);
  if (!alert) return;
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 200) : "";
  if (!title) { res.status(400).json({ error: "Title required" }); return; }
  const why = typeof req.body?.why === "string" ? req.body.why.trim().slice(0, 400) : "Added by your coach.";
  const step: StudyPlanItem = { kind: "review", refType: null, refId: null, title, why, category: null, done: false };

  let planId = alert.planId;
  if (planId) {
    const plan = await db.query.coachPlansTable.findFirst({ where: eq(coachPlansTable.id, planId) });
    const items = [...((plan?.items as StudyPlanItem[]) ?? []), step];
    await db.update(coachPlansTable).set({ items, status: "active", updatedAt: new Date() }).where(eq(coachPlansTable.id, planId));
  } else {
    // No auto-plan existed yet — create one seeded with this step.
    const [row] = await db
      .insert(coachPlansTable)
      .values({
        userId: alert.userId,
        planDate: new Date().toISOString().slice(0, 10),
        rationale: "Your coach put together a short plan to help you catch up.",
        items: [step],
        status: "active",
        courseId: alert.courseId,
        source: "gradebook_alert",
      })
      .returning();
    planId = row.id;
    await db.update(gradebookAlertsTable).set({ planId, updatedAt: new Date() }).where(eq(gradebookAlertsTable.id, alert.id));
  }
  res.json(await buildIntervention((await db.query.gradebookAlertsTable.findFirst({ where: eq(gradebookAlertsTable.id, alert.id) }))!));
});

// POST /coach/interventions/:alertId/resolve — mark the intervention resolved (or reopen).
router.post("/coach/interventions/:alertId/resolve", requireAuth, async (req, res) => {
  const alert = await loadActionableAlert(req, res);
  if (!alert) return;
  const resolved = req.body?.resolved !== false;
  await db
    .update(gradebookAlertsTable)
    .set({ resolvedAt: resolved ? new Date() : null, updatedAt: new Date() })
    .where(eq(gradebookAlertsTable.id, alert.id));
  if (resolved && alert.planId) {
    await db.update(coachPlansTable).set({ status: "completed", updatedAt: new Date() }).where(eq(coachPlansTable.id, alert.planId));
  }
  res.json({ resolvedAt: resolved ? new Date().toISOString() : null });
});

// POST /coach/interventions/:alertId/nudge — send the learner a personalised nudge (in-app + email).
router.post("/coach/interventions/:alertId/nudge", requireAuth, async (req, res) => {
  const alert = await loadActionableAlert(req, res);
  if (!alert) return;
  const message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 2000) : "";
  if (!message) { res.status(400).json({ error: "Message required" }); return; }
  const coach = req.dbUser!;
  const coachName = `${coach.firstName ?? ""} ${coach.lastName ?? ""}`.trim() || "Your coach";
  const learner = await db.query.usersTable.findFirst({ where: eq(usersTable.id, alert.userId) });

  await db.insert(notificationsTable).values({
    userId: alert.userId,
    type: "system",
    title: `A note from ${coachName}`,
    body: message,
    link: "/grades",
    courseId: alert.courseId,
    actorId: coach.id,
  });

  let emailed = false;
  if (mailerConfigured() && learner?.email) {
    try {
      const brand = await resolveEmailBrand(learner.partnerId);
      const r = await sendMail({
        to: learner.email,
        fromName: brand.senderName ?? brand.displayName,
        subject: `A note from ${coachName}`,
        html: emailShell({
          brand,
          heading: `A note from ${coachName}`,
          bodyHtml: `${message.replace(/</g, "&lt;")}<br/><br/>Open your grades and study plan to keep going.`,
          ctaLabel: "View my plan",
          ctaUrl: appUrl("/grades"),
        }),
      });
      emailed = r.ok;
    } catch {
      /* best-effort */
    }
  }
  res.json({ sent: true, emailed });
});

// ── Coach <-> learner conversation on an intervention ───────────────────────────
const coachName = (u: { firstName: string | null; lastName: string | null; email: string } | null | undefined) =>
  u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email : "Someone";

/** The coaches leading the learner's section(s) in a course — recipients when a learner replies. */
async function sectionLeadersFor(courseId: string, learnerId: string): Promise<string[]> {
  const memberGroups = await db
    .select({ groupId: courseGroupMembersTable.groupId })
    .from(courseGroupMembersTable)
    .innerJoin(courseGroupsTable, eq(courseGroupMembersTable.groupId, courseGroupsTable.id))
    .where(and(eq(courseGroupMembersTable.userId, learnerId), eq(courseGroupsTable.courseId, courseId)));
  const gids = [...new Set(memberGroups.map((g) => g.groupId))];
  if (!gids.length) return [];
  const leaders = await db
    .select({ userId: courseGroupMembersTable.userId })
    .from(courseGroupMembersTable)
    .where(and(inArray(courseGroupMembersTable.groupId, gids), eq(courseGroupMembersTable.role, "leader")));
  return [...new Set(leaders.map((l) => l.userId))];
}

// GET /my/interventions — the caller's OWN active interventions (learner-facing), so a learner can
// find and open the conversation with their coach from /grades.
router.get("/my/interventions", requireAuth, async (req, res) => {
  const rows = await db
    .select({ a: gradebookAlertsTable, c: coursesTable })
    .from(gradebookAlertsTable)
    .leftJoin(coursesTable, eq(gradebookAlertsTable.courseId, coursesTable.id))
    .where(and(eq(gradebookAlertsTable.userId, req.userId!), isNull(gradebookAlertsTable.resolvedAt)));
  res.json(
    rows
      .filter((r) => r.a.status !== "on_track")
      .map((r) => ({ alertId: r.a.id, courseId: r.a.courseId, courseTitle: r.c?.title ?? "Course", status: r.a.status })),
  );
});

// GET /coach-thread/:alertId — the conversation. Readable by the learner it's about or a coach/
// facilitator who can act on that course.
router.get("/coach-thread/:alertId", requireAuth, async (req, res) => {
  const alert = await db.query.gradebookAlertsTable.findFirst({ where: eq(gradebookAlertsTable.id, req.params.alertId) });
  if (!alert) { res.status(404).json({ error: "Not found" }); return; }
  const me = req.dbUser!;
  const isLearner = alert.userId === me.id;
  if (!isLearner && !(await canGradeInCourse(me as StaffUser, alert.courseId, alert.userId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db
    .select({ m: coachMessagesTable, u: usersTable })
    .from(coachMessagesTable)
    .leftJoin(usersTable, eq(coachMessagesTable.fromUserId, usersTable.id))
    .where(eq(coachMessagesTable.alertId, alert.id))
    .orderBy(coachMessagesTable.createdAt);
  res.json({
    role: isLearner ? "learner" : "coach",
    messages: rows.map((r) => ({ id: r.m.id, fromRole: r.m.fromRole, fromName: coachName(r.u), body: r.m.body, createdAt: r.m.createdAt.toISOString(), mine: r.m.fromUserId === me.id })),
  });
});

// POST /coach-thread/:alertId — post a message; notifies the other party (in-app + branded email
// when the coach messages the learner).
router.post("/coach-thread/:alertId", requireAuth, async (req, res) => {
  const alert = await db.query.gradebookAlertsTable.findFirst({ where: eq(gradebookAlertsTable.id, req.params.alertId) });
  if (!alert) { res.status(404).json({ error: "Not found" }); return; }
  const me = req.dbUser!;
  const body = typeof req.body?.body === "string" ? req.body.body.trim().slice(0, 4000) : "";
  if (!body) { res.status(400).json({ error: "Message required" }); return; }
  const isLearner = alert.userId === me.id;
  if (!isLearner && !(await canGradeInCourse(me as StaffUser, alert.courseId, alert.userId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const fromRole: "coach" | "learner" = isLearner ? "learner" : "coach";
  const [msg] = await db.insert(coachMessagesTable).values({ alertId: alert.id, fromUserId: me.id, fromRole, body }).returning();

  const myName = coachName(me);
  try {
    if (fromRole === "coach") {
      await db.insert(notificationsTable).values({ userId: alert.userId, type: "system", title: `New message from ${myName}`, body: body.slice(0, 140), link: "/grades", courseId: alert.courseId, actorId: me.id });
      if (mailerConfigured()) {
        const learner = await db.query.usersTable.findFirst({ where: eq(usersTable.id, alert.userId) });
        if (learner?.email) {
          const brand = await resolveEmailBrand(learner.partnerId);
          await sendMail({ to: learner.email, fromName: brand.senderName ?? brand.displayName, subject: `New message from ${myName}`, html: emailShell({ brand, heading: `A message from ${myName}`, bodyHtml: body.replace(/</g, "&lt;"), ctaLabel: "Open my plan", ctaUrl: appUrl("/grades") }) }).catch(() => undefined);
        }
      }
    } else {
      const leaders = await sectionLeadersFor(alert.courseId, alert.userId);
      for (const lid of leaders) {
        await db.insert(notificationsTable).values({ userId: lid, type: "system", title: `${myName} replied`, body: body.slice(0, 140), link: "/coach", courseId: alert.courseId, actorId: me.id });
      }
    }
  } catch {
    /* best-effort */
  }
  res.status(201).json({ id: msg.id, fromRole, fromName: myName, body: msg.body, createdAt: msg.createdAt.toISOString(), mine: true });
});

const OFFTRACK_RANK: Record<string, number> = { off_track: 0, at_risk: 1, on_track: 2 };

// GET /coach/learners — the caller's learners with a REAL readiness signal from the gradebook.
// Scope: a coach sees only learners in the sections they lead; a facilitator sees their org/partner;
// super_admin sees all. Status + top gaps come from unresolved gradebook alerts, not a session ratio.
router.get("/coach/learners", requireAuth, async (req, res) => {
  const user = req.dbUser as StaffUser & { id: string; organisationId?: string | null; partnerId?: string | null };

  let learners: Array<typeof usersTable.$inferSelect> = [];
  if (isCoFacilitator(user.role)) {
    const ids = await learnerIdsForCoFacilitator(user.id);
    learners = ids.length ? await db.select().from(usersTable).where(inArray(usersTable.id, ids)) : [];
  } else if (isSuperAdmin(user.role)) {
    learners = await db.select().from(usersTable).where(eq(usersTable.role, "learner"));
  } else if (canAdministerOrg(user.role)) {
    learners = await db
      .select()
      .from(usersTable)
      .where(
        user.organisationId
          ? and(eq(usersTable.organisationId, user.organisationId), eq(usersTable.role, "learner"))
          : and(eq(usersTable.partnerId, user.partnerId!), eq(usersTable.role, "learner")),
      );
  } else {
    res.json([]);
    return;
  }

  const learnerIds = learners.map((l) => l.id);
  // One query for all unresolved alerts across these learners.
  const alerts = learnerIds.length
    ? await db
        .select({ userId: gradebookAlertsTable.userId, status: gradebookAlertsTable.status, reasons: gradebookAlertsTable.reasons, masteryPct: gradebookAlertsTable.masteryPct })
        .from(gradebookAlertsTable)
        .where(and(inArray(gradebookAlertsTable.userId, learnerIds), isNull(gradebookAlertsTable.resolvedAt)))
    : [];
  const alertsByUser = new Map<string, typeof alerts>();
  for (const a of alerts) {
    const arr = alertsByUser.get(a.userId) ?? [];
    arr.push(a);
    alertsByUser.set(a.userId, arr);
  }

  // Batch the two per-learner lookups into two grouped queries (was 2 queries PER learner — an
  // unbounded N+1 that fanned out to the whole platform for a super_admin).
  const credCounts = new Map<string, number>();
  const lastSeen = new Map<string, Date>();
  if (learnerIds.length) {
    const [credRows, sessRows] = await Promise.all([
      db.select({ userId: credentialsTable.userId, c: sql<number>`count(*)` })
        .from(credentialsTable).where(inArray(credentialsTable.userId, learnerIds)).groupBy(credentialsTable.userId),
      db.select({ userId: sessionsTable.userId, last: sql<Date>`max(${sessionsTable.createdAt})` })
        .from(sessionsTable).where(inArray(sessionsTable.userId, learnerIds)).groupBy(sessionsTable.userId),
    ]);
    for (const r of credRows) credCounts.set(r.userId, Number(r.c));
    for (const r of sessRows) if (r.last) lastSeen.set(r.userId, new Date(r.last as any));
  }

  const summaries = learners.map((l) => {
      const mine = alertsByUser.get(l.id) ?? [];
      // Worst current status across the learner's courses.
      const status = mine.reduce<"off_track" | "at_risk" | "on_track">(
        (worst, a) => (OFFTRACK_RANK[a.status] < OFFTRACK_RANK[worst] ? (a.status as any) : worst),
        "on_track",
      );
      const topGaps = [...new Set(mine.flatMap((a) => (a.reasons || []).map((r) => REASON_LABEL[r as keyof typeof REASON_LABEL] || r)))];
      // Readiness from mastery when we have it, else a neutral 1 for on-track learners.
      const masteries = mine.map((a) => (a.masteryPct != null ? Number(a.masteryPct) / 100 : null)).filter((v): v is number => v != null);
      const readinessScore = masteries.length ? Math.min(...masteries) : status === "on_track" ? 1 : 0.5;

      return {
        userId: l.id,
        email: l.email,
        firstName: l.firstName,
        lastName: l.lastName,
        status,
        flaggedCourses: mine.filter((a) => a.status !== "on_track").length,
        credentialsEarned: credCounts.get(l.id) ?? 0,
        lastActivityAt: lastSeen.get(l.id)?.toISOString() ?? null,
        readinessScore,
        topGaps,
      };
  });

  summaries.sort((a, b) => OFFTRACK_RANK[a.status] - OFFTRACK_RANK[b.status] || a.readinessScore - b.readinessScore);
  res.json(summaries);
});

// GET /coach/learners/:userId/presession
router.get("/coach/learners/:userId/presession", requireAuth, async (req, res) => {
  // Scope: only staff who actually oversee this learner (their section / org / partner) may read
  // their dossier. Previously any authenticated user could pull any learner's sessions + pending
  // submission text by id.
  if (!(await canViewLearner(req.dbUser!, req.params.userId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const learner = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.params.userId),
  });
  if (!learner) { res.status(404).json({ error: "Not found" }); return; }

  const recentSessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, learner.id))
    .orderBy(desc(sessionsTable.createdAt))
    .limit(5);

  const pendingWork = await db
    .select()
    .from(submissionsTable)
    .where(and(eq(submissionsTable.userId, learner.id), eq(submissionsTable.status, "submitted")));

  const completedModuleIds = recentSessions
    .filter(s => s.status === "mastered")
    .map(s => s.moduleId);

  const scores = recentSessions.map(s => Number(s.masteryScore));
  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  res.json({
    userId: learner.id,
    firstName: learner.firstName,
    strengths: completedModuleIds.length > 0 ? ["Completed modules with mastery"] : [],
    gaps: [],
    recentActivity: recentSessions.map(s => ({
      id: s.id,
      type: s.status === "mastered" ? "completion" : "enrolment",
      description: `Session ${s.status === "mastered" ? "completed with mastery" : "in progress"}`,
      userId: s.userId,
      moduleId: s.moduleId,
      createdAt: s.createdAt.toISOString(),
    })),
    completedModules: completedModuleIds,
    pendingWork: pendingWork.map(s => ({
      id: s.id,
      userId: s.userId,
      moduleId: s.moduleId,
      moduleTitle: s.moduleTitle,
      title: s.title,
      contentText: s.contentText,
      status: s.status,
      coachFeedback: s.coachFeedback,
      createdAt: s.createdAt.toISOString(),
      reviewedAt: s.reviewedAt?.toISOString() ?? null,
    })),
    avgMasteryScore: avg,
  });
});

// GET /coach/submissions
router.get("/coach/submissions", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  // Legacy module-submission work (approve/attest inline) — scoped to the caller's learners. The
  // old query returned every learner's submitted work platform-wide to any authenticated user.
  const viewIds = await viewableLearnerIds(user);
  const submissions = viewIds === null
    ? await db.select().from(submissionsTable).where(eq(submissionsTable.status, "submitted")).orderBy(desc(submissionsTable.createdAt)).limit(50)
    : viewIds.length
      ? await db.select().from(submissionsTable).where(and(eq(submissionsTable.status, "submitted"), inArray(submissionsTable.userId, viewIds))).orderBy(desc(submissionsTable.createdAt)).limit(50)
      : [];
  const legacy = submissions.map(s => ({
    id: s.id,
    userId: s.userId,
    moduleId: s.moduleId,
    moduleTitle: s.moduleTitle,
    title: s.title,
    contentText: s.contentText,
    status: s.status,
    coachFeedback: s.coachFeedback,
    createdAt: s.createdAt.toISOString(),
    reviewedAt: s.reviewedAt?.toISOString() ?? null,
    kind: "module" as const,
  }));

  // Assignment work awaiting a mark lives in assignment_submissions (a different store), which is
  // why the queue used to read 0 despite pending assignments. Surface those too, scoped to the
  // courses this coach leads (super admin sees all), and route grading to the assignment page.
  let assignmentItems: any[] = [];
  try {
    const courseIds = isSuperAdmin(user.role)
      ? null
      : [...(await leaderCourseIds(user.id))];
    if (courseIds === null || courseIds.length > 0) {
      const pending = await db
        .select({
          sub: assignmentSubmissionsTable,
          aTitle: assignmentsTable.title,
          aCourse: assignmentsTable.courseId,
        })
        .from(assignmentSubmissionsTable)
        .innerJoin(assignmentsTable, eq(assignmentSubmissionsTable.assignmentId, assignmentsTable.id))
        .where(
          courseIds === null
            ? inArray(assignmentSubmissionsTable.status, ["submitted", "late"])
            : and(inArray(assignmentSubmissionsTable.status, ["submitted", "late"]), inArray(assignmentsTable.courseId, courseIds)),
        )
        .orderBy(desc(assignmentSubmissionsTable.submittedAt))
        .limit(50);
      assignmentItems = pending.map(({ sub, aTitle, aCourse }) => ({
        id: sub.id,
        userId: sub.userId,
        moduleId: null,
        moduleTitle: aTitle,
        title: aTitle,
        contentText: sub.parsedText ?? sub.body ?? "",
        status: "submitted",
        coachFeedback: null,
        createdAt: (sub.submittedAt ?? sub.createdAt)?.toISOString?.() ?? new Date().toISOString(),
        reviewedAt: null,
        kind: "assignment" as const,
        assignmentId: sub.assignmentId,
        courseId: aCourse,
      }));
    }
  } catch {
    /* best-effort; legacy queue still returns */
  }

  res.json([...assignmentItems, ...legacy]);
});

// PATCH /coach/submissions/:submissionId
router.patch("/coach/submissions/:submissionId", requireAuth, async (req, res) => {
  const { status, feedback } = req.body;
  // Only staff who oversee the submitting learner may grade/attest. Previously ANY authenticated
  // user (including a learner) could approve any submission and stamp themselves as the coach —
  // and module attestations feed credential issuance.
  const existing = await db.query.submissionsTable.findFirst({ where: eq(submissionsTable.id, req.params.submissionId) });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canViewLearner(req.dbUser!, existing.userId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const [updated] = await db
    .update(submissionsTable)
    .set({ status, coachFeedback: feedback, coachId: req.userId, reviewedAt: new Date() })
    .where(eq(submissionsTable.id, req.params.submissionId))
    .returning();
  res.json({
    id: updated.id,
    userId: updated.userId,
    moduleId: updated.moduleId,
    moduleTitle: updated.moduleTitle,
    title: updated.title,
    contentText: updated.contentText,
    status: updated.status,
    coachFeedback: updated.coachFeedback,
    createdAt: updated.createdAt.toISOString(),
    reviewedAt: updated.reviewedAt?.toISOString() ?? null,
  });
});

export default router;
