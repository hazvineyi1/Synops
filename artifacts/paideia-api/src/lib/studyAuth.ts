import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plain, salt, KEY_LEN).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
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

export const STUDY_SESSION_COOKIE = "paideia_study_session";
// Holds the admin's own session token while they impersonate another user, so
// "stop impersonating" can restore the original session.
export const STUDY_IMPERSONATOR_COOKIE = "paideia_study_impersonator";
export const STUDY_SESSION_TTL_DAYS = 30;

export function studySessionExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + STUDY_SESSION_TTL_DAYS);
  return d;
}
