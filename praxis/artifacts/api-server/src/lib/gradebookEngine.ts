import { db } from "@workspace/db";
import {
  gradebookItemsTable,
  gradebookCellsTable,
  gradebookAlertsTable,
  assignmentsTable,
  gradebookEntriesTable,
  caseSessionsTable,
  caseRubricsTable,
  interactiveActivitiesTable,
  activitySubmissionsTable,
  attendanceRecordsTable,
  gradebookSettingsTable,
  gradebookOrgOverridesTable,
  beatProgressTable,
  beatsTable,
  credentialsTable,
  type GradebookItem,
  type LetterBand,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Gradebook aggregation engine.
 *
 * Turns four independent score sources into one gradebook:
 *  - assignments        -> gradebook_entries.score / assignment.points_possible
 *  - cases              -> best completed case_session (rubric total, else engagement/10)
 *  - interactive acts   -> best activity_submission.score / activity.max_score
 *  - attendance         -> one column per delivery session; present/late 1, absent 0,
 *                          excused deliberately unscored (see getScoreData)
 *  - manual columns     -> gradebook_cells.manual_score / item.points_possible
 *
 * A column is either a default assignment column (no registry row) or a `gradebook_items`
 * row (case / activity / manual, or an assignment OVERRIDE that recategorises/excludes it).
 * Everything is read fresh, so the gradebook can never drift from the underlying grades.
 *
 * Grading: overall mastery = sum(earned) / sum(possible) over INCLUDED SUMMATIVE columns
 * (formative folded in only when the caller asks). Off-track is multi-signal (mastery low,
 * summative trend down, or a missing overdue summative).
 */

const PASS = 0.7; // below this overall fraction => "mastery_low"
const AT_RISK = 0.8; // [PASS, AT_RISK) with no harder signal => "at_risk"

export interface GradebookColumn {
  key: string; // stable client key
  itemId: string | null; // gradebook_items.id, or null for a default assignment column
  sourceType: "assignment" | "case" | "activity" | "manual" | "attendance" | "completion";
  sourceId: string | null;
  title: string;
  category: string;
  itemType: "formative" | "summative";
  gradeType: "points" | "pass_fail" | "completion"; // how the score is displayed
  pointsPossible: number;
  dueDate: string | null;
  includeInGrade: boolean;
  editable: boolean; // can staff type a score directly into the cell?
  position: number;
}

export interface CellValue {
  fraction: number | null; // 0..1 of the column, or null if no score yet
  earned: number | null; // fraction * pointsPossible
  note: string | null;
  auto?: boolean; // fraction was auto-filled from course completion (no explicit grade)
}

export interface LearnerComputed {
  overallPercent: number | null; // 0..100
  band: "good" | "warn" | "low" | "none";
  letterGrade: string | null;
  trend: { dir: "up" | "down" | "flat" | "none"; label: string };
  cells: Record<string, CellValue>; // keyed by column.key
}

export interface OffTrackResult {
  status: "on_track" | "at_risk" | "off_track";
  reasons: string[]; // mastery_low | trend_down | missing_summative
  masteryPct: number | null;
}

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

// ── Grading settings (weighting + letter bands) ─────────────────────────────────
export interface GradebookSettings {
  weightingEnabled: boolean;
  summativeWeight: number;
  formativeWeight: number;
  categoryWeights: Record<string, number>;
  lettersEnabled: boolean;
  letterBands: LetterBand[];
}
export const DEFAULT_BANDS: LetterBand[] = [
  { label: "A", min: 90 }, { label: "B", min: 80 }, { label: "C", min: 70 }, { label: "D", min: 60 }, { label: "F", min: 0 },
];
export const DEFAULT_SETTINGS: GradebookSettings = {
  weightingEnabled: false, summativeWeight: 100, formativeWeight: 0, categoryWeights: {}, lettersEnabled: false, letterBands: DEFAULT_BANDS,
};

// ── Tiny in-memory TTL cache for STRUCTURE only (column set + settings) ──────────
// The gradebook reads everything live on every request, which keeps GRADES from ever drifting but
// re-runs the same structural queries (which columns exist, weighting/letter bands) on every matrix
// load and every grade write's alert recompute. Those change only when staff edit the gradebook,
// not when a score is entered — so we cache them for a few seconds and invalidate on the write paths.
// Scores/cells are NEVER cached: computeLearner + getScoreData still read fresh, so a grade change is
// always reflected immediately. Per-instance (single Railway instance today); short TTL bounds any
// cross-instance staleness if it ever scales horizontally.
const COLUMNS_TTL_MS = 15_000;
const SETTINGS_TTL_MS = 30_000;
const CACHE_MAX = 1000; // hard cap so a burst of course ids can't grow memory unbounded
type CacheEntry<T> = { value: T; expires: number };
const columnsCache = new Map<string, CacheEntry<GradebookColumn[]>>();
const settingsCache = new Map<string, CacheEntry<GradebookSettings>>();

function cacheGet<T>(store: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expires) { store.delete(key); return undefined; }
  return e.value;
}
function cacheSet<T>(store: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number): void {
  if (store.size >= CACHE_MAX) { const first = store.keys().next().value; if (first !== undefined) store.delete(first); }
  store.set(key, { value, expires: Date.now() + ttlMs });
}

