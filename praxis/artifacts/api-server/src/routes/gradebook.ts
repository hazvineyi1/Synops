import { Router } from "express";
import { db } from "@workspace/db";
import {
  gradebookItemsTable,
  gradebookCellsTable,
  gradebookAlertsTable,
  gradebookEntriesTable,
  assignmentsTable,
  assignmentSubmissionsTable,
  usersTable,
  enrolmentsTable,
  coursesTable,
  courseGroupMembersTable,
  coachPlansTable,
  interactiveActivitiesTable,
  caseScenariosTable,
  caseRubricsTable,
  deliverySessionsTable,
  attendanceRecordsTable,
  modulesTable,
} from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { isSuperAdmin, isCoFacilitator, canAdministerOrg, canAccessCourse, canAccessOrg, type ScopedUser } from "../lib/roles";
import { canStaffActOnCourse, leaderCourseIds, learnerIdsForCoFacilitator, canGradeInCourse, canParticipateInCourse } from "../lib/scope";
import { partnersTable, organisationsTable, courseGroupsTable } from "@workspace/db";
import {
  getCourseColumns,
  getScoreData,
  computeLearner,
  getGradebookSettings,
  DEFAULT_BANDS,
  REASON_LABEL,
} from "../lib/gradebookEngine";
import { gradebookSettingsTable, type LetterBand } from "@workspace/db";
import { buildGradebookWorkbook, buildGradebookCsv, type GbExportReport } from "../lib/gradebookExport";
import { onGradeEvent, scanCourse } from "../lib/gradebookAlerts";
import { mailerConfigured, sendMail, appUrl, emailShell } from "../lib/mailer";

const router = Router();

type U = ScopedUser & { id: string };

