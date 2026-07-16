import { anthropic } from "@workspace/integrations-anthropic-ai";

/**
 * AI activity generator. Given raw course content, produce a MENU of interactive activities.
 *
 * Design: the model returns a small STRUCTURED SPEC per activity (a few questions / cards /
 * pairs / steps / buckets) — NOT raw HTML. The frontend renders the spec through the shared
 * activityTemplates engine, exactly like the no-code builder and the library. Returning a
 * compact JSON spec (instead of a whole escaped HTML document) is far more reliable and lets
 * the AI produce every interaction type, not just quizzes.
 */

const MODEL = "claude-sonnet-4-6";

export type ActivityType = "quiz" | "flashcards" | "matching" | "order" | "categorize";
export const ACTIVITY_TYPES: ActivityType[] = ["quiz", "flashcards", "matching", "order", "categorize"];
export const BLOOMS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"] as const;
export const DIFFICULTIES = ["foundational", "intermediate", "advanced"] as const;

export interface GeneratedActivity {
  type: ActivityType;
  title: string;
  instructions: string;
  bloomsLevel: string;
  difficulty: string;
  rationale: string;
  spec: unknown;
}

const SPEC_SHAPE: Record<ActivityType, string> = {
  quiz: '{"questions":[{"q":"question text","options":[{"t":"option","correct":true,"why":"why the right answer is right"},{"t":"option","correct":false}]}]}  (3-5 questions, 3-4 options each, exactly one correct, put the explanation in the correct option\'s "why")',
  flashcards: '{"cards":[{"front":"prompt/term","back":"answer/definition"}]}  (4-6 cards)',
  matching: '{"pairs":[{"left":"item","right":"its match"}]}  (4-6 pairs)',
  order: '{"items":["step 1","step 2","step 3"]}  (4-6 items already IN THE CORRECT ORDER; the app shuffles them)',
  categorize: '{"buckets":["Bucket A","Bucket B"],"items":[{"text":"item","bucket":"Bucket A"}]}  (2-3 buckets, 5-8 items; each item.bucket MUST be one of the buckets)',
};

const SYSTEM = `You are an expert instructional designer. You turn course content into a SHORT, engaging interactive activity of a specified type, grounded strictly in the provided content.

Set an honest Bloom's level (Remember, Understand, Apply, Analyze, Evaluate, or Create) and difficulty (foundational, intermediate, advanced), and briefly justify the rigor in "rationale". Write clear, learner-friendly text. Keep it focused and on-topic.

Return ONLY a single strict JSON object (no prose, no code fences) with EXACTLY these keys:
"type", "title", "instructions", "bloomsLevel", "difficulty", "rationale", "spec"
where "spec" matches the shape for the given type. Do not include any HTML.`;

const clampBloom = (b: unknown, fb: string) => (typeof b === "string" && (BLOOMS as readonly string[]).includes(b) ? b : fb);
const clampDiff = (d: unknown, fb: string | null) => (typeof d === "string" && (DIFFICULTIES as readonly string[]).includes(d) ? d : (fb ?? "intermediate"));

/** Basic shape check so a malformed spec doesn't reach the renderer. */
function specValid(type: ActivityType, s: unknown): boolean {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  const arr = (x: unknown) => Array.isArray(x) && x.length > 0;
  if (type === "quiz") return arr(o.questions);
  if (type === "flashcards") return arr(o.cards);
  if (type === "matching") return arr(o.pairs);
  if (type === "order") return arr(o.items);
  if (type === "categorize") return arr(o.buckets) && arr(o.items);
  return false;
}

async function generateOne(content: string, type: ActivityType, bloom: string, difficulty: string | null): Promise<GeneratedActivity | null> {
  const user = `Build ONE "${type}" activity from the COURSE CONTENT below. Aim for Bloom's level ${bloom}${difficulty ? `, difficulty ${difficulty}` : ""}.\nThe "spec" must match this shape: ${SPEC_SHAPE[type]}\nReturn only the JSON object.\n\n=== COURSE CONTENT ===\n${content.slice(0, 10000)}`;
  try {
    const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 2500, system: SYSTEM, messages: [{ role: "user", content: user }] });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const x = JSON.parse(m[0]) as Record<string, unknown>;
    if (!specValid(type, x.spec)) return null;
    return {
      type,
      title: typeof x.title === "string" ? x.title : "Untitled activity",
      instructions: typeof x.instructions === "string" ? x.instructions : "",
      bloomsLevel: clampBloom(x.bloomsLevel, bloom),
      difficulty: clampDiff(x.difficulty, difficulty),
      rationale: typeof x.rationale === "string" ? x.rationale : "",
      spec: x.spec,
    };
  } catch {
    return null;
  }
}

/**
 * Generate a MENU of activities. Each is its own small, parallel call (one type + Bloom's
 * level per call), spread across interaction types and Bloom's levels.
 */
export async function generateActivities(
  content: string,
  opts?: { count?: number; types?: string[]; targetBloom?: string | null; targetDifficulty?: string | null }
): Promise<GeneratedActivity[]> {
  const count = Math.max(1, Math.min(6, opts?.count ?? 4));
  const typePool = (opts?.types && opts.types.length ? opts.types : ["quiz", "flashcards", "matching", "order", "categorize"])
    .filter((t): t is ActivityType => (ACTIVITY_TYPES as string[]).includes(t));
  const pool = typePool.length ? typePool : ACTIVITY_TYPES;
  const bloomOrder = opts?.targetBloom ? [opts.targetBloom] : ["Remember", "Understand", "Apply", "Analyze", "Evaluate"];

  const plan = Array.from({ length: count }, (_, i) => ({
    type: pool[i % pool.length],
    bloom: bloomOrder[i % bloomOrder.length],
    difficulty: opts?.targetDifficulty ?? null,
  }));

  const results = await Promise.all(plan.map((p) => generateOne(content, p.type, p.bloom, p.difficulty)));
  const ok = results.filter((r): r is GeneratedActivity => r !== null);
  if (!ok.length) throw new Error("The generator could not produce activities from that content. Try again, or add more detail.");
  return ok;
}

export { MODEL as ACTIVITY_MODEL };