/**
 * Drop the cached STRUCTURE for a course after a column / settings / override write, so staff see
 * their change on the next read instead of waiting out the TTL. Cheap (scores were never cached).
 * Clears the course's settings entry and every org variant of its column set.
 */
export function invalidateGradebookCaches(courseId: string): void {
  settingsCache.delete(courseId);
  for (const key of columnsCache.keys()) {
    if (key.startsWith(`${courseId}::`)) columnsCache.delete(key);
  }
}

export async function getGradebookSettings(courseId: string): Promise<GradebookSettings> {
  const cached = cacheGet(settingsCache, courseId);
  if (cached) return cached;
  try {
    const row = await db.query.gradebookSettingsTable.findFirst({ where: eq(gradebookSettingsTable.courseId, courseId) });
    const result: GradebookSettings = row
      ? {
          weightingEnabled: row.weightingEnabled,
          summativeWeight: row.summativeWeight,
          formativeWeight: row.formativeWeight,
          categoryWeights: (row.categoryWeights as Record<string, number>) ?? {},
          lettersEnabled: row.lettersEnabled,
          letterBands: row.letterBands?.length ? row.letterBands : DEFAULT_BANDS,
        }
      : DEFAULT_SETTINGS;
    cacheSet(settingsCache, courseId, result, SETTINGS_TTL_MS);
    return result;
  } catch {
    // Table not migrated yet — fall back to defaults so the gradebook keeps working. Don't cache the
    // error fallback, so settings appear the moment the table exists.
    return DEFAULT_SETTINGS;
  }
}

export function letterFor(pct: number | null, bands: LetterBand[]): string | null {
  if (pct === null || !bands.length) return null;
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  for (const b of sorted) if (pct >= b.min) return b.label;
  return sorted[sorted.length - 1]?.label ?? null;
}

/** Hierarchical weighted overall: category avg -> category-weighted within a type bucket -> type split. */
function weightedOverall(columns: GradebookColumn[], fracs: Map<string, number> | undefined, s: GradebookSettings): number | null {
  const bucketAvg = (type: "summative" | "formative"): number | null => {
    const cats = new Map<string, { earned: number; possible: number }>();
    for (const col of columns) {
      if (!col.includeInGrade || col.itemType !== type) continue;
      const f = fracs?.get(col.key);
      if (f == null) continue;
      const c = cats.get(col.category) ?? { earned: 0, possible: 0 };
      c.earned += f * col.pointsPossible;
      c.possible += col.pointsPossible;
      cats.set(col.category, c);
    }
    if (cats.size === 0) return null;
    let wSum = 0;
    let wAvg = 0;
    for (const [cat, v] of cats) {
      const catAvg = v.possible > 0 ? v.earned / v.possible : 0;
      const w = s.categoryWeights[cat] ?? 1;
      wAvg += catAvg * w;
      wSum += w;
    }
    return wSum > 0 ? wAvg / wSum : null;
  };
  const sAvg = s.summativeWeight > 0 ? bucketAvg("summative") : null;
  const fAvg = s.formativeWeight > 0 ? bucketAvg("formative") : null;
  let num2 = 0;
  let den = 0;
  if (sAvg != null) { num2 += sAvg * s.summativeWeight; den += s.summativeWeight; }
  if (fAvg != null) { num2 += fAvg * s.formativeWeight; den += s.formativeWeight; }
  return den > 0 ? (num2 / den) * 100 : null;
}

