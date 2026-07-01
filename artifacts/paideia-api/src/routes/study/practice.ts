import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  studyPracticeSessionsTable,
  studyConceptsTable,
  studyFlashcardsTable,
  studyMaterialsTable,
} from "@workspace/paideia-db";
import { eq, and } from "drizzle-orm";
import { requireStudyUser } from "../../middlewares/auth.js";
import { generateJSON } from "../../lib/openai.js";
import { randomUUID } from "crypto";

const router: IRouter = Router();
router.use(requireStudyUser);

const createInputSchema = z.object({
  materialId: z.string().nullable().optional(),
  conceptIds: z.array(z.string()).optional(),
  questionCount: z.number().int().min(1).max(50).default(10),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
});

const answerInputSchema = z.object({
  questionId: z.string(),
  selectedOptionIndex: z.number().int(),
  confidence: z.number().int().min(1).max(5),
});

// DELETE /study/practice/sessions  - wipe all practice sessions for current user
// (useful to clear stale sessions from before the strict-prompt fix that may
// contain off-topic / cross-domain questions)
router.delete("/sessions", async (req, res) => {
  const userId = req.studyUser!.id;
  await db
    .delete(studyPracticeSessionsTable)
    .where(eq(studyPracticeSessionsTable.userId, userId));
  res.json({ success: true });
});

router.post("/", async (req, res) => {
  const parsed = createInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const data = parsed.data;
  const userId = req.studyUser!.id;

  // Load concepts for question generation, STRICTLY scoped to selected material
  let concepts: { id: string; title: string; explanation: string; difficulty: string; materialId: string | null }[] = [];
  if (data.conceptIds && data.conceptIds.length > 0) {
    concepts = await db
      .select()
      .from(studyConceptsTable)
      .where(and(eq(studyConceptsTable.userId, userId), eq(studyConceptsTable.id, data.conceptIds[0])));
    concepts = concepts.slice(0, 20);
  } else if (data.materialId) {
    concepts = await db
      .select()
      .from(studyConceptsTable)
      .where(and(eq(studyConceptsTable.userId, userId), eq(studyConceptsTable.materialId, data.materialId)))
      .limit(40);
  } else {
    concepts = await db
      .select()
      .from(studyConceptsTable)
      .where(eq(studyConceptsTable.userId, userId))
      .limit(40);
  }

  // Look up the material title so the AI knows what subject to stay inside
  let materialTitle: string | null = null;
  if (data.materialId) {
    const mat = await db
      .select()
      .from(studyMaterialsTable)
      .where(and(eq(studyMaterialsTable.userId, userId), eq(studyMaterialsTable.id, data.materialId)))
      .limit(1);
    materialTitle = mat[0]?.title ?? null;
  }

  if (concepts.length === 0) {
    res.status(400).json({
      error: "This material has no extracted concepts yet. Open the material and wait for AI extraction to finish, then try again.",
    });
    return;
  }

  const conceptTexts = concepts
    .map((c, i) => `[${i + 1}] ${c.title}\n${c.explanation}`)
    .join("\n\n");

  type GenQ = {
    id: string;
    prompt: string;
    options: string[];
    correctOptionIndex: number;
    explanation: string;
    conceptId: string | null;
    difficulty: string;
  };
  let questions: GenQ[] = [];

  const difficultyInstruction =
    data.difficulty === "mixed"
      ? "Mix easy/medium/hard across the set."
      : `All questions should be ${data.difficulty} difficulty.`;

  try {
    const subjectLine = materialTitle
      ? `SUBJECT: "${materialTitle}". You may ONLY generate questions about THIS subject using the numbered concepts below. Do NOT introduce content from other domains (e.g., if subject is CompTIA, do not ask about PMI/PMP and vice versa).`
      : "Use ONLY the numbered concepts below. Do not introduce outside knowledge.";

    const aiQuestions = await generateJSON<
      Array<{
        prompt: string;
        options: string[];
        correctOptionIndex: number;
        explanation: string;
        difficulty: string;
        conceptIndex?: number;
      }>
    >(
      `You are an expert test writer. ${subjectLine} Each question must have exactly 4 plausible options with exactly one correct. Include a "conceptIndex" field referencing which numbered concept it tests. ${difficultyInstruction} Return JSON: { "questions": [ ... ] }.`,
      `Generate ${data.questionCount} multiple-choice questions strictly from these concepts:\n\n${conceptTexts.slice(0, 8000)}`,
      { kind: "study_practice_questions" },
    );

    const questionArray: Array<{
      prompt: string;
      options: string[];
      correctOptionIndex: number;
      explanation: string;
      difficulty: string;
      conceptIndex?: number;
    }> = Array.isArray(aiQuestions)
      ? (aiQuestions as Array<{ prompt: string; options: string[]; correctOptionIndex: number; explanation: string; difficulty: string; conceptIndex?: number }>)
      // OpenAI structured-output wrappers often return { questions: [...] }
      : Array.isArray((aiQuestions as unknown as { questions?: unknown })?.questions)
        ? ((aiQuestions as unknown as { questions: Array<{ prompt: string; options: string[]; correctOptionIndex: number; explanation: string; difficulty: string; conceptIndex?: number }> }).questions)
        : [];

    questions = questionArray
      .filter((q) => q && Array.isArray(q.options) && q.options.length >= 2 && typeof q.prompt === "string")
      .map((q, i) => {
        const opts = q.options.slice(0, 4);
        // pad to 4 options if AI returned fewer
        while (opts.length < 4) opts.push("None of the above");
        const conceptIdx =
          typeof q.conceptIndex === "number" && q.conceptIndex >= 1 && q.conceptIndex <= concepts.length
            ? q.conceptIndex - 1
            : i % concepts.length;
        return {
          id: randomUUID(),
          prompt: q.prompt,
          options: opts,
          correctOptionIndex: Math.max(0, Math.min(3, q.correctOptionIndex ?? 0)),
          explanation: q.explanation ?? "",
          conceptId: concepts[conceptIdx]?.id ?? null,
          difficulty: q.difficulty ?? "medium",
        };
      });
  } catch (err) {
    req.log?.warn({ err }, "AI question generation failed");
    questions = [];
  }

  // Fallback when AI returns nothing usable, flashcards scoped to the same material
  if (questions.length === 0) {
    const fcWhere = data.materialId
      ? and(eq(studyFlashcardsTable.userId, userId), eq(studyFlashcardsTable.materialId, data.materialId))
      : eq(studyFlashcardsTable.userId, userId);
    const flashcards = await db.select().from(studyFlashcardsTable).where(fcWhere).limit(data.questionCount);

    if (flashcards.length === 0) {
      res.status(502).json({
        error:
          "Couldn't generate questions for this material right now. Try again, or open the material and verify it has extracted concepts.",
      });
      return;
    }

    // Distractors drawn from OTHER flashcards in the same material so they're plausible
    questions = flashcards.map((f) => {
      const distractors = flashcards
        .filter((x) => x.id !== f.id)
        .map((x) => x.back)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      while (distractors.length < 3) distractors.push("None of the above");
      const all = [f.back, ...distractors];
      // shuffle and remember correct index
      const idx = Math.floor(Math.random() * 4);
      const final = [...all];
      [final[0], final[idx]] = [final[idx], final[0]];
      return {
        id: randomUUID(),
        prompt: f.front,
        options: final,
        correctOptionIndex: idx,
        explanation: f.back,
        conceptId: f.conceptId,
        difficulty: "medium",
      };
    });
  }

  const [session] = await db
    .insert(studyPracticeSessionsTable)
    .values({
      userId,
      materialId: data.materialId ?? null,
      status: "active",
      questionCount: questions.length,
      questions,
    })
    .returning();

  res.status(201).json({
    ...session,
    currentQuestion: questions[0] ?? null,
  });
});

