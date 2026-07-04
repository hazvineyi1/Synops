import { Router } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  db,
  projectMeetingsTable,
  meetingActionItemsTable,
  meetingDecisionsTable,
  meetingOpenQuestionsTable,
  projectsTable,
  coursesTable,
  type ProjectMeetingRow,
  type MeetingActionItemRow,
  type MeetingDecisionRow,
  type MeetingOpenQuestionRow,
} from "@workspace/compass-db";
import {
  ListProjectMeetingsParams,
  CreateProjectMeetingParams,
  CreateProjectMeetingBody,
  GetMeetingParams,
  UpdateMeetingParams,
  UpdateMeetingBody,
  DeleteMeetingParams,
  ProcessMeetingNotesParams,
  ProcessMeetingNotesBody,
  SetAgendaChecklistParams,
  SetAgendaChecklistBody,
  SetMeetingChecklistParams,
  SetMeetingChecklistBody,
  ListProjectActionItemsParams,
  CreateProjectActionItemParams,
  CreateProjectActionItemBody,
  UpdateActionItemParams,
  UpdateActionItemBody,
  DeleteActionItemParams,
  ListProjectDecisionsParams,
  CreateProjectDecisionParams,
  CreateProjectDecisionBody,
  UpdateDecisionParams,
  UpdateDecisionBody,
  DeleteDecisionParams,
  ListProjectOpenQuestionsParams,
  CreateProjectOpenQuestionParams,
  CreateProjectOpenQuestionBody,
  UpdateOpenQuestionParams,
  UpdateOpenQuestionBody,
  DeleteOpenQuestionParams,
  GetAgendaSummaryParams,
} from "@workspace/compass-api-zod";
import {
  denyNoScope,
  resolveProjectScope,
  resolveMeetingScope,
  resolveActionItemScope,
  resolveCorrespondenceScope,
  resolveDecisionScope,
  resolveOpenQuestionScope,
} from "../lib/tenancy";
import { recordActorAudit } from "../lib/audit";
import {
  extractStreamsFromNotes,
  buildNextAgenda,
  type CarryForward,
} from "../lib/agendaAi";
import {
  seedMeetingPlan,
  suggestNextType,
  isMeetingType,
  type MeetingType,
  type MeetingPlan,
} from "../lib/meetingTemplates";

const router = Router();

// ── Persisted agenda shape ─────────────────────────────────────
// The meeting's `generatedAgenda` column stores the proposed agenda for the NEXT
// meeting as a JSON blob. The column default "{}" means "not processed yet" and
// serializes to null. A valid plan always carries `summary` and `items` arrays;
// the carry-forward counts and `nextMeetingType` are optional so agendas stored
// before they existed still parse.
interface StoredAgendaItem {
  title: string;
  minutes: number;
  prompts: string[];
  // Interactive checklist state. `done` checks off the whole item (used for items
  // with no prompts); `promptsDone` is aligned by index with `prompts`. Both are
  // optional so agendas stored before checklists existed read back as "unchecked",
  // and regenerating an agenda omits them, resetting the checklist.
  done?: boolean;
  promptsDone?: boolean[];
}

interface StoredAgenda {
  generatedAt: string;
  proposedDate: string | null;
  proposedTime: string | null;
  summary: string[];
  items: StoredAgendaItem[];
  openActionCount: number;
  nextMeetingType?: MeetingType;
  openQuestionCount?: number;
  unmetExitCriteriaCount?: number;
}

function parseAgenda(raw: string): StoredAgenda | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (
      value &&
      typeof value === "object" &&
      Array.isArray((value as StoredAgenda).items) &&
      Array.isArray((value as StoredAgenda).summary)
    ) {
      return value as StoredAgenda;
    }
    return null;
  } catch {
    return null;
  }
}

// The meeting's OWN structured workspace (pre-work, standing agenda, exit
// criteria), seeded at creation from the type template. The column default "{}"
// (and any malformed value) normalizes to an empty plan so older rows still read
// back as a valid MeetingPlan.
function parseMeetingPlan(raw: string): MeetingPlan {
  try {
    const value = JSON.parse(raw) as Partial<MeetingPlan> | null;
    if (value && typeof value === "object") {
      return {
        prework: Array.isArray(value.prework) ? value.prework : [],
        agenda: Array.isArray(value.agenda) ? value.agenda : [],
        exitCriteria: Array.isArray(value.exitCriteria) ? value.exitCriteria : [],
      };
    }
  } catch {
    // fall through to the empty plan
  }
  return { prework: [], agenda: [], exitCriteria: [] };
}

