import { useEffect, useReducer } from 'react';
import type { ImpersonationSession } from './partnerHubData';

/**
 * Reactive store for the partner-admin impersonation session, shared across the Audit page and the
 * impersonation view so that starting a session on one surface is visible on the other and persists
 * while navigating between them (resets on full reload). Seeded/client-side only.
 */

export type ActiveImpersonation = {
  userId: string; name: string; role: string; orgId: string; orgName: string; admin: string; startedMs: number;
};

let active: ActiveImpersonation | null = null;
let log: ImpersonationSession[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useImpersonation(): { active: ActiveImpersonation | null; log: ImpersonationSession[] } {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => { listeners.delete(force); };
  }, []);
  return { active, log };
}

export function getActiveImpersonation(): ActiveImpersonation | null {
  return active;
}

export function startImpersonation(a: ActiveImpersonation) {
  active = a;
  log = [{
    id: `im_${a.startedMs}`, admin: a.admin, target: a.name, org: a.orgName,
    startedAt: new Date(a.startedMs).toISOString(), durationMin: 0, reason: 'Support / review', active: true,
  }, ...log];
  emit();
}

export function stopImpersonation() {
  if (!active) return;
  const mins = Math.max(1, Math.round((Date.now() - active.startedMs) / 60000));
  log = log.map((s) => (s.active ? { ...s, active: false, durationMin: mins } : s));
  active = null;
  emit();
}
