import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, worksheetsTable, classesTable, studentsTable } from "@workspace/paideia-db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, requireActiveTeacher } from "../../middlewares/auth.js";
import { requireQuota } from "../../middlewares/quota.js";
import { REGION_IDS } from "../../lib/catalog.js";
import { generateJSON } from "../../lib/openai.js";
import { logEvent } from "../../lib/eventLog.js";
import { worksheetPrompt, aggregateClassLearningProfile, type LearningProfile } from "../../lib/prompts.js";

async function fetchClassLearningProfile(classId: string, teacherId: string): Promise<LearningProfile | undefined> {
  const [cls] = await db
    .select()
    .from(classesTable)
    .where(and(eq(classesTable.id, classId), eq(classesTable.teacherId, teacherId)))
    .limit(1);
  if (!cls) return undefined;
  const students = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.classId, classId));
  return aggregateClassLearningProfile(students);
}

const router: IRouter = Router();
router.use(requireAuth, requireActiveTeacher);

const createSchema = z.object({
  region: z.string().refine((v) => REGION_IDS.includes(v)),
  subject: z.string().min(1).max(120),
  yearGroup: z.string().min(1).max(40),
  topic: z.string().min(2).max(500),
  difficulty: z.enum(["support", "core", "stretch", "mixed"]).default("core"),
  questionCount: z.number().int().min(3).max(30).default(10),
  notes: z.string().max(1000).optional(),
  classId: z.string().uuid().optional(),
});

interface WorksheetContent {
  title?: string;
  [k: string]: unknown;
}

router.post("/", requireQuota, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  try {
    let classLearningProfile: LearningProfile | undefined;
    if (parsed.data.classId) {
      classLearningProfile = await fetchClassLearningProfile(parsed.data.classId, req.teacher!.id);
    }
    const prompt = worksheetPrompt({ ...parsed.data, classLearningProfile });
    const content = await generateJSON<WorksheetContent>(prompt.system, prompt.user, {
      teacherId: req.teacher!.id,
      kind: "worksheet",
    });
    const title =
      (typeof content.title === "string" && content.title) ||
      `${parsed.data.subject} worksheet: ${parsed.data.topic}`;
    const [worksheet] = await db
      .insert(worksheetsTable)
      .values({
        teacherId: req.teacher!.id,
        title,
        region: parsed.data.region,
        subject: parsed.data.subject,
        yearGroup: parsed.data.yearGroup,
        topic: parsed.data.topic,
        difficulty: parsed.data.difficulty,
        questionCount: parsed.data.questionCount,
        content,
      })
      .returning();
    void logEvent(req, "worksheet_created", {
      subject: parsed.data.subject,
      yearGroup: parsed.data.yearGroup,
      region: parsed.data.region,
      difficulty: parsed.data.difficulty,
      questionCount: parsed.data.questionCount,
      resourceId: worksheet?.id,
    }, { surface: "app" });
    res.json({ worksheet });
  } catch (err) {
    req.log?.error({ err }, "worksheet generation failed");
    res.status(500).json({ error: "Generation failed. Please try again." });
  }
});

router.get("/", async (req, res) => {
  const worksheets = await db
    .select()
    .from(worksheetsTable)
    .where(eq(worksheetsTable.teacherId, req.teacher!.id))
    .orderBy(desc(worksheetsTable.createdAt))
    .limit(100);
  res.json({ worksheets });
});

router.get("/:id", async (req, res) => {
  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const rows = await db
    .select()
    .from(worksheetsTable)
    .where(
      and(eq(worksheetsTable.id, id), eq(worksheetsTable.teacherId, req.teacher!.id)),
    )
    .limit(1);
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ worksheet: rows[0] });
});

const worksheetQuestionSchema = z
  .object({
    number: z.number().int().min(1),
    prompt: z.string().min(1).max(2000),
    type: z.enum(["short", "multiple_choice", "long", "calculation"]),
    options: z.array(z.string().max(500)).max(10).nullable(),
    answer: z.string().max(2000),
    workingOrRubric: z.string().max(2000).default(""),
  })
  .superRefine((q, ctx) => {
    if (q.type === "multiple_choice") {
      const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Multiple choice needs at least 2 options." });
      }
      if (!q.answer.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["answer"], message: "Multiple choice requires an answer." });
      }
    } else if (q.options !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Options must be null for non multiple-choice questions." });
    }
  });

const worksheetContentSchema = z.object({
  title: z.string().min(1).max(300),
  instructions: z.string().max(2000).default(""),
  questions: z.array(worksheetQuestionSchema).min(1).max(50),
  teacherNotes: z.string().max(2000).default(""),
});

const updateWorksheetSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  content: worksheetContentSchema,
});

router.patch("/:id", async (req, res) => {
  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const parsed = updateWorksheetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  // Renumber to keep the questions array clean and consecutive.
  const content = {
    ...parsed.data.content,
    questions: parsed.data.content.questions.map((q, i) => ({ ...q, number: i + 1 })),
  };
  const title = parsed.data.title ?? content.title;
  const result = await db
    .update(worksheetsTable)
    .set({ title, content, questionCount: content.questions.length })
    .where(and(eq(worksheetsTable.id, id), eq(worksheetsTable.teacherId, req.teacher!.id)))
    .returning();
  if (!result[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ worksheet: result[0] });
});

router.delete("/:id", async (req, res) => {
  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  await db
    .delete(worksheetsTable)
    .where(
      and(eq(worksheetsTable.id, id), eq(worksheetsTable.teacherId, req.teacher!.id)),
    );
  res.json({ ok: true });
});

export default router;
