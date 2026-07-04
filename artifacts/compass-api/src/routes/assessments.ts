import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, assessmentsTable, activitiesTable } from "@workspace/compass-db";
import {
  ListAssessmentsParams,
  CreateAssessmentParams,
  CreateAssessmentBody,
  UpdateAssessmentParams,
  UpdateAssessmentBody,
  DeleteAssessmentParams,
  ListActivitiesParams,
  CreateActivityParams,
  CreateActivityBody,
  UpdateActivityParams,
  UpdateActivityBody,
  DeleteActivityParams,
} from "@workspace/compass-api-zod";
import {
  denyNoScope,
  resolveActivityScope,
  resolveAssessmentScope,
  resolveCourseScope,
} from "../lib/tenancy";
import { recordActorAudit } from "../lib/audit";

const router = Router();

function parseIds(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as number[];
    return [];
  } catch {
    return [];
  }
}

// Assessments
router.get("/courses/:courseId/assessments", async (req, res): Promise<void> => {
  const params = ListAssessmentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (await denyNoScope(res, req.actor!, await resolveCourseScope(params.data.courseId), "read", "Course not found")) {
    return;
  }

  const assessments = await db
    .select()
    .from(assessmentsTable)
    .where(eq(assessmentsTable.courseId, params.data.courseId))
    .orderBy(assessmentsTable.createdAt);

  const result = assessments.map((a) => ({
    ...a,
    alignedObjectiveIds: parseIds(a.alignedObjectiveIds),
  }));

  res.json(result);
});

router.post("/courses/:courseId/assessments", async (req, res): Promise<void> => {
  const params = CreateAssessmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateAssessmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Creating an assessment is a course-level write.
  const courseScope = await resolveCourseScope(params.data.courseId);
  if (await denyNoScope(res, req.actor!, courseScope, "write", "Course not found")) {
    return;
  }

  const [assessment] = await db
    .insert(assessmentsTable)
    .values({
      courseId: params.data.courseId,
      title: parsed.data.title,
      assessmentType: parsed.data.assessmentType,
      description: parsed.data.description ?? null,
      masteryEvidence: parsed.data.masteryEvidence ?? null,
      misconceptionTargeted: parsed.data.misconceptionTargeted ?? null,
      status: "draft",
      alignedObjectiveIds: JSON.stringify(parsed.data.alignedObjectiveIds ?? []),
    })
    .returning();

  await recordActorAudit(req.actor!, {
    action: "created",
    entityType: "assessment",
    entityTitle: assessment.title,
    projectId: courseScope?.projectId ?? null,
  });

  res.status(201).json({
    ...assessment,
    alignedObjectiveIds: parseIds(assessment.alignedObjectiveIds),
  });
});

router.patch("/assessments/:id", async (req, res): Promise<void> => {
  const params = UpdateAssessmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateAssessmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const assessmentScope = await resolveAssessmentScope(params.data.id);
  if (await denyNoScope(res, req.actor!, assessmentScope, "write", "Assessment not found")) {
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.assessmentType !== undefined) updates.assessmentType = parsed.data.assessmentType;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.masteryEvidence !== undefined) updates.masteryEvidence = parsed.data.masteryEvidence;
  if (parsed.data.misconceptionTargeted !== undefined) updates.misconceptionTargeted = parsed.data.misconceptionTargeted;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.alignedObjectiveIds !== undefined) {
    updates.alignedObjectiveIds = JSON.stringify(parsed.data.alignedObjectiveIds);
  }

  const [assessment] = await db
    .update(assessmentsTable)
    .set(updates)
    .where(eq(assessmentsTable.id, params.data.id))
    .returning();

  if (!assessment) {
    res.status(404).json({ error: "Assessment not found" });
    return;
  }

  await recordActorAudit(req.actor!, {
    action: "updated",
    entityType: "assessment",
    entityTitle: assessment.title,
    projectId: assessmentScope?.projectId ?? null,
  });

  res.json({ ...assessment, alignedObjectiveIds: parseIds(assessment.alignedObjectiveIds) });
});

