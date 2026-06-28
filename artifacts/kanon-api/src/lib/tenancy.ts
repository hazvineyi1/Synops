import type { Response } from "express";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  db,
  clientsTable,
  projectsTable,
  coursesTable,
  modulesTable,
  classesTable,
  objectivesTable,
  assessmentsTable,
  activitiesTable,
  qaChecksTable,
  crosswalkLinksTable,
  allocationsTable,
  meetingRecordingsTable,
  projectMeetingsTable,
  meetingActionItemsTable,
  meetingDecisionsTable,
  meetingOpenQuestionsTable,
  projectCorrespondenceTable,
  projectTimeEntriesTable,
  type AllocationScopeType,
} from "@workspace/kanon-db";
import type { ActorContext } from "./actor";

/**
 * Whether `actor` may access data belonging to organization `orgId`.
 * Global actors (admin/super_admin) can access everything. A null/unknown org is
 * NEVER accessible to a non-global actor (no null-as-global, and a missing entity
 * looks the same as a cross-org one to a tenant).
 */
export function actorCanAccessOrg(actor: ActorContext, orgId: number | null | undefined): boolean {
  if (actor.isGlobal) return true;
  if (orgId == null) return false;
  return actor.organizationId === orgId;
}

/**
 * Guard helper: returns true (and writes a 404) when `actor` may NOT access the
 * given organization. A cross-org resource is reported as "not found" so a tenant
 * cannot probe for the existence of another organization's data.
 *
 *   if (denyCrossOrg(res, req.actor!, await getProjectOrgId(id), "Project not found")) return;
 */
export function denyCrossOrg(
  res: Response,
  actor: ActorContext,
  orgId: number | null | undefined,
  notFoundMessage: string,
): boolean {
  if (actorCanAccessOrg(actor, orgId)) return false;
  res.status(404).json({ error: notFoundMessage });
  return true;
}

// ── Org resolvers ───────────────────────────────────────────
// Every curriculum entity traces back to clients.organization_id. Each resolver
// returns the owning organization id, or null when the entity does not exist.

export async function getClientOrgId(clientId: number): Promise<number | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));
  return row?.orgId ?? null;
}

export async function getProjectOrgId(projectId: number): Promise<number | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId })
    .from(projectsTable)
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(projectsTable.id, projectId));
  return row?.orgId ?? null;
}

export async function getCourseOrgId(courseId: number): Promise<number | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId })
    .from(coursesTable)
    .innerJoin(projectsTable, eq(coursesTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(coursesTable.id, courseId));
  return row?.orgId ?? null;
}

export async function getModuleOrgId(moduleId: number): Promise<number | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId })
    .from(modulesTable)
    .innerJoin(coursesTable, eq(modulesTable.courseId, coursesTable.id))
    .innerJoin(projectsTable, eq(coursesTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(modulesTable.id, moduleId));
  return row?.orgId ?? null;
}

export async function getClassOrgId(classId: number): Promise<number | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId })
    .from(classesTable)
    .innerJoin(coursesTable, eq(classesTable.courseId, coursesTable.id))
    .innerJoin(projectsTable, eq(coursesTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(classesTable.id, classId));
  return row?.orgId ?? null;
}

export async function getObjectiveOrgId(objectiveId: number): Promise<number | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId })
    .from(objectivesTable)
    .innerJoin(projectsTable, eq(objectivesTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(objectivesTable.id, objectiveId));
  return row?.orgId ?? null;
}

export async function getAssessmentOrgId(assessmentId: number): Promise<number | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId })
    .from(assessmentsTable)
    .innerJoin(coursesTable, eq(assessmentsTable.courseId, coursesTable.id))
    .innerJoin(projectsTable, eq(coursesTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(assessmentsTable.id, assessmentId));
  return row?.orgId ?? null;
}

export async function getActivityOrgId(activityId: number): Promise<number | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId })
    .from(activitiesTable)
    .innerJoin(coursesTable, eq(activitiesTable.courseId, coursesTable.id))
    .innerJoin(projectsTable, eq(coursesTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(activitiesTable.id, activityId));
  return row?.orgId ?? null;
}

export async function getQaCheckOrgId(qaCheckId: number): Promise<number | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId })
    .from(qaChecksTable)
    .innerJoin(projectsTable, eq(qaChecksTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(qaChecksTable.id, qaCheckId));
  return row?.orgId ?? null;
}

export async function getCrosswalkLinkOrgId(linkId: number): Promise<number | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId })
    .from(crosswalkLinksTable)
    .innerJoin(projectsTable, eq(crosswalkLinksTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(crosswalkLinksTable.id, linkId));
  return row?.orgId ?? null;
}

