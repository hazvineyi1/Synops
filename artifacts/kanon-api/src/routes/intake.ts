import { Router } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  intakeProgressTable,
  projectsTable,
  coursesTable,
  objectivesTable,
} from "@workspace/kanon-db";
import {
  GetIntakeProgressParams,
  UpdateIntakeProgressParams,
  UpdateIntakeProgressBody,
  GenerateIntakeAgendaParams,
} from "@workspace/kanon-api-zod";
import { denyNoScope, resolveProjectScope } from "../lib/tenancy";
import { recordActorAudit } from "../lib/audit";

const router = Router();

const EMPTY = {
  agendaChecks: [] as boolean[][],
  segStatuses: [] as string[],
  confirmedPre: [] as number[],
  notes: {} as Record<string, string>,
  inventorySelections: {} as Record<string, string>,
  autoRules: {} as Record<string, boolean>,
  kickoffAnswers: {} as Record<string, unknown>,
};

interface AgendaItem {
  title: string;
  minutes: number;
  prompts: string[];
}

interface GeneratedAgenda {
  generatedAt: string;
  projectTitle: string;
  courseTitle: string | null;
  objectiveCount: number;
  totalMinutes: number;
  items: AgendaItem[];
}

function parse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// The generated agenda is stored as a JSON blob; an empty "{}" (the column
// default) means "not generated yet" and serializes to null.
function parseAgenda(raw: string): GeneratedAgenda | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (value && typeof value === "object" && Array.isArray((value as GeneratedAgenda).items)) {
      return value as GeneratedAgenda;
    }
    return null;
  } catch {
    return null;
  }
}

// Rules-based kickoff agenda derived from the project, its first course, and its
// objectives. No external service is used; the output is deterministic.
function buildAgenda(
  project: typeof projectsTable.$inferSelect,
  course: typeof coursesTable.$inferSelect | undefined,
  objectives: (typeof objectivesTable.$inferSelect)[],
): GeneratedAgenda {
  const items: AgendaItem[] = [];

  items.push({
    title: "Welcome and engagement goals",
    minutes: 10,
    prompts: [
      `Confirm the goal and scope for ${project.title}.`,
      "Agree on how a successful outcome will be measured.",
      project.targetDeliveryDate
        ? `Confirm the target delivery date of ${project.targetDeliveryDate}.`
        : "Confirm the target delivery timeline.",
    ],
  });

  const objectivePrompts: string[] = [];
  if (objectives.length === 0) {
    objectivePrompts.push("No objectives are recorded yet; draft the first learning objectives together.");
  } else {
    objectivePrompts.push(
      `Review the ${objectives.length} recorded objective${objectives.length === 1 ? "" : "s"} for fit and priority.`,
    );
    for (const objective of objectives.slice(0, 4)) {
      objectivePrompts.push(`Confirm: ${objective.text}`);
    }
    if (objectives.length > 4) {
      objectivePrompts.push(`Plus ${objectives.length - 4} more to review after the meeting.`);
    }
  }
  items.push({ title: "Review learning objectives", minutes: 15, prompts: objectivePrompts });

  if (course) {
    const coursePrompts: string[] = [`Walk the structure of ${course.title}.`];
    if (course.moduleCount) coursePrompts.push(`Confirm the ${course.moduleCount} module outline.`);
    if (course.modality) coursePrompts.push(`Confirm the ${course.modality} modality.`);
    if (course.termWeeks) coursePrompts.push(`Confirm the ${course.termWeeks} week term length.`);
    items.push({ title: "Walk the course outline", minutes: 15, prompts: coursePrompts });
  } else {
    items.push({
      title: "Outline the course",
      minutes: 15,
      prompts: ["No course exists yet; sketch the high level structure and modules."],
    });
  }

  items.push({
    title: "Confirm constraints and timeline",
    minutes: 10,
    prompts: [
      project.modality ? `Confirm the delivery modality: ${project.modality}.` : "Confirm the delivery modality.",
      project.lms ? `Confirm the target LMS: ${project.lms}.` : "Confirm the target LMS or platform.",
      "Identify accessibility requirements (WCAG 2.1 AA) and any other constraints.",
    ],
  });

  items.push({
    title: "Agree next steps and owners",
    minutes: 10,
    prompts: [
      "Assign an owner for each action.",
      "Schedule the next checkpoint.",
      "Confirm how progress will be shared.",
    ],
  });

  const totalMinutes = items.reduce((sum, item) => sum + item.minutes, 0);

  return {
    generatedAt: new Date().toISOString(),
    projectTitle: project.title,
    courseTitle: course?.title ?? null,
    objectiveCount: objectives.length,
    totalMinutes,
    items,
  };
}