async function requireStaffOnCourse(req: any, res: any, courseId: string): Promise<boolean> {
  const u = req.dbUser as U;
  const ok = await canStaffActOnCourse(u, courseId);
  if (!ok) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

/**
 * Self-heal the gradebook_entries mirror for a course. Grading writes both the submission score
 * AND a gradebook_entries row, but earlier grades (before the applyGrade upsert fix) only landed
 * on the submission — their entry row was never created because the learner enrolled after the
 * assignment existed. Reconcile: for every graded submission in this course, ensure a matching
 * entry row carries the same score. Cheap (a few small queries) and idempotent, so it can run on
 * each gradebook load and keep the grid honest without a manual backfill.
 */
async function reconcileAssignmentEntries(courseId: string): Promise<void> {
  try {
    const assignments = await db.select({ id: assignmentsTable.id, pts: assignmentsTable.pointsPossible })
      .from(assignmentsTable).where(eq(assignmentsTable.courseId, courseId));
    if (!assignments.length) return;
    const ids = assignments.map((a) => a.id);
    const ptsById = new Map(assignments.map((a) => [a.id, Number(a.pts ?? 100)]));
    const [subs, entries] = await Promise.all([
      db.select().from(assignmentSubmissionsTable).where(inArray(assignmentSubmissionsTable.assignmentId, ids)),
      db.select().from(gradebookEntriesTable).where(inArray(gradebookEntriesTable.assignmentId, ids)),
    ]);
    const entryKey = (aId: string, uId: string) => `${aId}::${uId}`;
    const entryByKey = new Map(entries.map((e) => [entryKey(e.assignmentId!, e.userId), e]));
    for (const s of subs) {
      const graded = s.status === "graded" && s.score !== null && s.score !== undefined;
      if (!graded) continue;
      const existing = entryByKey.get(entryKey(s.assignmentId, s.userId));
      const scoreStr = String(s.score);
      if (!existing) {
        await db.insert(gradebookEntriesTable).values({
          userId: s.userId, courseId, assignmentId: s.assignmentId,
          score: scoreStr, possibleScore: String(ptsById.get(s.assignmentId) ?? 100), missing: false,
        });
      } else if (existing.score === null || existing.score === undefined) {
        await db.update(gradebookEntriesTable).set({ score: scoreStr, missing: false, updatedAt: new Date() })
          .where(eq(gradebookEntriesTable.id, existing.id));
      }
    }
  } catch {
    /* best-effort; never block the gradebook render */
  }
}

// ── Unified staff matrix ──────────────────────────────────────────────────────────
// GET /courses/:courseId/gradebook?groupId=
router.get("/courses/:courseId/gradebook", requireAuth, async (req, res) => {
  const { courseId } = req.params;
  if (!(await requireStaffOnCourse(req, res, courseId))) return;
  const groupId = typeof req.query.groupId === "string" ? req.query.groupId : null;

  await reconcileAssignmentEntries(courseId);
  const columns = await getCourseColumns(courseId);
  const settings = await getGradebookSettings(courseId);

  // Roster (optionally limited to a cohort/section).
  let learnerRows: { userId: string }[];
  if (groupId) {
    learnerRows = await db
      .select({ userId: courseGroupMembersTable.userId })
      .from(courseGroupMembersTable)
      .where(and(eq(courseGroupMembersTable.groupId, groupId), eq(courseGroupMembersTable.role, "member")));
  } else {
    learnerRows = await db
      .select({ userId: enrolmentsTable.userId })
      .from(enrolmentsTable)
      .where(eq(enrolmentsTable.courseId, courseId));
  }
  let userIds = [...new Set(learnerRows.map((r) => r.userId))];

  // A Co-facilitator (coach) is limited to learners in the section(s) they lead here.
  const actor = req.dbUser as U;
  if (isCoFacilitator(actor.role)) {
    const mine = new Set(await learnerIdsForCoFacilitator(actor.id));
    userIds = userIds.filter((id) => mine.has(id));
  }

  const [users, scoreData, alerts] = await Promise.all([
    userIds.length
      ? db.select().from(usersTable).where(inArray(usersTable.id, userIds))
      : Promise.resolve([]),
    getScoreData(columns, userIds),
    userIds.length
      ? db.select().from(gradebookAlertsTable).where(eq(gradebookAlertsTable.courseId, courseId))
      : Promise.resolve([]),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const alertByUser = new Map(alerts.map((a) => [a.userId, a]));

  const learners = userIds.map((uid) => {
    const computed = computeLearner(columns, scoreData.fractions.get(uid), scoreData.notes.get(uid), false, settings);
    const u = userById.get(uid);
    const alert = alertByUser.get(uid);
    return {
      userId: uid,
      user: u ? { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email } : null,
      overallPercent: computed.overallPercent,
      band: computed.band,
      letterGrade: computed.letterGrade,
      trend: computed.trend,
      alert: alert ? { status: alert.status, reasons: alert.reasons } : { status: "on_track", reasons: [] },
      cells: computed.cells,
    };
  });

  const withScores = learners.map((l) => l.overallPercent).filter((v): v is number => v !== null);
  const classAverage = withScores.length ? Math.round(withScores.reduce((a, b) => a + b, 0) / withScores.length) : null;

  res.json({ columns, learners, classAverage, settings });
});

// ── Grading settings (weighting + letter bands) ─────────────────────────────────
// GET /courses/:courseId/gradebook/settings
router.get("/courses/:courseId/gradebook/settings", requireAuth, async (req, res) => {
  const { courseId } = req.params;
  if (!(await requireStaffOnCourse(req, res, courseId))) return;
  res.json(await getGradebookSettings(courseId));
});

// PUT /courses/:courseId/gradebook/settings
router.put("/courses/:courseId/gradebook/settings", requireAuth, async (req, res) => {
  const { courseId } = req.params;
  if (!(await requireStaffOnCourse(req, res, courseId))) return;
  const b = req.body ?? {};
  const bands: LetterBand[] = Array.isArray(b.letterBands)
    ? b.letterBands
        .filter((x: any) => x && typeof x.label === "string")
        .map((x: any) => ({ label: String(x.label).slice(0, 16), min: Math.max(0, Math.min(100, Number(x.min) || 0)) }))
    : DEFAULT_BANDS;
  const catWeights: Record<string, number> = {};
  if (b.categoryWeights && typeof b.categoryWeights === "object") {
    for (const [k, v] of Object.entries(b.categoryWeights)) {
      const n = Number(v);
      if (!Number.isNaN(n) && n >= 0) catWeights[k] = n;
    }
  }
  const values = {
    courseId,
    weightingEnabled: Boolean(b.weightingEnabled),
    summativeWeight: Math.max(0, Math.min(100, Number(b.summativeWeight ?? 100))),
    formativeWeight: Math.max(0, Math.min(100, Number(b.formativeWeight ?? 0))),
    categoryWeights: catWeights,
    lettersEnabled: Boolean(b.lettersEnabled),
    letterBands: bands.length ? bands : DEFAULT_BANDS,
    updatedBy: req.userId!,
    updatedAt: new Date(),
  };
  const existing = await db.query.gradebookSettingsTable.findFirst({ where: eq(gradebookSettingsTable.courseId, courseId) });
  if (existing) await db.update(gradebookSettingsTable).set(values).where(eq(gradebookSettingsTable.id, existing.id));
  else await db.insert(gradebookSettingsTable).values(values);
  res.json(await getGradebookSettings(courseId));
});

// ── Matrix export (Excel / CSV) ─────────────────────────────────────────────────
async function buildExportReport(actor: U, courseId: string, groupId: string | null): Promise<GbExportReport> {
  const columns = await getCourseColumns(courseId);
  const settings = await getGradebookSettings(courseId);
  const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, courseId) });

  let cohortName: string | null = null;
  let learnerRows: { userId: string }[];
  if (groupId) {
    const g = await db.query.courseGroupsTable.findFirst({ where: eq(courseGroupsTable.id, groupId) });
    cohortName = g?.name ?? null;
    learnerRows = await db.select({ userId: courseGroupMembersTable.userId }).from(courseGroupMembersTable)
      .where(and(eq(courseGroupMembersTable.groupId, groupId), eq(courseGroupMembersTable.role, "member")));
  } else {
    learnerRows = await db.select({ userId: enrolmentsTable.userId }).from(enrolmentsTable).where(eq(enrolmentsTable.courseId, courseId));
  }
  let userIds = [...new Set(learnerRows.map((r) => r.userId))];
  if (isCoFacilitator(actor.role)) {
    const mine = new Set(await learnerIdsForCoFacilitator(actor.id));
    userIds = userIds.filter((id) => mine.has(id));
  }

  const [users, scoreData] = await Promise.all([
    userIds.length ? db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : Promise.resolve([]),
    getScoreData(columns, userIds),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));

  const learners = userIds
    .map((uid) => {
      const computed = computeLearner(columns, scoreData.fractions.get(uid), scoreData.notes.get(uid), false, settings);
      const u = userById.get(uid);
      const name = [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.email || "Unknown";
      return { name, email: u?.email ?? "", cells: computed.cells, overallPercent: computed.overallPercent, letterGrade: computed.letterGrade };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    courseTitle: course?.title ?? "Course",
    cohortName,
    generatedAt: new Date().toISOString(),
    lettersEnabled: settings.lettersEnabled,
    columns: columns.map((c) => ({ key: c.key, title: c.title, category: c.category, itemType: c.itemType, pointsPossible: c.pointsPossible })),
    learners,
  };
}

const gbSlug = (s: string) => (s || "course").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "course";

// GET /courses/:courseId/gradebook/export.xlsx
router.get("/courses/:courseId/gradebook/export.xlsx", requireAuth, async (req, res) => {
  const { courseId } = req.params;
  if (!(await requireStaffOnCourse(req, res, courseId))) return;
  const groupId = typeof req.query.groupId === "string" ? req.query.groupId : null;
  const report = await buildExportReport(req.dbUser as U, courseId, groupId);
  const buf = await buildGradebookWorkbook(report);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="gradebook-${gbSlug(report.courseTitle)}.xlsx"`);
  res.end(buf);
});

// GET /courses/:courseId/gradebook/export.csv
router.get("/courses/:courseId/gradebook/export.csv", requireAuth, async (req, res) => {
  const { courseId } = req.params;
  if (!(await requireStaffOnCourse(req, res, courseId))) return;
  const groupId = typeof req.query.groupId === "string" ? req.query.groupId : null;
  const report = await buildExportReport(req.dbUser as U, courseId, groupId);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="gradebook-${gbSlug(report.courseTitle)}.csv"`);
  res.send(buildGradebookCsv(report));
});

// ── Hierarchy navigation (browse down to a course gradebook, scoped by role) ──────
// GET /gradebook/nav — the entry level for this actor.
router.get("/gradebook/nav", requireAuth, async (req, res) => {
  const u = req.dbUser as U;
  if (isSuperAdmin(u.role)) { res.json({ level: "partners" }); return; }
  if (u.role === "partner_admin") { res.json({ level: "organisations", partnerId: u.partnerId ?? null }); return; }
  if (u.role === "org_admin") { res.json({ level: "courses", organisationId: u.organisationId ?? null }); return; }
  if (isCoFacilitator(u.role)) { res.json({ level: "courses", coach: true }); return; }
  res.json({ level: "none" });
});

// Cheap health rollup from persisted gradebook_alerts (masteryPct + off-track status).
type RollupInput = { userId: string; status: string; masteryPct: string | null };
function rollup(rows: RollupInput[]) {
  const learners = new Set(rows.map((r) => r.userId));
  const off = new Set(rows.filter((r) => r.status === "off_track").map((r) => r.userId));
  const risk = new Set(rows.filter((r) => r.status === "at_risk").map((r) => r.userId));
  const m = rows.map((r) => r.masteryPct).filter((v): v is string => v != null).map(Number).filter((n) => !Number.isNaN(n));
  const avgMastery = m.length ? Math.round((m.reduce((s, x) => s + x, 0) / m.length) * 10) / 10 : null;
  return { learnersEvaluated: learners.size, offTrack: off.size, atRisk: risk.size, avgMastery };
}

// GET /gradebook/nav/partners — super_admin only.
router.get("/gradebook/nav/partners", requireAuth, async (req, res) => {
  const u = req.dbUser as U;
  if (!isSuperAdmin(u.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const [partners, orgs, alertRows] = await Promise.all([
    db.select({ id: partnersTable.id, name: partnersTable.name }).from(partnersTable).orderBy(partnersTable.name),
    db.select({ id: organisationsTable.id, partnerId: organisationsTable.partnerId }).from(organisationsTable),
    db.select({ userId: gradebookAlertsTable.userId, status: gradebookAlertsTable.status, masteryPct: gradebookAlertsTable.masteryPct, org: usersTable.organisationId })
      .from(gradebookAlertsTable).leftJoin(usersTable, eq(gradebookAlertsTable.userId, usersTable.id)),
  ]);
  const orgToPartner = new Map(orgs.map((o) => [o.id, o.partnerId]));
  const count = new Map<string, number>();
  orgs.forEach((o) => count.set(o.partnerId, (count.get(o.partnerId) ?? 0) + 1));
  const byPartner = new Map<string, RollupInput[]>();
  for (const r of alertRows) {
    const p = r.org ? orgToPartner.get(r.org) : null;
    if (!p) continue;
    if (!byPartner.has(p)) byPartner.set(p, []);
    byPartner.get(p)!.push(r);
  }
  res.json(partners.map((p) => ({ id: p.id, name: p.name, orgCount: count.get(p.id) ?? 0, ...rollup(byPartner.get(p.id) ?? []) })));
});

// GET /gradebook/nav/organisations?partnerId= — super (any/all), partner_admin (own partner).
router.get("/gradebook/nav/organisations", requireAuth, async (req, res) => {
  const u = req.dbUser as U;
  const partnerId = typeof req.query.partnerId === "string" ? req.query.partnerId : null;
  let rows;
  if (isSuperAdmin(u.role)) {
    rows = partnerId
      ? await db.select().from(organisationsTable).where(eq(organisationsTable.partnerId, partnerId))
      : await db.select().from(organisationsTable);
  } else if (u.role === "partner_admin" && u.partnerId) {
    rows = await db.select().from(organisationsTable).where(eq(organisationsTable.partnerId, u.partnerId));
  } else {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const orgIds = rows.map((o) => o.id);
  const alertRows = orgIds.length
    ? await db.select({ userId: gradebookAlertsTable.userId, status: gradebookAlertsTable.status, masteryPct: gradebookAlertsTable.masteryPct, org: usersTable.organisationId })
        .from(gradebookAlertsTable).leftJoin(usersTable, eq(gradebookAlertsTable.userId, usersTable.id)).where(inArray(usersTable.organisationId, orgIds))
    : [];
  const byOrg = new Map<string, RollupInput[]>();
  for (const r of alertRows) {
    if (!r.org) continue;
    if (!byOrg.has(r.org)) byOrg.set(r.org, []);
    byOrg.get(r.org)!.push(r);
  }
  res.json(rows.map((o) => ({ id: o.id, name: o.name, partnerId: o.partnerId, ...rollup(byOrg.get(o.id) ?? []) })));
});

// GET /gradebook/nav/courses?organisationId= — courses (with cohorts) the actor can grade.
router.get("/gradebook/nav/courses", requireAuth, async (req, res) => {
  const u = req.dbUser as U;
  const organisationId = typeof req.query.organisationId === "string" ? req.query.organisationId : null;

  let courses: (typeof coursesTable.$inferSelect)[] = [];
  if (isCoFacilitator(u.role)) {
    const led = await leaderCourseIds(u.id);
    courses = led.size ? await db.select().from(coursesTable).where(inArray(coursesTable.id, [...led])) : [];
  } else if (isSuperAdmin(u.role) || u.role === "partner_admin" || u.role === "org_admin") {
    let tenantIds: string[] | null = null; // null => super_admin, all courses
    if (organisationId) {
      const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, organisationId) });
      if (!org) { res.json([]); return; }
      if (!isSuperAdmin(u.role) && !canAccessOrg(u, org)) { res.status(403).json({ error: "Forbidden" }); return; }
      tenantIds = [org.id, org.partnerId];
    } else if (u.role === "org_admin") {
      if (!u.organisationId) { res.json([]); return; }
      const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, u.organisationId) });
      tenantIds = org ? [org.id, org.partnerId] : [u.organisationId];
    } else if (u.role === "partner_admin") {
      if (!u.partnerId) { res.json([]); return; }
      tenantIds = [u.partnerId];
    }
    courses =
      tenantIds === null
        ? await db.select().from(coursesTable)
        : tenantIds.length
          ? await db.select().from(coursesTable).where(inArray(coursesTable.tenantId, tenantIds))
          : [];
  } else {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const courseIds = courses.map((c) => c.id);
  const [groups, enrols, alertRows] = await Promise.all([
    courseIds.length ? db.select().from(courseGroupsTable).where(inArray(courseGroupsTable.courseId, courseIds)) : Promise.resolve([]),
    courseIds.length ? db.select({ courseId: enrolmentsTable.courseId, userId: enrolmentsTable.userId }).from(enrolmentsTable).where(inArray(enrolmentsTable.courseId, courseIds)) : Promise.resolve([]),
    courseIds.length ? db.select({ courseId: gradebookAlertsTable.courseId, userId: gradebookAlertsTable.userId, status: gradebookAlertsTable.status, masteryPct: gradebookAlertsTable.masteryPct }).from(gradebookAlertsTable).where(inArray(gradebookAlertsTable.courseId, courseIds)) : Promise.resolve([]),
  ]);
  const groupsByCourse = new Map<string, { id: string; name: string }[]>();
  for (const g of groups as any[]) {
    if (!groupsByCourse.has(g.courseId)) groupsByCourse.set(g.courseId, []);
    groupsByCourse.get(g.courseId)!.push({ id: g.id, name: g.name });
  }
  const learnersByCourse = new Map<string, Set<string>>();
  for (const e of enrols as any[]) {
    if (!learnersByCourse.has(e.courseId)) learnersByCourse.set(e.courseId, new Set());
    learnersByCourse.get(e.courseId)!.add(e.userId);
  }
  const alertsByCourse = new Map<string, RollupInput[]>();
  for (const r of alertRows as any[]) {
    if (!alertsByCourse.has(r.courseId)) alertsByCourse.set(r.courseId, []);
    alertsByCourse.get(r.courseId)!.push(r);
  }

  res.json(
    courses
      .map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        learnerCount: learnersByCourse.get(c.id)?.size ?? 0,
        cohorts: groupsByCourse.get(c.id) ?? [],
        ...rollup(alertsByCourse.get(c.id) ?? []),
      }))
      .sort((a, b) => a.title.localeCompare(b.title)),
  );
});

