import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, self-verifying "magic link" tokens that let a learner who was pushed in
 * from an external LMS (Praxis) open the Coach without a password. The token is a
 * stateless HMAC over { userId, expiry } — no table needed. It is exchanged once at
 * POST /api/study/auth/enter for a normal study session cookie, after which the
 * learner is a fully ordinary signed-in Coach user.
 *
 * Secret precedence: LEARNER_LINK_SECRET, else SESSION_SECRET (always set in prod),
 * else a dev fallback. Mint and verify must resolve the same secret.
 */
const PREFIX = "coach_lt_";

function secret(): string {
  return (
    process.env["LEARNER_LINK_SECRET"] ||
    process.env["SESSION_SECRET"] ||
    "coach-learner-entry-dev-secret"
  );
}

export function mintEntryToken(userId: string, days = 60): string {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, e: Date.now() + days * 86_400_000 }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${PREFIX}${payload}.${sig}`;
}

/** Returns the userId if the token is well-formed, correctly signed, and unexpired; else null. */
export function verifyEntryToken(token: string): string | null {
  if (typeof token !== "string" || !token.startsWith(PREFIX)) return null;
  const [payload, sig] = token.slice(PREFIX.length).split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      u?: unknown;
      e?: unknown;
    };
    if (typeof parsed.u !== "string" || typeof parsed.e !== "number") return null;
    if (Date.now() > parsed.e) return null;
    return parsed.u;
  } catch {
    return null;
  }
}
