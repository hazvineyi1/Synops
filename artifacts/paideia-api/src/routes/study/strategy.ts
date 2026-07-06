import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  studyMaterialsTable,
  studyLearnerProfilesTable,
} from "@workspace/paideia-db";
import { eq, and } from "drizzle-orm";
import { requireStudyUser } from "../../middlewares/auth.js";
import { generateJSON } from "../../lib/openai.js";

const strategySchema = z.object({
  summary: z.string().min(1),
  sessionMinutes: z.number().int().min(5).max(180),
  modalityMix: z.object({
    text: z.number().min(0).max(1),
    audio: z.number().min(0).max(1),
    visual: z.number().min(0).max(1),
    practice: z.number().min(0).max(1),
  }),
  activities: z
    .array(
      z.object({
        order: z.number().int(),
        title: z.string().min(1),
        description: z.string().min(1),
        modality: z.enum(["read", "listen", "watch", "practice", "reflect"]),
        estimatedMinutes: z.number().int().min(1).max(120),
      }),
    )
    .min(1)
    .max(12),
  tips: z.array(z.string().min(1)).max(8).default([]),
});

const router: IRouter = Router();
router.use(requireStudyUser);

type Strategy = NonNullable<typeof studyMaterialsTable.$inferSelect.strategy>;

// POST /study/strategy/:materialId/generate
router.post("/:materialId/generate", async (req, res) => {
  const userId = req.studyUser!.id;
  const materialId = req.params.materialId;
  if (!materialId) {
    res.status(400).json({ error: "materialId required" });
    return;
  }

  const [material] = await db
    .select()
    .from(studyMaterialsTable)
    .where(and(eq(studyMaterialsTable.userId, userId), eq(studyMaterialsTable.id, materialId)))
    .limit(1);

  if (!material) {
    res.status(404).json({ error: "Material not found" });
    return;
  }

  const [profile] = await db
    .select()
    .from(studyLearnerProfilesTable)
    .where(eq(studyLearnerProfilesTable.userId, userId))
    .limit(1);

  // Diagnostic is "complete" once the 5 intake signals are set (same rule the
  // dashboard + /profile use). The legacy VARK "learning-style profile" table is
  // no longer written by intake, so we must NOT gate on it here.
  const diagnosticComplete = Boolean(
    profile &&
      profile.examTarget &&
      profile.hoursPerWeek &&
      profile.baselineLevel &&
      profile.calibrationSelfRating &&
      profile.failureMode,
  );
  if (!profile || !diagnosticComplete) {
    res.status(409).json({
      error: "Complete your learning-style diagnostic first.",
      code: "no_diagnostic",
    });
    return;
  }

  const snippet = (material.contentText ?? "").slice(0, 6000);
  if (snippet.trim().length < 20) {
    res.status(400).json({
      error: "This material has no readable text to build a strategy from.",
    });
    return;
  }

  const sys = `You are an expert learning coach. Build a personalized study strategy for ONE specific learner and ONE specific material.
You MUST tailor to the learner's level, pace, study style, interests, and failure mode; the strategy is FOR THEM, not generic. Choose a sensible modalityMix for this material and learner.
Return strict JSON with this shape:
{
  "summary": string (2-3 sentences explaining the approach, written TO the learner in second person),
  "sessionMinutes": integer (the recommended length of one session, honour their preferred session length),
  "modalityMix": { "text": number 0-1, "audio": number 0-1, "visual": number 0-1, "practice": number 0-1 } (should sum ~1, match learner weights),
  "activities": [
    { "order": 1, "title": string, "description": string (one sentence, concrete), "modality": "read"|"listen"|"watch"|"practice"|"reflect", "estimatedMinutes": integer }
  ] (5-7 activities forming ONE recommended session, ordered, totaling roughly sessionMinutes),
  "tips": [string] (2-4 short, specific tips for this learner + material)
}`;

  const learnerBlock = `LEARNER PROFILE
- Exam / goal: ${profile.examTarget ?? "general study"}
- Current level: ${profile.baselineLevel ?? "unknown"}
- Self-rated confidence (1-5): ${profile.calibrationSelfRating ?? "unknown"}
- Failure mode to guard against: ${profile.failureMode ?? "unknown"}
- Study hours per week: ${profile.hoursPerWeek ?? "unknown"}
- Preferred session length: ${profile.preferredSessionLength ?? 25} min
- Study style: ${profile.studyStyle ?? "balanced"}
- Preferred difficulty: ${profile.preferredDifficulty ?? "mixed"}
- Interests: ${profile.interests ?? "n/a"}
- Background: ${profile.background ?? "n/a"}`;

  const materialBlock = `MATERIAL: ${material.title}\n---\n${snippet}\n---`;

  try {
    const raw = await generateJSON<unknown>(sys, `${learnerBlock}\n\n${materialBlock}`, {
      kind: "study_strategy_generation",
    });

    const parsed = strategySchema.safeParse(raw);
    if (!parsed.success) {
      res.status(502).json({
        error: "The AI returned a malformed strategy. Try again.",
        details: parsed.error.issues.slice(0, 3),
      });
      return;
    }

    const safeStrategy: Strategy = {
      ...parsed.data,
      generatedAt: new Date().toISOString(),
    };

    await db
      .update(studyMaterialsTable)
      .set({ strategy: safeStrategy })
      .where(
        and(eq(studyMaterialsTable.id, materialId), eq(studyMaterialsTable.userId, userId)),
      );

    res.json(safeStrategy);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Strategy generation failed";
    res.status(500).json({ error: message });
  }
});

// GET /study/strategy/:materialId
router.get("/:materialId", async (req, res) => {
  const userId = req.studyUser!.id;
  const materialId = req.params.materialId;
  if (!materialId) {
    res.status(400).json({ error: "materialId required" });
    return;
  }
  const [material] = await db
    .select({ strategy: studyMaterialsTable.strategy, title: studyMaterialsTable.title, id: studyMaterialsTable.id })
    .from(studyMaterialsTable)
    .where(and(eq(studyMaterialsTable.userId, userId), eq(studyMaterialsTable.id, materialId)))
    .limit(1);
  if (!material) {
    res.status(404).json({ error: "Material not found" });
    return;
  }
  res.json({ materialId: material.id, title: material.title, strategy: material.strategy ?? null });
});

export default router;
