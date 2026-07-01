import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  studyMaterialsTable,
  studyLearningStyleProfilesTable,
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

  const [style] = await db
    .select()
    .from(studyLearningStyleProfilesTable)
    .where(eq(studyLearningStyleProfilesTable.userId, userId))
    .limit(1);

  if (!style) {
    res.status(409).json({
      error: "Complete your learning-style diagnostic first.",
      code: "no_learning_style",
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
You MUST honour the learner's modality preferences and pace, the strategy is FOR THEM, not generic.
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
- Reading: ${(style.textPref * 100).toFixed(0)}% preference
- Listening: ${(style.audioPref * 100).toFixed(0)}%
- Visual / diagrams: ${(style.visualPref * 100).toFixed(0)}%
- Hands-on practice: ${(style.practicePref * 100).toFixed(0)}%
- Pace: ${style.pace}
- Preferred session length: ${style.preferredSessionMinutes} min
- Focus span: ${style.focusMinutes} min before a break
- Motivation: ${style.motivationType}
- Prior knowledge of the topic area: ${style.priorKnowledge}
- Best study time: ${style.studyTime}`;

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