// Normalize free text for idempotent dedupe: lowercase, collapse whitespace, trim.
function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function serializeMeeting(row: ProjectMeetingRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    meetingType: row.meetingType,
    focus: row.focus,
    status: row.status,
    scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
    notes: row.notes,
    agendaPlan: parseMeetingPlan(row.agendaPlan),
    nextMeetingAt: row.nextMeetingAt ? row.nextMeetingAt.toISOString() : null,
    generatedAgenda: parseAgenda(row.generatedAgenda),
    aiProvider: row.aiProvider,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeActionItem(row: MeetingActionItemRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceMeetingId: row.sourceMeetingId,
    sourceCorrespondenceId: row.sourceCorrespondenceId,
    title: row.title,
    description: row.description,
    ownerName: row.ownerName,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    status: row.status,
    category: row.category,
    weekIndex: row.weekIndex,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeDecision(row: MeetingDecisionRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    meetingId: row.meetingId,
    text: row.text,
    decidedBy: row.decidedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeOpenQuestion(row: MeetingOpenQuestionRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    meetingId: row.meetingId,
    text: row.text,
    status: row.status,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Combine a proposed date (YYYY-MM-DD) and time (HH:MM) into a concrete instant
// for the persisted nextMeetingAt. Returns null when there is no proposed date.
function nextSlotToDate(proposedDate: string | null, proposedTime: string | null): Date | null {
  if (!proposedDate) return null;
  const time = proposedTime ?? "10:00";
  const d = new Date(`${proposedDate}T${time}:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── Meetings ───────────────────────────────────────────────────

router.get("/projects/:projectId/meetings", async (req, res): Promise<void> => {
  const params = ListProjectMeetingsParams.safeParse(req.params);
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

  const rows = await db
    .select()
    .from(projectMeetingsTable)
    .where(eq(projectMeetingsTable.projectId, params.data.projectId))
    .orderBy(desc(projectMeetingsTable.createdAt));

  res.json(rows.map(serializeMeeting));
});

router.post("/projects/:projectId/meetings", async (req, res): Promise<void> => {
  const params = CreateProjectMeetingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateProjectMeetingBody.safeParse(req.body);
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

  // Seed the meeting's workspace plan from the chosen type's standing template.
  const meetingType: MeetingType = parsed.data.meetingType ?? "working";
  const plan = seedMeetingPlan(meetingType);

  const [row] = await db
    .insert(projectMeetingsTable)
    .values({
      projectId: params.data.projectId,
      title: parsed.data.title,
      meetingType,
      focus: parsed.data.focus ?? null,
      scheduledAt: parsed.data.scheduledAt ?? null,
      notes: parsed.data.notes ?? "",
      agendaPlan: JSON.stringify(plan),
      createdByUserId: req.actor!.userId,
    })
    .returning();

  await recordActorAudit(req.actor!, {
    action: "create",
    entityType: "meeting",
    entityTitle: row.title,
    projectId: row.projectId,
  });

  res.status(201).json(serializeMeeting(row));
});

router.get("/meetings/:id", async (req, res): Promise<void> => {
  const params = GetMeetingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveMeetingScope(params.data.id),
      "read",
      "Meeting not found",
    )
  ) {
    return;
  }

  const [row] = await db
    .select()
    .from(projectMeetingsTable)
    .where(eq(projectMeetingsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  res.json(serializeMeeting(row));
});

router.put("/meetings/:id", async (req, res): Promise<void> => {
  const params = UpdateMeetingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateMeetingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveMeetingScope(params.data.id),
      "write",
      "Meeting not found",
    )
  ) {
    return;
  }

  const update: Partial<typeof projectMeetingsTable.$inferInsert> = {};
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.meetingType !== undefined) update.meetingType = parsed.data.meetingType;
  if (parsed.data.focus !== undefined) update.focus = parsed.data.focus;
  if (parsed.data.status !== undefined) update.status = parsed.data.status;
  if (parsed.data.scheduledAt !== undefined) update.scheduledAt = parsed.data.scheduledAt;
  if (parsed.data.notes !== undefined) update.notes = parsed.data.notes;
  if (parsed.data.nextMeetingAt !== undefined) update.nextMeetingAt = parsed.data.nextMeetingAt;

  if (Object.keys(update).length === 0) {
    const [row] = await db
      .select()
      .from(projectMeetingsTable)
      .where(eq(projectMeetingsTable.id, params.data.id));
    if (!row) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }
    res.json(serializeMeeting(row));
    return;
  }

  const [row] = await db
    .update(projectMeetingsTable)
    .set(update)
    .where(eq(projectMeetingsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  await recordActorAudit(req.actor!, {
    action: "update",
    entityType: "meeting",
    entityTitle: row.title,
    projectId: row.projectId,
  });

  res.json(serializeMeeting(row));
});

// Check off (or un-check) a single proposed-agenda item, or one prompt within an
// item, on the NEXT-meeting agenda (`generatedAgenda`). The agenda lives as a JSON
// blob in one column, so the read-modify-write runs inside a row-locked
// transaction: concurrent toggles serialize on the lock and never clobber.
router.patch("/meetings/:id/agenda-checklist", async (req, res): Promise<void> => {
  const params = SetAgendaChecklistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SetAgendaChecklistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveMeetingScope(params.data.id),
      "write",
      "Meeting not found",
    )
  ) {
    return;
  }

  const { itemIndex, promptIndex, done } = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(projectMeetingsTable)
      .where(eq(projectMeetingsTable.id, params.data.id))
      .for("update");
    if (!row) return { kind: "not_found" as const };

    const agenda = parseAgenda(row.generatedAgenda);
    if (!agenda) return { kind: "no_agenda" as const };
    if (itemIndex >= agenda.items.length) return { kind: "out_of_range" as const };

    const item = agenda.items[itemIndex];
    if (promptIndex == null) {
      item.done = done;
    } else {
      if (promptIndex >= item.prompts.length) return { kind: "out_of_range" as const };
      const promptsDone = Array.isArray(item.promptsDone) ? [...item.promptsDone] : [];
      while (promptsDone.length < item.prompts.length) promptsDone.push(false);
      promptsDone[promptIndex] = done;
      item.promptsDone = promptsDone;
    }

    const [updated] = await tx
      .update(projectMeetingsTable)
      .set({ generatedAgenda: JSON.stringify(agenda) })
      .where(eq(projectMeetingsTable.id, row.id))
      .returning();
    return { kind: "ok" as const, row: updated };
  });

  if (result.kind === "not_found") {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }
  if (result.kind === "no_agenda") {
    res.status(409).json({ error: "This meeting has no generated agenda to update" });
    return;
  }
  if (result.kind === "out_of_range") {
    res.status(400).json({ error: "Agenda item or prompt index is out of range" });
    return;
  }

  res.json(serializeMeeting(result.row));
});

// Toggle one item on the meeting's OWN plan (`agendaPlan`): a pre-work item, a
// standing-agenda item (or a single prompt within it), or an exit criterion.
// Exit criteria are advisory only and never gate any server action. Row-locked so
// concurrent toggles serialize and never clobber.
router.patch("/meetings/:id/checklist", async (req, res): Promise<void> => {
  const params = SetMeetingChecklistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SetMeetingChecklistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveMeetingScope(params.data.id),
      "write",
      "Meeting not found",
    )
  ) {
    return;
  }

  const { section, itemIndex, promptIndex, value } = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(projectMeetingsTable)
      .where(eq(projectMeetingsTable.id, params.data.id))
      .for("update");
    if (!row) return { kind: "not_found" as const };

    const plan = parseMeetingPlan(row.agendaPlan);

    if (section === "prework") {
      if (itemIndex >= plan.prework.length) return { kind: "out_of_range" as const };
      plan.prework[itemIndex].done = value;
    } else if (section === "exitCriteria") {
      if (itemIndex >= plan.exitCriteria.length) return { kind: "out_of_range" as const };
      plan.exitCriteria[itemIndex].met = value;
    } else {
      // section === "agenda"
      if (itemIndex >= plan.agenda.length) return { kind: "out_of_range" as const };
      const item = plan.agenda[itemIndex];
      if (promptIndex == null) {
        item.done = value;
      } else {
        if (promptIndex >= item.prompts.length) return { kind: "out_of_range" as const };
        const promptsDone = Array.isArray(item.promptsDone) ? [...item.promptsDone] : [];
        while (promptsDone.length < item.prompts.length) promptsDone.push(false);
        promptsDone[promptIndex] = value;
        item.promptsDone = promptsDone;
      }
    }

    const [updated] = await tx
      .update(projectMeetingsTable)
      .set({ agendaPlan: JSON.stringify(plan) })
      .where(eq(projectMeetingsTable.id, row.id))
      .returning();
    return { kind: "ok" as const, row: updated };
  });

  if (result.kind === "not_found") {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }
  if (result.kind === "out_of_range") {
    res.status(400).json({ error: "Checklist item or prompt index is out of range" });
    return;
  }

  res.json(serializeMeeting(result.row));
});

router.delete("/meetings/:id", async (req, res): Promise<void> => {
  const params = DeleteMeetingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveMeetingScope(params.data.id),
      "write",
      "Meeting not found",
    )
  ) {
    return;
  }

  const [row] = await db
    .select()
    .from(projectMeetingsTable)
    .where(eq(projectMeetingsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  await db.delete(projectMeetingsTable).where(eq(projectMeetingsTable.id, params.data.id));

  await recordActorAudit(req.actor!, {
    action: "delete",
    entityType: "meeting",
    entityTitle: row.title,
    projectId: row.projectId,
  });

  res.status(204).end();
});

// Extract the three live-capture streams from a meeting's notes and propose the
// next agenda. Idempotent: new entries that match an existing project entry by
// normalized text are skipped, so re-running does not duplicate.
router.post("/meetings/:id/process-notes", async (req, res): Promise<void> => {
  const params = ProcessMeetingNotesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsedBody = ProcessMeetingNotesBody.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveMeetingScope(params.data.id),
      "write",
      "Meeting not found",
    )
  ) {
    return;
  }

  const [meeting] = await db
    .select()
    .from(projectMeetingsTable)
    .where(eq(projectMeetingsTable.id, params.data.id));
  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  // Context for the extractor: the project and its first course (for term length).
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, meeting.projectId));
  const [course] = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.projectId, meeting.projectId))
    .orderBy(coursesTable.id)
    .limit(1);

  const extraction = await extractStreamsFromNotes({
    notes: meeting.notes,
    projectTitle: project?.title ?? "Project",
    courseTitle: course?.title ?? null,
    termWeeks: course?.termWeeks ?? null,
    meetingTitle: meeting.title,
  });

  // ── Idempotent persistence of the three streams ───────────────
  // Each new entry is kept only when its normalized text does not already exist
  // for this project, so re-processing the same notes adds nothing new.
  const existingItems = await db
    .select()
    .from(meetingActionItemsTable)
    .where(eq(meetingActionItemsTable.projectId, meeting.projectId));
  const itemKeys = new Set(existingItems.map((i) => normalizeKey(i.title)));
  const newItems = extraction.actionItems.filter((a) => {
    const key = normalizeKey(a.title);
    if (itemKeys.has(key)) return false;
    itemKeys.add(key);
    return true;
  });
  let createdItems: MeetingActionItemRow[] = [];
  if (newItems.length > 0) {
    createdItems = await db
      .insert(meetingActionItemsTable)
      .values(
        newItems.map((a) => ({
          projectId: meeting.projectId,
          sourceMeetingId: meeting.id,
          title: a.title,
          description: a.description,
          ownerName: a.ownerName,
          dueAt: a.dueAt ? new Date(a.dueAt) : null,
          category: a.category,
          weekIndex: a.weekIndex,
        })),
      )
      .returning();
  }

  const existingDecisions = await db
    .select()
    .from(meetingDecisionsTable)
    .where(eq(meetingDecisionsTable.projectId, meeting.projectId));
  const decisionKeys = new Set(existingDecisions.map((d) => normalizeKey(d.text)));
  const newDecisions = extraction.decisions.filter((d) => {
    const key = normalizeKey(d.text);
    if (decisionKeys.has(key)) return false;
    decisionKeys.add(key);
    return true;
  });
  let createdDecisions: MeetingDecisionRow[] = [];
  if (newDecisions.length > 0) {
    createdDecisions = await db
      .insert(meetingDecisionsTable)
      .values(
        newDecisions.map((d) => ({
          projectId: meeting.projectId,
          meetingId: meeting.id,
          text: d.text,
          decidedBy: d.decidedBy,
          createdByUserId: req.actor!.userId,
        })),
      )
      .returning();
  }

  const existingQuestions = await db
    .select()
    .from(meetingOpenQuestionsTable)
    .where(eq(meetingOpenQuestionsTable.projectId, meeting.projectId));
  const questionKeys = new Set(existingQuestions.map((q) => normalizeKey(q.text)));
  const newQuestions = extraction.openQuestions.filter((q) => {
    const key = normalizeKey(q.text);
    if (questionKeys.has(key)) return false;
    questionKeys.add(key);
    return true;
  });
  let createdQuestions: MeetingOpenQuestionRow[] = [];
  if (newQuestions.length > 0) {
    createdQuestions = await db
      .insert(meetingOpenQuestionsTable)
      .values(
        newQuestions.map((q) => ({
          projectId: meeting.projectId,
          meetingId: meeting.id,
          text: q.text,
          createdByUserId: req.actor!.userId,
        })),
      )
      .returning();
  }

  // ── Carry-forward for the next agenda ─────────────────────────
  const openItems = await db
    .select()
    .from(meetingActionItemsTable)
    .where(
      and(
        eq(meetingActionItemsTable.projectId, meeting.projectId),
        eq(meetingActionItemsTable.status, "open"),
      ),
    );
  const openQuestionRows = await db
    .select()
    .from(meetingOpenQuestionsTable)
    .where(
      and(
        eq(meetingOpenQuestionsTable.projectId, meeting.projectId),
        eq(meetingOpenQuestionsTable.status, "open"),
      ),
    );
  const plan = parseMeetingPlan(meeting.agendaPlan);
  const unmetExitCriteria = plan.exitCriteria.filter((c) => !c.met).map((c) => c.text);

  const carry: CarryForward = {
    openActionItems: openItems.map((i) => ({ title: i.title, ownerName: i.ownerName })),
    openQuestions: openQuestionRows.map((q) => q.text),
    unmetExitCriteria,
    newDecisionCount: createdDecisions.length,
    newActionItemCount: createdItems.length,
    newOpenQuestionCount: createdQuestions.length,
  };

  const currentType: MeetingType = isMeetingType(meeting.meetingType) ? meeting.meetingType : "working";
  const nextMeetingType: MeetingType = parsedBody.data.nextMeetingType ?? suggestNextType(currentType);

  const next = buildNextAgenda({
    nextMeetingType,
    meetingDate: meeting.scheduledAt ?? null,
    projectTitle: project?.title ?? "Project",
    carry,
  });

  const agenda: StoredAgenda = {
    generatedAt: new Date().toISOString(),
    proposedDate: next.proposedDate,
    proposedTime: next.proposedTime,
    summary: next.summary,
    items: next.items,
    openActionCount: carry.openActionItems.length,
    nextMeetingType: next.nextMeetingType,
    openQuestionCount: next.openQuestionCount,
    unmetExitCriteriaCount: next.unmetExitCriteriaCount,
  };

  const nextMeetingAt = nextSlotToDate(agenda.proposedDate, agenda.proposedTime);

  const [updated] = await db
    .update(projectMeetingsTable)
    .set({
      generatedAgenda: JSON.stringify(agenda),
      aiProvider: extraction.provider,
      nextMeetingAt,
    })
    .where(eq(projectMeetingsTable.id, meeting.id))
    .returning();

  await recordActorAudit(req.actor!, {
    action: "process",
    entityType: "meeting",
    entityTitle: meeting.title,
    projectId: meeting.projectId,
  });

  res.json({
    provider: extraction.provider,
    meeting: serializeMeeting(updated),
    createdActionItems: createdItems.map(serializeActionItem),
    createdDecisions: createdDecisions.map(serializeDecision),
    createdOpenQuestions: createdQuestions.map(serializeOpenQuestion),
    agenda,
  });
});

// ── Action items ───────────────────────────────────────────────

router.get("/projects/:projectId/action-items", async (req, res): Promise<void> => {
  const params = ListProjectActionItemsParams.safeParse(req.params);
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

  const rows = await db
    .select()
    .from(meetingActionItemsTable)
    .where(eq(meetingActionItemsTable.projectId, params.data.projectId))
    .orderBy(meetingActionItemsTable.createdAt);

  res.json(rows.map(serializeActionItem));
});

router.post("/projects/:projectId/action-items", async (req, res): Promise<void> => {
  const params = CreateProjectActionItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateProjectActionItemBody.safeParse(req.body);
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

  // When promoting a piece of correspondence into an action item, the linked
  // correspondence must belong to THIS project (and therefore this org). Anything
  // else is reported as not found so a tenant cannot link across projects/orgs.
  if (parsed.data.sourceCorrespondenceId != null) {
    const corrScope = await resolveCorrespondenceScope(parsed.data.sourceCorrespondenceId);
    if (!corrScope || corrScope.projectId !== params.data.projectId) {
      res.status(404).json({ error: "Correspondence not found" });
      return;
    }
  }

  // Likewise, when capturing an action item inside a meeting workspace, the linked
  // meeting must belong to THIS project (and therefore this org), or we report not
  // found so a tenant cannot link an item to another project's/org's meeting.
  if (parsed.data.sourceMeetingId != null) {
    const meetingScope = await resolveMeetingScope(parsed.data.sourceMeetingId);
    if (!meetingScope || meetingScope.projectId !== params.data.projectId) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }
  }

  const [row] = await db
    .insert(meetingActionItemsTable)
    .values({
      projectId: params.data.projectId,
      sourceCorrespondenceId: parsed.data.sourceCorrespondenceId ?? null,
      sourceMeetingId: parsed.data.sourceMeetingId ?? null,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      ownerName: parsed.data.ownerName ?? null,
      dueAt: parsed.data.dueAt ?? null,
      category: parsed.data.category ?? "general",
      weekIndex: parsed.data.weekIndex ?? null,
    })
    .returning();

  await recordActorAudit(req.actor!, {
    action: "create",
    entityType: "action_item",
    entityTitle: row.title,
    projectId: row.projectId,
  });

  res.status(201).json(serializeActionItem(row));
});

router.patch("/action-items/:id", async (req, res): Promise<void> => {
  const params = UpdateActionItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateActionItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveActionItemScope(params.data.id),
      "write",
      "Action item not found",
    )
  ) {
    return;
  }

  const update: Partial<typeof meetingActionItemsTable.$inferInsert> = {};
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.ownerName !== undefined) update.ownerName = parsed.data.ownerName;
  if (parsed.data.dueAt !== undefined) update.dueAt = parsed.data.dueAt;
  if (parsed.data.category !== undefined) update.category = parsed.data.category;
  if (parsed.data.weekIndex !== undefined) update.weekIndex = parsed.data.weekIndex;
  // Completing an item stamps completedAt; reopening clears it.
  if (parsed.data.status !== undefined) {
    update.status = parsed.data.status;
    update.completedAt = parsed.data.status === "done" ? new Date() : null;
  }

  if (Object.keys(update).length === 0) {
    const [row] = await db
      .select()
      .from(meetingActionItemsTable)
      .where(eq(meetingActionItemsTable.id, params.data.id));
    if (!row) {
      res.status(404).json({ error: "Action item not found" });
      return;
    }
    res.json(serializeActionItem(row));
    return;
  }

  const [row] = await db
    .update(meetingActionItemsTable)
    .set(update)
    .where(eq(meetingActionItemsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Action item not found" });
    return;
  }

  await recordActorAudit(req.actor!, {
    action: "update",
    entityType: "action_item",
    entityTitle: row.title,
    projectId: row.projectId,
  });

  res.json(serializeActionItem(row));
});

router.delete("/action-items/:id", async (req, res): Promise<void> => {
  const params = DeleteActionItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveActionItemScope(params.data.id),
      "write",
      "Action item not found",
    )
  ) {
    return;
  }

  const [row] = await db
    .select()
    .from(meetingActionItemsTable)
    .where(eq(meetingActionItemsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Action item not found" });
    return;
  }

  await db.delete(meetingActionItemsTable).where(eq(meetingActionItemsTable.id, params.data.id));

  await recordActorAudit(req.actor!, {
    action: "delete",
    entityType: "action_item",
    entityTitle: row.title,
    projectId: row.projectId,
  });

  res.status(204).end();
});

// ── Decisions (live-capture stream) ────────────────────────────

router.get("/projects/:projectId/decisions", async (req, res): Promise<void> => {
  const params = ListProjectDecisionsParams.safeParse(req.params);
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

  const rows = await db
    .select()
    .from(meetingDecisionsTable)
    .where(eq(meetingDecisionsTable.projectId, params.data.projectId))
    .orderBy(desc(meetingDecisionsTable.createdAt));

  res.json(rows.map(serializeDecision));
});

router.post("/projects/:projectId/decisions", async (req, res): Promise<void> => {
  const params = CreateProjectDecisionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateProjectDecisionBody.safeParse(req.body);
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

  // A linked meeting must belong to THIS project (and therefore this org).
  if (parsed.data.meetingId != null) {
    const meetingScope = await resolveMeetingScope(parsed.data.meetingId);
    if (!meetingScope || meetingScope.projectId !== params.data.projectId) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }
  }

  const [row] = await db
    .insert(meetingDecisionsTable)
    .values({
      projectId: params.data.projectId,
      meetingId: parsed.data.meetingId ?? null,
      text: parsed.data.text,
      decidedBy: parsed.data.decidedBy ?? null,
      createdByUserId: req.actor!.userId,
    })
    .returning();

  await recordActorAudit(req.actor!, {
    action: "create",
    entityType: "decision",
    entityTitle: row.text.slice(0, 120),
    projectId: row.projectId,
  });

  res.status(201).json(serializeDecision(row));
});

router.patch("/decisions/:id", async (req, res): Promise<void> => {
  const params = UpdateDecisionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateDecisionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveDecisionScope(params.data.id),
      "write",
      "Decision not found",
    )
  ) {
    return;
  }

  const update: Partial<typeof meetingDecisionsTable.$inferInsert> = {};
  if (parsed.data.text !== undefined) update.text = parsed.data.text;
  if (parsed.data.decidedBy !== undefined) update.decidedBy = parsed.data.decidedBy;

  if (Object.keys(update).length === 0) {
    const [row] = await db
      .select()
      .from(meetingDecisionsTable)
      .where(eq(meetingDecisionsTable.id, params.data.id));
    if (!row) {
      res.status(404).json({ error: "Decision not found" });
      return;
    }
    res.json(serializeDecision(row));
    return;
  }

  const [row] = await db
    .update(meetingDecisionsTable)
    .set(update)
    .where(eq(meetingDecisionsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Decision not found" });
    return;
  }

  await recordActorAudit(req.actor!, {
    action: "update",
    entityType: "decision",
    entityTitle: row.text.slice(0, 120),
    projectId: row.projectId,
  });

  res.json(serializeDecision(row));
});

router.delete("/decisions/:id", async (req, res): Promise<void> => {
  const params = DeleteDecisionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveDecisionScope(params.data.id),
      "write",
      "Decision not found",
    )
  ) {
    return;
  }

  const [row] = await db
    .select()
    .from(meetingDecisionsTable)
    .where(eq(meetingDecisionsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Decision not found" });
    return;
  }

  await db.delete(meetingDecisionsTable).where(eq(meetingDecisionsTable.id, params.data.id));

  await recordActorAudit(req.actor!, {
    action: "delete",
    entityType: "decision",
    entityTitle: row.text.slice(0, 120),
    projectId: row.projectId,
  });

  res.status(204).end();
});

// ── Open questions (live-capture stream) ───────────────────────

router.get("/projects/:projectId/open-questions", async (req, res): Promise<void> => {
  const params = ListProjectOpenQuestionsParams.safeParse(req.params);
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

  // Unresolved first ("open" sorts before "resolved"), then newest first.
  const rows = await db
    .select()
    .from(meetingOpenQuestionsTable)
    .where(eq(meetingOpenQuestionsTable.projectId, params.data.projectId))
    .orderBy(asc(meetingOpenQuestionsTable.status), desc(meetingOpenQuestionsTable.createdAt));

  res.json(rows.map(serializeOpenQuestion));
});

router.post("/projects/:projectId/open-questions", async (req, res): Promise<void> => {
  const params = CreateProjectOpenQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateProjectOpenQuestionBody.safeParse(req.body);
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

  // A linked meeting must belong to THIS project (and therefore this org).
  if (parsed.data.meetingId != null) {
    const meetingScope = await resolveMeetingScope(parsed.data.meetingId);
    if (!meetingScope || meetingScope.projectId !== params.data.projectId) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }
  }

  const [row] = await db
    .insert(meetingOpenQuestionsTable)
    .values({
      projectId: params.data.projectId,
      meetingId: parsed.data.meetingId ?? null,
      text: parsed.data.text,
      createdByUserId: req.actor!.userId,
    })
    .returning();

  await recordActorAudit(req.actor!, {
    action: "create",
    entityType: "open_question",
    entityTitle: row.text.slice(0, 120),
    projectId: row.projectId,
  });

  res.status(201).json(serializeOpenQuestion(row));
});

router.patch("/open-questions/:id", async (req, res): Promise<void> => {
  const params = UpdateOpenQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateOpenQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveOpenQuestionScope(params.data.id),
      "write",
      "Open question not found",
    )
  ) {
    return;
  }

  const update: Partial<typeof meetingOpenQuestionsTable.$inferInsert> = {};
  if (parsed.data.text !== undefined) update.text = parsed.data.text;
  // Resolving stamps resolvedAt; reopening clears it.
  if (parsed.data.status !== undefined) {
    update.status = parsed.data.status;
    update.resolvedAt = parsed.data.status === "resolved" ? new Date() : null;
  }

  if (Object.keys(update).length === 0) {
    const [row] = await db
      .select()
      .from(meetingOpenQuestionsTable)
      .where(eq(meetingOpenQuestionsTable.id, params.data.id));
    if (!row) {
      res.status(404).json({ error: "Open question not found" });
      return;
    }
    res.json(serializeOpenQuestion(row));
    return;
  }

  const [row] = await db
    .update(meetingOpenQuestionsTable)
    .set(update)
    .where(eq(meetingOpenQuestionsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Open question not found" });
    return;
  }

  await recordActorAudit(req.actor!, {
    action: "update",
    entityType: "open_question",
    entityTitle: row.text.slice(0, 120),
    projectId: row.projectId,
  });

  res.json(serializeOpenQuestion(row));
});

router.delete("/open-questions/:id", async (req, res): Promise<void> => {
  const params = DeleteOpenQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveOpenQuestionScope(params.data.id),
      "write",
      "Open question not found",
    )
  ) {
    return;
  }

  const [row] = await db
    .select()
    .from(meetingOpenQuestionsTable)
    .where(eq(meetingOpenQuestionsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Open question not found" });
    return;
  }

  await db.delete(meetingOpenQuestionsTable).where(eq(meetingOpenQuestionsTable.id, params.data.id));

  await recordActorAudit(req.actor!, {
    action: "delete",
    entityType: "open_question",
    entityTitle: row.text.slice(0, 120),
    projectId: row.projectId,
  });

  res.status(204).end();
});

// ── Derived agenda summary ─────────────────────────────────────

router.get("/projects/:projectId/agenda-summary", async (req, res): Promise<void> => {
  const params = GetAgendaSummaryParams.safeParse(req.params);
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

  const items = await db
    .select()
    .from(meetingActionItemsTable)
    .where(eq(meetingActionItemsTable.projectId, params.data.projectId));

  const meetings = await db
    .select()
    .from(projectMeetingsTable)
    .where(eq(projectMeetingsTable.projectId, params.data.projectId))
    .orderBy(desc(projectMeetingsTable.createdAt));

  const totalActionItems = items.length;
  const doneActionItems = items.filter((i) => i.status === "done").length;
  const openActionItems = totalActionItems - doneActionItems;
  const pct = (done: number, total: number) => (total === 0 ? 0 : Math.round((done / total) * 100));

  // Weekly build-progress bars, one bucket per distinct week index in use.
  const weekBuckets = new Map<number, { total: number; done: number }>();
  for (const i of items) {
    if (i.weekIndex == null) continue;
    const bucket = weekBuckets.get(i.weekIndex) ?? { total: 0, done: 0 };
    bucket.total += 1;
    if (i.status === "done") bucket.done += 1;
    weekBuckets.set(i.weekIndex, bucket);
  }
  const weeks = [...weekBuckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekIndex, b]) => ({
      weekIndex,
      label: `Week ${weekIndex + 1}`,
      total: b.total,
      done: b.done,
      percent: pct(b.done, b.total),
    }));

  const accItems = items.filter((i) => i.category === "accessibility");
  const accDone = accItems.filter((i) => i.status === "done").length;
  const accessibility = {
    total: accItems.length,
    done: accDone,
    percent: pct(accDone, accItems.length),
  };

  // The latest agenda is the most recent meeting that has been processed.
  let latestAgenda: StoredAgenda | null = null;
  for (const m of meetings) {
    const parsed = parseAgenda(m.generatedAgenda);
    if (parsed) {
      latestAgenda = parsed;
      break;
    }
  }

  // The furthest-out proposed next meeting across all meetings.
  let nextMeetingAt: string | null = null;
  for (const m of meetings) {
    if (m.nextMeetingAt && (nextMeetingAt === null || m.nextMeetingAt.toISOString() > nextMeetingAt)) {
      nextMeetingAt = m.nextMeetingAt.toISOString();
    }
  }

  res.json({
    projectId: params.data.projectId,
    totalActionItems,
    doneActionItems,
    openActionItems,
    buildProgressPercent: pct(doneActionItems, totalActionItems),
    weeks,
    accessibility,
    latestAgenda,
    nextMeetingAt,
  });
});

export default router;
