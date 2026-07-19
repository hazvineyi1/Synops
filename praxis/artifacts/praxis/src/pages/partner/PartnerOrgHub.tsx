import React, { useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Building, Users, BookOpen, GraduationCap, ClipboardList, Landmark, FileText, Wallet,
  Settings, TrendingUp, Receipt, ShieldCheck, Upload, ChevronRight, CheckCircle2, AlertTriangle,
  UserPlus, KeyRound, Ban, RotateCcw, Settings2, Layers, Check, Send, LifeBuoy,
} from 'lucide-react';
import {
  getPartnerHub, findHubByOrgId, orgDetail, orgCourses, orgLearners, orgCoaching, orgGradebook, orgClasses,
  DELEGATABLE_POWERS, ZAR, VAT_RATE, type Invoice, type PartnerDoc, type DocCategory,
} from '@/lib/partnerHubData';

const SECTION_META: Record<string, { title: string; icon: React.ComponentType<{ className?: string }> }> = {
  overview: { title: 'Overview', icon: Building },
  people: { title: 'People', icon: Users },
  courses: { title: 'Courses', icon: BookOpen },
  coaching: { title: 'Coaching', icon: GraduationCap },
  gradebook: { title: 'Gradebook', icon: ClipboardList },
  funding: { title: 'Funding', icon: Landmark },
  documents: { title: 'Documents', icon: FileText },
  billing: { title: 'Billing', icon: Wallet },
  settings: { title: 'Settings', icon: Settings },
};

type OrgRole = 'org_admin' | 'coach' | 'learner';
type Member = { id: string; name: string; email: string; role: OrgRole; status: 'active' | 'invited' | 'suspended'; progress?: number; course?: string };

const ROLE_LABEL: Record<OrgRole, string> = { org_admin: 'Org admin', coach: 'Coach', learner: 'Learner' };
const roleBadge = (r: OrgRole) =>
  r === 'org_admin' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
    : r === 'coach' ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';

const invoicePill = (s: Invoice['status']) =>
  s === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
    : s === 'overdue' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';

/**
 * Organisation Hub (partner_admin). Once the partner steps into an organisation, this IS the app:
 * every surface — people, courses, coaching, gradebook, funding, documents and billing — is scoped
 * to this one organisation, and it is operational: add members, set roles, reset passwords, view
 * learners, and assign courses to a class. Nothing partner-wide is reachable from here. Seeded.
 */
