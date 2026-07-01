import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, quizzesTable, classesTable, studentsTable } from "@workspace/paideia-db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, requireActiveTeacher } from "../../middlewares/auth.js";
import { requireQuota } from "../../middlewares/quota.js";
import { REGION_IDS } from "../../lib/catalog.js";
import { generateJSON } from "../../lib/openai.js";
import { logEvent } from "../../lib/eventLog.js";
import { quizPrompt, aggregateClassLearningProfile, type LearningProfile } from "../../lib/prompts.js";

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
  format: z
    .enum(["exit ticket", "starter quiz", "mid-unit check", "end-of-unit assessment"])
    .default("exit ticket"),
  questionCount: z.number().int().min(3).max(20).default(5),
  notes: z.string().max(1000).optional(),
  classId: z.string().uuid().optional(),
});

interface QuizContent {
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
    const prompt = quizPrompt({ ...parsed.data, classLearningProfile });
    const content = await generateJSON<QuizContent>(prompt.system, prompt.user, {
      teacherId: req.teacher!.id,
      kind: "quiz",
    });
    const title =
      (typeof content.title === "string" && content.title) ||
      `${parsed.data.subject} ${parsed.data.format}: ${parsed.data.topic}`;
    const [quiz] = await db
      .insert(quizzesTable)
      .values({
        teacherId: req.teacher!.id,
        title,
        region: parsed.data.region,
        subject: parsed.data.subject,
        yearGroup: parsed.data.yearGroup,
        topic: parsed.data.topic,
        format: parsed.data.format,
        questionCount: parsed.data.questionCount,
        content,
      })
      .returning();
    void logEvent(req, "quiz_created", {
      subject: parsed.data.subject,
      yearGroup: parsed.data.yearGroup,
      region: parsed.data.region,
      format: parsed.data.format,
      questionCount: parsed.data.questionCount,
      resourceId: quiz?.id,
    }, { surface: "app" });
    res.json({ quiz });
  } catch (err) {
    req.log?.error({ err }, "quiz generation failed");
    res.status(500).json({ error: "Generation failed. Please try again." });
  }
});

router.get("/", async (req, res) => {
  const quizzes = await db
    .select()
    .from(quizzesTable)
    .where(eq(quizzesTable.teacherId, req.teacher!.id))
    .orderBy(desc(quizzesTable.createdAt))
    .limit(100);
  res.json({ quizzes });
});

router.get("/:id", async (req, res) => {
  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const rows = await db
    .select()
    .from(quizzesTable)
    .where(
      and(eq(quizzesTable.id, id), eq(quizzesTable.teacherId, req.teacher!.id)),
    )
    .limit(1);
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ quiz: rows[0] });
});

const quizItemSchema = z
  .object({
    number: z.number().int().min(1),
    prompt: z.string().min(1).max(2000),
    type: z.enum(["multiple_choice", "short_answer", "true_false"]),
    options: z.array(z.string().max(500)).max(10).nullable(),
    correctAnswer: z.string().min(1).max(500),
    difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
    skillAssessed: z.string().max(300).default(""),
  })
  .superRefine((q, ctx) => {
    if (q.type === "multiple_choice") {
      const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Multiple choice needs at least 2 options." });
      }
    } else if (q.options !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Options must be null for non multiple-choice questions." });
    }
    if (q.type === "true_false") {
      const v = q.correctAnswer.trim().toLowerCase();
      if (v !== "true" && v !== "false") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["correctAnswer"], message: "True/false answer must be 'True' or 'False'." });
      }
    }
  });

const quizContentSchema = z.object({
  title: z.string().min(1).max(300),
  format: z.string().min(1).max(120),
  instructions: z.string().max(2000).default(""),
  items: z.array(quizItemSchema).min(1).max(40),
});

const updateQuizSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  content: quizContentSchema,
});

router.patch("/:id", async (req, res) => {
  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const parsed = updateQuizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const content = {
    ...parsed.data.content,
    items: parsed.data.content.items.map((it, i) => ({ ...it, number: i + 1 })),
  };
  const title = parsed.data.title ?? content.title;
  const result = await db
    .update(quizzesTable)
    .set({ title, content, format: content.format, questionCount: content.items.length })
    .where(and(eq(quizzesTable.id, id), eq(quizzesTable.teacherId, req.teacher!.id)))
    .returning();
  if (!result[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ quiz: result[0] });
});

router.delete("/:id", async (req, res) => {
  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  await db
    .delete(quizzesTable)
    .where(
      and(eq(quizzesTable.id, id), eq(quizzesTable.teacherId, req.teacher!.id)),
    );
  res.json({ ok: true });
});

export default router;
