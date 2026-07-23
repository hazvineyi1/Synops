import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, coursesTable, modulesTable } from "@workspace/db";
import { and, eq, isNull, ne, sql, inArray, count } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";

/**
 * Environment Cleanup: a reviewable, soft-delete tool for separating QA/test
 * data from production. It NEVER hard-deletes - users are soft-deleted (deletedAt)
 * and courses are archived (status), both reversible - and every action is
 * written to the audit trail. Super admin only.
 *
 * Detection is heuristic and conservative (obvious QA/test markers only), and
 * nothing is removed automatically: an admin reviews the candidates and chooses
 * what to soft-delete.
 */
const router = Router();

// QA/test markers for accounts. Case-insensitive, matched against email and name.
const USER_PATTERNS = [
  "qa-%",
  "%qa-pooltest%",
  "%@test.test",
  "funder.qa%",
  "hazvi01@gmail.com",
];
const NAME_PATTERNS = ["zz review", "qa smoke", "test account"];

/** GET /platform/cleanup/candidates - QA/test data proposed for cleanup. */
router.get("/platform/cleanup/candidates", requireAuth, requireSuperAdmin, async (_req, res) => {
  // Users: match any QA email pattern or QA name, still active (not already soft-deleted).
  const emailCond = USER_PATTERNS.map((p) => sql`lower(${usersTable.email}) like ${p}`);
  const nameExpr = sql`lower(coalesce(${usersTable.firstName}, '') || ' ' || coalesce(${usersTable.lastName}, ''))`;
  const nameCond = NAME_PATTERNS.map((p) => sql`${nameExpr} like ${"%" + p + "%"}`);
  const userRows = await db
    .select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(and(isNull(usersTable.deletedAt), sql`(${sql.join([...emailCond, ...nameCond], sql` or `)})`));

  const users = userRows.map((u) => ({
    id: u.id,
    label: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
    detail: u.email,
    reason: "Matches a QA/test account pattern",
  }));

  // Courses: duplicates ("Copy of ...") or empty (no modules), not already archived.
  const activeCourses = await db
    .select({ id: coursesTable.id, title: coursesTable.title, status: coursesTable.status })
    .from(coursesTable)
    .where(ne(coursesTable.status, "archived"));
  const moduleCounts = await db
    .select({ courseId: modulesTable.courseId, n: count() })
    .from(modulesTable)
    .groupBy(modulesTable.courseId);
  const countByCourse = new Map(moduleCounts.map((m) => [m.courseId, Number(m.n)]));
  const courses = activeCourses
    .map((c) => {
      const isCopy = /^copy of /i.test(c.title);
      const isTest = /\btest\b/i.test(c.title);
      // Only flag empties that are still drafts - a published course with content
      // is real; we never want to surface a live course as "junk".
      const isEmpty = c.status === "draft" && (countByCourse.get(c.id) ?? 0) === 0;
      if (!isCopy && !isTest && !isEmpty) return null;
      const reasons = [isCopy && "duplicate (Copy of ...)", isTest && "test course", isEmpty && "no modules (empty)"].filter(Boolean);
      return { id: c.id, label: c.title, detail: `${countByCourse.get(c.id) ?? 0} modules`, reason: reasons.join("; ") };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  res.json({ users, courses });
});

/** POST /platform/cleanup/soft-delete { users?: string[], courses?: string[] } */
router.post("/platform/cleanup/soft-delete", requireAuth, requireSuperAdmin, async (req, res) => {
  const userIds = Array.isArray(req.body?.users) ? (req.body.users as unknown[]).filter((v): v is string => typeof v === "string") : [];
  const courseIds = Array.isArray(req.body?.courses) ? (req.body.courses as unknown[]).filter((v): v is string => typeof v === "string") : [];
  let usersDeleted = 0;
  let coursesArchived = 0;

  if (userIds.length) {
    // Never touch a super_admin via this tool, as a guard against self-lockout.
    const done = await db
      .update(usersTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(inArray(usersTable.id, userIds), isNull(usersTable.deletedAt), ne(usersTable.role, "super_admin")))
      .returning({ id: usersTable.id });
    usersDeleted = done.length;
    for (const u of done) await logAudit(req, "cleanup.soft_delete", "user", u.id, {});
  }
  if (courseIds.length) {
    const done = await db
      .update(coursesTable)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(inArray(coursesTable.id, courseIds), ne(coursesTable.status, "archived")))
      .returning({ id: coursesTable.id });
    coursesArchived = done.length;
    for (const c of done) await logAudit(req, "cleanup.archive", "course", c.id, {});
  }
  res.json({ usersDeleted, coursesArchived });
});

/** POST /platform/cleanup/restore { users?: string[], courses?: string[] } - reverse a cleanup. */
router.post("/platform/cleanup/restore", requireAuth, requireSuperAdmin, async (req, res) => {
  const userIds = Array.isArray(req.body?.users) ? (req.body.users as unknown[]).filter((v): v is string => typeof v === "string") : [];
  const courseIds = Array.isArray(req.body?.courses) ? (req.body.courses as unknown[]).filter((v): v is string => typeof v === "string") : [];
  let usersRestored = 0;
  let coursesRestored = 0;
  if (userIds.length) {
    const done = await db.update(usersTable).set({ deletedAt: null, updatedAt: new Date() }).where(inArray(usersTable.id, userIds)).returning({ id: usersTable.id });
    usersRestored = done.length;
    for (const u of done) await logAudit(req, "cleanup.restore", "user", u.id, {});
  }
  if (courseIds.length) {
    const done = await db.update(coursesTable).set({ status: "draft", updatedAt: new Date() }).where(inArray(coursesTable.id, courseIds)).returning({ id: coursesTable.id });
    coursesRestored = done.length;
    for (const c of done) await logAudit(req, "cleanup.restore", "course", c.id, {});
  }
  res.json({ usersRestored, coursesRestored });
});

export default router;
