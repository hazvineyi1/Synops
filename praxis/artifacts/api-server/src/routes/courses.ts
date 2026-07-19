import { Router } from "express";
import { db } from "@workspace/db";
import { coursesTable, modulesTable } from "@workspace/db";
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

export default router;
