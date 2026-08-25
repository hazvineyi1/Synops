import { Router } from "express";
import { db } from "@workspace/db";
import {
  orgClassesTable, orgClassLearnersTable, orgClassCoursesTable, orgClassStaffTable,
  organisationsTable, enrolmentsTable, usersTable, coursesTable, coursePartnerAssignmentsTable,
} from "@workspace/db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { isSuperAdmin } from "../lib/roles";
import { logAudit } from "../lib/audit";
import { orgCourseIds, aggregateOrgCourses } from "../lib/orgCourseAgg";
import { computeClassInsights } from "../lib/classInsights";

/**
 * Organisation classes (cohorts), real, persistent. Access: super admin, the org's partner_admin,
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
  // Partner -> organisation course allocation (the middle hop). A course the super admin gave the
  // partner is only available to an organisation once the partner allocates it here.
  await db.execute(sql`CREATE TABLE IF NOT EXISTS org_course_assignments (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, org_id text NOT NULL, course_id text NOT NULL, partner_id text, assigned_by text, assigned_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS org_course_assignments_org_course_uidx ON org_course_assignments (org_id, course_id)`);
}

/** Course ids the super admin has assigned to this partner (the pool a partner may allocate to its orgs). */
async function partnerCourseIdSet(partnerId: string): Promise<Set<string>> {
  try {
    const rows = await db.select({ courseId: coursePartnerAssignmentsTable.courseId }).from(coursePartnerAssignmentsTable).where(eq(coursePartnerAssignmentsTable.partnerId, partnerId));
    return new Set(rows.map((r) => r.courseId));
  } catch { return new Set(); }
}

/**
 * Per-partner opt-in gating. A partner uses org-level allocation as soon as it has ANY
 * org_course_assignments row; until then every partner behaves exactly as before (no gating), so
 * existing partners are untouched. Once opted in, an org may only run courses allocated to it.
 */
async function partnerUsesOrgGating(partnerId: string | null | undefined): Promise<boolean> {
  if (!partnerId) return false;
  try {
    const r = (await db.execute(sql`SELECT 1 FROM org_course_assignments WHERE partner_id = ${partnerId} LIMIT 1`)).rows;
    return r.length > 0;
  } catch { return false; }
}

/** Course ids allocated to a specific org. */
async function orgAllocatedCourseIdSet(orgId: string): Promise<Set<string>> {
  try {
    const rows = (await db.execute(sql`SELECT course_id FROM org_course_assignments WHERE org_id = ${orgId}`)).rows as { course_id: string }[];
    return new Set(rows.map((r) => r.course_id));
  } catch { return new Set(); }
}

/**
 * The ONLY courses a class in this org may carry. A class must never be able to run a course the
 * platform never gave the partner — otherwise (as happened) an Enza-only course showed up in every
 * partner's class picker. If the partner uses org-level allocation, the pool is what's allocated to the
 * org; otherwise it's everything the partner has received. Never the whole platform catalogue.
 */
async function classCoursePool(partnerId: string | null | undefined, orgId: string): Promise<Set<string>> {
  if (await partnerUsesOrgGating(partnerId)) return orgAllocatedCourseIdSet(orgId);
  return partnerCourseIdSet(partnerId ?? "");
}

type U = { role: string; partnerId?: string | null; organisationId?: string | null };
async function orgFor(orgId: string) {
  return db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, orgId) });
}
function canAccessOrg(user: U, org: { id: string; partnerId: string | null } | null | undefined) {
  if (!org) return false;
  return isSuperAdmin(user.role) || (!!user.partnerId && user.partnerId === org.partnerId) || (!!user.organisationId && user.organisationId === org.id);
}
// Assigning courses, managing class rosters and materialising enrolments are ADMIN actions.
// canAccessOrg (above) is true for ANY member of the org, including a learner, so the MUTATION
// endpoints gate on this stricter check - a learner can browse but can never assign or enrol.
const ORG_ADMIN_ROLES = new Set<string>(["org_admin", "partner_admin", "super_admin"]);
function canAdminOrg(user: U, org: { id: string; partnerId: string | null } | null | undefined) {
  return canAccessOrg(user, org) && ORG_ADMIN_ROLES.has(user.role);
}
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))] : [];

// GET /organisations/:orgId/classes, class list with counts.
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
  if (!canAdminOrg(req.dbUser!, org)) { res.status(403).json({ error: "Forbidden" }); return; }
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

// GET /organisations/:orgId/courses, the org's REAL courses, replacing the old synthetic list.
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

// GET /classes/:classId, detail.
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

