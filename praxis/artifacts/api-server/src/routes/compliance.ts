import { Router } from "express";
import { db } from "@workspace/db";
import {
  unitStandardsTable,
  unitStandardMappingsTable,
  coursesTable,
  modulesTable,
  enrolmentsTable,
  credentialsTable,
  evidenceRecordsTable,
} from "@workspace/db";
import { eq, and, or, inArray, desc, type SQL } from "drizzle-orm";
import { requireAuth, requireHub } from "../middlewares/requireAuth";
import { canAdministerOrg, canAccessCourse, hasHubAccess } from "../lib/roles";

/**
 * Accreditation compliance (decision doc §10.4). Unit standards and their mapping to
 * content are managed by the Hub (Instructional Designer / Super Admin). The course
 * compliance report and the learner self-view are read-only, scoped to org staff / the
 * learner. Portfolio of evidence is read from the append-only evidence_records ledger.
 */
const router = Router();

// ── Unit standard definitions (Hub-managed) ─────────────────────────────────────
router.get("/compliance/unit-standards", requireAuth, async (_req, res) => {
  const rows = await db.select().from(unitStandardsTable).orderBy(desc(unitStandardsTable.createdAt));
  res.json(rows);
});

router.post("/compliance/unit-standards", requireAuth, requireHub, async (req, res) => {
  const { code, title, framework, nqfLevel, credits, description } = req.body;
  if (!code || !title) { res.status(400).json({ error: "code and title are required" }); return; }
  const [row] = await db.insert(unitStandardsTable).values({
    code, title, framework: framework ?? "qcto",
    nqfLevel: nqfLevel ?? null, credits: credits ?? null, description: description ?? null,
  }).returning();
  res.status(201).json(row);
});

router.patch("/compliance/unit-standards/:id", requireAuth, requireHub, async (req, res) => {
  const { code, title, framework, nqfLevel, credits, description } = req.body;
  const updates: Partial<typeof unitStandardsTable.$inferInsert> = { updatedAt: new Date() };
  if (code !== undefined) updates.code = code;
  if (title !== undefined) updates.title = title;
  if (framework !== undefined) updates.framework = framework;
  if (nqfLevel !== undefined) updates.nqfLevel = nqfLevel;
  if (credits !== undefined) updates.credits = credits;
  if (description !== undefined) updates.description = description;
  const [row] = await db.update(unitStandardsTable).set(updates).where(eq(unitStandardsTable.id, req.params.id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/compliance/unit-standards/:id", requireAuth, requireHub, async (req, res) => {
  await db.delete(unitStandardMappingsTable).where(eq(unitStandardMappingsTable.unitStandardId, req.params.id));
  await db.delete(unitStandardsTable).where(eq(unitStandardsTable.id, req.params.id));
  res.status(204).send();
});

// ── Mappings (Hub-managed) ──────────────────────────────────────────────────────
router.get("/compliance/mappings", requireAuth, async (req, res) => {
  const { unitStandardId, targetId } = req.query as { unitStandardId?: string; targetId?: string };
  const conds: SQL[] = [];
  if (unitStandardId) conds.push(eq(unitStandardMappingsTable.unitStandardId, unitStandardId));
  if (targetId) conds.push(eq(unitStandardMappingsTable.targetId, targetId));
  const rows = conds.length
    ? await db.select().from(unitStandardMappingsTable).where(and(...conds))
    : await db.select().from(unitStandardMappingsTable);
  res.json(rows);
});

router.post("/compliance/mappings", requireAuth, requireHub, async (req, res) => {
  const { unitStandardId, targetType, targetId } = req.body;
  if (!unitStandardId || !targetType || !targetId) {
    res.status(400).json({ error: "unitStandardId, targetType and targetId are required" });
    return;
  }
  const [row] = await db.insert(unitStandardMappingsTable).values({ unitStandardId, targetType, targetId }).returning();
  res.status(201).json(row);
});

router.delete("/compliance/mappings/:id", requireAuth, requireHub, async (req, res) => {
  await db.delete(unitStandardMappingsTable).where(eq(unitStandardMappingsTable.id, req.params.id));
  res.status(204).send();
});

// ── Auditable course compliance report (org staff / super admin) ────────────────
router.get("/courses/:courseId/compliance-report", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, req.params.courseId) });
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }
  const allowed = hasHubAccess(user.role) || (canAdministerOrg(user.role) && canAccessCourse(user, course));
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }

  const mods = await db.select({ id: modulesTable.id, title: modulesTable.title }).from(modulesTable).where(eq(modulesTable.courseId, req.params.courseId));
  const courseModuleIds = mods.map((m) => m.id);
  const moduleTitle = new Map(mods.map((m) => [m.id, m.title]));

  const enrol = await db.select({ userId: enrolmentsTable.userId }).from(enrolmentsTable).where(eq(enrolmentsTable.courseId, req.params.courseId));
  const learnerIds = [...new Set(enrol.map((e) => e.userId))];

  // Mappings that touch this course: a direct course mapping, or any of its modules.
  const mapConds = [and(eq(unitStandardMappingsTable.targetType, "course"), eq(unitStandardMappingsTable.targetId, req.params.courseId))];
  if (courseModuleIds.length) {
    mapConds.push(and(eq(unitStandardMappingsTable.targetType, "module"), inArray(unitStandardMappingsTable.targetId, courseModuleIds)));
  }
  const mappings = await db.select().from(unitStandardMappingsTable).where(or(...mapConds));

  // Valid credentials for enrolled learners on this course's modules.
  const credRows = learnerIds.length && courseModuleIds.length
    ? await db.select({ id: credentialsTable.id, userId: credentialsTable.userId, moduleId: credentialsTable.moduleId })
        .from(credentialsTable)
        .where(and(inArray(credentialsTable.userId, learnerIds), inArray(credentialsTable.moduleId, courseModuleIds), eq(credentialsTable.status, "valid")))
    : [];
  const completedByLearner = new Map<string, Set<string>>();
  const credIdToModule = new Map<string, string>();
  for (const c of credRows) {
    if (!completedByLearner.has(c.userId)) completedByLearner.set(c.userId, new Set());
    completedByLearner.get(c.userId)!.add(c.moduleId);
    credIdToModule.set(c.id, c.moduleId);
  }

  const evRows = learnerIds.length
    ? await db.select({ userId: evidenceRecordsTable.userId, credentialId: evidenceRecordsTable.credentialId })
        .from(evidenceRecordsTable).where(inArray(evidenceRecordsTable.userId, learnerIds))
    : [];

  // Group mapped modules per unit standard.
  const stdToModules = new Map<string, Set<string>>();
  for (const m of mappings) {
    if (!stdToModules.has(m.unitStandardId)) stdToModules.set(m.unitStandardId, new Set());
    if (m.targetType === "course") courseModuleIds.forEach((id) => stdToModules.get(m.unitStandardId)!.add(id));
    else if (m.targetType === "module") stdToModules.get(m.unitStandardId)!.add(m.targetId);
  }
  const stdIds = [...stdToModules.keys()];
  const standards = stdIds.length ? await db.select().from(unitStandardsTable).where(inArray(unitStandardsTable.id, stdIds)) : [];

  const unitStandards = standards.map((std) => {
    const mappedModuleIds = [...(stdToModules.get(std.id) ?? new Set<string>())];
    let learnersCompleted = 0;
    for (const lid of learnerIds) {
      const done = completedByLearner.get(lid);
      if (mappedModuleIds.length && done && mappedModuleIds.every((mid) => done.has(mid))) learnersCompleted++;
    }
    let evidenceRecords = 0;
    for (const ev of evRows) {
      const mid = ev.credentialId ? credIdToModule.get(ev.credentialId) : undefined;
      if (mid && mappedModuleIds.includes(mid)) evidenceRecords++;
    }
    return {
      unitStandardId: std.id, code: std.code, title: std.title, framework: std.framework,
      nqfLevel: std.nqfLevel, credits: std.credits,
      mappedModules: mappedModuleIds.map((id) => ({ moduleId: id, title: moduleTitle.get(id) ?? null })),
      enrolledLearners: learnerIds.length, learnersCompleted, evidenceRecords,
    };
  });

  res.json({
    courseId: req.params.courseId,
    courseTitle: course.title,
    organisationId: course.tenantId,
    enrolledLearners: learnerIds.length,
    unitStandards,
  });
});

