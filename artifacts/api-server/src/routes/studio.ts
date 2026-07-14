import { Router } from "express";
import { db } from "@workspace/db";
import { scriptDraftsTable, modulesTable, beatsTable, coursesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router();

/**
 * The beat types the DB enum actually accepts. Kept in lockstep with beatTypeEnum in
 * lib/db/src/schema/beats.ts. AI-generated drafts are validated against this before
 * insert -- an unknown type would otherwise be rejected by Postgres at publish time.
 */
const BEAT_TYPES = [
  "title_card",
  "points",
  "scenario",
  "compare",
  "diagram",
  "close",
  "video",
] as const;

function toDraftResponse(d: typeof scriptDraftsTable.$inferSelect) {
  return {
    id: d.id,
    title: d.title,
    sourceText: d.sourceText,
    status: d.status,
    beats: (d.beatsData as any[]) ?? [],
    tenantId: d.tenantId,
    createdAt: d.createdAt.toISOString(),
  };
}

// POST /studio/generate-script
router.post("/studio/generate-script", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  const tenantId = user.partnerId ?? user.organisationId ?? user.id;
  const { title, sourceText, language = "en-ZA", maxBeats = 6 } = req.body;

  if (!sourceText || sourceText.length < 50) {
    res.status(400).json({ error: "sourceText must be at least 50 characters" });
    return;
  }

  // Create draft as "generating"
  const [draft] = await db
    .insert(scriptDraftsTable)
    .values({
      title,
      sourceText,
      status: "generating",
      beatsData: [],
      tenantId,
      createdById: user.id,
    })
    .returning();

  // Generate beats with Claude (synchronous for MVP; queue in production)
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: `You are a skilled instructional designer. Analyse the following source document and produce a structured animated module script.

Language: ${language}
Max beats: ${maxBeats}

Rules:
- Each beat must be self-contained and teach ONE concept
- Beat types: title_card (1, always first), points (2-4 bullet points each), scenario (workplace scenario + question), compare (wrong vs right), diagram (for processes/models), close (summary + key takeaway)
- Every beat must have: type, title, narration (1-3 sentences, spoken aloud), bulletPoints (array, may be empty for non-points beats), scenario (only for scenario beats)
- Narration must sound natural when spoken aloud in South African English
- IMPORTANT: Return ONLY valid JSON, no markdown, no explanation

Source document:
${sourceText}

Return a JSON array of exactly ${maxBeats} beat objects:
[
  {
    "type": "title_card",
    "title": "...",
    "narration": "...",
    "bulletPoints": [],
    "scenario": null
  },
  ...
]`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    let beats: any[];
    try {
      beats = JSON.parse(content.text);
    } catch {
      // Try to extract JSON array from response
      const match = content.text.match(/\[[\s\S]*\]/);
      beats = match ? JSON.parse(match[0]) : [];
    }

    // Add order and ids to beats
    const beatsWithIds = beats.map((b: any, i: number) => ({
      id: crypto.randomUUID(),
      ...b,
      order: i,
      audioStatus: "none",
      audioUrl: null,
    }));

    const [updated] = await db
      .update(scriptDraftsTable)
      .set({ status: "ready", beatsData: beatsWithIds, updatedAt: new Date() })
      .where(eq(scriptDraftsTable.id, draft.id))
      .returning();

    res.json(toDraftResponse(updated));
  } catch (err) {
    req.log.error({ err }, "Script generation failed");
    await db
      .update(scriptDraftsTable)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(scriptDraftsTable.id, draft.id));
    res.status(500).json({ error: "Script generation failed" });
  }
});

// GET /studio/scripts
router.get("/studio/scripts", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  const tenantId = user.partnerId ?? user.organisationId ?? user.id;
  const drafts = await db
    .select()
    .from(scriptDraftsTable)
    .where(eq(scriptDraftsTable.tenantId, tenantId))
    .orderBy(desc(scriptDraftsTable.createdAt));
  res.json(drafts.map(toDraftResponse));
});

