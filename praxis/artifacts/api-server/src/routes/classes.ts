import { Router } from "express";
import { db } from "@workspace/db";
import {
  orgClassesTable, orgClassLearnersTable, orgClassCoursesTable, orgClassStaffTable,
  organisationsTable, enrolmentsTable, usersTable, coursesTable,
} from "@workspace/db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { isSuperAdmin } from "../lib/roles";
import { logAudit } from "../lib/audit";
import { orgCourseIds, aggregateOrgCourses } from "../lib/orgCourseAgg";

/**
 * Organisation classes (cohorts) — real, persistent. Access: super admin, the org's partner_admin,
 * or an admin of the org itself. Self-creates the tables. Bulk PUT endpoints replace a class's
 * whole learner/course/staff set (so the UI can save a multi-select in one call), and an enrol
 * endpoint materialises real enrolments for every class learner x class course.
 */
const router = Router();

async function ensureTables() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS org_classes (id text PRIMARY KEY, org_id text NOT NULL, partner_id text, name text NOT NULL, created_by text, created_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS org_class_learners (id text PRIMARY KEY, class_id text NOT NULL, learner_id text NOT NULL)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS org_class_courses (id text PRIMARY KEY, class_id text NOT NULL, course_id text NOT NULL)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS org_class_staff (id text PRIMARY KEY, class_id text NOT NULL, staff_id text NOT NULL, role text NOT NULL DEFAULT 'facilitator')`);
}

type U = { role: string; partnerId?: string | null; organisationId?: string | null };
async function orgFor(orgId: string) {
  return db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, orgId) });
}
function canAccessOrg(user: U, org: { id: string; partnerId: string | null } | null | undefined) {
  if (!org) return false;
  return isSuperAdmin(user.role) || (!!user.partnerId && user.partnerId === org.partnerId) || (!!user.organisationId && user.organisationId === org.id);
}
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))] : [];

// GET /organisations/:orgId/classes — class list with counts.
router.get("/organisations/:orgId/classes", requireAuth, async (req, res) => {
  const { orgId } = req.params;
  const org = await orgFor(orgId);
  if (!canAccessOrg(req.dbUser!, org)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const classes = await db.select().from(orgClassesTable).where(eq(orgClassesTable.orgId, orgId)).orderBy(desc(orgClassesTable.createdAt));
    const ids = classes.map((c) => c.id);
    const [learners, courses, staff] = ids.length
      ? await Promise.all([
          db.select({ classId: orgClassLearnersTable.classId }).from(orgClassLearnersTable).where(inArray(orgClassLearnersTable.classId, ids)),
          db.select({ classId: orgClassCoursesTable.classId, courseId: orgClassCoursesTable.courseId }).from(orgClassCoursesTable).where(inArray(orgClassCoursesTable.classId, ids)),
          db.select({ classId: orgClassStaffTable.classId }).from(orgClassStaffTable).where(inArray(orgClassStaffTable.classId, ids)),
        ])
      : [[], [], []];
    const countBy = (rows: { classId: string }[]) => rows.reduce<Record<string, number>>((m, r) => { m[r.classId] = (m[r.classId] ?? 0) + 1; return m; }, {});
    // Course IDs per class, so the org courses table can show which classes a course sits in.
    const courseIdsBy = (courses as { classId: string; courseId: string }[]).reduce<Record<string, string[]>>((m, r) => { (m[r.classId] ??= []).push(r.courseId); return m; }, {});
    const lc = countBy(learners), cc = countBy(courses), sc = countBy(staff);
    res.json(classes.map((c) => ({ id: c.id, name: c.name, createdAt: c.createdAt.toISOString(), learnerCount: lc[c.id] ?? 0, courseCount: cc[c.id] ?? 0, courseIds: courseIdsBy[c.id] ?? [], staffCount: sc[c.id] ?? 0 })));
  } catch {
    res.json([]);
  }
});

// POST /organisations/:orgId/classes { name }
router.post("/organisations/:orgId/classes", requireAuth, async (req, res) => {
  const { orgId } = req.params;
  const org = await orgFor(orgId);
  if (!canAccessOrg(req.dbUser!, org)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!req.body?.name || !String(req.body.name).trim()) { res.status(400).json({ error: "A class name is required." }); return; }
  await ensureTables();
  const [row] = await db.insert(orgClassesTable).values({ orgId, partnerId: org!.partnerId, name: String(req.body.name).trim(), createdBy: req.dbUser!.id }).returning();
  await logAudit(req, "class.create", "org_class", row.id, { name: row.name, orgId });
  res.status(201).json({ id: row.id, name: row.name });
});

async function classWithOrg(classId: string) {
  const cls = await db.query.orgClassesTable.findFirst({ where: eq(orgClassesTable.id, classId) });
  if (!cls) return { cls: null, org: null };
  const org = await orgFor(cls.orgId);
  return { cls, org };
}

// GET /organisations/:orgId/courses — the org's REAL courses, replacing the old synthetic list.
// A course counts as "in the org" if it is attached to one of the org's classes OR an org member is
// enrolled in it. Enrolled counts and completion-based progress are computed from real enrolments.
router.get("/organisations/:orgId/courses", requireAuth, async (req, res) => {
  const { orgId } = req.params;
  const org = await orgFor(orgId);
  if (!canAccessOrg(req.dbUser!, org)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const members = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.organisationId, orgId));
    const memberIds = members.map((m) => m.id);
    const classes = await db.select({ id: orgClassesTable.id }).from(orgClassesTable).where(eq(orgClassesTable.orgId, orgId));
    const classIds = classes.map((c) => c.id);
    const classCourseRows = classIds.length
      ? await db.select({ courseId: orgClassCoursesTable.courseId }).from(orgClassCoursesTable).where(inArray(orgClassCoursesTable.classId, classIds))
      : [];
    const enrolRows = memberIds.length
      ? await db.select({ courseId: enrolmentsTable.courseId, status: enrolmentsTable.status, completedAt: enrolmentsTable.completedAt }).from(enrolmentsTable).where(inArray(enrolmentsTable.userId, memberIds))
      : [];
    const courseIds = orgCourseIds(classCourseRows, enrolRows);
    if (!courseIds.length) { res.json([]); return; }
    const courseRows = await db.select({ id: coursesTable.id, title: coursesTable.title, status: coursesTable.status }).from(coursesTable).where(inArray(coursesTable.id, courseIds));
    res.json(aggregateOrgCourses(courseRows, enrolRows));
  } catch {
    res.json([]);
  }
});

// GET /classes/:classId — detail.
router.get("/classes/:classId", requireAuth, async (req, res) => {
  const { cls, org } = await classWithOrg(req.params.classId);
  if (!cls || !canAccessOrg(req.dbUser!, org)) { res.status(cls ? 403 : 404).json({ error: cls ? "Forbidden" : "Not found" }); return; }
  const [learners, courses, staff] = await Promise.all([
    db.select({ v: orgClassLearnersTable.learnerId }).from(orgClassLearnersTable).where(eq(orgClassLearnersTable.classId, cls.id)),
    db.select({ v: orgClassCoursesTable.courseId }).from(orgClassCoursesTable).where(eq(orgClassCoursesTable.classId, cls.id)),
    db.select({ staffId: orgClassStaffTable.staffId, role: orgClassStaffTable.role }).from(orgClassStaffTable).where(eq(orgClassStaffTable.classId, cls.id)),
  ]);
  res.json({ id: cls.id, orgId: cls.orgId, name: cls.name, learnerIds: learners.map((r) => r.v), courseIds: courses.map((r) => r.v), staff });
});

router.patch("/classes/:classId", requireAuth, async (req, res) => {
  const { cls, org } = await classWithOrg(req.params.classId);
  if (!cls || !canAccessOrg(req.dbUser!, org)) { res.status(cls ? 403 : 404).json({ error: cls ? "Forbidden" : "Not found" }); return; }
  const name = req.body?.name ? String(req.body.name).trim() : "";
  if (!name) { res.status(400).json({ error: "A class name is required." }); return; }
  await db.update(orgClassesTable).set({ name }).where(eq(orgClassesTable.id, cls.id));
  res.json({ id: cls.id, name });
});

router.delete("/classes/:classId", requireAuth, async (req, res) => {
  const { cls, org } = await classWithOrg(req.params.classId);
  if (!cls || !canAccessOrg(req.dbUser!, org)) { res.status(cls ? 403 : 404).json({ error: cls ? "Forbidden" : "Not found" }); return; }
  await Promise.all([
    db.delete(orgClassLearnersTable).where(eq(orgClassLearnersTable.classId, cls.id)),
    db.delete(orgClassCoursesTable).where(eq(orgClassCoursesTable.classId, cls.id)),
    db.delete(orgClassStaffTable).where(eq(orgClassStaffTable.classId, cls.id)),
  ]);
  await db.delete(orgClassesTable).where(eq(orgClassesTable.id, cls.id));
  await logAudit(req, "class.delete", "org_class", cls.id);
  res.status(204).send();
});

// PUT /classes/:classId/learners { learnerIds } — replace the roster.
router.put("/classes/:classId/learners", requireAuth, async (req, res) => {
  const { cls, org } = await classWithOrg(req.params.classId);
  if (!cls || !canAccessOrg(req.dbUser!, org)) { res.status(cls ? 403 : 404).json({ error: cls ? "Forbidden" : "Not found" }); return; }
  const learnerIds = strArr(req.body?.learnerIds);
  await db.delete(orgClassLearnersTable).where(eq(orgClassLearnersTable.classId, cls.id));
  if (learnerIds.length) await db.insert(orgClassLearnersTable).values(learnerIds.map((learnerId) => ({ classId: cls.id, learnerId })));
  res.json({ learnerIds });
});

// PUT /classes/:classId/courses { courseIds } — replace the assigned courses.
router.put("/classes/:classId/courses", requireAuth, async (req, res) => {
  const { cls, org } = await classWithOrg(req.params.classId);
  if (!cls || !canAccessOrg(req.dbUser!, org)) { res.status(cls ? 403 : 404).json({ error: cls ? "Forbidden" : "Not found" }); return; }
  const courseIds = strArr(req.body?.courseIds);
  await db.delete(orgClassCoursesTable).where(eq(orgClassCoursesTable.classId, cls.id));
  if (courseIds.length) await db.insert(orgClassCoursesTable).values(courseIds.map((courseId) => ({ classId: cls.id, courseId })));
  res.json({ courseIds });
});

// PUT /classes/:classId/staff { staff: [{staffId, role}] } — replace staff assignments.
router.put("/classes/:classId/staff", requireAuth, async (req, res) => {
  const { cls, org } = await classWithOrg(req.params.classId);
  if (!cls || !canAccessOrg(req.dbUser!, org)) { res.status(cls ? 403 : 404).json({ error: cls ? "Forbidden" : "Not found" }); return; }
  const raw = Array.isArray(req.body?.staff) ? req.body.staff : [];
  const staff = raw
    .filter((s: any) => s && typeof s.staffId === "string" && typeof s.role === "string")
    .map((s: any) => ({ classId: cls.id, staffId: String(s.staffId), role: String(s.role) }));
  await db.delete(orgClassStaffTable).where(eq(orgClassStaffTable.classId, cls.id));
  if (staff.length) await db.insert(orgClassStaffTable).values(staff);
  res.json({ staff: staff.map(({ staffId, role }: { staffId: string; role: string }) => ({ staffId, role })) });
});

// POST /classes/:classId/enrol — materialise real enrolments for every learner x course in the class.
router.post("/classes/:classId/enrol", requireAuth, async (req, res) => {
  const { cls, org } = await classWithOrg(req.params.classId);
  if (!cls || !canAccessOrg(req.dbUser!, org)) { res.status(cls ? 403 : 404).json({ error: cls ? "Forbidden" : "Not found" }); return; }
  const [learners, courses] = await Promise.all([
    db.select({ v: orgClassLearnersTable.learnerId }).from(orgClassLearnersTable).where(eq(orgClassLearnersTable.classId, cls.id)),
    db.select({ v: orgClassCoursesTable.courseId }).from(orgClassCoursesTable).where(eq(orgClassCoursesTable.classId, cls.id)),
  ]);
  const learnerIds = learners.map((r) => r.v), courseIds = courses.map((r) => r.v);
  if (!learnerIds.length || !courseIds.length) { res.json({ enrolled: 0, message: "Add learners and courses first." }); return; }
  const existing = await db.select({ userId: enrolmentsTable.userId, courseId: enrolmentsTable.courseId }).from(enrolmentsTable).where(inArray(enrolmentsTable.courseId, courseIds));
  const has = new Set(existing.map((e) => `${e.userId}::${e.courseId}`));
  const toInsert: { userId: string; courseId: string }[] = [];
  for (const userId of learnerIds) for (const courseId of courseIds) if (!has.has(`${userId}::${courseId}`)) toInsert.push({ userId, courseId });
  if (toInsert.length) await db.insert(enrolmentsTable).values(toInsert);
  await logAudit(req, "class.enrol", "org_class", cls.id, { enrolled: toInsert.length });
  res.json({ enrolled: toInsert.length });
});

export default router;
