import { Router } from "express";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  qaChecksTable,
  qaReportsTable,
  objectivesTable,
  assessmentsTable,
  coursesTable,
  crosswalkLinksTable,
  standardCompetenciesTable,
  standardsFrameworksTable,
  auditEventsTable,
  projectsTable,
} from "@workspace/kanon-db";
import {
  evaluateCurriculum,
  type CurriculumEvaluationInput,
  type EvaluationObjective,
  type EvaluationAssessment,
} from "@workspace/kanon-curriculum-engine";
import {
  ListQAChecksParams,
  CreateQACheckParams,
  CreateQACheckBody,
  UpdateQACheckParams,
  UpdateQACheckBody,
  EvaluateProjectQAParams,
  GetLatestQAReportParams,
} from "@workspace/kanon-api-zod";
import { denyNoScope, resolveProjectScope, resolveQaCheckScope } from "../lib/tenancy";

const router = Router();

router.get("/projects/:projectId/qa", async (req, res): Promise<void> => {
  const params = ListQAChecksParams.safeParse(req.params);
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

  const checks = await db
    .select()
    .from(qaChecksTable)
    .where(eq(qaChecksTable.projectId, params.data.projectId))
    .orderBy(qaChecksTable.createdAt);

  res.json(checks);
});

router.post("/projects/:projectId/qa", async (req, res): Promise<void> => {
  const params = CreateQACheckParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateQACheckBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

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

  const [check] = await db
    .insert(qaChecksTable)
    .values({
      projectId: params.data.projectId,
      checkType: parsed.data.checkType,
      status: parsed.data.status,
      findings: parsed.data.findings ?? null,
      gateBlock: parsed.data.gateBlock ?? false,
      passedCount: parsed.data.passedCount ?? null,
      failedCount: parsed.data.failedCount ?? null,
      remediationNotes: null,
    })
    .returning();

  res.status(201).json(check);
});

router.patch("/qa-checks/:id", async (req, res): Promise<void> => {
  const params = UpdateQACheckParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateQACheckBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (await denyNoScope(res, req.actor!, await resolveQaCheckScope(params.data.id), "write", "QA check not found")) {
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.findings !== undefined) updates.findings = parsed.data.findings;
  if (parsed.data.remediationNotes !== undefined) updates.remediationNotes = parsed.data.remediationNotes;
  if (parsed.data.gateBlock !== undefined) updates.gateBlock = parsed.data.gateBlock;
  if (parsed.data.passedCount !== undefined) updates.passedCount = parsed.data.passedCount;
  if (parsed.data.failedCount !== undefined) updates.failedCount = parsed.data.failedCount;

  const [check] = await db
    .update(qaChecksTable)
    .set(updates)
    .where(eq(qaChecksTable.id, params.data.id))
    .returning();

  if (!check) {
    res.status(404).json({ error: "QA check not found" });
    return;
  }

  res.json(check);
});

// ── Curriculum engine evaluation (scored, persisted QA report) ──────────────
const FALLBACK_TITLE = "Untitled project";

/** Parse a JSON array of objective ids stored as text, defensively, into strings. */
function parseObjectiveIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v));
  } catch {
    /* fall through to empty */
  }
  return [];
}

/**
 * Adapt a project's stored curriculum into the engine's input shape:
 * project-level objectives; assessments across ALL of the project's courses
 * (aligned to objectives via the JSON `alignedObjectiveIds`); and each
 * objective's standard alignment derived from crosswalk_links rows that name the
 * objective. Ids are stringified so engine matching is storage-agnostic.
 */
