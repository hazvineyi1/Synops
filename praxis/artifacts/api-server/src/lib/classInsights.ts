import { db } from "@workspace/db";
import {
  orgClassLearnersTable, orgClassCoursesTable, usersTable, enrolmentsTable,
  interactiveActivitiesTable, activitySubmissionsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { courseProgress } from "./progressMath";

/**
 * Class insight aggregation, turns the activity/game/Math-Coach submissions and lesson progress of a
 * class's learners into a per-learner and class-level picture a teacher can act on. Off-track is
 * derived from the signals we actually have here (progress, scores, recency) so it works even when the
 * formal gradebook-alert pipeline hasn't run for a course.
 */
export interface LearnerInsight {
  userId: string; name: string; email: string;
  progressPct: number;       // avg lesson completion across the class's courses
  avgScore: number | null;   // avg of best score per activity (0-100), null if none played
  activitiesDone: number;    // distinct activities/games completed
  attempts: number;          // total submissions
  lastActiveAt: string | null;
  status: "on_track" | "at_risk" | "off_track";
  reasons: string[];
}
export interface ClassInsights {
  classId: string;
  learnerCount: number; courseCount: number;
  summary: {
    onTrack: number; atRisk: number; offTrack: number;
    avgProgress: number; avgScore: number | null;
    activitiesCompleted: number; participationPct: number;
  };
  topGames: { activityId: string; title: string; kind: string; plays: number; avgScore: number | null }[];
  learners: LearnerInsight[];
}

function classify(progressPct: number, avgScore: number | null, hasActivity: boolean, daysSinceActive: number | null): { status: LearnerInsight["status"]; reasons: string[] } {
  const reasons: string[] = [];
  if (progressPct < 30) reasons.push("Low lesson progress");
  if (hasActivity && avgScore != null && avgScore < 60) reasons.push("Low game scores");
  if (hasActivity && daysSinceActive != null && daysSinceActive > 14) reasons.push("Inactive 2+ weeks");
  if (!hasActivity && progressPct < 10) reasons.push("Not started");
  if (reasons.length >= 2 || progressPct < 12) return { status: "off_track", reasons };
  if (progressPct < 60 || (hasActivity && avgScore != null && avgScore < 75) || reasons.length) return { status: "at_risk", reasons };
  return { status: "on_track", reasons: [] };
}

export async function computeClassInsights(classId: string): Promise<ClassInsights> {
  const [learnerRows, courseRows] = await Promise.all([
    db.select({ id: orgClassLearnersTable.learnerId }).from(orgClassLearnersTable).where(eq(orgClassLearnersTable.classId, classId)),
    db.select({ id: orgClassCoursesTable.courseId }).from(orgClassCoursesTable).where(eq(orgClassCoursesTable.classId, classId)),
  ]);
  const learnerIds = [...new Set(learnerRows.map((r) => r.id))];
  const courseIds = [...new Set(courseRows.map((r) => r.id))];
  const empty: ClassInsights = {
    classId, learnerCount: learnerIds.length, courseCount: courseIds.length,
    summary: { onTrack: 0, atRisk: 0, offTrack: 0, avgProgress: 0, avgScore: null, activitiesCompleted: 0, participationPct: 0 },
    topGames: [], learners: [],
  };
  if (!learnerIds.length) return empty;

  const users = await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, learnerIds));
  const userById = new Map(users.map((u) => [u.id, u]));

  // Which of the class's courses each learner is actually enrolled in, progress is averaged over
  // those, not all class courses (a learner may only take one subject in the class).
  const enrols = courseIds.length
    ? await db.select({ userId: enrolmentsTable.userId, courseId: enrolmentsTable.courseId }).from(enrolmentsTable).where(and(inArray(enrolmentsTable.userId, learnerIds), inArray(enrolmentsTable.courseId, courseIds)))
    : [];
  const coursesByUser = new Map<string, string[]>();
  for (const e of enrols) { const arr = coursesByUser.get(e.userId) ?? []; arr.push(e.courseId); coursesByUser.set(e.userId, arr); }

  // Activities (games + Math Coach + quizzes) that belong to the class's courses.
  const acts = courseIds.length
    ? await db.select({ id: interactiveActivitiesTable.id, title: interactiveActivitiesTable.title, kind: interactiveActivitiesTable.kind, maxScore: interactiveActivitiesTable.maxScore })
        .from(interactiveActivitiesTable).where(inArray(interactiveActivitiesTable.courseId, courseIds))
    : [];
  const actIds = acts.map((a) => a.id);
  const maxById = new Map(acts.map((a) => [a.id, Number(a.maxScore) || 100]));

  const subs = (actIds.length && learnerIds.length)
    ? await db.select({ userId: activitySubmissionsTable.userId, activityId: activitySubmissionsTable.activityId, score: activitySubmissionsTable.score, submittedAt: activitySubmissionsTable.submittedAt })
        .from(activitySubmissionsTable).where(and(inArray(activitySubmissionsTable.userId, learnerIds), inArray(activitySubmissionsTable.activityId, actIds)))
    : [];
  const pctOf = (activityId: string, score: unknown) => { const m = maxById.get(activityId) || 100; const s = Number(score); return Number.isFinite(s) ? Math.max(0, Math.min(100, m > 0 ? (s / m) * 100 : s)) : null; };

  // Per-learner best score per activity + recency.
  const bestByUser = new Map<string, Map<string, number>>(); // userId -> activityId -> best pct
  const attemptsByUser = new Map<string, number>();
  const lastByUser = new Map<string, number>();
  const playsByAct = new Map<string, number>();
  const scoreSumByAct = new Map<string, { sum: number; n: number }>();
  for (const s of subs) {
    attemptsByUser.set(s.userId, (attemptsByUser.get(s.userId) ?? 0) + 1);
    const t = s.submittedAt ? new Date(s.submittedAt).getTime() : 0;
    if (t > (lastByUser.get(s.userId) ?? 0)) lastByUser.set(s.userId, t);
    playsByAct.set(s.activityId, (playsByAct.get(s.activityId) ?? 0) + 1);
    const p = pctOf(s.activityId, s.score);
    if (p != null) {
      const bu = bestByUser.get(s.userId) ?? new Map<string, number>();
      if (p > (bu.get(s.activityId) ?? -1)) bu.set(s.activityId, p);
      bestByUser.set(s.userId, bu);
      const sa = scoreSumByAct.get(s.activityId) ?? { sum: 0, n: 0 };
      sa.sum += p; sa.n += 1; scoreSumByAct.set(s.activityId, sa);
    }
  }

  const now = Date.now();
  const learners: LearnerInsight[] = [];
  for (const uid of learnerIds) {
    const u = userById.get(uid);
    // Average lesson progress across the courses THIS learner is enrolled in (within the class).
    let progressPct = 0;
    const myCourses = coursesByUser.get(uid) ?? [];
    if (myCourses.length) {
      const progs = await Promise.all(myCourses.map((cid) => courseProgress(uid, cid).catch(() => ({ percent: 0 }))));
      progressPct = Math.round(progs.reduce((a, p) => a + (p.percent || 0), 0) / myCourses.length);
    }
    const best = bestByUser.get(uid);
    const bestVals = best ? [...best.values()] : [];
    const avgScore = bestVals.length ? Math.round(bestVals.reduce((a, b) => a + b, 0) / bestVals.length) : null;
    const activitiesDone = best ? best.size : 0;
    const lastMs = lastByUser.get(uid) ?? null;
    const daysSince = lastMs ? Math.floor((now - lastMs) / 86400000) : null;
    const { status, reasons } = classify(progressPct, avgScore, activitiesDone > 0, daysSince);
    learners.push({
      userId: uid, name: `${u?.firstName ?? ""} ${u?.lastName ?? ""}`.trim() || (u?.email ?? "Learner"), email: u?.email ?? "",
      progressPct, avgScore, activitiesDone, attempts: attemptsByUser.get(uid) ?? 0,
      lastActiveAt: lastMs ? new Date(lastMs).toISOString() : null, status, reasons,
    });
  }
  learners.sort((a, b) => (a.status === b.status ? b.progressPct - a.progressPct : rank(a.status) - rank(b.status)));

  const withScores = learners.filter((l) => l.avgScore != null);
  const played = learners.filter((l) => l.activitiesDone > 0).length;
  const topGames = acts
    .map((a) => ({ activityId: a.id, title: a.title, kind: a.kind, plays: playsByAct.get(a.id) ?? 0, avgScore: scoreSumByAct.get(a.id) ? Math.round((scoreSumByAct.get(a.id)!.sum) / (scoreSumByAct.get(a.id)!.n)) : null }))
    .filter((g) => g.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 5);

  return {
    classId, learnerCount: learnerIds.length, courseCount: courseIds.length,
    summary: {
      onTrack: learners.filter((l) => l.status === "on_track").length,
      atRisk: learners.filter((l) => l.status === "at_risk").length,
      offTrack: learners.filter((l) => l.status === "off_track").length,
      avgProgress: Math.round(learners.reduce((a, l) => a + l.progressPct, 0) / learners.length),
      avgScore: withScores.length ? Math.round(withScores.reduce((a, l) => a + (l.avgScore ?? 0), 0) / withScores.length) : null,
      activitiesCompleted: learners.reduce((a, l) => a + l.activitiesDone, 0),
      participationPct: Math.round((played / learners.length) * 100),
    },
    topGames, learners,
  };
}

function rank(s: LearnerInsight["status"]): number { return s === "off_track" ? 0 : s === "at_risk" ? 1 : 2; }
