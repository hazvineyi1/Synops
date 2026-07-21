import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Users, Layers, BookOpen, CheckCircle2, Check, Search, UserPlus, ArrowRight, ArrowLeft, Loader2, PartyPopper } from 'lucide-react';

/**
 * Guided "Assign learners" wizard: walks the full allocation pipeline in one place —
 * Learners (pick org learners / add a new one to the org)  ->  Class (choose or create)
 * ->  Courses (assign to the class)  ->  Review & enrol. Every write MERGES into the class's
 * existing roster/courses (never replaces), then materialises real enrolments. Launchable
 * org-wide (no class preselected) or from a class (initialClassId).
 */

interface Member { id: string; firstName?: string | null; lastName?: string | null; email: string | null; role: string }
interface ClassRow { id: string; name: string; learnerCount?: number; courseCount?: number }
interface Course { id: string; title: string; nqfLevel?: number | null }
interface ClassDetail { id: string; name: string; learnerIds: string[]; courseIds: string[] }

const memberName = (m: Member) => [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email || m.id;

const STEPS = [
  { key: 'learners', label: 'Learners', icon: Users },
  { key: 'class', label: 'Class', icon: Layers },
  { key: 'courses', label: 'Courses', icon: BookOpen },
  { key: 'review', label: 'Review', icon: CheckCircle2 },
] as const;

export function AssignWizard({
  orgId, orgName, initialClassId, open, onClose, onDone,
}: { orgId: string; orgName?: string; initialClassId?: string; open: boolean; onClose: () => void; onDone?: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [selLearners, setSelLearners] = useState<Set<string>>(new Set());
  const [selCourses, setSelCourses] = useState<Set<string>>(new Set());
  const [classMode, setClassMode] = useState<'existing' | 'new'>('existing');
  const [existingClassId, setExistingClassId] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [q, setQ] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addName, setAddName] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [result, setResult] = useState<{ classId: string; className: string; enrolled: number; learners: number; courses: number } | null>(null);

  const { data: membersData } = useQuery({ queryKey: ['organisation-members', orgId], queryFn: () => apiFetch<Member[]>(`/organisations/${orgId}/members`), enabled: open && !!orgId });
  const { data: classesData } = useQuery({ queryKey: ['org-classes', orgId], queryFn: () => apiFetch<ClassRow[]>(`/organisations/${orgId}/classes`), enabled: open && !!orgId });
  const { data: coursesData } = useQuery({ queryKey: ['courses'], queryFn: () => apiFetch<Course[]>('/courses'), enabled: open });
  const learners = useMemo(() => (membersData ?? []).filter((m) => m.role === 'learner'), [membersData]);
  const classes = classesData ?? [];
  const courses = coursesData ?? [];

  // Reset each time the wizard opens; preselect the class when launched from one.
  useEffect(() => {
    if (!open) return;
    setStep(0); setSelLearners(new Set()); setSelCourses(new Set());
    setQ(''); setAddEmail(''); setAddName(''); setPendingEmail(null); setResult(null);
    if (initialClassId) { setClassMode('existing'); setExistingClassId(initialClassId); }
    else { setClassMode('existing'); setExistingClassId(''); setNewClassName(''); }
  }, [open, initialClassId]);

  // After adding a new learner to the org, auto-select them once the roster refetches.
  useEffect(() => {
    if (!pendingEmail) return;
    const m = learners.find((l) => (l.email ?? '').toLowerCase() === pendingEmail);
    if (m) { setSelLearners((s) => new Set(s).add(m.id)); setPendingEmail(null); }
  }, [learners, pendingEmail]);

  const addLearner = useMutation({
    mutationFn: (b: { email: string }) => apiFetch(`/organisations/${orgId}/members`, { method: 'POST', body: JSON.stringify({ email: b.email, role: 'learner' }) }),
    onSuccess: (_r, vars) => { setPendingEmail(vars.email.toLowerCase()); setAddEmail(''); setAddName(''); qc.invalidateQueries({ queryKey: ['organisation-members', orgId] }); },
  });

  const finalize = useMutation({
    mutationFn: async () => {
      let classId = classMode === 'existing' ? existingClassId : '';
      let className = classes.find((c) => c.id === classId)?.name ?? '';
      if (classMode === 'new') {
        const created = await apiFetch<{ id: string; name?: string }>(`/organisations/${orgId}/classes`, { method: 'POST', body: JSON.stringify({ name: newClassName.trim() }) });
        classId = created.id; className = newClassName.trim();
      }
      if (!classId) throw new Error('Pick or name a class first.');
      const detail = await apiFetch<ClassDetail>(`/classes/${classId}`);
      if (!className) className = detail.name;
      const learnerUnion = Array.from(new Set([...(detail.learnerIds ?? []), ...selLearners]));
      const courseUnion = Array.from(new Set([...(detail.courseIds ?? []), ...selCourses]));
      await apiFetch(`/classes/${classId}/learners`, { method: 'PUT', body: JSON.stringify({ learnerIds: learnerUnion }) });
      await apiFetch(`/classes/${classId}/courses`, { method: 'PUT', body: JSON.stringify({ courseIds: courseUnion }) });
      const enrolRes = await apiFetch<{ enrolled: number }>(`/classes/${classId}/enrol`, { method: 'POST' });
      return { classId, className, enrolled: enrolRes.enrolled, learners: selLearners.size, courses: selCourses.size };
    },
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['org-classes', orgId] });
      qc.invalidateQueries({ queryKey: ['class', r.classId] });
      onDone?.();
    },
  });

  const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); apply(n); };
  const filteredLearners = useMemo(() => learners.filter((l) => memberName(l).toLowerCase().includes(q.trim().toLowerCase()) || (l.email ?? '').toLowerCase().includes(q.trim().toLowerCase())), [learners, q]);
  const filteredCourses = useMemo(() => courses.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase())), [courses, q]);

  const classReady = classMode === 'existing' ? !!existingClassId : newClassName.trim().length > 0;
  const canNext = step === 0 ? selLearners.size > 0 : step === 1 ? classReady : step === 2 ? selCourses.size > 0 : true;
  const chosenClassName = classMode === 'existing' ? (classes.find((c) => c.id === existingClassId)?.name ?? 'the class') : newClassName.trim();

  const emailValid = /.+@.+\..+/.test(addEmail.trim());

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" /> Assign learners{orgName ? ` · ${orgName}` : ''}</DialogTitle>
          <DialogDescription>Add learners to a class and give them courses, all in one guided flow.</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="py-6 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><PartyPopper className="h-6 w-6" /></div>
            <div className="text-lg font-semibold">Done — learners are enrolled</div>
            <p className="text-sm text-muted-foreground">
              {result.learners} learner{result.learners === 1 ? '' : 's'} added to <span className="font-medium text-foreground">{result.className}</span> and enrolled in {result.courses} course{result.courses === 1 ? '' : 's'} ({result.enrolled} new place{result.enrolled === 1 ? '' : 's'}).
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <Button variant="outline" onClick={() => { setResult(null); setStep(0); setSelLearners(new Set()); setSelCourses(new Set()); }}>Assign more</Button>
              <Button onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : (
          <>
            {/* Stepper */}
            <div className="flex items-center gap-1 pb-1">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const state = i < step ? 'done' : i === step ? 'current' : 'todo';
                return (
                  <React.Fragment key={s.key}>
                    <div className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                      state === 'current' ? 'bg-primary text-primary-foreground' : state === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground')}>
                      {state === 'done' ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />} <span className="hidden sm:inline">{i + 1}. {s.label}</span>
                    </div>
                    {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
                  </React.Fragment>
                );
              })}
            </div>

            {/* STEP 1 — LEARNERS (+ add to org) */}
            {step === 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Who are you enrolling? <span className="font-normal text-muted-foreground">({selLearners.size} selected)</span></h3>
                  <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search learners" className="h-8 w-44 rounded-md border border-input bg-background pl-8 pr-3 text-xs" /></div>
                </div>
                <div className="grid sm:grid-cols-2 gap-1.5 max-h-64 overflow-auto">
                  {filteredLearners.map((l) => {
                    const on = selLearners.has(l.id);
                    return (
                      <button key={l.id} type="button" onClick={() => toggle(selLearners, l.id, setSelLearners)} className={cn('flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition', on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}>
                        <div className="min-w-0"><div className="font-medium truncate">{memberName(l)}</div><div className="text-xs text-muted-foreground truncate">{l.email}</div></div>
                        <span className={cn('flex h-5 w-5 items-center justify-center rounded border shrink-0', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                      </button>
                    );
                  })}
                  {filteredLearners.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center sm:col-span-2">{learners.length === 0 ? 'No learners in this organisation yet — add one below.' : 'No learners match your search.'}</div>}
                </div>
                <div className="rounded-lg border border-dashed border-border p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5"><UserPlus className="h-3.5 w-3.5" /> Add a new learner to this organisation</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="learner@email.com" className="h-9 flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 text-sm" />
                    <Button size="sm" disabled={!emailValid || addLearner.isPending} onClick={() => addLearner.mutate({ email: addEmail.trim() })}>
                      {addLearner.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add to org'}
                    </Button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">They're added to {orgName ?? 'this organisation'} and auto-selected. They'll get a set-password link.</p>
                </div>
              </div>
            )}

            {/* STEP 2 — CLASS */}
            {step === 1 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Which class do these learners go into?</h3>
                <div className="grid sm:grid-cols-2 gap-1.5 max-h-56 overflow-auto">
                  {classes.map((c) => {
                    const on = classMode === 'existing' && existingClassId === c.id;
                    return (
                      <button key={c.id} type="button" onClick={() => { setClassMode('existing'); setExistingClassId(c.id); }} className={cn('flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition', on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}>
                        <div className="min-w-0"><div className="font-medium truncate">{c.name}</div><div className="text-xs text-muted-foreground">{c.learnerCount ?? 0} learners · {c.courseCount ?? 0} courses</div></div>
                        <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border shrink-0', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                      </button>
                    );
                  })}
                  {classes.length === 0 && <div className="text-sm text-muted-foreground py-2 sm:col-span-2">No classes yet — create the first one below.</div>}
                </div>
                <div className={cn('rounded-lg border p-3', classMode === 'new' ? 'border-primary bg-primary/5' : 'border-dashed border-border')}>
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Or create a new class</div>
                  <input value={newClassName} onChange={(e) => { setNewClassName(e.target.value); if (e.target.value.trim()) setClassMode('new'); }} onFocus={() => setClassMode('new')} placeholder="e.g. Evening Cohort 2026" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                </div>
              </div>
            )}

            {/* STEP 3 — COURSES */}
            {step === 2 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Which courses? <span className="font-normal text-muted-foreground">({selCourses.size} selected)</span></h3>
                  <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses" className="h-8 w-44 rounded-md border border-input bg-background pl-8 pr-3 text-xs" /></div>
                </div>
                <p className="text-xs text-muted-foreground">Every learner you selected will get these courses (whole-class assignment).</p>
                <div className="grid sm:grid-cols-2 gap-1.5 max-h-72 overflow-auto">
                  {filteredCourses.map((c) => {
                    const on = selCourses.has(c.id);
                    return (
                      <button key={c.id} type="button" onClick={() => toggle(selCourses, c.id, setSelCourses)} className={cn('flex items-center justify-between gap-2 rounded-lg border p-3 text-left text-sm transition', on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}>
                        <div className="min-w-0"><div className="font-medium truncate">{c.title}</div>{c.nqfLevel ? <div className="text-xs text-muted-foreground">NQF {c.nqfLevel}</div> : null}</div>
                        <span className={cn('flex h-5 w-5 items-center justify-center rounded border shrink-0', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                      </button>
                    );
                  })}
                  {filteredCourses.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center sm:col-span-2">No courses match your search.</div>}
                </div>
              </div>
            )}

            {/* STEP 4 — REVIEW */}
            {step === 3 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Review &amp; confirm</h3>
                <div className="rounded-lg border border-border divide-y divide-border text-sm">
                  <div className="flex items-center gap-3 p-3"><Users className="h-4 w-4 text-primary shrink-0" /><div><div className="font-medium">{selLearners.size} learner{selLearners.size === 1 ? '' : 's'}</div><div className="text-xs text-muted-foreground truncate">{[...selLearners].map((id) => memberName(learners.find((l) => l.id === id) as Member)).filter(Boolean).slice(0, 4).join(', ')}{selLearners.size > 4 ? ` +${selLearners.size - 4} more` : ''}</div></div></div>
                  <div className="flex items-center gap-3 p-3"><Layers className="h-4 w-4 text-primary shrink-0" /><div><div className="font-medium">{chosenClassName}</div><div className="text-xs text-muted-foreground">{classMode === 'new' ? 'New class will be created' : 'Existing class'}</div></div></div>
                  <div className="flex items-center gap-3 p-3"><BookOpen className="h-4 w-4 text-primary shrink-0" /><div><div className="font-medium">{selCourses.size} course{selCourses.size === 1 ? '' : 's'}</div><div className="text-xs text-muted-foreground truncate">{[...selCourses].map((id) => courses.find((c) => c.id === id)?.title).filter(Boolean).slice(0, 3).join(', ')}{selCourses.size > 3 ? ` +${selCourses.size - 3} more` : ''}</div></div></div>
                </div>
                <p className="text-xs text-muted-foreground">This will add the learners and courses to the class (keeping anything already there) and enrol every selected learner in every selected course — up to {selLearners.size * selCourses.size} enrolment{selLearners.size * selCourses.size === 1 ? '' : 's'}.</p>
                {finalize.isError && <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{(finalize.error as Error)?.message ?? 'Something went wrong. Please try again.'}</div>}
              </div>
            )}

            {/* Footer nav */}
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <Button variant="ghost" onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}>
                {step === 0 ? 'Cancel' : <><ArrowLeft className="h-4 w-4 mr-1" /> Back</>}
              </Button>
              {step < 3 ? (
                <Button disabled={!canNext} onClick={() => { setQ(''); setStep((s) => s + 1); }}>Next <ArrowRight className="h-4 w-4 ml-1" /></Button>
              ) : (
                <Button disabled={finalize.isPending} onClick={() => finalize.mutate()}>
                  {finalize.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Assigning…</> : <><Check className="h-4 w-4 mr-1" /> Assign &amp; enrol</>}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
