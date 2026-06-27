import crypto from "node:crypto";

// Distribution loop rewards. Both sides get bonus Pro days, which makes inviting
// worthwhile and gives the new user a longer runway to convert.
export const REFERRAL_REWARD_DAYS = 14; // referrer, per friend who joins
export const REFEREE_BONUS_DAYS = 14; // the new user who joined via a link
// A referral can only be claimed by a genuinely new account.
export const REFERRAL_CLAIM_WINDOW_DAYS = 14;

// Deterministic, stable, collision-resistant invite code derived from the user id.
// 8 uppercase alphanumerics — short enough to share, unique per account.
export function referralCodeFor(userId: string): string {
  return crypto
    .createHash("sha256")
    .update(`ref:${userId}`)
    .digest("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();
}

// Add `days` to a trial, extending from whichever is later: now or the current
// end (so an already-active trial is lengthened, and an expired one restarts).
export function extendTrial(current: Date | null | undefined, days: number): Date {
  const base = Math.max(Date.now(), current ? new Date(current).getTime() : 0);
  return new Date(base + days * 24 * 60 * 60 * 1000);
}
