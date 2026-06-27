import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { dailyPlansTable, conceptsTable, profilesTable } from "@workspace/db";
import { eq, and, desc, lte } from "drizzle-orm";
import { emitWebhook } from "../lib/apiAuth";

const router = Router();

// GET /plans
router.get("/plans", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const limit = Math.min(Number(req.query.limit) || 30, 90);
  const rows = await db
    .select()
    .from(dailyPlansTable)
    .where(eq(dailyPlansTable.userId, userId))
    .orderBy(desc(dailyPlansTable.id))
    .limit(limit);
  res.json(rows);
});

// GET /plans/today — get or create today's plan
router.get("/plans/today", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const today = new Date().toISOString().slice(0, 10);

  const existing = await db
    .select()
    .from(dailyPlansTable)
    .where(and(eq(dailyPlansTable.userId, userId), eq(dailyPlansTable.date, today)))
    .limit(1);

  if (existing.length > 0) {
    res.json(existing[0]);
    return;
  }

  // Auto-create a simple plan from due concepts
  const dueConcepts = await db
    .select()
    .from(conceptsTable)
    .where(and(eq(conceptsTable.userId, userId), lte(conceptsTable.dueDate, today)))
    .orderBy(conceptsTable.mastery)
    .limit(5);

  const profiles = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
  const hoursPerWeek = profiles[0]?.hoursPerWeek ?? 8;
  const minutesPerDay = Math.round((hoursPerWeek * 60) / 7);

  const [plan] = await db
    .insert(dailyPlansTable)
    .values({
      userId,
      date: today,
      goalText: dueConcepts.length > 0 ? `Review ${dueConcepts.map((c) => c.title).join(", ")}` : "Add study material to get started",
      conceptIds: dueConcepts.map((c) => c.id),
      estimatedMinutes: Math.min(minutesPerDay, dueConcepts.length * 10),
      status: "proposed",
      completedConceptIds: [],
    })
    .returning();

  res.json(plan);
});

// PATCH /plans/:planId
router.patch("/plans/:planId", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const planId = Number(req.params.planId);
  const { status, completedConceptIds } = req.body;

  const updateFields: Record<string, unknown> = {};
  if (status) updateFields.status = status;
  if (completedConceptIds !== undefined) updateFields.completedConceptIds = completedConceptIds;

  const [plan] = await db
    .update(dailyPlansTable)
    .set(updateFields)
    .where(and(eq(dailyPlansTable.userId, userId), eq(dailyPlansTable.id, planId)))
    .returning();

  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  if (status === "completed") {
    void emitWebhook(userId, "plan.completed", {
      planId: plan.id,
      date: plan.date,
      goalText: plan.goalText,
      completedConceptIds: plan.completedConceptIds,
    });
  }

  res.json(plan);
});

export default router;