function serialize(row: typeof intakeProgressTable.$inferSelect) {
  return {
    projectId: row.projectId,
    agendaChecks: parse<boolean[][]>(row.agendaChecks, EMPTY.agendaChecks),
    segStatuses: parse<string[]>(row.segStatuses, EMPTY.segStatuses),
    confirmedPre: parse<number[]>(row.confirmedPre, EMPTY.confirmedPre),
    notes: parse<Record<string, string>>(row.notes, EMPTY.notes),
    inventorySelections: parse<Record<string, string>>(
      row.inventorySelections,
      EMPTY.inventorySelections,
    ),
    autoRules: parse<Record<string, boolean>>(row.autoRules, EMPTY.autoRules),
    kickoffAnswers: parse<Record<string, unknown>>(row.kickoffAnswers, EMPTY.kickoffAnswers),
    generatedAgenda: parseAgenda(row.generatedAgenda),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/projects/:projectId/intake-progress", async (req, res): Promise<void> => {
  const params = GetIntakeProgressParams.safeParse(req.params);
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

  const [row] = await db
    .select()
    .from(intakeProgressTable)
    .where(eq(intakeProgressTable.projectId, params.data.projectId));

  if (!row) {
    res.json({
      projectId: params.data.projectId,
      ...EMPTY,
      generatedAgenda: null,
      updatedAt: null,
    });
    return;
  }

  res.json(serialize(row));
});

router.put("/projects/:projectId/intake-progress", async (req, res): Promise<void> => {
  const params = UpdateIntakeProgressParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateIntakeProgressBody.safeParse(req.body);
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

  const body = parsed.data;

  // INSERT path (no row yet) must supply defaults for every omitted column.
  const insertValues = {
    projectId: params.data.projectId,
    agendaChecks: JSON.stringify(body.agendaChecks ?? EMPTY.agendaChecks),
    segStatuses: JSON.stringify(body.segStatuses ?? EMPTY.segStatuses),
    confirmedPre: JSON.stringify(body.confirmedPre ?? EMPTY.confirmedPre),
    notes: JSON.stringify(body.notes ?? EMPTY.notes),
    inventorySelections: JSON.stringify(body.inventorySelections ?? EMPTY.inventorySelections),
    autoRules: JSON.stringify(body.autoRules ?? EMPTY.autoRules),
    kickoffAnswers: JSON.stringify(body.kickoffAnswers ?? EMPTY.kickoffAnswers),
  };

  // UPDATE path only touches columns actually present in the request. Because
  // every field in IntakeProgressInput is optional, a partial update (for
  // example a kickoff-only autosave) must NOT reset the SEGMENTS-indexed
  // columns (agendaChecks, segStatuses, notes, ...) and vice versa. updatedAt is
  // always set so the conflict-update set is never empty.
  const set: Partial<typeof intakeProgressTable.$inferInsert> = { updatedAt: new Date() };
  if (body.agendaChecks !== undefined) set.agendaChecks = insertValues.agendaChecks;
  if (body.segStatuses !== undefined) set.segStatuses = insertValues.segStatuses;
  if (body.confirmedPre !== undefined) set.confirmedPre = insertValues.confirmedPre;
  if (body.notes !== undefined) set.notes = insertValues.notes;
  if (body.inventorySelections !== undefined)
    set.inventorySelections = insertValues.inventorySelections;
  if (body.autoRules !== undefined) set.autoRules = insertValues.autoRules;
  if (body.kickoffAnswers !== undefined) set.kickoffAnswers = insertValues.kickoffAnswers;

  const [row] = await db
    .insert(intakeProgressTable)
    .values(insertValues)
    .onConflictDoUpdate({
      target: intakeProgressTable.projectId,
      set,
    })
    .returning();

  res.json(serialize(row));
});

// Rules-based agenda generation. Builds a deterministic kickoff agenda from the
// project, its first course, and its objectives, then persists it WITHOUT
// touching any of the SEGMENTS-indexed autosave columns.
router.post("/projects/:projectId/intake-generated-agenda", async (req, res): Promise<void> => {
  const params = GenerateIntakeAgendaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const [course] = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.projectId, params.data.projectId))
    .orderBy(coursesTable.createdAt)
    .limit(1);

  const objectives = await db
    .select()
    .from(objectivesTable)
    .where(eq(objectivesTable.projectId, params.data.projectId))
    .orderBy(objectivesTable.createdAt);

  const agenda = buildAgenda(project, course, objectives);
  const serialized = JSON.stringify(agenda);

  await db
    .insert(intakeProgressTable)
    .values({ projectId: params.data.projectId, generatedAgenda: serialized })
    .onConflictDoUpdate({
      target: intakeProgressTable.projectId,
      set: { generatedAgenda: serialized },
    });

  await recordActorAudit(req.actor!, {
    action: "generate",
    entityType: "intake_agenda",
    entityTitle: project.title,
    projectId: project.id,
  });

  res.json(agenda);
});

export default router;
