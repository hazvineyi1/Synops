import { Router } from "express";
import { db } from "@workspace/db";
import {
  gradebookItemsTable,
  gradebookCellsTable,
  gradebookAlertsTable,
  gradebookEntriesTable,
  assignmentsTable,
  usersTable,
  enrolmentsTable,
  coursesTable,
  courseGroupMembersTable,
  coachPlansTable,
  interactiveActivitiesTable,
  caseScenariosTable,
  caseRubricsTable,
} from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { isSuperAdmin, canAdministerOrg, canAccessCourse, type ScopedUser } from "../lib/roles";
import { canStaffActOnCourse, leaderCourseIds } from "../lib/scope";
import {
  getCourseColumns,
  getScoreData,
  computeLearner,
  REASON_LABEL,
} from "../lib/gradebookEngine";
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

// ── Unified staff matrix ──────────────────────────────────────────────────────────
// GET /courses/:courseId/gradebook?groupId=
router.get("/courses/:courseId/gradebook", requireAuth, async (req, res) => {
  const { courseId } = req.params;
  if (!(await requireStaffOnCourse(req, res, courseId))) return;
  const groupId = typeof req.query.groupId === "string" ? req.query.groupId : null;

  const columns = await getCourseColumns(courseId);

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
  const userIds = [...new Set(learnerRows.map((r) => r.userId))];

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
    const computed = computeLearner(columns, scoreData.fractions.get(uid), scoreData.notes.get(uid), false);
    const u = userById.get(uid);
    const alert = alertByUser.get(uid);
    return {
      userId: uid,
      user: u ? { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email } : null,
      overallPercent: computed.overallPercent,
      band: computed.band,
      trend: computed.trend,
      alert: alert ? { status: alert.status, reasons: alert.reasons } : { status: "on_track", reasons: [] },
      cells: computed.cells,
    };
  });

  const withScores = learners.map((l) => l.overallPercent).filter((v): v is number => v !== null);
  const classAverage = withScores.length ? Math.round(withScores.reduce((a, b) => a + b, 0) / withScores.length) : null;

  res.json({ columns, learners, classAverage });
});

// ── Learner self-view ───────────────────────────────────────────────────────────
// GET /courses/:courseId/gradebook/me
router.get("/courses/:courseId/gradebook/me", requireAuth, async (req, res) => {
  const { courseId } = req.params;
  const userId = req.userId!;
  const columns = await getCourseColumns(courseId);
  const scoreData = await getScoreData(columns, [userId]);
  const computed = computeLearner(columns, scoreData.fractions.get(userId), scoreData.notes.get(userId), false);

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
    trend: computed.trend,
    cells: computed.cells,
    alert: alert ? { status: alert.status, reasons: alert.reasons, reasonLabels: (alert.reasons || []).map((r) => REASON_LABEL[r] || r) } : { status: "on_track", reasons: [], reasonLabels: [] },
    plan: plan ? { id: plan.id, rationale: plan.rationale, items: plan.items, createdAt: plan.createdAt } : null,
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

  const out = [];
  for (const cid of courseIds) {
    const columns = await getCourseColumns(cid);
    const sd = await getScoreData(columns, [userId]);
    const computed = computeLearner(columns, sd.fractions.get(userId), sd.notes.get(userId), false);
    const alert = alertByCourse.get(cid);
    out.push({
      courseId: cid,
      courseTitle: titleById.get(cid) ?? "Course",
      overallPercent: computed.overallPercent,
      band: computed.band,
      alertStatus: alert?.status ?? "on_track",
      planId: alert?.planId ?? null,
    });
  }
  res.json({ courses: out });
});

// ── Column (gradebook item) CRUD ──────────────────────────────────────────────────
// POST /courses/:courseId/gradebook-items
router.post("/courses/:courseId/gradebook-items", requireAuth, async (req, res) => {
  const { courseId } = req.params;
  if (!(await requireStaffOnCourse(req, res, courseId))) return;
  const b = req.body ?? {};
  const sourceType = b.sourceType as "assignment" | "case" | "activity" | "manual";
  if (!["assignment", "case", "activity", "manual"].includes(sourceType)) {
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
  const to = u.email;
  if (!to) { res.status(400).json({ error: "Your account has no email address." }); return; }
  const sent = await sendMail({
    to,
    subject: "Praxis email is working",
    html: emailShell({
      heading: "Email delivery is set up",
      bodyHtml: "This is a test of Praxis off-track email reports. If you can read this, learners, coaches and org admins will receive their alerts by email.",
      ctaLabel: "Open Praxis",
      ctaUrl: appUrl("/"),
    }),
  });
  res.json({ configured: true, sent, to });
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

// Legacy: keep direct gradebook-entry edit working.
router.patch("/gradebook-entries/:entryId", requireAuth, async (req, res) => {
  const { score, letterGrade, excused } = req.body;
  const [updated] = await db.update(gradebookEntriesTable)
    .set({ score, letterGrade, excused, updatedAt: new Date() })
    .where(eq(gradebookEntriesTable.id, req.params.entryId))
    .returning();
  res.json(updated);
});

export default router;
