import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  studyLearnerProfilesTable,
  studyAssessmentsTable,
  studyLearningPathsTable,
  studyPracticeSessionsTable,
  studyMockExamsTable,
  studyLearningStyleProfilesTable,
} from "@workspace/paideia-db";
import { and, desc, eq } from "drizzle-orm";
import { isLearningProfile } from "../../lib/prompts.js";
import { requireStudyUser } from "../../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireStudyUser);

const updateSchema = z.object({
  goals: z.array(z.string()).optional(),
  examTarget: z.string().nullable().optional(),
  studyStyle: z.string().optional(),
  preferredSessionLength: z.number().int().min(5).max(120).optional(),
  preferredDifficulty: z.string().optional(),
  interests: z.array(z.string()).optional(),
  background: z.string().nullable().optional(),
  dailyStudyMinutes: z.number().int().min(5).max(480).optional(),
  timezone: z.string().nullable().optional(),
  // Diagnostic intake fields
  examDate: z.string().datetime().nullable().optional(),
  hoursPerWeek: z.number().int().min(1).max(80).nullable().optional(),
  baselineLevel: z.enum(["zero", "foundations", "solid", "rusty"]).nullable().optional(),
  calibrationSelfRating: z.enum(["high", "mid", "low", "under"]).nullable().optional(),
  failureMode: z.enum(["passive", "cram", "avoid", "scattered", "perfect"]).nullable().optional(),
  coachPersonality: z.enum(["drill", "socratic", "warm", "analyst"]).nullable().optional(),
});

router.get("/", async (req, res) => {
  const userId = req.studyUser!.id;
  let [profile] = await db
    .select()
    .from(studyLearnerProfilesTable)
    .where(eq(studyLearnerProfilesTable.userId, userId))
    .limit(1);

  if (!profile) {
    [profile] = await db
      .insert(studyLearnerProfilesTable)
      .values({
        userId,
        studyStyle: "balanced",
        preferredSessionLength: 25,
        preferredDifficulty: "mixed",
        dailyStudyMinutes: 30,
      })
      .returning();
  }

  // Attach the latest completed assessment's evidence-based LearningProfile (schemaVersion 1)
  // so the Profile page can render the canonical cognitive profile. We deliberately do not
  // store this on studyLearnerProfilesTable - assessments are the source of truth and the
  // profile refines as new assessments complete.
  const [latestAssessment] = await db
    .select({ results: studyAssessmentsTable.results })
    .from(studyAssessmentsTable)
    .where(and(eq(studyAssessmentsTable.userId, userId), eq(studyAssessmentsTable.status, "completed")))
    .orderBy(desc(studyAssessmentsTable.completedAt))
    .limit(1);
  // Validate the persisted profile against the canonical schema. Older assessments may have
  // a pre-canonical shape; we return null in that case rather than leaking a stale shape.
  const rawLearningProfile = (latestAssessment?.results as { learningProfile?: unknown } | null)?.learningProfile;
  const learningProfile = isLearningProfile(rawLearningProfile) ? rawLearningProfile : null;

  // Diagnostic intake is "complete" when the 5 onboarding signals are all set.
  // The path generator should adapt to these signals once available.
  const diagnosticComplete = Boolean(
    profile.examTarget &&
      profile.hoursPerWeek &&
      profile.baselineLevel &&
      profile.calibrationSelfRating &&
      profile.failureMode,
  );

  res.json({ ...profile, learningProfile, diagnosticComplete });
});

router.patch("/", async (req, res) => {
  const userId = req.studyUser!.id;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const data = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (data.goals !== undefined) updateData.goals = data.goals;
  if (data.examTarget !== undefined) updateData.examTarget = data.examTarget;
  if (data.studyStyle !== undefined) updateData.studyStyle = data.studyStyle;
  if (data.preferredSessionLength !== undefined) updateData.preferredSessionLength = data.preferredSessionLength;
  if (data.preferredDifficulty !== undefined) updateData.preferredDifficulty = data.preferredDifficulty;
  if (data.interests !== undefined) updateData.interests = data.interests;
  if (data.background !== undefined) updateData.background = data.background;
  if (data.dailyStudyMinutes !== undefined) updateData.dailyStudyMinutes = data.dailyStudyMinutes;
  if (data.timezone !== undefined) updateData.timezone = data.timezone;
  if (data.examDate !== undefined) updateData.examDate = data.examDate ? new Date(data.examDate) : null;
  if (data.hoursPerWeek !== undefined) updateData.hoursPerWeek = data.hoursPerWeek;
  if (data.baselineLevel !== undefined) updateData.baselineLevel = data.baselineLevel;
  if (data.calibrationSelfRating !== undefined) updateData.calibrationSelfRating = data.calibrationSelfRating;
  if (data.failureMode !== undefined) updateData.failureMode = data.failureMode;
  if (data.coachPersonality !== undefined) updateData.coachPersonality = data.coachPersonality;
  updateData.updatedAt = new Date();

  const [profile] = await db
    .update(studyLearnerProfilesTable)
    .set(updateData)
    .where(eq(studyLearnerProfilesTable.userId, userId))
    .returning();

  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(profile);
});

// POST /study/profile/reset, test again / start over.
// scope:
//   "progress"  , wipe study artifacts (paths, practice, exams). Keep materials, profile, learning-style.
//   "diagnostic", also clear the 5 intake fields + delete learning-style profile so both gates re-run.
//   "everything", both of the above.
// We never touch materials/concepts, those are the learner's uploaded source content.
const resetSchema = z.object({
  scope: z.enum(["progress", "diagnostic", "everything"]),
});

router.post("/reset", async (req, res) => {
  const userId = req.studyUser!.id;
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid scope. Expected 'progress', 'diagnostic', or 'everything'." });
    return;
  }
  const { scope } = parsed.data;
  const wipeProgress = scope === "progress" || scope === "everything";
  const wipeDiagnostic = scope === "diagnostic" || scope === "everything";

  // Wrap in a transaction so partial resets can never leave the learner in a half-cleared
  // state (e.g., paths deleted but exams still present). All-or-nothing.
  try {
    await db.transaction(async (tx) => {
      if (wipeProgress) {
        // Path steps cascade-delete from studyLearningPathsTable.
        await tx.delete(studyLearningPathsTable).where(eq(studyLearningPathsTable.userId, userId));
        await tx.delete(studyPracticeSessionsTable).where(eq(studyPracticeSessionsTable.userId, userId));
        await tx.delete(studyMockExamsTable).where(eq(studyMockExamsTable.userId, userId));
      }
      if (wipeDiagnostic) {
        await tx
          .update(studyLearnerProfilesTable)
          .set({
            examTarget: null,
            examDate: null,
            hoursPerWeek: null,
            baselineLevel: null,
            calibrationSelfRating: null,
            failureMode: null,
            coachPersonality: null,
            updatedAt: new Date(),
          })
          .where(eq(studyLearnerProfilesTable.userId, userId));
        // Legacy learning-style data, clear so old rows don't shadow the new intake.
        await tx.delete(studyLearningStyleProfilesTable).where(eq(studyLearningStyleProfilesTable.userId, userId));
        await tx.delete(studyAssessmentsTable).where(eq(studyAssessmentsTable.userId, userId));
      }
    });
  } catch (err) {
    console.error("[reset] transaction failed", err);
    res.status(500).json({ error: "Reset failed. No data was changed." });
    return;
  }

  res.json({ success: true, scope });
});

export default router;
