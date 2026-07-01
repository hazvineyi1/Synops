import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  studyKnowledgeNodesTable,
  studyFlashcardsTable,
  studyPracticeSessionsTable,
  studyLearningPathsTable,
  studyActivityLogTable,
  studyMaterialsTable,
} from "@workspace/paideia-db";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireStudyUser } from "../../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireStudyUser);

// GET /study/adaptive/recommendations - get personalized next actions
router.get("/recommendations", async (req, res) => {
  const userId = req.studyUser!.id;
  const now = new Date();

  // Due flashcards
  const dueCards = await db
    .select()
    .from(studyFlashcardsTable)
    .where(
      and(
        eq(studyFlashcardsTable.userId, userId),
        sql`${studyFlashcardsTable.nextReviewAt} <= ${now}`,
      ),
    )
    .limit(5);

  // Weak nodes (low mastery)
  const weakNodes = await db
    .select()
    .from(studyKnowledgeNodesTable)
    .where(
      and(
        eq(studyKnowledgeNodesTable.userId, userId),
        sql`${studyKnowledgeNodesTable.masteryLevel} < 0.5`,
      ),
    )
    .orderBy(studyKnowledgeNodesTable.masteryLevel)
    .limit(5);

  // Active learning path
  const paths = await db
    .select()
    .from(studyLearningPathsTable)
    .where(
      and(
        eq(studyLearningPathsTable.userId, userId),
        eq(studyLearningPathsTable.status, "active"),
      ),
    )
    .limit(1);
  const activePath = paths[0];

  // Recent activity for trend detection
  const recentActivity = await db
    .select()
    .from(studyActivityLogTable)
    .where(eq(studyActivityLogTable.userId, userId))
    .orderBy(desc(studyActivityLogTable.createdAt))
    .limit(20);

  const lastFlashcard = recentActivity.find((a) => a.activityType === "flashcard_review");
  const lastPractice = recentActivity.find((a) => a.activityType === "practice_question");
  const lastExam = recentActivity.find((a) => a.activityType === "exam_question");

  // Build recommendations
  const recommendations: Array<{
    type: string;
    title: string;
    description: string;
    priority: number;
    action: string;
    reason: string;
  }> = [];

  if (dueCards.length > 0) {
    recommendations.push({
      type: "flashcard_review",
      title: "Review Due Flashcards",
      description: `${dueCards.length} cards are due for spaced repetition review.`,
      priority: 10,
      action: "/flashcards",
      reason: "Forgetting curve - review at optimal retention window",
    });
  }

  if (weakNodes.length > 0) {
    recommendations.push({
      type: "practice_weak",
      title: "Practice Weak Concepts",
      description: `${weakNodes.length} concepts need more practice: ${weakNodes.slice(0, 3).map((n) => n.label).join(", ")}`,
      priority: 9,
      action: "/practice",
      reason: "Mastery below 50% - targeted practice recommended",
    });
  }

  if (activePath) {
    const nextPending = activePath.nodeSequence.find((n: { status: string }) => n.status === "pending" || n.status === "in_progress");
    if (nextPending) {
      recommendations.push({
        type: "learning_path",
        title: activePath.title,
        description: `Next: ${nextPending.nodeId} (≈${nextPending.estimatedMinutes} min)`,
        priority: 8,
        action: "/materials",
        reason: "Following your personalized learning path",
      });
    }
  }

  if (!lastPractice || new Date().getTime() - new Date(lastPractice.createdAt).getTime() > 2 * 24 * 60 * 60 * 1000) {
    recommendations.push({
      type: "practice",
      title: "Take a Practice Session",
      description: "Generate adaptive questions from your materials.",
      priority: 7,
      action: "/practice",
      reason: "No practice in 2+ days - active recall strengthens memory",
    });
  }

  if (!lastExam || new Date().getTime() - new Date(lastExam.createdAt).getTime() > 7 * 24 * 60 * 60 * 1000) {
    recommendations.push({
      type: "exam",
      title: "Mock Exam",
      description: "Simulate exam conditions to test readiness.",
      priority: 6,
      action: "/exams",
      reason: "Weekly exam practice improves test-taking skills",
    });
  }

  // Sort by priority descending
  recommendations.sort((a, b) => b.priority - a.priority);

  res.json({
    recommendations: recommendations.slice(0, 5),
    dueFlashcards: dueCards.length,
    weakConcepts: weakNodes.length,
    activePathId: activePath?.id ?? null,
    lastActivity: recentActivity[0]?.activityType ?? null,
  });
});