// ── Learner self-view ───────────────────────────────────────────────────────────
// GET /courses/:courseId/gradebook/me
router.get("/courses/:courseId/gradebook/me", requireAuth, async (req, res) => {
  const { courseId } = req.params;
  const userId = req.userId!;
  // Self-scoped on the ROWS, but it still exposes the course's whole column structure --
  // titles, due dates, points, grading settings -- for any courseId asked for.
  if (!(await canParticipateInCourse(req.dbUser!, courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  // Same self-heal the staff gradebook does: mirror already-graded submissions into
  // gradebook_entries so the learner's own ASSIGNMENTS rows and Overall mastery reflect grades
  // that only landed on assignment_submissions (this was why the learner saw dashes + "not
  // enough data" despite 100% scores).
  await reconcileAssignmentEntries(courseId);
  const columns = await getCourseColumns(courseId);
  const settings = await getGradebookSettings(courseId);
  const scoreData = await getScoreData(columns, [userId]);
  const computed = computeLearner(columns, scoreData.fractions.get(userId), scoreData.notes.get(userId), false, settings);

  const alert = await db.query.gradebookAlertsTable.findFirst({
    where: and(eq(gradebookAlertsTable.courseId, courseId), eq(gradebookAlertsTable.userId, userId)),
  });
  const plan = alert?.planId
    ? await db.query.coachPlansTable.findFirst({ where: eq(coachPlansTable.id, alert.planId) })
    : await db.query.coachPlansTable.findFirst({
        where: and(
          eq(coachPlansTable.userId, userId),
          eq(coachPlansTable.courseId, courseId),
          eq(coachPlansTable.source, "gradebook_alert"),
          eq(coachPlansTable.status, "active"),
        ),
        orderBy: [desc(coachPlansTable.createdAt)],
      });

  // Backward-compatible flat grade list (consumed by the CourseDetail gradebook tab).
  const grades = columns.map((c) => {
    const cell = computed.cells[c.key];
    return {
      assignmentId: c.sourceId ?? c.key,
      assignmentTitle: c.title,
      dueDate: c.dueDate,
      pointsPossible: c.pointsPossible,
      score: cell?.earned == null ? null : Math.round(cell.earned * 10) / 10,
      letterGrade: null,
      excused: false,
      missing: (cell?.fraction ?? null) === null,
      late: false,
    };
  });
  let totalEarned = 0;
  let totalPossible = 0;
  for (const c of columns) {
    if (!c.includeInGrade || c.itemType !== "summative") continue;
    const cell = computed.cells[c.key];
    if (cell?.fraction == null) continue;
    totalEarned += cell.earned ?? 0;
    totalPossible += c.pointsPossible;
  }

  res.json({
    columns,
    grades,
    totalEarned: Math.round(totalEarned * 10) / 10,
    totalPossible: Math.round(totalPossible * 10) / 10,
    overallPercent: computed.overallPercent,
    band: computed.band,
    letterGrade: computed.letterGrade,
    trend: computed.trend,
    cells: computed.cells,
    alert: alert ? { status: alert.status, reasons: alert.reasons, reasonLabels: (alert.reasons || []).map((r) => REASON_LABEL[r] || r) } : { status: "on_track", reasons: [], reasonLabels: [] },
    plan: plan ? { id: plan.id, rationale: plan.rationale, items: plan.items, createdAt: plan.createdAt, coachUrl: plan.coachUrl ?? null } : null,
    settings,
  });
});

// POST /courses/:courseId/gradebook/sync — register EVERY deliverable in the course as a gradebook
// column, so the gradebook stays in sync with all course activities. Idempotent (onConflictDoNothing):
// activities, cases, workshops and per-module completion each become a gradebook_items row.
// Assignments already appear as default columns, so they are not duplicated here. Staff-only.
router.post("/courses/:courseId/gradebook/sync", requireAuth, async (req, res) => {
  const { courseId } = req.params;
  if (!(await requireStaffOnCourse(req, res, courseId))) return;
  const createdBy = (req.dbUser as U).id;
  const created = { activities: 0, cases: 0, workshops: 0, completion: 0 };
  try {
    const modules = await db.select({ id: modulesTable.id, title: modulesTable.title }).from(modulesTable).where(eq(modulesTable.courseId, courseId));
    const moduleIds = modules.map((m) => m.id);
    const posByModule = new Map(modules.map((m, i) => [m.id, i]));
    const titleByModule = new Map(modules.map((m) => [m.id, m.title]));
    const [acts, cases, sessions] = await Promise.all([
      db.select({ id: interactiveActivitiesTable.id, moduleId: interactiveActivitiesTable.moduleId, title: interactiveActivitiesTable.title }).from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.courseId, courseId)),
      moduleIds.length ? db.select({ id: caseScenariosTable.id, moduleId: caseScenariosTable.moduleId, title: caseScenariosTable.title }).from(caseScenariosTable).where(inArray(caseScenariosTable.moduleId, moduleIds)) : Promise.resolve([]),
      db.select({ id: deliverySessionsTable.id, moduleId: deliverySessionsTable.moduleId, title: deliverySessionsTable.title, sessionType: deliverySessionsTable.sessionType }).from(deliverySessionsTable).where(eq(deliverySessionsTable.courseId, courseId)),
    ]);
    const pos = (mId: string | null) => (mId ? posByModule.get(mId) ?? 0 : 0);
    const mtitle = (mId: string | null) => (mId ? titleByModule.get(mId) ?? "Module" : "Module");
    const ins = async (rows: any[]) => { if (rows.length) await db.insert(gradebookItemsTable).values(rows).onConflictDoNothing(); };

    await ins(acts.map((a) => ({ courseId, sourceType: "activity", sourceId: a.id, title: a.title || `Activity: ${mtitle(a.moduleId)}`, category: "Activities", itemType: "formative", gradeType: "pass_fail", pointsPossible: "100", includeInGrade: false, position: pos(a.moduleId), createdBy })));
    created.activities = acts.length;
    await ins((cases as { id: string; moduleId: string | null; title: string }[]).map((c) => ({ courseId, sourceType: "case", sourceId: c.id, title: c.title || `Case study: ${mtitle(c.moduleId)}`, category: "Case studies", itemType: "formative", gradeType: "points", pointsPossible: "100", includeInGrade: true, position: pos(c.moduleId), createdBy })));
    created.cases = (cases as unknown[]).length;
    const workshops = sessions.filter((s) => (s.sessionType ?? "workshop") === "workshop");
    await ins(workshops.map((s) => ({ courseId, sourceType: "attendance", sourceId: s.id, title: s.title || `Workshop: ${mtitle(s.moduleId)}`, category: "Workshops", itemType: "formative", gradeType: "pass_fail", pointsPossible: "100", includeInGrade: false, position: pos(s.moduleId), createdBy })));
    created.workshops = workshops.length;
    await ins(modules.map((m, i) => ({ courseId, sourceType: "completion", sourceId: m.id, title: `Completion: ${m.title}`, category: "Completion", itemType: "formative", gradeType: "completion", pointsPossible: "100", includeInGrade: false, position: i, createdBy })));
    created.completion = modules.length;

    res.json({ ok: true, created });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Sync failed" });
  }
});

// GET /courses/:courseId/gradebook/learner/:userId — staff drill-in on one learner.
router.get("/courses/:courseId/gradebook/learner/:userId", requireAuth, async (req, res) => {
  const { courseId, userId } = req.params;
  const actor = req.dbUser as U;
  if (!(await canGradeInCourse(actor, courseId, userId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const columns = await getCourseColumns(courseId);
  const settings = await getGradebookSettings(courseId);
  const scoreData = await getScoreData(columns, [userId]);
  const computed = computeLearner(columns, scoreData.fractions.get(userId), scoreData.notes.get(userId), false, settings);

  const alert = await db.query.gradebookAlertsTable.findFirst({
    where: and(eq(gradebookAlertsTable.courseId, courseId), eq(gradebookAlertsTable.userId, userId)),
  });
  const plan = alert?.planId
    ? await db.query.coachPlansTable.findFirst({ where: eq(coachPlansTable.id, alert.planId) })
    : await db.query.coachPlansTable.findFirst({
        where: and(
          eq(coachPlansTable.userId, userId),
          eq(coachPlansTable.courseId, courseId),
          eq(coachPlansTable.source, "gradebook_alert"),
          eq(coachPlansTable.status, "active"),
        ),
        orderBy: [desc(coachPlansTable.createdAt)],
      });
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });

  res.json({
    user: user ? { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email } : null,
    columns,
    overallPercent: computed.overallPercent,
    band: computed.band,
    letterGrade: computed.letterGrade,
    trend: computed.trend,
    cells: computed.cells,
    alert: alert ? { status: alert.status, reasons: alert.reasons, reasonLabels: (alert.reasons || []).map((r) => REASON_LABEL[r] || r) } : { status: "on_track", reasons: [], reasonLabels: [] },
    plan: plan ? { id: plan.id, rationale: plan.rationale, items: plan.items, createdAt: plan.createdAt, coachUrl: plan.coachUrl ?? null } : null,
    settings,
  });
});

// GET /gradebook/mine — cross-course summary for the learner nav page.
router.get("/gradebook/mine", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const enrols = await db
    .select({ courseId: enrolmentsTable.courseId })
    .from(enrolmentsTable)
    .where(eq(enrolmentsTable.userId, userId));
  const courseIds = [...new Set(enrols.map((e) => e.courseId))];
  if (courseIds.length === 0) { res.json({ courses: [] }); return; }

  const [courses, alerts] = await Promise.all([
    db.select().from(coursesTable).where(inArray(coursesTable.id, courseIds)),
    db.select().from(gradebookAlertsTable).where(and(inArray(gradebookAlertsTable.courseId, courseIds), eq(gradebookAlertsTable.userId, userId))),
  ]);
  const alertByCourse = new Map(alerts.map((a) => [a.courseId, a]));
  const titleById = new Map(courses.map((c) => [c.id, c.title]));

  // Compute each course's summary in PARALLEL — the courses are independent, so the old serial
  // per-course loop (reconcile + columns + scores, each awaited before the next) needlessly
  // multiplied latency by the learner's course count.
  const out = await Promise.all(courseIds.map(async (cid) => {
    await reconcileAssignmentEntries(cid);
    const columns = await getCourseColumns(cid);
    const sd = await getScoreData(columns, [userId]);
    const computed = computeLearner(columns, sd.fractions.get(userId), sd.notes.get(userId), false);
    const alert = alertByCourse.get(cid);
    return {
      courseId: cid,
      courseTitle: titleById.get(cid) ?? "Course",
      overallPercent: computed.overallPercent,
      band: computed.band,
      alertStatus: alert?.status ?? "on_track",
      planId: alert?.planId ?? null,
    };
  }));
  res.json({ courses: out });
});

/**
 * GET /courses/:courseId/gradebook-attendance-options
 *
 * Live sessions on this course that could become an attendance column, with how many
 * attendance records each already has. A session with zero records would produce an empty
 * column, so the count is shown rather than letting a facilitator add a blank one blind.
 */
router.get("/courses/:courseId/gradebook-attendance-options", requireAuth, async (req, res) => {
  const { courseId } = req.params;
  if (!(await requireStaffOnCourse(req, res, courseId))) return;

  const sessions = await db
    .select()
    .from(deliverySessionsTable)
    .where(eq(deliverySessionsTable.courseId, courseId))
    .orderBy(desc(deliverySessionsTable.scheduledAt));
  if (sessions.length === 0) { res.json([]); return; }

  const [records, existing] = await Promise.all([
    db.select({ sessionId: attendanceRecordsTable.sessionId })
      .from(attendanceRecordsTable)
      .where(inArray(attendanceRecordsTable.sessionId, sessions.map((s) => s.id))),
    db.select({ sourceId: gradebookItemsTable.sourceId })
      .from(gradebookItemsTable)
      .where(and(eq(gradebookItemsTable.courseId, courseId), eq(gradebookItemsTable.sourceType, "attendance"))),
  ]);
  const counts = new Map<string, number>();
  for (const r of records) counts.set(r.sessionId, (counts.get(r.sessionId) ?? 0) + 1);
  const added = new Set(existing.map((e) => e.sourceId));

  res.json(sessions.map((s) => ({
    id: s.id,
    title: s.title,
    sessionType: s.sessionType,
    scheduledAt: s.scheduledAt.toISOString(),
    recordedCount: counts.get(s.id) ?? 0,
    alreadyInGradebook: added.has(s.id),
  })));
});

// ── Column (gradebook item) CRUD ──────────────────────────────────────────────────
// POST /courses/:courseId/gradebook-items
router.post("/courses/:courseId/gradebook-items", requireAuth, async (req, res) => {
  const { courseId } = req.params;
  if (!(await requireStaffOnCourse(req, res, courseId))) return;
  const b = req.body ?? {};
  const sourceType = b.sourceType as "assignment" | "case" | "activity" | "manual" | "attendance";
  if (!["assignment", "case", "activity", "manual", "attendance"].includes(sourceType)) {
    res.status(400).json({ error: "Invalid sourceType" });
    return;
  }
  let title = typeof b.title === "string" ? b.title.trim() : "";
  let points = b.pointsPossible != null ? Number(b.pointsPossible) : 100;
  let category = typeof b.category === "string" && b.category.trim() ? b.category.trim() : "General";
  const sourceId = sourceType === "manual" ? null : (b.sourceId as string | undefined);

  if (sourceType !== "manual" && !sourceId) {
    res.status(400).json({ error: "sourceId required" });
    return;
  }

  // Fill title / points / category defaults from the source.
  if (sourceType === "case" && sourceId) {
    const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, sourceId) });
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }
    if (!title) title = c.title;
    const rubric = await db.query.caseRubricsTable.findFirst({ where: eq(caseRubricsTable.caseId, sourceId) });
    if (b.pointsPossible == null) points = rubric?.totalPoints ?? 100;
    if (category === "General" && c.tags?.length) category = c.tags[0];
  } else if (sourceType === "activity" && sourceId) {
    const a = await db.query.interactiveActivitiesTable.findFirst({ where: eq(interactiveActivitiesTable.id, sourceId) });
    if (!a) { res.status(404).json({ error: "Activity not found" }); return; }
    if (!title) title = a.title;
    if (b.pointsPossible == null) points = Number(a.maxScore) || 100;
    if (category === "General" && a.tags?.length) category = a.tags[0];
  } else if (sourceType === "assignment" && sourceId) {
    const a = await db.query.assignmentsTable.findFirst({ where: eq(assignmentsTable.id, sourceId) });
    if (!a) { res.status(404).json({ error: "Assignment not found" }); return; }
    if (!title) title = a.title;
    if (b.pointsPossible == null) points = Number(a.pointsPossible) || 100;
  } else if (sourceType === "attendance" && sourceId) {
    // One column per live session. It must belong to THIS course, or a facilitator could
    // pull another course's attendance into their gradebook.
    const s = await db.query.deliverySessionsTable.findFirst({
      where: eq(deliverySessionsTable.id, sourceId),
    });
    if (!s) { res.status(404).json({ error: "Session not found" }); return; }
    if (s.courseId !== courseId) {
      res.status(400).json({ error: "That session belongs to a different course." });
      return;
    }
    if (!title) {
      const when = s.scheduledAt.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
      title = `${s.title} (${when})`;
    }
    // Attendance is pass/fail per session, so the column is worth 1 point unless the
    // facilitator says otherwise. Defaulting to 100 would let one missed session outweigh
    // an entire assignment.
    if (b.pointsPossible == null) points = 1;
    if (category === "General") category = "Attendance";
  }
  if (!title) title = "Untitled item";

  try {
    const [row] = await db
      .insert(gradebookItemsTable)
      .values({
        courseId,
        sourceType,
        sourceId: sourceId ?? null,
        title,
        category,
        itemType: b.itemType === "formative" ? "formative" : "summative",
        pointsPossible: String(points),
        dueDate: b.dueDate ? new Date(b.dueDate) : null,
        includeInGrade: b.includeInGrade === false ? false : true,
        position: b.position != null ? Number(b.position) : 0,
        createdBy: req.userId!,
      })
      .returning();
    res.status(201).json(row);
  } catch (e: any) {
    // Unique (course, source) — already included.
    if (String(e?.message || "").includes("gradebook_items_course_source")) {
      res.status(409).json({ error: "This item is already in the gradebook for this course." });
      return;
    }
    res.status(500).json({ error: "Could not add to gradebook" });
  }
});

