import { anthropic } from "@workspace/integrations-anthropic-ai";
import { buildSocraticSystemPrompt, ensureQuestion, type SocraticContext } from "./socraticEngine";
import type { RubricCriterion, CaseMessage, CaseRubricScore } from "@workspace/db";

/**
 * Case / scenario engine. Wraps the shared Socratic engine so an authored case runs
 * through the SAME questions-only dialogue rules Praxis already uses, then layers the
 * case-specific pieces Sokratify contributes: a calibrated opening question, focus areas,
 * hard AI constraints, and an end-of-session analysis (narrative, strengths, dev areas,
 * engagement score, and optional rubric scoring).
 */

const MODEL = "claude-sonnet-4-6";
const ANALYSIS_MODEL = "claude-sonnet-4-6";

export interface CaseContext {
  title: string;
  learningObjective?: string | null;
  contextBlock: string;
  openingQuestion?: string | null;
  focusAreas?: string[] | null;
  aiConstraints?: string | null;
  guidingInstructions?: string | null;
  /** Domain-expert identity for the tutor (content-agnostic). Null = neutral mentor. */
  aiPersona?: string | null;
  promptLimit?: number | null;
  // Learner personalisation — present for authenticated sessions, absent for embed.
  learnerName?: string | null;
  personality?: string | null;
  learningStyle?: string | null;
  accommodations?: string[] | null;
  turnCount: number;
}

function toSocraticContext(c: CaseContext): SocraticContext {
  return {
    beatTitle: c.title,
    beatType: "case study",
    // The case's learning objective is source content; the fact pattern is the scenario.
    narration: c.learningObjective ?? null,
    scenario: c.contextBlock,
    bulletPoints: c.focusAreas ?? null,
    moduleTitle: "Case study",
    learnerName: c.learnerName ?? null,
    personality: c.personality ?? null,
    learningStyle: c.learningStyle ?? null,
    accommodations: c.accommodations ?? null,
    turnCount: c.turnCount,
    promptBudget: c.promptLimit ?? 8,
  };
}

/** A neutral, domain-agnostic default so a case with no persona still isn't "legal-flavoured". */
const DEFAULT_PERSONA = "a pragmatic entrepreneurship mentor who has built and advised small businesses";

/** Full system prompt for a case turn: shared Socratic rules + case-specific overlays. */
export function buildCaseSystemPrompt(c: CaseContext, isOpening: boolean): string {
  let prompt = buildSocraticSystemPrompt(toSocraticContext(c), isOpening);
  const extra: string[] = [];

  // Domain-expert identity — set FIRST so every question comes from the right professional
  // lens (finance, sales, ops, marketing, law, etc.), while the Socratic rules above still
  // bind. Content-agnostic: whatever the author supplies, or a neutral mentor by default.
  const persona = c.aiPersona?.trim() || DEFAULT_PERSONA;
  extra.push(
    `EXPERT PERSONA - for this case you ARE ${persona}. Ask from that professional's expertise, judgement and vocabulary. This shapes WHAT you probe and HOW you frame it, but you still obey every Socratic rule above: questions only, never lecture, never give the answer.`
  );

  if (c.focusAreas?.length) {
    extra.push("FOCUS AREAS (steer the learner's reasoning toward these, one at a time): " + c.focusAreas.join("; ") + ".");
  }
  if (c.guidingInstructions) {
    extra.push("AUTHOR GUIDANCE (what this case is really testing): " + c.guidingInstructions);
  }
  if (c.aiConstraints) {
    extra.push(
      "HARD CONSTRAINTS - you must NEVER state, confirm or reveal the following; only lead the learner to discover it themselves: " +
        c.aiConstraints
    );
  }
  if (isOpening && c.openingQuestion?.trim()) {
    extra.push(
      `CALIBRATED OPENING - begin with EXACTLY this question (you may only adjust it to address the learner by name): "${c.openingQuestion.trim()}"`
    );
  }
  if (extra.length) prompt += "\n\n" + extra.join("\n\n");
  return prompt;
}

/**
 * The opening move. If the author wrote a calibrated opening question we use it verbatim
 * (that IS the calibration); otherwise we generate one grounded strictly in the case.
 */
export async function generateCaseOpening(c: CaseContext): Promise<string> {
  if (c.openingQuestion?.trim()) {
    return ensureQuestion(c.openingQuestion.trim());
  }
  const system = buildCaseSystemPrompt({ ...c, turnCount: 0 }, true);
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: "I'm ready to begin this case. Ask me the first question." }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return ensureQuestion(text);
  } catch {
    return ensureQuestion(
      `Take a first look at this case. What stands out to you as the most important fact, and why?`
    );
  }
}

export interface CaseAnalysis {
  engagementScore: number; // 1-10
  engagementNarrative: string;
  conceptsAddressed: string[];
  reasoningStrengths: string[];
  developmentAreas: string[];
  rubricScores: CaseRubricScore[];
}

function transcriptText(messages: CaseMessage[]): string {
  return messages
    .map((m) => `${m.role === "tutor" ? "COACH" : "LEARNER"}: ${m.content}`)
    .join("\n");
}

/**
 * End-of-session analysis. Scores demonstrated reasoning (never writing quality), names
 * concepts the learner engaged, their reasoning strengths and development areas, and — if a
 * rubric is supplied — awards points per criterion. Returns strict JSON.
 */
