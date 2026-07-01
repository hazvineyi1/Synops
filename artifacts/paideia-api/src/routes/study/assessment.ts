import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  studyAssessmentsTable,
  studyMaterialsTable,
  studyConceptsTable,
  studyKnowledgeNodesTable,
  studyLearningPathsTable,
  studyLearningPathStepsTable,
} from "@workspace/paideia-db";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { requireStudyUser } from "../../middlewares/auth.js";
import { generateJSON } from "../../lib/openai.js";
import { randomUUID } from "crypto";

const router: IRouter = Router();
router.use(requireStudyUser);

// POST /study/assessments/generate - create diagnostic assessment from material
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

  // Get concepts from material
  let concepts = await db
    .select()
    .from(studyConceptsTable)
    .where(and(eq(studyConceptsTable.userId, userId), eq(studyConceptsTable.materialId, materialId)));

  // If background extraction hasn't produced concepts yet (or failed),
  // extract them synchronously here so the learner never sees a "try again" error.
  if (concepts.length === 0) {
    if (!material.contentText || material.contentText.trim().length < 20) {
      res.status(400).json({
        error: "This material has no readable content. Try uploading again or paste the text directly.",
      });
      return;
    }

    try {
      const raw = await generateJSON<
        { concepts?: Array<{ title: string; explanation: string; difficulty: string; keyTerms: string[] }> } | Array<{ title: string; explanation: string; difficulty: string; keyTerms: string[] }>
      >(
        "You are an expert educator. Extract key concepts from the study material. Return JSON with a top-level array named 'concepts'. Each concept has: title, explanation (2-3 sentences), difficulty (easy/medium/hard), and keyTerms (array of important terms).",
        `Extract concepts from this material:\n\nTitle: ${material.title}\n\n${material.contentText.slice(0, 8000)}`,
        { kind: "study_concept_extraction" },
      );
      const conceptsData: Array<{ title: string; explanation: string; difficulty: string; keyTerms: string[] }> =
        Array.isArray(raw) ? raw : (raw as any).concepts ?? Object.values(raw as any).find(Array.isArray) ?? [];

      if (conceptsData.length > 0) {
        const rows = conceptsData.map((c) => ({
          userId,
          materialId,
          title: c.title,
          explanation: c.explanation,
          difficulty: ["easy", "medium", "hard"].includes(c.difficulty) ? c.difficulty : "medium",
          keyTerms: c.keyTerms ?? [],
        }));
        await db.insert(studyConceptsTable).values(rows);
        concepts = await db
          .select()
          .from(studyConceptsTable)
          .where(and(eq(studyConceptsTable.userId, userId), eq(studyConceptsTable.materialId, materialId)));
      }
    } catch (err) {
      console.warn("On-demand concept extraction failed:", err);
    }

    if (concepts.length === 0) {
      res.status(422).json({
        error: "AI couldn't extract concepts from this material. Try a clearer source or paste the text directly.",
      });
      return;
    }
  }

  // Generate diagnostic questions from concepts
  const conceptTexts = concepts.map((c) => `${c.title}: ${c.explanation}`).join("\n\n");

  try {
    const raw = await generateJSON<
      { questions?: Array<{
        questionText: string;
        options: string[];
        correctOptionIndex: number;
        explanation: string;
        conceptTitle: string;
        difficulty: "easy" | "medium" | "hard";
        type: "recall" | "comprehension" | "application";
      }> } | Array<{
        questionText: string;
        options: string[];
        correctOptionIndex: number;
        explanation: string;
        conceptTitle: string;
        difficulty: "easy" | "medium" | "hard";
        type: "recall" | "comprehension" | "application";
      }>
    >(
      "You are an expert educational diagnostician. Create a diagnostic assessment that tests understanding of the concepts below. Mix easy recall, comprehension, and application questions. Return JSON with top-level 'questions' array. Each question: questionText, options (4 choices), correctOptionIndex (0-based), explanation (why the correct answer is right), conceptTitle (which concept this tests), difficulty (easy/medium/hard), type (recall/comprehension/application).",
      `Create a diagnostic assessment for these concepts:\n\n${conceptTexts.slice(0, 6000)}\n\nGenerate ${Math.min(concepts.length * 2, 12)} questions total. Make them challenging enough to detect true understanding vs surface-level familiarity.`,
      { kind: "study_assessment_generation" },
    );

    const questionsData = (raw as any).questions ?? (Array.isArray(raw) ? raw : Object.values(raw as any).find(Array.isArray) ?? []);
    const questions = questionsData.slice(0, 12).map((q: any, i: number) => ({
      id: randomUUID(),
      questionText: q.questionText,
      options: q.options?.slice(0, 4) ?? ["A", "B", "C", "D"],
      correctOptionIndex: Math.min(Math.max(0, q.correctOptionIndex ?? 0), 3),
      explanation: q.explanation ?? "",
      conceptId: concepts.find((c) => c.title.toLowerCase().includes((q.conceptTitle ?? "").toLowerCase()))?.id ?? concepts[i % concepts.length].id,
      difficulty: ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "medium",
      type: ["recall", "comprehension", "application"].includes(q.type) ? q.type : "comprehension",
    }));

    const [assessment] = await db
      .insert(studyAssessmentsTable)
      .values({
        userId,
        materialId,
        title: `Diagnostic: ${material.title}`,
        status: "active",
        questions,
        conceptIds: concepts.map((c) => c.id),
      })
      .returning();

    res.status(201).json(assessment);
  } catch (err) {
    console.warn("Assessment generation failed:", err);
    res.status(500).json({ error: "Failed to generate assessment" });
  }
});

