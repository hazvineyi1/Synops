import { Router } from "express";
import { db } from "@workspace/db";
import { deliverySessionsTable, attendanceRecordsTable, usersTable, modulesTable, coursesTable } from "@workspace/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { isSuperAdmin, isCoFacilitator, canAdministerOrg } from "../lib/roles";
import { leadsCourse, orgCoachingHours } from "../lib/scope";

/**
 * Blended-delivery tracking (decision doc §10.3): in-person / virtual / mentoring /
 * workshop sessions and per-learner attendance + coaching hours.
 */
const router = Router();

type Actor = { id: string; role: string; organisationId?: string | null };

/** Facilitator of the session's org (or Super Admin) — may create/edit/delete sessions. */
function canManageOrgDelivery(user: Actor, tenantId: string): boolean {
  if (isSuperAdmin(user.role)) return true;
  return canAdministerOrg(user.role) && !!user.organisationId && user.organisationId === tenantId;
}

/** May record attendance: org facilitators, or a Co-facilitator who leads the session's course. */
async function canRecordAttendance(user: Actor, session: typeof deliverySessionsTable.$inferSelect): Promise<boolean> {
  if (canManageOrgDelivery(user, session.tenantId)) return true;
  if (isCoFacilitator(user.role) && session.courseId) return leadsCourse(user.id, session.courseId);
  return false;
}

/**
 * Resolve a module to its course + owning org, and decide whether the actor may schedule
 * against it. tenantId is derived from the COURSE, never taken from the request body, so a
 * co-facilitator cannot attach a session to another org's tenant.
 *
 * Co-facilitators who lead the course are allowed to schedule here. That is not an
 * escalation: canRecordAttendance already lets them write attendance for sessions on
 * courses they lead, so the person who runs the workshop can now also book it.
 */
async function resolveModuleScheduling(user: Actor, moduleId: string): Promise<
  { ok: true; courseId: string; tenantId: string } | { ok: false; status: number; error: string }
> {
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, moduleId) });
  if (!mod) return { ok: false, status: 404, error: "Module not found" };
  const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, mod.courseId) });
  if (!course) return { ok: false, status: 404, error: "Course not found" };

  const allowed =
    canManageOrgDelivery(user, course.tenantId) ||
    (isCoFacilitator(user.role) && (await leadsCourse(user.id, mod.courseId)));
  if (!allowed) return { ok: false, status: 403, error: "Forbidden" };

  return { ok: true, courseId: mod.courseId, tenantId: course.tenantId };
}

/**
 * GET /modules/:moduleId/delivery-sessions — workshops for one module.
 *
 * Returns each learner's OWN attendance row only. Deliberately not the roster: this is a
 * learner-facing surface and other people's attendance is nobody else's business (the
 * staff roster view stays behind /delivery-sessions/:id/attendance, which is role-gated).
 */
router.get("/modules/:moduleId/delivery-sessions", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(deliverySessionsTable)
    .where(eq(deliverySessionsTable.moduleId, req.params.moduleId))
    .orderBy(asc(deliverySessionsTable.scheduledAt));

  const mine = await db
    .select()
    .from(attendanceRecordsTable)
    .where(eq(attendanceRecordsTable.userId, req.userId!));
  const bySession = new Map(mine.map((r) => [r.sessionId, r]));

  res.json(rows.map((s) => ({
    ...s,
    myAttendance: bySession.get(s.id)
      ? { status: bySession.get(s.id)!.status, coachingHours: bySession.get(s.id)!.coachingHours }
      : null,
  })));
});

