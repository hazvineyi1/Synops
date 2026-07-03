import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  studyMockExamsTable,
  studyConceptsTable,
} from "@workspace/paideia-db";
import { eq, and, desc } from "drizzle-orm";
import { requireStudyUser } from "../../middlewares/auth.js";
import { generateJSON } from "../../lib/openai.js";
import { isPaidTier, countMockExams, FREE_LIMITS } from "../../lib/billing/limits.js";
import { randomUUID } from "crypto";

const router: IRouter = Router();
router.use(requireStudyUser);

const FORMATS = ["multiple-choice", "short-answer", "essay", "fact-pattern"] as const;
type ExamFormat = (typeof FORMATS)[number];

type ExamQuestion = {
  id: string;
  prompt: string;
  conceptId: string | null;
  points: number;
  format: ExamFormat;
  options?: string[];
  correctOptionIndex?: number;
  explanation?: string;
  modelAnswer?: string;
  scoringPoints?: string[];
};

type ExamAnswer = {
  questionId: string;
  selectedOptionIndex?: number;
  freeformAnswer?: string;
  aiScore?: number;
  aiFeedback?: string;
  aiCoveredPoints?: string[];
};

const createExamSchema = z.object({
  title: z.string().min(1).optional(),
  materialId: z.string().nullable().optional(),
  conceptIds: z.array(z.string()).optional(),
  questionCount: z.number().int().min(5).max(50).default(20),
  timeLimitMinutes: z.number().int().min(5).max(180).default(30),
  format: z.enum(FORMATS).default("multiple-choice"),
});

const submitExamSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string(),
      selectedOptionIndex: z.number().int().optional(),
      freeformAnswer: z.string().optional(),
    }),
  ),
  timeSpentSeconds: z.number().int().min(0),
});

router.get("/", async (req, res) => {
  const userId = req.studyUser!.id;
  const rows = await db
    .select()
    .from(studyMockExamsTable)
    .where(eq(studyMockExamsTable.userId, userId))
    .orderBy(desc(studyMockExamsTable.createdAt));
  res.json(rows);
});

