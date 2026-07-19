import { useEffect, useReducer } from 'react';
import { getPartnerHub, findHubByOrgId, orgCourses, orgLearners, orgStaff, type PartnerHub } from './partnerHubData';

/**
 * Client-side, reactive store for an organisation's CLASSES (cohorts). Classes are created and
 * edited inside the org hub and must persist while the admin moves between the class sub-pages,
 * so they live in a module-level store (survives navigation; resets on full reload) with a tiny
 * subscribe/notify so components re-render on change. Seeded per org on first access.
 */

export type ClassRole = 'facilitator' | 'coach' | 'admin';
export type ClassStaffAssignment = { staffId: string; role: ClassRole };
export type ClassMessage = { id: string; from: string; learnerId: string; at: string; body: string; unread: boolean };
export type OrgClassRecord = {
  id: string;
  name: string;
  learnerIds: string[];
  staff: ClassStaffAssignment[];
  courseIds: string[];
  messages: ClassMessage[];
  createdAt: string;
};

const store: Record<string, OrgClassRecord[]> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function hubFor(orgId: string): PartnerHub {
  return findHubByOrgId(orgId) ?? getPartnerHub(null);
}

const MSG_SAMPLES = [
  "Hi, I can't open the week 3 quiz - it says 'not available'.",
  'Please could I get a two-day extension on the assignment?',
  "The video for module 2 won't load on my phone data.",
  'Thank you for the feedback, it really helped me understand.',
  'Am I still enrolled? I did not get this week\'s reminder.',
];

function seedClasses(orgId: string): OrgClassRecord[] {
  const h = hubFor(orgId);
  const learners = orgLearners(h, orgId);
  const courses = orgCourses(h, orgId);
  const staff = orgStaff(h, orgId);
  const fac = staff.find((s) => s.kind === 'facilitator');
  const coach = staff.find((s) => s.kind === 'coach');
  const admin = staff.find((s) => s.kind === 'admin');
  const labels = ['Morning Cohort 2026', 'Afternoon Cohort 2026'];

  return labels.map((name, i) => {
    const learnerIds = learners.filter((_, idx) => idx % 2 === i).map((l) => l.id);
    const staffAssign: ClassStaffAssignment[] = [];
    if (fac) staffAssign.push({ staffId: fac.id, role: 'facilitator' });
    if (coach) staffAssign.push({ staffId: coach.id, role: 'coach' });
    if (admin) staffAssign.push({ staffId: admin.id, role: 'admin' });
    const clsLearners = learners.filter((l) => learnerIds.includes(l.id));
    const messages: ClassMessage[] = clsLearners.slice(0, 3).map((l, m) => ({
      id: `${orgId}_c${i}_m${m}`, from: l.name, learnerId: l.id,
      at: new Date(Date.now() - (m + 1) * 5400000).toISOString(),
      body: MSG_SAMPLES[(i + m) % MSG_SAMPLES.length], unread: m < 2,
    }));
    return {
      id: `${orgId}_class${i}`, name, learnerIds, staff: staffAssign,
      courseIds: courses.slice(0, 1 + i).map((c) => c.id), messages, createdAt: '2026-02-01',
    };
  });
}

export function useOrgClasses(orgId: string): OrgClassRecord[] {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => { listeners.delete(force); };
  }, []);
  if (!store[orgId]) store[orgId] = seedClasses(orgId);
  return store[orgId];
}

export function getClass(orgId: string, classId: string): OrgClassRecord | undefined {
  return (store[orgId] ?? []).find((c) => c.id === classId);
}

function mutate(orgId: string, classId: string, fn: (c: OrgClassRecord) => OrgClassRecord) {
  store[orgId] = (store[orgId] ?? []).map((c) => (c.id === classId ? fn({ ...c }) : c));
  emit();
}

export function createClass(orgId: string, name: string): string {
  const id = `${orgId}_class_${Date.now()}`;
  store[orgId] = [...(store[orgId] ?? []), {
    id, name: name.trim() || 'Untitled class', learnerIds: [], staff: [], courseIds: [], messages: [],
    createdAt: new Date().toISOString().slice(0, 10),
  }];
  emit();
  return id;
}

export function renameClass(orgId: string, classId: string, name: string) {
  mutate(orgId, classId, (c) => ({ ...c, name: name.trim() || c.name }));
}

export function toggleLearner(orgId: string, classId: string, learnerId: string) {
  mutate(orgId, classId, (c) => ({
    ...c,
    learnerIds: c.learnerIds.includes(learnerId) ? c.learnerIds.filter((x) => x !== learnerId) : [...c.learnerIds, learnerId],
  }));
}

export function toggleCourse(orgId: string, classId: string, courseId: string) {
  mutate(orgId, classId, (c) => ({
    ...c,
    courseIds: c.courseIds.includes(courseId) ? c.courseIds.filter((x) => x !== courseId) : [...c.courseIds, courseId],
  }));
}

export function setStaffAssignment(orgId: string, classId: string, staffId: string, role: ClassRole, on: boolean) {
  mutate(orgId, classId, (c) => ({
    ...c,
    staff: on
      ? [...c.staff.filter((s) => !(s.staffId === staffId && s.role === role)), { staffId, role }]
      : c.staff.filter((s) => !(s.staffId === staffId && s.role === role)),
  }));
}

export function markMessageRead(orgId: string, classId: string, msgId: string) {
  mutate(orgId, classId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, unread: false } : m)) }));
}

/** Deterministic per-learner grade + engagement for a class gradebook/activity view. */
export function learnerSignals(learnerId: string, progress: number) {
  const seed = learnerId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const grade = Math.min(100, Math.max(0, Math.round(progress * 0.8 + (seed % 20))));
  const attendance = 60 + (seed % 41);
  const timeOnTaskHrs = 4 + (seed % 30);
  const submissions = 2 + (seed % 8);
  const lastActiveDays = seed % 14;
  return { grade, attendance, timeOnTaskHrs, submissions, lastActiveDays };
}