// POST /study/adaptive/learning-paths - create a new learning path
router.post("/learning-paths", async (req, res) => {
  const userId = req.studyUser!.id;
  const schema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    goal: z.string().optional(),
    materialIds: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { title, description, goal, materialIds } = parsed.data;

  // Load concepts from materials
  let concepts: { id: string; title: string }[] = [];
  if (materialIds && materialIds.length > 0) {
    for (const mid of materialIds) {
      const mats = await db
        .select()
        .from(studyMaterialsTable)
        .where(and(eq(studyMaterialsTable.userId, userId), eq(studyMaterialsTable.id, mid)))
        .limit(1);
      if (mats.length > 0) {
        const { studyConceptsTable } = await import("@workspace/paideia-db");
        const c = await db
          .select({ id: studyConceptsTable.id, title: studyConceptsTable.title })
          .from(studyConceptsTable)
          .where(and(eq(studyConceptsTable.userId, userId), eq(studyConceptsTable.materialId, mid)));
        concepts.push(...c);
      }
    }
  }

  // Also load knowledge nodes as fallback
  if (concepts.length === 0) {
    const nodes = await db
      .select()
      .from(studyKnowledgeNodesTable)
      .where(eq(studyKnowledgeNodesTable.userId, userId))
      .limit(20);
    concepts = nodes.map((n) => ({ id: n.id, title: n.label }));
  }

  // Build simple sequential path (ordered by concept order)
  const nodeSequence = concepts.map((c, i) => ({
    nodeId: c.id,
    order: i + 1,
    estimatedMinutes: 15,
    status: i === 0 ? "in_progress" : "pending" as "in_progress" | "pending" | "completed",
  }));

  const totalMinutes = nodeSequence.length * 15;

  const [path] = await db
    .insert(studyLearningPathsTable)
    .values({
      userId,
      title,
      description: description ?? null,
      goal: goal ?? null,
      nodeSequence,
      totalEstimatedMinutes: totalMinutes,
      completedMinutes: 0,
    })
    .returning();

  res.status(201).json(path);
});

// GET /study/adaptive/learning-paths - list paths
router.get("/learning-paths", async (req, res) => {
  const userId = req.studyUser!.id;
  const paths = await db
    .select()
    .from(studyLearningPathsTable)
    .where(eq(studyLearningPathsTable.userId, userId))
    .orderBy(desc(studyLearningPathsTable.createdAt));
  res.json(paths);
});

// POST /study/adaptive/activity - log an activity event
router.post("/activity", async (req, res) => {
  const userId = req.studyUser!.id;
  const schema = z.object({
    activityType: z.string(),
    entityId: z.string().optional(),
    entityType: z.string().optional(),
    durationSeconds: z.number().optional(),
    accuracy: z.number().min(0).max(1).optional(),
    confidence: z.number().min(0).max(1).optional(),
    difficulty: z.string().optional(),
    conceptIds: z.array(z.string()).optional(),
    metadata: z.record(z.unknown()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const [entry] = await db
    .insert(studyActivityLogTable)
    .values({
      userId,
      ...parsed.data,
      conceptIds: parsed.data.conceptIds ?? [],
      metadata: parsed.data.metadata ?? {},
    })
    .returning();

  res.status(201).json(entry);
});

export default router;