export async function generateCaseAnalysis(
  c: { title: string; learningObjective?: string | null; contextBlock: string; focusAreas?: string[] | null },
  messages: CaseMessage[],
  rubric?: { criteria: RubricCriterion[] } | null
): Promise<CaseAnalysis> {
  const rubricBlock =
    rubric?.criteria?.length
      ? `\n\nRUBRIC — award points per criterion (0..maxPoints) based ONLY on evidence in the transcript:\n` +
        rubric.criteria.map((cr) => `- "${cr.name}" (max ${cr.maxPoints})`).join("\n")
      : "";

  const rubricShape = rubric?.criteria?.length
    ? `,\n  "rubricScores": [{"criterion": string, "points": number, "maxPoints": number, "note": "one short sentence"}]`
    : `,\n  "rubricScores": []`;

  const system = `You are a rigorous but fair assessor of Socratic case reasoning for "${c.title}".
Learning objective: ${c.learningObjective ?? "(not specified)"}.
Case facts: ${c.contextBlock}
${c.focusAreas?.length ? "Focus areas the case targets: " + c.focusAreas.join("; ") + "." : ""}
Assess ONLY the learner's demonstrated reasoning across the whole dialogue — not writing length, tone or confidence.
Return a SINGLE strict JSON object, no prose around it:
{
  "engagementNarrative": "2-3 sentences on how the learner reasoned through the case",
  "conceptsAddressed": [string],
  "reasoningStrengths": [string],
  "developmentAreas": [string],
  "engagementScore": number (1-10, 10 = expert-level reasoning fully applied to the facts)${rubricShape}
}${rubricBlock}`;

  try {
    const msg = await anthropic.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 1200,
      system,
      messages: [
        {
          role: "user",
          content: `Full dialogue transcript:\n${transcriptText(messages)}\n\nReturn only the JSON.`,
        },
      ],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const p = JSON.parse(match[0]);
      const clampScore = Math.max(1, Math.min(10, Math.round(Number(p.engagementScore) || 0)));
      const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
      const scores: CaseRubricScore[] = Array.isArray(p.rubricScores)
        ? p.rubricScores.map((s: Record<string, unknown>) => ({
            criterion: String(s.criterion ?? ""),
            points: Math.max(0, Math.round(Number(s.points) || 0)),
            maxPoints: Math.max(0, Math.round(Number(s.maxPoints) || 0)),
            note: String(s.note ?? ""),
          }))
        : [];
      return {
        engagementScore: clampScore,
        engagementNarrative: String(p.engagementNarrative ?? ""),
        conceptsAddressed: arr(p.conceptsAddressed),
        reasoningStrengths: arr(p.reasoningStrengths),
        developmentAreas: arr(p.developmentAreas),
        rubricScores: scores,
      };
    }
  } catch {
    // fall through
  }
  return {
    engagementScore: 5,
    engagementNarrative: "Analysis could not be generated automatically. Please review the transcript directly.",
    conceptsAddressed: [],
    reasoningStrengths: [],
    developmentAreas: [],
    rubricScores: [],
  };
}

/** AI-draft a rubric for a case (author can then edit). Criteria sum to ~100 points. */
export async function generateRubricDraft(c: {
  title: string;
  learningObjective?: string | null;
  contextBlock: string;
  focusAreas?: string[] | null;
}): Promise<{ criteria: RubricCriterion[]; totalPoints: number }> {
  const system = `You design assessment rubrics for Socratic case discussions.
Produce 3-5 criteria that together assess reasoning on this case. Points across criteria should sum to 100.
Each criterion has 3-4 performance levels from low to high, each with a points value and a one-line descriptor.
Return a SINGLE strict JSON object:
{"criteria": [{"name": string, "maxPoints": number, "levels": [{"label": string, "points": number, "description": string}]}], "totalPoints": 100}`;

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1400,
      system,
      messages: [
        {
          role: "user",
          content: `Case title: ${c.title}
Learning objective: ${c.learningObjective ?? "(none)"}
Case facts: ${c.contextBlock}
${c.focusAreas?.length ? "Focus areas: " + c.focusAreas.join("; ") : ""}
Return only the JSON.`,
        },
      ],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const p = JSON.parse(match[0]);
      if (Array.isArray(p.criteria)) {
        const criteria: RubricCriterion[] = p.criteria.map((cr: Record<string, unknown>) => ({
          name: String(cr.name ?? "Criterion"),
          maxPoints: Math.max(1, Math.round(Number(cr.maxPoints) || 0)),
          unitStandardId: null,
          levels: Array.isArray(cr.levels)
            ? (cr.levels as Record<string, unknown>[]).map((lv) => ({
                label: String(lv.label ?? ""),
                points: Math.max(0, Math.round(Number(lv.points) || 0)),
                description: String(lv.description ?? ""),
              }))
            : [],
        }));
        const totalPoints = criteria.reduce((s, cr) => s + cr.maxPoints, 0) || 100;
        return { criteria, totalPoints };
      }
    }
  } catch {
    // fall through
  }
  return { criteria: [], totalPoints: 100 };
}

export { MODEL as CASE_MODEL };
