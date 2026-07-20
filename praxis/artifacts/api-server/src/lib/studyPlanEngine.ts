import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import {
  coursesTable,
  interactiveActivitiesTable,
  caseScenariosTable,
  caseAssignmentsTable,
  type StudyPlanItem,
} from "@workspace/db";
import { eq, and, or, inArray } from "drizzle-orm";
import { getCourseColumns, getScoreData, computeLearner, type GradebookColumn } from "./gradebookEngine";

/**
 * Adaptive study-plan engine.
 *
 * When a learner is flagged off-track, we build a short, ordered remediation plan from the
 * SPECIFIC categories they are weak in, pulling matching cases + interactive activities that
 * already exist in Praxis (course content, the learner's assigned content, or the shared
 * library). The plan is built deterministically; an AI pass only writes the encouraging
 * rationale + per-item "why". If AI fails, heuristic copy is used — this never throws.
 */

const MODEL = "claude-sonnet-4-6";
const PASS = 0.7;
const MAX_ITEMS = 6;

const STOP = new Set([
  "the", "and", "a", "an", "of", "to", "in", "for", "with", "on", "at", "by", "general",
  "assignment", "assignments", "assessment", "week", "module", "unit", "part",
]);
function tokens(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}
function overlap(a: string[], text: string): number {
  if (a.length === 0) return 0;
  const t = text.toLowerCase();
  return a.reduce((n, w) => (t.includes(w) ? n + 1 : n), 0);
}

interface Candidate {
  refType: "case" | "activity";
  refId: string;
  title: string;
  haystack: string; // title + tags + kind for matching
}

export interface StudyPlan {
  items: StudyPlanItem[];
  rationale: string;
}

/**
 * Build a remediation plan for a learner in a course, or null if they have no weak areas
 * (so callers can skip generating an empty plan).
 */
