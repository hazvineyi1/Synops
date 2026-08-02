import { db } from "@workspace/db";
import {
  partnersTable, organisationsTable, orgClassesTable, orgClassCoursesTable,
  coursesTable, modulesTable, unitStandardsTable, unitStandardMappingsTable,
  interactiveActivitiesTable, activitySubmissionsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { K12_PARTNER_SLUG } from "./k12Seed";

/**
 * Public, PII-free "commendations" view for the K-12 demo landing page. A commendation is a standard
 * the program demonstrably MEETS, with the evidence for it: the interactive quizzes, games, and Math
 * Coach activities that assess it, and the aggregate mastery learners reached — no learner names, just
 * counts and percentages. It is a per-subject slice of the same logic the accreditation engine uses,
 * so what the public page claims and what the internal readiness report shows stay in agreement.
 */
const KIND_LABEL: Record<string, string> = {
  quiz: "an interactive quiz",
  game: "a game-show game",
  "math-coach": "the Socratic Math Coach",
};
const SUBJECTS = new Set([
  "Mathematics", "Matemáticas", "Science", "Social Studies",
  "English Language Arts", "Reading", "Lectura",
]);

export interface Commendation {
  code: string; title: string; framework: string;
  coverageLevel: "Assessed" | "Practised";
  masteryPct: number | null; learnersAssessed: number;
  howMet: string;
}
export interface SubjectCommendations {
  courseTitle: string; subject: string; gradeLabel: string; framework: string;
  standardsMet: number; assessedCount: number; overallMasteryPct: number | null;
  standards: Commendation[];
}
export interface K12CommendationsReport {
  academy: string;
  totals: { subjects: number; standards: number; assessed: number; overallMasteryPct: number | null };
  frameworks: string[];
  subjects: SubjectCommendations[];
}

function frameworkOf(description: string | null): string {
  if (!description) return "Standards-aligned";
  return description.split(" · ")[0]!.trim();
}
function pct(fracs: number[]): number | null {
  if (!fracs.length) return null;
  return Math.round((fracs.reduce((a, b) => a + b, 0) / fracs.length) * 100);
}

export async function buildK12Commendations(): Promise<K12CommendationsReport | null> {
  const partner = (await db.select().from(partnersTable).where(eq(partnersTable.slug, K12_PARTNER_SLUG)))[0];
  if (!partner) return null;
  const org = (await db.select().from(organisationsTable).where(eq(organisationsTable.partnerId, partner.id)))[0];
  if (!org) return null;

  // Courses delivered to the academy (attached to its classes).
  const classes = await db.select({ id: orgClassesTable.id }).from(orgClassesTable).where(eq(orgClassesTable.orgId, org.id));
  const classIds = classes.map((c) => c.id);
  if (!classIds.length) return { academy: org.name, totals: { subjects: 0, standards: 0, assessed: 0, overallMasteryPct: null }, frameworks: [], subjects: [] };
  const ccRows = await db.select({ courseId: orgClassCoursesTable.courseId }).from(orgClassCoursesTable).where(inArray(orgClassCoursesTable.classId, classIds));
  const courseIds = [...new Set(ccRows.map((r) => r.courseId))];
  if (!courseIds.length) return { academy: org.name, totals: { subjects: 0, standards: 0, assessed: 0, overallMasteryPct: null }, frameworks: [], subjects: [] };
  const courses = await db.select().from(coursesTable).where(and(inArray(coursesTable.id, courseIds), eq(coursesTable.status, "published")));

  const modules = await db.select({ id: modulesTable.id, courseId: modulesTable.courseId, order: modulesTable.order, title: modulesTable.title })
    .from(modulesTable).where(inArray(modulesTable.courseId, courseIds));
  const moduleIds = modules.map((m) => m.id);
  const modulesByCourse = new Map<string, typeof modules>();
  for (const m of modules) { const a = modulesByCourse.get(m.courseId) ?? []; a.push(m); modulesByCourse.set(m.courseId, a); }

  // Activities + best submission per learner (fraction 0..1).
  const activities = moduleIds.length
    ? await db.select({ id: interactiveActivitiesTable.id, moduleId: interactiveActivitiesTable.moduleId, kind: interactiveActivitiesTable.kind, maxScore: interactiveActivitiesTable.maxScore })
        .from(interactiveActivitiesTable).where(inArray(interactiveActivitiesTable.courseId, courseIds))
    : [];
  const actMax = new Map(activities.map((a) => [a.id, Number(a.maxScore) || 100]));
  const actsByModule = new Map<string, { id: string; kind: string }[]>();
  for (const a of activities) { if (!a.moduleId) continue; const arr = actsByModule.get(a.moduleId) ?? []; arr.push({ id: a.id, kind: a.kind }); actsByModule.set(a.moduleId, arr); }
  const actIds = activities.map((a) => a.id);
  const subs = actIds.length
    ? await db.select({ userId: activitySubmissionsTable.userId, activityId: activitySubmissionsTable.activityId, score: activitySubmissionsTable.score })
        .from(activitySubmissionsTable).where(inArray(activitySubmissionsTable.activityId, actIds))
    : [];
  const bestSub = new Map<string, Map<string, number>>(); // activityId -> userId -> best frac
  for (const s of subs) {
    const max = actMax.get(s.activityId) || 100;
    const raw = Number(s.score);
    if (!Number.isFinite(raw)) continue;
    const frac = Math.max(0, Math.min(1, max > 0 ? raw / max : raw / 100));
    const byU = bestSub.get(s.activityId) ?? new Map<string, number>();
    if (frac > (byU.get(s.userId) ?? -1)) byU.set(s.userId, frac);
    bestSub.set(s.activityId, byU);
  }

  // Standard mappings for these modules + the standard rows.
  const mappings = moduleIds.length
    ? await db.select({ unitStandardId: unitStandardMappingsTable.unitStandardId, targetId: unitStandardMappingsTable.targetId, targetType: unitStandardMappingsTable.targetType })
        .from(unitStandardMappingsTable).where(and(eq(unitStandardMappingsTable.targetType, "module"), inArray(unitStandardMappingsTable.targetId, moduleIds)))
    : [];
  const stdByModule = new Map<string, string[]>();
  for (const mp of mappings) { const a = stdByModule.get(mp.targetId) ?? []; a.push(mp.unitStandardId); stdByModule.set(mp.targetId, a); }
  const stdIds = [...new Set(mappings.map((m) => m.unitStandardId))];
  const stds = stdIds.length ? await db.select().from(unitStandardsTable).where(inArray(unitStandardsTable.id, stdIds)) : [];
  const stdById = new Map(stds.map((s) => [s.id, s]));

  const subjects: SubjectCommendations[] = [];
  const frameworkSet = new Set<string>();
  let totalStandards = 0, totalAssessed = 0;
  const allFracs: number[] = [];

  for (const c of courses) {
    const tags = c.competencyTags ?? [];
    const subject = tags.find((t) => SUBJECTS.has(t)) ?? "General Studies";
    const gradeLabel = tags.find((t) => /^Grade\s+\d+/i.test(t)) ?? (c.nqfLevel ? `Grade ${c.nqfLevel}` : "");
    const mods = (modulesByCourse.get(c.id) ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const seen = new Set<string>();
    const standards: Commendation[] = [];
    let courseFramework = "";

    for (const m of mods) {
      const acts = actsByModule.get(m.id) ?? [];
      // Learner best-fraction across this module's activities.
      const perLearner = new Map<string, number[]>();
      for (const a of acts) {
        const byU = bestSub.get(a.id);
        if (!byU) continue;
        for (const [u, f] of byU) { const arr = perLearner.get(u) ?? []; arr.push(f); perLearner.set(u, arr); }
      }
      const learnerBest = [...perLearner.values()].map((fs) => Math.max(...fs));
      const masteryPct = pct(learnerBest);
      const kindsPresent = [...new Set(acts.map((a) => a.kind))].filter((k) => KIND_LABEL[k]);
      const howMet = kindsPresent.length
        ? `Assessed through ${kindsPresent.map((k) => KIND_LABEL[k]).join(" and ")}`
        : "Introduced and practised in the lesson";

      for (const sid of stdByModule.get(m.id) ?? []) {
        const std = stdById.get(sid);
        if (!std || seen.has(std.code)) continue;
        seen.add(std.code);
        const fw = frameworkOf(std.description);
        if (!courseFramework) courseFramework = fw;
        frameworkSet.add(fw);
        const assessed = learnerBest.length > 0;
        standards.push({
          code: std.code, title: std.title, framework: fw,
          coverageLevel: assessed ? "Assessed" : "Practised",
          masteryPct, learnersAssessed: learnerBest.length,
          howMet: assessed && masteryPct != null
            ? `${howMet} — ${learnerBest.length} learner${learnerBest.length === 1 ? "" : "s"} at ${masteryPct}% average mastery.`
            : `${howMet}.`,
        });
        totalStandards += 1;
        if (assessed) { totalAssessed += 1; allFracs.push(...learnerBest); }
      }
    }
    if (!standards.length) continue;
    const subjAssessed = standards.filter((s) => s.coverageLevel === "Assessed");
    subjects.push({
      courseTitle: c.title, subject, gradeLabel, framework: courseFramework || "Standards-aligned",
      standardsMet: standards.length, assessedCount: subjAssessed.length,
      overallMasteryPct: pct(subjAssessed.flatMap((s) => (s.masteryPct != null ? [s.masteryPct / 100] : []))),
      standards,
    });
  }

  // Sort subjects by grade then title for a stable, readable page.
  subjects.sort((a, b) => a.courseTitle.localeCompare(b.courseTitle));

  return {
    academy: org.name,
    totals: { subjects: subjects.length, standards: totalStandards, assessed: totalAssessed, overallMasteryPct: pct(allFracs) },
    frameworks: [...frameworkSet].sort(),
    subjects,
  };
}
