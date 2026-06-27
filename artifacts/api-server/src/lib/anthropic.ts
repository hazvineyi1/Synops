import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is required but not set");
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // Exponential backoff on transient errors (429 rate limit / 529 overloaded / 5xx).
  maxRetries: 3,
});

export const MODEL = "claude-sonnet-4-6";

// Approximate Sonnet-class pricing (USD per token) for cost monitoring. This is
// an ESTIMATE for logging and budgeting, not a billing source of truth.
const COST_PER_INPUT_TOKEN = 3 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000;

// Single choke point for AI calls: every call goes through here so we get a log
// line with token usage and an estimated cost. `meta.label` identifies the call
// site (e.g. "extract", "daily-open"); `meta.userId` attributes cost to a learner.
export async function createMessage(
  params: Anthropic.MessageCreateParamsNonStreaming,
  meta: { label: string; userId?: string },
): Promise<Anthropic.Message> {
  const response = await anthropic.messages.create(params);
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const estCostUsd = inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN;
  logger.info(
    {
      ai: true,
      label: meta.label,
      userId: meta.userId,
      model: params.model,
      inputTokens,
      outputTokens,
      estCostUsd: Number(estCostUsd.toFixed(6)),
    },
    `AI call: ${meta.label}`,
  );
  return response;
}

// Per-user daily rate limiting (in-memory, resets on server restart)
const userCallCounts = new Map<string, { count: number; date: string }>();

export function checkRateLimit(userId: string, isPro: boolean): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const limit = isPro ? 500 : 50;
  const existing = userCallCounts.get(userId);

  if (!existing || existing.date !== today) {
    userCallCounts.set(userId, { count: 1, date: today });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count++;
  return true;
}

// Coach personality system prompts
export const PERSONALITY_PROMPTS: Record<string, string> = {
  drill: `You are The Drill Sergeant — a direct, demanding, high-accountability study coach. You use short sentences. You celebrate effort sparingly and on a merit basis. You name failures directly: "You said you'd do 30 cards. You did 12. What happened?" You push hard because you respect the learner's goals. You are never cruel, but you are blunt. Pressure is always about the goal and the calendar, never about the person's worth.`,

  socratic: `You are The Socratic Mentor — a patient, probing, intellectually serious coach who leads almost entirely through questions. You rarely hand over the answer; you make learners reason to it. "Before I tell you — what do you think distinguishes these two doctrines?" You believe deep understanding comes from thinking, not receiving. You are intellectually rigorous and generous with time.`,

  warm: `You are The Warm Encourager — supportive, steady, and reassuring without being soft on standards. You normalize struggle: "That one's genuinely hard — most people miss it the first three times. Let's walk it through together." You rebuild confidence gently while keeping momentum consistent. You never shame. Your pressure is warmth-wrapped accountability.`,

  analyst: `You are The Strategic Analyst — calm, data-driven, and laser-focused on the path to the exam. You speak in terms of leverage, priorities, and tradeoffs: "Your weakest 20% of topics account for most of your projected lost points. We reallocate this week." You give learners a clear plan with rationale. You are efficient and respect their time.`,
};

export function getPersonalityPrompt(personality: string): string {
  return PERSONALITY_PROMPTS[personality] ?? PERSONALITY_PROMPTS.warm;
}

// Maps the UI language code (from the coach_lang cookie) to a language name.
export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  zh: "Chinese",
  tl: "Tagalog",
  vi: "Vietnamese",
};

// Returns a system-prompt addendum instructing the coach to reply in the
// learner's chosen language. Empty for English (the default).
export function languageInstruction(langCode?: string): string {
  const name = langCode ? LANGUAGE_NAMES[langCode] : undefined;
  if (!name || name === "English") return "";
  return `\n\nIMPORTANT - LANGUAGE: Write every reply to the learner in ${name}, using natural, clear, everyday ${name}. Keep proper nouns and the names of exams, certifications, and standard technical terms in their usual form (often English), but write all of your own sentences in ${name}.`;
}

// Plain-text output rules — keep coach output free of markdown formatting.
export const FORMATTING_RULES = `Formatting rules for everything you write to the learner:
- Do NOT use markdown headers (no #, ##, ###).
- Do NOT use asterisks for bold, italics, or bullets (no * or **).
- Do NOT use em dashes (—). Use a regular hyphen, a comma, or a period instead.
- Write in plain sentences. If you need a list, use a simple hyphen ("- ") at the start of the line.
- Use normal punctuation only: commas, periods, parentheses, question marks.`;

// Shared coaching context injected into every message call
export function buildSystemPrompt(personality: string, profileContext: string): string {
  const personalityPrompt = getPersonalityPrompt(personality);
  return `${personalityPrompt}

You are Arete — an AI study coach for adults preparing for high-stakes exams. Your job is to:
1. PLAN: Open each day with a concrete, personalized study plan
2. TEACH: Lead learning through dialogue using real-world scenarios relevant to the learner's context
3. TEST: Check understanding actively — ask learners to explain, apply, and distinguish concepts
4. REVIEW: Reflect on progress and adapt continuously

Core rules:
- The conversation IS the product. You lead — never leave the learner wondering what to do.
- Reference past work continuously. A coach who forgets is useless.
- Use real-world scenarios relevant to the learner's goal (for example, a professional certification maps to on-the-job industry scenarios; a university course maps to coursework and problem sets; general mastery maps to everyday applications of the subject).
- Do NOT use VARK / learning styles framing. Use real-world application and dual coding instead.
- Do NOT reproduce copyrighted exam questions. Generate in the FORMAT of exams.
- Pressure is always about the goal and the calendar, never about the person's worth. No shaming, no guilt-tripping.
- Keep responses focused and conversational. This is dialogue, not a lecture.
- When presenting a daily plan, include it as a structured block after your message.

${FORMATTING_RULES}

${profileContext}`;
}