// GET /my-classes, the classes the caller can see (for the teacher insight dashboard picker).
router.get("/my-classes", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  try {
    await ensureTables();
    let classes: { id: string; name: string; orgId: string }[] = [];
    if (isSuperAdmin(u.role)) {
      classes = await db.select({ id: orgClassesTable.id, name: orgClassesTable.name, orgId: orgClassesTable.orgId }).from(orgClassesTable).orderBy(desc(orgClassesTable.createdAt)).limit(300);
    } else if (u.role === "coach") {
      const staffRows = await db.select({ classId: orgClassStaffTable.classId }).from(orgClassStaffTable).where(eq(orgClassStaffTable.staffId, u.id));
      const ids = [...new Set(staffRows.map((r) => r.classId))];
      classes = ids.length ? await db.select({ id: orgClassesTable.id, name: orgClassesTable.name, orgId: orgClassesTable.orgId }).from(orgClassesTable).where(inArray(orgClassesTable.id, ids)) : [];
    } else if (u.partnerId) {
      classes = await db.select({ id: orgClassesTable.id, name: orgClassesTable.name, orgId: orgClassesTable.orgId }).from(orgClassesTable).where(eq(orgClassesTable.partnerId, u.partnerId)).orderBy(desc(orgClassesTable.createdAt));
    } else if (u.organisationId) {
      classes = await db.select({ id: orgClassesTable.id, name: orgClassesTable.name, orgId: orgClassesTable.orgId }).from(orgClassesTable).where(eq(orgClassesTable.orgId, u.organisationId)).orderBy(desc(orgClassesTable.createdAt));
    }
    const ids = classes.map((c) => c.id);
    const lc = ids.length ? await db.select({ classId: orgClassLearnersTable.classId }).from(orgClassLearnersTable).where(inArray(orgClassLearnersTable.classId, ids)) : [];
    const count = lc.reduce<Record<string, number>>((m, r) => { m[r.classId] = (m[r.classId] ?? 0) + 1; return m; }, {});
    res.json(classes.map((c) => ({ id: c.id, name: c.name, orgId: c.orgId, learnerCount: count[c.id] ?? 0 })));
  } catch {
    res.json([]);
  }
});

// GET /classes/:classId/insights, aggregated per-learner + class-level stats for the teacher dashboard.
router.get("/classes/:classId/insights", requireAuth, async (req, res) => {
  const { cls, org } = await classWithOrg(req.params.classId);
  if (!cls) { res.status(404).json({ error: "Not found" }); return; }
  let allowed = canAccessOrg(req.dbUser!, org);
  if (!allowed) {
    const staff = await db.select({ id: orgClassStaffTable.id }).from(orgClassStaffTable).where(and(eq(orgClassStaffTable.classId, cls.id), eq(orgClassStaffTable.staffId, req.dbUser!.id)));
    allowed = staff.length > 0;
  }
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const insights = await computeClassInsights(cls.id);
    res.json({ ...insights, className: cls.name });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load insights" });
  }
});

router.patch("/classes/:classId", requireAuth, async (req, res) => {
  const { cls, org } = await classWithOrg(req.params.classId);
  if (!cls || !canAdminOrg(req.dbUser!, org)) { res.status(cls ? 403 : 404).json({ error: cls ? "Forbidden" : "Not found" }); return; }
  const name = req.body?.name ? String(req.body.name).trim() : "";
  if (!name) { res.status(400).json({ error: "A class name is required." }); return; }
  await db.update(orgClassesTable).set({ name }).where(eq(orgClassesTable.id, cls.id));
  res.json({ id: cls.id, name });
});

router.delete("/classes/:classId", requireAuth, async (req, res) => {
  const { cls, org } = await classWithOrg(req.params.classId);
  if (!cls || !canAdminOrg(req.dbUser!, org)) { res.status(cls ? 403 : 404).json({ error: cls ? "Forbidden" : "Not found" }); return; }
  await Promise.all([
    db.delete(orgClassLearnersTable).where(eq(orgClassLearnersTable.classId, cls.id)),
    db.delete(orgClassCoursesTable).where(eq(orgClassCoursesTable.classId, cls.id)),
    db.delete(orgClassStaffTable).where(eq(orgClassStaffTable.classId, cls.id)),
  ]);
  await db.delete(orgClassesTable).where(eq(orgClassesTable.id, cls.id));
  await logAudit(req, "class.delete", "org_class", cls.id);
  res.status(204).send();
});

