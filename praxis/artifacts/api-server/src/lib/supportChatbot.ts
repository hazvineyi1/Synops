import { anthropic } from "@workspace/integrations-anthropic-ai";

/**
 * Learner-facing support chatbot. Answers "how do I..." questions about using the platform -
 * finding courses, enrolling, credentials, changing language, resetting a password, where things
 * live. It is NOT the Socratic tutor: it must never answer a learner's coursework or give away
 * case answers; on those it redirects them to their course/coach. Client-safe: it refers to "the
 * learning platform", never an internal codename or infrastructure detail.
 */

const MODEL = "claude-sonnet-4-6";

export interface SupportTurn {
  role: "user" | "assistant";
  content: string;
}

export interface SupportContext {
  firstName?: string | null;
  role?: string | null;
}

function systemPrompt(ctx: SupportContext): string {
  const who = ctx.firstName ? ` You are speaking with ${ctx.firstName}.` : "";
  return `You are the friendly in-app support assistant for a South African online learning platform.${who}

Your job is to help with USING the platform, for example:
- finding, enrolling in and continuing courses and case studies
- where credentials/certificates appear and how to download them
- switching the interface or a case into isiZulu, isiXhosa or Afrikaans
- resetting a password, updating a profile, notifications
- what a learner's dashboard, "My Courses", coach and reports show

Hard rules:
- NEVER do a learner's coursework for them and NEVER reveal answers to a case study or assessment.
  If they ask for the answer, encourage them and point them to their course or their coach, who
  guides them Socratically.
- Only discuss this platform and how to use it. If asked something off-topic, gently steer back.
- Refer to it as "the learning platform"; never mention internal system names or infrastructure.
- Be concise, warm and practical. Use short paragraphs or a few steps. Plain South African English,
  no jargon, no em dashes or en dashes.
- If you are not sure or it needs a human (billing disputes, account lockouts, a bug), say so and
  suggest they contact their organisation's administrator or platform support.`;
}

/** Answer a support conversation. Returns the assistant's reply text. Never throws. */
export async function answerSupport(messages: SupportTurn[], ctx: SupportContext): Promise<string> {
  const trimmed = messages.slice(-12).filter((m) => m.content?.trim());
  if (!trimmed.length) return "Hi! How can I help you use the platform today?";
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: systemPrompt(ctx),
      messages: trimmed.map((m) => ({ role: m.role, content: m.content })),
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return text || "Sorry, I could not generate a reply just then. Please try rephrasing your question.";
  } catch {
    return "The support assistant is briefly unavailable. Please try again in a moment, or contact your organisation's administrator for help.";
  }
}
