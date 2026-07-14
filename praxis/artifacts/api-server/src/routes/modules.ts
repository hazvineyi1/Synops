import { Router } from "express";
import { db } from "@workspace/db";
import { modulesTable, beatsTable, coursesTable } from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

function toModuleResponse(m: typeof modulesTable.$inferSelect) {
  return {
    id: m.id,
    courseId: m.courseId,
    title: m.title,
    description: m.description,
    status: m.status,
    lessonType: m.lessonType ?? 'socratic',
    order: m.order,
    beatCount: m.beatCount,
    estimatedMinutes: m.estimatedMinutes,
    createdAt: m.createdAt.toISOString(),
  };
}

function toBeatResponse(b: typeof beatsTable.$inferSelect) {
  return {
    id: b.id,
    moduleId: b.moduleId,
    type: b.type,
    order: b.order,
    title: b.title,
    narration: b.narration,
    bulletPoints: b.bulletPoints,
    scenario: b.scenario,
    visualData: b.visualData,
    audioUrl: b.audioUrl,
    audioStatus: b.audioStatus,
  };
}

// GET /courses/:courseId/modules
router.get("/courses/:courseId/modules", requireAuth, async (req, res) => {
  const modules = await db
    .select()
    .from(modulesTable)
    .where(eq(modulesTable.courseId, req.params.courseId))
    .orderBy(asc(modulesTable.order));
  res.json(modules.map(toModuleResponse));
});

// POST /courses/:courseId/modules
router.post("/courses/:courseId/modules", requireAuth, async (req, res) => {
  const { title, description, estimatedMinutes, order } = req.body;
  const [mod] = await db
    .insert(modulesTable)
    .values({ courseId: req.params.courseId, title, description, estimatedMinutes, order: order ?? 0 })
    .returning();
  // bump course module count
  await db
    .update(coursesTable)
    .set({ moduleCount: sql`${coursesTable.moduleCount} + 1` })
    .where(eq(coursesTable.id, req.params.courseId));
  res.status(201).json(toModuleResponse(mod));
});

// GET /modules/:moduleId
router.get("/modules/:moduleId", requireAuth, async (req, res) => {
  const mod = await db.query.modulesTable.findFirst({
    where: eq(modulesTable.id, req.params.moduleId),
  });
  if (!mod) { res.status(404).json({ error: "Not found" }); return; }
  const beats = await db
    .select()
    .from(beatsTable)
    .where(eq(beatsTable.moduleId, mod.id))
    .orderBy(asc(beatsTable.order));
  res.json({ ...toModuleResponse(mod), beats: beats.map(toBeatResponse) });
});

// PATCH /modules/:moduleId
router.patch("/modules/:moduleId", requireAuth, async (req, res) => {
  const { title, description, status, lessonType, estimatedMinutes, order } = req.body;
  const [updated] = await db
    .update(modulesTable)
    .set({ title, description, status, lessonType, estimatedMinutes, order, updatedAt: new Date() })
    .where(eq(modulesTable.id, req.params.moduleId))
    .returning();
  res.json(toModuleResponse(updated));
});

// DELETE /modules/:moduleId
router.delete("/modules/:moduleId", requireAuth, async (req, res) => {
  await db.delete(modulesTable).where(eq(modulesTable.id, req.params.moduleId));
  res.status(204).send();
});

// POST /modules/:moduleId/publish
router.post("/modules/:moduleId/publish", requireAuth, async (req, res) => {
  const [updated] = await db
    .update(modulesTable)
    .set({ status: "published", updatedAt: new Date() })
    .where(eq(modulesTable.id, req.params.moduleId))
    .returning();
  res.json(toModuleResponse(updated));
});

export default router;
