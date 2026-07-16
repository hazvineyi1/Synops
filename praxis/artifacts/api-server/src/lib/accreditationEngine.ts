import { db } from "@workspace/db";
import {
  organisationsTable,
  coursesTable,
  modulesTable,
  enrolmentsTable,
  unitStandardsTable,
  unitStandardMappingsTable,
  caseScenariosTable,
  caseRubricsTable,
  caseSessionsTable,
  credentialsTable,
  evidenceRecordsTable,
  type RubricCriterion,
  type CaseRubricScore,
} from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";

/**
 * Accreditation Readiness aggregation.
 *
 * Builds an ORG-WIDE, standard-by-standard evidence report by fusing three existing signals:
 *  - Curriculum coverage: unit_standard_mappings (standard -> course / module / case).
 *  - Learner outcomes (assessed): case rubric criteria carry a unitStandardId; a learner's
 *    case_sessions.rubricScores join back by criterion NAME, giving per-standard mastery.
 *  - Learner outcomes (completion): PraxisMark credentials + evidence_records for mapped modules.
 *
 * Nothing is invented — every number is derived from the tables above. Standards are global
 * (not org-owned); a standard is "in scope" for the org iff something the org delivers maps to
 * it. Org scope = courses whose tenantId is the org OR its parent partner (courses are often
 * shared at partner level).
 */

const PASS = 0.7;

export interface Deliverable {
  type: "course" | "module" | "case";
  id: string;
  name: string;
  courseTitle?: string | null;
}

export interface StandardRow {
  unitStandardId: string;
  code: string;
  title: string;
  framework: string;
  nqfLevel: number | null;
  credits: number | null;
  deliverables: Deliverable[];
  coverageLevel: "Assessed" | "Practised" | "Introduced" | "Not covered";
  enrolledLearners: number;
  learnersCompleted: number;
  completionPct: number | null;
  learnersAssessed: number;
  masteryPct: number | null; // from case rubric criteria
  passRatePct: number | null;
  evidenceCount: number;
  status: "strong" | "adequate" | "thin" | "gap";
}

export interface AccreditationReport {
  org: { id: string; name: string };
  generatedAt: string;
  frameworks: string[];
  summary: {
    standardsInScope: number;
    standardsCovered: number;
    standardsAssessed: number;
    standardsWithGaps: number;
    coveragePct: number;
    assessedPct: number;
    overallMasteryPct: number | null;
    learnersEvaluated: number;
    coursesInScope: number;
    coursesUnmapped: number;
  };
  standards: StandardRow[];
  gaps: {
    noEvidence: { code: string; title: string }[];
    unmappedCourses: { id: string; title: string }[];
  };
}

const pct = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

