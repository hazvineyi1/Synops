import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  projectsTable,
  clientsTable,
  coursesTable,
  objectivesTable,
  assessmentsTable,
  qaChecksTable,
  auditEventsTable,
} from "@workspace/compass-db";
import {
  CreateProjectBody,
  UpdateProjectBody,
  GetProjectParams,
  UpdateProjectParams,
  AdvanceProjectStageParams,
  AdvanceProjectStageBody,
  GetProjectGateStatusParams,
} from "@workspace/compass-api-zod";
import {
  clientOrgFilter,
  denyCrossOrg,
  denyNoScope,
  denyBuilderWrite,
  getClientOrgId,
  loadBuilderScope,
  resolveProjectScope,
} from "../lib/tenancy";
import { activateProjectWithLimit, type Executor } from "../lib/billing";

const router = Router();

const STAGE_LABELS = [
  "Kickoff & Intake",
  "Backward Design",
  "QA & Accessibility",
  "Handoff",
];

async function projectWithClient(project: typeof projectsTable.$inferSelect) {
  const [client] = await db
    .select({ name: clientsTable.name })
    .from(clientsTable)
    .where(eq(clientsTable.id, project.clientId));
  return { ...project, clientName: client?.name ?? null };
}

type GateRequirement = { label: string; met: boolean; blocking: boolean; detail: string | null };

async function computeGateStatus(project: typeof projectsTable.$inferSelect): Promise<{
  stage: number;
  canAdvance: boolean;
  requirements: GateRequirement[];
}> {
  const courses = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.projectId, project.id));

  const objectives = await db
    .select()
    .from(objectivesTable)
    .where(eq(objectivesTable.projectId, project.id));

  const unflaggedObjectives = objectives.filter((o) => !o.isFlagged);

  const blockedQA = await db
    .select()
    .from(qaChecksTable)
    .where(eq(qaChecksTable.projectId, project.id));

  const hasBlockingFail = blockedQA.some((q) => q.gateBlock && q.status === "fail");

  const requirementSets: Record<number, GateRequirement[]> = {
    0: [
      {
        label: "At least one course defined",
        met: courses.length > 0,
        blocking: true,
        detail: courses.length > 0 ? null : "Add a course in the Intake tab",
      },
      {
        label: "Course learning objectives entered",
        met: unflaggedObjectives.length > 0,
        blocking: true,
        detail: unflaggedObjectives.length > 0 ? null : "Add at least one objective",
      },
    ],
    1: [
      {
        label: "Learning objectives defined",
        met: unflaggedObjectives.length > 0,
        blocking: true,
        detail: unflaggedObjectives.length > 0 ? null : "Define objectives in the Design workspace",
      },
    ],
    2: [
      {
        label: "No blocking QA failures",
        met: !hasBlockingFail,
        blocking: true,
        detail: hasBlockingFail ? "Resolve blocking QA findings before handoff" : null,
      },
    ],
    3: [
      {
        label: "Evidence Ledger complete",
        met: true,
        blocking: false,
        detail: null,
      },
    ],
  };

  const requirements = requirementSets[project.stage] ?? [];
  const canAdvance = project.stage < 3 && requirements.every((r) => !r.blocking || r.met);

  return { stage: project.stage, canAdvance, requirements };
}