// GET /studio/scripts/:draftId
router.get("/studio/scripts/:draftId", requireAuth, async (req, res) => {
  const draft = await db.query.scriptDraftsTable.findFirst({
    where: eq(scriptDraftsTable.id, req.params.draftId),
  });
  if (!draft) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toDraftResponse(draft));
});

// PATCH /studio/scripts/:draftId
router.patch("/studio/scripts/:draftId", requireAuth, async (req, res) => {
  const { title, beats } = req.body;
  const [updated] = await db
    .update(scriptDraftsTable)
    .set({ title, beatsData: beats ?? undefined, updatedAt: new Date() })
    .where(eq(scriptDraftsTable.id, req.params.draftId))
    .returning();
  res.json(toDraftResponse(updated));
});

// POST /studio/scripts/:draftId/publish
router.post("/studio/scripts/:draftId/publish", requireAuth, async (req, res) => {
  const draft = await db.query.scriptDraftsTable.findFirst({
    where: eq(scriptDraftsTable.id, req.params.draftId),
  });
  if (!draft) { res.status(404).json({ error: "Not found" }); return; }

  const { courseId, moduleTitle, lessonType } = req.body;
  const beats = (draft.beatsData as any[]) ?? [];

  // Create module
  const [mod] = await db
    .insert(modulesTable)
    .values({
      courseId,
      title: moduleTitle ?? draft.title,
      status: "published",
      lessonType: lessonType ?? "socratic",
      order: 0,
      estimatedMinutes: Math.ceil(beats.length * 2),
    })
    .returning();

  // Create beats from draft.
  //
  // `beats` comes from an AI-generated script draft, so b.type is untrusted. It is
  // written straight into a Postgres ENUM column: if the model ever emits a type
  // outside the enum (or renames one), the INSERT is rejected and the whole module
  // fails to publish. Coerce to a known beat type instead of trusting the model.
  if (beats.length > 0) {
    const rows: (typeof beatsTable.$inferInsert)[] = beats.map((b: any, i: number) => ({
      moduleId: mod.id,
      type: BEAT_TYPES.includes(b?.type) ? b.type : "points",
      order: i,
      title: b?.title ?? "",
      narration: b?.narration ?? "",
      bulletPoints: b?.bulletPoints ?? [],
      scenario: b?.scenario ?? null,
      audioStatus: "none",
    }));
    await db.insert(beatsTable).values(rows);
  }

  // Update beat count and course module count
  await db
    .update(modulesTable)
    .set({ beatCount: beats.length, updatedAt: new Date() })
    .where(eq(modulesTable.id, mod.id));
  await db
    .update(coursesTable)
    .set({ moduleCount: sql`${coursesTable.moduleCount} + 1` })
    .where(eq(coursesTable.id, courseId));

  // Mark draft as published
  await db
    .update(scriptDraftsTable)
    .set({ status: "published", updatedAt: new Date() })
    .where(eq(scriptDraftsTable.id, draft.id));

  // Return module detail
  const freshBeats = await db
    .select()
    .from(beatsTable)
    .where(eq(beatsTable.moduleId, mod.id));

  res.status(201).json({
    id: mod.id,
    courseId: mod.courseId,
    title: mod.title,
    description: mod.description,
    status: mod.status,
    order: mod.order,
    estimatedMinutes: mod.estimatedMinutes,
    beats: freshBeats.map(b => ({
      id: b.id,
      moduleId: b.moduleId,
      type: b.type,
      order: b.order,
      title: b.title,
      narration: b.narration,
      bulletPoints: b.bulletPoints,
      scenario: b.scenario,
      audioUrl: b.audioUrl,
      audioStatus: b.audioStatus,
    })),
    createdAt: mod.createdAt.toISOString(),
  });
});

export default router;
