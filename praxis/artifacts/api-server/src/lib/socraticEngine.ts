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
  remedialFocus?: string | null; // when the learner is catching up: the weak area to rebuild
  recentPerformance?: "struggling" | "steady" | "thriving"; // drives adaptive cadence
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

// Strip every asterisk, em/en dash, divider line and stray markdown so learner-facing text is
// always clean plain prose (the chat renders raw text, it does not parse markdown).
export function sanitizePlain(text: string): string {
  return (text || "")
    .replace(/\u2014/g, ", ")            // em dash -> comma
    .replace(/\u2013/g, "-")             // en dash -> hyphen
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")  // divider lines --- *** ___
    .replace(/\*\*([^*]+)\*\*/g, "$1")   // bold
    .replace(/\*([^*]+)\*/g, "$1")       // italic
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1") // inline/code fences
    .replace(/^#{1,6}\s*/gm, "")         // headings
    .replace(/^\s*[-*]\s+/gm, "")        // list bullets
    .replace(/\*/g, "")                  // any remaining asterisks
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Ensure every emitted turn ends on a question so the dialogue never stalls.
export function ensureQuestion(text: string): string {
  const trimmed = sanitizePlain(text).replace(/\s+$/, "");
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

  // Adaptive cadence: react to how the learner is actually doing on recent turns, not just the
  // static "simplify if they struggle" instruction. This genuinely changes pace and grain size.
  if (ctx.recentPerformance === "struggling") {
    parts.push(
      "ADAPTIVE CADENCE - the learner has struggled on the last couple of turns. Change your pace deliberately: take ONE very small, concrete step; anchor it in a familiar, everyday workplace example; lower the difficulty; and warm your tone. Offer a gentle hint shaped as a question rather than a fresh challenge, and never stack ideas. Do not add new complexity until they regain their footing."
    );
  } else if (ctx.recentPerformance === "thriving") {
    parts.push(
      "ADAPTIVE CADENCE - the learner is reasoning well. Raise the challenge: extend the idea to a new situation, ask them to justify or generalise their reasoning, or introduce a realistic complication that tests the edges of their understanding."
    );
  }

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

  if (ctx.remedialFocus) {
    parts.push(
      "REMEDIAL FOCUS: this learner recently fell behind and is here to catch up on a specific weak area: " +
        `"${ctx.remedialFocus}". Concentrate every question on rebuilding exactly this. Frame it as normal, expected catch-up work, never as failure or a deficiency. Be extra patient and start from the foundations of this area before extending.`
    );
  }

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
// A refusal, give-up, or empty non-answer demonstrates no reasoning and must never earn credit,
// regardless of how many words it uses. Deterministic so it can't be graded leniently by the AI.
function isDisengaged(resp: string): boolean {
  const t = (resp || "").trim().toLowerCase();
  if (!t) return true;
  const words = t.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length <= 2 && /^(ok|okay|yes|no|sure|maybe|fine|k|idk|dunno|dk|nope|yeah|nah|meh|whatever)$/.test(words.join(" "))) return true;
  if (/\b(i\s*give\s*up|give\s*up|i\s*quit|want\s*to\s*quit|gonna\s*quit|not\s*good\s*at\s*this|can'?t\s*do\s*this|i\s*don'?t\s*want\s*to|no\s*idea|i\s*don'?t\s*know)\b/.test(t) && words.length < 16) return true;
  return false;
}

export async function gradeCheckpoint(
  ctx: SocraticContext,
  learnerResponse: string,
  recentHistory: { role: string; content: string }[],
  isSelection = false
): Promise<CheckpointGrade> {
  // Refusals / give-ups / empty non-answers are grade 0 up front, so they never raise mastery.
  if (isDisengaged(learnerResponse)) {
    return { grade: 0, reasoning: "Disengaged or gave up; no reasoning demonstrated." };
  }

  const transcript = recentHistory
    .map((t) => `${t.role === "tutor" ? "COACH" : "LEARNER"}: ${t.content}`)
    .join("\n");

  const cap = isSelection ? 2 : 3;
  const system = isSelection
    ? `You are assessing a learner who SELECTED an answer from multiple choices for the concept "${ctx.beatTitle ?? ctx.moduleTitle ?? "this concept"}". Grade the CORRECTNESS of the choice they picked, not its length.
Return a single JSON object: {"grade": 0|1|2, "reasoning": "one short sentence"}.
Rubric:
0 = the choice is wrong, a misconception, or off-topic.
1 = the choice is partly right or a weak fit.
2 = the choice is correct and on point.
Do NOT give 3: recognising a good answer is not the same as explaining it, and mastery requires the learner to justify their reasoning in their own words.
Source content for reference: ${ctx.narration ?? ""} ${ctx.scenario ?? ""}`.trim()
    : `You are a strict but fair assessor of demonstrated understanding on the concept "${ctx.beatTitle ?? ctx.moduleTitle ?? "this concept"}".
Grade ONLY the learner's demonstrated reasoning, not their writing length, politeness or confidence.
Return a single JSON object: {"grade": 0|1|2|3, "reasoning": "one short sentence"}.
Rubric:
0 = no understanding, off-topic, disengaged or refusing ("idk", "ok", "I give up", "I quit", "I'm not good at this"), or a guess with no reasoning. Length does NOT rescue a non-answer.
1 = a relevant idea but shaky, incomplete or partly wrong reasoning.
2 = solid, correct reasoning that applies the concept, minor gaps allowed.
3 = clear mastery: correct, applied to the situation, and able to justify why.
Be strict: only give 2 or 3 when the learner has actually explained real reasoning about the concept.
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
      const g = Math.max(0, Math.min(cap, Math.round(Number(parsed.grade))));
      return { grade: g as 0 | 1 | 2 | 3, reasoning: String(parsed.reasoning ?? "") };
    }
  } catch {
    // fall through to a conservative default
  }
  // Conservative fallback if grading fails. CRITICAL: never return a MASTERY-qualifying grade here.
  // Mastery (and therefore credential issuance) requires grade >= 2; an AI outage must not let a
  // learner reach mastery by padding an answer to 25+ words. Cap the fallback at 1 so a real grader
  // is always required to certify. (Selection answers also cap at 1.)
  if (isSelection) return { grade: 1, reasoning: "Selected answer (grader unavailable) - not counted toward mastery." };
  const words = learnerResponse.trim().split(/\s+/).filter(Boolean).length;
  return { grade: words > 5 ? 1 : 0, reasoning: "Fallback estimate (grader unavailable) - not counted toward mastery." };
}

export interface WorkedExample {
  intro: string;
  situation: string;
  steps: { heading: string; detail: string }[];
  tryPrompt: string;
}

/**
 * Structured, interactive worked example (the scaffolding bump). Returns clean plain-text fields
 * the UI can reveal one step at a time, then hand back to the dialogue with `tryPrompt`. Every
 * field is sanitised so no markdown, asterisks or em dashes ever reach the learner.
 */
export async function generateWorkedExample(
  ctx: SocraticContext,
  history: { role: string; content: string }[]
): Promise<WorkedExample> {
  const concept = ctx.beatTitle ?? ctx.moduleTitle ?? "this concept";
  const system = `You are a patient learning coach helping ${ctx.learnerName ?? "a learner"} who has found "${concept}" tricky a few times. Instead of another question, give ONE short worked example that models the reasoning, then invite them to try a similar one.
${ctx.narration ? "Context: " + ctx.narration : ""}${ctx.scenario ? " Scenario: " + ctx.scenario : ""}
Return ONLY a JSON object of this exact shape:
{"intro": string, "situation": string, "steps": [{"heading": string, "detail": string}], "tryPrompt": string}
Rules:
- intro: one warm sentence framing the difficulty as completely normal.
- situation: one or two plain sentences setting a single concrete, realistic workplace scenario.
- steps: 2 to 4 short steps that each move the reasoning forward by one idea. heading is 2 to 5 words; detail is 1 to 3 plain sentences that show the thinking out loud.
- tryPrompt: one question inviting the learner to try a similar example themselves.
- PLAIN TEXT ONLY in every field. No markdown, no asterisks, no bullet characters, no em dashes or en dashes, no heading symbols. Short workplace-authentic South African English.`;

  const messages = history.map((t) => ({
    role: t.role === "tutor" ? ("assistant" as const) : ("user" as const),
    content: t.content,
  }));
  messages.push({ role: "user", content: "I'm stuck on this. Could you show me a worked example, then let me try one?" });

  const fallback: WorkedExample = {
    intro: "This one is genuinely tricky, and that is completely normal. Let us walk through one together.",
    situation: `Picture a real moment at work where "${concept}" would come up.`,
    steps: [
      { heading: "Start with the goal", detail: "Name what a good outcome looks like here before doing anything else." },
      { heading: "Work it through", detail: "Take one concrete step toward that outcome and say why it helps." },
    ],
    tryPrompt: "Now you try: how would you handle a similar situation of your own, and why?",
  };

  try {
    const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 900, system, messages });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as { intro?: unknown; situation?: unknown; steps?: unknown; tryPrompt?: unknown };
    const steps = Array.isArray(parsed.steps)
      ? (parsed.steps as Array<{ heading?: unknown; detail?: unknown }>)
          .filter((s) => s?.heading && s?.detail)
          .slice(0, 4)
          .map((s) => ({ heading: sanitizePlain(String(s.heading)), detail: sanitizePlain(String(s.detail)) }))
      : [];
    return {
      intro: sanitizePlain(String(parsed.intro ?? "")) || fallback.intro,
      situation: sanitizePlain(String(parsed.situation ?? "")) || fallback.situation,
      steps: steps.length ? steps : fallback.steps,
      tryPrompt: sanitizePlain(String(parsed.tryPrompt ?? "")) || fallback.tryPrompt,
    };
  } catch {
    return fallback;
  }
}

export interface AnswerOptions {
  mode: "single" | "multi" | "free";
  options: string[];
}

/**
 * Turn a coach question into selectable answer choices so the learner can pick instead of typing.
 * Most questions get 4-5 short options (single choice, or pick-all-that-apply); questions that
 * genuinely need the learner's own words come back as mode "free" with no options.
 */
export async function generateAnswerOptions(question: string, ctx: SocraticContext): Promise<AnswerOptions> {
  const concept = ctx.beatTitle ?? ctx.moduleTitle ?? "this concept";
  const system = `You turn a coaching question into answer choices a learner can select instead of typing.
Concept: "${concept}".${ctx.narration ? " Context: " + ctx.narration : ""}
Return ONLY JSON: {"mode": "single" | "multi" | "free", "options": [string, ...]}.
Rules:
- DEFAULT TO OPTIONS. The learner should mostly pick, not type. Aim to give options for roughly four out of every five questions.
- Even for open "how / why / what would you" reasoning questions, write 4 to 5 candidate answers, explanations or stances the learner can choose between. Include one or two strong directions and some weaker or common-misconception choices so the pick is meaningful.
- Use "single" when one answer is best; use "multi" (pick all that apply) when several answers are each valid at once.
- Use "free" ONLY when the question is a genuinely personal reflection or example unique to this learner (for example "tell me about a time you..."), or when you honestly cannot write at least 4 distinct plausible choices. Then return an empty options array. Do NOT choose free just because the question is open ended.
- Options are SHORT, a handful of words each. Plain text only: no letter or number prefixes, no markdown, no asterisks, no em or en dashes. Workplace-authentic South African English.`;
  const fallback: AnswerOptions = { mode: "free", options: [] };
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: `Coaching question:\n"${question}"\n\nReturn only the JSON.` }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as { mode?: unknown; options?: unknown };
    const mode = parsed.mode === "single" || parsed.mode === "multi" ? parsed.mode : "free";
    if (mode === "free") return { mode: "free", options: [] };
    const options = Array.isArray(parsed.options)
      ? (parsed.options as unknown[]).map((o) => sanitizePlain(String(o))).filter(Boolean).slice(0, 5)
      : [];
    if (options.length < 2) return fallback; // not enough to choose from, fall back to typing
    return { mode, options };
  } catch {
    return fallback;
  }
}

export { MODEL as SOCRATIC_MODEL };
