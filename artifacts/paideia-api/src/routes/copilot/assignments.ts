import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  classesTable,
  assignmentsTable,
  worksheetsTable,
  quizzesTable,
  submissionsTable,
  studentsTable,
} from "@workspace/paideia-db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, requireActiveTeacher } from "../../middlewares/auth.js";
import { generateShortCode } from "../../lib/auth.js";
import { generateJSON } from "../../lib/openai.js";
import { classGapReportPrompt, type ClassGapReportInput } from "../../lib/prompts.js";

interface FeedbackItem {
  number: number;
  given?: string;
  state: "correct" | "incorrect" | "partial" | "needs_review";
  skill?: string;
  misconception?: string;
}
interface ResourceQuestion { number: number; prompt: string; type: string; skill?: string }

const router: IRouter = Router();
router.use(requireAuth, requireActiveTeacher);

const createSchema = z.object({
  classId: z.string().uuid(),
  resourceKind: z.enum(["worksheet", "quiz"]),
  resourceId: z.string().uuid(),
  deliveryMode: z.enum(["share_link", "accounts"]),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const cls = await db
    .select()
    .from(classesTable)
    .where(and(eq(classesTable.id, parsed.data.classId), eq(classesTable.teacherId, req.teacher!.id)))
    .limit(1);
  if (!cls[0]) {
    res.status(404).json({ error: "Class not found" });
    return;
  }
  let title = "";
  let worksheetId: string | null = null;
  let quizId: string | null = null;
  if (parsed.data.resourceKind === "worksheet") {
    const rows = await db
      .select()
      .from(worksheetsTable)
      .where(and(eq(worksheetsTable.id, parsed.data.resourceId), eq(worksheetsTable.teacherId, req.teacher!.id)))
      .limit(1);
    if (!rows[0]) {
      res.status(404).json({ error: "Worksheet not found" });
      return;
    }
    title = rows[0].title;
    worksheetId = rows[0].id;
  } else {
    const rows = await db
      .select()
      .from(quizzesTable)
      .where(and(eq(quizzesTable.id, parsed.data.resourceId), eq(quizzesTable.teacherId, req.teacher!.id)))
      .limit(1);
    if (!rows[0]) {
      res.status(404).json({ error: "Quiz not found" });
      return;
    }
    title = rows[0].title;
    quizId = rows[0].id;
  }
  const shareCode = generateShortCode(8);
  const [row] = await db
    .insert(assignmentsTable)
    .values({
      teacherId: req.teacher!.id,
      classId: parsed.data.classId,
      resourceKind: parsed.data.resourceKind,
      worksheetId,
      quizId,
      title,
      deliveryMode: parsed.data.deliveryMode,
      shareCode,
    })
    .returning();
  res.json({ assignment: row });
});

router.get("/", async (req, res) => {
  const rows = await db
    .select({
      assignment: assignmentsTable,
      class: classesTable,
    })
    .from(assignmentsTable)
    .innerJoin(classesTable, eq(assignmentsTable.classId, classesTable.id))
    .where(eq(assignmentsTable.teacherId, req.teacher!.id))
    .orderBy(desc(assignmentsTable.createdAt))
    .limit(100);
  res.json({ assignments: rows });
});

router.get("/:id", async (req, res) => {
  const id = req.params["id"] as string;
  const rows = await db
    .select()
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.teacherId, req.teacher!.id)))
    .limit(1);
  const assignment = rows[0];
  if (!assignment) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const cls = (await db.select().from(classesTable).where(eq(classesTable.id, assignment.classId)).limit(1))[0]!;
  const submissions = await db
    .select({
      submission: submissionsTable,
      student: studentsTable,
    })
    .from(submissionsTable)
    .leftJoin(studentsTable, eq(submissionsTable.studentId, studentsTable.id))
    .where(eq(submissionsTable.assignmentId, id))
    .orderBy(desc(submissionsTable.submittedAt));
  const sanitised = submissions.map((s) => ({
    submission: s.submission,
    student: s.student ? (() => { const { passwordHash: _ph, ...rest } = s.student!; return rest; })() : null,
  }));
  res.json({ assignment, class: cls, submissions: sanitised });
});