/**
 * SQL predicate restricting a `clientsTable` query to the actor's organization.
 * Returns undefined for global actors (no restriction) and a never-true
 * predicate for a non-global actor that somehow has no organization.
 */
export function clientOrgFilter(actor: ActorContext): SQL | undefined {
  if (actor.isGlobal) return undefined;
  if (actor.organizationId == null) return sql`false`;
  return eq(clientsTable.organizationId, actor.organizationId);
}

// ── Allocation target validation (used by the allocations feature) ──────────

export async function getAllocationTargetOrgId(
  scopeType: AllocationScopeType,
  scopeId: number,
): Promise<number | null> {
  switch (scopeType) {
    case "project":
      return getProjectOrgId(scopeId);
    case "course":
      return getCourseOrgId(scopeId);
    case "class":
      return getClassOrgId(scopeId);
    default:
      return null;
  }
}

/**
 * An allocation may only target a scope (project/course/class) that belongs to
 * the same organization the allocation is created in.
 */
export async function assertAllocationTargetInOrg(
  scopeType: AllocationScopeType,
  scopeId: number,
  orgId: number,
): Promise<boolean> {
  const targetOrgId = await getAllocationTargetOrgId(scopeType, scopeId);
  return targetOrgId != null && targetOrgId === orgId;
}

// ── Builder allocation scoping ──────────────────────────────────────────────
// Only the `builder` role is allocation-limited; admin/super_admin/school_admin
// are organization-limited only (they pass the builder checks below by role).
//
// Coverage rule (downward-only): an active allocation grants access to its target
// scope AND everything beneath it, never anything above it.
//   - project allocation  -> read+write the whole project subtree
//     (objectives/crosswalk/qa + every course/module/assessment/activity/class).
//   - course  allocation  -> read+write that course + its modules/assessments/
//     activities/classes; READ-ONLY access to the parent project's project-level
//     entities (objectives/standards) for alignment; NO project-level writes.
//   - class   allocation  -> read+write that class only; READ-ONLY parent course
//     and project context.

export type ScopeMode = "read" | "write";
export type ScopeLevel = "project" | "course" | "class";

/**
 * A resolved location of a curriculum entity within the tenancy tree. `courseId`
 * is null for project-level entities; `classId` is null for project/course-level
 * entities. `orgId` is the owning organization.
 */
export interface ScopeRef {
  orgId: number;
  level: ScopeLevel;
  projectId: number;
  courseId: number | null;
  classId: number | null;
}

export async function resolveProjectScope(projectId: number): Promise<ScopeRef | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId, projectId: projectsTable.id })
    .from(projectsTable)
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(projectsTable.id, projectId));
  if (!row) return null;
  return { orgId: row.orgId, level: "project", projectId: row.projectId, courseId: null, classId: null };
}

export async function resolveTimeEntryScope(entryId: number): Promise<ScopeRef | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId, projectId: projectsTable.id })
    .from(projectTimeEntriesTable)
    .innerJoin(projectsTable, eq(projectTimeEntriesTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(projectTimeEntriesTable.id, entryId));
  if (!row) return null;
  return { orgId: row.orgId, level: "project", projectId: row.projectId, courseId: null, classId: null };
}

export async function resolveCourseScope(courseId: number): Promise<ScopeRef | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId, projectId: projectsTable.id, courseId: coursesTable.id })
    .from(coursesTable)
    .innerJoin(projectsTable, eq(coursesTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(coursesTable.id, courseId));
  if (!row) return null;
  return { orgId: row.orgId, level: "course", projectId: row.projectId, courseId: row.courseId, classId: null };
}

export async function resolveModuleScope(moduleId: number): Promise<ScopeRef | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId, projectId: projectsTable.id, courseId: coursesTable.id })
    .from(modulesTable)
    .innerJoin(coursesTable, eq(modulesTable.courseId, coursesTable.id))
    .innerJoin(projectsTable, eq(coursesTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(modulesTable.id, moduleId));
  if (!row) return null;
  return { orgId: row.orgId, level: "course", projectId: row.projectId, courseId: row.courseId, classId: null };
}

export async function resolveAssessmentScope(assessmentId: number): Promise<ScopeRef | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId, projectId: projectsTable.id, courseId: coursesTable.id })
    .from(assessmentsTable)
    .innerJoin(coursesTable, eq(assessmentsTable.courseId, coursesTable.id))
    .innerJoin(projectsTable, eq(coursesTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(assessmentsTable.id, assessmentId));
  if (!row) return null;
  return { orgId: row.orgId, level: "course", projectId: row.projectId, courseId: row.courseId, classId: null };
}