router.delete("/assessments/:id", async (req, res): Promise<void> => {
  const params = DeleteAssessmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const assessmentScope = await resolveAssessmentScope(params.data.id);
  if (await denyNoScope(res, req.actor!, assessmentScope, "write", "Assessment not found")) {
    return;
  }

  const [deleted] = await db
    .delete(assessmentsTable)
    .where(eq(assessmentsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Assessment not found" });
    return;
  }

  await recordActorAudit(req.actor!, {
    action: "deleted",
    entityType: "assessment",
    entityTitle: deleted.title,
    projectId: assessmentScope?.projectId ?? null,
  });

  res.sendStatus(204);
});

// Activities
router.get("/courses/:courseId/activities", async (req, res): Promise<void> => {
  const params = ListActivitiesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (await denyNoScope(res, req.actor!, await resolveCourseScope(params.data.courseId), "read", "Course not found")) {
    return;
  }

  const activities = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.courseId, params.data.courseId))
    .orderBy(activitiesTable.createdAt);

  const result = activities.map((a) => ({
    ...a,
    alignedObjectiveIds: parseIds(a.alignedObjectiveIds),
  }));

  res.json(result);
});

router.post("/courses/:courseId/activities", async (req, res): Promise<void> => {
  const params = CreateActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateActivityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Creating an activity is a course-level write.
  const courseScope = await resolveCourseScope(params.data.courseId);
  if (await denyNoScope(res, req.actor!, courseScope, "write", "Course not found")) {
    return;
  }

  const [activity] = await db
    .insert(activitiesTable)
    .values({
      courseId: params.data.courseId,
      title: parsed.data.title,
      activityType: parsed.data.activityType,
      description: parsed.data.description ?? null,
      moderationPolicy: parsed.data.moderationPolicy ?? null,
      incentiveStructure: parsed.data.incentiveStructure ?? null,
      status: "draft",
      alignedObjectiveIds: JSON.stringify(parsed.data.alignedObjectiveIds ?? []),
    })
    .returning();

  await recordActorAudit(req.actor!, {
    action: "created",
    entityType: "activity",
    entityTitle: activity.title,
    projectId: courseScope?.projectId ?? null,
  });

  res.status(201).json({
    ...activity,
    alignedObjectiveIds: parseIds(activity.alignedObjectiveIds),
  });
});

router.patch("/activities/:id", async (req, res): Promise<void> => {
  const params = UpdateActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateActivityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const activityScope = await resolveActivityScope(params.data.id);
  if (await denyNoScope(res, req.actor!, activityScope, "write", "Activity not found")) {
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.activityType !== undefined) updates.activityType = parsed.data.activityType;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.moderationPolicy !== undefined) updates.moderationPolicy = parsed.data.moderationPolicy;
  if (parsed.data.incentiveStructure !== undefined) updates.incentiveStructure = parsed.data.incentiveStructure;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.alignedObjectiveIds !== undefined) {
    updates.alignedObjectiveIds = JSON.stringify(parsed.data.alignedObjectiveIds);
  }

  const [activity] = await db
    .update(activitiesTable)
    .set(updates)
    .where(eq(activitiesTable.id, params.data.id))
    .returning();

  if (!activity) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }

  await recordActorAudit(req.actor!, {
    action: "updated",
    entityType: "activity",
    entityTitle: activity.title,
    projectId: activityScope?.projectId ?? null,
  });

  res.json({ ...activity, alignedObjectiveIds: parseIds(activity.alignedObjectiveIds) });
});

router.delete("/activities/:id", async (req, res): Promise<void> => {
  const params = DeleteActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const activityScope = await resolveActivityScope(params.data.id);
  if (await denyNoScope(res, req.actor!, activityScope, "write", "Activity not found")) {
    return;
  }

  const [deleted] = await db
    .delete(activitiesTable)
    .where(eq(activitiesTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }

  await recordActorAudit(req.actor!, {
    action: "deleted",
    entityType: "activity",
    entityTitle: deleted.title,
    projectId: activityScope?.projectId ?? null,
  });

  res.sendStatus(204);
});

export default router;
