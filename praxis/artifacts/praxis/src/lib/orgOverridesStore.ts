import { useEffect, useReducer } from 'react';
import type { AuditEntry } from './partnerHubData';

/**
 * Client-side store for organisation edits that must propagate everywhere (currently the org name)
 * plus an append-only change log surfaced in the Activity Log. Renaming an org updates the name by
 * id AND by its original seeded name, so both id-keyed views (org hub, sidebar, lists, impersonation)
 * and name-keyed seeded data (finance / funders / documents rows) show the new name. Reset on reload.
 */

const nameById: Record<string, string> = {};
const byOriginalName: Record<string, string> = {};
let changeLog: AuditEntry[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Current name for an org id, if it was renamed. */
export function orgNameOverride(orgId: string): string | undefined {
  return nameById[orgId];
}

/** Map a (possibly seeded) org name string to its current display name. */
export function orgLabel(name: string): string {
  return byOriginalName[name] ?? name;
}

export function orgChangeLog(): AuditEntry[] {
  return changeLog;
}

export function useOrgOverrides(): { changeLog: AuditEntry[] } {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => { listeners.delete(force); };
  }, []);
  return { changeLog };
}

/** Rename an org. Records old -> new + timestamp in the change log. Returns false if unchanged. */
export function renameOrg(orgId: string, originalName: string, oldName: string, newName: string, actor: string, actorRole: string): boolean {
  const name = newName.trim();
  if (!name || name === oldName) return false;
  nameById[orgId] = name;
  byOriginalName[originalName] = name; // seeded name -> current
  byOriginalName[oldName] = name; // previous display -> current (chained renames)
  changeLog = [{
    id: `orgchg_${Date.now()}`, at: new Date().toISOString(),
    actor, actorRole, action: 'organisation.rename', resource: name, category: 'account',
    detail: `Organisation renamed from "${oldName}" to "${name}"`,
  }, ...changeLog];
  emit();
  return true;
}
