import { Router } from "express";
import { requireApiKey } from "../lib/apiAuth";
import { db } from "@workspace/db";
import { conceptsTable, checkpointsTable, dailyPlansTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { runExtraction, saveConcepts } from "./material";

// The public, API-key-authenticated surface. Every route acts as the key owner.
const router = Router();

// GET /v1/me — the account the key belongs to.
router.get("/v1/me", requireApiKey, async (req, res) => {
  const userId = (req as any).userId;
  const ent = (req as any).entitlement;
  const rows = await db
    .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  res.json({ ...(rows[0] ?? { id: userId }), tier: ent?.tier ?? "free", isPro: !!ent?.isPro });
});

// GET /v1/concepts — the learner's concept library.
router.get("/v1/concepts", requireApiKey, async (req, res) => {
  const userId = (req as any).userId;
  const rows = await db
    .select()
    .from(conceptsTable)
    .where(eq(conceptsTable.userId, userId))
    .orderBy(desc(conceptsTable.id));
  res.json(
    rows.map((c) => ({
      id: c.id,
      title: c.title,
      content: c.content,
      mastery: c.mastery,
      dueDate: c.dueDate,
      reps: c.reps,
    })),
  );
});

// GET /v1/progress — compact readiness summary.
router.get("/v1/progress", requireApiKey, async (req, res) => {
  const userId = (req as any).userId;
  const today = new Date().toISOString().slice(0, 10);
  const [concepts, checkpoints] = await Promise.all([
    db.select().from(conceptsTable).where(eq(conceptsTable.userId, userId)),
    db
      .select()
      .from(checkpointsTable)
      .where(eq(checkpointsTable.userId, userId))
      .orderBy(desc(checkpointsTable.id))
      .limit(50),
  ]);
  const total = concepts.length;
  const mastered = concepts.filter((c) => c.mastery >= 0.8).length;
  const avgMastery = total > 0 ? concepts.reduce((s, c) => s + c.mastery, 0) / total : 0;
  const graded = checkpoints.filter((c) => c.coachGrade !== null);
  const accuracy = graded.length > 0 ? graded.reduce((s, c) => s + (c.coachGrade ?? 0), 0) / (graded.length * 3) : 0;
  const readinessPercent = Math.round((avgMastery * 0.6 + (accuracy || avgMastery) * 0.4) * 100);
  res.json({
    totalConcepts: total,
    masteredConcepts: mastered,
    dueToday: concepts.filter((c) => c.dueDate <= today).length,
    checkpointsCompleted: graded.length,
    accuracyPercent: Math.round(accuracy * 100),
    readinessPercent,
  });
});

// GET /v1/plan/today — today's plan, if one exists.
router.get("/v1/plan/today", requireApiKey, async (req, res) => {
  const userId = (req as any).userId;
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(dailyPlansTable)
    .where(and(eq(dailyPlansTable.userId, userId), eq(dailyPlansTable.date, today)))
    .limit(1);
  const p = rows[0];
  res.json(
    p
      ? {
          id: p.id,
          date: p.date,
          goalText: p.goalText,
          conceptIds: p.conceptIds,
          estimatedMinutes: p.estimatedMinutes,
          status: p.status,
        }
      : null,
  );
});

// POST /v1/material { text } — ingest material and extract concepts.
router.post("/v1/material", requireApiKey, async (req, res) => {
  const userId = (req as any).userId;
  const isPro = !!(req as any).entitlement?.isPro;
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  if (text.trim().length < 20) {
    res.status(400).json({ error: "Provide at least a paragraph of 'text' to extract from." });
    return;
  }
  try {
    const data = await runExtraction({ mode: "text", text }, userId, isPro);
    const result = await saveConcepts(userId, data, "api", isPro);
    res.status(201).json({
      added: result.concepts.length,
      concepts: result.concepts.map((c) => ({ id: c.id, title: c.title })),
    });
  } catch (err: any) {
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
    res.status(status).json({ error: err?.message ?? "Could not process that material." });
  }
});

export default router;
