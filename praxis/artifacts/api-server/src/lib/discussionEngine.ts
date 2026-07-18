import { anthropic, isAiConfigured } from "@workspace/integrations-anthropic-ai";
import { languageName } from "./caseEngine";

/**
 * AI facilitation for course discussions.
 *
 * The job here is NOT to answer. A facilitator who supplies the answer ends the thinking,
 * and in a discussion the thinking IS the deliverable. This asks the next good question:
 * it picks at an assumption, asks for evidence, or invites a learner to engage with what a
 * peer actually said. One question, addressed to the group.
 */
const MODEL = "claude-sonnet-4-6";

/** Discussion participation is counted in words, so count them the same way everywhere. */
export function countWords(text: string): number {
  return (text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

export interface FacilitatorContext {
  title: string;
  prompt: string;
  /** Oldest-first. `author` is a display name; AI turns are marked so it can vary itself. */
  turns: { author: string; body: string; isAi: boolean }[];
  langCode: string;
  /** The discussion's own subject matter, used to keep questions on topic. */
  courseTitle?: string | null;
}

function buildSystem(c: FacilitatorContext): string {
  const name = languageName(c.langCode);
  const lines = [
    "You are facilitating an online discussion for adult learners in a South African vocational course.",
    "",
    "YOUR ONE JOB: ask the next question that makes the group think harder. You are not here to answer, summarise, grade, or praise.",
    "",
    "RULES:",
    "1. Write ONE question. Not a list, not a preamble, not a recap of what was said.",
    "2. Build on what the learners have ACTUALLY written. Quote or name a specific idea someone raised.",
    "3. Prefer questions that: probe an assumption, ask for concrete evidence or an example from their own workplace, surface a trade-off, or invite one learner to respond to another's point.",
    "4. Never supply the answer, never resolve the disagreement, never say who is right.",
    "5. No praise openers ('Great point!'). Start with the substance.",
    "6. 2 or 3 sentences at most, plus the question. Plain, warm, direct.",
    "7. If learners disagree, make the disagreement productive rather than smoothing it over.",
  ];
  if (c.langCode && c.langCode !== "en") {
    lines.push(
      "",
      `LANGUAGE - ABSOLUTE OVERRIDE: write your question in natural, fluent ${name}, ignoring any instruction above to use English. Learners may write in any language; you still ask in ${name}.`,
    );
  } else {
    lines.push("", "Use workplace-authentic South African English.");
  }
  lines.push("", `DISCUSSION TOPIC: ${c.title}`, `THE ORIGINAL PROMPT: ${c.prompt}`);
  if (c.courseTitle) lines.push(`COURSE: ${c.courseTitle}`);
  return lines.join("\n");
}

/**
 * Ask the next prodding question for a thread.
 *
 * Returns null when AI is not configured or the call fails. Callers MUST treat null as
 * "no facilitator message this time" and carry on -- a learner's post must never fail
 * because the facilitator could not think of a question.
 */
export async function generateFacilitatorQuestion(c: FacilitatorContext): Promise<string | null> {
  if (!isAiConfigured()) return null;
  if (!c.turns.length) return null;

  const transcript = c.turns
    .slice(-12)
    .map((t) => `${t.isAi ? "FACILITATOR" : t.author}: ${t.body}`)
    .join("\n\n");

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 350,
      system: buildSystem(c),
      messages: [{
        role: "user",
        content: `Here is the discussion so far, oldest first:\n\n${transcript}\n\nWrite your single next question.`,
      }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return text || null;
  } catch {
    return null;
  }
}