/**
 * Apply an organisation's grading overrides on top of the course-default columns, in place.
 * The course sets the default; an org can change grade type / counts / points / inclusion for its
 * own learners. Keyed by (sourceType, sourceId) so it also covers default assignment columns.
 */
async function applyOrgOverrides(columns: GradebookColumn[], courseId: string, orgId: string): Promise<void> {
  const ovs = await db
    .select()
    .from(gradebookOrgOverridesTable)
    .where(and(eq(gradebookOrgOverridesTable.courseId, courseId), eq(gradebookOrgOverridesTable.orgId, orgId)));
  if (ovs.length === 0) return;
  const byKey = new Map(ovs.map((o) => [`${o.sourceType}:${o.sourceId ?? ""}`, o]));
  for (const c of columns) {
    const o = byKey.get(`${c.sourceType}:${c.sourceId ?? ""}`);
    if (!o) continue;
    if (o.gradeType) c.gradeType = o.gradeType as GradebookColumn["gradeType"];
    if (o.itemType) c.itemType = o.itemType as GradebookColumn["itemType"];
    if (o.pointsPossible != null) c.pointsPossible = Number(o.pointsPossible);
    if (o.includeInGrade != null) c.includeInGrade = o.includeInGrade;
  }
}

/**
 * Build the ordered set of gradebook columns for a course, optionally with an org's overrides.
 * Cached (short TTL) keyed by course + org: the returned array is shared and MUST be treated as
 * read-only by callers (all current callers only read it). Invalidated on any column/config write.
 */
export async function getCourseColumns(courseId: string, orgId?: string | null): Promise<GradebookColumn[]> {
  const cacheKey = `${courseId}::${orgId ?? ""}`;
  const cached = cacheGet(columnsCache, cacheKey);
  if (cached) return cached;
  const [items, assignments] = await Promise.all([
    db.select().from(gradebookItemsTable).where(eq(gradebookItemsTable.courseId, courseId)),
    db
      .select()
      .from(assignmentsTable)
      .where(and(eq(assignmentsTable.courseId, courseId), eq(assignmentsTable.published, true))),
  ]);

  const overrideByAssignment = new Map<string, GradebookItem>();
  const standalone: GradebookItem[] = [];
  for (const it of items) {
    if (it.sourceType === "assignment" && it.sourceId) overrideByAssignment.set(it.sourceId, it);
    else standalone.push(it);
  }

  const columns: GradebookColumn[] = [];

  // Assignments: included by default; a matching registry row overrides / excludes them.
  for (const a of assignments) {
    const ov = overrideByAssignment.get(a.id);
    if (ov && !ov.includeInGrade) continue; // explicitly excluded
    columns.push({
      key: `assignment:${a.id}`,
      itemId: ov?.id ?? null,
      sourceType: "assignment",
      sourceId: a.id,
      title: ov?.title || a.title,
      category: ov?.category || "Assignments",
      itemType: (ov?.itemType as "formative" | "summative") ?? "summative",
      gradeType: ((ov as { gradeType?: string } | undefined)?.gradeType as "points" | "pass_fail" | "completion") ?? "points",
      pointsPossible: Number(a.pointsPossible), // native assignment weight is authoritative
      dueDate: (ov?.dueDate ?? a.dueDate)?.toISOString?.() ?? null,
      includeInGrade: ov?.includeInGrade ?? true,
      editable: true, // assignment cells are directly editable (writes gradebook_entries)
      position: ov?.position ?? a.position ?? 0,
    });
  }

  // Cases / activities / manual: exist only as registry rows.
  for (const it of standalone) {
    columns.push({
      key: `item:${it.id}`,
      itemId: it.id,
      sourceType: it.sourceType as "case" | "activity" | "manual" | "attendance" | "completion",
      sourceId: it.sourceId,
      title: it.title,
      category: it.category,
      itemType: it.itemType as "formative" | "summative",
      // completion columns always render as a %; others use their configured grade type.
      gradeType: (it.sourceType as string) === "completion"
        ? "completion"
        : (((it as { gradeType?: string }).gradeType as "points" | "pass_fail" | "completion") ?? "points"),
      pointsPossible: Number(it.pointsPossible),
      dueDate: it.dueDate?.toISOString() ?? null,
      includeInGrade: it.includeInGrade,
      editable: it.sourceType === "manual", // only manual columns take a typed score
      position: it.position,
    });
  }

  columns.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.position - b.position || a.title.localeCompare(b.title),
  );
  if (orgId) await applyOrgOverrides(columns, courseId, orgId);
  cacheSet(columnsCache, cacheKey, columns, COLUMNS_TTL_MS);
  return columns;
}