// PATCH /gradebook-items/:id
router.patch("/gradebook-items/:id", requireAuth, async (req, res) => {
  const item = await db.query.gradebookItemsTable.findFirst({ where: eq(gradebookItemsTable.id, req.params.id) });
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await requireStaffOnCourse(req, res, item.courseId))) return;
  const b = req.body ?? {};
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof b.title === "string") patch.title = b.title.trim();
  if (typeof b.category === "string") patch.category = b.category.trim() || "General";
  if (b.itemType === "formative" || b.itemType === "summative") patch.itemType = b.itemType;
  if (b.pointsPossible != null) patch.pointsPossible = String(Number(b.pointsPossible));
  if (b.includeInGrade != null) patch.includeInGrade = Boolean(b.includeInGrade);
  if (b.position != null) patch.position = Number(b.position);
  if (b.dueDate !== undefined) patch.dueDate = b.dueDate ? new Date(b.dueDate) : null;
  const [row] = await db.update(gradebookItemsTable).set(patch).where(eq(gradebookItemsTable.id, item.id)).returning();
  res.json(row);
});

// DELETE /gradebook-items/:id — removes the column (and its cells).
router.delete("/gradebook-items/:id", requireAuth, async (req, res) => {
  const item = await db.query.gradebookItemsTable.findFirst({ where: eq(gradebookItemsTable.id, req.params.id) });
  if (!item) { res.json({ ok: true }); return; }
  if (!(await requireStaffOnCourse(req, res, item.courseId))) return;
  await db.delete(gradebookCellsTable).where(eq(gradebookCellsTable.itemId, item.id));
  await db.delete(gradebookItemsTable).where(eq(gradebookItemsTable.id, item.id));
  res.json({ ok: true });
});

