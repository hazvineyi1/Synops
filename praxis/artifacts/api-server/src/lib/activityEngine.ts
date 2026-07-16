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

KIND: build the ONE kind of activity you are told to build: quiz (MCQ with feedback), flashcards (flip to recall), drag_drop (order/sort items), matching (pair concepts), scenario (branching decision with consequences), or hotspot (click the right region of an inline SVG).

Return ONLY a single strict JSON object (no prose, no code fences, no array) with EXACTLY these keys: "kind", "title", "instructions", "html", "bloomsLevel", "difficulty", "rationale". Escape the HTML properly as a JSON string.`;

const clampBloom = (b: unknown) => (typeof b === "string" && (BLOOMS as readonly string[]).includes(b) ? b : "Understand");
const clampDiff = (d: unknown) => (typeof d === "string" && (DIFFICULTIES as readonly string[]).includes(d) ? d : "intermediate");

/** Generate ONE activity of a given kind/level. Small + fast; never throws (returns null). */
async function generateOne(content: string, kind: string, bloom: string, difficulty: string | null): Promise<GeneratedActivity | null> {
  const rigor = `Target Bloom's level: ${bloom}.${difficulty ? ` Target difficulty: ${difficulty}.` : ""}`;
  const user = `Build ONE "${kind}" activity from the COURSE CONTENT below. ${rigor}\nKeep the HTML COMPACT (aim well under 200 lines) so it fits in one response: concise markup, share one small <style>, avoid huge inline SVGs, cap items at ~5-6. Return only the single JSON object.\n\n=== COURSE CONTENT ===\n${content.slice(0, 10000)}`;
  try {
    const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 6000, system: SYSTEM, messages: [{ role: "user", content: user }] });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const x = JSON.parse(m[0]) as Record<string, unknown>;
    const html = typeof x.html === "string" ? x.html : "";
    if (!html.trim()) return null;
    return {
      kind: typeof x.kind === "string" ? x.kind : kind,
      title: typeof x.title === "string" ? x.title : "Untitled activity",
      instructions: typeof x.instructions === "string" ? x.instructions : "",
      html,
      bloomsLevel: clampBloom(x.bloomsLevel ?? bloom),
      difficulty: clampDiff(x.difficulty ?? difficulty),
      rationale: typeof x.rationale === "string" ? x.rationale : "",
    };
  } catch {
    return null;
  }
}

/**
 * Generate a MENU of activities. Each activity is produced in its OWN small, parallel call
 * (one kind + Bloom's level per call) rather than one huge response — a single giant JSON
 * array reliably overran the token budget and truncated. Fanning out keeps every call fast
 * and well under the limit, and lets us deliberately spread the set across Bloom's levels.
 */
export async function generateActivities(
  content: string,
  opts?: { count?: number; kinds?: string[]; targetBloom?: string | null; targetDifficulty?: string | null }
): Promise<GeneratedActivity[]> {
  const count = Math.max(1, Math.min(6, opts?.count ?? 4));
  const kindPool = opts?.kinds?.length ? opts.kinds : ["quiz", "flashcards", "matching", "scenario", "drag_drop", "hotspot"];
  // Spread Bloom's from recall to higher-order (unless the author pinned a target).
  const bloomOrder = opts?.targetBloom ? [opts.targetBloom] : ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"];

  const plan = Array.from({ length: count }, (_, i) => ({
    kind: kindPool[i % kindPool.length],
    bloom: bloomOrder[i % bloomOrder.length],
    difficulty: opts?.targetDifficulty ?? null,
  }));

  const results = await Promise.all(plan.map((p) => generateOne(content, p.kind, p.bloom, p.difficulty)));
  const ok = results.filter((r): r is GeneratedActivity => r !== null);
  if (!ok.length) throw new Error("The generator could not produce activities from that content. Try again, or add more detail.");
  return ok;
}

export { MODEL as ACTIVITY_MODEL };
