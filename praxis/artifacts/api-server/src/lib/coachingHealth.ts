import { db } from "@workspace/db";
import {
  coursesTable,
  organisationsTable,
  courseGroupsTable,
  courseGroupMembersTable,
  gradebookAlertsTable,
  usersTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { isSuperAdmin } from "./roles";

/**
 * Org/partner-wide coaching effectiveness aggregate, shared by the GET /coaching/health dashboard
 * and the digest email. Scope: super = all courses; partner_admin = the partner + its orgs;
 * org_admin = their org. Attributes each flagged/resolved learner to the coach who leads a section
 * of that course containing them.
 */

export interface CoachHealthRow {
  coachId: string;
  name: string;
  sectionsLed: number;
  learners: number;
  flagged: number;
  resolved: number;
}
export interface CoachingHealth {
  summary: {
    flaggedLearners: number;
    offTrack: number;
    atRisk: number;
    unassignedFlagged: number;
    activeInterventions: number;
    resolvedTotal: number;
    resolutionRate: number | null;
    coaches: number;
    courses: number;
  };
  coaches: CoachHealthRow[];
}

export interface HealthUser {
  role: string;
  id: string;
  organisationId?: string | null;
  partnerId?: string | null;
}

const EMPTY: CoachingHealth = {
  summary: { flaggedLearners: 0, offTrack: 0, atRisk: 0, unassignedFlagged: 0, activeInterventions: 0, resolvedTotal: 0, resolutionRate: null, coaches: 0, courses: 0 },
  coaches: [],
};

const fullName = (u: { firstName: string | null; lastName: string | null; email: string }) =>
  `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;

export async function computeCoachingHealth(user: HealthUser): Promise<CoachingHealth> {
  // Tenant course set.
  let courseIds: string[];
  if (isSuperAdmin(user.role)) {
    courseIds = (await db.select({ id: coursesTable.id }).from(coursesTable)).map((c) => c.id);
  } else {
    const tenantIds = new Set<string>();
    if (user.role === "partner_admin" && user.partnerId) {
      tenantIds.add(user.partnerId);
      const orgs = await db.select({ id: organisationsTable.id }).from(organisationsTable).where(eq(organisationsTable.partnerId, user.partnerId));
      orgs.forEach((o) => tenantIds.add(o.id));
    } else if (user.organisationId) {
      tenantIds.add(user.organisationId);
    } else if (user.partnerId) {
      tenantIds.add(user.partnerId);
    }
    courseIds = tenantIds.size
      ? (await db.select({ id: coursesTable.id }).from(coursesTable).where(inArray(coursesTable.tenantId, [...tenantIds]))).map((c) => c.id)
      : [];
  }
  if (!courseIds.length) return EMPTY;

  const groups = await db.select().from(courseGroupsTable).where(inArray(courseGroupsTable.courseId, courseIds));
  const groupIds = groups.map((g) => g.id);
  const groupCourse = new Map(groups.map((g) => [g.id, g.courseId]));
  const memberRows = groupIds.length ? await db.select().from(courseGroupMembersTable).where(inArray(courseGroupMembersTable.groupId, groupIds)) : [];
  const groupLeader = new Map<string, string>();
  const coachSections = new Map<string, number>();
  for (const m of memberRows) if (m.role === "leader") { groupLeader.set(m.groupId, m.userId); coachSections.set(m.userId, (coachSections.get(m.userId) ?? 0) + 1); }
  const leaderOf = new Map<string, string>();
  const coachLearners = new Map<string, Set<string>>();
  for (const m of memberRows) if (m.role === "member") {
    const leader = groupLeader.get(m.groupId);
    if (!leader) continue;
    leaderOf.set(`${groupCourse.get(m.groupId)}:${m.userId}`, leader);
    const set = coachLearners.get(leader) ?? new Set<string>();
    set.add(m.userId);
    coachLearners.set(leader, set);
  }

  const alerts = await db
    .select({ userId: gradebookAlertsTable.userId, courseId: gradebookAlertsTable.courseId, status: gradebookAlertsTable.status, resolvedAt: gradebookAlertsTable.resolvedAt })
    .from(gradebookAlertsTable)
    .where(inArray(gradebookAlertsTable.courseId, courseIds));

  let offTrack = 0, atRisk = 0, resolvedTotal = 0, unassignedFlagged = 0;
  const flaggedLearners = new Set<string>();
  const coachFlagged = new Map<string, number>();
  const coachResolved = new Map<string, number>();
  for (const a of alerts) {
    const leader = leaderOf.get(`${a.courseId}:${a.userId}`);
    if (a.resolvedAt) {
      resolvedTotal++;
      if (leader) coachResolved.set(leader, (coachResolved.get(leader) ?? 0) + 1);
      continue;
    }
    if (a.status === "off_track" || a.status === "at_risk") {
      if (a.status === "off_track") offTrack++; else atRisk++;
      flaggedLearners.add(a.userId);
      if (leader) coachFlagged.set(leader, (coachFlagged.get(leader) ?? 0) + 1);
      else unassignedFlagged++;
    }
  }
  const activeInterventions = offTrack + atRisk;
  const resolutionRate = resolvedTotal + activeInterventions > 0 ? Math.round((resolvedTotal / (resolvedTotal + activeInterventions)) * 100) : null;

  const coachIds = [...coachSections.keys()];
  const coachUsers = coachIds.length ? await db.select().from(usersTable).where(inArray(usersTable.id, coachIds)) : [];
  const coaches = coachUsers
    .map((c) => ({
      coachId: c.id,
      name: fullName(c),
      sectionsLed: coachSections.get(c.id) ?? 0,
      learners: coachLearners.get(c.id)?.size ?? 0,
      flagged: coachFlagged.get(c.id) ?? 0,
      resolved: coachResolved.get(c.id) ?? 0,
    }))
    .sort((a, b) => b.flagged - a.flagged || b.learners - a.learners);

  return {
    summary: { flaggedLearners: flaggedLearners.size, offTrack, atRisk, unassignedFlagged, activeInterventions, resolvedTotal, resolutionRate, coaches: coaches.length, courses: courseIds.length },
    coaches,
  };
}
