import { useEffect, useReducer } from 'react';
import { apiFetch } from '@/lib/api';

/**
 * Learning Hub store, backed by the real API (/api/learning/*).
 *
 * The module keeps in-memory caches of content / templates / assignments that the UI reads
 * synchronously (so existing components need no async plumbing), hydrates them once from the
 * backend on first use, and writes every mutation through to the API (optimistic where it helps).
 * File blobs go to Supabase Storage via the upload endpoint; links and metadata persist in Postgres.
 */

export type ContentKind = 'video' | 'document' | 'image' | 'link' | 'scorm';
export type ContentItem = {
  id: string;
  title: string;
  kind: ContentKind;
  meta: string;
  url?: string | null;
  tags: string[];
  addedAt: string;
  addedBy: string;
  status: 'ready' | 'processing';
  reviewed: boolean;
};

export type CourseTemplate = {
  id: string;
  title: string;
  level: 'Foundational' | 'Intermediate' | 'Advanced';
  modality: 'Online' | 'Hybrid' | 'In-person';
  modules: number;
  hours: number;
  standard: string;
  description: string;
  kind: 'course' | 'lesson' | 'assessment';
};

export type CourseAssignment = { courseId: string; partnerId: string; assignedAt: string };

let content: ContentItem[] = [];
let templates: CourseTemplate[] = [];
let assignments: CourseAssignment[] = [];

let loaded = false;
let loading: Promise<void> | null = null;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// ── mappers (API row -> UI shape) ────────────────────────────────────────────
function mapContent(r: any): ContentItem {
  return {
    id: r.id, title: r.title, kind: r.kind, meta: r.meta ?? '', url: r.url ?? null,
    tags: typeof r.tags === 'string' && r.tags ? r.tags.split(',').filter(Boolean) : [],
    addedAt: (r.createdAt ?? r.created_at ?? new Date().toISOString()).slice(0, 10),
    addedBy: r.addedBy ?? r.added_by ?? 'System', status: 'ready', reviewed: !!r.reviewed,
  };
}
function mapTemplate(r: any): CourseTemplate {
  return {
    id: r.id, title: r.title, level: r.level, modality: r.modality,
    modules: r.modules ?? 1, hours: r.hours ?? 1, standard: r.standard ?? '',
    description: r.description ?? '', kind: r.kind ?? 'course',
  };
}
function mapAssignment(r: any): CourseAssignment {
  return { courseId: r.courseId ?? r.course_id, partnerId: r.partnerId ?? r.partner_id, assignedAt: (r.assignedAt ?? r.assigned_at ?? '').slice(0, 10) };
}

async function load(): Promise<void> {
  if (loaded) return;
  if (loading) return loading;
  loading = (async () => {
    const [c, t, a] = await Promise.all([
      apiFetch<any[]>('/learning/content'),
      apiFetch<any[]>('/learning/templates'),
      apiFetch<any[]>('/learning/assignments'),
    ]);
    content = c.map(mapContent);
    templates = t.map(mapTemplate);
    assignments = a.map(mapAssignment);
    loaded = true;
    emit();
  })().catch((e) => { console.error('Learning Hub load failed', e); }).finally(() => { loading = null; });
  return loading;
}

// ── reads (sync, from cache) ─────────────────────────────────────────────────
export function learningContent(): ContentItem[] { return content; }
export function learningTemplates(): CourseTemplate[] { return templates; }
export function courseAssignments(): CourseAssignment[] { return assignments; }
export function partnersForCourse(courseId: string): string[] { return assignments.filter((a) => a.courseId === courseId).map((a) => a.partnerId); }
export function coursesForPartner(partnerId: string): string[] { return assignments.filter((a) => a.partnerId === partnerId).map((a) => a.courseId); }

// ── writes (persist to API, update cache) ────────────────────────────────────
export async function addContent(item: { title: string; kind: ContentKind; meta?: string; url?: string | null; tags?: string[]; addedBy?: string; reviewed?: boolean }): Promise<ContentItem> {
  const row = await apiFetch<any>('/learning/content', {
    method: 'POST',
    body: JSON.stringify({ title: item.title, kind: item.kind, meta: item.meta, url: item.url, tags: item.tags ?? [], reviewed: item.reviewed }),
  });
  const rec = mapContent(row);
  content = [rec, ...content];
  emit();
  return rec;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Upload a real file to Supabase Storage via the backend, then record it. */
export async function uploadContent(file: File): Promise<ContentItem> {
  const dataBase64 = await fileToBase64(file);
  const row = await apiFetch<any>('/learning/content/upload', {
    method: 'POST',
    body: JSON.stringify({ filename: file.name, dataBase64, title: file.name }),
  });
  const rec = mapContent(row);
  content = [rec, ...content];
  emit();
  return rec;
}

export async function removeContent(id: string): Promise<void> {
  const prev = content;
  content = content.filter((c) => c.id !== id); emit(); // optimistic
  try { await apiFetch(`/learning/content/${id}`, { method: 'DELETE' }); }
  catch (e) { content = prev; emit(); throw e; }
}

export async function markReviewed(id: string): Promise<void> {
  content = content.map((c) => (c.id === id ? { ...c, reviewed: true } : c)); emit(); // optimistic
  try { await apiFetch(`/learning/content/${id}/review`, { method: 'PATCH' }); }
  catch { /* reload on next mount */ }
}

export async function addTemplate(tpl: Omit<CourseTemplate, 'id'>): Promise<CourseTemplate> {
  const row = await apiFetch<any>('/learning/templates', { method: 'POST', body: JSON.stringify(tpl) });
  const rec = mapTemplate(row);
  templates = [rec, ...templates];
  emit();
  return rec;
}

export async function setCourseAssignments(courseId: string, partnerIds: string[]): Promise<void> {
  const rows = await apiFetch<any[]>(`/learning/assignments/${courseId}`, { method: 'PUT', body: JSON.stringify({ partnerIds }) });
  assignments = [...assignments.filter((a) => a.courseId !== courseId), ...rows.map(mapAssignment)];
  emit();
}

export async function toggleAssignment(courseId: string, partnerId: string): Promise<void> {
  const has = assignments.some((a) => a.courseId === courseId && a.partnerId === partnerId);
  // optimistic
  assignments = has
    ? assignments.filter((a) => !(a.courseId === courseId && a.partnerId === partnerId))
    : [...assignments, { courseId, partnerId, assignedAt: new Date().toISOString().slice(0, 10) }];
  emit();
  try { await apiFetch('/learning/assignments/toggle', { method: 'POST', body: JSON.stringify({ courseId, partnerId }) }); }
  catch (e) {
    // revert on failure
    assignments = has
      ? [...assignments, { courseId, partnerId, assignedAt: new Date().toISOString().slice(0, 10) }]
      : assignments.filter((a) => !(a.courseId === courseId && a.partnerId === partnerId));
    emit(); throw e;
  }
}

/** Reactive hook: hydrates on first mount, re-renders on any change. */
export function useLearningHub() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    void load();
    return () => { listeners.delete(force); };
  }, []);
  return { content, templates, assignments, loaded };
}
