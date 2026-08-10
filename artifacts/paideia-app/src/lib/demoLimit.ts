// Client-side generation cap for demo teachers. Best-effort only (localStorage),
// meant as a gentle nudge to sign up, not a security control.
export const DEMO_GEN_LIMIT = 3;

const KEY = "synops_demo_gen_count";

export function demoGenUsed(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function incrementDemoGen(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, String(demoGenUsed() + 1));
}

export function demoGenRemaining(): number {
  return Math.max(0, DEMO_GEN_LIMIT - demoGenUsed());
}
