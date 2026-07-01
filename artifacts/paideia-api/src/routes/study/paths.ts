import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  studyLearningPathsTable,
  studyLearningPathStepsTable,
  studyKnowledgeNodesTable,
  studyAssessmentsTable,
  studyMaterialsTable,
  studyConceptsTable,
} from "@workspace/paideia-db";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { isLearningProfile } from "../../lib/prompts.js";

function generateCoachingMessage(step: any, assessmentResults: any | null, nodes: any[]): string {
  const conceptName = step.node?.label || nodes.find((n: any) => n.id === step.nodeId)?.label || "this concept";
  // Only consume the persisted profile if it matches the canonical schema; old shapes are ignored.
  const rawProfile = assessmentResults?.learningProfile;
  const learningProfile = isLearningProfile(rawProfile) ? rawProfile : null;
  const accuracyByConcept = assessmentResults?.accuracyByConcept ?? {};
  const accuracy = step.conceptId ? accuracyByConcept[step.conceptId] : null;

  let whyPart: string;
  if (accuracy !== null && accuracy !== undefined) {
    if (accuracy < 40) {
      whyPart = `You scored ${accuracy}% on ${conceptName} in your diagnostic - your highest-priority gap. The AI starts here to build a solid foundation.`;
    } else if (accuracy < 65) {
      whyPart = `You showed ${accuracy}% understanding of ${conceptName}. There's more to unlock - this step deepens it.`;
    } else {
      whyPart = `You scored ${accuracy}% on ${conceptName}. This review reinforces retention before moving on.`;
    }
  } else {
    const reasons: Record<string, string> = {
      read_material: `The AI sequenced ${conceptName} here to build foundational understanding before active recall.`,
      flashcard_review: `Active recall of ${conceptName} at this stage strengthens long-term retention.`,
      practice_questions: `Applying ${conceptName} in varied contexts builds durable, transferable knowledge.`,
      tutor_session: `Deep exploration of ${conceptName} will surface and close any remaining gaps.`,
      mastery_check: `You've built up ${conceptName} - this check confirms you're ready to progress.`,
      spaced_review: `Revisiting ${conceptName} at the optimal interval prevents forgetting.`,
    };
    whyPart = reasons[step.stepType as string] || `The AI determined this is your optimal next step right now.`;
  }

  let profilePart = "";
  if (learningProfile?.processingStyle === "sequential") {
    profilePart = " Your profile shows you build knowledge step by step - following the AI sequence is optimal for you.";
  } else if (learningProfile?.processingStyle === "conceptual") {
    profilePart = " Your profile shows you grasp the big picture first - connect this to the broader concept map as you go.";
  }
  if (learningProfile?.confidencePattern === "fatiguing") {
    profilePart += " Keep this session short and focused - your accuracy fades when sessions run long.";
  } else if (learningProfile?.confidencePattern === "improving") {
    profilePart += " You warm up as you go - push through any initial resistance.";
  }

  return whyPart + profilePart;
}
import { requireStudyUser } from "../../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireStudyUser);