export async function resolveActivityScope(activityId: number): Promise<ScopeRef | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId, projectId: projectsTable.id, courseId: coursesTable.id })
    .from(activitiesTable)
    .innerJoin(coursesTable, eq(activitiesTable.courseId, coursesTable.id))
    .innerJoin(projectsTable, eq(coursesTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(activitiesTable.id, activityId));
  if (!row) return null;
  return { orgId: row.orgId, level: "course", projectId: row.projectId, courseId: row.courseId, classId: null };
}

export async function resolveClassScope(classId: number): Promise<ScopeRef | null> {
  const [row] = await db
    .select({
      orgId: clientsTable.organizationId,
      projectId: projectsTable.id,
      courseId: coursesTable.id,
      classId: classesTable.id,
    })
    .from(classesTable)
    .innerJoin(coursesTable, eq(classesTable.courseId, coursesTable.id))
    .innerJoin(projectsTable, eq(coursesTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(classesTable.id, classId));
  if (!row) return null;
  return { orgId: row.orgId, level: "class", projectId: row.projectId, courseId: row.courseId, classId: row.classId };
}

export async function resolveObjectiveScope(objectiveId: number): Promise<ScopeRef | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId, projectId: projectsTable.id })
    .from(objectivesTable)
    .innerJoin(projectsTable, eq(objectivesTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(objectivesTable.id, objectiveId));
  if (!row) return null;
  return { orgId: row.orgId, level: "project", projectId: row.projectId, courseId: null, classId: null };
}

export async function resolveQaCheckScope(qaCheckId: number): Promise<ScopeRef | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId, projectId: projectsTable.id })
    .from(qaChecksTable)
    .innerJoin(projectsTable, eq(qaChecksTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(qaChecksTable.id, qaCheckId));
  if (!row) return null;
  return { orgId: row.orgId, level: "project", projectId: row.projectId, courseId: null, classId: null };
}

export async function resolveCrosswalkLinkScope(linkId: number): Promise<ScopeRef | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId, projectId: projectsTable.id })
    .from(crosswalkLinksTable)
    .innerJoin(projectsTable, eq(crosswalkLinksTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(crosswalkLinksTable.id, linkId));
  if (!row) return null;
  return { orgId: row.orgId, level: "project", projectId: row.projectId, courseId: null, classId: null };
}

export async function resolveMeetingRecordingScope(recordingId: number): Promise<ScopeRef | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId, projectId: projectsTable.id })
    .from(meetingRecordingsTable)
    .innerJoin(projectsTable, eq(meetingRecordingsTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(meetingRecordingsTable.id, recordingId));
  if (!row) return null;
  return { orgId: row.orgId, level: "project", projectId: row.projectId, courseId: null, classId: null };
}

export async function resolveMeetingScope(meetingId: number): Promise<ScopeRef | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId, projectId: projectsTable.id })
    .from(projectMeetingsTable)
    .innerJoin(projectsTable, eq(projectMeetingsTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(projectMeetingsTable.id, meetingId));
  if (!row) return null;
  return { orgId: row.orgId, level: "project", projectId: row.projectId, courseId: null, classId: null };
}

export async function resolveActionItemScope(actionItemId: number): Promise<ScopeRef | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId, projectId: projectsTable.id })
    .from(meetingActionItemsTable)
    .innerJoin(projectsTable, eq(meetingActionItemsTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(meetingActionItemsTable.id, actionItemId));
  if (!row) return null;
  return { orgId: row.orgId, level: "project", projectId: row.projectId, courseId: null, classId: null };
}

export async function resolveCorrespondenceScope(correspondenceId: number): Promise<ScopeRef | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId, projectId: projectsTable.id })
    .from(projectCorrespondenceTable)
    .innerJoin(projectsTable, eq(projectCorrespondenceTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(projectCorrespondenceTable.id, correspondenceId));
  if (!row) return null;
  return { orgId: row.orgId, level: "project", projectId: row.projectId, courseId: null, classId: null };
}

export async function resolveDecisionScope(decisionId: number): Promise<ScopeRef | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId, projectId: projectsTable.id })
    .from(meetingDecisionsTable)
    .innerJoin(projectsTable, eq(meetingDecisionsTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(meetingDecisionsTable.id, decisionId));
  if (!row) return null;
  return { orgId: row.orgId, level: "project", projectId: row.projectId, courseId: null, classId: null };
}