export async function generateStudyPlan(opts: {
  courseId: string;
  userId: string;
  learnerName?: string | null;
}): Promise<StudyPlan | null> {
  const { courseId, userId } = opts;
  try {
    const columns = await getCourseColumns(courseId);
    const { fractions, notes } = await getScoreData(columns, [userId]);
    const computed = computeLearner(columns, fractions.get(userId), notes.get(userId), false);

    // Weak categories: summative columns below pass, or overdue-and-missing.
    const now = Date.now();
    const perCat = new Map<string, { sum: number; n: number }>();
    for (const col of columns) {
      if (!col.includeInGrade || col.itemType !== "summative") continue;
      const frac = computed.cells[col.key]?.fraction ?? null;
      const overdueMissing = frac === null && col.dueDate !== null && new Date(col.dueDate).getTime() < now;
      if (frac === null && !overdueMissing) continue; // untouched, not yet due -> not "weak"
      const val = frac === null ? 0 : frac;
      if (val >= PASS && !overdueMissing) continue;
      const e = perCat.get(col.category) ?? { sum: 0, n: 0 };
      e.sum += val;
      e.n += 1;
      perCat.set(col.category, e);
    }
    // No graded gaps? Fall back to CONTENT gaps: the modules the learner has not worked through.
    // This is what lets a learner who is simply behind (low completion, no low grades) still get a
    // real catch-up plan and stop the coach from saying "on track".
    if (perCat.size === 0) {
      const compCols = columns.filter((c) => c.sourceType === "completion" && c.sourceId);
      const incomplete = compCols
        .map((c) => ({ col: c, frac: computed.cells[c.key]?.fraction ?? 0 }))
        .filter((x) => x.frac < 0.8)
        .sort((a, b) => a.frac - b.frac)
        .slice(0, MAX_ITEMS);
      if (incomplete.length === 0) return null;
      const items: StudyPlanItem[] = incomplete.map((x) => ({
        kind: "review",
        refType: "module",
        refId: x.col.sourceId,
        title: (x.col.title || "Review module").replace(/^Completion:\s*/, ""),
        why: `You have completed about ${Math.round(x.frac * 100)}% of this module. Work through its video, readings and activities to catch up.`,
        category: "Course completion",
        done: false,
      }));
      return {
        items,
        rationale: "You are behind on the course content. Work through these modules, in order, to catch up and get back on track.",
      };
    }

    const weakCategories = [...perCat.entries()]
      .map(([category, v]) => ({ category, avg: v.n ? v.sum / v.n : 0 }))
      .sort((a, b) => a.avg - b.avg)
      .map((c) => c.category);

    // Gather available remediation content.
    const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, courseId) });
    const tenantId = course?.tenantId ?? null;

    const actOr = [
      eq(interactiveActivitiesTable.courseId, courseId),
      eq(interactiveActivitiesTable.isLibrary, true),
    ];
    if (tenantId) actOr.push(eq(interactiveActivitiesTable.organisationId, tenantId));
    const activityRows = await db
      .select()
      .from(interactiveActivitiesTable)
      .where(and(eq(interactiveActivitiesTable.published, true), or(...actOr)));

    // Cases assigned to this learner + library/tenant cases.
    const assignedCaseRows = await db
      .select({ caseId: caseAssignmentsTable.caseId })
      .from(caseAssignmentsTable)
      .where(and(eq(caseAssignmentsTable.userId, userId), eq(caseAssignmentsTable.tier, "learner")));
    const assignedCaseIds = [...new Set(assignedCaseRows.map((r) => r.caseId))];
    const caseOr = [eq(caseScenariosTable.isLibrary, true)];
    if (tenantId) caseOr.push(eq(caseScenariosTable.organisationId, tenantId));
    if (assignedCaseIds.length) caseOr.push(inArray(caseScenariosTable.id, assignedCaseIds));
    const caseRows = await db
      .select()
      .from(caseScenariosTable)
      .where(and(eq(caseScenariosTable.status, "published"), or(...caseOr)));

    const candidates: Candidate[] = [
      ...activityRows.map((a) => ({
        refType: "activity" as const,
        refId: a.id,
        title: a.title,
        haystack: [a.title, (a.tags || []).join(" "), a.kind, a.bloomsLevel || ""].join(" "),
      })),
      ...caseRows.map((c) => ({
        refType: "case" as const,
        refId: c.id,
        title: c.title,
        haystack: [c.title, (c.tags || []).join(" "), c.learningObjective || "", c.bloomsLevel || ""].join(" "),
      })),
    ];

    // Select up to one strong match per weak category, alternating; fill remaining slots.
    const used = new Set<string>();
    const items: StudyPlanItem[] = [];
    for (const category of weakCategories) {
      if (items.length >= MAX_ITEMS) break;
      const toks = tokens(category);
      const ranked = candidates
        .filter((c) => !used.has(c.refId))
        .map((c) => ({ c, score: overlap(toks, c.haystack) }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      if (best && best.score > 0) {
        used.add(best.c.refId);
        items.push({
          kind: best.c.refType,
          refType: best.c.refType,
          refId: best.c.refId,
          title: best.c.title,
          why: `Targets your weak area: ${category}.`,
          category,
          done: false,
        });
      } else {
        // No matching content — a coach-led review step for that category.
        items.push({
          kind: "review",
          refType: null,
          refId: null,
          title: `Review: ${category}`,
          why: `Revisit ${category} with your coach or the course materials — no matching practice activity was found.`,
          category,
          done: false,
        });
      }
    }

    // If we still have room and there are unused strong candidates, add extra practice.
    if (items.length < MAX_ITEMS) {
      const extras = candidates
        .filter((c) => !used.has(c.refId))
        .map((c) => ({ c, score: overlap(tokens(weakCategories.join(" ")), c.haystack) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      for (const x of extras) {
        if (items.length >= MAX_ITEMS) break;
        used.add(x.c.refId);
        items.push({
          kind: x.c.refType,
          refType: x.c.refType,
          refId: x.c.refId,
          title: x.c.title,
          why: "Extra practice on the skills you're rebuilding.",
          category: null,
          done: false,
        });
      }
    }

    const rationale = await writeRationale(opts.learnerName ?? null, weakCategories, items);
    return { items, rationale };
  } catch {
    return null;
  }
}

/** AI-written encouraging rationale + refined per-item "why", with a safe fallback. */
async function writeRationale(
  learnerName: string | null,
  weakCategories: string[],
  items: StudyPlanItem[],
): Promise<string> {
  const fallback =
    `You're close. Recent work shows you're finding ${weakCategories.slice(0, 3).join(", ")} tricky — that's exactly what this short plan rebuilds. ` +
    `Work through these ${items.length} step${items.length === 1 ? "" : "s"} in order; each one targets a specific gap, and finishing them should lift your mastery back on track.`;
  try {
    const system =
      "You are a warm, encouraging learning coach writing to a learner who has fallen behind. " +
      "Write 2-3 sentences (no lists, no markdown) that name what they're struggling with, normalise it, and motivate them to work the plan. " +
      "Be specific and kind, never shaming. Return ONLY a strict JSON object: {\"rationale\": string}.";
    const payload = {
      learnerName: learnerName || "the learner",
      weakAreas: weakCategories,
      plan: items.map((i) => ({ title: i.title, why: i.why, category: i.category })),
    };
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      system,
      messages: [{ role: "user", content: JSON.stringify(payload) + "\n\nReturn only the JSON object." }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const r = typeof parsed?.rationale === "string" ? parsed.rationale.trim() : "";
    return r || fallback;
  } catch {
    return fallback;
  }
}