// GET /gradebook/source/:sourceType/:sourceId — where a case/activity is already included.
router.get("/gradebook/source/:sourceType/:sourceId", requireAuth, async (req, res) => {
  const { sourceType, sourceId } = req.params;
  const rows = await db
    .select()
    .from(gradebookItemsTable)
    .where(and(eq(gradebookItemsTable.sourceType, sourceType as any), eq(gradebookItemsTable.sourceId, sourceId)));
  const courseIds = [...new Set(rows.map((r) => r.courseId))];
  const courses = courseIds.length
    ? await db.select().from(coursesTable).where(inArray(coursesTable.id, courseIds))
    : [];
  const titleById = new Map(courses.map((c) => [c.id, c.title]));
  res.json(rows.map((r) => ({ id: r.id, courseId: r.courseId, courseTitle: titleById.get(r.courseId) ?? "Course", category: r.category, itemType: r.itemType, pointsPossible: Number(r.pointsPossible), includeInGrade: r.includeInGrade })));
});

// GET /gradebook/manageable-courses — courses the actor can add items to (include-dialog picker).
router.get("/gradebook/manageable-courses", requireAuth, async (req, res) => {
  const u = req.dbUser as U;
  const all = await db.select({ id: coursesTable.id, title: coursesTable.title, tenantId: coursesTable.tenantId }).from(coursesTable);
  let visible = all;
  if (!isSuperAdmin(u.role)) {
    if (canAdministerOrg(u.role)) {
      visible = all.filter((c) => canAccessCourse(u, c));
    } else {
      const led = await leaderCourseIds(u.id);
      visible = all.filter((c) => led.has(c.id));
    }
  }
  res.json(visible.map((c) => ({ id: c.id, title: c.title })));
});

