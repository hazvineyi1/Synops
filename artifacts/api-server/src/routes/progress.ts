import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { conceptsTable, checkpointsTable, dailyPlansTable, profilesTable, retrospectivesTable } from "@workspace/db";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { createMessage, MODEL, getPersonalityPrompt, FORMATTING_RULES, checkRateLimit } from "../lib/anthropic";
import { buildLearnerContext } from "../lib/learnerContext";
import { matchDomainPack, domainPackContext } from "../lib/domainPacks";

const router = Router();

// GET /progress/summary
router.get("/progress/summary", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const today = new Date().toISOString().slice(0, 10);

  const [concepts, recentCheckpoints, plans, profiles] = await Promise.all([
    db.select().from(conceptsTable).where(eq(conceptsTable.userId, userId)),
    db
      .select()
      .from(checkpointsTable)
      .where(eq(checkpointsTable.userId, userId))
      .orderBy(desc(checkpointsTable.id))
      .limit(20),
    db
      .select()
      .from(dailyPlansTable)
      .where(and(eq(dailyPlansTable.userId, userId), eq(dailyPlansTable.status, "completed")))
      .orderBy(desc(dailyPlansTable.date))
      .limit(30),
    db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1),
  ]);

  const totalConcepts = concepts.length;
  const masteredConcepts = concepts.filter((c) => c.mastery >= 0.8).length;
  const dueTodayCount = concepts.filter((c) => c.dueDate <= today).length;
  const averageMastery = totalConcepts > 0 ? concepts.reduce((s, c) => s + c.mastery, 0) / totalConcepts : 0;

  // Streak: consecutive days with a completed plan
  let streakDays = 0;
  const completedDates = new Set(plans.map((p) => p.date));
  const d = new Date();
  while (true) {
    const ds = d.toISOString().slice(0, 10);
    if (!completedDates.has(ds)) break;
    streakDays++;
    d.setDate(d.getDate() - 1);
  }

  const profile = profiles[0];
  let examDaysRemaining: number | null = null;
  if (profile?.examDate) {
    const exam = new Date(profile.examDate);
    const now = new Date();
    examDaysRemaining = Math.max(0, Math.ceil((exam.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }

  // Readiness: weighted combo of avg mastery + checkpoint accuracy + time buffer
  const gradedCheckpoints = recentCheckpoints.filter((c) => c.coachGrade !== null);
  const recentCheckpointAccuracy =
    gradedCheckpoints.length > 0
      ? gradedCheckpoints.reduce((s, c) => s + (c.coachGrade ?? 0), 0) / (gradedCheckpoints.length * 3)
      : null;

  const readinessPercent = Math.round(
    (averageMastery * 0.6 + (recentCheckpointAccuracy ?? averageMastery) * 0.4) * 100
  );

  // Mastery buckets
  const masteryBuckets = {
    new: concepts.filter((c) => c.reps === 0).length,
    learning: concepts.filter((c) => c.reps > 0 && c.mastery < 0.4).length,
    reviewing: concepts.filter((c) => c.mastery >= 0.4 && c.mastery < 0.8).length,
    mastered: masteredConcepts,
  };

  res.json({
    totalConcepts,
    masteredConcepts,
    dueTodayCount,
    averageMastery,
    streakDays,
    examDaysRemaining,
    readinessPercent,
    masteryBuckets,
    recentCheckpointAccuracy,
  });
});

// GET /progress/outcome — data-backed proof of progress and an honest projection.
// Everything here is computed from real history (checkpoint grades over time,
// mastery, calibration, pace) so the verdict is evidence, not a vibe.
router.get("/progress/outcome", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const now = Date.now();

  const [concepts, checkpoints, completedPlans, profiles] = await Promise.all([
    db.select().from(conceptsTable).where(eq(conceptsTable.userId, userId)),
    db.select().from(checkpointsTable).where(eq(checkpointsTable.userId, userId)).orderBy(checkpointsTable.id),
    db
      .select()
      .from(dailyPlansTable)
      .where(and(eq(dailyPlansTable.userId, userId), eq(dailyPlansTable.status, "completed"))),
    db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1),
  ]);

  const profile = profiles[0];
  const totalConcepts = concepts.length;
  const mastered = concepts.filter((c) => c.mastery >= 0.8).length;
  const masteredPct = totalConcepts > 0 ? Math.round((mastered / totalConcepts) * 100) : 0;
  const averageMastery = totalConcepts > 0 ? concepts.reduce((s, c) => s + c.mastery, 0) / totalConcepts : 0;

  // Graded checkpoints, in chronological order (by id).
  const graded = checkpoints.filter((c) => c.coachGrade !== null);
  const checkpointsCompleted = graded.length;
  const recentAccuracy =
    graded.length > 0 ? graded.reduce((s, c) => s + (c.coachGrade ?? 0), 0) / (graded.length * 3) : 0;

  // Accuracy trend: earlier half vs recent half (needs enough data to be honest).
  let accuracy: { recentPct: number; earlierPct: number | null; deltaPct: number | null };
  if (graded.length >= 6) {
    const mid = Math.floor(graded.length / 2);
    const earlier = graded.slice(0, mid);
    const recent = graded.slice(mid);
    const earlierFrac = earlier.reduce((s, c) => s + (c.coachGrade ?? 0), 0) / (earlier.length * 3);
    const recentFrac = recent.reduce((s, c) => s + (c.coachGrade ?? 0), 0) / (recent.length * 3);
    accuracy = {
      recentPct: Math.round(recentFrac * 100),
      earlierPct: Math.round(earlierFrac * 100),
      deltaPct: Math.round((recentFrac - earlierFrac) * 100),
    };
  } else {
    accuracy = { recentPct: Math.round(recentAccuracy * 100), earlierPct: null, deltaPct: null };
  }

  // Calibration: how stated confidence compares to actual results.
  const withConf = graded.filter((c) => c.confidenceBefore !== null);
  let calibration: string | null = null;
  if (withConf.length >= 3) {
    const avgConf = withConf.reduce((s, c) => s + (c.confidenceBefore ?? 0), 0) / withConf.length;
    const avgGrade = withConf.reduce((s, c) => s + (c.coachGrade ?? 0), 0) / withConf.length;
    const gap = avgConf - avgGrade;
    calibration = Math.abs(gap) <= 0.4 ? "well calibrated" : gap > 0.4 ? "overconfident" : "underconfident";
  }

  const readinessPercent = Math.round((averageMastery * 0.6 + (recentAccuracy || averageMastery) * 0.4) * 100);

  let daysToExam: number | null = null;
  if (profile?.examDate) {
    daysToExam = Math.max(0, Math.ceil((new Date(profile.examDate).getTime() - now) / 86400000));
  }

  // Mastery velocity from how long they have been studying.
  const firstConcept = concepts.reduce<Date | null>((min, c) => {
    const d = c.createdAt ? new Date(c.createdAt) : null;
    return d && (!min || d.getTime() < min.getTime()) ? d : min;
  }, null);
  const daysActive = firstConcept ? Math.max(1, (now - firstConcept.getTime()) / 86400000) : 1;
  const masteredPerWeek = (mastered / daysActive) * 7;

  // Project days to ~80% mastery at the current velocity.
  const target = Math.ceil(totalConcepts * 0.8);
  const remaining = Math.max(0, target - mastered);
  const projectedReadyInDays =
    remaining === 0 ? 0 : masteredPerWeek > 0.1 ? Math.round((remaining / masteredPerWeek) * 7) : null;

  // Honest verdict — only claims what the data supports.
  let verdict: "building" | "no_exam_date" | "ahead" | "on_track" | "behind";
  let verdictLabel: string;
  if (totalConcepts < 3 || checkpointsCompleted < 4) {
    verdict = "building";
    verdictLabel = "Building your baseline. Complete a few more checkpoints to unlock a trajectory.";
  } else if (daysToExam == null) {
    verdict = "no_exam_date";
    verdictLabel =
      remaining === 0
        ? "You have mastered the bulk of your material."
        : "Making progress. Set an exam date to get a pace check.";
  } else if (projectedReadyInDays == null) {
    verdict = "building";
    verdictLabel = "Not enough mastery momentum yet to project a readiness date.";
  } else if (projectedReadyInDays <= Math.floor(daysToExam * 0.85)) {
    verdict = "ahead";
    verdictLabel = "Ahead of pace for your exam date.";
  } else if (projectedReadyInDays <= daysToExam) {
    verdict = "on_track";
    verdictLabel = "On track for your exam date.";
  } else {
    verdict = "behind";
    verdictLabel = "Behind pace. Add reps or focus your weakest concepts to catch up.";
  }

  res.json({
    verdict,
    verdictLabel,
    readinessPercent,
    checkpointsCompleted,
    accuracy,
    mastery: { mastered, total: totalConcepts, masteredPct },
    calibration,
    pace: {
      daysToExam,
      masteredPerWeek: Math.round(masteredPerWeek * 10) / 10,
      projectedReadyInDays,
    },
    plansCompleted: completedPlans.length,
    generatedAt: new Date().toISOString(),
  });
});