interface ScoreData {
  // fraction 0..1 per (userId -> columnKey)
  fractions: Map<string, Map<string, number>>;
  notes: Map<string, Map<string, string>>; // userId -> columnKey -> note
}

/** Batch-read every learner's score + note for the given columns. */
export async function getScoreData(
  columns: GradebookColumn[],
  userIds: string[],
): Promise<ScoreData> {
  const fractions = new Map<string, Map<string, number>>();
  const notes = new Map<string, Map<string, string>>();
  const setFrac = (uid: string, key: string, f: number) => {
    if (!fractions.has(uid)) fractions.set(uid, new Map());
    fractions.get(uid)!.set(key, f);
  };
  const setNote = (uid: string, key: string, n: string) => {
    if (!notes.has(uid)) notes.set(uid, new Map());
    notes.get(uid)!.set(key, n);
  };
  if (userIds.length === 0 || columns.length === 0) return { fractions, notes };

  const uSet = new Set(userIds);
  const assignmentIds = columns.filter((c) => c.sourceType === "assignment").map((c) => c.sourceId!);
  const caseIds = columns.filter((c) => c.sourceType === "case").map((c) => c.sourceId!);
  const activityIds = columns.filter((c) => c.sourceType === "activity").map((c) => c.sourceId!);
  const itemIds = columns.filter((c) => c.itemId).map((c) => c.itemId!);

  // Column lookup by source id for score attribution.
  const colByAssignment = new Map(columns.filter((c) => c.sourceType === "assignment").map((c) => [c.sourceId!, c]));
  const colByCase = new Map(columns.filter((c) => c.sourceType === "case").map((c) => [c.sourceId!, c]));
  const colByActivity = new Map(columns.filter((c) => c.sourceType === "activity").map((c) => [c.sourceId!, c]));
  const attendanceSessionIds = columns.filter((c) => c.sourceType === "attendance").map((c) => c.sourceId!);
  const colBySession = new Map(columns.filter((c) => c.sourceType === "attendance").map((c) => [c.sourceId!, c]));
  const manualColByItem = new Map(columns.filter((c) => c.sourceType === "manual" && c.itemId).map((c) => [c.itemId!, c]));

  await Promise.all([
    // Assignments — gradebook_entries hold the canonical score.
    (async () => {
      if (assignmentIds.length === 0) return;
      const rows = await db
        .select()
        .from(gradebookEntriesTable)
        .where(inArray(gradebookEntriesTable.assignmentId, assignmentIds));
      for (const r of rows) {
        if (!uSet.has(r.userId)) continue;
        const col = colByAssignment.get(r.assignmentId);
        if (!col) continue;
        const s = num(r.score);
        if (s !== null && col.pointsPossible > 0) setFrac(r.userId, col.key, Math.max(0, Math.min(1, s / col.pointsPossible)));
      }
    })(),
    // Cases — best completed session (rubric total, else engagement/10).
    (async () => {
      if (caseIds.length === 0) return;
      const [sessions, rubrics] = await Promise.all([
        db.select().from(caseSessionsTable).where(inArray(caseSessionsTable.caseId, caseIds)),
        db.select().from(caseRubricsTable).where(inArray(caseRubricsTable.caseId, caseIds)),
      ]);
      const hasRubric = new Set(rubrics.map((r) => r.caseId));
      for (const s of sessions) {
        if (!s.userId || !uSet.has(s.userId) || s.status !== "completed") continue;
        const col = colByCase.get(s.caseId);
        if (!col) continue;
        let frac: number | null = null;
        const rs = s.rubricScores;
        if (Array.isArray(rs) && rs.length > 0) {
          const earned = rs.reduce((t, x) => t + (Number(x.points) || 0), 0);
          const poss = rs.reduce((t, x) => t + (Number(x.maxPoints) || 0), 0);
          if (poss > 0) frac = earned / poss;
        }
        if (frac === null && s.engagementScore !== null && s.engagementScore !== undefined) {
          frac = Math.max(0, Math.min(1, Number(s.engagementScore) / 10)); // engagement is 0..10
        }
        if (frac === null) continue;
        const prev = fractions.get(s.userId)?.get(col.key);
        if (prev === undefined || frac > prev) setFrac(s.userId, col.key, frac); // best attempt
        void hasRubric;
      }
    })(),
    // Activities — best submission score / activity max.
    (async () => {
      if (activityIds.length === 0) return;
      const [subs, acts] = await Promise.all([
        db.select().from(activitySubmissionsTable).where(inArray(activitySubmissionsTable.activityId, activityIds)),
        db.select().from(interactiveActivitiesTable).where(inArray(interactiveActivitiesTable.id, activityIds)),
      ]);
      const maxById = new Map(acts.map((a) => [a.id, Number(a.maxScore) || 100]));
      for (const sub of subs) {
        if (!uSet.has(sub.userId)) continue;
        const col = colByActivity.get(sub.activityId);
        if (!col) continue;
        const s = num(sub.score);
        if (s === null) continue;
        const max = maxById.get(sub.activityId) || 100;
        const frac = max > 0 ? Math.max(0, Math.min(1, s / max)) : 0;
        const prev = fractions.get(sub.userId)?.get(col.key);
        if (prev === undefined || frac > prev) setFrac(sub.userId, col.key, frac); // best attempt
      }
    })(),
    // Attendance — one column per delivery session, scored from the learner's own record.
    //
    // FAIRNESS, deliberately:
    //  * present / late  -> 1. They attended. Docking marks for lateness is a policy the
    //    platform does not own; if an org wants that it should be a setting, not something
    //    invented here.
    //  * absent          -> 0.
    //  * excused         -> NO SCORE AT ALL, not zero. That is the entire point of marking
    //    someone excused; writing 0 would quietly punish the learner the facilitator just
    //    decided not to punish, and would drag their overall mastery down.
    //  * no record       -> no score, same as an unmarked assignment. Attendance nobody
    //    recorded is missing data, not a zero.
    (async () => {
      if (attendanceSessionIds.length === 0) return;
      const rows = await db
        .select()
        .from(attendanceRecordsTable)
        .where(inArray(attendanceRecordsTable.sessionId, attendanceSessionIds));
      for (const r of rows) {
        if (!uSet.has(r.userId)) continue;
        const col = colBySession.get(r.sessionId);
        if (!col) continue;
        if (r.status === "excused") continue; // neither credit nor penalty
        setFrac(r.userId, col.key, r.status === "absent" ? 0 : 1);
      }
    })(),
    // Completion — one column per module, scored as the fraction of that module's beats the learner
    // has viewed (0..1). This is how readings/video/lesson completion is recorded in the gradebook:
    // it is engagement, not a mark, so these columns are formative (visible, not counted in the grade).
    (async () => {
      const completionCols = columns.filter((c) => c.sourceType === "completion" && c.sourceId);
      if (completionCols.length === 0) return;
      const moduleIds = completionCols.map((c) => c.sourceId!);
      const colByModule = new Map(completionCols.map((c) => [c.sourceId!, c]));
      const [beats, progress, credentials] = await Promise.all([
        db.select({ id: beatsTable.id, moduleId: beatsTable.moduleId }).from(beatsTable).where(inArray(beatsTable.moduleId, moduleIds)),
        // Join through beats so only progress on CURRENTLY EXISTING beats counts, attributed to the
        // beat's real module. Reading the denormalized beat_progress.module_id counted orphaned rows
        // (from rebuilt beats) and collapsed every module to the same percentage.
        db.select({ userId: beatProgressTable.userId, moduleId: beatsTable.moduleId })
          .from(beatProgressTable)
          .innerJoin(beatsTable, eq(beatProgressTable.beatId, beatsTable.id))
          .where(inArray(beatsTable.moduleId, moduleIds)),
        // A module MASTERED via the Socratic coach writes no beat_progress at all - it writes a valid
        // credential. Without this, a learner who certified through the coach read 0% completion here
        // (and tripped the low_completion off-track alert). A valid credential = the module is done.
        db.select({ userId: credentialsTable.userId, moduleId: credentialsTable.moduleId })
          .from(credentialsTable)
          .where(and(inArray(credentialsTable.moduleId, moduleIds), eq(credentialsTable.status, "valid"))),
      ]);
      const totalByModule = new Map<string, number>();
      for (const b of beats) totalByModule.set(b.moduleId, (totalByModule.get(b.moduleId) ?? 0) + 1);
      const viewedByUserModule = new Map<string, number>();
      for (const p of progress) {
        if (!uSet.has(p.userId)) continue;
        const k = `${p.userId}::${p.moduleId}`;
        viewedByUserModule.set(k, (viewedByUserModule.get(k) ?? 0) + 1);
      }
      const certifiedUserModule = new Set<string>();
      for (const c of credentials) {
        if (!uSet.has(c.userId)) continue;
        certifiedUserModule.add(`${c.userId}::${c.moduleId}`);
      }
      for (const uid of userIds) {
        for (const mId of moduleIds) {
          const col = colByModule.get(mId)!;
          // Certified (mastered via coach) => fully complete, even when the module has zero beats or
          // none were opened. Either signal satisfies completion; take the stronger of the two.
          if (certifiedUserModule.has(`${uid}::${mId}`)) {
            setFrac(uid, col.key, 1);
            continue;
          }
          const total = totalByModule.get(mId) ?? 0;
          if (total === 0) continue;
          const viewed = viewedByUserModule.get(`${uid}::${mId}`) ?? 0;
          setFrac(uid, col.key, Math.max(0, Math.min(1, viewed / total)));
        }
      }
    })(),
    // Manual scores + per-cell notes (any item that has a registry row).
    (async () => {
      if (itemIds.length === 0) return;
      const cells = await db.select().from(gradebookCellsTable).where(inArray(gradebookCellsTable.itemId, itemIds));
      const colByItem = new Map(columns.filter((c) => c.itemId).map((c) => [c.itemId!, c]));
      for (const c of cells) {
        if (!uSet.has(c.userId)) continue;
        const col = colByItem.get(c.itemId);
        if (!col) continue;
        if (c.note) setNote(c.userId, col.key, c.note);
        const manualCol = manualColByItem.get(c.itemId);
        if (manualCol) {
          const ms = num(c.manualScore);
          if (ms !== null && manualCol.pointsPossible > 0)
            setFrac(c.userId, manualCol.key, Math.max(0, Math.min(1, ms / manualCol.pointsPossible)));
        }
      }
    })(),
  ]);

  return { fractions, notes };
}