// POST /study/paths/from-material  - build an AI-led path from a material's concepts
// without requiring a completed diagnostic. Marks any existing active paths archived
// so the dashboard always has exactly one current path.
router.post("/from-material", async (req, res) => {
  const userId = req.studyUser!.id;
  const schema = z.object({ materialId: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "materialId required" });
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

  const concepts = await db
    .select()
    .from(studyConceptsTable)
    .where(and(eq(studyConceptsTable.userId, userId), eq(studyConceptsTable.materialId, materialId)))
    .orderBy(asc(studyConceptsTable.createdAt));

  if (concepts.length === 0) {
    res.status(400).json({
      error: "This material has no extracted concepts yet. Wait for AI extraction to finish, then try again.",
    });
    return;
  }

  // Archive any other active paths so there is exactly one current path
  await db
    .update(studyLearningPathsTable)
    .set({ status: "archived" })
    .where(and(eq(studyLearningPathsTable.userId, userId), eq(studyLearningPathsTable.status, "active")));

  const STEPS_PER_CONCEPT: Array<{ type: string; label: string; minutes: number }> = [
    { type: "read_material", label: "Read & Understand", minutes: 10 },
    { type: "flashcard_review", label: "Active Recall", minutes: 8 },
    { type: "practice_questions", label: "Apply Knowledge", minutes: 10 },
    { type: "mastery_check", label: "Mastery Check", minutes: 5 },
  ];

  const totalMinutes = concepts.length * STEPS_PER_CONCEPT.reduce((s, x) => s + x.minutes, 0);

  const [path] = await db
    .insert(studyLearningPathsTable)
    .values({
      userId,
      title: `${material.title}, AI Study Plan`,
      description: `An AI-led plan that walks you through every concept in "${material.title}", one step at a time.`,
      goal: `Master all ${concepts.length} concepts from "${material.title}".`,
      status: "active",
      nodeSequence: [],
      totalEstimatedMinutes: totalMinutes,
      completedMinutes: 0,
    })
    .returning();

  // Generate ordered steps: per concept → read → recall → practice → mastery
  type StepRow = typeof studyLearningPathStepsTable.$inferInsert;
  const rows: StepRow[] = [];
  let order = 1;
  for (let ci = 0; ci < concepts.length; ci++) {
    const c = concepts[ci];
    const conceptStepIds: string[] = [];
    for (let si = 0; si < STEPS_PER_CONCEPT.length; si++) {
      const tpl = STEPS_PER_CONCEPT[si];
      const id = randomUUID();
      const prevInConcept = conceptStepIds[conceptStepIds.length - 1];
      const prevConceptLastId = ci > 0 ? rows[rows.length - 1]?.id : undefined;
      const prereqs: string[] = [];
      if (prevInConcept) prereqs.push(prevInConcept);
      else if (prevConceptLastId) prereqs.push(prevConceptLastId);

      rows.push({
        id,
        userId,
        pathId: path.id,
        nodeId: null,
        conceptId: c.id,
        order: order++,
        stepType: tpl.type,
        title: `${tpl.label}: ${c.title}`,
        description: `${tpl.label.toLowerCase()} for "${c.title}"`,
        estimatedMinutes: tpl.minutes,
        status: ci === 0 && si === 0 ? "available" : "locked",
        contentRef: materialId,
        prerequisites: prereqs,
        masteryScore: null,
      });
      conceptStepIds.push(id);
    }
  }

  for (const r of rows) {
    await db.insert(studyLearningPathStepsTable).values(r);
  }

  res.status(201).json({ pathId: path.id, totalSteps: rows.length, totalMinutes });
});

// GET /study/paths - list learning paths
router.get("/", async (req, res) => {
  const userId = req.studyUser!.id;
  const paths = await db
    .select()
    .from(studyLearningPathsTable)
    .where(eq(studyLearningPathsTable.userId, userId))
    .orderBy(studyLearningPathsTable.createdAt);

  // Get step counts for each path
  const pathsWithStats = await Promise.all(
    paths.map(async (path) => {
      const steps = await db
        .select()
        .from(studyLearningPathStepsTable)
        .where(eq(studyLearningPathStepsTable.pathId, path.id))
        .orderBy(asc(studyLearningPathStepsTable.order));

      const completed = steps.filter((s) => s.status === "completed").length;
      const available = steps.filter((s) => s.status === "available" || s.status === "in_progress").length;
      const total = steps.length;

      return {
        ...path,
        stats: { completed, available, total, percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0 },
        currentStep: steps.find((s) => s.status === "in_progress") ?? steps.find((s) => s.status === "available") ?? null,
        nextSteps: steps.filter((s) => s.status === "available" || s.status === "in_progress").slice(0, 3),
      };
    }),
  );

  res.json(pathsWithStats);
});

