import React, { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useSession } from '@/context/SessionContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Users, GraduationCap, BookOpen, ClipboardList, MessageSquare, Activity,
  Check, KeyRound, Pencil, UserPlus, CheckCircle2, Clock, Send, Layers,
} from 'lucide-react';
import {
  getPartnerHub, findHubByOrgId, orgDetail, orgCourses, orgLearners, orgStaff,
} from '@/lib/partnerHubData';
import {
  useOrgClasses, renameClass, toggleLearner, toggleCourse, setStaffAssignment, markMessageRead,
  learnerSignals, type ClassRole,
} from '@/lib/orgClassStore';

const TABS = ['roster', 'staff', 'courses', 'gradebook', 'messages', 'activity'] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  roster: 'Roster', staff: 'Staff', courses: 'Courses', gradebook: 'Gradebook', messages: 'Messages', activity: 'Activity',
};
const TAB_ICON: Record<Tab, React.ComponentType<{ className?: string }>> = {
  roster: Users, staff: GraduationCap, courses: BookOpen, gradebook: ClipboardList, messages: MessageSquare, activity: Activity,
};
const CLASS_ROLES: ClassRole[] = ['facilitator', 'coach', 'admin'];
const roleLabel: Record<ClassRole, string> = { facilitator: 'Facilitator', coach: 'Coach', admin: 'Admin' };