// PUT /classes/:classId/learners { learnerIds }, replace the roster.
router.put("/classes/:classId/learners", requireAuth, async (req, res) => {
  const { cls, org } = await classWithOrg(req.params.classId);
  if (!cls || !canAdminOrg(req.dbUser!, org)) { res.status(cls ? 403 : 404).json({ error: cls ? "Forbidden" : "Not found" }); return; }
  const learnerIds = strArr(req.body?.learnerIds);
  await db.delete(orgClassLearnersTable).where(eq(orgClassLearnersTable.classId, cls.id));
  if (learnerIds.length) await db.insert(orgClassLearnersTable).values(learnerIds.map((learnerId) => ({ classId: cls.id, learnerId })));
  res.json({ learnerIds });
});

// PUT /classes/:classId/courses { courseIds }, replace the assigned courses. Once the partner uses
// org-level allocation, a class may only carry courses allocated to its organisation (true gating).
router.put("/classes/:classId/courses", requireAuth, async (req, res) => {
  const { cls, org } = await classWithOrg(req.params.classId);
  if (!cls || !canAdminOrg(req.dbUser!, org)) { res.status(cls ? 403 : 404).json({ error: cls ? "Forbidden" : "Not found" }); return; }
  let courseIds = strArr(req.body?.courseIds);
  // Always scope to the partner's pool (received courses, or org-allocated when org-gating is on). This
  // is the fix for courses leaking across partners: a class can never carry a course its partner lacks.
  const pool = await classCoursePool(org!.partnerId, cls.orgId);
  const blocked = courseIds.filter((id) => !pool.has(id));
  if (blocked.length) { res.status(403).json({ error: "Some courses are not available to this organisation. They must be assigned to the partner (and allocated to the organisation) first." }); return; }
  courseIds = courseIds.filter((id) => pool.has(id));
  await db.delete(orgClassCoursesTable).where(eq(orgClassCoursesTable.classId, cls.id));
  if (courseIds.length) await db.insert(orgClassCoursesTable).values(courseIds.map((courseId) => ({ classId: cls.id, courseId })));
  res.json({ courseIds });
});

// GET /classes/:classId/assignable-courses -- the pool a class may pick from (partner's received / org-
// allocated courses only). Powers the class course picker so it never lists the whole catalogue.
router.get("/classes/:classId/assignable-courses", requireAuth, async (req, res) => {
  const { cls, org } = await classWithOrg(req.params.classId);
  if (!cls || !canAccessOrg(req.dbUser!, org)) { res.status(cls ? 403 : 404).json({ error: cls ? "Forbidden" : "Not found" }); return; }
  const pool = await classCoursePool(org!.partnerId, cls.orgId);
  if (!pool.size) { res.json([]); return; }
  const courses = await db.select({ id: coursesTable.id, title: coursesTable.title, status: coursesTable.status })
    .from(coursesTable).where(inArray(coursesTable.id, [...pool]));
  res.json(courses);
});

// GET /organisations/:orgId/assignable-courses -- the same partner pool, scoped to an org (not a
// specific class). Powers the Assign wizard, which may target a new class that has no id yet.
router.get("/organisations/:orgId/assignable-courses", requireAuth, async (req, res) => {
  const org = await orgFor(req.params.orgId);
  if (!canAccessOrg(req.dbUser!, org)) { res.status(403).json({ error: "Forbidden" }); return; }
  const pool = await classCoursePool(org?.partnerId, req.params.orgId);
  if (!pool.size) { res.json([]); return; }
  const courses = await db.select({ id: coursesTable.id, title: coursesTable.title, status: coursesTable.status })
    .from(coursesTable).where(inArray(coursesTable.id, [...pool]));
  res.json(courses);
});

// POST /classes/_cleanup-leaked-courses (super admin) -- one-time repair: remove any class->course
// assignment whose course is NOT in that class's partner pool. Fixes historic leaks (e.g. an Enza-only
// course that ended up assigned to every partner's classes). Idempotent.
router.post("/classes/_cleanup-leaked-courses", requireAuth, async (req, res) => {
  if (req.dbUser!.role !== "super_admin") { res.status(403).json({ error: "Forbidden" }); return; }
  await ensureTables();
  const rows = (await db.execute(sql`
    SELECT occ.id AS row_id, occ.course_id, oc.org_id, o.partner_id
    FROM org_class_courses occ
    JOIN org_classes oc ON oc.id = occ.class_id
    JOIN organisations o ON o.id = oc.org_id`)).rows as { row_id: string; course_id: string; org_id: string; partner_id: string | null }[];
  const poolCache = new Map<string, Set<string>>();
  let removed = 0;
  for (const r of rows) {
    const key = `${r.partner_id ?? ""}::${r.org_id}`;
    let pool = poolCache.get(key);
    if (!pool) { pool = await classCoursePool(r.partner_id, r.org_id); poolCache.set(key, pool); }
    if (!pool.has(r.course_id)) { await db.execute(sql`DELETE FROM org_class_courses WHERE id = ${r.row_id}`); removed++; }
  }
  await logAudit(req, "classes.cleanup_leaked_courses", "platform", "classes", { removed });
  res.json({ ok: true, removed });
});