// GET /study/paths/:id - get path with steps
router.get("/:id", async (req, res) => {
  const userId = req.studyUser!.id;
  const [path] = await db
    .select()
    .from(studyLearningPathsTable)
    .where(and(eq(studyLearningPathsTable.userId, userId), eq(studyLearningPathsTable.id, req.params.id)))
    .limit(1);

  if (!path) {
    res.status(404).json({ error: "Path not found" });
    return;
  }

  const steps = await db
    .select()
    .from(studyLearningPathStepsTable)
    .where(eq(studyLearningPathStepsTable.pathId, path.id))
    .orderBy(asc(studyLearningPathStepsTable.order));

  // Load node info for each step
  const nodeIds = steps.filter((s) => s.nodeId).map((s) => s.nodeId!);
  let nodes: any[] = [];
  if (nodeIds.length > 0) {
    nodes = await db
      .select()
      .from(studyKnowledgeNodesTable)
      .where(and(eq(studyKnowledgeNodesTable.userId, userId)));
  }

  const stepsWithNodes = steps.map((step) => ({
    ...step,
    node: step.nodeId ? nodes.find((n) => n.id === step.nodeId) ?? null : null,
  }));

  res.json({ ...path, steps: stepsWithNodes });
});

// GET /study/paths/:id/steps - get steps for a path
router.get("/:id/steps", async (req, res) => {
  const userId = req.studyUser!.id;
  const steps = await db
    .select()
    .from(studyLearningPathStepsTable)
    .where(and(
      eq(studyLearningPathStepsTable.userId, userId),
      eq(studyLearningPathStepsTable.pathId, req.params.id),
    ))
    .orderBy(asc(studyLearningPathStepsTable.order));

  res.json(steps);
});

