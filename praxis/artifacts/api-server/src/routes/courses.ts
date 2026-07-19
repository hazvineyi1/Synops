import { Router } from "express";
import { db } from "@workspace/db";
import { coursesTable, modulesTable, beatsTable, assignmentsTable, interactiveActivitiesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { canParticipateInCourse, canStaffActOnCourse } from "../lib/scope";

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
  const seesAll = user.role === "super_admin" || user.role === "instructional_designer";
  const courses = seesAll
    ? await db.select().from(coursesTable).orderBy(desc(coursesTable.createdAt))
    : await db
        .select()
        .from(coursesTable)
        .where(eq(coursesTable.tenantId, user.partnerId ?? user.organisationId ?? user.id))
        .orderBy(desc(coursesTable.createdAt));
  res.json(courses.map(toCourseResponse));
});

// POST /courses -- author tiers only (was requireAuth-only, which let any signed-in user create).
router.post("/courses", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  const user = req.dbUser!;
  const tenantId = user.partnerId ?? user.organisationId ?? user.id;
  const { title, description, competencyTags, nqfLevel, thumbnailUrl } = req.body;
  const [course] = await db
    .insert(coursesTable)
    .values({ title, description, tenantId, competencyTags: competencyTags ?? [], nqfLevel, thumbnailUrl })
    .returning();
  res.status(201).json(toCourseResponse(course));
});

// GET /courses/:courseId
router.get("/courses/:courseId", requireAuth, async (req, res) => {
  const course = await db.query.coursesTable.findFirst({
    where: eq(coursesTable.id, req.params.courseId),
  });
  if (!course) { res.status(404).json({ error: "Not found" }); return; }
  // The course record plus all of its modules. Course-scoped, not platform-public.
  if (!(await canParticipateInCourse(req.dbUser!, course.id))) {
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
