import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, sessionsTable, credentialsTable, submissionsTable, activityEventsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router = Router();

// GET /coach/learners
router.get("/coach/learners", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  // Get learners in the same org (or partner if coach doesn't have org)
  const learners = await db
    .select()
    .from(usersTable)
    .where(
      user.organisationId
        ? and(eq(usersTable.organisationId, user.organisationId), eq(usersTable.role, "learner"))
        : and(eq(usersTable.partnerId, user.partnerId!), eq(usersTable.role, "learner"))
    );

  const summaries = await Promise.all(
    learners.map(async (l) => {
      const [activeSessionCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(sessionsTable)
        .where(and(eq(sessionsTable.userId, l.id), eq(sessionsTable.status, "active")));
      const [completedCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(sessionsTable)
        .where(and(eq(sessionsTable.userId, l.id), eq(sessionsTable.status, "mastered")));
      const [credentialCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(credentialsTable)
        .where(eq(credentialsTable.userId, l.id));
      const lastSession = await db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.userId, l.id))
        .orderBy(desc(sessionsTable.createdAt))
        .limit(1);

      const completions = Number(completedCount.count);
      const total = completions + Number(activeSessionCount.count);
      const readinessScore = total > 0 ? completions / total : 0;

      return {
        userId: l.id,
        email: l.email,
        firstName: l.firstName,
        lastName: l.lastName,
        activeEnrolments: Number(activeSessionCount.count),
        completions,
        credentialsEarned: Number(credentialCount.count),
        lastActivityAt: lastSession[0]?.createdAt.toISOString() ?? null,
        readinessScore,
        topGaps: [],
      };
    })
  );

  res.json(summaries);
});

// GET /coach/learners/:userId/presession
router.get("/coach/learners/:userId/presession", requireAuth, async (req, res) => {
  const learner = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.params.userId),
  });
  if (!learner) { res.status(404).json({ error: "Not found" }); return; }

  const recentSessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, learner.id))
    .orderBy(desc(sessionsTable.createdAt))
    .limit(5);

  const pendingWork = await db
    .select()
    .from(submissionsTable)
    .where(and(eq(submissionsTable.userId, learner.id), eq(submissionsTable.status, "submitted")));

  const completedModuleIds = recentSessions
    .filter(s => s.status === "mastered")
    .map(s => s.moduleId);

  const scores = recentSessions.map(s => Number(s.masteryScore));
  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  res.json({
    userId: learner.id,
    firstName: learner.firstName,
    strengths: completedModuleIds.length > 0 ? ["Completed modules with mastery"] : [],
    gaps: [],
    recentActivity: recentSessions.map(s => ({
      id: s.id,
      type: s.status === "mastered" ? "completion" : "enrolment",
      description: `Session ${s.status === "mastered" ? "completed with mastery" : "in progress"}`,
      userId: s.userId,
      moduleId: s.moduleId,
      createdAt: s.createdAt.toISOString(),
    })),
    completedModules: completedModuleIds,
    pendingWork: pendingWork.map(s => ({
      id: s.id,
      userId: s.userId,
      moduleId: s.moduleId,
      moduleTitle: s.moduleTitle,
      title: s.title,
      contentText: s.contentText,
      status: s.status,
      coachFeedback: s.coachFeedback,
      createdAt: s.createdAt.toISOString(),
      reviewedAt: s.reviewedAt?.toISOString() ?? null,
    })),
    avgMasteryScore: avg,
  });
});

// GET /coach/submissions
router.get("/coach/submissions", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  // Get all submitted work from learners in coach's org
  const submissions = await db
    .select()
    .from(submissionsTable)
    .where(eq(submissionsTable.status, "submitted"))
    .orderBy(desc(submissionsTable.createdAt))
    .limit(50);
  res.json(submissions.map(s => ({
    id: s.id,
    userId: s.userId,
    moduleId: s.moduleId,
    moduleTitle: s.moduleTitle,
    title: s.title,
    contentText: s.contentText,
    status: s.status,
    coachFeedback: s.coachFeedback,
    createdAt: s.createdAt.toISOString(),
    reviewedAt: s.reviewedAt?.toISOString() ?? null,
  })));
});

// PATCH /coach/submissions/:submissionId
router.patch("/coach/submissions/:submissionId", requireAuth, async (req, res) => {
  const { status, feedback } = req.body;
  const [updated] = await db
    .update(submissionsTable)
    .set({ status, coachFeedback: feedback, coachId: req.userId, reviewedAt: new Date() })
    .where(eq(submissionsTable.id, req.params.submissionId))
    .returning();
  res.json({
    id: updated.id,
    userId: updated.userId,
    moduleId: updated.moduleId,
    moduleTitle: updated.moduleTitle,
    title: updated.title,
    contentText: updated.contentText,
    status: updated.status,
    coachFeedback: updated.coachFeedback,
    createdAt: updated.createdAt.toISOString(),
    reviewedAt: updated.reviewedAt?.toISOString() ?? null,
  });
});

export default router;
