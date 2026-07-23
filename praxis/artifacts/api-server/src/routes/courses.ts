import { Router } from "express";
import { db } from "@workspace/db";
import { coursesTable, modulesTable, beatsTable, assignmentsTable, interactiveActivitiesTable, coursePartnerAssignmentsTable } from "@workspace/db";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { canParticipateInCourse, canStaffActOnCourse, canViewCourseCatalog } from "../lib/scope";

// Courses belong to the super admin (tenantId "platform") and are assigned OUT to partners.
const HUB_ROLES = new Set(["super_admin", "instructional_designer"]);
const isHub = (role?: string | null) => !!role && HUB_ROLES.has(role);

const router = Router();

function toCourseResponse(c: typeof coursesTable.$inferSelect) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    tenantId: c.tenantId,
    status: c.status,
    moduleCount: c.moduleCount,
    enrolmentCount: c.enrolmentCount,
    competencyTags: c.competencyTags,
    objectives: c.objectives ?? [],
    nqfLevel: c.nqfLevel,
    thumbnailUrl: c.thumbnailUrl,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// GET /courses
router.get("/courses", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  // Hub roles (super_admin, instructional_designer) author/oversee across every org, so
  // they see the whole catalogue; everyone else is scoped to their partner/org tenant.
  const seesAll = isHub(user.role);
  if (seesAll) {
    const courses = await db.select().from(coursesTable).orderBy(desc(coursesTable.createdAt));
    res.json(courses.map(toCourseResponse));
    return;
  }
  // Non-hub users see (a) courses their own tenant owns, plus (b) platform-owned courses
  // ASSIGNED to their partner from the console. Additive: assignment only grants visibility,
  // it never removes a course the tenant already owns. Learner course access is still gated
  // by enrolment elsewhere; this list drives the catalogue an admin/coach can act on.
  const scope = user.partnerId ?? user.organisationId ?? user.id;
  const owned = await db.select().from(coursesTable).where(eq(coursesTable.tenantId, scope));
  let assigned: (typeof coursesTable.$inferSelect)[] = [];
  if (user.partnerId) {
    try {
      const rows = await db
        .select({ courseId: coursePartnerAssignmentsTable.courseId })
        .from(coursePartnerAssignmentsTable)
        .where(eq(coursePartnerAssignmentsTable.partnerId, user.partnerId));
      const ids = [...new Set(rows.map((r) => r.courseId))].filter((id) => !owned.some((o) => o.id === id));
      if (ids.length) assigned = await db.select().from(coursesTable).where(inArray(coursesTable.id, ids));
    } catch {
      // Assignment table not created yet (setup-platform not run) -> just the owned list.
    }
  }
  const all = [...owned, ...assigned].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  );
  res.json(all.map(toCourseResponse));
});

// POST /courses -- author tiers only (was requireAuth-only, which let any signed-in user create).
router.post("/courses", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  const user = req.dbUser!;
  // Hub roles (super admin / ID) author the platform catalogue: their courses are owned by
  // "platform" and assigned to partners afterwards. A partner/org author's course stays their own.
  const tenantId = isHub(user.role) ? "platform" : (user.partnerId ?? user.organisationId ?? user.id);
  const { title, description, competencyTags, nqfLevel, thumbnailUrl } = req.body;
  const [course] = await db
    .insert(coursesTable)
    .values({ title, description, tenantId, competencyTags: competencyTags ?? [], nqfLevel, thumbnailUrl })
    .returning();
  res.status(201).json(toCourseResponse(course));
});

/**
 * POST /courses/setup-platform (super admin) — one-time: make the assignment table exist and
 * bring EVERY existing course under super-admin ownership (tenantId "platform") so the whole
 * catalogue is owned centrally and delivered to partners by assignment. Idempotent. Needed
 * because the server has no psql access to run the migration by hand.
 */