// GET /study/assessments - list user's assessments
router.get("/", async (req, res) => {
  const userId = req.studyUser!.id;
  const assessments = await db
    .select()
    .from(studyAssessmentsTable)
    .where(eq(studyAssessmentsTable.userId, userId))
    .orderBy(desc(studyAssessmentsTable.createdAt));
  res.json(assessments);
});

// GET /study/assessments/:id - get specific assessment
router.get("/:id", async (req, res) => {
  const userId = req.studyUser!.id;
  const [assessment] = await db
    .select()
    .from(studyAssessmentsTable)
    .where(and(eq(studyAssessmentsTable.userId, userId), eq(studyAssessmentsTable.id, req.params.id)))
    .limit(1);
  if (!assessment) {
    res.status(404).json({ error: "Assessment not found" });
    return;
  }
  res.json(assessment);
});

// POST /study/assessments/:id/complete - submit answers and get results
router.post("/:id/complete", async (req, res) => {
  const userId = req.studyUser!.id;
  const schema = z.object({
    answers: z.array(z.object({
      questionId: z.string(),
      selectedOptionIndex: z.number().min(0).max(3),
      timeSpentSeconds: z.number().min(0).default(0),
    })),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const [assessment] = await db
    .select()
    .from(studyAssessmentsTable)
    .where(and(eq(studyAssessmentsTable.userId, userId), eq(studyAssessmentsTable.id, req.params.id)))
    .limit(1);

  if (!assessment) {
    res.status(404).json({ error: "Assessment not found" });
    return;
  }

  // Score answers
  const questionMap = new Map(assessment.questions.map((q: any) => [q.id, q]));
  const conceptAccuracy: Record<string, { correct: number; total: number }> = {};

  const scoredAnswers = parsed.data.answers.map((a) => {
    const q = questionMap.get(a.questionId);
    const correct = q ? a.selectedOptionIndex === q.correctOptionIndex : false;
    if (q) {
      const cid = q.conceptId;
      if (!conceptAccuracy[cid]) conceptAccuracy[cid] = { correct: 0, total: 0 };
      conceptAccuracy[cid].total++;
      if (correct) conceptAccuracy[cid].correct++;
    }
    return { ...a, correct };
  });

  const totalCorrect = scoredAnswers.filter((a) => a.correct).length;
  const score = Math.round((totalCorrect / Math.max(assessment.questions.length, 1)) * 100);

  const accuracyByConcept: Record<string, number> = {};
  for (const [cid, data] of Object.entries(conceptAccuracy)) {
    accuracyByConcept[cid] = Math.round((data.correct / data.total) * 100);
  }

  // Determine difficulty level
  let detectedDifficulty: "beginner" | "intermediate" | "advanced" = "intermediate";
  if (score >= 80) detectedDifficulty = "advanced";
  else if (score >= 50) detectedDifficulty = "intermediate";
  else detectedDifficulty = "beginner";

  // Determine path type
  let recommendedPathType: "gentle" | "standard" | "intensive" = "standard";
  if (detectedDifficulty === "beginner") recommendedPathType = "gentle";
  else if (detectedDifficulty === "advanced") recommendedPathType = "intensive";

  // Detect cognitive learning profile from answer patterns (evidence-based, not VARK)
  const recallAnswers = scoredAnswers.filter(a => (questionMap.get(a.questionId) as any)?.type === "recall");
  const comprehensionAnswers = scoredAnswers.filter(a => (questionMap.get(a.questionId) as any)?.type === "comprehension");
  const applicationAnswers = scoredAnswers.filter(a => (questionMap.get(a.questionId) as any)?.type === "application");

  const calcTypeScore = (arr: typeof scoredAnswers) =>
    arr.length > 0 ? Math.round(arr.filter(a => a.correct).length / arr.length * 100) : null;

  const recallTypeScore = calcTypeScore(recallAnswers);
  const comprehensionTypeScore = calcTypeScore(comprehensionAnswers);
  const applicationTypeScore = calcTypeScore(applicationAnswers);

  // Processing style: conceptual (big-picture first) vs sequential (step-by-step) - based on Cognitive Style Theory.
  // If we cannot tell from accuracy alone we say "mixed" rather than forcing a label.
  const processingStyle: "sequential" | "conceptual" | "mixed" =
    (applicationTypeScore === null || recallTypeScore === null)
      ? "mixed"
      : applicationTypeScore > recallTypeScore + 10
        ? "conceptual"
        : recallTypeScore > applicationTypeScore + 10
          ? "sequential"
          : "mixed";

  // Pace: based on avg time per question (Kahneman System 1/System 2)
  const avgTimePerQuestion = scoredAnswers.reduce((sum, a) => sum + (a.timeSpentSeconds || 0), 0) / Math.max(scoredAnswers.length, 1);
  const pace: "quick" | "moderate" | "deliberate" =
    avgTimePerQuestion > 30 ? "deliberate" : avgTimePerQuestion < 10 ? "quick" : "moderate";

  // Canonical strengthByQuestionType: always present, 0-100 (default 0 when no items of that type were answered).
  const strengthByQuestionType = {
    recall: recallTypeScore ?? 0,
    comprehension: comprehensionTypeScore ?? 0,
    application: applicationTypeScore ?? 0,
  };

  // Confidence pattern: cognitive load / fatigue detection
  const mid = Math.floor(scoredAnswers.length / 2);
  const firstHalfAcc = mid > 0 ? scoredAnswers.slice(0, mid).filter(a => a.correct).length / mid : 0;
  const secondHalfLen = scoredAnswers.length - mid;
  const secondHalfAcc = secondHalfLen > 0 ? scoredAnswers.slice(mid).filter(a => a.correct).length / secondHalfLen : 0;
  const confidencePattern: "improving" | "fatiguing" | "consistent" =
    secondHalfAcc > firstHalfAcc + 0.2 ? "improving"
    : secondHalfAcc < firstHalfAcc - 0.2 ? "fatiguing"
    : "consistent";

  // Confidence in the inference depends on sample size per axis (canonical 4-level enum).
  const minTypeCount = Math.min(recallAnswers.length, comprehensionAnswers.length, applicationAnswers.length);
  const totalCount = scoredAnswers.length;
  const inferenceConfidence: "low" | "developing" | "moderate" | "strong" =
    minTypeCount >= 3 && totalCount >= 12 ? "strong"
    : totalCount >= 8 ? "moderate"
    : totalCount >= 4 ? "developing"
    : "low";

  // Canonical evidence-based LearningProfile (schemaVersion 1) shared with the copilot stack.
  // Auxiliary fields (avgTimePerQuestion, sampleSizeBreakdown) are kept on the assessment
  // results envelope for UI display, NOT on the profile itself, so the profile shape stays
  // identical to what /copilot/student/diagnostic stores in studentsTable.learningStyle.
  const learningProfile = {
    schemaVersion: 1 as const,
    processingStyle,
    pace,
    strengthByQuestionType,
    confidencePattern,
    inferenceConfidence,
    sampleSize: totalCount,
  };
  const avgTimePerQuestionRounded = Math.round(avgTimePerQuestion);
  const sampleSizeBreakdown = {
    total: totalCount,
    recall: recallAnswers.length,
    comprehension: comprehensionAnswers.length,
    application: applicationAnswers.length,
  };

  // Fetch concept names for the response
  const conceptIdList = assessment.conceptIds ?? [];
  const conceptRows = conceptIdList.length > 0
    ? await db
        .select({ id: studyConceptsTable.id, title: studyConceptsTable.title, explanation: studyConceptsTable.explanation })
        .from(studyConceptsTable)
        .where(and(eq(studyConceptsTable.userId, userId), inArray(studyConceptsTable.id, conceptIdList)))
    : [];
  const conceptNameMap = Object.fromEntries(conceptRows.map((c) => [c.id, c]));

  const results = {
    answers: scoredAnswers,
    score,
    accuracyByConcept,
    detectedDifficulty,
    recommendedPathType,
    learningProfile,
    avgTimePerQuestion: avgTimePerQuestionRounded,
    sampleSizeBreakdown,
    conceptNameMap,
  };

  await db
    .update(studyAssessmentsTable)
    .set({ status: "completed", results, completedAt: new Date() })
    .where(eq(studyAssessmentsTable.id, assessment.id));

  // Auto-generate learning path from results
  void generateLearningPath(userId, assessment.materialId, results, assessment.conceptIds);

  res.json({
    ...assessment,
    status: "completed",
    results,
  });
});

async function generateLearningPath(
  userId: string,
  materialId: string,
  assessmentResults: any,
  conceptIds: string[],
) {
  try {
    const concepts = conceptIds.length > 0
      ? await db
          .select()
          .from(studyConceptsTable)
          .where(and(eq(studyConceptsTable.userId, userId), inArray(studyConceptsTable.id, conceptIds)))
      : [];

    const nodes = await db
      .select()
      .from(studyKnowledgeNodesTable)
      .where(eq(studyKnowledgeNodesTable.userId, userId));

    // Sort concepts by accuracy (weakest first = earlier in path)
    const conceptAccuracy = assessmentResults.accuracyByConcept ?? {};
    const sortedConcepts = [...concepts].sort((a, b) => {
      const accA = conceptAccuracy[a.id] ?? 50;
      const accB = conceptAccuracy[b.id] ?? 50;
      return accA - accB;
    });

    const pathType = assessmentResults.recommendedPathType;
    const stepsPerConcept = pathType === "gentle" ? 4 : pathType === "intensive" ? 6 : 5;

    const [path] = await db
      .insert(studyLearningPathsTable)
      .values({
        userId,
        title: `Learning Path: ${concepts[0]?.materialId ? (await db.select({ title: studyMaterialsTable.title }).from(studyMaterialsTable).where(eq(studyMaterialsTable.id, materialId)).limit(1))[0]?.title ?? "Study Material" : "Study Material"}`,
        description: `Personalized ${pathType} learning path based on your diagnostic results.`,
        goal: `Master all ${concepts.length} concepts from your study material.`,
        status: "active",
        nodeSequence: [],
        totalEstimatedMinutes: sortedConcepts.length * stepsPerConcept * 10,
        completedMinutes: 0,
      })
      .returning();

    // Generate steps for each concept
    const stepTypes = ["read_material", "flashcard_review", "practice_questions", "tutor_session", "mastery_check", "spaced_review"];
    const stepLabels = [
      "Read & Understand",
      "Active Recall Flashcards",
      "Apply Your Knowledge",
      "Deep Dive with AI Tutor",
      "Mastery Check",
      "Spaced Review",
    ];

    const steps: any[] = [];
    let order = 1;

    for (let ci = 0; ci < sortedConcepts.length; ci++) {
      const concept = sortedConcepts[ci];
      const accuracy = conceptAccuracy[concept.id] ?? 50;
      const isWeak = accuracy < 50;
      const node = nodes.find((n) => concept.title.toLowerCase().includes(n.label.toLowerCase()) || n.label.toLowerCase().includes(concept.title.toLowerCase()));

      // Number of steps based on path type and weakness
      const numSteps = isWeak && pathType === "gentle" ? stepsPerConcept + 1 : stepsPerConcept;
      const stepTypesForConcept = stepTypes.slice(0, numSteps);

      for (let si = 0; si < stepTypesForConcept.length; si++) {
        const st = stepTypesForConcept[si];
        const prevStepIds = steps.filter((s) => s.conceptId === concept.id).map((s) => s.id);
        const allPrevIds = steps.map((s) => s.id);

        steps.push({
          id: randomUUID(),
          userId,
          pathId: path.id,
          nodeId: node?.id ?? null,
          conceptId: concept.id,
          order: order++,
          stepType: st,
          title: `${stepLabels[si] ?? "Study"}: ${concept.title}`,
          description: `Master "${concept.title}" through ${st.replace("_", " ")}`,
          estimatedMinutes: st === "read_material" ? 15 : st === "flashcard_review" ? 10 : st === "practice_questions" ? 12 : st === "tutor_session" ? 15 : st === "mastery_check" ? 8 : 5,
          status: ci === 0 && si === 0 ? "available" : "locked",
          contentRef: materialId,
          prerequisites: si === 0 ? (ci > 0 ? [steps[steps.length - 1]?.id] : []) : [prevStepIds[si - 1]],
          masteryScore: null,
        });
      }
    }

    // Unlock prerequisites for first concept
    if (steps.length > 0) {
      steps[0].status = "available";
    }

    for (const step of steps) {
      await db.insert(studyLearningPathStepsTable).values(step);
    }
  } catch (err) {
    console.warn("Learning path generation failed:", err);
  }
}

export default router;
