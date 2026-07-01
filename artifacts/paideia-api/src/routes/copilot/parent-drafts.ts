import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, parentDraftsTable } from "@workspace/paideia-db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, requireActiveTeacher } from "../../middlewares/auth.js";
import { requireQuota } from "../../middlewares/quota.js";
import { REGION_IDS } from "../../lib/catalog.js";
import { generateJSON } from "../../lib/openai.js";
import { logEvent } from "../../lib/eventLog.js";
import { parentDraftPrompt } from "../../lib/prompts.js";

const router: IRouter = Router();
router.use(requireAuth, requireActiveTeacher);

const createSchema = z.object({
  region: z.string().refine((v) => REGION_IDS.includes(v)),
  studentName: z.string().min(1).max(120),
  yearGroup: z.string().max(40).optional(),
  tone: z
    .enum(["warm and positive", "gently concerned", "factual and brief", "celebratory"])
    .default("warm and positive"),
  keyPoints: z.string().min(5).max(2000),
});

interface ParentDraftContent {
  subject?: string;
  [k: string]: unknown;
}

router.post("/", requireQuota, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  try {
    const prompt = parentDraftPrompt({
      ...parsed.data,
      teacherName: req.teacher!.name,
    });
    const content = await generateJSON<ParentDraftContent>(prompt.system, prompt.user, {
      teacherId: req.teacher!.id,
      kind: "parent_draft",
    });
    const [draft] = await db
      .insert(parentDraftsTable)
      .values({
        teacherId: req.teacher!.id,
        studentName: parsed.data.studentName,
        region: parsed.data.region,
        yearGroup: parsed.data.yearGroup ?? null,
        tone: parsed.data.tone,
        keyPoints: parsed.data.keyPoints,
        content,
      })
      .returning();
    void logEvent(req, "parent_draft_created", {
      region: parsed.data.region,
      tone: parsed.data.tone,
      resourceId: draft?.id,
    }, { surface: "app" });
    res.json({ draft });
  } catch (err) {
    req.log?.error({ err }, "parent draft generation failed");
    res.status(500).json({ error: "Generation failed. Please try again." });
  }
});

router.get("/", async (req, res) => {
  const drafts = await db
    .select()
    .from(parentDraftsTable)
    .where(eq(parentDraftsTable.teacherId, req.teacher!.id))
    .orderBy(desc(parentDraftsTable.createdAt))
    .limit(100);
  res.json({ drafts });
});

router.get("/:id", async (req, res) => {
  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const rows = await db
    .select()
    .from(parentDraftsTable)
    .where(
      and(eq(parentDraftsTable.id, id), eq(parentDraftsTable.teacherId, req.teacher!.id)),
    )
    .limit(1);
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ draft: rows[0] });
});

router.delete("/:id", async (req, res) => {
  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  await db
    .delete(parentDraftsTable)
    .where(
      and(eq(parentDraftsTable.id, id), eq(parentDraftsTable.teacherId, req.teacher!.id)),
    );
  res.json({ ok: true });
});

export default router;
