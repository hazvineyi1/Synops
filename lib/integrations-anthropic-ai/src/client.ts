import Anthropic from "@anthropic-ai/sdk";

/**
 * Anthropic client, lazily constructed.
 *
 * This used to `throw` at MODULE LOAD if the AI env vars were missing. Because the
 * routes import it at the top level, that throw happened during boot -- so the ENTIRE
 * platform (login, courses, enrolments, progress, the admin console) refused to start
 * without an AI key, even though AI is only needed for Socratic sessions and Studio.
 *
 * Now the client is built on first use. A missing key breaks exactly the AI features
 * and nothing else, and the error surfaces on the request that needed it rather than
 * as a cryptic crash loop at startup.
 */

// TRIM IS LOAD-BEARING. Secrets pasted into a hosting dashboard routinely pick up a
// leading space or a trailing newline. The key goes straight into an Authorization
// header, and a header value containing whitespace is rejected outright -- the SDK then
// reports it as a generic connection error, which looks exactly like a network outage.
// This is not hypothetical: it silently killed every AI call in Synops Coach for weeks.
const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL?.trim();
const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim();

export function isAiConfigured(): boolean {
  return Boolean(baseURL && apiKey);
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!isAiConfigured()) {
    throw new Error(
      "AI is not configured on this server. Set AI_INTEGRATIONS_ANTHROPIC_BASE_URL and " +
        "AI_INTEGRATIONS_ANTHROPIC_API_KEY to enable Socratic sessions and Studio.",
    );
  }
  if (!client) {
    client = new Anthropic({
      apiKey,
      baseURL,
      // Cap a stalled call instead of letting a request hang indefinitely.
      timeout: 60_000,
      maxRetries: 1,
    });
  }
  return client;
}

/**
 * Proxy so existing call sites (`anthropic.messages.create(...)`) keep working
 * unchanged, while construction — and any "not configured" error — is deferred until
 * the moment an AI feature is actually used.
 */
export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient() as object, prop, receiver);
  },
});
