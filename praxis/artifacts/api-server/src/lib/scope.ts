/**
 * Section-scope helpers for the Co-facilitator tier (decision doc §4.2 / §8).
 *
 * A Co-facilitator (coach) is bound to the course section(s) they lead. Sections are
 * modelled with the existing course_groups / course_group_members tables: a member with
 * role "leader" is the section's Co-facilitator. These helpers answer "which sections /
 * courses does this Co-facilitator lead?" so delivery routes (grading, moderation,
 * analytics) can scope to them.
 */
import { db } from "@workspace/db";
import {
  courseGroupsTable,
  courseGroupMembersTable,
  coursesTable,
  coursePartnerAssignmentsTable,
  funderScopesTable,
  deliverySessionsTable,
  attendanceRecordsTable,
  enrolmentsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  isSuperAdmin,
  isCoFacilitator,
  canAdministerOrg,
  canAccessCourse,
  hasHubAccess,
  type ScopedUser,
} from "./roles";

/** A user identity that can be scope-checked against courses/sections. */
export type StaffUser = ScopedUser & { id: string };

/** Organisation ids a funder is authorised to see aggregate outcomes for (§10.2). */
export async function funderOrgIds(funderId: string): Promise<string[]> {
  const rows = await db
    .select({ organisationId: funderScopesTable.organisationId })
    .from(funderScopesTable)
    .where(eq(funderScopesTable.funderId, funderId));
  return [...new Set(rows.map((r) => r.organisationId))];
}

/**
 * Total coaching hours logged for an organisation (§10.3) — summed across every attendance
 * record whose delivery session belongs to that org. Used by facilitator reporting and by
 * the funder report's aggregate coaching-hour total.
 */
export async function orgCoachingHours(orgId: string): Promise<number> {
  const rows = await db
    .select({ h: attendanceRecordsTable.coachingHours })
    .from(attendanceRecordsTable)
    .innerJoin(deliverySessionsTable, eq(attendanceRecordsTable.sessionId, deliverySessionsTable.id))
    .where(eq(deliverySessionsTable.tenantId, orgId));
  return rows.reduce((sum, r) => sum + (r.h ? Number(r.h) : 0), 0);
}

/** Group (section) ids this user leads. */
export async function leaderGroupIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ groupId: courseGroupMembersTable.groupId })
    .from(courseGroupMembersTable)
    .where(and(eq(courseGroupMembersTable.userId, userId), eq(courseGroupMembersTable.role, "leader")));
  return new Set(rows.map((r) => r.groupId));
}

/** Course ids in which this user leads at least one section. */
export async function leaderCourseIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ courseId: courseGroupsTable.courseId })
    .from(courseGroupMembersTable)
    .innerJoin(courseGroupsTable, eq(courseGroupMembersTable.groupId, courseGroupsTable.id))
    .where(and(eq(courseGroupMembersTable.userId, userId), eq(courseGroupMembersTable.role, "leader")));
  return new Set(rows.map((r) => r.courseId));
}

/** Does this Co-facilitator lead any section of `courseId`? */
export async function leadsCourse(userId: string, courseId: string): Promise<boolean> {
  return (await leaderCourseIds(userId)).has(courseId);
}

/**
 * Is this platform-owned course assigned to the given partner? Courses belong to the super
 * admin and are handed to partners by assignment; a partner's admins/coaches may act on the
 * courses assigned to their partner. Swallows a missing table (pre-setup) as "no".
 */
export async function courseAssignedToPartner(courseId: string, partnerId: string): Promise<boolean> {
  try {
    const row = await db.query.coursePartnerAssignmentsTable.findFirst({
      where: and(
        eq(coursePartnerAssignmentsTable.courseId, courseId),
        eq(coursePartnerAssignmentsTable.partnerId, partnerId),
      ),
    });
    return !!row;
  } catch {
    return false;
  }
}

/** Does this Co-facilitator lead this specific section (group)? */
export async function leadsGroup(userId: string, groupId: string): Promise<boolean> {
  const row = await db.query.courseGroupMembersTable.findFirst({
    where: and(
      eq(courseGroupMembersTable.userId, userId),
      eq(courseGroupMembersTable.groupId, groupId),
      eq(courseGroupMembersTable.role, "leader"),
    ),
  });
  return !!row;
}

/** Learner ids that are members of the sections this Co-facilitator leads. */
export async function learnerIdsForCoFacilitator(coachId: string): Promise<string[]> {
  const groupIds = [...(await leaderGroupIds(coachId))];
  if (groupIds.length === 0) return [];
  const rows = await db
    .select({ userId: courseGroupMembersTable.userId })
    .from(courseGroupMembersTable)
    .where(and(inArray(courseGroupMembersTable.groupId, groupIds), eq(courseGroupMembersTable.role, "member")));
  return rows.map((r) => r.userId);
}

/**
 * Does this Co-facilitator lead a section OF THIS COURSE that contains `learnerId`?
 * Stricter than leadsCourse: the learner must actually be in one of the coach's sections
 * for that course (used to scope grading, decision §4.3).
 */