// POST /modules/:moduleId/delivery-sessions — schedule a workshop against a module.
router.post("/modules/:moduleId/delivery-sessions", requireAuth, async (req, res) => {
  const scope = await resolveModuleScheduling(req.dbUser!, req.params.moduleId);
  if (!scope.ok) { res.status(scope.status).json({ error: scope.error }); return; }

  const { title, sessionType, scheduledAt, durationMinutes, location, joinUrl, notes } = req.body ?? {};
  if (!title || !scheduledAt) {
    res.status(400).json({ error: "title and scheduledAt are required" });
    return;
  }

  const [session] = await db
    .insert(deliverySessionsTable)
    .values({
      tenantId: scope.tenantId,
      courseId: scope.courseId,
      moduleId: req.params.moduleId,
      facilitatorId: req.userId!,
      title,
      sessionType: sessionType ?? "workshop",
      scheduledAt: new Date(scheduledAt),
      durationMinutes: durationMinutes ?? 60,
      location: location ?? null,
      joinUrl: joinUrl ?? null,
      notes: notes ?? null,
    })
    .returning();
  res.status(201).json(session);
});

// GET /courses/:courseId/delivery-sessions — sessions attached to a course.
router.get("/courses/:courseId/delivery-sessions", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(deliverySessionsTable)
    .where(eq(deliverySessionsTable.courseId, req.params.courseId))
    .orderBy(desc(deliverySessionsTable.scheduledAt));
  res.json(rows);
});

// GET /orgs/:orgId/delivery-sessions — all of an org's sessions (org staff only).
router.get("/orgs/:orgId/delivery-sessions", requireAuth, async (req, res) => {
  if (!canManageOrgDelivery(req.dbUser!, req.params.orgId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db
    .select()
    .from(deliverySessionsTable)
    .where(eq(deliverySessionsTable.tenantId, req.params.orgId))
    .orderBy(desc(deliverySessionsTable.scheduledAt));
  res.json(rows);
});

// POST /delivery-sessions — create a session (facilitator of the org).
router.post("/delivery-sessions", requireAuth, async (req, res) => {
  const { tenantId, courseId, moduleId, title, sessionType, scheduledAt, durationMinutes, location, joinUrl, notes } = req.body;
  if (!tenantId || !title || !scheduledAt) {
    res.status(400).json({ error: "tenantId, title and scheduledAt are required" });
    return;
  }
  if (!canManageOrgDelivery(req.dbUser!, tenantId)) { res.status(403).json({ error: "Forbidden" }); return; }

  // A module may only be attached if it belongs to this tenant. Without this an org admin
  // could hang a session off another org's module and have it show in their learners' view.
  if (moduleId) {
    const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, moduleId) });
    const course = mod ? await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, mod.courseId) }) : null;
    if (!mod || !course || course.tenantId !== tenantId) {
      res.status(400).json({ error: "That module does not belong to this organisation." });
      return;
    }
  }

  const [session] = await db
    .insert(deliverySessionsTable)
    .values({
      tenantId,
      courseId: courseId ?? null,
      moduleId: moduleId ?? null,
      facilitatorId: req.userId!,
      title,
      sessionType: sessionType ?? "in_person",
      scheduledAt: new Date(scheduledAt),
      durationMinutes: durationMinutes ?? 60,
      location: location ?? null,
      joinUrl: joinUrl ?? null,
      notes: notes ?? null,
    })
    .returning();
  res.status(201).json(session);
});

