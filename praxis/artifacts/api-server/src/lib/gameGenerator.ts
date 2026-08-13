import { anthropic } from "@workspace/integrations-anthropic-ai";
import { templateByKey, BAND_LABEL, type Band } from "./gameTemplates";

/**
 * AI game generator. Given a subject, grade band, rigor and the lesson content, produce the CONTENT
 * JSON for a chosen game template, grounded strictly in the content, then the caller renders it with
 * the template's own build() function. Returns a DRAFT (content + html), never saved; the admin reviews
 * and edits before saving. Same model + strict-JSON pattern as the activity generator.
 */
const MODEL = "claude-sonnet-4-6";
export const RIGOR_LEVELS = ["foundational", "intermediate", "advanced"] as const;
export type Rigor = (typeof RIGOR_LEVELS)[number];

const RIGOR_GUIDE: Record<Rigor, string> = {
  foundational: "recall and basic understanding, straightforward prompts, single-step answers",
  intermediate: "application and analysis, multi-step reasoning, connect ideas",
  advanced: "evaluation and synthesis, justify, compare, apply to new situations",
};

export interface GenerateGameInput {
  templateKey: string;
  subject: string;
  band: Band;
  rigor: Rigor;
  content: string;
  topic?: string;
}

export async function generateGameContent(input: GenerateGameInput): Promise<{ content: unknown; title: string }> {
  const tpl = templateByKey(input.templateKey);
  if (!tpl) throw new Error(`Unknown game type "${input.templateKey}".`);
  const rigor = (RIGOR_LEVELS as readonly string[]).includes(input.rigor) ? input.rigor : "intermediate";
  const bandLabel = BAND_LABEL[input.band] ?? "Grades 3–5";
  const content = (input.content || "").trim();
  if (content.length < 20) throw new Error("Add more lesson content to generate a game from (a paragraph or two works well).");

  const system = `You are an expert instructional designer building a "${tpl.name}" review game. You ground every question strictly in the provided lesson content, never invent facts outside it. You write clear, audience-appropriate, engaging prompts (match the tone to the stated grade level — keep it professional and substantive for adult learners), and you make the game a genuine review of the material, not trivia.

Return ONLY a single strict JSON object (no prose, no code fences, no HTML) matching EXACTLY the required shape.`;

  const user = `Create the CONTENT for a "${tpl.name}" game.
Subject: ${input.subject || "General"}
Grade level: ${bandLabel}
Rigor: ${rigor}, ${RIGOR_GUIDE[rigor as Rigor]}
${input.topic ? `Focus topic: ${input.topic}\n` : ""}
Ground every item in the LESSON CONTENT below and pitch the difficulty to ${bandLabel} at ${rigor} rigor.

The JSON must match EXACTLY this shape:
${tpl.schemaHint}

=== LESSON CONTENT ===
${content.slice(0, 12000)}

Return ONLY the JSON object.`;

  let json: unknown;
  try {
    const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 3000, system, messages: [{ role: "user", content: user }] });
    const text = (msg.content as { type: string; text?: string }[]).map((b) => (b.type === "text" ? b.text ?? "" : "")).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no json");
    json = JSON.parse(m[0]);
  } catch {
    throw new Error("The generator could not produce a valid game from that content. Try again, or add more detail.");
  }
  if (!tpl.validate(json)) {
    throw new Error("The generated game didn't match the required shape. Try again, or adjust the content.");
  }
  const title = (json as { title?: string }).title || `${input.subject || tpl.name}, ${tpl.name}`;
  return { content: json, title };
}
