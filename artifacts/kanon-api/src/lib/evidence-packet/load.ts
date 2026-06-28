import { desc, eq, inArray } from "drizzle-orm";
import {
  db,
  projectsTable,
  clientsTable,
  organizationsTable,
  coursesTable,
  objectivesTable,
  assessmentsTable,
  crosswalkLinksTable,
  standardsFrameworksTable,
  standardCompetenciesTable,
  qaReportsTable,
} from "@workspace/kanon-db";
import {
  assembleEvidencePacket,
  CCNE_FRAMEWORK,
  type EvidencePacket,
  type EvidencePacketInput,
  type PacketAssessmentInput,
  type PacketCompetencyInput,
  type PacketCrosswalkLinkInput,
  type PacketFrameworkInput,
  type PacketQaInput,
} from "@workspace/kanon-evidence-packet";

/** Parse a JSON array of objective ids stored as text into integers, defensively. */
function parseObjectiveIds(raw: string): number[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => Number(v)).filter((n) => Number.isInteger(n));
    }
  } catch {
    /* fall through to empty */
  }
  return [];
}

/**
 * Load a fully populated EvidencePacket for a project, then run the pure
 * assembler. The CALLER must already have authorized access to the project
 * (org scope + builder allocation via the tenancy helpers); this function does
 * NO authorization. It reads the project's curriculum, the CCNE catalog, the
 * latest QA report, and branding from the DATA-OWNING organization
 * (clients.organization_id, never the request Host).
 *
 * Returns null only when the project does not exist.
 */
