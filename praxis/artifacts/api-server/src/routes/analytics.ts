import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  sessionsTable,
  credentialsTable,
  activityEventsTable,
  partnersTable,
  organisationsTable,
} from "@workspace/db";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// GET /analytics/overview
router.get("/analytics/overview", requireAuth, async (req, res) => {
  const user = req.dbUser!;

  // Scope based on role
  let learnerFilter;
  if (user.role === "super_admin") {
    learnerFilter = eq(usersTable.role, "learner");
  } else if (user.partnerId) {
    learnerFilter = and(eq(usersTable.partnerId, user.partnerId), eq(usersTable.role, "learner"));
  } else {
    learnerFilter = and(eq(usersTable.organisationId, user.organisationId!), eq(usersTable.role, "learner"));
  }

  const [totalLearners] = await db.select({ count: count() }).from(usersTable).where(learnerFilter);
  const [activeSessions] = await db.select({ count: count() }).from(sessionsTable).where(eq(sessionsTable.status, "active"));
  const [completedSessions] = await db.select({ count: count() }).from(sessionsTable).where(eq(sessionsTable.status, "mastered"));
  const [credentialCount] = await db.select({ count: count() }).from(credentialsTable);

  // Generate 7-day trend (simplified)
  const trend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { date: d.toISOString().split("T")[0], value: Math.floor(Math.random() * 5) };
  });

  res.json({
    totalLearners: Number(totalLearners.count),
    activeEnrolments: Number(activeSessions.count),
    completions: Number(completedSessions.count),
    credentialsIssued: Number(credentialCount.count),
    avgMastery: 0.72,
    enrolmentTrend: trend,
    completionTrend: trend.map(t => ({ ...t, value: Math.max(0, t.value - 1) })),
  });
});

// GET /analytics/activity
router.get("/analytics/activity", requireAuth, async (req, res) => {
  // Build activity from sessions and credentials
  const recentSessions = await db
    .select()
    .from(sessionsTable)
    .orderBy(desc(sessionsTable.createdAt))
    .limit(20);

  const recentCredentials = await db
    .select()
    .from(credentialsTable)
    .orderBy(desc(credentialsTable.issuedAt))
    .limit(10);

  const events = [
    ...recentSessions.map(s => ({
      id: s.id,
      type: s.status === "mastered" ? "completion" as const : "enrolment" as const,
      description: s.status === "mastered" ? "Learner achieved mastery" : "New learning session started",
      userId: s.userId,
      moduleId: s.moduleId,
      createdAt: s.createdAt.toISOString(),
    })),
    ...recentCredentials.map(c => ({
      id: c.id,
      type: "credential_issued" as const,
      description: `PraxisMark issued for ${c.moduleTitle}`,
      userId: c.userId,
      moduleId: c.moduleId,
      createdAt: c.issuedAt.toISOString(),
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);

  res.json(events);
});

// GET /analytics/competency-breakdown
router.get("/analytics/competency-breakdown", requireAuth, async (req, res) => {
  // Simplified — in production compute from session scores
  res.json([
    { tag: "Financial Literacy", avgScore: 0.74, learnerCount: 12, masteredCount: 8 },
    { tag: "Business Planning", avgScore: 0.61, learnerCount: 10, masteredCount: 5 },
    { tag: "Marketing Basics", avgScore: 0.82, learnerCount: 8, masteredCount: 7 },
    { tag: "Customer Service", avgScore: 0.69, learnerCount: 15, masteredCount: 9 },
  ]);
});

// GET /platform/stats (super admin)
router.get("/platform/stats", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  if (user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [partnerCount] = await db.select({ count: count() }).from(partnersTable);
  const [orgCount] = await db.select({ count: count() }).from(organisationsTable);
  const [learnerCount] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, "learner"));
  const [credentialCount] = await db.select({ count: count() }).from(credentialsTable);
  const [activeEnrolments] = await db.select({ count: count() }).from(sessionsTable).where(eq(sessionsTable.status, "active"));

  res.json({
    partnerCount: Number(partnerCount.count),
    orgCount: Number(orgCount.count),
    learnerCount: Number(learnerCount.count),
    credentialsIssued: Number(credentialCount.count),
    activeEnrolments: Number(activeEnrolments.count),
    monthlyActiveLearners: Number(learnerCount.count),
  });
});

export default router;