export async function resolveOpenQuestionScope(questionId: number): Promise<ScopeRef | null> {
  const [row] = await db
    .select({ orgId: clientsTable.organizationId, projectId: projectsTable.id })
    .from(meetingOpenQuestionsTable)
    .innerJoin(projectsTable, eq(meetingOpenQuestionsTable.projectId, projectsTable.id))
    .innerJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(meetingOpenQuestionsTable.id, questionId));
  if (!row) return null;
  return { orgId: row.orgId, level: "project", projectId: row.projectId, courseId: null, classId: null };
}

/**
 * The set of curriculum scopes a builder may touch, derived from active
 * allocations. `writable*` sets are the directly-allocated targets (downward
 * write coverage flows from them); `accessible*` sets add the read-only upward
 * context (a course/class allocation lets the builder READ its parent project's
 * project-level entities, and a class allocation lets it READ its parent course).
 */
export interface BuilderScope {
  writableProjects: Set<number>;
  writableCourses: Set<number>;
  writableClasses: Set<number>;
  accessibleProjects: Set<number>;
  accessibleCourses: Set<number>;
}

export async function loadBuilderScope(builderUserId: number): Promise<BuilderScope> {
  const allocs = await db
    .select({ scopeType: allocationsTable.scopeType, scopeId: allocationsTable.scopeId })
    .from(allocationsTable)
    .where(and(eq(allocationsTable.builderUserId, builderUserId), eq(allocationsTable.status, "active")));

  const projectAlloc = allocs.filter((a) => a.scopeType === "project").map((a) => a.scopeId);
  const courseAlloc = allocs.filter((a) => a.scopeType === "course").map((a) => a.scopeId);
  const classAlloc = allocs.filter((a) => a.scopeType === "class").map((a) => a.scopeId);

  const writableProjects = new Set<number>(projectAlloc);
  const writableCourses = new Set<number>(courseAlloc);
  const writableClasses = new Set<number>(classAlloc);
  const accessibleProjects = new Set<number>(projectAlloc);
  const accessibleCourses = new Set<number>(courseAlloc);

  if (courseAlloc.length > 0) {
    const rows = await db
      .select({ projectId: coursesTable.projectId })
      .from(coursesTable)
      .where(inArray(coursesTable.id, courseAlloc));
    for (const r of rows) accessibleProjects.add(r.projectId);
  }
  if (classAlloc.length > 0) {
    const rows = await db
      .select({ courseId: classesTable.courseId, projectId: coursesTable.projectId })
      .from(classesTable)
      .innerJoin(coursesTable, eq(classesTable.courseId, coursesTable.id))
      .where(inArray(classesTable.id, classAlloc));
    for (const r of rows) {
      accessibleCourses.add(r.courseId);
      accessibleProjects.add(r.projectId);
    }
  }

  return { writableProjects, writableCourses, writableClasses, accessibleProjects, accessibleCourses };
}

/**
 * The set of client ids a builder may see: the clients that own at least one of
 * the builder's accessible projects. Used to scope client lists/lookups and the
 * org dashboard for builders.
 */
export async function builderClientIds(bs: BuilderScope): Promise<Set<number>> {
  if (bs.accessibleProjects.size === 0) return new Set<number>();
  const rows = await db
    .select({ clientId: projectsTable.clientId })
    .from(projectsTable)
    .where(inArray(projectsTable.id, [...bs.accessibleProjects]));
  return new Set<number>(rows.map((r) => r.clientId));
}

export function scopeCovered(scope: ScopeRef, mode: ScopeMode, bs: BuilderScope): boolean {
  if (scope.level === "project") {
    if (bs.writableProjects.has(scope.projectId)) return true;
    if (mode === "read" && bs.accessibleProjects.has(scope.projectId)) return true;
    return false;
  }
  if (scope.level === "course") {
    if (bs.writableProjects.has(scope.projectId)) return true;
    if (scope.courseId != null && bs.writableCourses.has(scope.courseId)) return true;
    if (mode === "read" && scope.courseId != null && bs.accessibleCourses.has(scope.courseId)) return true;
    return false;
  }
  // class level: read == write (no descendants)
  if (bs.writableProjects.has(scope.projectId)) return true;
  if (scope.courseId != null && bs.writableCourses.has(scope.courseId)) return true;
  if (scope.classId != null && bs.writableClasses.has(scope.classId)) return true;
  return false;
}