// PUT /classes/:classId/staff { staff: [{staffId, role}] }, replace staff assignments.
router.put("/classes/:classId/staff", requireAuth, async (req, res) => {
  const { cls, org } = await classWithOrg(req.params.classId);
  if (!cls || !canAdminOrg(req.dbUser!, org)) { res.status(cls ? 403 : 404).json({ error: cls ? "Forbidden" : "Not found" }); return; }
  const raw = Array.isArray(req.body?.staff) ? req.body.staff : [];
  const staff = raw
    .filter((s: any) => s && typeof s.staffId === "string" && typeof s.role === "string")
    .map((s: any) => ({ classId: cls.id, staffId: String(s.staffId), role: String(s.role) }));
  await db.delete(orgClassStaffTable).where(eq(orgClassStaffTable.classId, cls.id));
  if (staff.length) await db.insert(orgClassStaffTable).values(staff);
  res.json({ staff: staff.map(({ staffId, role }: { staffId: string; role: string }) => ({ staffId, role })) });
});

// POST /classes/:classId/enrol, materialise real enrolments for every learner x course in the class.
router.post("/classes/:classId/enrol", requireAuth, async (req, res) => {
  const { cls, org } = await classWithOrg(req.params.classId);
  if (!cls || !canAdminOrg(req.dbUser!, org)) { res.status(cls ? 403 : 404).json({ error: cls ? "Forbidden" : "Not found" }); return; }
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

// ── Middle hop: partner -> organisation course allocation ─────────────────────────────────────────

// GET /my-partner/received-courses, the courses the super admin has given the caller's partner, each
// with which of the partner's organisations it is currently allocated to. For the partner (Enza) hub.
router.get("/my-partner/received-courses", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  const partnerId = (isSuperAdmin(u.role) && typeof req.query.partnerId === "string" && req.query.partnerId) ? req.query.partnerId : u.partnerId;
  if (!partnerId || (!isSuperAdmin(u.role) && u.role !== "partner_admin")) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    await ensureTables();
    const ids = [...(await partnerCourseIdSet(partnerId))];
    if (!ids.length) { res.json({ courses: [], orgs: [] }); return; }
    const [courses, orgs, allocs] = await Promise.all([
      db.select({ id: coursesTable.id, title: coursesTable.title, status: coursesTable.status }).from(coursesTable).where(inArray(coursesTable.id, ids)),
      db.select({ id: organisationsTable.id, name: organisationsTable.name }).from(organisationsTable).where(eq(organisationsTable.partnerId, partnerId)),
      db.execute(sql`SELECT course_id, org_id FROM org_course_assignments WHERE partner_id = ${partnerId}`),
    ]);
    const allocRows = (allocs.rows ?? []) as { course_id: string; org_id: string }[];
    const orgsByCourse = allocRows.reduce<Record<string, string[]>>((m, r) => { (m[r.course_id] ??= []).push(r.org_id); return m; }, {});
    res.json({
      courses: courses.map((c) => ({ id: c.id, title: c.title, status: c.status, orgIds: orgsByCourse[c.id] ?? [] })),
      orgs: orgs.map((o) => ({ id: o.id, name: o.name })),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load received courses" });
  }
});

// PUT /partner-courses/:courseId/orgs { orgIds }, set which of the partner's organisations receive this
// course. Partner-admin (own partner) or super admin. The course must be one assigned to the partner.
router.put("/partner-courses/:courseId/orgs", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  const courseId = req.params.courseId;
  const partnerId = (isSuperAdmin(u.role) && typeof req.body?.partnerId === "string" && req.body.partnerId) ? req.body.partnerId : u.partnerId;
  if (!partnerId || (!isSuperAdmin(u.role) && u.role !== "partner_admin")) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!(await partnerCourseIdSet(partnerId)).has(courseId)) { res.status(403).json({ error: "That course is not assigned to your partner." }); return; }
  await ensureTables();
  // Only orgs that actually belong to this partner may be targeted.
  const partnerOrgs = await db.select({ id: organisationsTable.id }).from(organisationsTable).where(eq(organisationsTable.partnerId, partnerId));
  const valid = new Set(partnerOrgs.map((o) => o.id));
  const orgIds = strArr(req.body?.orgIds).filter((id) => valid.has(id));
  await db.execute(sql`DELETE FROM org_course_assignments WHERE course_id = ${courseId} AND partner_id = ${partnerId}`);
  for (const orgId of orgIds) {
    await db.execute(sql`INSERT INTO org_course_assignments (org_id, course_id, partner_id, assigned_by) VALUES (${orgId}, ${courseId}, ${partnerId}, ${u.id}) ON CONFLICT (org_id, course_id) DO NOTHING`);
  }
  await logAudit(req, "course.allocate_orgs", "course", courseId, { partnerId, orgIds });
  res.json({ courseId, orgIds });
});

