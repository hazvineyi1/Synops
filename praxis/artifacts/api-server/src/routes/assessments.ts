import { Router } from "express";
import { db } from "@workspace/db";
import { assessmentsTable, assessmentItemsTable, attemptsTable, itemResponsesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

function toAssessmentResponse(a: typeof assessmentsTable.$inferSelect, itemCount = 0) {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    type: a.type,
    status: a.status,
    itemCount,
    competencyTags: a.competencyTags,
    createdAt: a.createdAt.toISOString(),
  };
}

// GET /assessments
router.get("/assessments", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  const tenantId = user.partnerId ?? user.organisationId ?? "platform";
  const assessments = await db
    .select()
    .from(assessmentsTable)
    .where(eq(assessmentsTable.tenantId, tenantId));
  res.json(assessments.map(a => toAssessmentResponse(a)));
});

// POST /assessments
router.post("/assessments", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  const tenantId = user.partnerId ?? user.organisationId ?? "platform";
  const { title, description, type, competencyTags } = req.body;
  const [assessment] = await db
    .insert(assessmentsTable)
    .values({ title, description, type, tenantId, competencyTags: competencyTags ?? [], status: "draft" })
    .returning();
  res.status(201).json(toAssessmentResponse(assessment));
});

// GET /assessments/:assessmentId
router.get("/assessments/:assessmentId", requireAuth, async (req, res) => {
  const assessment = await db.query.assessmentsTable.findFirst({
    where: eq(assessmentsTable.id, req.params.assessmentId),
  });
  if (!assessment) { res.status(404).json({ error: "Not found" }); return; }
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(assessmentItemsTable)
    .where(eq(assessmentItemsTable.assessmentId, assessment.id));
  res.json(toAssessmentResponse(assessment, Number(countResult.count)));
});

// POST /assessments/:assessmentId/attempt
router.post("/assessments/:assessmentId/attempt", requireAuth, async (req, res) => {
  const assessment = await db.query.assessmentsTable.findFirst({
    where: eq(assessmentsTable.id, req.params.assessmentId),
  });
  if (!assessment) { res.status(404).json({ error: "Not found" }); return; }

  // Get first item (adaptive: pick by difficulty ~0.5 for first item)
  const items = await db
    .select()
    .from(assessmentItemsTable)
    .where(eq(assessmentItemsTable.assessmentId, assessment.id));

  if (items.length === 0) {
    res.status(400).json({ error: "Assessment has no items" });
    return;
  }

  const firstItem = items.sort((a, b) => Math.abs(Number(a.difficulty) - 0.5) - Math.abs(Number(b.difficulty) - 0.5))[0];

  const [attempt] = await db
    .insert(attemptsTable)
    .values({
      assessmentId: assessment.id,
      userId: req.userId!,
      status: "in_progress",
      currentItemId: firstItem.id,
      competencyScores: {},
    })
    .returning();

  res.status(201).json({
    attemptId: attempt.id,
    status: attempt.status,
    nextItem: formatItem(firstItem),
    result: null,
  });
});

function formatItem(item: typeof assessmentItemsTable.$inferSelect) {
  return {
    id: item.id,
    stem: item.stem,
    options: item.options as any[],
    difficulty: Number(item.difficulty),
    competencyTag: item.competencyTag,
  };
}

// POST /attempts/:attemptId/respond
router.post("/attempts/:attemptId/respond", requireAuth, async (req, res) => {
  const { itemId, selectedOptionId, responseTimeMs } = req.body;
  const attempt = await db.query.attemptsTable.findFirst({
    where: eq(attemptsTable.id, req.params.attemptId),
  });
  if (!attempt || attempt.userId !== req.userId) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const item = await db.query.assessmentItemsTable.findFirst({
    where: eq(assessmentItemsTable.id, itemId),
  });
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  const correct = selectedOptionId === item.correctOptionId;

  // Record response
  await db.insert(itemResponsesTable).values({
    attemptId: attempt.id,
    itemId,
    selectedOptionId,
    correct,
    responseTimeMs,
  });

  await db
    .update(attemptsTable)
    .set({ itemCount: sql`${attemptsTable.itemCount} + 1` })
    .where(eq(attemptsTable.id, attempt.id));

  // Simple adaptive: stop after 10 items or if confident
  const newItemCount = attempt.itemCount + 1;
  const allItems = await db
    .select()
    .from(assessmentItemsTable)
    .where(eq(assessmentItemsTable.assessmentId, attempt.assessmentId));
  const responses = await db
    .select()
    .from(itemResponsesTable)
    .where(eq(itemResponsesTable.attemptId, attempt.id));

  const answeredIds = new Set(responses.map(r => r.itemId));
  const remaining = allItems.filter(i => !answeredIds.has(i.id));
  const correctCount = responses.filter(r => r.correct).length;
  const totalCount = responses.length;
  const ability = totalCount > 0 ? correctCount / totalCount : 0;

  if (remaining.length === 0 || newItemCount >= 10) {
    // Complete
    const [updated] = await db
      .update(attemptsTable)
      .set({ status: "complete", overallAbility: ability.toString(), completedAt: new Date() })
      .where(eq(attemptsTable.id, attempt.id))
      .returning();

    res.json({
      attemptId: attempt.id,
      status: "complete",
      nextItem: null,
      result: {
        attemptId: attempt.id,
        competencyScores: [],
        overallAbility: ability,
        completedAt: updated.completedAt?.toISOString() ?? new Date().toISOString(),
      },
    });
  } else {
    // Pick next item by difficulty closest to current ability estimate
    const nextItem = remaining.sort(
      (a, b) => Math.abs(Number(a.difficulty) - ability) - Math.abs(Number(b.difficulty) - ability)
    )[0];

    await db
      .update(attemptsTable)
      .set({ currentItemId: nextItem.id })
      .where(eq(attemptsTable.id, attempt.id));

    res.json({
      attemptId: attempt.id,
      status: "in_progress",
      nextItem: formatItem(nextItem),
      result: null,
    });
  }
});

export default router;
