import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  lessonPlansTable,
  studentsTable,
  submissionsTable,
  assignmentsTable,
  classesTable,
} from "@workspace/paideia-db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, requireActiveTeacher } from "../../middlewares/auth.js";
import { requireQuota } from "../../middlewares/quota.js";
import { REGION_IDS } from "../../lib/catalog.js";
import { generateJSON } from "../../lib/openai.js";
import { logEvent } from "../../lib/eventLog.js";
import { lessonPlanPrompt, aggregateClassLearningProfile, type StudentProfileSummary, type LearningProfile } from "../../lib/prompts.js";

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
  priorKnowledge: z.string().max(1000).optional(),
  durationMinutes: z.number().int().min(15).max(180).default(50),
  groupContext: z.string().max(1000).optional(),
  studentId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
});

interface FeedbackItem { state: string; skill?: string }

async function buildStudentProfile(teacherId: string, studentId: string): Promise<StudentProfileSummary | null> {
  const studentRows = await db
    .select()
    .from(studentsTable)
    .where(and(eq(studentsTable.id, studentId), eq(studentsTable.teacherId, teacherId)))
    .limit(1);
  const student = studentRows[0];
  if (!student) return null;
  const subs = await db
    .select({ submission: submissionsTable, assignment: assignmentsTable })
    .from(submissionsTable)
    .innerJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
    .where(eq(submissionsTable.studentId, studentId))
    .orderBy(desc(submissionsTable.submittedAt))
    .limit(20);
  const recent = subs.slice(0, 5).map((s) => ({
    title: s.assignment.title,
    percent: s.submission.maxAutoScore > 0 ? Math.round((s.submission.autoScore / s.submission.maxAutoScore) * 100) : 0,
    needsReviewCount: s.submission.needsReviewCount,
    submittedAt: s.submission.submittedAt.toISOString().slice(0, 10),
  }));
  let totalPct = 0;
  let scored = 0;
  const weak: Record<string, number> = {};
  const strong: Record<string, number> = {};
  for (const s of subs) {
    if (s.submission.maxAutoScore > 0) {
      totalPct += (s.submission.autoScore / s.submission.maxAutoScore) * 100;
      scored += 1;
    }
    const fb = (s.submission.feedback as FeedbackItem[] | null) ?? [];
    for (const item of fb) {
      if (!item.skill) continue;
      if (item.state === "incorrect") weak[item.skill] = (weak[item.skill] ?? 0) + 1;
      if (item.state === "correct") strong[item.skill] = (strong[item.skill] ?? 0) + 1;
    }
  }
  const top = (m: Record<string, number>, n = 5) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  return {
    displayName: `${student.firstName} ${student.lastInitial}`,
    yearGroup: "",
    averagePercent: scored > 0 ? Math.round(totalPct / scored) : null,
    totalAssessments: subs.length,
    recent,
    weakSkills: top(weak),
    strongSkills: top(strong).filter((s) => !weak[s] || strong[s]! > weak[s]!),
  };
}

interface LessonPlanContent {
  title?: string;
  [k: string]: unknown;
}

router.post("/", requireQuota, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  try {
    const { studentId, classId, ...rest } = parsed.data;
    let studentProfile: StudentProfileSummary | undefined;
    if (studentId) {
      const profile = await buildStudentProfile(req.teacher!.id, studentId);
      if (profile) {
        profile.yearGroup = parsed.data.yearGroup;
        studentProfile = profile;
      }
    }
    let classLearningProfile: LearningProfile | undefined;
    if (classId) {
      classLearningProfile = await fetchClassLearningProfile(classId, req.teacher!.id);
    }
    const promptInput = rest;
    if (studentProfile) (promptInput as any).studentProfile = studentProfile;
    if (classLearningProfile) (promptInput as any).classLearningProfile = classLearningProfile;
    const prompt = lessonPlanPrompt(promptInput);
    const content = await generateJSON<LessonPlanContent>(prompt.system, prompt.user, {
      teacherId: req.teacher!.id,
      kind: "lesson_plan",
    });
    const title =
      (typeof content.title === "string" && content.title) ||
      `${parsed.data.subject}: ${parsed.data.topic}`;
    const [plan] = await db
      .insert(lessonPlansTable)
      .values({
        teacherId: req.teacher!.id,
        title,
        region: parsed.data.region,
        subject: parsed.data.subject,
        yearGroup: parsed.data.yearGroup,
        topic: parsed.data.topic,
        priorKnowledge: parsed.data.priorKnowledge ?? null,
        durationMinutes: parsed.data.durationMinutes,
        groupContext: parsed.data.groupContext ?? null,
        content,
      })
      .returning();
    void logEvent(req, "lesson_plan_created", {
      subject: parsed.data.subject,
      yearGroup: parsed.data.yearGroup,
      region: parsed.data.region,
      withStudentProfile: Boolean(studentProfile),
      resourceId: plan?.id,
    }, { surface: "app" });
    res.json({ plan });
  } catch (err) {
    req.log?.error({ err }, "lesson plan generation failed");
    res.status(500).json({ error: "Generation failed. Please try again." });
  }
});

router.get("/", async (req, res) => {
  const plans = await db
    .select()
    .from(lessonPlansTable)
    .where(eq(lessonPlansTable.teacherId, req.teacher!.id))
    .orderBy(desc(lessonPlansTable.createdAt))
    .limit(100);
  res.json({ plans });
});

router.get("/:id", async (req, res) => {
  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const rows = await db
    .select()
    .from(lessonPlansTable)
    .where(
      and(eq(lessonPlansTable.id, id), eq(lessonPlansTable.teacherId, req.teacher!.id)),
    )
    .limit(1);
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ plan: rows[0] });
});

router.delete("/:id", async (req, res) => {
  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  await db
    .delete(lessonPlansTable)
    .where(
      and(eq(lessonPlansTable.id, id), eq(lessonPlansTable.teacherId, req.teacher!.id)),
    );
  res.json({ ok: true });
});

export default router;
