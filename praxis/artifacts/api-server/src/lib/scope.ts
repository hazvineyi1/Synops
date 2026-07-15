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
import { courseGroupsTable, courseGroupMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

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
