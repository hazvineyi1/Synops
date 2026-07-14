import { anthropic } from "@workspace/integrations-anthropic-ai";

const MODEL = "claude-sonnet-4-6";

export interface SocraticContext {
  beatTitle?: string | null;
  beatType?: string | null;
  narration?: string | null;
  scenario?: string | null;
  bulletPoints?: string[] | null;
  moduleTitle?: string | null;
  learnerName?: string | null;
  personality?: string | null; // coachPersonalityEnum
  learningStyle?: string | null; // VARK
  accommodations?: string[] | null;
  turnCount: number; // exchanges so far
  promptBudget?: number; // soft budget of exchanges
}

// ── Coach personalities (Coach-inspired) — voice & pressure only.
// Accuracy, pedagogy and memory are identical across all four.
const PERSONALITIES: Record<string, string> = {
  socratic_mentor:
    "PERSONALITY: The Socratic Mentor. Calm, curious, patient. You draw the learner out with genuine interest, never rushing. Warmth through attention, not praise.",
  drill_sergeant:
    "PERSONALITY: The Drill Sergeant. Direct, demanding, high-tempo. You hold a high bar and push hard toward the goal. Pressure is always about the work and the standard, NEVER about the person's worth. No insults, no shaming.",
  warm_encourager:
    "PERSONALITY: The Warm Encourager. Supportive, affirming, human. You name effort and progress, then immediately raise the next question. Encouragement never replaces rigour.",
  strategic_analyst:
    "PERSONALITY: The Strategic Analyst. Precise, structured, evidence-driven. You expose gaps in reasoning with clean logic and make the learner defend each claim.",
};

// ── Per-learner accommodations (Sokratify Spark-inspired).
const ACCOMMODATIONS: Record<string, string> = {
  scaffolded_questions:
    "Break each question into one small, concrete step at a time. Never stack two asks in one question.",
  simplified_language:
    "Use short, plain sentences and common workplace vocabulary. Avoid jargon unless the learner uses it first.",
  concrete_examples:
    "Anchor every question in a concrete, real-world workplace example rather than the abstract principle.",
  positive_reinforcement:
    "Acknowledge genuine effort briefly before each new question. Keep it sincere and specific, never empty praise.",
  chunked_content:
    "Focus on one idea per exchange. Do not introduce a second concept until the first is settled.",
  explicit_transitions:
    "Signal clearly when you move to a new angle, e.g. 'Now let us look at this from the customer's side.'",
  predictable_structure:
    "Keep a steady rhythm: brief acknowledgement, then one question. Same shape every time.",
  extended_processing:
    "Invite the learner to take their time. Never imply they are slow. Ask one thing and wait.",
  literal_language:
    "Avoid idioms, sarcasm and figurative language. Ask exactly what you mean.",
};

// ── VARK learning styles — adapt HOW you question, never label the learner.
const VARK: Record<string, string> = {
  visual:
    "LEARNING STYLE (adapt questioning): ask the learner to picture, map or sketch relationships. Use spatial framing ('where does this sit relative to...').",
  auditory:
    "LEARNING STYLE (adapt questioning): keep it conversational, invite the learner to talk it through aloud, to explain as if teaching a colleague.",
  kinesthetic:
    "LEARNING STYLE (adapt questioning): frame around action and doing — 'walk me through what you would physically do next'.",
  reading_writing:
    "LEARNING STYLE (adapt questioning): invite precise, structured wording, definitions and step lists in prose.",
};

function cleanDashes(text: string): string {
  return text.replace(/\u2014/g, " - ").replace(/\u2013/g, "-");
}

// Ensure every emitted turn ends on a question so the dialogue never stalls.
export function ensureQuestion(text: string): string {
  const trimmed = cleanDashes(text).replace(/\s+$/, "");
  if (!trimmed) {
    return "Take a moment with this - what is the first thing that stands out to you, and why?";
  }
  if (trimmed.endsWith("?")) return trimmed;
  return trimmed + " What is the next piece of your thinking you want to put into words?";
}

function baseRules(turnCount: number, budget: number): string {
  const atBudget = turnCount >= budget;
  const nearEnd = !atBudget && turnCount >= budget - 1;
  const approaching = !atBudget && !nearEnd && turnCount >= Math.max(1, budget - 2);

  const countdown = atBudget
    ? " You have reached the planned depth for this exchange. Do NOT end the session. Ask a synthesis question that ties together what the learner has said, then keep going as long as they stay engaged."
    : nearEnd
    ? " You are near the planned end. Ask a question that pulls the main threads together, but keep going if the learner has more."
    : approaching
    ? " You are approaching the planned end. Begin steering toward synthesis."
    : "";

  return `ABSOLUTE CONSTRAINTS - NEVER VIOLATE:
1. You NEVER give the answer, conclusion or solution directly, not even partially.
2. You respond ONLY with questions that develop the learner's reasoning.
3. If the learner says "just tell me", decline gently and ask what they already know that could help them work it out.
4. Each question builds directly on the learner's previous answer - never a random tangent.
5. Escalate complexity as the learner shows competence; simplify if they struggle.
6. TOPIC DISCIPLINE: stay strictly on the current concept. If the learner writes "idk", "ok", nothing of substance, or goes off-topic, acknowledge briefly then ask a fresh focused question that returns them to the concept from a new angle. The conversation never dies.
7. Redirect errors gently - never shame, never mock.
8. Keep responses under 90 words. ONE focused question at a time. No bullet points, no lists, pure dialogue.
9. NEVER use em dashes or en dashes. Use a comma, colon or hyphen.
10. Use workplace-authentic South African English.
11. EVERY response - without exception - ends with exactly ONE question mark. If you have just validated the learner, the very next sentence is a question.
12. You are at exchange ${turnCount} of a soft budget of ${budget} (a guide, not a hard stop).${countdown}`;
}

