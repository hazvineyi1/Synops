import { useEffect, useState } from 'react';

/**
 * The adaptive engine (shared). Three kinds of adaptivity, kept small and dependency-free so any
 * screen can consume it:
 *   1. Adaptive interface  -- `useAdaptive()` exposes a persisted density mode: 'guided' (more
 *      scaffolding, helper text, air) or 'pro' (denser, less hand-holding). The same product, at the
 *      depth the person needs. Syncs across components via a window event, so no provider is required.
 *   2. Adaptive learning path + coaching -- `nextMove()` reads the learner's own state and returns the
 *      single most useful next action, so the interface points the way instead of showing everything.
 */

export type Mode = 'guided' | 'pro';
const KEY = 'praxis_adaptive_mode_v1';
const EVT = 'praxis-adaptive-mode';

function readMode(): Mode {
  try { return (localStorage.getItem(KEY) as Mode) || 'guided'; } catch { return 'guided'; }
}

export function useAdaptive() {
  const [mode, setMode] = useState<Mode>(readMode);
  useEffect(() => {
    const on = () => setMode(readMode());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  const set = (m: Mode) => {
    try { localStorage.setItem(KEY, m); } catch { /* private mode */ }
    window.dispatchEvent(new Event(EVT));
    setMode(m);
  };
  return { mode, set, guided: mode === 'guided', pro: mode === 'pro' };
}

// ── Adaptive learning path ────────────────────────────────────────────────────
export type PathCredential = {
  id: string; title: string; status: string; sort: number;
  evidence_count?: number; reflection_count?: number;
  stage_counts?: Record<string, number> | null;
};
export type NextMove = { tone: 'act' | 'start' | 'choose' | 'rest'; overline: string; title: string; detail: string; cta: string; href: string | null; momentum?: string };

// The four Kolb moves and the reflection signals that light each one.
const KOLB = [
  { key: 'e', label: 'a concrete experience', lit: (c: PathCredential, sc: Record<string, number>) => (c.evidence_count ?? 0) > 0 || (sc.description ?? 0) > 0 },
  { key: 'r', label: 'a reflection on it', lit: (_c: PathCredential, sc: Record<string, number>) => (sc.feelings ?? 0) > 0 || (sc.evaluation ?? 0) > 0 || (sc.note ?? 0) > 0 || (sc.surprise ?? 0) > 0 },
  { key: 'n', label: 'the idea it points to', lit: (_c: PathCredential, sc: Record<string, number>) => (sc.analysis ?? 0) > 0 || (sc.conclusion ?? 0) > 0 },
  { key: 't', label: 'something to try next', lit: (_c: PathCredential, sc: Record<string, number>) => (sc.action ?? 0) > 0 },
];

/** Recognition of where the learner is, turned into one clear next step. */
export function nextMove(mine: PathCredential[]): NextMove {
  if (!mine.length) {
    return { tone: 'choose', overline: 'Start here', title: 'Choose your first credential', detail: 'Pick a practice you want recognised. Everything else follows from your own experience.', cta: 'Choose a credential', href: null };
  }
  const byOrder = [...mine].sort((a, b) => a.sort - b.sort);

  const referred = byOrder.find((c) => c.status === 'referred');
  if (referred) {
    return { tone: 'act', overline: 'A reviewer replied', title: `Respond to feedback on ${referred.title}`, detail: 'A reviewer returned developmental feedback. Take another turn on the cycle and resubmit when it is stronger.', cta: 'Open feedback', href: `/practice/c/${referred.id}` };
  }

  const active = byOrder.find((c) => c.status === 'in_progress');
  if (active) {
    const sc = active.stage_counts ?? {};
    const missing = KOLB.find((k) => !k.lit(active, sc));
    const remaining = KOLB.filter((k) => !k.lit(active, sc)).length;
    // Goal-gradient nudge: naming how close a full cycle is pulls people the last stretch.
    const momentum = remaining === 1 ? 'You are one move from a full cycle.' : `You are ${remaining} moves from a full cycle.`;
    return missing
      ? { tone: 'act', overline: 'Continue the cycle', title: `${active.title}: add ${missing.label}`, detail: 'You are mid-cycle. The next move that will move your portfolio forward is here.', cta: 'Enter the cycle', href: `/practice/c/${active.id}`, momentum }
      : { tone: 'act', overline: 'Ready to submit', title: `${active.title} has a full cycle`, detail: 'Every move of the cycle is worked. Check it against the gateways and send it for review.', cta: 'Review and submit', href: `/practice/c/${active.id}`, momentum: 'A full cycle, worked end to end.' };
  }

  const chosen = byOrder.find((c) => c.status === 'chosen');
  if (chosen) {
    return { tone: 'start', overline: 'Not yet started', title: `Begin ${chosen.title}`, detail: 'Start with a real moment from your practice. Your coach will help you turn it into learning.', cta: 'Enter the cycle', href: `/practice/c/${chosen.id}` };
  }

  return { tone: 'rest', overline: 'All caught up', title: 'Your portfolios are with reviewers', detail: 'Nothing needs you right now. Add another credential when you are ready to keep building.', cta: 'Choose another', href: null };
}

/** Overall progress across the learner's credentials, 0..1, for the adaptive look. */
export function overallProgress(mine: PathCredential[]): number {
  if (!mine.length) return 0;
  let lit = 0;
  for (const c of mine) {
    const sc = c.stage_counts ?? {};
    lit += KOLB.filter((k) => k.lit(c, sc)).length;
  }
  return lit / (mine.length * KOLB.length);
}