router.get("/projects", async (req, res): Promise<void> => {
  const actor = req.actor!;
  let projects = actor.isGlobal
    ? await db.select().from(projectsTable).orderBy(desc(projectsTable.updatedAt))
    : (
        await db
          .select({ p: projectsTable })
          .from(projectsTable)
          .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
          .where(eq(clientsTable.organizationId, actor.organizationId!))
          .orderBy(desc(projectsTable.updatedAt))
      ).map((r) => r.p);

  // Builders only see projects within their active allocations.
  if (actor.role === "builder") {
    const bs = await loadBuilderScope(actor.userId);
    projects = projects.filter((p) => bs.accessibleProjects.has(p.id));
  }

  const clients = await db.select().from(clientsTable).where(clientOrgFilter(actor));
  const clientMap = new Map(clients.map((c) => [c.id, c.name]));

  const result = projects.map((p) => ({
    ...p,
    clientName: clientMap.get(p.clientId) ?? null,
  }));

  res.json(result);
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Creating a project sits above any allocation; builders cannot.
  if (denyBuilderWrite(res, req.actor!)) return;

  // The referenced client must live in the actor's organization.
  if (denyCrossOrg(res, req.actor!, await getClientOrgId(parsed.data.clientId), "Client not found")) {
    return;
  }

  // Course type / code / revamp notes are read directly from the body (the
  // generated CreateProjectBody zod strips unknown keys, so they don't appear in
  // parsed.data). courseType is constrained to a known set here.
  const body = req.body as Record<string, unknown>;
  const courseType = body.courseType === "revamp" ? "revamp" : "new_build";
  const courseCode =
    typeof body.courseCode === "string" && body.courseCode.trim() ? body.courseCode.trim() : null;
  const revampNotes =
    courseType === "revamp" && typeof body.revampNotes === "string" && body.revampNotes.trim()
      ? body.revampNotes.trim()
      : null;

  const [project] = await db
    .insert(projectsTable)
    .values({
      clientId: parsed.data.clientId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      tier: parsed.data.tier ?? null,
      modality: parsed.data.modality ?? null,
      lms: parsed.data.lms ?? null,
      courseType,
      courseCode,
      revampNotes,
      targetDeliveryDate: parsed.data.targetDeliveryDate
        ? parsed.data.targetDeliveryDate.toISOString().slice(0, 10)
        : null,
      stage: 0,
      status: "active",
    })
    .returning();

  await db.insert(auditEventsTable).values({
    projectId: project.id,
    action: "created",
    entityType: "project",
    entityTitle: project.title,
    projectTitle: project.title,
    actorUserId: req.actor!.userId,
  });

  const result = await projectWithClient(project);
  res.status(201).json(result);
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (await denyNoScope(res, req.actor!, await resolveProjectScope(params.data.id), "read", "Project not found"))
    return;

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const result = await projectWithClient(project);
  res.json(result);
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const projectScope = await resolveProjectScope(params.data.id);
  if (await denyNoScope(res, req.actor!, projectScope, "write", "Project not found")) return;

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.tier !== undefined) updates.tier = parsed.data.tier;
  if (parsed.data.modality !== undefined) updates.modality = parsed.data.modality;
  if (parsed.data.lms !== undefined) updates.lms = parsed.data.lms;
  if (parsed.data.designMethod !== undefined) updates.designMethod = parsed.data.designMethod;
  if (parsed.data.targetDeliveryDate !== undefined)
    updates.targetDeliveryDate = parsed.data.targetDeliveryDate
      ? parsed.data.targetDeliveryDate.toISOString().slice(0, 10)
      : null;
  // Course type / code / revamp notes are read straight from the body (not in
  // the generated UpdateProjectBody zod). Only applied when explicitly present.
  const ub = req.body as Record<string, unknown>;
  if (ub.courseType !== undefined) updates.courseType = ub.courseType === "revamp" ? "revamp" : "new_build";
  if (ub.courseCode !== undefined)
    updates.courseCode =
      typeof ub.courseCode === "string" && ub.courseCode.trim() ? ub.courseCode.trim() : null;
  if (ub.revampNotes !== undefined)
    updates.revampNotes =
      typeof ub.revampNotes === "string" && ub.revampNotes.trim() ? ub.revampNotes.trim() : null;

  const applyUpdate = (exec: Executor) =>
    exec.update(projectsTable).set(updates).where(eq(projectsTable.id, params.data.id)).returning();

  // Meter on (re)activation. Activating a non-active project flips its courses
  // to count against the org's active-course quota (countActiveCourses only
  // counts courses on active projects), so a tenant could otherwise pile courses
  // onto an inactive project and switch it to "active" to bypass the limit. The
  // quota check and the update run inside ONE org-advisory-locked transaction
  // (activateProjectWithLimit) so concurrent activations cannot both pass; the
  // 402 is returned before the update commits. Globals bypass metering.
  let project: typeof projectsTable.$inferSelect | undefined;
  if (parsed.data.status === "active" && projectScope) {
    const activation = await activateProjectWithLimit(
      projectScope.orgId,
      params.data.id,
      req.actor!.isGlobal,
      applyUpdate,
    );
    if (activation.status === "limit_exceeded") {
      res.status(402).json({
        error: "upgrade_required",
        message: `Your plan allows ${activation.limit} active ${activation.limit === 1 ? "course" : "courses"}. Archive courses or contact us to activate this project.`,
        tier: activation.tier,
        limit: activation.limit,
        current: activation.current,
      });
      return;
    }
    project = activation.value[0];
  } else {
    [project] = await applyUpdate(db);
  }

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const result = await projectWithClient(project);
  res.json(result);
});

router.post("/projects/:id/advance-stage", async (req, res): Promise<void> => {
  const params = AdvanceProjectStageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AdvanceProjectStageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (await denyNoScope(res, req.actor!, await resolveProjectScope(params.data.id), "write", "Project not found"))
    return;

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  if (project.stage >= 3) {
    res.status(400).json({ error: "Project is already at final stage" });
    return;
  }

  const gate = await computeGateStatus(project);
  if (!gate.canAdvance) {
    const unmet = gate.requirements.filter((r) => r.blocking && !r.met).map((r) => r.label);
    res.status(409).json({
      error: "Gate requirements not met",
      requirements: gate.requirements,
      unmet,
    });
    return;
  }

  const newStage = project.stage + 1;

  const [updated] = await db
    .update(projectsTable)
    .set({ stage: newStage })
    .where(eq(projectsTable.id, params.data.id))
    .returning();

  await db.insert(auditEventsTable).values({
    projectId: project.id,
    action: `advanced to stage ${newStage}: ${STAGE_LABELS[newStage]}`,
    entityType: "project",
    entityTitle: project.title,
    projectTitle: project.title,
    actorUserId: req.actor!.userId,
  });

  await db.insert(auditEventsTable).values({
    projectId: project.id,
    action: parsed.data.notes,
    entityType: "stage_note",
    entityTitle: STAGE_LABELS[newStage] ?? "Stage",
    projectTitle: project.title,
    actorUserId: req.actor!.userId,
  });

  const result = await projectWithClient(updated);
  res.json(result);
});

router.get("/projects/:id/gate-status", async (req, res): Promise<void> => {
  const params = GetProjectGateStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (await denyNoScope(res, req.actor!, await resolveProjectScope(params.data.id), "read", "Project not found"))
    return;

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const gate = await computeGateStatus(project);
  res.json(gate);
});

export default router;