router.post("/courses/setup-platform", requireAuth, requireRole("super_admin"), async (_req, res) => {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS course_partner_assignments (
      id text PRIMARY KEY,
      course_id text NOT NULL,
      partner_id text NOT NULL,
      assigned_by text,
      assigned_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS course_partner_assignments_course_partner_uidx
      ON course_partner_assignments (course_id, partner_id)`);
  const updated = await db.update(coursesTable).set({ tenantId: "platform" }).returning({ id: coursesTable.id });
  res.json({ ok: true, coursesAdopted: updated.length });
});

// GET /courses/:courseId/partners (super admin) — which partners this course is assigned to.
router.get("/courses/:courseId/partners", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const rows = await db
      .select({ partnerId: coursePartnerAssignmentsTable.partnerId })
      .from(coursePartnerAssignmentsTable)
      .where(eq(coursePartnerAssignmentsTable.courseId, req.params.courseId));
    res.json({ partnerIds: [...new Set(rows.map((r) => r.partnerId))] });
  } catch {
    // Table not created yet (setup-platform not run) -> no assignments.
    res.json({ partnerIds: [] });
  }
});

// PUT /courses/:courseId/partners (super admin) — replace the set of partners a course is
// assigned to. Body: { partnerIds: string[] }.
router.put("/courses/:courseId/partners", requireAuth, requireRole("super_admin"), async (req, res) => {
  const courseId = req.params.courseId;
  const partnerIds = Array.isArray(req.body?.partnerIds)
    ? [...new Set((req.body.partnerIds as unknown[]).filter((p): p is string => typeof p === "string" && p.length > 0))]
    : [];
  await db.delete(coursePartnerAssignmentsTable).where(eq(coursePartnerAssignmentsTable.courseId, courseId));
  if (partnerIds.length) {
    await db.insert(coursePartnerAssignmentsTable).values(
      partnerIds.map((partnerId) => ({ courseId, partnerId, assignedBy: req.dbUser!.id })),
    );
  }
  res.json({ partnerIds });
});

// GET /partners/:partnerId/courses (super admin) — course ids assigned to a partner.
router.get("/partners/:partnerId/courses", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const rows = await db
      .select({ courseId: coursePartnerAssignmentsTable.courseId })
      .from(coursePartnerAssignmentsTable)
      .where(eq(coursePartnerAssignmentsTable.partnerId, req.params.partnerId));
    res.json({ courseIds: [...new Set(rows.map((r) => r.courseId))] });
  } catch {
    res.json({ courseIds: [] });
  }
});

// PUT /partners/:partnerId/courses (super admin) — replace the set of courses assigned to a
// partner. Self-creates the assignment table so the create-partner flow works before the
// one-time setup-platform has ever run.
router.put("/partners/:partnerId/courses", requireAuth, requireRole("super_admin"), async (req, res) => {
  const partnerId = req.params.partnerId;
  const courseIds = Array.isArray(req.body?.courseIds)
    ? [...new Set((req.body.courseIds as unknown[]).filter((c): c is string => typeof c === "string" && c.length > 0))]
    : [];
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS course_partner_assignments (
      id text PRIMARY KEY,
      course_id text NOT NULL,
      partner_id text NOT NULL,
      assigned_by text,
      assigned_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.delete(coursePartnerAssignmentsTable).where(eq(coursePartnerAssignmentsTable.partnerId, partnerId));
  if (courseIds.length) {
    await db.insert(coursePartnerAssignmentsTable).values(
      courseIds.map((courseId) => ({ courseId, partnerId, assignedBy: req.dbUser!.id })),
    );
  }
  res.json({ courseIds });
});

// GET /courses/:courseId
router.get("/courses/:courseId", requireAuth, async (req, res) => {
  const course = await db.query.coursesTable.findFirst({
    where: eq(coursesTable.id, req.params.courseId),
  });
  if (!course) { res.status(404).json({ error: "Not found" }); return; }
  // A learner may VIEW any course in their catalogue (their tenant owns it, or it is assigned to
  // their partner), even before enrolling — the detail page is the enrol/overview surface. Gating
  // this on enrolment 403'd every non-enrolled catalogue course, and the client rendered that 403
  // as "Course not found", so 13 of 14 catalogue links looked broken. Enrolment still gates the
  // actual coursework routes; visibility here only needs catalogue scope.
  if (!(await canViewCourseCatalog(req.dbUser!, course.id))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const modules = await db
    .select()
    .from(modulesTable)
    .where(eq(modulesTable.courseId, course.id))
    .orderBy(modulesTable.order);
  res.json({
    ...toCourseResponse(course),
    modules: modules.map(m => ({
      id: m.id,
      courseId: m.courseId,
      title: m.title,
      description: m.description,
      status: m.status,
      order: m.order,
      beatCount: m.beatCount,
      estimatedMinutes: m.estimatedMinutes,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

// PATCH /courses/:courseId
router.patch("/courses/:courseId", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  // requireRole proves staff SOMEWHERE, not staff on THIS course, so a coach/admin of one
  // org could edit another org's course metadata. Add the course-scoped check.
  if (!(await canStaffActOnCourse(req.dbUser!, req.params.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const { title, description, status, competencyTags, nqfLevel, thumbnailUrl, objectives } = req.body;
  const [updated] = await db
    .update(coursesTable)
    .set({
      title, description, status, competencyTags, nqfLevel, thumbnailUrl,
      ...(objectives !== undefined ? { objectives } : {}),
      updatedAt: new Date(),
    })
    .where(eq(coursesTable.id, req.params.courseId))
    .returning();
  res.json(toCourseResponse(updated));
});

// DELETE /courses/:courseId
router.delete("/courses/:courseId", requireAuth, async (req, res) => {
  // Deleting an entire course had no authorization check whatsoever.
  if (!(await canStaffActOnCourse(req.dbUser!, req.params.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(coursesTable).where(eq(coursesTable.id, req.params.courseId));
  res.status(204).send();
});

// POST /courses/:courseId/clone -- deep-copy a course with its modules, beats, assignments and
// course-linked interactive activities. The copy starts as a draft owned by the caller's tenant.
router.post("/courses/:courseId/clone", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  const user = req.dbUser!;
  const src = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, req.params.courseId) });
  if (!src) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canStaffActOnCourse(user, src.id))) { res.status(403).json({ error: "Forbidden" }); return; }
  const tenantId = user.partnerId ?? user.organisationId ?? user.id;

  // 1) the course row (drop identity/counters, force draft, retitle)
  const { id: _cid, createdAt: _cc, updatedAt: _cu, moduleCount: _cmc, enrolmentCount: _cec, ...courseRest } = src as any;
  const [course] = await db.insert(coursesTable)
    .values({ ...courseRest, title: `Copy of ${src.title}`, status: "draft", tenantId })
    .returning();

  // 2) modules (+ their beats), keeping an old->new module id map for downstream links
  const mods = await db.select().from(modulesTable).where(eq(modulesTable.courseId, src.id)).orderBy(modulesTable.order);
  const moduleIdMap: Record<string, string> = {};
  for (const m of mods) {
    const { id: oldMid, createdAt: _mc, updatedAt: _mu, ...modRest } = m as any;
    const [nm] = await db.insert(modulesTable).values({ ...modRest, courseId: course.id }).returning();
    moduleIdMap[oldMid] = nm.id;
    const beats = await db.select().from(beatsTable).where(eq(beatsTable.moduleId, oldMid));
    for (const b of beats) {
      const { id: _bid, createdAt: _bc, updatedAt: _bu, ...beatRest } = b as any;
      await db.insert(beatsTable).values({ ...beatRest, moduleId: nm.id });
    }
  }

  // 3) assignments (remap moduleId if the assignment was module-scoped)
  const asgs = await db.select().from(assignmentsTable).where(eq(assignmentsTable.courseId, src.id));
  for (const a of asgs) {
    const { id: _aid, createdAt: _ac, updatedAt: _au, ...asgRest } = a as any;
    await db.insert(assignmentsTable).values({ ...asgRest, courseId: course.id, moduleId: a.moduleId ? (moduleIdMap[a.moduleId] ?? null) : null });
  }

  // 4) interactive activities linked to the course (remap moduleId)
  const acts = await db.select().from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.courseId, src.id));
  for (const act of acts) {
    const { id: _iid, createdAt: _ic, updatedAt: _iu, ...actRest } = act as any;
    await db.insert(interactiveActivitiesTable).values({ ...actRest, courseId: course.id, moduleId: act.moduleId ? (moduleIdMap[act.moduleId] ?? null) : null });
  }

  await db.update(coursesTable).set({ moduleCount: mods.length }).where(eq(coursesTable.id, course.id));
  res.status(201).json(toCourseResponse({ ...course, moduleCount: mods.length }));
});

export default router;
