import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  studyMaterialsTable,
  studyConceptsTable,
  studyFlashcardsTable,
} from "@workspace/paideia-db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireStudyUser } from "../../middlewares/auth.js";
import { generateJSON } from "../../lib/openai.js";
import { isPaidTier } from "../../lib/billing/limits.js";

const router: IRouter = Router();
router.use(requireStudyUser);

const materialInputSchema = z.object({
  title: z.string().min(1).max(500),
  sourceType: z.enum(["paste", "url", "file"]),
  sourceUrl: z.string().max(1000).nullable().optional(),
  contentText: z.string().min(1).max(50000),
});

router.get("/", async (req, res) => {
  const userId = req.studyUser!.id;
  const rows = await db
    .select()
    .from(studyMaterialsTable)
    .where(eq(studyMaterialsTable.userId, userId))
    .orderBy(desc(studyMaterialsTable.createdAt));

  // Count concepts and flashcards per material
  const enriched = await Promise.all(
    rows.map(async (m) => {
      const concepts = await db
        .select({ count: sql<number>`count(*)` })
        .from(studyConceptsTable)
        .where(eq(studyConceptsTable.materialId, m.id));
      const flashcards = await db
        .select({ count: sql<number>`count(*)` })
        .from(studyFlashcardsTable)
        .where(eq(studyFlashcardsTable.materialId, m.id));
      return {
        ...m,
        conceptCount: Number(concepts[0]?.count ?? 0),
        flashcardCount: Number(flashcards[0]?.count ?? 0),
      };
    }),
  );
  res.json(enriched);
});

router.post("/", async (req, res) => {
  const parsed = materialInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const data = parsed.data;
  const userId = req.studyUser!.id;

  const [material] = await db
    .insert(studyMaterialsTable)
    .values({
      userId,
      title: data.title,
      sourceType: data.sourceType,
      sourceUrl: data.sourceUrl ?? null,
      contentText: data.contentText,
    })
    .returning();

  // Fire-and-forget AI concept extraction
  void (async () => {
    try {
      const raw = await generateJSON<
        { concepts?: Array<{ title: string; explanation: string; difficulty: string; keyTerms: string[] }> } | Array<{ title: string; explanation: string; difficulty: string; keyTerms: string[] }>
      >(
        "You are an expert educator. Extract key concepts from the study material. Return JSON with a top-level array named 'concepts'. Each concept has: title, explanation (2-3 sentences), difficulty (easy/medium/hard), and keyTerms (array of important terms).",
        `Extract concepts from this material:\n\nTitle: ${data.title}\n\n${data.contentText.slice(0, 8000)}`,
        { kind: "study_concept_extraction" },
      );

      const conceptsData = Array.isArray(raw) ? raw : (raw as any).concepts ?? Object.values(raw).find(Array.isArray) ?? [];

      interface ExtractedConcept {
        title: string;
        explanation: string;
        difficulty: string;
        keyTerms: string[];
      }

      const conceptRows = conceptsData.map((c: ExtractedConcept) => ({
        userId,
        materialId: material.id,
        title: c.title,
        explanation: c.explanation,
        difficulty: ["easy", "medium", "hard"].includes(c.difficulty) ? c.difficulty : "medium",
        keyTerms: c.keyTerms ?? [],
      }));

      if (conceptRows.length > 0) {
        await db.insert(studyConceptsTable).values(conceptRows);

        // Auto-generate flashcards from concepts
        const flashcardRows = conceptRows.map((c: typeof conceptRows[number]) => ({
          userId,
          materialId: material.id,
          front: c.title,
          back: c.explanation,
          hint: c.keyTerms.length > 0 ? `Think about: ${c.keyTerms.slice(0, 3).join(", ")}` : null,
          intervalDays: 1,
          repetitions: 0,
          easeFactor: 2.5,
          nextReviewAt: new Date(),
          reviewCount: 0,
        }));
        await db.insert(studyFlashcardsTable).values(flashcardRows);
      }
    } catch (err) {
      req.log?.warn({ err }, "concept extraction failed");
    }
  })();

  res.status(201).json({
    ...material,
    conceptCount: 0,
    flashcardCount: 0,
  });
});

