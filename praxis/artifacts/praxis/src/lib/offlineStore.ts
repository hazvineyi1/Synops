/**
 * Tiny offline capture store for the Practice Credentials canvas. The programme is used on expensive,
 * intermittent mobile data, so candidates must be able to write reflections and evidence with no
 * connection and have it upload the moment they are back online ("do the work offline, upload in a
 * minute"). Everything here is localStorage only; no dependency, no network.
 */

export type Pending = {
  id: string;
  ccId: string;
  kind: 'reflection' | 'evidence';
  endpoint: string;
  payload: any;
  display: string;
  stage?: string;
  createdAt: number;
};

const QKEY = 'praxis_practice_pending_v1';

export function getPending(ccId?: string): Pending[] {
  try {
    const all: Pending[] = JSON.parse(localStorage.getItem(QKEY) || '[]');
    return ccId ? all.filter((p) => p.ccId === ccId) : all;
  } catch {
    return [];
  }
}

export function addPending(p: Omit<Pending, 'id' | 'createdAt'>): Pending {
  const item: Pending = { ...p, id: `pend_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now() };
  try {
    const all = getPending();
    all.push(item);
    localStorage.setItem(QKEY, JSON.stringify(all));
  } catch { /* ignore quota */ }
  return item;
}

export function removePending(id: string) {
  try {
    localStorage.setItem(QKEY, JSON.stringify(getPending().filter((p) => p.id !== id)));
  } catch { /* ignore */ }
}

// ── In-progress drafts (never lose typing on a refresh or a dropped connection) ──
export function loadDraft(key: string): string {
  try { return localStorage.getItem('praxis_draft_' + key) || ''; } catch { return ''; }
}
export function saveDraft(key: string, v: string) {
  try { if (v) localStorage.setItem('praxis_draft_' + key, v); else localStorage.removeItem('praxis_draft_' + key); } catch { /* ignore */ }
}