// GET /organisations/:orgId/assigned-courses, the courses allocated to this org (the pool it may run).
router.get("/organisations/:orgId/assigned-courses", requireAuth, async (req, res) => {
  const { orgId } = req.params;
  const org = await orgFor(orgId);
  if (!canAccessOrg(req.dbUser!, org)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    await ensureTables();
    const rows = (await db.execute(sql`SELECT course_id FROM org_course_assignments WHERE org_id = ${orgId}`)).rows as { course_id: string }[];
    const ids = rows.map((r) => r.course_id);
    if (!ids.length) { res.json([]); return; }
    const courses = await db.select({ id: coursesTable.id, title: coursesTable.title, status: coursesTable.status }).from(coursesTable).where(inArray(coursesTable.id, ids));
    res.json(courses);
  } catch { res.json([]); }
});

// PUT /organisations/:orgId/assigned-courses { courseIds }, replace the org's allocated set. Admin only.
// Every course must be one the super admin assigned to this org's partner.
router.put("/organisations/:orgId/assigned-courses", requireAuth, async (req, res) => {
  const { orgId } = req.params;
  const org = await orgFor(orgId);
  if (!canAdminOrg(req.dbUser!, org)) { res.status(403).json({ error: "Forbidden" }); return; }
  await ensureTables();
  const pool = await partnerCourseIdSet(org!.partnerId ?? "");
  const courseIds = strArr(req.body?.courseIds).filter((id) => pool.has(id));
  await db.execute(sql`DELETE FROM org_course_assignments WHERE org_id = ${orgId}`);
  for (const courseId of courseIds) {
    await db.execute(sql`INSERT INTO org_course_assignments (org_id, course_id, partner_id, assigned_by) VALUES (${orgId}, ${courseId}, ${org!.partnerId}, ${req.dbUser!.id}) ON CONFLICT (org_id, course_id) DO NOTHING`);
  }
  await logAudit(req, "org.assign_courses", "organisation", orgId, { courseIds });
  res.json({ courseIds });
});

// POST /organisations/:orgId/courses/:courseId/enrol-all, enrol every active learner in the org into
// the course in one click. Admin only; the course must be allocated to this org.
router.post("/organisations/:orgId/courses/:courseId/enrol-all", requireAuth, async (req, res) => {
  const { orgId, courseId } = req.params;
  const org = await orgFor(orgId);
  if (!canAdminOrg(req.dbUser!, org)) { res.status(403).json({ error: "Forbidden" }); return; }
  await ensureTables();
  const allocated = (await db.execute(sql`SELECT 1 FROM org_course_assignments WHERE org_id = ${orgId} AND course_id = ${courseId} LIMIT 1`)).rows;
  if (!allocated.length) { res.status(403).json({ error: "That course is not allocated to this organisation." }); return; }
  const learners = await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.organisationId, orgId), eq(usersTable.role, "learner"), eq(usersTable.status, "active")));
  const learnerIds = learners.map((l) => l.id);
  if (!learnerIds.length) { res.json({ enrolled: 0, message: "This organisation has no active learners yet." }); return; }
  const existing = await db.select({ userId: enrolmentsTable.userId }).from(enrolmentsTable).where(and(eq(enrolmentsTable.courseId, courseId), inArray(enrolmentsTable.userId, learnerIds)));
  const has = new Set(existing.map((e) => e.userId));
  const toInsert = learnerIds.filter((id) => !has.has(id)).map((userId) => ({ userId, courseId }));
  if (toInsert.length) await db.insert(enrolmentsTable).values(toInsert);
  await logAudit(req, "org.enrol_all", "course", courseId, { orgId, enrolled: toInsert.length });
  res.json({ enrolled: toInsert.length, total: learnerIds.length });
});

export default router;
