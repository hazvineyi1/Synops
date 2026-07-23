import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { profilesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/profile", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const rows = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "No profile" });
    return;
  }
  res.json(rows[0]);
});

router.post("/profile", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const body = req.body;
  const [profile] = await db
    .insert(profilesTable)
    .values({
      userId,
      goal: body.goal,
      examName: body.examName ?? null,
      examDate: body.examDate ?? null,
      hoursPerWeek: body.hoursPerWeek ?? 8,
      baseline: body.baseline,
      calibration: body.calibration,
      coachPersonality: body.coachPersonality,
      recommendedCoach: body.recommendedCoach ?? null,
      assessmentComplete: body.assessmentComplete ?? false,
    })
    .onConflictDoUpdate({
      target: profilesTable.userId,
      set: {
        goal: body.goal,
        examName: body.examName ?? null,
        examDate: body.examDate ?? null,
        hoursPerWeek: body.hoursPerWeek ?? 8,
        baseline: body.baseline,
        calibration: body.calibration,
        coachPersonality: body.coachPersonality,
        recommendedCoach: body.recommendedCoach ?? null,
        assessmentComplete: body.assessmentComplete ?? false,
      },
    })
    .returning();
  // Mirror completion onto the users row so admin analytics ("Completed
  // onboarding") reflect reality; the profile table drives the app flow, but
  // the reporting column lives on users.
  await db
    .update(usersTable)
    .set({ assessmentComplete: body.assessmentComplete ?? false })
    .where(eq(usersTable.id, userId));
  res.status(201).json(profile);
});

router.patch("/profile", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const body = req.body;
  const isPro = !!(req as any).entitlement?.isPro;

  // Free tier keeps the coach the assessment assigned; switching coaches is Pro.
  if (!isPro && body.coachPersonality !== undefined) {
    const current = await db
      .select({ personality: profilesTable.coachPersonality })
      .from(profilesTable)
      .where(eq(profilesTable.userId, userId))
      .limit(1);
    if (current[0] && current[0].personality !== body.coachPersonality) {
      res.status(402).json({ error: "All four coaches are a Pro feature. Upgrade to switch coaches." });
      return;
    }
  }

  const updateFields: Record<string, unknown> = {};
  if (body.goal !== undefined) updateFields.goal = body.goal;
  if (body.examName !== undefined) updateFields.examName = body.examName;
  if (body.examDate !== undefined) updateFields.examDate = body.examDate;
  if (body.hoursPerWeek !== undefined) updateFields.hoursPerWeek = body.hoursPerWeek;
  if (body.baseline !== undefined) updateFields.baseline = body.baseline;
  if (body.calibration !== undefined) updateFields.calibration = body.calibration;
  if (body.coachPersonality !== undefined) updateFields.coachPersonality = body.coachPersonality;
  if (body.assessmentComplete !== undefined) updateFields.assessmentComplete = body.assessmentComplete;

  const [profile] = await db
    .update(profilesTable)
    .set(updateFields)
    .where(eq(profilesTable.userId, userId))
    .returning();
  // Keep the users reporting column in sync when completion changes here too.
  if (body.assessmentComplete !== undefined) {
    await db
      .update(usersTable)
      .set({ assessmentComplete: !!body.assessmentComplete })
      .where(eq(usersTable.id, userId));
  }
  res.json(profile);
});

export default router;
