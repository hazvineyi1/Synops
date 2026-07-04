// Bridges real Compass project data into the shared curriculum QA engine.
//
// Loads a project's course, objectives, assessments, and standards crosswalk,
// maps them onto the engine's generic input shape (numeric ids stringified at
// the boundary; an objective is "mapped to a standard" when it has a crosswalk
// link to a competency), and runs the same deterministic engine that powers the
// public demo. Pure read + compute; persistence is the caller's job.

import { eq } from "drizzle-orm";
import {
  db,
  projectsTable,
  coursesTable,
  objectivesTable,
  assessmentsTable,
  crosswalkLinksTable,
  standardCompetenciesTable,
  standardsFrameworksTable,
} from "@workspace/compass-db";
import {
  evaluateCourse,
  type EngineCourse,
  type QaReport,
} from "@workspace/compass-curriculum-engine";

/** Parse an assessment's aligned-objective-ids JSON column into numbers. */
function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((n): n is number => typeof n === "number")
      : [];
  } catch {
    return [];
  }
}

export interface ObjectiveLevelChange {
  objectiveId: number;
  level: string | null;
}

export interface ProjectEvaluation {
  course: EngineCourse;
  report: QaReport;
  /**
   * Objectives whose engine-detected Bloom level differs from what is stored,
   * so the caller can persist only the rows that actually changed.
   */
  levelChanges: ObjectiveLevelChange[];
}

/** Load a project's curriculum and score it with the shared engine. */
export async function evaluateProject(projectId: number): Promise<ProjectEvaluation> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  const [course] = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.projectId, projectId))
    .orderBy(coursesTable.id)
    .limit(1);
  const objectives = await db
    .select()
    .from(objectivesTable)
    .where(eq(objectivesTable.projectId, projectId))
    .orderBy(objectivesTable.id);
  const assessments = course
    ? await db
        .select()
        .from(assessmentsTable)
        .where(eq(assessmentsTable.courseId, course.id))
        .orderBy(assessmentsTable.id)
    : [];
  const crosswalk = await db
    .select()
    .from(crosswalkLinksTable)
    .where(eq(crosswalkLinksTable.projectId, projectId));
  const competencies = await db.select().from(standardCompetenciesTable);
  const frameworks = await db.select().from(standardsFrameworksTable);

  const competencyMap = new Map(competencies.map((c) => [c.id, c]));
  const frameworkMap = new Map(frameworks.map((f) => [f.id, f]));

  // Map each objective to the first standard competency it is crosswalked to.
  const objStandard = new Map<number, { id: number; label: string }>();
  for (const link of crosswalk) {
    if (link.objectiveId == null || link.competencyId == null) continue;
    if (objStandard.has(link.objectiveId)) continue;
    const comp = competencyMap.get(link.competencyId);
    if (!comp) continue;
    const fw = frameworkMap.get(comp.frameworkId);
    const label = `${fw?.acronym ?? fw?.name ?? "Standard"} ${comp.code}`.trim();
    objStandard.set(link.objectiveId, { id: link.competencyId, label });
  }

  const engineCourse: EngineCourse = {
    title: course?.title || project?.title || "",
    termWeeks: course?.termWeeks ?? null,
    objectives: objectives.map((o) => {
      const std = objStandard.get(o.id);
      return {
        id: String(o.id),
        text: o.text,
        standardId: std ? String(std.id) : null,
        standardLabel: std?.label ?? null,
      };
    }),
    assessments: assessments.map((a) => ({
      id: String(a.id),
      title: a.title,
      type: a.assessmentType,
      objectiveIds: parseIds(a.alignedObjectiveIds).map(String),
    })),
  };

  const report = evaluateCourse(engineCourse);

  const detectedByObjective = new Map(
    report.objectiveAnalyses.map((a) => [
      Number(a.objectiveId),
      a.detection.bloomLevel,
    ]),
  );
  const levelChanges: ObjectiveLevelChange[] = objectives
    .map((o) => ({
      objectiveId: o.id,
      level: detectedByObjective.get(o.id) ?? null,
    }))
    .filter((d, i) => d.level !== (objectives[i].cognitiveLevel ?? null));

  return { course: engineCourse, report, levelChanges };
}
