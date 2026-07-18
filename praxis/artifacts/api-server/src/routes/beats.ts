import { Router } from "express";
import { db } from "@workspace/db";
import { beatsTable, modulesTable } from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

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

// GET /modules/:moduleId/beats
router.get("/modules/:moduleId/beats", requireAuth, async (req, res) => {
  const beats = await db
    .select()
    .from(beatsTable)
    .where(eq(beatsTable.moduleId, req.params.moduleId))
    .orderBy(asc(beatsTable.order));
  res.json(beats.map(toBeatResponse));
});

// POST /modules/:moduleId/beats
router.post("/modules/:moduleId/beats", requireAuth, async (req, res) => {
  const { type, title, narration, bulletPoints, scenario, order } = req.body;
  const [beat] = await db
    .insert(beatsTable)
    .values({
      moduleId: req.params.moduleId,
      type,
      title,
      narration,
      bulletPoints: bulletPoints ?? [],
      scenario,
      order: order ?? 0,
    })
    .returning();
  // bump beat count
  await db
    .update(modulesTable)
    .set({ beatCount: sql`${modulesTable.beatCount} + 1` })
    .where(eq(modulesTable.id, req.params.moduleId));
  res.status(201).json(toBeatResponse(beat));
});

// PATCH /beats/:beatId
router.patch("/beats/:beatId", requireAuth, async (req, res) => {
  const { title, narration, bulletPoints, scenario, order, transcript, videoUrl } = req.body;
  const [updated] = await db
    .update(beatsTable)
    .set({ title, narration, bulletPoints, scenario, order, transcript, videoUrl, updatedAt: new Date() })
    .where(eq(beatsTable.id, req.params.beatId))
    .returning();
  res.json(toBeatResponse(updated));
});

// DELETE /beats/:beatId
router.delete("/beats/:beatId", requireAuth, async (req, res) => {
  await db.delete(beatsTable).where(eq(beatsTable.id, req.params.beatId));
  res.status(204).send();
});

/**
 * POST /beats/:beatId/generate-audio
 *
 * DISABLED ON PURPOSE. The previous implementation called ElevenLabs, threw the audio
 * bytes away (there is no object storage in this stack), and then set audioStatus="ready"
 * with audioUrl still null -- so the UI showed a play control for audio that did not
 * exist, and when the API key was absent it stranded the beat at "pending" forever.
 *
 * Rather than leave a route that lies, it fails clearly. Learner-facing narration is
 * handled client-side by the browser speech engine (see lib/speech.ts useReadAloud):
 * zero cost, nothing to store, and it works today. Re-enable this only once there is a
 * bucket to write to AND audioUrl is actually persisted.
 */
router.post("/beats/:beatId/generate-audio", requireAuth, async (req, res) => {
  const beat = await db.query.beatsTable.findFirst({
    where: eq(beatsTable.id, req.params.beatId),
  });
  if (!beat) { res.status(404).json({ error: "Not found" }); return; }

  res.status(501).json({
    error: "Server-side narration audio is not available: this deployment has no audio storage configured.",
    hint: "Learners can use the built-in read-aloud control, which narrates in the browser.",
  });
});

export default router;
