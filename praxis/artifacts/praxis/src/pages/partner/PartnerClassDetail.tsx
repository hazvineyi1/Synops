import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Users, GraduationCap, BookOpen, Check, Pencil, Layers, Search, Trash2,
  CheckCircle2, UserCheck, ArrowRight, Share2, Copy, MessageCircle,
} from 'lucide-react';

interface ClassDetail { id: string; orgId: string; name: string; learnerIds: string[]; courseIds: string[]; staff: { staffId: string; role: string }[] }
interface Member { id: string; firstName?: string | null; lastName?: string | null; email: string | null; role: string }
interface Course { id: string; title: string; status?: string }

const CLASS_ROLES = ['facilitator', 'coach', 'admin'] as const;
type ClassRole = typeof CLASS_ROLES[number];
const roleLabel: Record<ClassRole, string> = { facilitator: 'Facilitator', coach: 'Coach', admin: 'Admin' };
const memberName = (m: Member) => [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email || m.id;
const STAFF_ROLES = ['coach', 'org_admin', 'partner_admin', 'instructional_designer'];
const eqSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

const TABS = ['roster', 'courses', 'staff'] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = { roster: 'Roster', courses: 'Courses', staff: 'Staff' };
const TAB_ICON: Record<Tab, React.ComponentType<{ className?: string }>> = { roster: Users, courses: BookOpen, staff: GraduationCap };

export function PartnerClassDetail({ orgId, classId }: { orgId: string; classId: string }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('roster');
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(null), 3000); };

  const { data: cls, isLoading } = useQuery({ queryKey: ['class', classId], queryFn: () => apiFetch<ClassDetail>(`/classes/${classId}`), enabled: !!classId });
  const { data: membersData } = useQuery({ queryKey: ['organisation-members', orgId], queryFn: () => apiFetch<Member[]>(`/organisations/${orgId}/members`), enabled: !!orgId });
  const { data: coursesData } = useQuery({ queryKey: ['courses'], queryFn: () => apiFetch<Course[]>('/courses') });
  const learners = (membersData ?? []).filter((m) => m.role === 'learner');
  const staff = (membersData ?? []).filter((m) => STAFF_ROLES.includes(m.role));
  const courses = coursesData ?? [];

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['class', classId] }); qc.invalidateQueries({ queryKey: ['org-classes', orgId] }); };

  // Local editable selections, seeded from the class and saved in one PUT (bulk).
  const [selLearners, setSelLearners] = useState<Set<string>>(new Set());
  const [selCourses, setSelCourses] = useState<Set<string>>(new Set());
  const [selStaff, setSelStaff] = useState<Set<string>>(new Set()); // key = `${staffId}::${role}`
  useEffect(() => {
    if (cls) {
      setSelLearners(new Set(cls.learnerIds));
      setSelCourses(new Set(cls.courseIds));
      setSelStaff(new Set(cls.staff.map((s) => `${s.staffId}::${s.role}`)));
    }
  }, [cls]);

  const rename = useMutation({ mutationFn: (name: string) => apiFetch(`/classes/${classId}`, { method: 'PATCH', body: JSON.stringify({ name }) }), onSuccess: () => { invalidate(); flashMsg('Class renamed.'); } });
  const saveLearners = useMutation({ mutationFn: () => apiFetch(`/classes/${classId}/learners`, { method: 'PUT', body: JSON.stringify({ learnerIds: [...selLearners] }) }), onSuccess: () => { invalidate(); flashMsg('Roster saved.'); } });
  const saveCourses = useMutation({ mutationFn: () => apiFetch(`/classes/${classId}/courses`, { method: 'PUT', body: JSON.stringify({ courseIds: [...selCourses] }) }), onSuccess: () => { invalidate(); flashMsg('Courses saved.'); } });
  const saveStaff = useMutation({ mutationFn: () => apiFetch(`/classes/${classId}/staff`, { method: 'PUT', body: JSON.stringify({ staff: [...selStaff].map((k) => { const [staffId, role] = k.split('::'); return { staffId, role }; }) }) }), onSuccess: () => { invalidate(); flashMsg('Staff saved.'); } });
  const enrol = useMutation({ mutationFn: () => apiFetch<{ enrolled: number; message?: string }>(`/classes/${classId}/enrol`, { method: 'POST' }), onSuccess: (r) => flashMsg(r.message ? r.message : `Enrolled ${r.enrolled} learner-course place${r.enrolled === 1 ? '' : 's'}.`) });
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const joinLink = useMutation({ mutationFn: () => apiFetch<{ code: string; url: string }>(`/classes/${classId}/join-link`, { method: 'POST' }), onSuccess: (r) => { setJoinUrl(r.url); flashMsg('Self-enrol link ready to share.'); }, onError: () => flashMsg('Could not create the link.') });
  const del = useMutation({ mutationFn: () => apiFetch(`/classes/${classId}`, { method: 'DELETE' }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-classes', orgId] }); navigate(`/partner/org/${orgId}/classes`); } });

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [q, setQ] = useState('');

  const learnersDirty = cls ? !eqSet(selLearners, new Set(cls.learnerIds)) : false;
  const coursesDirty = cls ? !eqSet(selCourses, new Set(cls.courseIds)) : false;
  const staffDirty = cls ? !eqSet(selStaff, new Set(cls.staff.map((s) => `${s.staffId}::${s.role}`))) : false;

  const filteredLearners = useMemo(() => learners.filter((l) => memberName(l).toLowerCase().includes(q.trim().toLowerCase()) || (l.email ?? '').toLowerCase().includes(q.trim().toLowerCase())), [learners, q]);
  const filteredCourses = useMemo(() => courses.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase())), [courses, q]);

  const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); apply(n); };

  if (isLoading) return <Card className="p-6 text-center text-muted-foreground">Loading class…</Card>;
  if (!cls) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate(`/partner/org/${orgId}/classes`)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Classes</button>
        <Card className="p-6 text-center text-muted-foreground">Class not found.</Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(`/partner/org/${orgId}/classes`)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All classes</button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input autoFocus defaultValue={cls.name} onChange={(e) => setNameDraft(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-lg font-semibold" />
              <Button size="sm" onClick={() => { rename.mutate(nameDraft.trim() || cls.name); setEditingName(false); }}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Layers className="h-6 w-6 text-primary" /> {cls.name}</h1>
              <button onClick={() => { setNameDraft(cls.name); setEditingName(true); }} className="text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-1">{cls.learnerIds.length} learners · {cls.staff.length} staff · {cls.courseIds.length} courses</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={joinLink.isPending} onClick={() => joinLink.mutate()} title="Create a link learners can open to self-enrol into this cohort">
            <Share2 className="h-3.5 w-3.5" /> {joinLink.isPending ? 'Preparing…' : 'Share join link'}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={enrol.isPending || cls.learnerIds.length === 0 || cls.courseIds.length === 0} onClick={() => enrol.mutate()} title="Create real enrolments for every learner in every assigned course">
            <UserCheck className="h-3.5 w-3.5" /> {enrol.isPending ? 'Enrolling…' : 'Enrol into courses'}
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5 text-red-600" onClick={() => { if (window.confirm(`Delete the class "${cls.name}"? This does not remove learners or courses, only the class grouping.`)) del.mutate(); }}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
        </div>
      </div>

      {joinUrl && (
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="flex items-center gap-2 text-sm font-semibold"><Share2 className="h-4 w-4 text-primary" /> Self-enrol link for this cohort</div>
          <p className="mt-1 text-xs text-muted-foreground">Share this on WhatsApp. Anyone who opens it can register and is enrolled straight into this cohort's courses.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="flex-1 min-w-[220px] truncate rounded bg-background px-2 py-1.5 border text-xs">{joinUrl}</code>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { navigator.clipboard?.writeText(joinUrl); flashMsg('Link copied.'); }}><Copy className="h-3.5 w-3.5" /> Copy</Button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`Join our programme "${cls.name}" on Synops Praxis: ${joinUrl}`)}`} target="_blank" rel="noreferrer">
              <Button size="sm" className="gap-1.5 bg-[#25D366] hover:bg-[#1eb457] text-white"><MessageCircle className="h-3.5 w-3.5" /> Share on WhatsApp</Button>
            </a>
          </div>
        </Card>
      )}

      {flash && <Card className="p-3 border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {flash}</Card>}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border">
        {TABS.map((tb) => {
          const Icon = TAB_ICON[tb];
          const dirty = (tb === 'roster' && learnersDirty) || (tb === 'courses' && coursesDirty) || (tb === 'staff' && staffDirty);
          return (
            <button key={tb} onClick={() => { setTab(tb); setQ(''); }} className={cn('inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition', tab === tb ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              <Icon className="h-4 w-4" /> {TAB_LABEL[tb]}{dirty && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-500" />}
            </button>
          );
        })}
      </div>

      {/* ROSTER */}
      {tab === 'roster' && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Learners <span className="text-muted-foreground font-normal">({selLearners.size} selected)</span></h3>
            <div className="flex items-center gap-2">
              <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search learners" className="h-8 w-48 rounded-md border border-input bg-background pl-8 pr-3 text-xs" /></div>
              <Button size="sm" variant="outline" onClick={() => setSelLearners((s) => { const n = new Set(s); filteredLearners.forEach((l) => n.add(l.id)); return n; })}>Select all{q ? ' (filtered)' : ''}</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelLearners((s) => { const n = new Set(s); filteredLearners.forEach((l) => n.delete(l.id)); return n; })}>Clear</Button>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-1.5 max-h-[28rem] overflow-auto">
            {filteredLearners.map((l) => {
              const on = selLearners.has(l.id);
              return (
                <button key={l.id} onClick={() => toggle(selLearners, l.id, setSelLearners)} className={cn('flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition', on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}>
                  <div className="min-w-0"><div className="font-medium truncate">{memberName(l)}</div><div className="text-xs text-muted-foreground truncate">{l.email}</div></div>
                  <span className={cn('flex h-5 w-5 items-center justify-center rounded border shrink-0', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                </button>
              );
            })}
            {filteredLearners.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center sm:col-span-2">{learners.length === 0 ? 'No learners in this organisation yet. Add them under People.' : 'No learners match your search.'}</div>}
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            {learnersDirty && <Button size="sm" variant="ghost" onClick={() => setSelLearners(new Set(cls.learnerIds))}>Reset</Button>}
            <Button size="sm" disabled={!learnersDirty || saveLearners.isPending} onClick={() => saveLearners.mutate()}>{saveLearners.isPending ? 'Saving…' : 'Save roster'}</Button>
          </div>
        </Card>
      )}

      {/* COURSES */}
      {tab === 'courses' && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /> Assigned courses <span className="text-muted-foreground font-normal">({selCourses.size} selected)</span></h3>
            <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses" className="h-8 w-48 rounded-md border border-input bg-background pl-8 pr-3 text-xs" /></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-1.5 max-h-[28rem] overflow-auto">
            {filteredCourses.map((c) => {
              const on = selCourses.has(c.id);
              return (
                <button key={c.id} onClick={() => toggle(selCourses, c.id, setSelCourses)} className={cn('flex items-center justify-between gap-2 rounded-lg border p-3 text-left text-sm transition', on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}>
                  <div className="min-w-0"><div className="font-medium truncate">{c.title}</div>{c.status && <div className="text-xs text-muted-foreground capitalize">{c.status}</div>}</div>
                  <span className={cn('flex h-5 w-5 items-center justify-center rounded border shrink-0', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                </button>
              );
            })}
            {filteredCourses.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center sm:col-span-2">{courses.length === 0 ? 'No courses in the catalogue yet.' : 'No courses match your search.'}</div>}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">After saving, use "Enrol into courses" above to enrol this class's learners.</span>
            <div className="flex gap-2">
              {coursesDirty && <Button size="sm" variant="ghost" onClick={() => setSelCourses(new Set(cls.courseIds))}>Reset</Button>}
              <Button size="sm" disabled={!coursesDirty || saveCourses.isPending} onClick={() => saveCourses.mutate()}>{saveCourses.isPending ? 'Saving…' : 'Save courses'}</Button>
            </div>
          </div>
        </Card>
      )}

      {/* STAFF */}
      {tab === 'staff' && (
        <Card className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">Assign facilitators, coaches and admins to this class. A person can hold more than one role.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Staff member</th><th className="text-left p-3">Org role</th>{CLASS_ROLES.map((r) => <th key={r} className="p-3 text-center">{roleLabel[r]}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {staff.map((s) => (
                  <tr key={s.id}>
                    <td className="p-3"><div className="font-medium">{memberName(s)}</div><div className="text-xs text-muted-foreground">{s.email}</div></td>
                    <td className="p-3"><Badge variant="secondary" className="capitalize text-[10px]">{s.role.replace(/_/g, ' ')}</Badge></td>
                    {CLASS_ROLES.map((r) => {
                      const key = `${s.id}::${r}`;
                      const on = selStaff.has(key);
                      return (
                        <td key={r} className="p-3 text-center">
                          <button onClick={() => toggle(selStaff, key, setSelStaff)} className={cn('mx-auto flex h-5 w-5 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary/50')}>{on && <Check className="h-3 w-3" />}</button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {staff.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No coaches or admins in this organisation yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            {staffDirty && <Button size="sm" variant="ghost" onClick={() => setSelStaff(new Set(cls.staff.map((s) => `${s.staffId}::${s.role}`)))}>Reset</Button>}
            <Button size="sm" disabled={!staffDirty || saveStaff.isPending} onClick={() => saveStaff.mutate()}>{saveStaff.isPending ? 'Saving…' : 'Save staff'}</Button>
          </div>
        </Card>
      )}

      <Card className="p-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>Delivery, coaching sections and the gradebook for these learners live in the organisation's real tools.</span>
        <button onClick={() => navigate(`/partner/org/${orgId}/coaching`)} className="inline-flex items-center gap-1 text-primary hover:underline">Coaching <ArrowRight className="h-3 w-3" /></button>
        <button onClick={() => navigate(`/partner/org/${orgId}/gradebook`)} className="inline-flex items-center gap-1 text-primary hover:underline">Gradebook <ArrowRight className="h-3 w-3" /></button>
      </Card>
    </div>
  );
}
