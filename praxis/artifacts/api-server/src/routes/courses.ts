import { Router } from "express";
import { db } from "@workspace/db";
import { coursesTable, modulesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

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
    nqfLevel: c.nqfLevel,
    thumbnailUrl: c.thumbnailUrl,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// GET /courses
router.get("/courses", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  const tenantId = user.partnerId ?? user.organisationId ?? user.id;
  const courses = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.tenantId, tenantId))
    .orderBy(desc(coursesTable.createdAt));
  res.json(courses.map(toCourseResponse));
});

// POST /courses
router.post("/courses", requireAuth, async (req, res) => {
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
router.patch("/courses/:courseId", requireAuth, async (req, res) => {
  const { title, description, status, competencyTags, nqfLevel, thumbnailUrl } = req.body;
  const [updated] = await db
    .update(coursesTable)
    .set({ title, description, status, competencyTags, nqfLevel, thumbnailUrl, updatedAt: new Date() })
    .where(eq(coursesTable.id, req.params.courseId))
    .returning();
  res.json(toCourseResponse(updated));
});

// DELETE /courses/:courseId
router.delete("/courses/:courseId", requireAuth, async (req, res) => {
  await db.delete(coursesTable).where(eq(coursesTable.id, req.params.courseId));
  res.status(204).send();
});

export default router;