// POST /study/paths/:id/steps/:stepId/complete - mark step completed
router.post("/:id/steps/:stepId/complete", async (req, res) => {
  const userId = req.studyUser!.id;
  const schema = z.object({
    masteryScore: z.number().min(0).max(1).optional(),
    durationSeconds: z.number().min(0).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { masteryScore, durationSeconds } = parsed.data;
  const pathId = req.params.id;
  const stepId = req.params.stepId;

  // Verify step belongs to user
  const [step] = await db
    .select()
    .from(studyLearningPathStepsTable)
    .where(and(
      eq(studyLearningPathStepsTable.userId, userId),
      eq(studyLearningPathStepsTable.pathId, pathId),
      eq(studyLearningPathStepsTable.id, stepId),
    ))
    .limit(1);

  if (!step) {
    res.status(404).json({ error: "Step not found" });
    return;
  }

  // Mark step completed
  await db
    .update(studyLearningPathStepsTable)
    .set({
      status: "completed",
      completedAt: new Date(),
      masteryScore: masteryScore ?? step.masteryScore,
    })
    .where(eq(studyLearningPathStepsTable.id, stepId));

  // Unlock next steps whose prerequisites are now met
  const allSteps = await db
    .select()
    .from(studyLearningPathStepsTable)
    .where(and(
      eq(studyLearningPathStepsTable.userId, userId),
      eq(studyLearningPathStepsTable.pathId, pathId),
    ))
    .orderBy(asc(studyLearningPathStepsTable.order));

  for (const s of allSteps) {
    if (s.status === "locked" && s.prerequisites.length > 0) {
      const prereqsMet = s.prerequisites.every((pid: string) =>
        allSteps.find((as) => as.id === pid)?.status === "completed",
      );
      if (prereqsMet) {
        await db
          .update(studyLearningPathStepsTable)
          .set({ status: "available" })
          .where(eq(studyLearningPathStepsTable.id, s.id));
      }
    }
  }

  // Update path completed minutes
  const completedSteps = allSteps.filter((s) => s.status === "completed" || s.id === stepId);
  const completedMinutes = completedSteps.reduce((sum, s) => sum + (s.estimatedMinutes ?? 0), 0);

  await db
    .update(studyLearningPathsTable)
    .set({ completedMinutes })
    .where(eq(studyLearningPathsTable.id, pathId));

  // Update node mastery if applicable
  if (step.nodeId && masteryScore !== undefined) {
    await db
      .update(studyKnowledgeNodesTable)
      .set({
        masteryLevel: masteryScore,
        lastAssessedAt: new Date(),
        reviewCount: sql`${studyKnowledgeNodesTable.reviewCount} + 1`,
      })
      .where(eq(studyKnowledgeNodesTable.id, step.nodeId));
  }

  res.json({ success: true, step: { ...step, status: "completed" } });
});

// POST /study/paths/:id/steps/:stepId/start - mark step in progress
router.post("/:id/steps/:stepId/start", async (req, res) => {
  const userId = req.studyUser!.id;
  const pathId = req.params.id;
  const stepId = req.params.stepId;

  const [step] = await db
    .select()
    .from(studyLearningPathStepsTable)
    .where(and(
      eq(studyLearningPathStepsTable.userId, userId),
      eq(studyLearningPathStepsTable.pathId, pathId),
      eq(studyLearningPathStepsTable.id, stepId),
    ))
    .limit(1);

  if (!step) {
    res.status(404).json({ error: "Step not found" });
    return;
  }

  if (step.status !== "available" && step.status !== "in_progress") {
    res.status(400).json({ error: "Step is not available" });
    return;
  }

  await db
    .update(studyLearningPathStepsTable)
    .set({ status: "in_progress" })
    .where(eq(studyLearningPathStepsTable.id, stepId));

  res.json({ success: true, step: { ...step, status: "in_progress" } });
});

// GET /study/paths/active/daily-session - get today's guided session
router.get("/active/daily-session", async (req, res) => {
  const userId = req.studyUser!.id;

  // Find active path
  const [activePath] = await db
    .select()
    .from(studyLearningPathsTable)
    .where(and(
      eq(studyLearningPathsTable.userId, userId),
      eq(studyLearningPathsTable.status, "active"),
    ))
    .limit(1);

  if (!activePath) {
    res.json({ hasActivePath: false, message: "No active learning path. Add a material to get started." });
    return;
  }

  const allSteps = await db
    .select()
    .from(studyLearningPathStepsTable)
    .where(eq(studyLearningPathStepsTable.pathId, activePath.id))
    .orderBy(asc(studyLearningPathStepsTable.order));

  const currentStep = allSteps.find((s) => s.status === "in_progress");
  const availableSteps = allSteps.filter((s) => s.status === "available");
  const completedSteps = allSteps.filter((s) => s.status === "completed");

  // Build today's session from current + available steps
  const sessionSteps = currentStep
    ? [currentStep, ...availableSteps.filter((s) => s.id !== currentStep.id).slice(0, 2)]
    : availableSteps.slice(0, 3);

  // Get node info
  const nodeIds = sessionSteps.filter((s) => s.nodeId).map((s) => s.nodeId!);
  let nodes: any[] = [];
  if (nodeIds.length > 0) {
    nodes = await db
      .select()
      .from(studyKnowledgeNodesTable)
      .where(eq(studyKnowledgeNodesTable.userId, userId));
  }

  const totalMinutes = sessionSteps.reduce((sum, s) => sum + (s.estimatedMinutes ?? 0), 0);
  const totalProgress = allSteps.length > 0 ? Math.round((completedSteps.length / allSteps.length) * 100) : 0;

  // Fetch most recent completed assessment for coaching context
  const [recentAssessment] = await db
    .select()
    .from(studyAssessmentsTable)
    .where(and(
      eq(studyAssessmentsTable.userId, userId),
      eq(studyAssessmentsTable.status, "completed"),
    ))
    .orderBy(desc(studyAssessmentsTable.completedAt))
    .limit(1);

  const assessmentResults = (recentAssessment?.results as any) ?? null;

  const stepsWithNodes = sessionSteps.map((s) => ({
    ...s,
    node: s.nodeId ? nodes.find((n) => n.id === s.nodeId) ?? null : null,
  }));

  const primaryStep = stepsWithNodes[0] ?? null;
  const upcomingSteps = stepsWithNodes.slice(1);

  const coachingMessage = primaryStep
    ? generateCoachingMessage(primaryStep, assessmentResults, nodes)
    : null;

  res.json({
    hasActivePath: true,
    path: activePath,
    coachingMessage,
    learningProfile: isLearningProfile(assessmentResults?.learningProfile) ? assessmentResults.learningProfile : null,
    session: {
      primaryStep,
      upcomingSteps,
      steps: stepsWithNodes,
      totalEstimatedMinutes: totalMinutes,
      stepsCount: sessionSteps.length,
    },
    progress: {
      completedSteps: completedSteps.length,
      totalSteps: allSteps.length,
      percentComplete: totalProgress,
      currentConcept: currentStep ? currentStep.title.split(":")[1]?.trim() ?? currentStep.title : null,
    },
  });
});

export default router;