export function PartnerOrgHub({ params }: { params?: { orgId?: string; section?: string } }) {
  const { user } = useSession();
  const [, navigate] = useLocation();
  const orgId = params?.orgId ?? '';
  // Resolve the hub that owns this org, so a super admin (no partnerId) still sees the right tenant.
  const h = findHubByOrgId(orgId) ?? getPartnerHub(user?.partnerId);
  const section = params?.section ?? 'overview';
  const d = orgDetail(h, orgId);
  const base = `/partner/org/${orgId}`;

  const courses = useMemo(() => orgCourses(h, orgId), [h, orgId]);
  const seededLearners = useMemo(() => orgLearners(h, orgId), [h, orgId]);
  const coaching = useMemo(() => orgCoaching(h, orgId), [h, orgId]);
  const gradebook = useMemo(() => orgGradebook(h, orgId), [h, orgId]);
  const classes = useMemo(() => orgClasses(h, orgId), [h, orgId]);

  // ── Members: staff + learners for this org, all manageable in-place ──
  const [members, setMembers] = useState<Member[]>(() => [
    ...d.admins.map((a) => ({ id: a.id, name: a.name, email: a.email, role: 'org_admin' as OrgRole, status: a.status })),
    ...d.coaches.map((a) => ({ id: a.id, name: a.name, email: a.email, role: 'coach' as OrgRole, status: a.status })),
    ...seededLearners.map((l) => ({ id: l.id, name: l.name, email: l.email, role: 'learner' as OrgRole, status: 'active' as const, progress: l.progress, course: l.course })),
  ]);
  const [roleFilter, setRoleFilter] = useState<OrgRole | 'all'>('all');
  const [selected, setSelected] = useState<Member | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [nm, setNm] = useState(''); const [em, setEm] = useState(''); const [rl, setRl] = useState<OrgRole>('learner');
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(null), 3000); };

  const setMemberStatus = (id: string, status: Member['status']) => {
    setMembers((xs) => xs.map((m) => (m.id === id ? { ...m, status } : m)));
    setSelected((s) => (s && s.id === id ? { ...s, status } : s));
  };
  const setMemberRole = (id: string, role: OrgRole) => {
    setMembers((xs) => xs.map((m) => (m.id === id ? { ...m, role } : m)));
    setSelected((s) => (s && s.id === id ? { ...s, role } : s));
  };
  const addMember = () => {
    if (!nm.trim() || !em.trim()) return;
    setMembers((xs) => [{ id: `m_${Date.now()}`, name: nm.trim(), email: em.trim(), role: rl, status: 'invited' }, ...xs]);
    setNm(''); setEm(''); setRl('learner'); setAddOpen(false);
    flashMsg(`${ROLE_LABEL[rl]} invited to ${d.name}.`);
  };

  const filteredMembers = roleFilter === 'all' ? members : members.filter((m) => m.role === roleFilter);
  const counts = {
    all: members.length,
    org_admin: members.filter((m) => m.role === 'org_admin').length,
    coach: members.filter((m) => m.role === 'coach').length,
    learner: members.filter((m) => m.role === 'learner').length,
  };

  // ── Course → class assignment ──
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [assignFor, setAssignFor] = useState<string | null>(null); // courseId
  const assignToClass = (courseId: string, classId: string) => {
    setAssignments((a) => {
      const cur = a[courseId] ?? [];
      return cur.includes(classId) ? a : { ...a, [courseId]: [...cur, classId] };
    });
    const cls = classes.find((c) => c.id === classId);
    flashMsg(`Course assigned to ${cls?.name ?? 'class'}.`);
    setAssignFor(null);
  };
  const unassign = (courseId: string, classId: string) =>
    setAssignments((a) => ({ ...a, [courseId]: (a[courseId] ?? []).filter((c) => c !== classId) }));

  // ── Documents & invoices (scoped) ──
  const [invoices, setInvoices] = useState<Invoice[]>(() => h.invoices.filter((i) => i.orgName === d.name));
  const [docs, setDocs] = useState<PartnerDoc[]>(() => h.documents.filter((doc) => doc.orgName === d.name));
  const [uploadCat, setUploadCat] = useState<DocCategory>('invoice');
  const fileRef = useRef<HTMLInputElement>(null);
  const markPaid = (id: string) => setInvoices((xs) => xs.map((i) => (i.id === id ? { ...i, status: 'paid' } : i)));
  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added: PartnerDoc[] = Array.from(files).map((f, i) => ({
      id: `up_${Date.now()}_${i}`, name: f.name, category: uploadCat, orgName: d.name,
      status: 'pending', uploadedAt: new Date().toISOString().slice(0, 10),
      size: f.size > 1_000_000 ? `${(f.size / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`,
    }));
    setDocs((prev) => [...added, ...prev]);
    if (fileRef.current) fileRef.current.value = '';
    flashMsg('Document filed for this organisation.');
  };

  if (!d.org) {
    return (
      <div className="space-y-4">
        <PageHeader title="Organisation not found" icon={Building} subtitle="This organisation is not under your partner account." />
        <Button variant="outline" onClick={() => navigate('/partner/organisations')}>Back to organisations</Button>
      </div>
    );
  }
  const meta = SECTION_META[section] ?? SECTION_META.overview;

  return (
    <div className="space-y-6">
      <PageHeader
        title={d.org.name}
        icon={meta.icon}
        subtitle={`${meta.title} — scoped entirely to ${d.org.name}.`}
        action={d.plan ? <Badge variant="outline" className="gap-1.5"><Wallet className="h-3.5 w-3.5" /> {d.plan.name}</Badge> : undefined}
      />

      {flash && (
        <Card className="p-3 border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {flash}
        </Card>
      )}

      {/* ── OVERVIEW ── */}
      {section === 'overview' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={Users} label="Seats (active)" value={d.sub ? `${d.sub.activeSeats}/${d.sub.seats}` : '—'} tint="bg-indigo-500/10 text-indigo-600" />
            <StatCard icon={BookOpen} label="Courses" value={courses.length} tint="bg-emerald-500/10 text-emerald-600" />
            <StatCard icon={TrendingUp} label="Coaching health" value={`${coaching.avgHealth}%`} tint="bg-violet-500/10 text-violet-600" />
            <StatCard icon={Receipt} label="Open invoices" value={d.openInvoices} tint={d.openInvoices ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'} />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: 'People', href: `${base}/people`, icon: Users, sub: `${counts.all} members · ${counts.learner} learners` },
              { label: 'Courses', href: `${base}/courses`, icon: BookOpen, sub: `${courses.length} courses · ${classes.length} classes` },
              { label: 'Coaching', href: `${base}/coaching`, icon: GraduationCap, sub: `${coaching.atRisk} at risk` },
              { label: 'Gradebook', href: `${base}/gradebook`, icon: ClipboardList, sub: `avg ${gradebook.avgScore}%` },
              { label: 'Funding', href: `${base}/funding`, icon: Landmark, sub: `${d.funders.length} agreement${d.funders.length === 1 ? '' : 's'}` },
              { label: 'Documents', href: `${base}/documents`, icon: FileText, sub: `${docs.length} filed` },
            ].map((c) => (
              <button key={c.href} onClick={() => navigate(c.href)}
                className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/40 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5 font-medium"><c.icon className="h-4 w-4 text-primary" /> {c.label}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground">{c.sub}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── PEOPLE ── */}
      {section === 'people' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {([['all', 'All'], ['org_admin', 'Org admins'], ['coach', 'Coaches'], ['learner', 'Learners']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setRoleFilter(k)}
                className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition', roleFilter === k ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-primary/40')}>
                {label} ({k === 'all' ? counts.all : counts[k]})
              </button>
            ))}
            <Button size="sm" className="ml-auto gap-1.5" onClick={() => setAddOpen(true)}><UserPlus className="h-3.5 w-3.5" /> Add member</Button>
          </div>

          {d.delegated.length > 0 && roleFilter !== 'learner' && (
            <Card className="p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Delegated admins</h3>
              <div className="flex flex-wrap gap-2">
                {d.delegated.map((da) => (
                  <span key={da.id} className="rounded-lg border border-border px-3 py-1.5 text-xs">
                    <span className="font-medium">{da.name}</span> <span className="text-muted-foreground">· {da.powers.length} powers</span>
                  </span>
                ))}
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Member</th><th className="text-left p-3">Role</th><th className="text-left p-3">Status</th>{roleFilter === 'learner' && <th className="text-left p-3">Progress</th>}<th className="p-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredMembers.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/20">
                    <td className="p-3"><div className="font-medium">{m.name}</div><div className="text-xs text-muted-foreground">{m.email}</div></td>
                    <td className="p-3"><span className={cn('rounded px-2 py-0.5 text-xs font-medium', roleBadge(m.role))}>{ROLE_LABEL[m.role]}</span></td>
                    <td className="p-3"><Badge variant={m.status === 'active' ? 'secondary' : 'outline'} className={cn('capitalize', m.status === 'suspended' && 'border-red-300 text-red-600')}>{m.status}</Badge></td>
                    {roleFilter === 'learner' && <td className="p-3">{m.progress != null ? <div className="flex items-center gap-2"><Progress value={m.progress} className="h-1.5 w-24" /><span className="text-xs tabular-nums text-muted-foreground">{m.progress}%</span></div> : <span className="text-muted-foreground">—</span>}</td>}
                    <td className="p-3 text-right"><Button size="sm" variant="ghost" className="gap-1.5 h-8" onClick={() => setSelected(m)}><Settings2 className="h-3.5 w-3.5" /> Manage</Button></td>
                  </tr>
                ))}
                {filteredMembers.length === 0 && <tr><td colSpan={roleFilter === 'learner' ? 5 : 4} className="p-6 text-center text-muted-foreground">No members in this view.</td></tr>}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-muted-foreground">Learners shown are the active roster for {d.org.name}. Role changes, password resets and suspensions apply to this organisation only.</p>
        </div>
      )}

      {/* ── COURSES ── */}
      {section === 'courses' && (
        <div className="space-y-4">
          <Card className="p-4 flex items-start gap-3 text-sm">
            <Layers className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="text-muted-foreground">Assign a course to one of {d.org.name}'s classes to enrol that whole cohort. Classes: {classes.map((c) => c.name).join(', ')}.</div>
          </Card>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Course</th><th className="text-left p-3">Modality</th><th className="text-right p-3">Enrolled</th><th className="text-left p-3">Assigned classes</th><th className="text-left p-3">Status</th><th className="p-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {courses.map((c) => {
                  const assigned = assignments[c.id] ?? [];
                  return (
                    <tr key={c.id}>
                      <td className="p-3 font-medium">{c.title}</td>
                      <td className="p-3 text-muted-foreground">{c.modality}</td>
                      <td className="p-3 text-right tabular-nums">{c.enrolled}</td>
                      <td className="p-3">
                        {assigned.length === 0 ? <span className="text-xs text-muted-foreground">Not assigned</span> : (
                          <div className="flex flex-wrap gap-1">
                            {assigned.map((cid) => {
                              const cls = classes.find((x) => x.id === cid);
                              return <button key={cid} onClick={() => unassign(c.id, cid)} className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-red-100 hover:text-red-700" title="Remove">{cls?.name ?? cid} ×</button>;
                            })}
                          </div>
                        )}
                      </td>
                      <td className="p-3"><Badge variant={c.status === 'active' ? 'secondary' : 'outline'} className="capitalize">{c.status}</Badge></td>
                      <td className="p-3 text-right"><Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setAssignFor(c.id)}><Send className="h-3.5 w-3.5" /> Assign to class</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Classes overview */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> Classes</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {classes.map((cl) => (
                <div key={cl.id} className="rounded-lg border border-border p-3">
                  <div className="font-medium text-sm">{cl.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{cl.learners} learners · Coach {cl.coach}</div>
                  <div className="text-xs text-muted-foreground mt-1">{courses.filter((c) => (assignments[c.id] ?? []).includes(cl.id)).length} course(s) assigned</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ── COACHING ── */}
      {section === 'coaching' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={GraduationCap} label="Sections" value={coaching.sections} tint="bg-indigo-500/10 text-indigo-600" />
            <StatCard icon={Users} label="Coaches" value={coaching.coaches} tint="bg-emerald-500/10 text-emerald-600" />
            <StatCard icon={CheckCircle2} label="On track" value={coaching.onTrack} tint="bg-emerald-500/10 text-emerald-600" />
            <StatCard icon={AlertTriangle} label="At risk" value={coaching.atRisk} tint={coaching.atRisk ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'} />
          </div>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold">Cohort health</h3><span className="text-sm font-semibold tabular-nums">{coaching.avgHealth}%</span></div>
            <Progress value={coaching.avgHealth} className="h-2" />
            <p className="mt-3 text-sm text-muted-foreground">{coaching.atRisk} learner{coaching.atRisk === 1 ? '' : 's'} flagged off-track are routed to their coach and an AI catch-up plan. Health blends progress, attendance and assessment signals for this organisation only.</p>
          </Card>
        </div>
      )}

      {/* ── GRADEBOOK ── */}
      {section === 'gradebook' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={TrendingUp} label="Average score" value={`${gradebook.avgScore}%`} tint="bg-indigo-500/10 text-indigo-600" />
            <StatCard icon={ClipboardList} label="Submitted" value={gradebook.submitted} tint="bg-emerald-500/10 text-emerald-600" />
            <StatCard icon={CheckCircle2} label="Graded" value={gradebook.graded} tint="bg-emerald-500/10 text-emerald-600" />
            <StatCard icon={AlertTriangle} label="Pending marking" value={gradebook.pendingMarking} tint={gradebook.pendingMarking ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'} />
          </div>
          <Card className="overflow-hidden">
            <div className="p-3 text-sm font-semibold border-b border-border">Course averages</div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Course</th><th className="text-right p-3">Enrolled</th><th className="text-left p-3">Avg progress</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3 font-medium">{c.title}</td>
                    <td className="p-3 text-right tabular-nums">{c.enrolled}</td>
                    <td className="p-3"><div className="flex items-center gap-2"><Progress value={c.avgProgress} className="h-1.5 w-28" /><span className="text-xs tabular-nums text-muted-foreground">{c.avgProgress}%</span></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ── FUNDING ── */}
      {section === 'funding' && (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="p-3 text-sm font-semibold border-b border-border flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" /> Funding agreements</div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Funder</th><th className="text-right p-3">Seats</th><th className="text-right p-3">Value</th><th className="text-left p-3">Expiry</th><th className="text-left p-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.funders.map((f) => (
                  <tr key={f.id}>
                    <td className="p-3 font-medium">{f.funder}</td>
                    <td className="p-3 text-right tabular-nums">{f.seatsFunded}</td>
                    <td className="p-3 text-right tabular-nums font-medium">{ZAR(f.value)}</td>
                    <td className="p-3 text-muted-foreground">{new Date(f.expiry).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="p-3"><Badge className={cn('text-[10px]', f.status === 'expiring' ? 'bg-amber-500' : f.status === 'pending' ? 'bg-muted text-muted-foreground' : 'bg-emerald-600')}>{f.status}</Badge></td>
                  </tr>
                ))}
                {d.funders.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No funder agreements scoped to this organisation.</td></tr>}
              </tbody>
            </table>
          </Card>
          {d.allocations.length > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold mb-3">Seat allocation</h3>
              <div className="space-y-3">
                {d.allocations.map((a) => (
                  <div key={a.id}>
                    <div className="flex items-center justify-between text-sm"><span>{a.funder}</span><span className="text-muted-foreground tabular-nums">{a.used}/{a.allocated} used</span></div>
                    <Progress value={(a.used / a.allocated) * 100} className="h-1.5 mt-1" />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── DOCUMENTS ── */}
      {section === 'documents' && (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs">
                <span className="mb-1 block font-medium text-muted-foreground">Category</span>
                <select value={uploadCat} onChange={(e) => setUploadCat(e.target.value as DocCategory)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="invoice">Invoices</option><option value="contract">Contracts</option>
                  <option value="funder">Funder agreements</option><option value="compliance">Compliance</option><option value="other">Other</option>
                </select>
              </label>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              <Button className="gap-2" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Upload to {d.org.name}</Button>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Document</th><th className="text-left p-3">Category</th><th className="text-left p-3">Status</th><th className="text-left p-3">Uploaded</th><th className="text-right p-3">Size</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {docs.map((doc) => (
                  <tr key={doc.id}>
                    <td className="p-3 font-medium truncate max-w-[260px]">{doc.name}</td>
                    <td className="p-3 text-muted-foreground capitalize">{doc.category}</td>
                    <td className="p-3"><Badge variant="outline" className="capitalize text-[10px]">{doc.status.replace('-', ' ')}</Badge></td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(doc.uploadedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{doc.size}</td>
                  </tr>
                ))}
                {docs.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No documents filed for this organisation yet.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ── BILLING ── */}
      {section === 'billing' && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <StatCard icon={Wallet} label="Plan" value={d.plan?.name ?? '—'} tint="bg-indigo-500/10 text-indigo-600" />
            <StatCard icon={Users} label="Seats" value={d.sub ? `${d.sub.activeSeats}/${d.sub.seats}` : '—'} tint="bg-emerald-500/10 text-emerald-600" />
            <StatCard icon={Receipt} label="Monthly (excl. VAT)" value={d.plan && d.sub ? ZAR(d.plan.pricePerSeat * d.sub.seats) : '—'} tint="bg-violet-500/10 text-violet-600" />
          </div>
          <Card className="overflow-hidden">
            <div className="p-3 text-sm font-semibold border-b border-border">Invoices</div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Invoice</th><th className="text-left p-3">Period</th><th className="text-right p-3">Net</th><th className="text-right p-3">Total</th><th className="text-left p-3">Status</th><th className="p-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="p-3 font-mono text-xs">{i.number}</td>
                    <td className="p-3 text-muted-foreground">{i.period}</td>
                    <td className="p-3 text-right tabular-nums">{ZAR(i.net)}</td>
                    <td className="p-3 text-right tabular-nums font-medium">{ZAR(i.net * (1 + VAT_RATE))}</td>
                    <td className="p-3"><span className={cn('rounded px-2 py-0.5 text-xs font-medium', invoicePill(i.status))}>{i.status}</span></td>
                    <td className="p-3 text-right">{i.status !== 'paid' && <Button size="sm" variant="outline" onClick={() => markPaid(i.id)}>Mark paid</Button>}</td>
                  </tr>
                ))}
                {invoices.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No invoices for this organisation.</td></tr>}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-muted-foreground">This is {d.org.name}'s billing slice. The partner-wide consolidated Financial Hub lives in the Partner Admin Platform, outside any organisation.</p>
        </div>
      )}

      {/* ── SETTINGS ── */}
      {section === 'settings' && (
        <Card className="p-5 max-w-2xl space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Settings className="h-4 w-4 text-primary" /> Organisation settings</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Organisation name</span>
              <input defaultValue={d.org.name} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
            <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Primary admin</span>
              <input defaultValue={d.admins[0]?.email ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
            <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Plan</span>
              <input defaultValue={d.plan?.name ?? ''} readOnly className="h-10 w-full rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground" /></label>
            <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Seats</span>
              <input defaultValue={d.sub ? String(d.sub.seats) : ''} readOnly className="h-10 w-full rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground" /></label>
          </div>
          <Button className="gap-1.5" onClick={() => flashMsg('Organisation settings saved.')}><CheckCircle2 className="h-4 w-4" /> Save settings</Button>
          <p className="text-xs text-muted-foreground">Plan and seat changes are handled from the partner-wide Financial Hub; name and admin can be adjusted here.</p>
        </Card>
      )}

      {/* ── Add member dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add member to {d.org.name}</DialogTitle>
            <DialogDescription>Invite a member and set their role in this organisation. They receive a set-password link.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Full name</span>
              <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Member name" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
            <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Email</span>
              <input value={em} onChange={(e) => setEm(e.target.value)} placeholder="name@org.co.za" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
            <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Role</span>
              <select value={rl} onChange={(e) => setRl(e.target.value as OrgRole)} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="learner">Learner</option><option value="coach">Coach</option><option value="org_admin">Org admin</option>
              </select></label>
            <Button onClick={addMember} disabled={!nm.trim() || !em.trim()} className="w-full gap-1.5"><Send className="h-4 w-4" /> Send invite</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Member manage drawer ── */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>{selected.email} · {d.org.name}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Role in this organisation</span>
                  <select value={selected.role} onChange={(e) => { setMemberRole(selected.id, e.target.value as OrgRole); flashMsg(`Role updated to ${ROLE_LABEL[e.target.value as OrgRole]}.`); }}
                    className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                    <option value="learner">Learner</option><option value="coach">Coach</option><option value="org_admin">Org admin</option>
                  </select></label>

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="gap-2 justify-start" onClick={() => flashMsg(`Password reset link sent to ${selected.email}.`)}><KeyRound className="h-4 w-4" /> Reset password</Button>
                  <Button variant="outline" className="gap-2 justify-start" onClick={() => flashMsg(`Login help sent to ${selected.email}.`)}><LifeBuoy className="h-4 w-4" /> Login help</Button>
                  {selected.status === 'suspended' ? (
                    <Button variant="outline" className="gap-2 justify-start text-emerald-600" onClick={() => { setMemberStatus(selected.id, 'active'); flashMsg(`${selected.name} reactivated.`); }}><RotateCcw className="h-4 w-4" /> Reactivate</Button>
                  ) : (
                    <Button variant="outline" className="gap-2 justify-start text-red-600" onClick={() => { setMemberStatus(selected.id, 'suspended'); flashMsg(`${selected.name} suspended.`); }}><Ban className="h-4 w-4" /> Suspend</Button>
                  )}
                  <div className="flex items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground">
                    <Badge variant={selected.status === 'active' ? 'secondary' : 'outline'} className={cn('capitalize', selected.status === 'suspended' && 'border-red-300 text-red-600')}>{selected.status}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Actions apply only within {d.org.name} and are written to the audit trail. Email delivery is a backend step.</p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Assign course to class dialog ── */}
      <Dialog open={!!assignFor} onOpenChange={(o) => !o && setAssignFor(null)}>
        <DialogContent className="max-w-md">
          {assignFor && (
            <>
              <DialogHeader>
                <DialogTitle>Assign to a class</DialogTitle>
                <DialogDescription>{courses.find((c) => c.id === assignFor)?.title} — pick a class to enrol the whole cohort.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {classes.map((cl) => {
                  const already = (assignments[assignFor] ?? []).includes(cl.id);
                  return (
                    <button key={cl.id} disabled={already} onClick={() => assignToClass(assignFor, cl.id)}
                      className={cn('w-full flex items-center justify-between rounded-lg border p-3 text-left transition', already ? 'border-border opacity-60' : 'border-border hover:border-primary/40 hover:bg-muted/30')}>
                      <span><span className="block text-sm font-medium">{cl.name}</span><span className="block text-xs text-muted-foreground">{cl.learners} learners · Coach {cl.coach}</span></span>
                      {already ? <Check className="h-4 w-4 text-emerald-600" /> : <Send className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
