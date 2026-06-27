import { db } from "@workspace/db";
import {
  conceptsTable,
  checkpointsTable,
  dailyPlansTable,
  retrospectivesTable,
} from "@workspace/db";
import { eq, desc, and, isNotNull } from "drizzle-orm";

export interface LearnerContextOptions {
  includeConcepts?: boolean;
  includeCheckpoints?: boolean;
  includePlans?: boolean;
  includeRetros?: boolean;
  conceptLimit?: number;
  checkpointLimit?: number;
  planLimit?: number;
}

export async function buildLearnerContext(
  userId: string,
  opts: LearnerContextOptions = {},
): Promise<string> {
  const {
    includeConcepts = true,
    includeCheckpoints = true,
    includePlans = true,
    includeRetros = true,
    conceptLimit = 40,
    checkpointLimit = 8,
    planLimit = 5,
  } = opts;

  const parts: string[] = [];

  if (includeConcepts) {
    const concepts = await db
      .select()
      .from(conceptsTable)
      .where(eq(conceptsTable.userId, userId))
      .orderBy(desc(conceptsTable.id))
      .limit(conceptLimit);

    if (concepts.length > 0) {
      const bySource = new Map<string, number>();
      concepts.forEach((c) => bySource.set(c.source, (bySource.get(c.source) ?? 0) + 1));
      const sourceSummary = Array.from(bySource.entries())
        .map(([s, n]) => `${n} ${s}`)
        .join(", ");

      const lines = concepts.slice(0, 20).map((c) => {
        const masteryPct = Math.round(c.mastery * 100);
        const tag = c.reps === 0 ? "new" : c.mastery >= 0.8 ? "mastered" : c.mastery < 0.4 ? "weak" : "learning";
        return `  - [id ${c.id}] "${c.title}" [${tag}, mastery ${masteryPct}%, reps ${c.reps}, due ${c.dueDate}] :: ${c.content.slice(0, 140)}`;
      });

      parts.push(
        `LEARNER NOTES & MATERIAL (${concepts.length} concepts ingested from: ${sourceSummary}). Use the bracketed id when you issue a CHECKPOINT for a concept:\n${lines.join("\n")}${concepts.length > 20 ? `\n  ...and ${concepts.length - 20} more concepts not listed` : ""}`,
      );
    } else {
      parts.push("LEARNER NOTES & MATERIAL: none ingested yet.");
    }
  }

  if (includeCheckpoints) {
    const checkpoints = await db
      .select()
      .from(checkpointsTable)
      .where(and(eq(checkpointsTable.userId, userId), isNotNull(checkpointsTable.coachGrade)))
      .orderBy(desc(checkpointsTable.id))
      .limit(checkpointLimit);

    if (checkpoints.length > 0) {
      const lines = checkpoints.map((c) => {
        const feedback = (c.coachFeedback ?? "").replace(/\s+/g, " ").slice(0, 160);
        const answer = (c.userAnswer ?? "").replace(/\s+/g, " ").slice(0, 120);
        const conf = c.confidenceBefore != null ? ` (felt ${c.confidenceBefore}/3 sure)` : "";
        return `  - grade ${c.coachGrade}/3${conf} on "${(c.prompt ?? "").slice(0, 80)}" :: learner said "${answer}" :: coach noted "${feedback}"`;
      });
      const graded = checkpoints.filter((c) => c.coachGrade !== null);
      const avg = graded.reduce((s, c) => s + (c.coachGrade ?? 0), 0) / Math.max(1, graded.length);

      // Measured calibration: how the learner's stated confidence compares to how
      // they actually scored. The coach should reference this gap visibly.
      const withConf = graded.filter((c) => c.confidenceBefore != null);
      let calibrationNote = "";
      if (withConf.length >= 2) {
        const avgConf = withConf.reduce((s, c) => s + (c.confidenceBefore ?? 0), 0) / withConf.length;
        const avgGradeConf = withConf.reduce((s, c) => s + (c.coachGrade ?? 0), 0) / withConf.length;
        const gap = avgConf - avgGradeConf;
        const label =
          Math.abs(gap) <= 0.4
            ? "well-calibrated: confidence matches results"
            : gap > 0.4
              ? "overconfident: feels surer than the results warrant"
              : "underconfident: sells themselves short, knows more than they think";
        calibrationNote = `\nCALIBRATION (over ${withConf.length} checkpoints): avg confidence ${avgConf.toFixed(1)}/3 vs avg grade ${avgGradeConf.toFixed(1)}/3 — ${label}. Reference this gap when it is relevant and encouraging.`;
      }

      parts.push(
        `PAST CHECKPOINTS & EXAMS (last ${checkpoints.length}, avg grade ${avg.toFixed(1)}/3):\n${lines.join("\n")}${calibrationNote}`,
      );
    } else {
      parts.push("PAST CHECKPOINTS & EXAMS: none yet.");
    }
  }

  if (includePlans) {
    const plans = await db
      .select()
      .from(dailyPlansTable)
      .where(eq(dailyPlansTable.userId, userId))
      .orderBy(desc(dailyPlansTable.date))
      .limit(planLimit);

    if (plans.length > 0) {
      const lines = plans.map((p) => {
        const done = (p.completedConceptIds as number[] | null)?.length ?? 0;
        const total = (p.conceptIds as number[] | null)?.length ?? 0;
        return `  - ${p.date}: ${p.status} (${done}/${total} concepts) — goal: ${p.goalText}`;
      });
      parts.push(`RECENT DAILY PLANS:\n${lines.join("\n")}`);
    }
  }

  if (includeRetros) {
    const retros = await db
      .select()
      .from(retrospectivesTable)
      .where(eq(retrospectivesTable.userId, userId))
      .orderBy(desc(retrospectivesTable.id))
      .limit(2);

    if (retros.length > 0) {
      const lines = retros.map((r) => `  - week of ${r.weekStart}: ${r.content.replace(/\s+/g, " ").slice(0, 280)}`);
      parts.push(`RECENT WEEKLY RETROSPECTIVES:\n${lines.join("\n")}`);
    }
  }

  return parts.join("\n\n");
}