// GET /progress/retrospectives
router.get("/progress/retrospectives", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const rows = await db
    .select()
    .from(retrospectivesTable)
    .where(eq(retrospectivesTable.userId, userId))
    .orderBy(desc(retrospectivesTable.id))
    .limit(12);
  res.json(rows);
});

// POST /progress/weekly-retro
router.post("/progress/weekly-retro", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const isPro = !!(req as any).entitlement?.isPro;

  // Weekly retrospectives are a Pro feature.
  if (!isPro) {
    res.status(402).json({ error: "Weekly retrospectives are a Pro feature. Upgrade to unlock them." });
    return;
  }

  if (!checkRateLimit(userId, isPro)) {
    res.status(429).json({ error: "Daily AI call limit reached" });
    return;
  }

  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() + 1);
  const weekStart = monday.toISOString().slice(0, 10);
  const weekStartTime = monday.getTime();

  const [concepts, checkpoints, plans, profiles] = await Promise.all([
    db.select().from(conceptsTable).where(eq(conceptsTable.userId, userId)),
    db
      .select()
      .from(checkpointsTable)
      .where(eq(checkpointsTable.userId, userId))
      .orderBy(desc(checkpointsTable.id))
      .limit(50),
    db
      .select()
      .from(dailyPlansTable)
      .where(eq(dailyPlansTable.userId, userId))
      .orderBy(desc(dailyPlansTable.date))
      .limit(7),
    db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1),
  ]);

  const personality = profiles[0]?.coachPersonality ?? "warm";
  const personalityPrompt = getPersonalityPrompt(personality);

  const weekPlans = plans.slice(0, 7);
  const completed = weekPlans.filter((p) => p.status === "completed").length;
  const gradedThisWeek = checkpoints.filter((c) => c.coachGrade !== null).slice(0, 20);
  const avgGrade =
    gradedThisWeek.length > 0
      ? gradedThisWeek.reduce((s, c) => s + (c.coachGrade ?? 0), 0) / (gradedThisWeek.length * 3)
      : 0;

  const weakConcepts = concepts
    .filter((c) => c.mastery < 0.4 && c.reps > 0)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 3)
    .map((c) => c.title);

  const strongConcepts = concepts
    .filter((c) => c.mastery >= 0.8)
    .sort((a, b) => b.mastery - a.mastery)
    .slice(0, 3)
    .map((c) => c.title);

  const learnerCtx = await buildLearnerContext(userId, {
    includeRetros: false,
    conceptLimit: 60,
    checkpointLimit: 12,
    planLimit: 7,
  });

  const pack = matchDomainPack(profiles[0]?.examName);

  const dataContext = `
Week of ${weekStart}:
- Plans completed: ${completed}/${weekPlans.length}
- Checkpoint accuracy: ${Math.round(avgGrade * 100)}%
- Total concepts: ${concepts.length}, Mastered: ${concepts.filter((c) => c.mastery >= 0.8).length}
- Weakest concepts: ${weakConcepts.join(", ") || "none yet"}
- Strongest concepts: ${strongConcepts.join(", ") || "none yet"}
- Exam date: ${profiles[0]?.examDate ?? "not set"}

${learnerCtx}${pack ? `\n\n${domainPackContext(pack)}` : ""}
`;

  const response = await createMessage({
    model: MODEL,
    max_tokens: 800,
    system: `${personalityPrompt}

Write a weekly retrospective for this learner. Reference real data from their week. Cover: biggest wins, stickiest problems, and what the focus will be next week. If an exam domain pack is provided, frame the wins, gaps, and next week's focus in terms of those weighted domains (where do they stand in the heaviest-weighted areas?). Write in your coaching voice, this is the coach reflecting, not a report. 200-300 words. Be specific, not generic.

${FORMATTING_RULES}`,
    messages: [{ role: "user", content: dataContext }],
  }, { label: "weekly-retro", userId });

  const content = response.content[0]?.type === "text" ? response.content[0].text : "Great work this week.";

  // Upsert retro for this week
  const existing = await db
    .select()
    .from(retrospectivesTable)
    .where(and(eq(retrospectivesTable.userId, userId), eq(retrospectivesTable.weekStart, weekStart)))
    .limit(1);

  let retro;
  if (existing.length > 0) {
    const [updated] = await db
      .update(retrospectivesTable)
      .set({ content })
      .where(eq(retrospectivesTable.id, existing[0].id))
      .returning();
    retro = updated;
  } else {
    const [inserted] = await db
      .insert(retrospectivesTable)
      .values({ userId, weekStart, content })
      .returning();
    retro = inserted;
  }

  res.json(retro);
});

export default router;