// PATCH /delivery-sessions/:id
router.patch("/delivery-sessions/:id", requireAuth, async (req, res) => {
  const session = await db.query.deliverySessionsTable.findFirst({ where: eq(deliverySessionsTable.id, req.params.id) });
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (!canManageOrgDelivery(req.dbUser!, session.tenantId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { title, sessionType, scheduledAt, durationMinutes, location, joinUrl, notes } = req.body;
  const updates: Partial<typeof deliverySessionsTable.$inferInsert> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (sessionType !== undefined) updates.sessionType = sessionType;
  if (scheduledAt !== undefined) updates.scheduledAt = new Date(scheduledAt);
  if (durationMinutes !== undefined) updates.durationMinutes = durationMinutes;
  if (location !== undefined) updates.location = location;
  if (joinUrl !== undefined) updates.joinUrl = joinUrl;
  if (notes !== undefined) updates.notes = notes;
  const [updated] = await db.update(deliverySessionsTable).set(updates).where(eq(deliverySessionsTable.id, req.params.id)).returning();
  res.json(updated);
});

// DELETE /delivery-sessions/:id
router.delete("/delivery-sessions/:id", requireAuth, async (req, res) => {
  const session = await db.query.deliverySessionsTable.findFirst({ where: eq(deliverySessionsTable.id, req.params.id) });
  if (!session) { res.status(204).send(); return; }
  if (!canManageOrgDelivery(req.dbUser!, session.tenantId)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(attendanceRecordsTable).where(eq(attendanceRecordsTable.sessionId, req.params.id));
  await db.delete(deliverySessionsTable).where(eq(deliverySessionsTable.id, req.params.id));
  res.status(204).send();
});

// GET /delivery-sessions/:id/attendance — staff view of who attended.
router.get("/delivery-sessions/:id/attendance", requireAuth, async (req, res) => {
  const session = await db.query.deliverySessionsTable.findFirst({ where: eq(deliverySessionsTable.id, req.params.id) });
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (!(await canRecordAttendance(req.dbUser!, session))) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db
    .select({ record: attendanceRecordsTable, user: usersTable })
    .from(attendanceRecordsTable)
    .leftJoin(usersTable, eq(attendanceRecordsTable.userId, usersTable.id))
    .where(eq(attendanceRecordsTable.sessionId, req.params.id));
  res.json(rows.map((r) => ({
    ...r.record,
    user: r.user ? { id: r.user.id, firstName: r.user.firstName, lastName: r.user.lastName, email: r.user.email } : null,
  })));
});

// POST /delivery-sessions/:id/attendance — upsert a batch of attendance rows.
// Body: { records: [{ userId, status?, coachingHours? }] }
router.post("/delivery-sessions/:id/attendance", requireAuth, async (req, res) => {
  const session = await db.query.deliverySessionsTable.findFirst({ where: eq(deliverySessionsTable.id, req.params.id) });
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (!(await canRecordAttendance(req.dbUser!, session))) { res.status(403).json({ error: "Forbidden" }); return; }
  const entries: Array<{ userId: string; status?: string; coachingHours?: number }> = Array.isArray(req.body?.records)
    ? req.body.records
    : [];
  const out = [];
  for (const e of entries) {
    if (!e.userId) continue;
    const vals = {
      status: (e.status ?? "present") as typeof attendanceRecordsTable.$inferInsert["status"],
      coachingHours: e.coachingHours != null ? String(e.coachingHours) : null,
      recordedBy: req.userId!,
    };
    const existing = await db.query.attendanceRecordsTable.findFirst({
      where: and(eq(attendanceRecordsTable.sessionId, req.params.id), eq(attendanceRecordsTable.userId, e.userId)),
    });
    if (existing) {
      const [u] = await db.update(attendanceRecordsTable).set(vals).where(eq(attendanceRecordsTable.id, existing.id)).returning();
      out.push(u);
    } else {
      const [n] = await db.insert(attendanceRecordsTable).values({ sessionId: req.params.id, userId: e.userId, ...vals }).returning();
      out.push(n);
    }
  }
  res.status(201).json(out);
});

// GET /me/attendance — a learner's own attendance history (self-service).
router.get("/me/attendance", requireAuth, async (req, res) => {
  const rows = await db
    .select({ record: attendanceRecordsTable, session: deliverySessionsTable })
    .from(attendanceRecordsTable)
    .leftJoin(deliverySessionsTable, eq(attendanceRecordsTable.sessionId, deliverySessionsTable.id))
    .where(eq(attendanceRecordsTable.userId, req.userId!))
    .orderBy(desc(deliverySessionsTable.scheduledAt));
  res.json(rows.map((r) => ({ ...r.record, session: r.session })));
});

// GET /orgs/:orgId/coaching-hours — aggregate coaching-hour total for an org (staff/super).
router.get("/orgs/:orgId/coaching-hours", requireAuth, async (req, res) => {
  if (!canManageOrgDelivery(req.dbUser!, req.params.orgId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const total = await orgCoachingHours(req.params.orgId);
  res.json({ organisationId: req.params.orgId, coachingHours: total });
});

export default router;