router.get("/:materialId", async (req, res) => {
  const userId = req.studyUser!.id;
  const materialId = req.params.materialId;
  const rows = await db
    .select()
    .from(studyMaterialsTable)
    .where(and(eq(studyMaterialsTable.userId, userId), eq(studyMaterialsTable.id, materialId)))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Material not found" });
    return;
  }
  res.json(rows[0]);
});

router.delete("/:materialId", async (req, res) => {
  const userId = req.studyUser!.id;
  const materialId = req.params.materialId;
  await db
    .delete(studyMaterialsTable)
    .where(and(eq(studyMaterialsTable.userId, userId), eq(studyMaterialsTable.id, materialId)));
  res.json({ success: true });
});

// Generate (or regenerate) a per-concept SVG diagram for dual-coding.
// We keep this scoped under the parent material so we can validate ownership in one place.
router.post("/:materialId/concepts/:conceptId/visual", async (req, res) => {
  const userId = req.studyUser!.id;
  const { materialId, conceptId } = req.params;

  // Concept visuals are a paid (Plus+) feature.
  if (!isPaidTier(req.studyUser!.subscriptionTier)) {
    res.status(402).json({
      error: "Concept visuals are a Plus feature. Upgrade to generate diagrams for your concepts.",
      code: "upgrade_required",
      feature: "visuals",
    });
    return;
  }

  const [concept] = await db
    .select()
    .from(studyConceptsTable)
    .where(
      and(
        eq(studyConceptsTable.userId, userId),
        eq(studyConceptsTable.id, conceptId),
        eq(studyConceptsTable.materialId, materialId),
      ),
    )
    .limit(1);
  if (!concept) {
    res.status(404).json({ error: "Concept not found" });
    return;
  }

  // Use a dynamic import so this route file stays free of side-effect coupling
  // to the OpenAI client (which throws at import time if env vars are missing).
  const { openai, PRIMARY_MODEL } = await import("../../lib/openai.js");

  const systemPrompt = `You are an editorial illustrator. You produce SINGLE, self-contained SVG diagrams that explain one concept visually.
Return ONLY the raw SVG markup (starts with <svg ...> and ends with </svg>). No XML declaration, no <!DOCTYPE>, no markdown fences, no commentary.
Rules:
- viewBox="0 0 400 240", no fixed width/height attributes (so it scales).
- Use only these colors: #0f172a (slate-900) for primary lines/text, #475569 (slate-600) for secondary, #2563eb (blue-600) for highlight, #e0e7ff (indigo-100) for fill accents, #ffffff for backgrounds.
- Editorial, calm, schematic style, not cartoonish, not photo-real. Think Stripe or FT Weekend Magazine.
- Include 2-6 short text labels (<text> elements, font-size 12-14, font-family sans-serif).
- Use <rect>, <line>, <path>, <circle>, <text> only. NO <script>, NO <foreignObject>, NO external <image>.
- Diagram should reveal the structure, flow, or relationships in the concept, not just decorate it.`;

  const userPrompt = `Concept: ${concept.title}\n\nExplanation:\n${concept.explanation.slice(0, 2000)}\n\nKey terms: ${(concept.keyTerms ?? []).join(", ") || "(none)"}\n\nProduce one SVG diagram that visually explains this concept.`;

  let svgText: string | null = null;
  try {
    const response = await openai.chat.completions.create({
      model: PRIMARY_MODEL,
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    svgText = response.choices[0]?.message?.content ?? null;
  } catch (err) {
    req.log?.warn({ err }, "concept visual generation failed");
    res.status(502).json({ error: "Could not generate diagram. Try again in a moment." });
    return;
  }

  if (!svgText) {
    res.status(502).json({ error: "Empty response from model." });
    return;
  }

  // Sanitize: strip code fences, trim, ensure it starts with <svg, strip any <script> tags as defense-in-depth.
  let cleaned = svgText
    .replace(/^```(?:svg|xml|html)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const svgStart = cleaned.indexOf("<svg");
  const svgEnd = cleaned.lastIndexOf("</svg>");
  if (svgStart === -1 || svgEnd === -1) {
    res.status(502).json({ error: "Model did not return valid SVG." });
    return;
  }
  cleaned = cleaned.slice(svgStart, svgEnd + 6);
  // Strip script tags and inline event handlers as a precaution (client also sanitizes).
  cleaned = cleaned
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "");

  const [updated] = await db
    .update(studyConceptsTable)
    .set({ visualSvg: cleaned })
    .where(eq(studyConceptsTable.id, conceptId))
    .returning();

  res.json({ visualSvg: updated.visualSvg });
});

router.get("/:materialId/concepts", async (req, res) => {
  const userId = req.studyUser!.id;
  const materialId = req.params.materialId;
  const material = await db
    .select()
    .from(studyMaterialsTable)
    .where(and(eq(studyMaterialsTable.userId, userId), eq(studyMaterialsTable.id, materialId)))
    .limit(1);
  if (material.length === 0) {
    res.status(404).json({ error: "Material not found" });
    return;
  }
  const concepts = await db
    .select()
    .from(studyConceptsTable)
    .where(eq(studyConceptsTable.materialId, materialId));
  res.json(concepts);
});

// Re-run concept + flashcard extraction for an existing material, synchronously, so
// the caller gets a real result (count) or a real error instead of the silent
// fire-and-forget on create. Used by the "Re-analyze" button to recover a material
// whose first extraction failed, or to manually kick off extraction.
router.post("/:materialId/reanalyze", async (req, res) => {
  const userId = req.studyUser!.id;
  const { materialId } = req.params;

  const [material] = await db
    .select()
    .from(studyMaterialsTable)
    .where(and(eq(studyMaterialsTable.id, materialId), eq(studyMaterialsTable.userId, userId)))
    .limit(1);
  if (!material) {
    res.status(404).json({ error: "Material not found" });
    return;
  }

  // Clean slate so a retry doesn't duplicate concepts.
  await db.delete(studyFlashcardsTable).where(and(eq(studyFlashcardsTable.materialId, materialId), eq(studyFlashcardsTable.userId, userId)));
  await db.delete(studyConceptsTable).where(and(eq(studyConceptsTable.materialId, materialId), eq(studyConceptsTable.userId, userId)));

  try {
    const raw = await generateJSON<
      { concepts?: Array<{ title: string; explanation: string; difficulty: string; keyTerms: string[] }> }
      | Array<{ title: string; explanation: string; difficulty: string; keyTerms: string[] }>
    >(
      "You are an expert educator. Extract key concepts from the study material. Return JSON with a top-level array named 'concepts'. Each concept has: title, explanation (2-3 sentences), difficulty (easy/medium/hard), and keyTerms (array of important terms).",
      `Extract concepts from this material:\n\nTitle: ${material.title}\n\n${material.contentText.slice(0, 8000)}`,
      { kind: "study_concept_extraction" },
    );
    const conceptsData: Array<{ title: string; explanation: string; difficulty: string; keyTerms: string[] }> =
      Array.isArray(raw) ? raw : raw?.concepts ?? [];

    if (conceptsData.length === 0) {
      res.json({ conceptCount: 0, warning: "The AI couldn't find teachable concepts in this material. Try a more study-oriented document." });
      return;
    }

    const conceptRows = conceptsData.map((c) => ({
      userId,
      materialId,
      title: String(c.title ?? "Untitled concept"),
      explanation: String(c.explanation ?? ""),
      difficulty: ["easy", "medium", "hard"].includes(c.difficulty) ? c.difficulty : "medium",
      keyTerms: Array.isArray(c.keyTerms) ? c.keyTerms.map((t) => String(t)) : [],
    }));
    await db.insert(studyConceptsTable).values(conceptRows);

    const flashcardRows = conceptRows.map((c) => ({
      userId,
      materialId,
      front: c.title,
      back: c.explanation,
      hint: c.keyTerms.length > 0 ? `Think about: ${c.keyTerms.slice(0, 3).join(", ")}` : null,
      intervalDays: 1,
      repetitions: 0,
      easeFactor: 2.5,
      nextReviewAt: new Date(),
      reviewCount: 0,
    }));
    await db.insert(studyFlashcardsTable).values(flashcardRows);

    res.json({ conceptCount: conceptRows.length });
  } catch {
    res.status(502).json({ error: "AI extraction failed. Please try again in a moment." });
  }
});

export default router;