// ── Learner self-view: which unit standards I have met ──────────────────────────
router.get("/me/compliance", requireAuth, async (req, res) => {
  const myCreds = await db.select({ id: credentialsTable.id, moduleId: credentialsTable.moduleId })
    .from(credentialsTable)
    .where(and(eq(credentialsTable.userId, req.userId!), eq(credentialsTable.status, "valid")));
  const completedModuleIds = new Set(myCreds.map((c) => c.moduleId));

  if (completedModuleIds.size === 0) { res.json({ unitStandards: [] }); return; }

  // Candidate standards: any mapped to a module the learner has completed.
  const moduleMaps = await db.select().from(unitStandardMappingsTable)
    .where(and(eq(unitStandardMappingsTable.targetType, "module"), inArray(unitStandardMappingsTable.targetId, [...completedModuleIds])));
  const candidateStdIds = [...new Set(moduleMaps.map((m) => m.unitStandardId))];
  if (candidateStdIds.length === 0) { res.json({ unitStandards: [] }); return; }

  // All module mappings for those standards, to decide "met" (all mapped modules done).
  const allMaps = await db.select().from(unitStandardMappingsTable)
    .where(and(eq(unitStandardMappingsTable.targetType, "module"), inArray(unitStandardMappingsTable.unitStandardId, candidateStdIds)));
  const stdToModules = new Map<string, Set<string>>();
  for (const m of allMaps) {
    if (!stdToModules.has(m.unitStandardId)) stdToModules.set(m.unitStandardId, new Set());
    stdToModules.get(m.unitStandardId)!.add(m.targetId);
  }
  const standards = await db.select().from(unitStandardsTable).where(inArray(unitStandardsTable.id, candidateStdIds));

  const unitStandards = standards.map((std) => {
    const required = [...(stdToModules.get(std.id) ?? new Set<string>())];
    const met = required.length > 0 && required.every((mid) => completedModuleIds.has(mid));
    return {
      unitStandardId: std.id, code: std.code, title: std.title, framework: std.framework,
      nqfLevel: std.nqfLevel, credits: std.credits, met,
      completedModules: required.filter((mid) => completedModuleIds.has(mid)).length,
      requiredModules: required.length,
    };
  });

  res.json({ unitStandards });
});

export default router;