/** Compute one learner's row from their raw fractions. */
export function computeLearner(
  columns: GradebookColumn[],
  userFractions: Map<string, number> | undefined,
  userNotes: Map<string, string> | undefined,
  includeFormative: boolean,
  settings?: GradebookSettings,
): LearnerComputed {
  const cells: Record<string, CellValue> = {};
  let earned = 0;
  let possible = 0;
  const summativeSeries: number[] = [];

  // The learner's course-completion fraction (average of the completion columns). Used to
  // auto-score any GRADED (summative) item that has no explicit grade yet, so a finished course
  // never shows a graded row as a blank dash. (Config decision: auto-score from completion %.)
  let compSum = 0;
  let compN = 0;
  for (const col of columns) {
    if (col.sourceType !== "completion") continue;
    const f = userFractions?.get(col.key);
    if (f !== null && f !== undefined) { compSum += f; compN++; }
  }
  const completionFrac = compN > 0 ? compSum / compN : null;

  for (const col of columns) {
    let frac = userFractions?.get(col.key) ?? null;
    let auto = false;
    // Fill an ungraded summative item from completion, so every graded deliverable shows a score.
    if (frac === null && col.itemType === "summative" && completionFrac !== null) {
      frac = completionFrac;
      auto = true;
    }
    cells[col.key] = {
      fraction: frac,
      earned: frac === null ? null : frac * col.pointsPossible,
      note: userNotes?.get(col.key) ?? null,
      ...(auto ? { auto: true } : {}),
    };
    const counts = col.includeInGrade && (col.itemType === "summative" || includeFormative);
    if (counts && frac !== null) {
      earned += frac * col.pointsPossible;
      possible += col.pointsPossible;
    }
    if (col.includeInGrade && col.itemType === "summative" && frac !== null) summativeSeries.push(frac);
  }

  const overall = settings?.weightingEnabled
    ? weightedOverall(columns, userFractions, settings)
    : possible > 0
      ? (earned / possible) * 100
      : null;
  const band: LearnerComputed["band"] =
    overall === null ? "none" : overall >= 90 ? "good" : overall >= 70 ? "warn" : "low";
  const letterGrade = settings?.lettersEnabled ? letterFor(overall, settings.letterBands) : null;

  return { overallPercent: overall, band, letterGrade, trend: trendOf(summativeSeries), cells };
}