/**
 * The pure builder authorization decision for a resolved scope and mode:
 *   - "allow"          : covered in the requested mode.
 *   - "deny_write"     : readable but not writable -> the handler should 403.
 *   - "deny_not_found" : not even readable -> the handler should 404 (do not
 *                        leak the entity's existence to an unallocated builder).
 * Exported so the downward-only coverage rule can be unit-tested without a DB.
 */
export type BuilderAccessDecision = "allow" | "deny_write" | "deny_not_found";

export function builderAccessDecision(
  scope: ScopeRef,
  mode: ScopeMode,
  bs: BuilderScope,
): BuilderAccessDecision {
  if (scopeCovered(scope, mode, bs)) return "allow";
  if (mode === "write" && scopeCovered(scope, "read", bs)) return "deny_write";
  return "deny_not_found";
}

/**
 * Whether `actor` may access `scope` in the requested mode. Enforces org first,
 * then (for builders only) downward allocation coverage.
 */
export async function canAccessScope(
  actor: ActorContext,
  scope: ScopeRef | null,
  mode: ScopeMode,
): Promise<boolean> {
  if (scope == null) return false;
  if (!actorCanAccessOrg(actor, scope.orgId)) return false;
  if (actor.role !== "builder") return true;
  const bs = await loadBuilderScope(actor.userId);
  return scopeCovered(scope, mode, bs);
}

/**
 * Guard for curriculum handlers. Replaces denyCrossOrg at every curriculum call
 * site: enforces org (404 cross-org/not-found to avoid leaking existence) and,
 * for builders, downward allocation coverage. A builder attempting to WRITE an
 * entity they can READ but not write gets 403; anything they cannot even read is
 * reported as 404.
 *
 *   if (await denyNoScope(res, req.actor!, await resolveCourseScope(id), "write", "Course not found")) return;
 */
export async function denyNoScope(
  res: Response,
  actor: ActorContext,
  scope: ScopeRef | null,
  mode: ScopeMode,
  notFoundMessage: string,
): Promise<boolean> {
  if (scope == null) {
    res.status(404).json({ error: notFoundMessage });
    return true;
  }
  if (!actorCanAccessOrg(actor, scope.orgId)) {
    res.status(404).json({ error: notFoundMessage });
    return true;
  }
  if (actor.role !== "builder") return false;

  const bs = await loadBuilderScope(actor.userId);
  const decision = builderAccessDecision(scope, mode, bs);
  if (decision === "allow") return false;

  if (decision === "deny_write") {
    res.status(403).json({ error: "You do not have write access to this scope." });
    return true;
  }
  res.status(404).json({ error: notFoundMessage });
  return true;
}

/**
 * Deny actions that create top-level entities (clients, projects) which sit
 * ABOVE any allocation. Builders are allocation-scoped and can never create
 * these; school_admin/global pass through to the normal org check.
 */
export function denyBuilderWrite(res: Response, actor: ActorContext): boolean {
  if (actor.role === "builder") {
    res.status(403).json({ error: "Builders cannot perform this action." });
    return true;
  }
  return false;
}

// ── Manager (school_admin / global) org resolution ──────────────────────────
// Builder/allocation management and the school report are performed by a
// "manager": a school_admin (bound to their own org) or a global admin. A global
// admin may target any org via an explicit organizationId; a school_admin always
// operates on their own org and can never target another. Builders are not
// managers.

export type ManagedOrg =
  | { kind: "org"; orgId: number }
  | { kind: "all" }
  | { kind: "forbidden" }
  | { kind: "missing_org" };

export function resolveManagedOrg(
  actor: ActorContext,
  requestedOrgId: number | null | undefined,
  opts: { requireConcrete: boolean },
): ManagedOrg {
  if (actor.role === "builder") return { kind: "forbidden" };
  if (!actor.isGlobal) {
    // school_admin: pinned to own org (guaranteed non-null by loadActorContext).
    return { kind: "org", orgId: actor.organizationId! };
  }
  // global admin/super_admin: may target any org, or all when none is required.
  if (requestedOrgId != null) return { kind: "org", orgId: requestedOrgId };
  return opts.requireConcrete ? { kind: "missing_org" } : { kind: "all" };
}

/**
 * Translate a non-usable ManagedOrg into an HTTP error (403 for a builder, 400
 * when a global admin omitted a required organizationId), writing the response
 * and returning true. Returns false for the usable "org"/"all" cases.
 */
export function denyUnmanagedOrg(res: Response, managed: ManagedOrg): boolean {
  if (managed.kind === "forbidden") {
    res.status(403).json({ error: "Builders cannot perform this action." });
    return true;
  }
  if (managed.kind === "missing_org") {
    res.status(400).json({ error: "organizationId is required." });
    return true;
  }
  return false;
}
