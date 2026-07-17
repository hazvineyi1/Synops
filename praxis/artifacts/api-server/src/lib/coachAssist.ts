import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { CoachAssist } from "@workspace/db";

/**
 * AI coaching assist: turns a learner's off-track signals + their adaptive plan into concrete
 * guidance for the human coach — a short situation summary, talking points to raise in the next
 * session, a one-line session focus, and a ready-to-send encouraging message. Mirrors the
 * studyPlanEngine pattern: one anthropic call returning strict JSON, with a deterministic
 * fallback so it never throws and works even before an API key is configured.
 */

const MODEL = "claude-sonnet-4-6";

export interface CoachAssistInput {
  learnerName: string;
  courseTitle: string;
  reasonLabels: string[]; // human-readable off-track reasons
  masteryPct: number | null; // 0..100
  weakAreas: string[];
  planItems: Array<{ title: string; why: string; done: boolean }>;
}

function fallbackAssist(input: CoachAssistInput): CoachAssist {
  const name = input.learnerName || "your learner";
  const first = name.split(" ")[0] || name;
  const areas = input.weakAreas.slice(0, 3);
  const areaPhrase = areas.length ? areas.join(", ") : "a few recent topics";
  const remaining = input.planItems.filter((i) => !i.done);
  return {
    summary:
      `${name} is off track in ${input.courseTitle}` +
      (input.masteryPct != null ? ` (mastery around ${Math.round(input.masteryPct)}%)` : "") +
      `. The signals point to ${areaPhrase}. A ${input.planItems.length}-step plan is in place; ${remaining.length} step${remaining.length === 1 ? "" : "s"} still open.`,
    talkingPoints: [
      `Open by acknowledging effort, not the score — keep it non-shaming.`,
      `Focus the session on ${areaPhrase}; ask ${first} to talk you through one recent problem so you can hear the reasoning.`,
      remaining[0]
        ? `Do the first open plan step together: "${remaining[0].title}".`
        : `Review the completed plan and check the understanding actually stuck.`,
      `Agree one concrete next action and a check-in date before you end.`,
    ],
    sessionFocus: areas.length ? `Rebuild confidence in ${areas[0]}` : `Re-establish momentum and a clear next step`,
    suggestedMessage:
      `Hi ${first} — I saw you've hit a rough patch in ${input.courseTitle}, which happens to everyone. ` +
      `I've lined up a short plan to get you back on track, and I'd like to work through the first step with you. When are you free this week?`,
  };
}

export async function generateCoachAssist(input: CoachAssistInput): Promise<CoachAssist> {
  const fallback = fallbackAssist(input);
  try {
    const system =
      "You are an expert instructional coach advising a human coach (a facilitator) who is about to support a learner who has fallen behind. " +
      "Be practical, warm and specific; never shaming. " +
      "Return ONLY a strict JSON object with keys: " +
      '"summary" (1-2 sentences on the situation for the coach), ' +
      '"talkingPoints" (array of 3-5 short, concrete things the coach should do or ask in the next session), ' +
      '"sessionFocus" (one short line naming the single focus of the next session), ' +
      '"suggestedMessage" (a short, warm 2-3 sentence message the coach can send the learner to open the conversation, first-person from the coach).';
    const payload = {
      learner: input.learnerName,
      course: input.courseTitle,
      offTrackReasons: input.reasonLabels,
      masteryPercent: input.masteryPct,
      weakAreas: input.weakAreas,
      adaptivePlan: input.planItems,
    };
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: JSON.stringify(payload) + "\n\nReturn only the JSON object." }],
    });
    const text = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const points = Array.isArray(parsed?.talkingPoints)
      ? parsed.talkingPoints.filter((p: any) => typeof p === "string" && p.trim()).map((p: string) => p.trim())
      : [];
    return {
      summary: typeof parsed?.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : fallback.summary,
      talkingPoints: points.length ? points.slice(0, 6) : fallback.talkingPoints,
      sessionFocus:
        typeof parsed?.sessionFocus === "string" && parsed.sessionFocus.trim() ? parsed.sessionFocus.trim() : fallback.sessionFocus,
      suggestedMessage:
        typeof parsed?.suggestedMessage === "string" && parsed.suggestedMessage.trim()
          ? parsed.suggestedMessage.trim()
          : fallback.suggestedMessage,
    };
  } catch {
    return fallback;
  }
}