// ── Cell writes (score + note), source-aware ────────────────────────────────────
// PATCH /courses/:courseId/gradebook/cell
router.patch("/courses/:courseId/gradebook/cell", requireAuth, async (req, res) => {
  const { courseId } = req.params;
  if (!(await requireStaffOnCourse(req, res, courseId))) return;
  const b = req.body ?? {};
  const userId = b.userId as string;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const sourceType = b.sourceType as "assignment" | "case" | "activity" | "manual";

  // Assignment score writes go to gradebook_entries (upsert).
  if (sourceType === "assignment" && b.score !== undefined && b.sourceId) {
    const assignmentId = b.sourceId as string;
    const score = b.score === null || b.score === "" ? null : Number(b.score);
    const existing = await db.query.gradebookEntriesTable.findFirst({
      where: and(eq(gradebookEntriesTable.userId, userId), eq(gradebookEntriesTable.assignmentId, assignmentId)),
    });
    const assignment = await db.query.assignmentsTable.findFirst({ where: eq(assignmentsTable.id, assignmentId) });
    if (existing) {
      await db.update(gradebookEntriesTable)
        .set({ score: score === null ? null : String(score), missing: score === null, updatedAt: new Date() })
        .where(eq(gradebookEntriesTable.id, existing.id));
    } else {
      await db.insert(gradebookEntriesTable).values({
        userId, courseId, assignmentId,
        score: score === null ? null : String(score),
        possibleScore: String(Number(assignment?.pointsPossible ?? 100)),
        missing: score === null,
      });
    }
  }

  // Note (or manual score) needs a registry row to hang off. For assignments, auto-create an
  // override item so the note has an item to attach to.
  let itemId = b.itemId as string | undefined;
  if ((b.note !== undefined || (sourceType === "manual" && b.score !== undefined)) && !itemId) {
    if (sourceType === "assignment" && b.sourceId) {
      const existingItem = await db.query.gradebookItemsTable.findFirst({
        where: and(eq(gradebookItemsTable.courseId, courseId), eq(gradebookItemsTable.sourceType, "assignment"), eq(gradebookItemsTable.sourceId, b.sourceId as string)),
      });
      if (existingItem) itemId = existingItem.id;
      else {
        const a = await db.query.assignmentsTable.findFirst({ where: eq(assignmentsTable.id, b.sourceId as string) });
        const [created] = await db.insert(gradebookItemsTable).values({
          courseId, sourceType: "assignment", sourceId: b.sourceId as string,
          title: a?.title ?? "Assignment", category: "Assignments", itemType: "summative",
          pointsPossible: String(Number(a?.pointsPossible ?? 100)), createdBy: req.userId!,
        }).returning();
        itemId = created?.id;
      }
    }
  }

  if (itemId) {
    const note = b.note !== undefined ? (b.note === null || b.note === "" ? null : String(b.note)) : undefined;
    const manualScore = sourceType === "manual" && b.score !== undefined ? (b.score === null || b.score === "" ? null : String(Number(b.score))) : undefined;
    const existingCell = await db.query.gradebookCellsTable.findFirst({
      where: and(eq(gradebookCellsTable.itemId, itemId), eq(gradebookCellsTable.userId, userId)),
    });
    if (existingCell) {
      const patch: Record<string, unknown> = { updatedBy: req.userId!, updatedAt: new Date() };
      if (note !== undefined) patch.note = note;
      if (manualScore !== undefined) patch.manualScore = manualScore;
      await db.update(gradebookCellsTable).set(patch).where(eq(gradebookCellsTable.id, existingCell.id));
    } else {
      await db.insert(gradebookCellsTable).values({ itemId, userId, note: note ?? null, manualScore: manualScore ?? null, updatedBy: req.userId! });
    }
  }

  // Refresh alert state (no notification for staff edits).
  await onGradeEvent({ sourceType: sourceType ?? "manual", sourceId: b.sourceId ?? null, courseId, userId, notify: false });
  res.json({ ok: true });
});

