import { anthropic } from "@workspace/integrations-anthropic-ai";

/**
 * AI activity generator. Given raw course content, produce a MENU of self-contained,
 * gamified interactive activities that run in the Praxis sandbox player, each labelled with
 * an AI-determined rigor (Bloom's level + difficulty).
 *
 * Hard runtime contract (the sandbox the HTML runs in):
 *  - The HTML body runs inside a sandboxed iframe with NO network and an opaque origin. So
 *    everything must be self-contained: inline <style> + inline <script>, vanilla JS/CSS only,
 *    NO external CDNs/fonts/images/URLs.
 *  - When the learner finishes, the activity MUST call window.SynopsActivity.submit(payload, score)
 *    exactly once (score is 0..100). It may call SynopsActivity.resize(px) but auto-resize exists.
 */

const MODEL = "claude-sonnet-4-6";

export type ActivityKind = "quiz" | "flashcards" | "drag_drop" | "matching" | "scenario" | "hotspot";
export const ACTIVITY_KINDS: ActivityKind[] = ["quiz", "flashcards", "drag_drop", "matching", "scenario", "hotspot"];
export const BLOOMS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"] as const;
export const DIFFICULTIES = ["foundational", "intermediate", "advanced"] as const;

export interface GeneratedActivity {
  kind: ActivityKind | string;
  title: string;
  instructions: string;
  html: string;
  bloomsLevel: string;
  difficulty: string;
  rationale: string;
}

const SYSTEM = `You are an expert instructional designer and front-end engineer. You turn raw course content into a set of SHORT, gamified, interactive learning activities that a learner completes in a hardened sandbox.

ABSOLUTE RUNTIME CONSTRAINTS (breaking any of these makes the activity fail):
- Each "html" value is placed inside a <body>. It must be SELF-CONTAINED: put all CSS in an inline <style> and all logic in an inline <script>. Use VANILLA JavaScript and CSS only.
- NO external resources of any kind: no CDNs, no <script src>, no external fonts, no <img src="http...">, no fetch/XHR/network. The sandbox has NO network and an opaque origin, so anything external silently fails. If you need an image, draw it with inline SVG or CSS.
- The host injects base styles (system font, white background, 20px padding). Do not fight them; you may add your own styles scoped to your elements.
- When the learner has finished, call window.SynopsActivity.submit(payload, score) EXACTLY ONCE. payload is a small JSON object of what they did; score is a number 0..100 (percent correct / quality). Provide a visible "Submit" / "Finish" affordance that triggers it (or auto-submit at the end of the flow).
- Keep each activity focused and reasonably small. Prefer clean, accessible markup (labels, buttons, keyboard-usable). Mobile friendly.

GAMIFICATION: make it engaging — points, streaks, instant feedback, progress, a friendly result screen — without being childish. Keep it professional and on-topic to the content.

RIGOR: for each activity set an honest Bloom's level (one of: Remember, Understand, Apply, Analyze, Evaluate, Create) and a difficulty (one of: foundational, intermediate, advanced). Spread the set across DIFFERENT Bloom's levels so the menu ranges from recall to higher-order reasoning. Briefly justify the rigor in "rationale".

VARIETY: use a mix of kinds from: quiz (MCQ with feedback), flashcards (flip to recall), drag_drop (order/sort items), matching (pair concepts), scenario (branching decision with consequences), hotspot (click the right region of an inline SVG). Choose kinds that genuinely fit the content.

Return ONLY a strict JSON array (no prose, no code fences) of objects with EXACTLY these keys: "kind", "title", "instructions", "html", "bloomsLevel", "difficulty", "rationale". Escape the HTML properly as a JSON string.`;

export async function generateActivities(
  content: string,
  opts?: { count?: number; kinds?: string[]; targetBloom?: string | null; targetDifficulty?: string | null }
): Promise<GeneratedActivity[]> {
  const count = Math.max(1, Math.min(6, opts?.count ?? 4));
  const kindLine = opts?.kinds?.length ? `\nPrefer these kinds: ${opts.kinds.join(", ")}.` : "";
  const rigorLine = opts?.targetBloom || opts?.targetDifficulty
    ? `\nThe author is targeting ${[opts?.targetBloom && `Bloom's: ${opts.targetBloom}`, opts?.targetDifficulty && `difficulty: ${opts.targetDifficulty}`].filter(Boolean).join(", ")}; aim the set around that.`
    : "";

  const user = `Create ${count} varied gamified activities from the COURSE CONTENT below.${kindLine}${rigorLine}\n\nReturn only the JSON array.\n\n=== COURSE CONTENT ===\n${content.slice(0, 12000)}`;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error("The generator did not return any activities. Try again with more content.");
  let arr: unknown;
  try { arr = JSON.parse(m[0]); } catch { throw new Error("The generator returned malformed output. Please try again."); }
  if (!Array.isArray(arr)) throw new Error("The generator did not return a list of activities.");

  const clampBloom = (b: unknown) => (typeof b === "string" && (BLOOMS as readonly string[]).includes(b) ? b : "Understand");
  const clampDiff = (d: unknown) => (typeof d === "string" && (DIFFICULTIES as readonly string[]).includes(d) ? d : "intermediate");

  return arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      kind: typeof x.kind === "string" ? x.kind : "quiz",
      title: typeof x.title === "string" ? x.title : "Untitled activity",
      instructions: typeof x.instructions === "string" ? x.instructions : "",
      html: typeof x.html === "string" ? x.html : "",
      bloomsLevel: clampBloom(x.bloomsLevel),
      difficulty: clampDiff(x.difficulty),
      rationale: typeof x.rationale === "string" ? x.rationale : "",
    }))
    .filter((a) => a.html.trim().length > 0);
}

export { MODEL as ACTIVITY_MODEL };