export async function loadEvidencePacket(projectId: number): Promise<EvidencePacket | null> {
  const [project] = await db
    .select({
      id: projectsTable.id,
      title: projectsTable.title,
      status: projectsTable.status,
      stage: projectsTable.stage,
      designMethod: projectsTable.designMethod,
      description: projectsTable.description,
      targetDeliveryDate: projectsTable.targetDeliveryDate,
      clientId: projectsTable.clientId,
    })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) return null;

  const [client] = await db
    .select({
      id: clientsTable.id,
      name: clientsTable.name,
      institution: clientsTable.institution,
      organizationId: clientsTable.organizationId,
    })
    .from(clientsTable)
    .where(eq(clientsTable.id, project.clientId));

  const [org] = client
    ? await db
        .select({
          name: organizationsTable.name,
          tagline: organizationsTable.tagline,
          accentColor: organizationsTable.accentColor,
          logoUrl: organizationsTable.logoUrl,
        })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, client.organizationId))
    : [];

  const courses = await db
    .select({
      id: coursesTable.id,
      title: coursesTable.title,
      creditHours: coursesTable.creditHours,
      modality: coursesTable.modality,
      accreditors: coursesTable.accreditors,
    })
    .from(coursesTable)
    .where(eq(coursesTable.projectId, projectId))
    .orderBy(coursesTable.id);
  const courseIds = courses.map((c) => c.id);

  const objectives = await db
    .select({
      id: objectivesTable.id,
      text: objectivesTable.text,
      cognitiveLevel: objectivesTable.cognitiveLevel,
      measurabilityStatus: objectivesTable.measurabilityStatus,
    })
    .from(objectivesTable)
    .where(eq(objectivesTable.projectId, projectId))
    .orderBy(objectivesTable.id);

  const assessmentRows = courseIds.length
    ? await db
        .select({
          id: assessmentsTable.id,
          courseId: assessmentsTable.courseId,
          title: assessmentsTable.title,
          assessmentType: assessmentsTable.assessmentType,
          alignedObjectiveIds: assessmentsTable.alignedObjectiveIds,
        })
        .from(assessmentsTable)
        .where(inArray(assessmentsTable.courseId, courseIds))
        .orderBy(assessmentsTable.id)
    : [];
  const assessments: PacketAssessmentInput[] = assessmentRows.map((a) => ({
    id: a.id,
    courseId: a.courseId,
    title: a.title,
    assessmentType: a.assessmentType,
    alignedObjectiveIds: parseObjectiveIds(a.alignedObjectiveIds),
  }));

  // The CCNE catalog (seeded global reference data). If several frameworks share
  // the CCNE acronym (e.g. test fixtures), prefer the richest one (most
  // competencies); competency order follows insertion id, i.e. the dataset's
  // domain 1..10 sequence.
  const frameworks = await db
    .select({
      id: standardsFrameworksTable.id,
      name: standardsFrameworksTable.name,
      acronym: standardsFrameworksTable.acronym,
    })
    .from(standardsFrameworksTable)
    .where(eq(standardsFrameworksTable.acronym, CCNE_FRAMEWORK.acronym))
    .orderBy(standardsFrameworksTable.id);

  let framework: PacketFrameworkInput = { name: CCNE_FRAMEWORK.name, acronym: CCNE_FRAMEWORK.acronym };
  let competencies: PacketCompetencyInput[] = [];
  if (frameworks.length > 0) {
    const ids = frameworks.map((f) => f.id);
    const comps = await db
      .select({
        id: standardCompetenciesTable.id,
        frameworkId: standardCompetenciesTable.frameworkId,
        code: standardCompetenciesTable.code,
        description: standardCompetenciesTable.description,
        domain: standardCompetenciesTable.domain,
      })
      .from(standardCompetenciesTable)
      .where(inArray(standardCompetenciesTable.frameworkId, ids))
      .orderBy(standardCompetenciesTable.id);

    const byFramework = new Map<number, typeof comps>();
    for (const c of comps) {
      const arr = byFramework.get(c.frameworkId) ?? [];
      arr.push(c);
      byFramework.set(c.frameworkId, arr);
    }

    let chosen: (typeof frameworks)[number] | undefined;
    let chosenCount = -1;
    for (const f of frameworks) {
      const n = byFramework.get(f.id)?.length ?? 0;
      if (n > chosenCount) {
        chosen = f;
        chosenCount = n;
      }
    }
    if (chosen) {
      framework = { name: chosen.name, acronym: chosen.acronym };
      competencies = (byFramework.get(chosen.id) ?? []).map((c) => ({
        id: c.id,
        code: c.code,
        description: c.description,
        domain: c.domain,
      }));
    }
  }

  const crosswalkRows = await db
    .select({
      competencyId: crosswalkLinksTable.competencyId,
      objectiveId: crosswalkLinksTable.objectiveId,
      assessmentId: crosswalkLinksTable.assessmentId,
      notes: crosswalkLinksTable.notes,
    })
    .from(crosswalkLinksTable)
    .where(eq(crosswalkLinksTable.projectId, projectId));
  const crosswalkLinks: PacketCrosswalkLinkInput[] = crosswalkRows.map((l) => ({
    competencyId: l.competencyId,
    objectiveId: l.objectiveId,
    assessmentId: l.assessmentId,
    notes: l.notes,
  }));

  const [qaRow] = await db
    .select({
      report: qaReportsTable.report,
      score: qaReportsTable.score,
      status: qaReportsTable.status,
      gateBlock: qaReportsTable.gateBlock,
      runAt: qaReportsTable.runAt,
    })
    .from(qaReportsTable)
    .where(eq(qaReportsTable.projectId, projectId))
    .orderBy(desc(qaReportsTable.runAt))
    .limit(1);

  const qa: PacketQaInput | null = qaRow
    ? {
        report: qaRow.report,
        score: qaRow.score,
        status: qaRow.status,
        gateBlock: qaRow.gateBlock,
        runAt: qaRow.runAt instanceof Date ? qaRow.runAt.toISOString() : String(qaRow.runAt),
      }
    : null;

  const input: EvidencePacketInput = {
    project: {
      id: project.id,
      title: project.title,
      status: project.status,
      stage: project.stage,
      designMethod: project.designMethod,
      description: project.description,
      targetDeliveryDate: project.targetDeliveryDate,
    },
    client: {
      id: client?.id ?? 0,
      name: client?.name ?? "Client",
      institution: client?.institution ?? null,
    },
    courses: courses.map((c) => ({
      id: c.id,
      title: c.title,
      creditHours: c.creditHours,
      modality: c.modality,
      accreditors: c.accreditors,
    })),
    objectives: objectives.map((o) => ({
      id: o.id,
      text: o.text,
      cognitiveLevel: o.cognitiveLevel,
      measurabilityStatus: o.measurabilityStatus,
    })),
    assessments,
    framework,
    competencies,
    crosswalkLinks,
    qa,
    branding: {
      organizationName: org?.name ?? "Synops Advisory Group",
      tagline: org?.tagline ?? null,
      accentColor: org?.accentColor ?? null,
      logoUrl: org?.logoUrl ?? null,
    },
    generatedAt: new Date().toISOString(),
  };

  return assembleEvidencePacket(input);
}
