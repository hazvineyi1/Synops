import OpenAI from "openai";
import { db, aiUsageTable } from "@workspace/paideia-db";

const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];

if (!baseURL || !apiKey) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY must be set.",
  );
}

export const openai = new OpenAI({ baseURL, apiKey });

export const PRIMARY_MODEL = "gpt-5-mini";

// Approximate USD pricing per 1M tokens for gpt-5-mini. Adjust if pricing changes.
// Stored as micro-USD per token for integer math.
const PROMPT_MICROS_PER_TOKEN = 250; // $0.25 / 1M = 0.00000025 = 250 nano = 0.25 micros per token
const COMPLETION_MICROS_PER_TOKEN = 2000; // $2.00 / 1M

function estimateMicrosUsd(model: string, promptTokens: number, completionTokens: number): number {
  void model;
  return Math.round(
    promptTokens * PROMPT_MICROS_PER_TOKEN + completionTokens * COMPLETION_MICROS_PER_TOKEN,
  ) / 1000; // store as micros (1e-6 USD), dividing nanos by 1000
}

export interface GenerateOpts {
  teacherId?: string | null;
  kind: string;
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
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });
    promptTokens = response.usage?.prompt_tokens ?? 0;
    completionTokens = response.usage?.completion_tokens ?? 0;
    totalTokens = response.usage?.total_tokens ?? promptTokens + completionTokens;
    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error("Empty response from model");
    }
    try {
      parsed = JSON.parse(text) as T;
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