// Class-level, learning-science gap report across all submissions for an assignment.
router.post("/:id/class-report", async (req, res) => {
  const id = req.params["id"] as string;
  const [assignment] = await db
    .select()
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.teacherId, req.teacher!.id)))
    .limit(1);
  if (!assignment) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Map question number -> prompt/type/skill from the assigned resource.
  const questionMeta = new Map<number, ResourceQuestion>();
  if (assignment.resourceKind === "quiz" && assignment.quizId) {
    const [q] = await db.select().from(quizzesTable).where(eq(quizzesTable.id, assignment.quizId)).limit(1);
    const items = ((q?.content as Record<string, unknown>)?.["items"] as Array<Record<string, unknown>> | undefined) ?? [];
    for (const it of items) questionMeta.set(Number(it["number"]), { number: Number(it["number"]), prompt: String(it["prompt"] ?? ""), type: String(it["type"] ?? ""), skill: it["skillAssessed"] ? String(it["skillAssessed"]) : undefined });
  } else if (assignment.worksheetId) {
    const [w] = await db.select().from(worksheetsTable).where(eq(worksheetsTable.id, assignment.worksheetId)).limit(1);
    const items = ((w?.content as Record<string, unknown>)?.["questions"] as Array<Record<string, unknown>> | undefined) ?? [];
    for (const it of items) questionMeta.set(Number(it["number"]), { number: Number(it["number"]), prompt: String(it["prompt"] ?? ""), type: String(it["type"] ?? ""), skill: it["workingOrRubric"] ? undefined : undefined });
  }

  const subs = await db.select().from(submissionsTable).where(eq(submissionsTable.assignmentId, id));
  const graded = subs.filter((s) => s.gradingStatus === "graded");
  if (graded.length === 0) {
    res.status(400).json({ error: "No graded submissions yet. Reports need at least one graded submission." });
    return;
  }

  // Aggregate per question and tally mastery bands.
  const agg = new Map<number, { correct: number; partial: number; incorrect: number; total: number; wrong: Set<string>; misc: Set<string> }>();
  const masteryTally: Record<string, number> = {};
  for (const s of graded) {
    const summary = s.aiSummary as { masteryLevel?: string } | null;
    if (summary?.masteryLevel) masteryTally[summary.masteryLevel] = (masteryTally[summary.masteryLevel] ?? 0) + 1;
    const fb = (Array.isArray(s.feedback) ? s.feedback : []) as FeedbackItem[];
    for (const f of fb) {
      const a = agg.get(f.number) ?? { correct: 0, partial: 0, incorrect: 0, total: 0, wrong: new Set<string>(), misc: new Set<string>() };
      a.total += 1;
      if (f.state === "correct") a.correct += 1;
      else if (f.state === "partial") a.partial += 1;
      else a.incorrect += 1;
      if (f.state !== "correct" && f.given && f.given.trim()) a.wrong.add(f.given.trim().slice(0, 120));
      if (f.misconception) a.misc.add(f.misconception.slice(0, 200));
      agg.set(f.number, a);
    }
  }

  const questions: ClassGapReportInput["questions"] = [...agg.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([number, a]) => {
      const meta = questionMeta.get(number);
      const q: ClassGapReportInput["questions"][number] = {
        number,
        prompt: meta?.prompt ?? `Question ${number}`,
        type: meta?.type ?? "",
        correct: a.correct,
        partial: a.partial,
        incorrect: a.incorrect,
        total: a.total,
        wrongSamples: [...a.wrong],
        misconceptions: [...a.misc],
      };
      if (meta?.skill) q.skill = meta.skill;
      return q;
    });

  try {
    const prompt = classGapReportPrompt({
      title: assignment.title,
      kind: assignment.resourceKind === "quiz" ? "quiz" : "worksheet",
      submissionCount: graded.length,
      questions,
      masteryTally,
    });
    const report = await generateJSON(prompt.system, prompt.user, { teacherId: req.teacher!.id, kind: "class_gap_report" });
    res.json({ report, submissionCount: graded.length, generatedAt: new Date().toISOString() });
  } catch (err) {
    req.log?.error({ err }, "class gap report failed");
    res.status(500).json({ error: "Could not generate the class report. Please try again." });
  }
});

router.patch("/:id", async (req, res) => {
  const id = req.params["id"] as string;
  const schema = z.object({ closed: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [row] = await db
    .update(assignmentsTable)
    .set({ closed: parsed.data.closed })
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.teacherId, req.teacher!.id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ assignment: row });
});

router.delete("/:id", async (req, res) => {
  const id = req.params["id"] as string;
  await db
    .delete(assignmentsTable)
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.teacherId, req.teacher!.id)));
  res.json({ ok: true });
});

export default router;
