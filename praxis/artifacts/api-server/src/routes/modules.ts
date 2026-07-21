import { Router } from "express";
import { db } from "@workspace/db";
import { modulesTable, beatsTable, coursesTable } from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { canStaffActOnCourse, canParticipateInCourse, canViewCourseCatalog } from "../lib/scope";

const router = Router();

/**
 * Course-scoped guards.
 *
 * Every mutating route below used to be `requireAuth` and nothing else, so any authenticated
 * user -- a learner included -- could create, delete or publish modules on ANY course in ANY
 * organisation. PATCH had a role check but no course check, which still let an admin of one
 * organisation rewrite another's curriculum.
 *
 * staffOn() gates authoring; participantOn() gates reading, because course content is not
 * public to the whole platform either.
 */
async function staffOn(req: any, res: any, courseId: string): Promise<boolean> {
  if (await canStaffActOnCourse(req.dbUser!, courseId)) return true;
  res.status(403).json({ error: "Forbidden" });
  return false;
}
async function participantOn(req: any, res: any, courseId: string): Promise<boolean> {
  if (await canParticipateInCourse(req.dbUser!, courseId)) return true;
  res.status(403).json({ error: "Forbidden" });
  return false;
}

function toModuleResponse(m: typeof modulesTable.$inferSelect) {
  return {
    id: m.id,
    courseId: m.courseId,
    title: m.title,
    description: m.description,
    status: m.status,
    lessonType: m.lessonType ?? 'socratic',
    objectives: m.objectives ?? [],
    modality: m.modality ?? 'async',
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
    videoUrl: b.videoUrl,
    transcript: b.transcript,
    audioUrl: b.audioUrl,
    audioStatus: b.audioStatus,
  };
}

// GET /courses/:courseId/modules — the module LIST (titles/order/status) is catalogue overview
// info, so catalogue viewers (browsing an unenrolled course) may read it. Content within each
// module (beats/readings/cases via their own routes) stays enrolment-gated.
router.get("/courses/:courseId/modules", requireAuth, async (req, res) => {
  if (!(await canViewCourseCatalog(req.dbUser!, req.params.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const modules = await db
    .select()
    .from(modulesTable)
    .where(eq(modulesTable.courseId, req.params.courseId))
    .orderBy(asc(modulesTable.order));
  res.json(modules.map(toModuleResponse));
});

// POST /courses/:courseId/modules
router.post("/courses/:courseId/modules", requireAuth, async (req, res) => {
  if (!(await staffOn(req, res, req.params.courseId))) return;
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
  // Returns the module AND every beat -- the full narration and scenario text. Not something
  // to hand to anyone with an account on the platform.
  if (!(await participantOn(req, res, mod.courseId))) return;
  const beats = await db
    .select()
    .from(beatsTable)
    .where(eq(beatsTable.moduleId, mod.id))
    .orderBy(asc(beatsTable.order));
  res.json({ ...toModuleResponse(mod), beats: beats.map(toBeatResponse) });
});

// PATCH /modules/:moduleId
router.patch("/modules/:moduleId", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  // The role gate alone was not enough: it proved the caller is staff SOMEWHERE, not staff
  // on this course, so an admin of one organisation could rewrite another's curriculum.
  const existing = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, req.params.moduleId) });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await staffOn(req, res, existing.courseId))) return;

  const { title, description, status, lessonType, estimatedMinutes, order, objectives, modality } = req.body;
  const [updated] = await db
    .update(modulesTable)
    .set({
      title, description, status, lessonType, estimatedMinutes, order,
      // Only overwrite when provided, so a partial PATCH never wipes them.
      ...(objectives !== undefined ? { objectives } : {}),
      ...(modality !== undefined ? { modality } : {}),
      updatedAt: new Date(),
    })
    .where(eq(modulesTable.id, req.params.moduleId))
    .returning();
  res.json(toModuleResponse(updated));
});

// DELETE /modules/:moduleId
router.delete("/modules/:moduleId", requireAuth, async (req, res) => {
  const existing = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, req.params.moduleId) });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await staffOn(req, res, existing.courseId))) return;
  await db.delete(modulesTable).where(eq(modulesTable.id, req.params.moduleId));
  res.status(204).send();
});

// POST /modules/:moduleId/publish
router.post("/modules/:moduleId/publish", requireAuth, async (req, res) => {
  const existing = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, req.params.moduleId) });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await staffOn(req, res, existing.courseId))) return;
  const [updated] = await db
    .update(modulesTable)
    .set({ status: "published", updatedAt: new Date() })
    .where(eq(modulesTable.id, req.params.moduleId))
    .returning();
  res.json(toModuleResponse(updated));
});

export default router;