router.post("/", async (req, res) => {
  const parsed = createExamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const data = parsed.data;
  const userId = req.studyUser!.id;

  // Free tier: one mock exam total, then upgrade (mock exams are a paid feature).
  if (!isPaidTier(req.studyUser!.subscriptionTier)) {
    const used = await countMockExams(userId);
    if (used >= FREE_LIMITS.mockExamsTotal) {
      res.status(402).json({
        error: "You've used your free mock exam. Upgrade to Plus for unlimited exams.",
        code: "upgrade_required",
        feature: "exams",
      });
      return;
    }
  }

  let concepts: { id: string; title: string; explanation: string }[] = [];
  if (data.conceptIds && data.conceptIds.length > 0) {
    concepts = await db
      .select()
      .from(studyConceptsTable)
      .where(and(eq(studyConceptsTable.userId, userId), eq(studyConceptsTable.id, data.conceptIds[0])))
      .limit(20);
  } else if (data.materialId) {
    concepts = await db
      .select()
      .from(studyConceptsTable)
      .where(and(eq(studyConceptsTable.userId, userId), eq(studyConceptsTable.materialId, data.materialId)))
      .limit(20);
  } else {
    concepts = await db
      .select()
      .from(studyConceptsTable)
      .where(eq(studyConceptsTable.userId, userId))
      .limit(20);
  }

  const conceptTexts = concepts.map((c) => `Concept: ${c.title}\n${c.explanation}`).join("\n\n");
  const questions: ExamQuestion[] = [];
  const targetCount = Math.min(data.questionCount, data.format === "essay" ? 5 : 10);

  try {
    if (data.format === "multiple-choice") {
      const aiQuestions = await generateJSON<{
        questions: Array<{
          prompt: string;
          options: string[];
          correctOptionIndex: number;
          explanation: string;
          points: number;
        }>;
      }>(
        "You are an expert exam writer. Generate multiple-choice questions with 4 plausible distractors each. Return JSON {\"questions\":[...]}. Each question must include prompt, options (4 strings), correctOptionIndex (0-3), explanation, and points (1-5).",
        `Generate ${targetCount} multiple-choice exam questions strictly from these concepts:\n\n${conceptTexts.slice(0, 4000)}`,
        { kind: "study_exam_mcq" },
      );
      for (const [i, q] of aiQuestions.questions.entries()) {
        questions.push({
          id: randomUUID(),
          prompt: q.prompt,
          options: q.options.slice(0, 4),
          correctOptionIndex: Math.max(0, Math.min(3, q.correctOptionIndex)),
          explanation: q.explanation,
          conceptId: concepts[i % Math.max(1, concepts.length)]?.id ?? null,
          points: Math.max(1, Math.min(5, q.points ?? 1)),
          format: "multiple-choice",
        });
      }
    } else {
      const formatGuide = (() => {
        switch (data.format) {
          case "short-answer":
            return "Generate short-answer questions that can be answered in 2-4 sentences. Each must have a modelAnswer (2-3 sentences) and 3-5 scoringPoints (concrete facts/ideas the learner's answer should contain).";
          case "essay":
            return "Generate essay prompts requiring multi-paragraph analysis. Each must have a modelAnswer (5-8 sentences outlining a strong response) and 4-6 scoringPoints (key arguments, structures, or evidence a strong essay should include).";
          case "fact-pattern":
            return "Generate fact-pattern questions: present a realistic scenario (3-6 sentences), then ask the learner to analyze/diagnose/apply the relevant principles. Each must have a modelAnswer (4-6 sentences) and 4-6 scoringPoints (specific issues, principles, or steps the learner must identify).";
        }
      })();

      const aiQuestions = await generateJSON<{
        questions: Array<{
          prompt: string;
          modelAnswer: string;
          scoringPoints: string[];
          points: number;
        }>;
      }>(
        `You are an expert exam writer. ${formatGuide} Return JSON {\"questions\":[...]}. Each question must include prompt, modelAnswer, scoringPoints (string array), and points (1-5).`,
        `Generate ${targetCount} ${data.format} questions strictly from these concepts:\n\n${conceptTexts.slice(0, 4000)}`,
        { kind: `study_exam_${data.format}` },
      );
      for (const [i, q] of aiQuestions.questions.entries()) {
        questions.push({
          id: randomUUID(),
          prompt: q.prompt,
          modelAnswer: q.modelAnswer,
          scoringPoints: Array.isArray(q.scoringPoints) ? q.scoringPoints.slice(0, 8) : [],
          conceptId: concepts[i % Math.max(1, concepts.length)]?.id ?? null,
          points: Math.max(1, Math.min(5, q.points ?? 2)),
          format: data.format,
        });
      }
    }
  } catch (err) {
    req.log?.warn({ err }, "AI exam generation failed, using fallback");
    // Minimal fallback: for any format, build a question per concept.
    for (const c of concepts.slice(0, targetCount)) {
      if (data.format === "multiple-choice") {
        questions.push({
          id: randomUUID(),
          prompt: `Which best describes: ${c.title}?`,
          options: [`Correct: ${c.explanation.slice(0, 50)}…`, "Wrong A", "Wrong B", "Wrong C"],
          correctOptionIndex: 0,
          explanation: c.explanation,
          conceptId: c.id,
          points: 1,
          format: "multiple-choice",
        });
      } else {
        questions.push({
          id: randomUUID(),
          prompt: `Explain ${c.title} in your own words and give an example.`,
          modelAnswer: c.explanation,
          scoringPoints: [c.title],
          conceptId: c.id,
          points: 2,
          format: data.format,
        });
      }
    }
  }

  const title = data.title ?? `${labelFormat(data.format)} Exam, ${new Date().toLocaleDateString()}`;
  const maxScore = questions.reduce((sum, q) => sum + q.points, 0);

  const [exam] = await db
    .insert(studyMockExamsTable)
    .values({
      userId,
      materialId: data.materialId ?? null,
      title,
      questionCount: questions.length,
      timeLimitMinutes: data.timeLimitMinutes,
      questions,
      maxScore,
      format: data.format,
    })
    .returning();

  res.status(201).json(exam);
});