export async function coFacLeadsLearnerInCourse(
  coachId: string,
  learnerId: string,
  courseId: string,
): Promise<boolean> {
  const led = await db
    .select({ groupId: courseGroupsTable.id })
    .from(courseGroupMembersTable)
    .innerJoin(courseGroupsTable, eq(courseGroupMembersTable.groupId, courseGroupsTable.id))
    .where(
      and(
        eq(courseGroupMembersTable.userId, coachId),
        eq(courseGroupMembersTable.role, "leader"),
        eq(courseGroupsTable.courseId, courseId),
      ),
    );
  const ledGroupIds = led.map((r) => r.groupId);
  if (ledGroupIds.length === 0) return false;
  const member = await db.query.courseGroupMembersTable.findFirst({
    where: and(inArray(courseGroupMembersTable.groupId, ledGroupIds), eq(courseGroupMembersTable.userId, learnerId)),
  });
  return !!member;
}

/**
 * Course-level staff access (decision §4.3): Super Admin anywhere; a Facilitator if their
 * org owns the course; a Co-facilitator if they lead a section of it. Used for moderation.
 */
export async function canStaffActOnCourse(user: StaffUser, courseId: string): Promise<boolean> {
  if (isSuperAdmin(user.role)) return true;
  // Hub roles (Instructional Designers) are cross-organisation content authors -- the
  // catalogue is listed to them and the authoring routes' requireRole lists include them.
  // Omitting them here 403s the ID tier out of the entire authoring surface it is meant to
  // own, which is a hard lockout, so they are granted the same course-staff access as an
  // admin. (Found in review before shipping, not in production.)
  if (hasHubAccess(user.role)) return true;
  const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, courseId) });
  if (!course) return false;
  if (canAdministerOrg(user.role) && canAccessCourse(user, course)) return true;
  // Platform-owned course assigned to this admin/coach's partner -> they may deliver it.
  if ((canAdministerOrg(user.role) || isCoFacilitator(user.role)) && user.partnerId &&
      (await courseAssignedToPartner(courseId, user.partnerId))) return true;
  if (isCoFacilitator(user.role)) return leadsCourse(user.id, courseId);
  return false;
}

/**
 * Is this user actually ON this course as a learner?
 *
 * The counterpart to canStaffActOnCourse: that answers "may this person act on the course",
 * this answers "does this course belong to this learner at all". Deliberately checks the
 * enrolment row and nothing else -- being in the same organisation is not enrolment, and
 * treating it as such is how a learner ends up submitting work to a course they never took.
 */
export async function isEnrolledInCourse(userId: string, courseId: string): Promise<boolean> {
  const row = await db.query.enrolmentsTable.findFirst({
    where: and(eq(enrolmentsTable.userId, userId), eq(enrolmentsTable.courseId, courseId)),
  });
  if (!row) return false;
  // A row is not enough: the status matters. active = in the course now; completed = finished
  // it and may still review. withdrawn and waitlisted must NOT count -- a withdrawn learner
  // recording beat progress would inject fictional hours into the SETA/B-BBEE training-hours
  // return, and a waitlisted one is not in the course yet. This was flagged in review: the
  // first version accepted any row regardless of status.
  return row.status === "active" || row.status === "completed";
}

/**
 * May this user take part in this course's coursework -- submit, post, answer?
 *
 * Staff pass because they legitimately need to see and test what they deliver. Everyone else
 * must be enrolled. Use this on any route where a LEARNER acts on course content, as opposed
 * to canStaffActOnCourse which gates authoring and moderation.
 */
export async function canParticipateInCourse(user: StaffUser, courseId: string): Promise<boolean> {
  if (await canStaffActOnCourse(user, courseId)) return true;
  return isEnrolledInCourse(user.id, courseId);
}

/**
 * May this user VIEW a course in the catalogue (its overview + module list), even before enrolling?
 * Broader than participation: a learner browsing the catalogue can see any course their tenant owns
 * or that is assigned to their partner, plus platform courses. This gates read-only catalogue
 * surfaces (course detail, module titles) — NOT coursework or content (beats/readings/cases stay on
 * canParticipateInCourse). Without this, browsing an unenrolled course 403'd and the UI hung.
 */
export async function canViewCourseCatalog(user: StaffUser, courseId: string): Promise<boolean> {
  if (await canParticipateInCourse(user, courseId)) return true;
  if (hasHubAccess(String((user as ScopedUser).role))) return true;
  const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, courseId) });
  if (!course) return false;
  const scope = user.partnerId ?? user.organisationId ?? user.id;
  if (course.tenantId === scope || course.tenantId === "platform") return true;
  if (user.partnerId) {
    try {
      const a = await db
        .select({ courseId: coursePartnerAssignmentsTable.courseId })
        .from(coursePartnerAssignmentsTable)
        .where(and(eq(coursePartnerAssignmentsTable.partnerId, user.partnerId), eq(coursePartnerAssignmentsTable.courseId, courseId)))
        .limit(1);
      if (a.length) return true;
    } catch { /* assignment table absent -> no extra visibility */ }
  }
  return false;
}

/**
 * Grading access (decision §4.3): as course-level staff access, but a Co-facilitator is
 * further narrowed to learners in the section(s) they lead for that course.
 */
export async function canGradeInCourse(user: StaffUser, courseId: string, learnerId: string): Promise<boolean> {
  if (isSuperAdmin(user.role)) return true;
  const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, courseId) });
  if (!course) return false;
  if (canAdministerOrg(user.role) && canAccessCourse(user, course)) return true;
  if (isCoFacilitator(user.role)) return coFacLeadsLearnerInCourse(user.id, learnerId, courseId);
  return false;
}
