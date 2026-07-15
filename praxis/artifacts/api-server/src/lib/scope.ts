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
import { courseGroupsTable, courseGroupMembersTable, coursesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  isSuperAdmin,
  isCoFacilitator,
  canAdministerOrg,
  canAccessCourse,
  type ScopedUser,
} from "./roles";

/** A user identity that can be scope-checked against courses/sections. */
export type StaffUser = ScopedUser & { id: string };

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
  const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, courseId) });
  if (!course) return false;
  if (canAdministerOrg(user.role) && canAccessCourse(user, course)) return true;
  if (isCoFacilitator(user.role)) return leadsCourse(user.id, courseId);
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