export function PartnerClassDetail({ orgId, classId }: { orgId: string; classId: string }) {
  const { user } = useSession();
  const [, navigate] = useLocation();
  const h = findHubByOrgId(orgId) ?? getPartnerHub(user?.partnerId);
  const d = orgDetail(h, orgId);
  const classes = useOrgClasses(orgId);
  const cls = classes.find((c) => c.id === classId);

  const allLearners = useMemo(() => orgLearners(h, orgId), [h, orgId]);
  const allStaff = useMemo(() => orgStaff(h, orgId), [h, orgId]);
  const allCourses = useMemo(() => orgCourses(h, orgId), [h, orgId]);

  const [tab, setTab] = useState<Tab>('roster');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [reply, setReply] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(null), 2800); };

  if (!cls) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate(`/partner/org/${orgId}/classes`)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Classes</button>
        <Card className="p-6 text-center text-muted-foreground">Class not found.</Card>
      </div>
    );
  }

  const classLearners = allLearners.filter((l) => cls.learnerIds.includes(l.id));
  const classCourses = allCourses.filter((c) => cls.courseIds.includes(c.id));
  const unreadCount = cls.messages.filter((m) => m.unread).length;
  const staffName = (id: string) => allStaff.find((s) => s.id === id)?.name ?? 'Unknown';

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(`/partner/org/${orgId}/classes`)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All classes</button>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input autoFocus defaultValue={cls.name} onChange={(e) => setNameDraft(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-lg font-semibold" />
              <Button size="sm" onClick={() => { renameClass(orgId, classId, nameDraft || cls.name); setEditingName(false); flashMsg('Class renamed.'); }}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Layers className="h-6 w-6 text-primary" /> {cls.name}</h1>
              <button onClick={() => { setNameDraft(cls.name); setEditingName(true); }} className="text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-1">{d.org?.name} · {classLearners.length} learners · {cls.staff.length} staff · {classCourses.length} courses</p>
        </div>
      </div>

      {flash && <Card className="p-3 border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {flash}</Card>}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border">
        {TABS.map((tb) => {
          const Icon = TAB_ICON[tb];
          return (
            <button key={tb} onClick={() => setTab(tb)}
              className={cn('inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition', tab === tb ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              <Icon className="h-4 w-4" /> {TAB_LABEL[tb]}
              {tb === 'messages' && unreadCount > 0 && <span className="ml-1 rounded-full bg-red-500 text-white text-[10px] px-1.5">{unreadCount}</span>}
            </button>
          );
        })}
      </div>

      {/* ROSTER */}
      {tab === 'roster' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Enrolled learners ({classLearners.length})</h3>
            <div className="space-y-1.5 max-h-96 overflow-auto">
              {classLearners.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <div className="min-w-0"><div className="font-medium truncate">{l.name}</div><div className="text-xs text-muted-foreground truncate">{l.email}</div></div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => flashMsg(`Password reset link sent to ${l.email}.`)}><KeyRound className="h-3 w-3" /> Reset</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => toggleLearner(orgId, classId, l.id)}>Remove</Button>
                  </div>
                </div>
              ))}
              {classLearners.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">No learners enrolled yet. Add them from the right.</div>}
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" /> Enrol learners</h3>
            <div className="space-y-1.5 max-h-96 overflow-auto">
              {allLearners.map((l) => {
                const on = cls.learnerIds.includes(l.id);
                return (
                  <button key={l.id} onClick={() => toggleLearner(orgId, classId, l.id)}
                    className={cn('w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition', on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}>
                    <div className="min-w-0"><div className="font-medium truncate">{l.name}</div><div className="text-xs text-muted-foreground truncate">{l.course}</div></div>
                    <span className={cn('flex h-5 w-5 items-center justify-center rounded border shrink-0', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* STAFF */}
      {tab === 'staff' && (
        <div className="space-y-4">
          <Card className="p-4 text-sm text-muted-foreground">Assign facilitators, coaches and admins to this class. A person can hold more than one role.</Card>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Staff member</th><th className="text-left p-3">Default</th>{CLASS_ROLES.map((r) => <th key={r} className="p-3 text-center">{roleLabel[r]}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allStaff.map((s) => (
                  <tr key={s.id}>
                    <td className="p-3"><div className="font-medium">{s.name}</div><div className="text-xs text-muted-foreground">{s.email}</div></td>
                    <td className="p-3"><Badge variant="secondary" className="capitalize text-[10px]">{s.kind}</Badge></td>
                    {CLASS_ROLES.map((r) => {
                      const on = cls.staff.some((a) => a.staffId === s.id && a.role === r);
                      return (
                        <td key={r} className="p-3 text-center">
                          <button onClick={() => setStaffAssignment(orgId, classId, s.id, r, !on)}
                            className={cn('mx-auto flex h-5 w-5 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary/50')}>
                            {on && <Check className="h-3 w-3" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="flex flex-wrap gap-2">
            {cls.staff.length === 0 ? <span className="text-sm text-muted-foreground">No staff assigned yet.</span> :
              cls.staff.map((a, i) => <span key={i} className="rounded-lg border border-border px-3 py-1.5 text-xs"><span className="font-medium">{staffName(a.staffId)}</span> <span className="text-muted-foreground">· {roleLabel[a.role]}</span></span>)}
          </div>
        </div>
      )}

      {/* COURSES */}
      {tab === 'courses' && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /> Assign courses to this class</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {allCourses.map((c) => {
              const on = cls.courseIds.includes(c.id);
              return (
                <button key={c.id} onClick={() => toggleCourse(orgId, classId, c.id)}
                  className={cn('flex items-center justify-between gap-2 rounded-lg border p-3 text-left text-sm transition', on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}>
                  <div className="min-w-0"><div className="font-medium truncate">{c.title}</div><div className="text-xs text-muted-foreground">{c.modality}</div></div>
                  <span className={cn('flex h-5 w-5 items-center justify-center rounded border shrink-0', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* GRADEBOOK */}
      {tab === 'gradebook' && (
        <Card className="overflow-hidden">
          <div className="p-3 text-sm font-semibold border-b border-border flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /> Class gradebook</div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="text-left p-3">Learner</th><th className="text-right p-3">Grade</th><th className="text-left p-3">Progress</th><th className="text-right p-3">Submissions</th><th className="text-right p-3">Attendance</th><th className="p-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {classLearners.map((l) => {
                const s = learnerSignals(l.id, l.progress);
                return (
                  <tr key={l.id}>
                    <td className="p-3"><div className="font-medium">{l.name}</div><div className="text-xs text-muted-foreground">{l.email}</div></td>
                    <td className="p-3 text-right tabular-nums font-medium">{s.grade}%</td>
                    <td className="p-3"><div className="flex items-center gap-2"><Progress value={l.progress} className="h-1.5 w-20" /><span className="text-xs tabular-nums text-muted-foreground">{l.progress}%</span></div></td>
                    <td className="p-3 text-right tabular-nums">{s.submissions}</td>
                    <td className="p-3 text-right tabular-nums">{s.attendance}%</td>
                    <td className="p-3 text-right"><Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => flashMsg(`Password reset link sent to ${l.email}.`)}><KeyRound className="h-3 w-3" /> Reset</Button></td>
                  </tr>
                );
              })}
              {classLearners.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No learners in this class yet.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {/* MESSAGES */}
      {tab === 'messages' && (
        <div className="space-y-3">
          <Card className="p-4 text-sm text-muted-foreground">In-app messages from learners in this class. Marking read or replying is functional; delivery is a backend step.</Card>
          {cls.messages.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">No messages yet.</Card>}
          {cls.messages.map((m) => (
            <Card key={m.id} className={cn('p-4', m.unread && 'border-primary/40 bg-primary/5')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="font-medium">{m.from}</span>{m.unread && <Badge className="bg-red-500 text-[10px]">New</Badge>}</div>
                  <p className="text-sm mt-1">{m.body}</p>
                  <div className="text-xs text-muted-foreground mt-1">{new Date(m.at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                {m.unread && <Button size="sm" variant="ghost" className="shrink-0" onClick={() => markMessageRead(orgId, classId, m.id)}>Mark read</Button>}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input value={reply[m.id] ?? ''} onChange={(e) => setReply((r) => ({ ...r, [m.id]: e.target.value }))} placeholder={`Reply to ${m.from.split(' ')[0]}...`} className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
                <Button size="sm" className="gap-1.5" disabled={!(reply[m.id] ?? '').trim()} onClick={() => { markMessageRead(orgId, classId, m.id); setReply((r) => ({ ...r, [m.id]: '' })); flashMsg(`Reply sent to ${m.from}.`); }}><Send className="h-3.5 w-3.5" /> Send</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ACTIVITY */}
      {tab === 'activity' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(() => {
              const sig = classLearners.map((l) => learnerSignals(l.id, l.progress));
              const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);
              const active7 = classLearners.filter((l) => learnerSignals(l.id, l.progress).lastActiveDays <= 7).length;
              return [
                { label: 'Active last 7 days', value: `${active7}/${classLearners.length}` },
                { label: 'Avg attendance', value: `${avg(sig.map((s) => s.attendance))}%` },
                { label: 'Avg time on task', value: `${avg(sig.map((s) => s.timeOnTaskHrs))} h` },
                { label: 'Avg grade', value: `${avg(sig.map((s) => s.grade))}%` },
              ].map((k) => (
                <Card key={k.label} className="p-4"><div className="text-2xl font-bold">{k.value}</div><div className="text-xs text-muted-foreground mt-1">{k.label}</div></Card>
              ));
            })()}
          </div>
          <Card className="overflow-hidden">
            <div className="p-3 text-sm font-semibold border-b border-border flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Learner engagement</div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Learner</th><th className="text-right p-3">Time on task</th><th className="text-right p-3">Submissions</th><th className="text-left p-3">Last active</th><th className="text-left p-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {classLearners.map((l) => {
                  const s = learnerSignals(l.id, l.progress);
                  return (
                    <tr key={l.id}>
                      <td className="p-3 font-medium">{l.name}</td>
                      <td className="p-3 text-right tabular-nums">{s.timeOnTaskHrs} h</td>
                      <td className="p-3 text-right tabular-nums">{s.submissions}</td>
                      <td className="p-3 text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{s.lastActiveDays === 0 ? 'Today' : `${s.lastActiveDays}d ago`}</span></td>
                      <td className="p-3"><Badge variant="outline" className={cn('capitalize text-[10px]', l.status === 'at-risk' && 'border-amber-300 text-amber-600')}>{l.status.replace('-', ' ')}</Badge></td>
                    </tr>
                  );
                })}
                {classLearners.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No learners in this class yet.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