router.get("/:sessionId", async (req, res) => {
  const userId = req.studyUser!.id;
  const sessionId = req.params.sessionId;
  const rows = await db
    .select()
    .from(studyPracticeSessionsTable)
    .where(and(eq(studyPracticeSessionsTable.userId, userId), eq(studyPracticeSessionsTable.id, sessionId)))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const session = rows[0];
  const nextQ = session.questions[session.answeredCount] ?? null;
  res.json({
    ...session,
    currentQuestion: nextQ,
  });
});

router.post("/:sessionId/answer", async (req, res) => {
  const userId = req.studyUser!.id;
  const sessionId = req.params.sessionId;
  const parsed = answerInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { questionId, selectedOptionIndex, confidence } = parsed.data;

  const rows = await db
    .select()
    .from(studyPracticeSessionsTable)
    .where(and(eq(studyPracticeSessionsTable.userId, userId), eq(studyPracticeSessionsTable.id, sessionId)))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const session = rows[0];

  const question = session.questions.find((q: { id: string; correctOptionIndex: number }) => q.id === questionId);
  if (!question) {
    res.status(400).json({ error: "Question not found in session" });
    return;
  }

  const correct = selectedOptionIndex === question.correctOptionIndex;
  const newAnswers = [
    ...session.answers,
    {
      questionId,
      selectedOptionIndex,
      confidence,
      correct,
      answeredAt: new Date().toISOString(),
    },
  ];

  const answeredCount = session.answeredCount + 1;
  const correctCount = session.correctCount + (correct ? 1 : 0);
  const isComplete = answeredCount >= session.questionCount;

  await db
    .update(studyPracticeSessionsTable)
    .set({
      answers: newAnswers,
      answeredCount,
      correctCount,
      status: isComplete ? "completed" : "active",
      completedAt: isComplete ? new Date() : null,
    })
    .where(eq(studyPracticeSessionsTable.id, sessionId));

  if (isComplete) {
    // Identify weak and strong concepts
    const weakConcepts: string[] = [];
    const strongConcepts: string[] = [];
    const conceptStats: Record<string, { correct: number; total: number }> = {};

    for (const a of newAnswers) {
      const q = session.questions.find((qq: { id: string; conceptId: string | null }) => qq.id === a.questionId);
      if (q?.conceptId) {
        const s = conceptStats[q.conceptId] ?? { correct: 0, total: 0 };
        s.total++;
        if (a.correct) s.correct++;
        conceptStats[q.conceptId] = s;
      }
    }

    const conceptDetails = await db
      .select()
      .from(studyConceptsTable)
      .where(eq(studyConceptsTable.userId, userId));

    for (const [conceptId, stats] of Object.entries(conceptStats)) {
      const pct = stats.correct / stats.total;
      const title = conceptDetails.find((c) => c.id === conceptId)?.title ?? "Unknown";
      if (pct < 0.6) weakConcepts.push(title);
      else if (pct >= 0.8) strongConcepts.push(title);
    }

    res.json({
      correct,
      correctOptionIndex: question.correctOptionIndex,
      explanation: question.explanation,
      nextQuestion: null,
      sessionComplete: true,
      sessionSummary: {
        totalQuestions: session.questionCount,
        correctCount,
        accuracy: correctCount / session.questionCount,
        weakConcepts,
        strongConcepts,
        timeSeconds: Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000),
      },
    });
  } else {
    const nextQuestion = session.questions[answeredCount];
    res.json({
      correct,
      correctOptionIndex: question.correctOptionIndex,
      explanation: question.explanation,
      nextQuestion,
      sessionComplete: false,
      sessionSummary: null,
    });
  }
});

export default router;
