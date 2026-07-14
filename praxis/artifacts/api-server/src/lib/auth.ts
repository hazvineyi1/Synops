import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

/**
 * First-party auth primitives (replacing Clerk).
 *
 * Deliberately uses Node's built-in crypto rather than adding bcrypt/argon2: those are
 * native modules, and a native dependency that fails to resolve at boot takes the whole
 * service down. scrypt is memory-hard, built in, and has no install step.
 */

const KEY_LEN = 64;

/** "salt:derived", both hex. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plain, salt, KEY_LEN).toString("hex");
  return `${salt}:${derived}`;
}

/** Constant-time compare. Returns false (never throws) on a malformed stored hash. */
export function verifyPassword(plain: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(plain, salt, KEY_LEN);
  const known = Buffer.from(hash, "hex");
  if (derived.length !== known.length) return false;
  return timingSafeEqual(derived, known);
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Reset tokens and API keys are stored hashed, never in plaintext. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export const SESSION_COOKIE = "praxis_session";
export const SESSION_TTL_DAYS = 30;

export function sessionExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_TTL_DAYS);
  return d;
}

export function cookieOptions(maxAgeMs = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000) {
  return {
    httpOnly: true,
    // Secure in production only, so local http development still works.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeMs,
  };
}

/** Password policy. Deliberately length-first: length beats character-class theatre. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Password must be at least 10 characters.";
  if (password.length > 200) return "Password is too long.";
  // Catches the genuinely catastrophic choices without pretending to be a strength meter.
  const banned = ["password", "12345678", "qwerty", "letmein", "welcome"];
  if (banned.some((b) => password.toLowerCase().includes(b))) {
    return "That password is too easy to guess.";
  }
  return null;
}

/**
 * API keys are shown once. Format: `sk_praxis_<random>`; the prefix is stored in the
 * clear so a key can be identified in a list without ever storing the secret.
 */
export function newApiKey(): { key: string; prefix: string; hash: string } {
  const raw = randomBytes(24).toString("base64url");
  const key = `sk_praxis_${raw}`;
  return { key, prefix: key.slice(0, 16), hash: sha256(key) };
}

/** Client IP, honouring the proxy header Railway/most hosts set. */
export function clientIp(req: { headers: Record<string, unknown>; ip?: string }): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0]!.trim();
  return req.ip ?? null;
}