export async function buildAccreditationReport(orgId: string): Promise<AccreditationReport> {
  const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, orgId) });
  const orgName = org?.name ?? "Organisation";
  const tenantIds = [orgId, ...(org?.partnerId ? [org.partnerId] : [])];

  // ── Org scope ──────────────────────────────────────────────────────────────
  const courses = await db.select().from(coursesTable).where(inArray(coursesTable.tenantId, tenantIds));
  const courseIds = courses.map((c) => c.id);
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const modules = courseIds.length
    ? await db.select().from(modulesTable).where(inArray(modulesTable.courseId, courseIds))
    : [];
  const moduleIds = modules.map((m) => m.id);
  const moduleById = new Map(modules.map((m) => [m.id, m]));
  const courseOfModule = new Map(modules.map((m) => [m.id, m.courseId]));
  const modulesByCourse = new Map<string, string[]>();
  for (const m of modules) {
    if (!modulesByCourse.has(m.courseId)) modulesByCourse.set(m.courseId, []);
    modulesByCourse.get(m.courseId)!.push(m.id);
  }

  const enrolments = courseIds.length
    ? await db.select().from(enrolmentsTable).where(inArray(enrolmentsTable.courseId, courseIds))
    : [];
  const learnersByCourse = new Map<string, Set<string>>();
  for (const e of enrolments) {
    if (!learnersByCourse.has(e.courseId)) learnersByCourse.set(e.courseId, new Set());
    learnersByCourse.get(e.courseId)!.add(e.userId);
  }

  // Cases in the org's scope.
  const caseRows = await db.select().from(caseScenariosTable);
  const cases = caseRows.filter(
    (c) => c.organisationId === orgId || (c.moduleId && moduleIds.includes(c.moduleId)),
  );
  const caseIds = cases.map((c) => c.id);
  const caseById = new Map(cases.map((c) => [c.id, c]));

  const rubrics = caseIds.length
    ? await db.select().from(caseRubricsTable).where(inArray(caseRubricsTable.caseId, caseIds))
    : [];
  const rubricByCase = new Map(rubrics.map((r) => [r.caseId, r]));
  const sessions = caseIds.length
    ? await db.select().from(caseSessionsTable).where(inArray(caseSessionsTable.caseId, caseIds))
    : [];

  // Credentials + evidence for mapped modules.
  const credentials = moduleIds.length
    ? await db.select().from(credentialsTable).where(inArray(credentialsTable.moduleId, moduleIds))
    : [];
  const credentialIds = credentials.map((c) => c.id);
  const credModuleById = new Map(credentials.map((c) => [c.id, c.moduleId]));
  const evidence = credentialIds.length
    ? await db.select().from(evidenceRecordsTable).where(inArray(evidenceRecordsTable.credentialId, credentialIds))
    : [];

  // ── Standards + mappings in scope ────────────────────────────────────────────
  const standards = await db.select().from(unitStandardsTable);
  const standardById = new Map(standards.map((s) => [s.id, s]));
  const allMappings = await db.select().from(unitStandardMappingsTable);

  const inScopeMappings = allMappings.filter((m) => {
    if (m.targetType === "course") return courseIds.includes(m.targetId);
    if (m.targetType === "module") return moduleIds.includes(m.targetId);
    if (m.targetType === "case") return caseIds.includes(m.targetId);
    return false;
  });

  // Per-standard: mapped module ids, courses, deliverables, cases.
  const stdModuleIds = new Map<string, Set<string>>();
  const stdCourseIds = new Map<string, Set<string>>();
  const stdDeliverables = new Map<string, Deliverable[]>();
  const stdCaseIds = new Map<string, Set<string>>();
  const ensure = <T>(map: Map<string, Set<T>>, k: string): Set<T> => {
    if (!map.has(k)) map.set(k, new Set());
    return map.get(k)!;
  };
  const addDeliverable = (sid: string, d: Deliverable) => {
    if (!stdDeliverables.has(sid)) stdDeliverables.set(sid, []);
    const list = stdDeliverables.get(sid)!;
    if (!list.some((x) => x.type === d.type && x.id === d.id)) list.push(d);
  };

  for (const m of inScopeMappings) {
    const sid = m.unitStandardId;
    if (m.targetType === "course") {
      const c = courseById.get(m.targetId);
      ensure(stdCourseIds, sid).add(m.targetId);
      (modulesByCourse.get(m.targetId) ?? []).forEach((mid) => ensure(stdModuleIds, sid).add(mid));
      if (c) addDeliverable(sid, { type: "course", id: c.id, name: c.title });
    } else if (m.targetType === "module") {
      const mod = moduleById.get(m.targetId);
      ensure(stdModuleIds, sid).add(m.targetId);
      if (mod) {
        ensure(stdCourseIds, sid).add(mod.courseId);
        addDeliverable(sid, { type: "module", id: mod.id, name: mod.title, courseTitle: courseById.get(mod.courseId)?.title ?? null });
      }
    } else if (m.targetType === "case") {
      const cs = caseById.get(m.targetId);
      ensure(stdCaseIds, sid).add(m.targetId);
      if (cs) addDeliverable(sid, { type: "case", id: cs.id, name: cs.title });
    }
  }

  // Case rubric criteria carry the fine-grained standard link; use it for outcomes AND to
  // ensure standards only linked via criteria (not the coarse mapping) are in scope.
  // Map: standardId -> [{caseId, criterionNames[]}]
  const stdCaseCriteria = new Map<string, Map<string, Set<string>>>(); // sid -> caseId -> criterion names
  for (const r of rubrics) {
    const crit = (r.criteria ?? []) as RubricCriterion[];
    for (const c of crit) {
      if (!c.unitStandardId) continue;
      const sid = c.unitStandardId;
      if (!stdCaseCriteria.has(sid)) stdCaseCriteria.set(sid, new Map());
      const byCase = stdCaseCriteria.get(sid)!;
      if (!byCase.has(r.caseId)) byCase.set(r.caseId, new Set());
      byCase.get(r.caseId)!.add(c.name);
      ensure(stdCaseIds, sid).add(r.caseId);
      const cs = caseById.get(r.caseId);
      if (cs) addDeliverable(sid, { type: "case", id: cs.id, name: cs.title });
    }
  }

  const inScopeStandardIds = new Set<string>([
    ...inScopeMappings.map((m) => m.unitStandardId),
    ...stdCaseCriteria.keys(),
  ]);

  // Sessions grouped by case.
  const sessionsByCase = new Map<string, typeof sessions>();
  for (const s of sessions) {
    if (s.status !== "completed" || !s.userId) continue;
    if (!sessionsByCase.has(s.caseId)) sessionsByCase.set(s.caseId, []);
    sessionsByCase.get(s.caseId)!.push(s);
  }

  // ── Build per-standard rows ──────────────────────────────────────────────────
  const rows: StandardRow[] = [];
  let masterySum = 0;
  let masteryCount = 0;
  const learnersEvaluated = new Set<string>();

  for (const sid of inScopeStandardIds) {
    const std = standardById.get(sid);
    if (!std) continue;

    const modSet = stdModuleIds.get(sid) ?? new Set<string>();
    const courseSet = stdCourseIds.get(sid) ?? new Set<string>();

    // Completion via credentials.
    const enrolled = new Set<string>();
    courseSet.forEach((cid) => (learnersByCourse.get(cid) ?? new Set()).forEach((u) => enrolled.add(u)));
    const completed = new Set<string>();
    let evidenceCount = 0;
    for (const cr of credentials) {
      if (modSet.has(cr.moduleId) && cr.status === "valid") completed.add(cr.userId);
    }
    for (const ev of evidence) {
      const mid = credModuleById.get(ev.credentialId ?? "");
      if (mid && modSet.has(mid)) evidenceCount += 1;
    }

    // Mastery via case rubric criteria (name-matched).
    const byCase = stdCaseCriteria.get(sid);
    const perLearner = new Map<string, number[]>(); // userId -> fractions
    if (byCase) {
      for (const [cid, critNames] of byCase) {
        for (const sess of sessionsByCase.get(cid) ?? []) {
          const scores = (sess.rubricScores ?? []) as CaseRubricScore[];
          let earned = 0;
          let max = 0;
          for (const sc of scores) {
            if (critNames.has(sc.criterion)) {
              earned += Number(sc.points) || 0;
              max += Number(sc.maxPoints) || 0;
            }
          }
          if (max > 0 && sess.userId) {
            const frac = earned / max;
            if (!perLearner.has(sess.userId)) perLearner.set(sess.userId, []);
            perLearner.get(sess.userId)!.push(frac);
          }
        }
      }
    }
    const learnerAvgs = [...perLearner.entries()].map(([u, fr]) => {
      const avg = fr.reduce((a, b) => a + b, 0) / fr.length;
      learnersEvaluated.add(u);
      return avg;
    });
    const learnersAssessed = learnerAvgs.length;
    const masteryPct = learnersAssessed > 0 ? Math.round((learnerAvgs.reduce((a, b) => a + b, 0) / learnersAssessed) * 1000) / 10 : null;
    const passRatePct = learnersAssessed > 0 ? pct(learnerAvgs.filter((a) => a >= PASS).length, learnersAssessed) : null;
    if (masteryPct !== null) {
      masterySum += masteryPct;
      masteryCount += 1;
    }

    const hasCaseAssess = (stdCaseIds.get(sid)?.size ?? 0) > 0;
    const coverageLevel: StandardRow["coverageLevel"] =
      hasCaseAssess || evidenceCount > 0
        ? "Assessed"
        : modSet.size > 0
          ? "Practised"
          : courseSet.size > 0
            ? "Introduced"
            : "Not covered";

    const completionPct = enrolled.size > 0 ? pct(completed.size, enrolled.size) : null;
    const hasOutcome = learnersAssessed > 0 || completed.size > 0 || evidenceCount > 0;
    const deliverables = stdDeliverables.get(sid) ?? [];
    const status: StandardRow["status"] = !hasOutcome
      ? "gap"
      : (masteryPct !== null && masteryPct >= 80) || (completionPct !== null && completionPct >= 80)
        ? "strong"
        : deliverables.length <= 1
          ? "thin"
          : "adequate";

    rows.push({
      unitStandardId: sid,
      code: std.code,
      title: std.title,
      framework: std.framework,
      nqfLevel: std.nqfLevel ?? null,
      credits: std.credits ?? null,
      deliverables,
      coverageLevel,
      enrolledLearners: enrolled.size,
      learnersCompleted: completed.size,
      completionPct,
      learnersAssessed,
      masteryPct,
      passRatePct,
      evidenceCount,
      status,
    });
  }

  rows.sort((a, b) => a.framework.localeCompare(b.framework) || a.code.localeCompare(b.code));

  // ── Gaps + summary ───────────────────────────────────────────────────────────
  const mappedCourseSet = new Set<string>();
  for (const m of inScopeMappings) {
    if (m.targetType === "course") mappedCourseSet.add(m.targetId);
    else if (m.targetType === "module") {
      const cid = courseOfModule.get(m.targetId);
      if (cid) mappedCourseSet.add(cid);
    }
  }
  // A course that hosts an in-scope, standard-linked case also counts as mapped.
  for (const sid of stdCaseIds.keys()) {
    for (const cid of stdCaseIds.get(sid) ?? []) {
      const mod = caseById.get(cid)?.moduleId;
      const courseId = mod ? courseOfModule.get(mod) : undefined;
      if (courseId) mappedCourseSet.add(courseId);
    }
  }
  const unmappedCourses = courses
    .filter((c) => c.status === "published" && !mappedCourseSet.has(c.id))
    .map((c) => ({ id: c.id, title: c.title }));

  const covered = rows.filter((r) => r.coverageLevel !== "Not covered");
  const assessed = rows.filter((r) => r.coverageLevel === "Assessed");
  const gapRows = rows.filter((r) => r.status === "gap");
  const frameworks = [...new Set(rows.map((r) => r.framework))].sort();

  return {
    org: { id: orgId, name: orgName },
    generatedAt: new Date().toISOString(),
    frameworks,
    summary: {
      standardsInScope: rows.length,
      standardsCovered: covered.length,
      standardsAssessed: assessed.length,
      standardsWithGaps: gapRows.length,
      coveragePct: pct(covered.length, rows.length),
      assessedPct: pct(assessed.length, rows.length),
      overallMasteryPct: masteryCount > 0 ? Math.round((masterySum / masteryCount) * 10) / 10 : null,
      learnersEvaluated: learnersEvaluated.size,
      coursesInScope: courses.length,
      coursesUnmapped: unmappedCourses.length,
    },
    standards: rows,
    gaps: {
      noEvidence: gapRows.map((r) => ({ code: r.code, title: r.title })),
      unmappedCourses,
    },
  };
}