async function buildEvaluationInput(projectId: number): Promise<CurriculumEvaluationInput> {
  const [project] = await db
    .select({ title: projectsTable.title })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));

  const objectiveRows = await db
    .select({ id: objectivesTable.id, text: objectivesTable.text })
    .from(objectivesTable)
    .where(eq(objectivesTable.projectId, projectId));

  const courseRows = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.projectId, projectId));
  const courseIds = courseRows.map((c) => c.id);

  const assessmentRows = courseIds.length
    ? await db
        .select({
          id: assessmentsTable.id,
          title: assessmentsTable.title,
          alignedObjectiveIds: assessmentsTable.alignedObjectiveIds,
          assessmentType: assessmentsTable.assessmentType,
        })
        .from(assessmentsTable)
        .where(inArray(assessmentsTable.courseId, courseIds))
    : [];

  // Standard alignment per objective: a crosswalk link that names the objective
  // means it is mapped to a framework competency. The first link supplies a
  // human-readable label used only in finding messages.
  const linkRows = await db
    .select({
      objectiveId: crosswalkLinksTable.objectiveId,
      competencyId: crosswalkLinksTable.competencyId,
      code: standardCompetenciesTable.code,
      acronym: standardsFrameworksTable.acronym,
      frameworkName: standardsFrameworksTable.name,
    })
    .from(crosswalkLinksTable)
    .innerJoin(
      standardCompetenciesTable,
      eq(crosswalkLinksTable.competencyId, standardCompetenciesTable.id),
    )
    .innerJoin(
      standardsFrameworksTable,
      eq(standardCompetenciesTable.frameworkId, standardsFrameworksTable.id),
    )
    .where(
      and(eq(crosswalkLinksTable.projectId, projectId), isNotNull(crosswalkLinksTable.objectiveId)),
    );

  const alignmentByObjective = new Map<number, { ids: string[]; label?: string }>();
  for (const link of linkRows) {
    if (link.objectiveId == null) continue;
    const entry = alignmentByObjective.get(link.objectiveId) ?? { ids: [] };
    entry.ids.push(String(link.competencyId));
    if (!entry.label) {
      const prefix = link.acronym ?? link.frameworkName;
      entry.label = prefix ? `${prefix} ${link.code}` : link.code;
    }
    alignmentByObjective.set(link.objectiveId, entry);
  }

  const objectives: EvaluationObjective[] = objectiveRows.map((o) => {
    const alignment = alignmentByObjective.get(o.id);
    return {
      id: String(o.id),
      text: o.text,
      standardAlignmentIds: alignment?.ids ?? [],
      standardAlignmentLabel: alignment?.label,
    };
  });

  const assessments: EvaluationAssessment[] = assessmentRows.map((a) => ({
    id: String(a.id),
    title: a.title,
    objectiveIds: parseObjectiveIds(a.alignedObjectiveIds),
    type: a.assessmentType ?? null,
  }));

  return {
    title: project?.title ?? FALLBACK_TITLE,
    gradeBand: null,
    termWeeks: null,
    objectives,
    assessments,
  };
}

router.post("/projects/:id/qa/evaluate", async (req, res): Promise<void> => {
  const params = EvaluateProjectQAParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const projectId = params.data.id;

  if (
    await denyNoScope(res, req.actor!, await resolveProjectScope(projectId), "write", "Project not found")
  ) {
    return;
  }

  const input = await buildEvaluationInput(projectId);
  const report = evaluateCurriculum(input);

  const status = report.counts.fail > 0 ? "fail" : report.counts.warn > 0 ? "warn" : "pass";
  const gateBlock = report.counts.fail > 0;
  // Attribute the run to the REAL operator (the impersonator when impersonating).
  const runByUserId = req.actor!.impersonatorUserId ?? req.actor!.userId;

  const record = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(qaReportsTable)
      .values({ projectId, report, score: report.score, status, gateBlock, runByUserId })
      .returning();

    // Backfill engine-derived Bloom level + measurability onto each objective.
    for (const a of report.objectiveAnalyses) {
      const objectiveId = Number(a.objectiveId);
      if (!Number.isInteger(objectiveId)) continue;
      await tx
        .update(objectivesTable)
        .set({ cognitiveLevel: a.detection.bloomLevel, measurabilityStatus: a.measurability })
        .where(and(eq(objectivesTable.id, objectiveId), eq(objectivesTable.projectId, projectId)));
    }

    await tx.insert(auditEventsTable).values({
      projectId,
      action: `ran QA evaluation (score ${report.score}, ${status})`,
      entityType: "qa_report",
      entityTitle: input.title,
      projectTitle: input.title,
      actorUserId: req.actor!.userId,
      impersonatorUserId: req.actor!.impersonatorUserId,
    });

    return inserted;
  });

  res.status(201).json(record);
});

router.get("/projects/:id/qa/report", async (req, res): Promise<void> => {
  const params = GetLatestQAReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (
    await denyNoScope(res, req.actor!, await resolveProjectScope(params.data.id), "read", "Project not found")
  ) {
    return;
  }

  const [record] = await db
    .select()
    .from(qaReportsTable)
    .where(eq(qaReportsTable.projectId, params.data.id))
    .orderBy(desc(qaReportsTable.runAt))
    .limit(1);

  res.json(record ?? null);
});

export default router;