function trendOf(series: number[]): LearnerComputed["trend"] {
  if (series.length < 2) return { dir: "none", label: "Not enough data" };
  const mid = Math.ceil(series.length / 2);
  const early = series.slice(0, mid);
  const recent = series.slice(mid);
  if (recent.length === 0) return { dir: "none", label: "Not enough data" };
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const diff = avg(recent) - avg(early);
  if (diff >= 0.05) return { dir: "up", label: "Improving" };
  if (diff <= -0.05) return { dir: "down", label: "Check-in suggested" };
  return { dir: "flat", label: "Steady" };
}

/** Multi-signal off-track evaluation for one learner. */
export function evaluateOffTrack(
  columns: GradebookColumn[],
  computed: LearnerComputed,
): OffTrackResult {
  const reasons: string[] = [];
  const overallFrac = computed.overallPercent === null ? null : computed.overallPercent / 100;

  if (overallFrac !== null && overallFrac < PASS) reasons.push("mastery_low");
  if (computed.trend.dir === "down") reasons.push("trend_down");

  const now = Date.now();
  const missingOverdue = columns.some((c) => {
    if (!c.includeInGrade || c.itemType !== "summative") return false;
    if (!c.dueDate || new Date(c.dueDate).getTime() >= now) return false;
    return (computed.cells[c.key]?.fraction ?? null) === null;
  });
  if (missingOverdue) reasons.push("missing_summative");

  // Behind on the actual content: engagement matters, not just grades. A learner who has STARTED
  // the course but worked through less than half of the module content is falling behind even if
  // they have no low grades yet - so the coach reflects that instead of a misleading "on track".
  const completionCols = columns.filter((c) => c.sourceType === "completion");
  if (completionCols.length > 0) {
    const fracs = completionCols.map((c) => computed.cells[c.key]?.fraction ?? 0);
    const started = fracs.some((f) => f > 0.05);
    const avgCompletion = fracs.reduce((a, b) => a + b, 0) / fracs.length;
    // Don't override strong graded performance: a learner who is passing their graded work is
    // NOT "off track" merely for viewing less of the content (they may be testing out). This is
    // what wrongly flipped a 100% learner to off-track. Only treat low completion as an off-track
    // signal when grades aren't already demonstrating mastery.
    const gradesStrong = overallFrac !== null && overallFrac >= PASS;
    if (started && avgCompletion < 0.5 && !gradesStrong) reasons.push("low_completion");
  }

  let status: OffTrackResult["status"] = "on_track";
  if (reasons.length > 0) status = "off_track";
  else if (overallFrac !== null && overallFrac < AT_RISK) status = "at_risk";

  return { status, reasons, masteryPct: computed.overallPercent };
}

