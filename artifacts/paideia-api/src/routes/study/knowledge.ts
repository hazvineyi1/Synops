import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  studyKnowledgeNodesTable,
  studyKnowledgeEdgesTable,
  studyMaterialsTable,
  studyConceptsTable,
} from "@workspace/paideia-db";
import { eq, and, sql } from "drizzle-orm";
import { requireStudyUser } from "../../middlewares/auth.js";
import { generateJSON } from "../../lib/openai.js";
import { randomUUID } from "crypto";

const router: IRouter = Router();
router.use(requireStudyUser);

// GET /study/knowledge/nodes - list all knowledge nodes for user
router.get("/nodes", async (req, res) => {
  const userId = req.studyUser!.id;
  const nodes = await db
    .select()
    .from(studyKnowledgeNodesTable)
    .where(eq(studyKnowledgeNodesTable.userId, userId));
  res.json(nodes);
});

// GET /study/knowledge/edges - list all edges for user
router.get("/edges", async (req, res) => {
  const userId = req.studyUser!.id;
  const edges = await db
    .select()
    .from(studyKnowledgeEdgesTable)
    .where(eq(studyKnowledgeEdgesTable.userId, userId));
  res.json(edges);
});

// POST /study/knowledge/generate - fire-and-forget extraction from material
router.post("/generate", async (req, res) => {
  const userId = req.studyUser!.id;
  const schema = z.object({ materialId: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { materialId } = parsed.data;

  const [material] = await db
    .select()
    .from(studyMaterialsTable)
    .where(and(eq(studyMaterialsTable.userId, userId), eq(studyMaterialsTable.id, materialId)))
    .limit(1);
  if (!material) {
    res.status(404).json({ error: "Material not found" });
    return;
  }

  // Fire-and-forget AI extraction (like material creation)
  void (async () => {
    try {
      // Step 1: Extract concepts if none exist
      const concepts = await db
        .select()
        .from(studyConceptsTable)
        .where(and(eq(studyConceptsTable.userId, userId), eq(studyConceptsTable.materialId, materialId)));

      let conceptTexts = concepts.map((c) => `${c.title}: ${c.explanation}`).join("\n\n");

      if (concepts.length === 0) {
        const raw = await generateJSON<
          { concepts?: Array<{ title: string; explanation: string; difficulty: string; keyTerms: string[] }> } | Array<{ title: string; explanation: string; difficulty: string; keyTerms: string[] }>
        >(
          "You are an expert educator. Extract key concepts from this study material. Return JSON with a top-level array named 'concepts'. Each concept has: title, explanation (2-3 sentences), difficulty (easy/medium/hard), and keyTerms (array of important terms).",
          `Extract concepts from this material:\n\nTitle: ${material.title}\n\n${material.contentText.slice(0, 8000)}`,
          { kind: "study_concept_extraction" },
        );
        const conceptsData = Array.isArray(raw) ? raw : (raw as any).concepts ?? Object.values(raw as any).find(Array.isArray) ?? [];
        if (conceptsData.length > 0) {
          const rows = conceptsData.map((c: any) => ({
            userId,
            materialId,
            title: c.title,
            explanation: c.explanation,
            difficulty: ["easy", "medium", "hard"].includes(c.difficulty) ? c.difficulty : "medium",
            keyTerms: c.keyTerms ?? [],
          }));
          await db.insert(studyConceptsTable).values(rows);
          conceptTexts = rows.map((c: any) => `${c.title}: ${c.explanation}`).join("\n\n");
        }
      }

      // Step 2: Generate knowledge nodes from concepts
      if (!conceptTexts) return;

      // Re-fetch concepts so labels are the source of truth (no AI invention).
      const currentConcepts = await db
        .select()
        .from(studyConceptsTable)
        .where(and(eq(studyConceptsTable.userId, userId), eq(studyConceptsTable.materialId, materialId)));
      if (currentConcepts.length === 0) return;

      // Idempotent rebuild: clear this user's existing graph so repeat calls don't
      // accumulate duplicates and any prior hallucinated nodes get purged.
      await db.delete(studyKnowledgeEdgesTable).where(eq(studyKnowledgeEdgesTable.userId, userId));
      await db.delete(studyKnowledgeNodesTable).where(eq(studyKnowledgeNodesTable.userId, userId));

      const allowedLabels = currentConcepts.map((c) => c.title);
      const labelToId: Record<string, string> = {};
      const labelToConcept = new Map(currentConcepts.map((c) => [c.title, c]));

      // Create one node per real concept, no AI freedom over labels/categories.
      for (const c of currentConcepts) {
        const id = randomUUID();
        labelToId[c.title] = id;
        await db.insert(studyKnowledgeNodesTable).values({
          id,
          userId,
          label: c.title,
          description: c.explanation,
          category: material.title,
          masteryLevel: 0,
          confidenceScore: 0,
        });
      }

      // Ask AI only for relationships between the supplied labels, nothing else.
      const raw = await generateJSON<{ edges?: Array<{ from: string; to: string; relationType: string }> }>(
        `You are a knowledge graph builder. You will be given a strict list of concept labels from a single study material titled "${material.title}". Return a JSON object with a top-level array named 'edges'. Each edge has: from (must be EXACTLY one of the supplied labels), to (must be EXACTLY one of the supplied labels, different from 'from'), and relationType (one of: prerequisite, related, subtopic, extension). Do NOT invent new labels. Do NOT include concepts from other subjects. Do NOT output anything other than relationships between the supplied labels. If two concepts are unrelated, omit the edge.`,
        `Material title: ${material.title}\n\nAllowed labels (use EXACTLY these strings, do not invent others):\n${allowedLabels.map((l) => `- ${l}`).join("\n")}`,
        { kind: "study_knowledge_extraction" },
      );

      const edgeArray: Array<{ from: string; to: string; relationType: string }> =
        (raw as any).edges ?? (Array.isArray(raw) ? raw : Object.values(raw as any).find(Array.isArray) ?? []);

      const seenEdges = new Set<string>();
      for (const edge of edgeArray) {
        const sourceId = labelToId[edge.from];
        const targetId = labelToId[edge.to];
        if (!sourceId || !targetId || sourceId === targetId) continue;
        if (!labelToConcept.has(edge.from) || !labelToConcept.has(edge.to)) continue;
        const key = `${sourceId}->${targetId}`;
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
        const relationType = ["prerequisite", "related", "subtopic", "extension"].includes(edge.relationType)
          ? edge.relationType
          : "related";
        await db.insert(studyKnowledgeEdgesTable).values({
          userId,
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          relationType,
          strength: 0.5,
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Knowledge extraction failed:", err);
    }
  })();

  // Return immediately - frontend polls for results
  res.json({ status: "processing", message: "Knowledge graph generation started. Check back in a moment." });
});

// POST /study/knowledge/nodes/:nodeId/mastery - update mastery level
router.post("/nodes/:nodeId/mastery", async (req, res) => {
  const userId = req.studyUser!.id;
  const schema = z.object({
    masteryLevel: z.number().min(0).max(1),
    confidenceScore: z.number().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const [updated] = await db
    .update(studyKnowledgeNodesTable)
    .set({
      masteryLevel: parsed.data.masteryLevel,
      confidenceScore: parsed.data.confidenceScore ?? undefined,
      lastAssessedAt: new Date(),
      reviewCount: sql`${studyKnowledgeNodesTable.reviewCount} + 1`,
    })
    .where(
      and(
        eq(studyKnowledgeNodesTable.userId, userId),
        eq(studyKnowledgeNodesTable.id, req.params.nodeId),
      ),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  res.json(updated);
});

export default router;
