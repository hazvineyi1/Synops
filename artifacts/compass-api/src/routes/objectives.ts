import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, objectivesTable, assessmentsTable, activitiesTable } from "@workspace/compass-db";
import {
  ListObjectivesParams,
  CreateObjectiveParams,
  CreateObjectiveBody,
  UpdateObjectiveParams,
  UpdateObjectiveBody,
  DeleteObjectiveParams,
} from "@workspace/compass-api-zod";
import { denyNoScope, resolveObjectiveScope, resolveProjectScope } from "../lib/tenancy";
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

router.get("/projects/:projectId/objectives", async (req, res): Promise<void> => {
  const params = ListObjectivesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveProjectScope(params.data.projectId),
      "read",
      "Project not found",
    )
  ) {
    return;
  }

  const objectives = await db
    .select()
    .from(objectivesTable)
    .where(eq(objectivesTable.projectId, params.data.projectId))
    .orderBy(objectivesTable.createdAt);

  const assessments = await db.select().from(assessmentsTable);
  const activities = await db.select().from(activitiesTable);

  const result = objectives.map((obj) => {
    const alignedAssessmentCount = assessments.filter((a) =>
      parseIds(a.alignedObjectiveIds).includes(obj.id)
    ).length;
    const alignedActivityCount = activities.filter((a) =>
      parseIds(a.alignedObjectiveIds).includes(obj.id)
    ).length;
    return { ...obj, alignedAssessmentCount, alignedActivityCount };
  });

  res.json(result);
});

router.post("/projects/:projectId/objectives", async (req, res): Promise<void> => {
  const params = CreateObjectiveParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateObjectiveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // An objective is a project-level entity; creating one is a project-level write.
  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveProjectScope(params.data.projectId),
      "write",
      "Project not found",
    )
  ) {
    return;
  }

  const [objective] = await db
    .insert(objectivesTable)
    .values({
      projectId: params.data.projectId,
      level: parsed.data.level,
      text: parsed.data.text,
      parentId: parsed.data.parentId ?? null,
      moduleId: parsed.data.moduleId ?? null,
      masteryEvidence: parsed.data.masteryEvidence ?? null,
      isFlagged: false,
    })
    .returning();

  await recordActorAudit(req.actor!, {
    action: "created",
    entityType: "objective",
    entityTitle: objective.text,
    projectId: params.data.projectId,
  });

  res.status(201).json({ ...objective, alignedAssessmentCount: 0, alignedActivityCount: 0 });
});

router.patch("/objectives/:id", async (req, res): Promise<void> => {
  const params = UpdateObjectiveParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateObjectiveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const objectiveScope = await resolveObjectiveScope(params.data.id);
  if (await denyNoScope(res, req.actor!, objectiveScope, "write", "Objective not found")) {
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.level !== undefined) updates.level = parsed.data.level;
  if (parsed.data.text !== undefined) updates.text = parsed.data.text;
  if (parsed.data.parentId !== undefined) updates.parentId = parsed.data.parentId;
  if (parsed.data.moduleId !== undefined) updates.moduleId = parsed.data.moduleId;
  if (parsed.data.masteryEvidence !== undefined) updates.masteryEvidence = parsed.data.masteryEvidence;
  if (parsed.data.isFlagged !== undefined) updates.isFlagged = parsed.data.isFlagged;

  const [objective] = await db
    .update(objectivesTable)
    .set(updates)
    .where(eq(objectivesTable.id, params.data.id))
    .returning();

  if (!objective) {
    res.status(404).json({ error: "Objective not found" });
    return;
  }

  await recordActorAudit(req.actor!, {
    action: "updated",
    entityType: "objective",
    entityTitle: objective.text,
    projectId: objectiveScope?.projectId ?? null,
  });

  res.json({ ...objective, alignedAssessmentCount: 0, alignedActivityCount: 0 });
});

router.delete("/objectives/:id", async (req, res): Promise<void> => {
  const params = DeleteObjectiveParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const objectiveScope = await resolveObjectiveScope(params.data.id);
  if (await denyNoScope(res, req.actor!, objectiveScope, "write", "Objective not found")) {
    return;
  }

  const [deleted] = await db
    .delete(objectivesTable)
    .where(eq(objectivesTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Objective not found" });
    return;
  }

  await recordActorAudit(req.actor!, {
    action: "deleted",
    entityType: "objective",
    entityTitle: deleted.text,
    projectId: objectiveScope?.projectId ?? null,
  });

  res.sendStatus(204);
});

export default router;
