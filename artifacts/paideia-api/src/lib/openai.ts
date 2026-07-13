import OpenAI from "openai";
import { db, aiUsageTable } from "@workspace/paideia-db";

// TRIM IS LOAD-BEARING. Secrets pasted into a hosting dashboard routinely pick up a
// leading space or a trailing newline, and that silently destroys the whole AI layer:
// the key goes straight into an Authorization header, and a header value containing
// whitespace/newlines is rejected by undici with "is not a legal HTTP header value".
// The OpenAI SDK wraps that as a generic APIConnectionError ("Connection error."),
// which looks exactly like a network outage, so it is extremely easy to misdiagnose.
// This actually happened in production: the key was stored as " sk-ant-...\n\n" and
// EVERY AI call (concept extraction, tutor, diagnostics, strategy) failed for weeks
// while the key, base URL, model and network were all perfectly fine.
const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"]?.trim();
const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"]?.trim();

if (!baseURL || !apiKey) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY must be set.",
  );
}

// timeout caps how long a single AI call can hang (the endpoint occasionally
// stalls); maxRetries:1 avoids the SDK's default 2-retry backoff turning a bad
// request into a ~minute-long hang. A failed call then surfaces as a clean error
// the caller converts into a 500, instead of a spinner that never resolves.
export const openai = new OpenAI({ baseURL, apiKey, timeout: 60_000, maxRetries: 1 });

// Served via Anthropic's OpenAI-compatible endpoint (AI_INTEGRATIONS_OPENAI_BASE_URL
// = https://api.anthropic.com/v1/). Use a Claude model name here, not an OpenAI one.
// Bump to "claude-sonnet-4-6" for higher-quality tutoring at higher cost.
export const PRIMARY_MODEL = "claude-haiku-4-5-20251001";

// Approximate USD pricing per 1M tokens (rough estimate for internal usage tracking
// only, not user billing; update to current Claude Haiku pricing when convenient).
// Stored as micro-USD per token for integer math.
const PROMPT_MICROS_PER_TOKEN = 250; // $0.25 / 1M = 0.00000025 = 250 nano = 0.25 micros per token
const COMPLETION_MICROS_PER_TOKEN = 2000; // $2.00 / 1M

function estimateMicrosUsd(model: string, promptTokens: number, completionTokens: number): number {
  void model;
  // The round MUST wrap the division, not precede it. Previously this was
  // Math.round(nanos) / 1000, which yields a FRACTION (e.g. 1234.567) -- and
  // cost_micros_usd is an integer column, so Postgres rejected the insert and the
  // error was swallowed by the .catch() on the usage write. Net effect: successful
  // AI calls were NEVER recorded (their token counts are non-zero, so the cost was
  // fractional), while failures always were (zero tokens -> cost 0 -> a valid int).
  // The usage table therefore showed nothing but errors, and looked like the AI was
  // 100% broken even during the periods it worked.
  const nanos =
    promptTokens * PROMPT_MICROS_PER_TOKEN + completionTokens * COMPLETION_MICROS_PER_TOKEN;
  return Math.round(nanos / 1000); // store as whole micros (1e-6 USD)
}

export interface GenerateOpts {
  teacherId?: string | null;
  kind: string;
}

// Pull a JSON value out of a model response that may be wrapped in ```json fences
// or padded with prose (common with Claude via the OpenAI-compat endpoint, which
// does not honor response_format). Isolates the outermost {...} or [...].
function extractJson(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) t = fence[1].trim();
  const firstObj = t.indexOf("{");
  const firstArr = t.indexOf("[");
  let start = -1;
  if (firstObj === -1) start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else start = Math.min(firstObj, firstArr);
  if (start >= 0) {
    const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (end > start) t = t.slice(start, end + 1);
  }
  return t;
}

export async function generateJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  opts: GenerateOpts,
): Promise<T> {
  const start = Date.now();
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let success = true;
  let errorMessage: string | null = null;
  let parsed: T | null = null;
  try {
    const response = await openai.chat.completions.create({
      model: PRIMARY_MODEL,
      // Anthropic's OpenAI-compatible endpoint expects `max_tokens` and does NOT
      // support `response_format: json_object`; we instruct JSON in the prompt and
      // parse robustly (see extractJson) instead.
      max_tokens: 8192,
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\n\nRespond with ONLY the JSON described above — no markdown, no code fences, and no commentary before or after it.`,
        },
        { role: "user", content: userPrompt },
      ],
    });
    promptTokens = response.usage?.prompt_tokens ?? 0;
    completionTokens = response.usage?.completion_tokens ?? 0;
    totalTokens = response.usage?.total_tokens ?? promptTokens + completionTokens;
    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error("Empty response from model");
    }
    try {
      parsed = JSON.parse(extractJson(text)) as T;
    } catch {
      throw new Error("Model returned invalid JSON");
    }
    return parsed;
  } catch (err) {
    success = false;
    errorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const latencyMs = Date.now() - start;
    const costMicros = estimateMicrosUsd(PRIMARY_MODEL, promptTokens, completionTokens);
    void db
      .insert(aiUsageTable)
      .values({
        teacherId: opts.teacherId ?? null,
        kind: opts.kind,
        model: PRIMARY_MODEL,
        promptTokens,
        completionTokens,
        totalTokens,
        costMicrosUsd: costMicros,
        latencyMs,
        success,
        errorMessage: errorMessage ?? null,
      })
      .catch(() => {
        // swallow analytics errors; never break the user request
      });
  }
}
