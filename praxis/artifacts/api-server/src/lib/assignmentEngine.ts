import { anthropic, isAiConfigured } from "@workspace/integrations-anthropic-ai";
import { languageName } from "./caseEngine";
import type { AssignmentRubricCriterion, AssignmentCriterionScore } from "@workspace/db";

/**
 * AI assessment of a written assignment.
 *
 * PROVISIONAL BY DESIGN. Nothing in here writes a grade. It produces a draft that a human
 * confirms, because a grade in this system is not just a number: writing one fires
 * onGradeEvent, which recomputes off-track status, auto-generates a study plan and emails
 * both staff and the learner. A model's opinion should not be able to set that in motion
 * on its own.
 *
 * The value it does deliver is speed of FEEDBACK. A learner who submits at 22:00 can read
 * a considered response to their actual argument immediately, instead of in a fortnight,
 * and that is where most of the learning gain in written work sits.
 */
const MODEL = "claude-sonnet-4-6";

export interface AssignmentGradeDraft {
  /** Points out of the assignment's total. Null when we could not assess. */
  score: number | null;
  /** Prose addressed to the learner. */
  feedback: string;
  /** Per-criterion outcome, empty when the assignment has no rubric. */
  rubricScores: AssignmentCriterionScore[];
  /** False when AI is unconfigured or the call failed -- caller must not pretend otherwise. */
  ok: boolean;
}

const EMPTY: AssignmentGradeDraft = { score: null, feedback: "", rubricScores: [], ok: false };

function buildSystem(opts: {
  title: string;
  instructions?: string | null;
  pointsPossible: number;
  criteria: AssignmentRubricCriterion[];
  langCode?: string | null;
}): string {
  const lines = [
    "You are an experienced assessor marking written work for adult learners on a South African vocational course.",
    "",
    "HOW TO MARK:",
    "1. Mark what the learner ACTUALLY wrote against the task and the rubric. Never reward length, vocabulary or confidence in place of substance.",
    "2. Feedback speaks TO the learner, in second person, and is specific enough to act on. Quote or name the thing you are responding to.",
    "3. Say what is strong before what is missing, and be concrete about both. 'Good effort' and 'needs more detail' are useless.",
    "4. Where the work falls short, describe what a stronger response would have done -- do not write it for them.",
    "5. Do not invent facts about the learner, their workplace or their intent beyond what the submission says.",
    "6. If the submission is empty, off-topic, or too short to assess, say so plainly and score it low rather than guessing generously.",
    "7. No praise sandwiches and no filler. Warm, direct, professional.",
  ];
  if (opts.criteria.length) {
    lines.push(
      "",
      "RUBRIC -- score every criterion, never exceed its maxPoints:",
      ...opts.criteria.map((c) => {
        const levels = (c.levels ?? []).map((l) => `${l.label} (${l.points}): ${l.description}`).join(" | ");
        return `- ${c.name} [max ${c.maxPoints}]${levels ? ` :: ${levels}` : ""}`;
      }),
    );
  } else {
    lines.push("", `No rubric was supplied. Judge the work against the task and award a total out of ${opts.pointsPossible}.`);
  }
  if (opts.langCode && opts.langCode !== "en") {
    lines.push("", `LANGUAGE: write your feedback in natural, fluent ${languageName(opts.langCode)}.`);
  }
  lines.push(
    "",
    `TASK: ${opts.title}`,
    opts.instructions ? `INSTRUCTIONS GIVEN TO THE LEARNER: ${opts.instructions}` : "",
    "",
    "Return a SINGLE strict JSON object and nothing else:",
    "{",
    `  "score": <number 0..${opts.pointsPossible}>,`,
    '  "feedback": "<prose to the learner>",',
    '  "rubricScores": [{ "criterion": "<name>", "points": <number>, "maxPoints": <number>, "note": "<why>" }]',
    "}",
    "rubricScores must be [] when no rubric was supplied.",
  );
  return lines.filter(Boolean).join("\n");
}

/**
 * Draft an assessment. Never throws: on any failure the caller gets ok:false and should
 * leave the submission unassessed rather than inventing a score.
 */
export async function generateAssignmentGrade(opts: {
  title: string;
  instructions?: string | null;
  pointsPossible: number;
  criteria?: AssignmentRubricCriterion[] | null;
  submissionText: string;
  langCode?: string | null;
}): Promise<AssignmentGradeDraft> {
  if (!isAiConfigured()) return EMPTY;
  const text = (opts.submissionText ?? "").trim();
  if (!text) return EMPTY;

  const criteria = opts.criteria ?? [];
  const max = opts.pointsPossible > 0 ? opts.pointsPossible : 100;

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1600,
      system: buildSystem({ ...opts, pointsPossible: max, criteria }),
      messages: [{ role: "user", content: `THE LEARNER'S SUBMISSION:\n\n${text.slice(0, 60000)}` }],
    });
    const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return EMPTY;
    const parsed = JSON.parse(m[0]) as {
      score?: unknown; feedback?: unknown; rubricScores?: unknown;
    };

    // Clamp everything. A model returning 150/100 must not inflate a gradebook.
    const rawScore = Number(parsed.score);
    const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(max, rawScore)) : null;

    const byName = new Map(criteria.map((c) => [c.name, c.maxPoints]));
    const rubricScores: AssignmentCriterionScore[] = Array.isArray(parsed.rubricScores)
      ? (parsed.rubricScores as Record<string, unknown>[]).map((r) => {
          const name = String(r.criterion ?? "");
          const capped = byName.get(name) ?? Number(r.maxPoints) ?? 0;
          const pts = Number(r.points);
          return {
            criterion: name,
            points: Number.isFinite(pts) ? Math.max(0, Math.min(capped, pts)) : 0,
            maxPoints: capped,
            note: String(r.note ?? ""),
          };
        }).filter((r) => r.criterion)
      : [];

    const feedback = String(parsed.feedback ?? "").trim();
    if (!feedback && score === null) return EMPTY;
    return { score, feedback, rubricScores, ok: true };
  } catch {
    return EMPTY;
  }
}