export function buildSocraticSystemPrompt(ctx: SocraticContext, isOpening: boolean): string {
  const budget = ctx.promptBudget ?? 8;
  const parts: string[] = [];

  parts.push(
    "You are a Socratic coach on Synops Praxis, using Knowles' andragogy: you guide adult learners to insight through questioning, never lecturing."
  );
  parts.push(PERSONALITIES[ctx.personality ?? "socratic_mentor"] ?? PERSONALITIES.socratic_mentor);
  parts.push(baseRules(ctx.turnCount, budget));

  if (ctx.learningStyle && VARK[ctx.learningStyle]) {
    parts.push(VARK[ctx.learningStyle]);
  }
  const accoms = (ctx.accommodations ?? [])
    .map((a) => ACCOMMODATIONS[a])
    .filter(Boolean);
  if (accoms.length) {
    parts.push("LEARNER ACCOMMODATIONS (apply silently, never announce or label):\n- " + accoms.join("\n- "));
  }

  const contextBlock = [
    ctx.moduleTitle ? `Module: ${ctx.moduleTitle}` : "",
    ctx.beatTitle ? `Current concept: "${ctx.beatTitle}"${ctx.beatType ? ` (${ctx.beatType})` : ""}` : "",
    ctx.narration ? `Source content: ${ctx.narration}` : "",
    ctx.scenario ? `Scenario: ${ctx.scenario}` : "",
    ctx.bulletPoints?.length ? `Key points: ${ctx.bulletPoints.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (contextBlock) parts.push("CONTEXT (ground every question strictly in this):\n" + contextBlock);

  if (isOpening) {
    const greet = ctx.learnerName
      ? `Address the learner as ${ctx.learnerName} once, naturally, then not again.`
      : "";
    parts.push(
      `OPENING RULE - ABSOLUTE PRIORITY: Begin with ONE focused Socratic question drawn directly from the context above - never with information, preamble or a generic "what would you like to work on". ${greet}`
    );
  }

  return parts.join("\n\n");
}

/**
 * Non-streaming Socratic turn — used by channels that cannot stream
 * (e.g. WhatsApp). Returns the full coach question, guaranteed to end
 * on a question mark.
 */
export async function generateSocraticTurn(
  ctx: SocraticContext,
  chatMessages: { role: "user" | "assistant"; content: string }[],
  isOpening = false
): Promise<string> {
  const system = buildSocraticSystemPrompt(ctx, isOpening);
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: chatMessages,
  });
  const text = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  return ensureQuestion(text);
}

export interface CheckpointGrade {
  grade: 0 | 1 | 2 | 3;
  reasoning: string;
}

/**
 * Grade the learner's understanding 0-3 from the dialogue (Coach-inspired
 * checkpoint). This replaces the old response-length heuristic and drives
 * both SM-2 scheduling and PraxisMark issuance.
 */
export async function gradeCheckpoint(
  ctx: SocraticContext,
  learnerResponse: string,
  recentHistory: { role: string; content: string }[]
): Promise<CheckpointGrade> {
  const transcript = recentHistory
    .map((t) => `${t.role === "tutor" ? "COACH" : "LEARNER"}: ${t.content}`)
    .join("\n");

  const system = `You are a strict but fair assessor of demonstrated understanding on the concept "${ctx.beatTitle ?? ctx.moduleTitle ?? "this concept"}".
Grade ONLY the learner's demonstrated reasoning, not their writing length or confidence.
Return a single JSON object: {"grade": 0|1|2|3, "reasoning": "one short sentence"}.
Rubric:
0 = no understanding, off-topic, disengaged ("idk", "ok"), or a guess with no reasoning.
1 = a relevant idea but shaky, incomplete or partly wrong reasoning.
2 = solid, correct reasoning that applies the concept, minor gaps allowed.
3 = clear mastery: correct, applied to the situation, and able to justify why.
Source content for reference: ${ctx.narration ?? ""} ${ctx.scenario ?? ""}`.trim();

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system,
      messages: [
        {
          role: "user",
          content: `Recent dialogue:\n${transcript}\n\nLatest learner answer to grade:\n"${learnerResponse}"\n\nReturn only the JSON.`,
        },
      ],
    });
    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const g = Math.max(0, Math.min(3, Math.round(Number(parsed.grade))));
      return { grade: g as 0 | 1 | 2 | 3, reasoning: String(parsed.reasoning ?? "") };
    }
  } catch {
    // fall through to a conservative default
  }
  // Conservative fallback if grading fails: treat as shaky, not mastery.
  const words = learnerResponse.trim().split(/\s+/).filter(Boolean).length;
  return { grade: words > 25 ? 2 : words > 5 ? 1 : 0, reasoning: "Fallback length-based estimate." };
}

export { MODEL as SOCRATIC_MODEL };
