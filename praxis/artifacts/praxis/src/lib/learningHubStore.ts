import { useEffect, useReducer } from 'react';

/**
 * Learning Hub store (super-admin content home). Holds the platform content library (uploaded
 * videos / documents / links), a library of reusable course + lesson templates, and the mapping of
 * which courses are assigned to which partners. Client-side + reactive (subscribe/emit) - real
 * storage/upload is a backend step, exactly like the rest of the seeded Partner Hub prototype.
 */

export type ContentKind = 'video' | 'document' | 'image' | 'link' | 'scorm';
export type ContentItem = {
  id: string;
  title: string;
  kind: ContentKind;
  meta: string;        // size for files, url for links, etc.
  tags: string[];
  addedAt: string;     // ISO date
  addedBy: string;
  status: 'ready' | 'processing';
  reviewed: boolean;   // human-review gate (interactive assets start unreviewed)
};

export type CourseTemplate = {
  id: string;
  title: string;
  level: 'Foundational' | 'Intermediate' | 'Advanced';
  modality: 'Online' | 'Hybrid' | 'In-person';
  modules: number;
  hours: number;
  standard: string;     // aligned accreditor / framework
  description: string;
  kind: 'course' | 'lesson' | 'assessment';
};

export type CourseAssignment = { courseId: string; partnerId: string; assignedAt: string };

// ── Seeded starting content ──────────────────────────────────────────────────
const SEED_CONTENT: ContentItem[] = [
  { id: 'ct_v1', title: 'Traditional vs Digital Marketing (source lecture)', kind: 'video', meta: '04:22 · 148 MB', tags: ['marketing', 'lecture'], addedAt: '2026-06-02', addedBy: 'Instructional Design', status: 'ready', reviewed: true },
  { id: 'ct_v2', title: 'Customer Service Role-play Walkthrough', kind: 'video', meta: '11:38 · 402 MB', tags: ['customer-service'], addedAt: '2026-06-14', addedBy: 'Instructional Design', status: 'ready', reviewed: false },
  { id: 'ct_d1', title: 'Financial Literacy Workbook', kind: 'document', meta: 'PDF · 2.1 MB', tags: ['finance', 'workbook'], addedAt: '2026-05-28', addedBy: 'Instructional Design', status: 'ready', reviewed: true },
  { id: 'ct_d2', title: 'OHS Compliance Checklist', kind: 'document', meta: 'DOCX · 340 KB', tags: ['safety', 'compliance'], addedAt: '2026-06-20', addedBy: 'Instructional Design', status: 'ready', reviewed: true },
  { id: 'ct_l1', title: 'SETA Unit Standard 114974 reference', kind: 'link', meta: 'saqa.org.za', tags: ['seta', 'reference'], addedAt: '2026-06-21', addedBy: 'Instructional Design', status: 'ready', reviewed: true },
];

const SEED_TEMPLATES: CourseTemplate[] = [
  { id: 'tpl_cs', title: 'Customer Service Excellence', level: 'Foundational', modality: 'Hybrid', modules: 6, hours: 24, standard: 'Services SETA US 252210', description: 'Frontline service skills, complaint handling and service recovery.', kind: 'course' },
  { id: 'tpl_ds', title: 'Digital Skills Foundations', level: 'Foundational', modality: 'Online', modules: 8, hours: 32, standard: 'MICT SETA · NQF 3', description: 'Core computer, internet and productivity skills for the workplace.', kind: 'course' },
  { id: 'tpl_ll', title: 'Team Leadership', level: 'Intermediate', modality: 'Hybrid', modules: 5, hours: 20, standard: 'Services SETA · NQF 5', description: 'Supervisory leadership, delegation and performance conversations.', kind: 'course' },
  { id: 'tpl_fl', title: 'Financial Literacy at Work', level: 'Foundational', modality: 'Online', modules: 4, hours: 12, standard: 'BANKSETA · NQF 4', description: 'Budgeting, credit, and workplace financial decision-making.', kind: 'course' },
  { id: 'tpl_ohs', title: 'Occupational Health & Safety', level: 'Foundational', modality: 'In-person', modules: 4, hours: 16, standard: 'OHS Act 85 of 1993', description: 'Workplace hazard identification, PPE and incident reporting.', kind: 'course' },
  { id: 'tpl_lesson_bloom', title: 'Lesson template: Bloom-aligned module', level: 'Intermediate', modality: 'Online', modules: 1, hours: 2, standard: "Bloom's Taxonomy", description: 'Reusable module scaffold: objectives, formative check, application task.', kind: 'lesson' },
];

let content: ContentItem[] = [...SEED_CONTENT];
let templates: CourseTemplate[] = [...SEED_TEMPLATES];
let assignments: CourseAssignment[] = [
  { courseId: 'tpl_cs', partnerId: 'partner_talentforge', assignedAt: '2026-06-05' },
  { courseId: 'tpl_ds', partnerId: 'partner_talentforge', assignedAt: '2026-06-05' },
  { courseId: 'tpl_ohs', partnerId: 'partner_skillbridge', assignedAt: '2026-06-11' },
];

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const today = () => new Date().toISOString().slice(0, 10);

export function learningContent(): ContentItem[] { return content; }
export function learningTemplates(): CourseTemplate[] { return templates; }
export function courseAssignments(): CourseAssignment[] { return assignments; }

export function partnersForCourse(courseId: string): string[] {
  return assignments.filter((a) => a.courseId === courseId).map((a) => a.partnerId);
}
export function coursesForPartner(partnerId: string): string[] {
  return assignments.filter((a) => a.partnerId === partnerId).map((a) => a.courseId);
}

export function addContent(item: Omit<ContentItem, 'id' | 'addedAt' | 'status'>): ContentItem {
  const rec: ContentItem = { ...item, id: `ct_${Date.now()}`, addedAt: today(), status: 'ready' };
  content = [rec, ...content];
  emit();
  return rec;
}
export function removeContent(id: string) { content = content.filter((c) => c.id !== id); emit(); }
export function markReviewed(id: string) { content = content.map((c) => (c.id === id ? { ...c, reviewed: true } : c)); emit(); }

export function addTemplate(tpl: Omit<CourseTemplate, 'id'>): CourseTemplate {
  const rec: CourseTemplate = { ...tpl, id: `tpl_${Date.now()}` };
  templates = [rec, ...templates];
  emit();
  return rec;
}

/** Set the exact set of partners a course is assigned to. */
export function setCourseAssignments(courseId: string, partnerIds: string[]) {
  assignments = assignments.filter((a) => a.courseId !== courseId);
  const add = partnerIds.map((partnerId) => ({ courseId, partnerId, assignedAt: today() }));
  assignments = [...assignments, ...add];
  emit();
}
export function toggleAssignment(courseId: string, partnerId: string) {
  const has = assignments.some((a) => a.courseId === courseId && a.partnerId === partnerId);
  assignments = has
    ? assignments.filter((a) => !(a.courseId === courseId && a.partnerId === partnerId))
    : [...assignments, { courseId, partnerId, assignedAt: today() }];
  emit();
}

/** Reactive hook: any component using it re-renders on library / template / assignment change. */
export function useLearningHub() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
  return { content, templates, assignments };
}
