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
  const { title, narration, bulletPoints, scenario, order } = req.body;
  const [updated] = await db
    .update(beatsTable)
    .set({ title, narration, bulletPoints, scenario, order, updatedAt: new Date() })
    .where(eq(beatsTable.id, req.params.beatId))
    .returning();
  res.json(toBeatResponse(updated));
});

// DELETE /beats/:beatId
router.delete("/beats/:beatId", requireAuth, async (req, res) => {
  await db.delete(beatsTable).where(eq(beatsTable.id, req.params.beatId));
  res.status(204).send();
});

// POST /beats/:beatId/generate-audio
router.post("/beats/:beatId/generate-audio", requireAuth, async (req, res) => {
  const beat = await db.query.beatsTable.findFirst({
    where: eq(beatsTable.id, req.params.beatId),
  });
  if (!beat) { res.status(404).json({ error: "Not found" }); return; }

  // Mark as pending — actual ElevenLabs call would be async worker
  const [updated] = await db
    .update(beatsTable)
    .set({ audioStatus: "pending", updatedAt: new Date() })
    .where(eq(beatsTable.id, req.params.beatId))
    .returning();

  // TODO: Queue ElevenLabs synthesis job
  // For MVP: if ELEVENLABS_API_KEY set, call synchronously
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (apiKey) {
    try {
      const response = await fetch("https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM", {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: beat.narration,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });
      if (response.ok) {
        // In production: upload to object storage; return URL
        // For MVP: mark as ready with placeholder
        const [done] = await db
          .update(beatsTable)
          .set({ audioStatus: "ready", updatedAt: new Date() })
          .where(eq(beatsTable.id, req.params.beatId))
          .returning();
        res.status(202).json(toBeatResponse(done));
        return;
      }
    } catch (_err) {
      // Fall through to pending
    }
  }

  res.status(202).json(toBeatResponse(updated));
});

export default router;