// ── Off-track scan (recompute all + alert/plan the newly off-track) ─────────────────
// POST /courses/:courseId/gradebook/scan
router.post("/courses/:courseId/gradebook/scan", requireAuth, async (req, res) => {
  const { courseId } = req.params;
  if (!(await requireStaffOnCourse(req, res, courseId))) return;
  await reconcileAssignmentEntries(courseId);
  const summary = await scanCourse(courseId);
  res.json(summary);
});

// POST /gradebook/test-email — super-admin sends a sample off-track email to themselves.
router.post("/gradebook/test-email", requireAuth, async (req, res) => {
  const u = req.dbUser as U & { email?: string };
  if (!isSuperAdmin(u.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!mailerConfigured()) {
    res.json({ configured: false, sent: false, message: "Set RESEND_API_KEY and EMAIL_FROM to enable email." });
    return;
  }
  const override = (typeof req.body?.to === "string" && req.body.to.trim()) || (typeof req.query.to === "string" && req.query.to.trim());
  const to = override || u.email;
  if (!to) { res.status(400).json({ error: "No recipient — pass a 'to' or set an email on your account." }); return; }
  const brand = await resolveEmailBrand((u as any).partnerId ?? null);
  const r = await sendMail({
    to,
    fromName: brand.senderName ?? brand.displayName,
    subject: `${brand.displayName} email is working`,
    html: emailShell({
      brand,
      heading: "Email delivery is set up",
      bodyHtml: `This is a test of ${brand.displayName} off-track email reports. If you can read this, learners, coaches and org admins will receive their alerts by email — branded with this tenant's logo, colour and sender name.`,
      ctaLabel: `Open ${brand.displayName}`,
      ctaUrl: appUrl("/"),
    }),
  });
  res.json({ configured: true, sent: r.ok, to, status: r.status, error: r.error, from: brand.senderName ?? brand.displayName });
});

// ── Learner marks a study-plan step done ────────────────────────────────────────
// PATCH /study-plans/:planId/items/:index
router.patch("/study-plans/:planId/items/:index", requireAuth, async (req, res) => {
  const plan = await db.query.coachPlansTable.findFirst({ where: eq(coachPlansTable.id, req.params.planId) });
  if (!plan) { res.status(404).json({ error: "Not found" }); return; }
  if (plan.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }
  const idx = Number(req.params.index);
  const items = Array.isArray(plan.items) ? [...(plan.items as any[])] : [];
  if (idx < 0 || idx >= items.length) { res.status(400).json({ error: "Bad index" }); return; }
  items[idx] = { ...items[idx], done: req.body?.done !== false };
  const allDone = items.every((i) => i.done);
  const [row] = await db.update(coachPlansTable)
    .set({ items, status: allDone ? "completed" : "active", updatedAt: new Date() })
    .where(eq(coachPlansTable.id, plan.id))
    .returning();
  res.json({ id: row.id, items: row.items, status: row.status });
});

/**
 * Legacy: direct gradebook-entry edit.
 *
 * THIS WAS THE WORST HOLE IN THE CODEBASE. It had requireAuth and nothing else: it took an
 * entry id and a score straight from the body and wrote them. Any authenticated user --
 * including any learner -- could award themselves, or anyone else, any mark on any course
 * in any organisation, and grades feed credentials. Being "legacy" is why it was missed;
 * the newer cell/grade routes were all gated as they were written.
 *
 * It now resolves the entry's own course and applies the same canGradeInCourse check the
 * assignment grade route uses, scoped to the learner whose entry it is -- so a Co-facilitator
 * still cannot reach outside the sections they lead.
 */
router.patch("/gradebook-entries/:entryId", requireAuth, async (req, res) => {
  const entry = await db.query.gradebookEntriesTable.findFirst({
    where: eq(gradebookEntriesTable.id, req.params.entryId),
  });
  if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
  if (!(await canGradeInCourse(req.dbUser!, entry.courseId, entry.userId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { score, letterGrade, excused } = req.body;
  const [updated] = await db.update(gradebookEntriesTable)
    .set({ score, letterGrade, excused, updatedAt: new Date() })
    .where(eq(gradebookEntriesTable.id, req.params.entryId))
    .returning();
  res.json(updated);
});

export default router;
