import { anthropic } from "@workspace/integrations-anthropic-ai";

/**
 * Socratic math coach. The learner works a real problem (visually, on the frontend); when they're
 * stuck or wrong they can ask the coach. The coach NEVER gives or computes the answer — it responds
 * with one small guiding question grounded in what the learner just tried (the same "guide, don't
 * tell" discipline as the platform's Socratic engine, but tuned for K-12 math). After repeated
 * misses it offers a worked example of a SIMILAR problem (different numbers), so the method is modeled
 * without ever revealing this problem's answer.
 */
const MODEL = "claude-sonnet-4-6";

export interface MathHintInput {
  problem: string;
  answer: string;
  studentAnswer?: string;
  attempts: number;
  grade?: string;
}

export async function mathHint(input: MathHintInput): Promise<{ hint: string; offerWorkedExample: boolean }> {
  const grade = input.grade || "a middle-school";
  const answer = String(input.answer ?? "");
  const system = `You are a warm, encouraging math coach for ${grade} student. You use the SOCRATIC method.

HARD RULES:
- You NEVER state, compute, or even partially reveal the final answer (which is "${answer}"). Not the number, not "it's close to", nothing. If the learner begs "just tell me", gently decline and point to the next small step.
- Respond with exactly ONE short, friendly guiding question or nudge — 1 to 2 sentences, plain kid-friendly words.
- Ground it in what the learner just tried: if they made a specific slip, ask a question that helps them notice it themselves.
- Encouraging, never shaming. No lists, no markdown, no preamble.
Return ONLY the hint sentence(s).`;
  const user = `Problem: ${input.problem}
Correct answer (for YOUR reference only — never reveal): ${answer}
${input.studentAnswer ? `The learner answered "${input.studentAnswer}", which is not correct.` : "The learner is stuck and hasn't answered yet."}
This is attempt ${input.attempts}. Give ONE Socratic hint that moves them one small step forward.`;

  try {
    const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 220, system, messages: [{ role: "user", content: user }] });
    let text = (msg.content as { type: string; text?: string }[]).map((b) => (b.type === "text" ? b.text ?? "" : "")).join("").trim();
    // Guardrail: if the model slipped and echoed the exact answer, fall back to a safe nudge.
    if (text && answer && text.replace(/\s+/g, "").toLowerCase().includes(answer.replace(/\s+/g, "").toLowerCase()) && answer.length >= 2) {
      text = "What is the very first step you could take here? Try naming just one thing you could do to the problem.";
    }
    return { hint: text || "What do you already know from the problem? Start by writing down just the first step.", offerWorkedExample: input.attempts >= 3 };
  } catch {
    return { hint: "Take it one step at a time — what could you do first? Try that, then tell me what you get.", offerWorkedExample: input.attempts >= 3 };
  }
}

export interface WorkedStep { heading: string; detail: string }

export async function mathWorkedExample(input: { problem: string; answer: string; grade?: string }): Promise<{ intro: string; steps: WorkedStep[]; tryAgain: string }> {
  const grade = input.grade || "a middle-school";
  const answer = String(input.answer ?? "");
  const system = `You are a patient math coach for ${grade} student who has tried a problem a few times.
Give a short worked example of a SIMILAR problem with DIFFERENT numbers (never the same as the learner's problem), fully solved, so they see the METHOD. Then invite them to apply the method to their own problem.
Return ONLY JSON of exactly this shape: {"intro": string, "steps": [{"heading": string, "detail": string}], "tryAgain": string}
Rules:
- Use DIFFERENT numbers from the learner's problem so you never reveal their answer "${answer}".
- 2 to 4 steps; each heading 2-5 words; each detail 1-2 short kid-friendly sentences showing the thinking.
- intro: one warm sentence. tryAgain: one line inviting them to try their own problem now.
- Plain text only, no markdown.`;
  const user = `The learner's problem is: ${input.problem}. Show a worked example of a SIMILAR but different problem, then hand back to them.`;

  const fallback = {
    intro: "This kind of problem is tricky at first — let's look at one like it together.",
    steps: [
      { heading: "Read it carefully", detail: "Find what the problem is asking for and write down the numbers you know." },
      { heading: "Take one step", detail: "Do one small move at a time and check it makes sense before the next." },
    ],
    tryAgain: "Now try yours the same way — one step at a time. You've got this!",
  };
  try {
    const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 700, system, messages: [{ role: "user", content: user }] });
    const text = (msg.content as { type: string; text?: string }[]).map((b) => (b.type === "text" ? b.text ?? "" : "")).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return fallback;
    const p = JSON.parse(m[0]) as { intro?: unknown; steps?: unknown; tryAgain?: unknown };
    const steps = Array.isArray(p.steps)
      ? (p.steps as { heading?: unknown; detail?: unknown }[]).filter((s) => s?.heading && s?.detail).slice(0, 4).map((s) => ({ heading: String(s.heading), detail: String(s.detail) }))
      : [];
    return {
      intro: (typeof p.intro === "string" && p.intro) || fallback.intro,
      steps: steps.length ? steps : fallback.steps,
      tryAgain: (typeof p.tryAgain === "string" && p.tryAgain) || fallback.tryAgain,
    };
  } catch {
    return fallback;
  }
}

export interface MathProblem {
  prompt: string; answer: string; kind: "number" | "text"; min?: number; max?: number; hint?: string;
  // Optional visual manipulative the learner works with:
  //   "bar"     — a tape/bar model for ratios & part-whole. Provide `bars` (each with a label + unit count).
  //   "balance" — a balance scale for linear equations a*x + b = c. Provide `eq`.
  //   default is a number line (for a single numeric answer).
  visual?: "numberline" | "bar" | "balance";
  bars?: { label: string; units: number }[];
  eq?: { a: number; b: number; c: number };
}