router.get("/:examId", async (req, res) => {
  const userId = req.studyUser!.id;
  const examId = req.params.examId;
  const rows = await db
    .select()
    .from(studyMockExamsTable)
    .where(and(eq(studyMockExamsTable.userId, userId), eq(studyMockExamsTable.id, examId)))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(rows[0]);
});

router.post("/:examId/submit", async (req, res) => {
  const userId = req.studyUser!.id;
  const examId = req.params.examId;
  const parsed = submitExamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { answers, timeSpentSeconds } = parsed.data;

  const rows = await db
    .select()
    .from(studyMockExamsTable)
    .where(and(eq(studyMockExamsTable.userId, userId), eq(studyMockExamsTable.id, examId)))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const exam = rows[0];

  // We accept incremental submissions, only grade the answers that arrived this call,
  // and merge with anything already persisted. The frontend submits one question at a time.
  const existingAnswers: ExamAnswer[] = Array.isArray(exam.answers) ? (exam.answers as ExamAnswer[]) : [];
  const gradedThisCall: Array<ExamAnswer & { correct?: boolean; explanation?: string; modelAnswer?: string }> = [];

  // Validate each answer matches its question's required shape BEFORE grading. We reject the
  // whole batch on first malformed answer rather than silently grading garbage, completion
  // status is count-based and a placeholder submission would otherwise force "completed".
  for (const answer of answers) {
    const q = (exam.questions as ExamQuestion[]).find((qq) => qq.id === answer.questionId);
    if (!q) {
      res.status(400).json({ error: `Unknown question id: ${answer.questionId}` });
      return;
    }
    const isMcq = q.format === "multiple-choice" || (!q.format && typeof q.correctOptionIndex === "number");
    if (isMcq) {
      const idx = answer.selectedOptionIndex;
      const optionCount = q.options?.length ?? 0;
      if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= optionCount) {
        res.status(400).json({ error: "Multiple-choice answer requires a valid selectedOptionIndex." });
        return;
      }
    } else {
      const text = (answer.freeformAnswer ?? "").trim();
      if (text.length < 5) {
        res.status(400).json({ error: "Free-form answer must be at least 5 characters." });
        return;
      }
    }
  }

  for (const answer of answers) {
    const q = (exam.questions as ExamQuestion[]).find((qq) => qq.id === answer.questionId)!;

    if (q.format === "multiple-choice" || (!q.format && typeof q.correctOptionIndex === "number")) {
      const correct = answer.selectedOptionIndex === q.correctOptionIndex;
      gradedThisCall.push({
        questionId: q.id,
        selectedOptionIndex: answer.selectedOptionIndex,
        aiScore: correct ? 1 : 0,
        correct,
        explanation: q.explanation,
      });
    } else {
      // Free-form: AI-grade against scoringPoints + modelAnswer. Text is already validated non-empty above.
      const userText = (answer.freeformAnswer ?? "").trim();
      let aiScore = 0;
      let aiFeedback = "";
      let coveredPoints: string[] = [];

      {
        try {
          const grading = await generateJSON<{
            score: number;
            feedback: string;
            coveredPoints: string[];
          }>(
            `You are a strict but fair exam grader. Score the learner's free-form answer against the rubric.
Return JSON {"score": number 0..1, "feedback": string (2-4 sentences, address the learner directly), "coveredPoints": string[] (which scoring points were clearly covered, copied verbatim from the rubric)}.
Be specific: cite what the learner did well and what they missed. Do not over-praise.`,
            `Question (${q.format}):\n${q.prompt}\n\nModel answer:\n${q.modelAnswer ?? "(none provided)"}\n\nScoring points to look for:\n${(q.scoringPoints ?? []).map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\nLearner's answer:\n${userText}`,
            { kind: `study_exam_grade_${q.format}` },
          );
          aiScore = Math.max(0, Math.min(1, Number(grading.score) || 0));
          aiFeedback = String(grading.feedback ?? "");
          coveredPoints = Array.isArray(grading.coveredPoints) ? grading.coveredPoints.slice(0, 10) : [];
        } catch (err) {
          req.log?.warn({ err }, "AI grading failed");
          aiFeedback = "We couldn't auto-grade this one, your answer is saved. (Grader temporarily unavailable.)";
        }
      }

      gradedThisCall.push({
        questionId: q.id,
        freeformAnswer: userText,
        aiScore,
        aiFeedback,
        aiCoveredPoints: coveredPoints,
        correct: aiScore >= 0.7,
        modelAnswer: q.modelAnswer,
      });
    }
  }

  // Merge: prefer the new graded entries over older ones for the same questionId.
  const mergedById = new Map<string, ExamAnswer>();
  for (const a of existingAnswers) mergedById.set(a.questionId, a);
  for (const a of gradedThisCall) {
    mergedById.set(a.questionId, {
      questionId: a.questionId,
      selectedOptionIndex: a.selectedOptionIndex,
      freeformAnswer: a.freeformAnswer,
      aiScore: a.aiScore,
      aiFeedback: a.aiFeedback,
      aiCoveredPoints: a.aiCoveredPoints,
    });
  }
  const allAnswers = Array.from(mergedById.values());

  // Score across all answered questions (so partial state is meaningful too).
  let score = 0;
  let correctCount = 0;
  const conceptStats: Record<string, { correct: number; total: number; title: string }> = {};
  for (const a of allAnswers) {
    const q = (exam.questions as ExamQuestion[]).find((qq) => qq.id === a.questionId);
    if (!q) continue;
    const earned = (a.aiScore ?? 0) * q.points;
    score += earned;
    if ((a.aiScore ?? 0) >= 0.7) correctCount += 1;
    if (q.conceptId) {
      const s = conceptStats[q.conceptId] ?? { correct: 0, total: 0, title: q.prompt.slice(0, 30) };
      s.total += 1;
      if ((a.aiScore ?? 0) >= 0.7) s.correct += 1;
      conceptStats[q.conceptId] = s;
    }
  }

  const maxScore = exam.maxScore ?? exam.questionCount;
  const allQuestionsAnswered = allAnswers.length >= exam.questionCount;

  await db
    .update(studyMockExamsTable)
    .set({
      answers: allAnswers,
      score,
      status: allQuestionsAnswered ? "completed" : "in_progress",
      timeSpentSeconds,
      completedAt: allQuestionsAnswered ? new Date() : null,
    })
    .where(eq(studyMockExamsTable.id, examId));

  // Per-question response payload for the just-submitted answer (the frontend submits one at a time
  // and uses this to render immediate feedback).
  const latest = gradedThisCall[gradedThisCall.length - 1];
  const conceptBreakdown = Object.entries(conceptStats).map(([conceptId, stats]) => ({
    conceptId,
    conceptTitle: stats.title,
    correct: stats.correct,
    total: stats.total,
    percentage: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
  }));

  res.json({
    score,
    maxScore,
    percentage: maxScore > 0 ? (score / maxScore) * 100 : 0,
    correctCount,
    timeSpentSeconds,
    conceptBreakdown,
    // Per-answer feedback (last submitted)
    correct: latest?.correct ?? false,
    explanation: latest?.explanation,
    aiScore: latest?.aiScore,
    aiFeedback: latest?.aiFeedback,
    aiCoveredPoints: latest?.aiCoveredPoints,
    modelAnswer: latest?.modelAnswer,
  });
});

function labelFormat(f: ExamFormat): string {
  switch (f) {
    case "multiple-choice": return "Mock";
    case "short-answer": return "Short-Answer";
    case "essay": return "Essay";
    case "fact-pattern": return "Fact-Pattern";
  }
}

export default router;