export interface AlertTransition {
  previousStatus: string | null;
  status: OffTrackResult["status"];
  reasons: string[];
  masteryPct: number | null;
  alertId: string | null;
  becameOffTrack: boolean;
}

/**
 * Recompute and persist one learner's alert for a course. Pure state update — it never
 * sends notifications or generates a plan (the caller orchestrates those). NEVER throws:
 * it is called from inside grade-write paths and must not break them.
 */
export async function recomputeLearnerAlert(courseId: string, userId: string): Promise<AlertTransition> {
  const empty: AlertTransition = {
    previousStatus: null,
    status: "on_track",
    reasons: [],
    masteryPct: null,
    alertId: null,
    becameOffTrack: false,
  };
  try {
    const columns = await getCourseColumns(courseId);
    const { fractions, notes } = await getScoreData(columns, [userId]);
    const computed = computeLearner(columns, fractions.get(userId), notes.get(userId), false);
    const evalR = evaluateOffTrack(columns, computed);

    const existing = await db.query.gradebookAlertsTable.findFirst({
      where: and(eq(gradebookAlertsTable.courseId, courseId), eq(gradebookAlertsTable.userId, userId)),
    });
    const previousStatus = existing?.status ?? null;
    const becameOffTrack = evalR.status === "off_track" && previousStatus !== "off_track";
    const masteryStr = evalR.masteryPct === null ? null : String(Math.round(evalR.masteryPct * 100) / 100);

    if (existing) {
      const [row] = await db
        .update(gradebookAlertsTable)
        .set({
          status: evalR.status,
          reasons: evalR.reasons,
          masteryPct: masteryStr,
          resolvedAt: evalR.status === "on_track" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(gradebookAlertsTable.id, existing.id))
        .returning();
      return { previousStatus, status: evalR.status, reasons: evalR.reasons, masteryPct: evalR.masteryPct, alertId: row?.id ?? existing.id, becameOffTrack };
    }
    const [row] = await db
      .insert(gradebookAlertsTable)
      .values({ courseId, userId, status: evalR.status, reasons: evalR.reasons, masteryPct: masteryStr })
      .returning();
    return { previousStatus, status: evalR.status, reasons: evalR.reasons, masteryPct: evalR.masteryPct, alertId: row?.id ?? null, becameOffTrack };
  } catch {
    return empty;
  }
}

/** Human-readable reason labels for UI + notifications. */
export const REASON_LABEL: Record<string, string> = {
  mastery_low: "Overall mastery below 70%",
  trend_down: "Recent summative scores trending down",
  missing_summative: "A graded assessment is overdue and not submitted",
  low_completion: "Behind on the module content (low completion)",
};