/** Generate a set of math problems grounded in the lesson content, at a grade + rigor. */
export async function generateMathSet(input: { subject: string; grade: string; rigor: string; content: string; topic?: string }): Promise<{ title: string; problems: MathProblem[] }> {
  const content = (input.content || "").trim();
  if (content.length < 20) throw new Error("Add more lesson content to generate math problems from.");
  const system = `You are an expert math teacher. Create a set of practice problems grounded strictly in the provided lesson content, pitched to ${input.grade} at ${input.rigor} rigor.
Return ONLY strict JSON of this exact shape:
{"title": string, "problems": [{"prompt": string, "answer": string, "kind": "number" | "text", "min": number, "max": number, "hint": string, "visual": "numberline" | "bar" | "balance", "bars": [{"label": string, "units": number}], "eq": {"a": number, "b": number, "c": number}}]}
Rules:
- 6 problems, rising in difficulty.
- "prompt" is the problem the student solves (e.g. "Solve: 2x - 4 = 10" or "A recipe uses 2 cups flour for 3 cups sugar. How many cups of flour for 9 cups of sugar?").
- "answer" is the exact answer (e.g. "7", "6 cups", "x = 5"). Keep it short.
- "kind": "number" when the answer is a single number; otherwise "text".
- Choose the best VISUAL manipulative per problem:
  - "balance": for a LINEAR EQUATION of the form a*x + b = c (b may be negative). Set "eq":{"a":..,"b":..,"c":..}; the answer is x. Use ONLY small whole-number coefficients and a whole-number solution.
  - "bar": for a RATIO or part-whole problem. Set "bars" to the parts as whole unit counts (e.g. boys 3 units, girls 4 units). Keep it to 2 bars.
  - "numberline": for any other single-number answer. Set "min" and "max" to a whole-number range that BRACKETS the answer (e.g. answer 7 -> min 0, max 15).
- Always still set "kind", and "min"/"max" whenever the answer is a single number (even for bar/balance) so it can be checked. For "text" answers use "numberline" only if numeric; otherwise omit min/max.
- "hint": one short first-step nudge (never the answer).
- Ground every problem in the lesson content. Plain text only.`;
  const user = `Subject: ${input.subject || "Math"}. ${input.topic ? "Focus: " + input.topic + ". " : ""}Build the problems from this LESSON CONTENT:\n\n${content.slice(0, 12000)}\n\nReturn ONLY the JSON.`;
  let parsed: { title?: unknown; problems?: unknown };
  try {
    const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 2000, system, messages: [{ role: "user", content: user }] });
    const text = (msg.content as { type: string; text?: string }[]).map((b) => (b.type === "text" ? b.text ?? "" : "")).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no json");
    parsed = JSON.parse(m[0]);
  } catch {
    throw new Error("Could not generate math problems from that content. Try again, or add more detail.");
  }
  const rawProblems = Array.isArray(parsed.problems) ? parsed.problems : [];
  const problems: MathProblem[] = rawProblems
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && typeof (p as { prompt?: unknown }).prompt === "string" && String((p as { prompt?: unknown }).prompt).trim().length > 0)
    .map((p) => {
      const kind = (p.kind === "number" && Number.isFinite(Number(p.min)) && Number.isFinite(Number(p.max))) ? "number" : "text";
      const eq = p.eq as { a?: unknown; b?: unknown; c?: unknown } | undefined;
      const eqOk = !!eq && [eq.a, eq.b, eq.c].every((n) => Number.isFinite(Number(n)));
      const barsRaw = Array.isArray(p.bars) ? (p.bars as { label?: unknown; units?: unknown }[]) : [];
      const bars = barsRaw.filter((x) => x && Number.isFinite(Number(x.units))).map((x) => ({ label: String(x.label ?? ""), units: Number(x.units) }));
      let visual: "numberline" | "bar" | "balance" = "numberline";
      if (p.visual === "balance" && eqOk) visual = "balance";
      else if (p.visual === "bar" && bars.length >= 1) visual = "bar";
      return {
        prompt: String(p.prompt),
        answer: String(p.answer ?? ""),
        kind: kind as "number" | "text",
        ...(kind === "number" ? { min: Number(p.min), max: Number(p.max) } : {}),
        hint: typeof p.hint === "string" ? p.hint : undefined,
        visual,
        ...(visual === "bar" ? { bars } : {}),
        ...(visual === "balance" && eqOk ? { eq: { a: Number(eq!.a), b: Number(eq!.b), c: Number(eq!.c) } } : {}),
      };
    })
    .slice(0, 8);
  if (!problems.length) throw new Error("The generated problems weren't in the right shape. Try again.");
  return { title: (typeof parsed.title === "string" && parsed.title) || `${input.subject || "Math"} — Math Coach`, problems };
}

/** Deterministic answer check — lenient about spacing, "x =" prefixes, and numeric equivalence. */
export function checkMathAnswer(student: string, correct: string): boolean {
  const norm = (s: string) => String(s ?? "").toLowerCase().replace(/\s+/g, "").replace(/^[a-z]=/, "").replace(/[.,;]$/, "");
  const a = norm(student);
  const b = norm(correct);
  if (!a) return false;
  if (a === b) return true;
  const na = Number(a.replace(/[^0-9.\-/]/g, ""));
  const nb = Number(b.replace(/[^0-9.\-/]/g, ""));
  if (Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 1e-9) return true;
  return false;
}
