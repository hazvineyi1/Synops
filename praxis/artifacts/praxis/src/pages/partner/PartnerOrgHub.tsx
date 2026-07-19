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
  Phone, MapPin, Mail, Smartphone, Link2, Plus,
  Calendar, User, Fingerprint, Globe, Languages, Briefcase, Accessibility, Heart, Clock, Trash2, Eye, Lock,
  Sparkles,
} from 'lucide-react';
import { startImpersonation } from '@/lib/impersonationStore';
import { renameOrg, useOrgOverrides } from '@/lib/orgOverridesStore';
import {
  getPartnerHub, findHubByOrgId, orgDetail, orgCourses, orgLearners, orgCoaching, orgGradebook,
  DELEGATABLE_POWERS, ZAR, VAT_RATE, type Invoice, type PartnerDoc, type DocCategory,
} from '@/lib/partnerHubData';
import { useOrgClasses, createClass } from '@/lib/orgClassStore';
import { useLearningHub, learningTemplates, coursesForPartner } from '@/lib/learningHubStore';
import { PartnerClassDetail } from './PartnerClassDetail';

const SECTION_META: Record<string, { title: string; icon: React.ComponentType<{ className?: string }> }> = {
  overview: { title: 'Overview', icon: Building },
  people: { title: 'People', icon: Users },
  classes: { title: 'Classes', icon: Layers },
  courses: { title: 'Courses', icon: BookOpen },
  coaching: { title: 'Coaching', icon: GraduationCap },
  gradebook: { title: 'Gradebook', icon: ClipboardList },
  funding: { title: 'Funding', icon: Landmark },
  documents: { title: 'Documents', icon: FileText },
  billing: { title: 'Billing', icon: Wallet },
  settings: { title: 'Settings', icon: Settings },
};

type OrgRole = 'org_admin' | 'coach' | 'learner';
type MemberStatus = 'active' | 'invited' | 'suspended' | 'archived';
type ResetRecord = { at: string; channel: 'email' | 'whatsapp' };
type Member = { id: string; name: string; email: string; role: OrgRole; status: MemberStatus; progress?: number; course?: string; lastReset?: ResetRecord };

const ROLE_LABEL: Record<OrgRole, string> = { org_admin: 'Org admin', coach: 'Coach', learner: 'Learner' };
const roleBadge = (r: OrgRole) =>
  r === 'org_admin' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
    : r === 'coach' ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';

const invoicePill = (s: Invoice['status']) =>
  s === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
    : s === 'overdue' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';

function ProfileRow({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-1">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

const initials = (name: string) => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
const lifecyclePill = (s: string) =>
  s === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
    : s === 'Graduated' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
      : s === 'Withdrawn' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';

/**
 * Organisation Hub (partner_admin). Once the partner steps into an organisation, this IS the app:
 * every surface - people, courses, coaching, gradebook, funding, documents and billing - is scoped
 * to this one organisation, and it is operational: add members, set roles, reset passwords, view
 * learners, and assign courses to a class. Nothing partner-wide is reachable from here. Seeded.
 */
export function PartnerOrgHub({ params }: { params?: { orgId?: string; section?: string; classId?: string } }) {
  const { user } = useSession();
  const [, navigate] = useLocation();
  const orgId = params?.orgId ?? '';
  const classId = params?.classId;
  // Resolve the hub that owns this org, so a super admin (no partnerId) still sees the right tenant.
  const h = findHubByOrgId(orgId) ?? getPartnerHub(user?.partnerId);
  const section = params?.section ?? 'overview';
  useOrgOverrides(); // re-render when an org is renamed so the new name shows here immediately
  const d = orgDetail(h, orgId);
  const base = `/partner/org/${orgId}`;

  // Only a partner admin or super admin may edit the organisation or impersonate.
  const canManageOrg = user?.role === 'partner_admin' || user?.role === 'super_admin';
  const actorName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Admin';
  const [orgNameDraft, setOrgNameDraft] = useState<string | null>(null);

  const courses = useMemo(() => orgCourses(h, orgId), [h, orgId]);
  // Courses the super admin granted this partner from the Learning Hub (surfaced in the org catalog).
  useLearningHub();
  const assignedCourses = useMemo(() => {
    const ids = coursesForPartner(h.partnerId);
    return learningTemplates().filter((t) => ids.includes(t.id));
  }, [h.partnerId]);
  const seededLearners = useMemo(() => orgLearners(h, orgId), [h, orgId]);
  const coaching = useMemo(() => orgCoaching(h, orgId), [h, orgId]);
  const gradebook = useMemo(() => orgGradebook(h, orgId), [h, orgId]);
  const classes = useOrgClasses(orgId);

  // Create-class + self-enrolment UI state
  const [newClassName, setNewClassName] = useState('');
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollChannel, setEnrollChannel] = useState<'email' | 'whatsapp'>('email');
  const [enrollTo, setEnrollTo] = useState('');
  const enrollLink = `https://learn.${(d.org?.name ?? 'org').toLowerCase().replace(/[^a-z0-9]+/g, '')}.synops.io/join/${orgId.replace('org_', '')}`;

  // ── Members: staff + learners for this org, all manageable in-place ──
  const [members, setMembers] = useState<Member[]>(() => [
    ...d.admins.map((a) => ({ id: a.id, name: a.name, email: a.email, role: 'org_admin' as OrgRole, status: a.status })),
    ...d.coaches.map((a) => ({ id: a.id, name: a.name, email: a.email, role: 'coach' as OrgRole, status: a.status })),
    ...seededLearners.map((l) => {
      const sd = l.id.split('').reduce((x, c) => x + c.charCodeAt(0), 0);
      const lastReset: ResetRecord | undefined = sd % 3 === 0 ? undefined : { at: new Date(Date.now() - (sd % 120 + 1) * 86400000).toISOString().slice(0, 10), channel: sd % 2 === 0 ? 'email' : 'whatsapp' };
      return { id: l.id, name: l.name, email: l.email, role: 'learner' as OrgRole, status: 'active' as const, progress: l.progress, course: l.course, lastReset };
    }),
  ]);
  const [roleFilter, setRoleFilter] = useState<OrgRole | 'all'>('all');
  const [selected, setSelected] = useState<Member | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [nm, setNm] = useState(''); const [em, setEm] = useState(''); const [rl, setRl] = useState<OrgRole>('learner');
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(null), 3000); };

  // In-drawer confirmation (the page-level flash is hidden behind the modal, so actions
  // taken inside the drawer report here, where the admin can actually see them).
  const [drawerMsg, setDrawerMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const drawerNote = (m: string) => { setDrawerMsg(m); window.setTimeout(() => setDrawerMsg(null), 4500); };
  const openMember = (m: Member) => { setSelected(m); setDrawerMsg(null); setConfirmDelete(false); };
  const recordReset = (id: string, channel: 'email' | 'whatsapp') => {
    const rec: ResetRecord = { at: new Date().toISOString().slice(0, 10), channel };
    setMembers((xs) => xs.map((m) => (m.id === id ? { ...m, lastReset: rec } : m)));
    setSelected((s) => (s && s.id === id ? { ...s, lastReset: rec } : s));
  };
  const deleteMember = (id: string, name: string) => { setMembers((xs) => xs.filter((x) => x.id !== id)); setSelected(null); setConfirmDelete(false); flashMsg(`${name}'s account was deleted.`); };

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

  const roleLabelOf = (r: OrgRole) => (r === 'org_admin' ? 'Org admin' : r === 'coach' ? 'Coach' : 'Learner');
  const viewAsMember = (m: Member) => {
    startImpersonation({ userId: m.id, name: m.name, role: roleLabelOf(m.role), orgId, orgName: d.org?.name ?? '', admin: actorName, startedMs: Date.now() });
    navigate(`/partner/impersonate/${orgId}/${m.id}`);
  };

  const filteredMembers = roleFilter === 'all' ? members : members.filter((m) => m.role === roleFilter);
  const counts = {
    all: members.length,
    org_admin: members.filter((m) => m.role === 'org_admin').length,
    coach: members.filter((m) => m.role === 'coach').length,
    learner: members.filter((m) => m.role === 'learner').length,
  };

  // Look up the full learner record for the People detail drawer (org-level personal info).
  const selectedLearner = selected?.role === 'learner' ? seededLearners.find((l) => l.id === selected.id) : undefined;

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

  // A specific class is open (/partner/org/:id/classes/:classId) -> the class workspace.
  if (classId) return <PartnerClassDetail orgId={orgId} classId={classId} />;

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
        subtitle={`${meta.title} - scoped entirely to ${d.org.name}.`}
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
            <StatCard icon={Users} label="Seats (active)" value={d.sub ? `${d.sub.activeSeats}/${d.sub.seats}` : '-'} tint="bg-indigo-500/10 text-indigo-600" />
            <StatCard icon={BookOpen} label="Courses" value={courses.length} tint="bg-emerald-500/10 text-emerald-600" />
            <StatCard icon={TrendingUp} label="Coaching health" value={`${coaching.avgHealth}%`} tint="bg-violet-500/10 text-violet-600" />
            <StatCard icon={Receipt} label="Open invoices" value={d.openInvoices} tint={d.openInvoices ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'} />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: 'People', href: `${base}/people`, icon: Users, sub: `${counts.all} members · ${counts.learner} learners` },
              { label: 'Classes', href: `${base}/classes`, icon: Layers, sub: `${classes.length} class${classes.length === 1 ? '' : 'es'}` },
              { label: 'Courses', href: `${base}/courses`, icon: BookOpen, sub: `${courses.length} courses` },
              { label: 'Coaching', href: `${base}/coaching`, icon: GraduationCap, sub: `${coaching.atRisk} at risk` },
              { label: 'Gradebook', href: `${base}/gradebook`, icon: ClipboardList, sub: `avg ${gradebook.avgScore}%` },
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
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEnrollOpen(true)}><Link2 className="h-3.5 w-3.5" /> Self-enrolment link</Button>
              <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}><UserPlus className="h-3.5 w-3.5" /> Add member</Button>
            </div>
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
                    <td className="p-3"><Badge variant={m.status === 'active' ? 'secondary' : 'outline'} className={cn('capitalize', m.status === 'suspended' && 'border-red-300 text-red-600', m.status === 'archived' && 'border-slate-300 text-slate-500')}>{m.status}</Badge></td>
                    {roleFilter === 'learner' && <td className="p-3">{m.progress != null ? <div className="flex items-center gap-2"><Progress value={m.progress} className="h-1.5 w-24" /><span className="text-xs tabular-nums text-muted-foreground">{m.progress}%</span></div> : <span className="text-muted-foreground">-</span>}</td>}
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canManageOrg && <Button size="sm" variant="ghost" className="gap-1.5 h-8" onClick={() => viewAsMember(m)} title="Impersonate - see what they see"><Eye className="h-3.5 w-3.5" /> View as</Button>}
                        <Button size="sm" variant="ghost" className="gap-1.5 h-8" onClick={() => openMember(m)}><Settings2 className="h-3.5 w-3.5" /> Manage</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredMembers.length === 0 && <tr><td colSpan={roleFilter === 'learner' ? 5 : 4} className="p-6 text-center text-muted-foreground">No members in this view.</td></tr>}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-muted-foreground">Learners shown are the active roster for {d.org.name}. Role changes, password resets and suspensions apply to this organisation only.</p>
        </div>
      )}

      {/* ── CLASSES ── */}
      {section === 'classes' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-end gap-2">
              <label className="text-xs flex-1">
                <span className="mb-1 block font-medium text-muted-foreground">Create a class</span>
                <input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="e.g. Evening Cohort 2026" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
              </label>
              <Button className="gap-1.5" disabled={!newClassName.trim()} onClick={() => { const id = createClass(orgId, newClassName); setNewClassName(''); flashMsg('Class created.'); navigate(`${base}/classes/${id}`); }}><Plus className="h-4 w-4" /> Create</Button>
            </div>
          </Card>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {classes.map((cl) => (
              <button key={cl.id} onClick={() => navigate(`${base}/classes/${cl.id}`)}
                className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/40 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold truncate flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> {cl.name}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span><Users className="inline h-3 w-3 mr-1" />{cl.learnerIds.length} learners</span>
                  <span><GraduationCap className="inline h-3 w-3 mr-1" />{cl.staff.length} staff</span>
                  <span><BookOpen className="inline h-3 w-3 mr-1" />{cl.courseIds.length} courses</span>
                  {cl.messages.some((m) => m.unread) && <span className="text-red-600">{cl.messages.filter((m) => m.unread).length} new messages</span>}
                </div>
              </button>
            ))}
            {classes.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">No classes yet. Create one above.</Card>}
          </div>
        </div>
      )}

      {/* ── COURSES (catalog) ── */}
      {section === 'courses' && (
        <div className="space-y-4">
          <Card className="p-4 flex items-start gap-3 text-sm">
            <BookOpen className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="text-muted-foreground">The course catalog for {d.org.name}. Courses are delivered to learners by assigning them to a <button className="text-primary underline" onClick={() => navigate(`${base}/classes`)}>class</button>.</div>
          </Card>

          {assignedCourses.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Assigned from the Learning Hub</h3>
                <Badge variant="secondary" className="ml-auto">{assignedCourses.length}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Courses the platform granted {h.partnerName}. Available for every organisation under this partner to deliver.</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {assignedCourses.map((t) => (
                  <div key={t.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{t.title}</span>
                      <Badge className="bg-emerald-100 text-emerald-700 shrink-0">Granted</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{t.level} · {t.modules} modules · {t.hours}h · {t.standard}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Course</th><th className="text-left p-3">Modality</th><th className="text-right p-3">Enrolled</th><th className="text-left p-3">In classes</th><th className="text-left p-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {courses.map((c) => {
                  const inClasses = classes.filter((cl) => cl.courseIds.includes(c.id));
                  return (
                    <tr key={c.id}>
                      <td className="p-3 font-medium">{c.title}</td>
                      <td className="p-3 text-muted-foreground">{c.modality}</td>
                      <td className="p-3 text-right tabular-nums">{c.enrolled}</td>
                      <td className="p-3">{inClasses.length === 0 ? <span className="text-xs text-muted-foreground">-</span> : <div className="flex flex-wrap gap-1">{inClasses.map((cl) => <span key={cl.id} className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{cl.name}</span>)}</div>}</td>
                      <td className="p-3"><Badge variant={c.status === 'active' ? 'secondary' : 'outline'} className="capitalize">{c.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
            <StatCard icon={Wallet} label="Plan" value={d.plan?.name ?? '-'} tint="bg-indigo-500/10 text-indigo-600" />
            <StatCard icon={Users} label="Seats" value={d.sub ? `${d.sub.activeSeats}/${d.sub.seats}` : '-'} tint="bg-emerald-500/10 text-emerald-600" />
            <StatCard icon={Receipt} label="Monthly (excl. VAT)" value={d.plan && d.sub ? ZAR(d.plan.pricePerSeat * d.sub.seats) : '-'} tint="bg-violet-500/10 text-violet-600" />
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
      {section === 'settings' && (() => {
        const nameValue = orgNameDraft ?? d.org.name;
        const nameChanged = nameValue.trim() !== '' && nameValue.trim() !== d.org.name;
        const saveOrgName = () => {
          if (!canManageOrg) return;
          const ok = renameOrg(orgId, d.name, d.org.name, nameValue, actorName, (user?.role ?? 'partner_admin').replace('_', ' '));
          setOrgNameDraft(null);
          flashMsg(ok ? `Organisation renamed to "${nameValue.trim()}". Change recorded in the activity log.` : 'Organisation settings saved.');
        };
        return (
          <Card className="p-5 max-w-2xl space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Settings className="h-4 w-4 text-primary" /> Organisation settings</h3>
            {!canManageOrg && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 dark:bg-slate-900/40 px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5 shrink-0" /> Only a Partner Admin or Super Admin can change these settings.
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Organisation name</span>
                <input value={nameValue} readOnly={!canManageOrg} onChange={(e) => setOrgNameDraft(e.target.value)}
                  className={cn('h-10 w-full rounded-md border border-input px-3 text-sm', canManageOrg ? 'bg-background' : 'bg-muted/40 text-muted-foreground')} /></label>
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Primary admin</span>
                <input defaultValue={d.admins[0]?.email ?? ''} readOnly={!canManageOrg} className={cn('h-10 w-full rounded-md border border-input px-3 text-sm', canManageOrg ? 'bg-background' : 'bg-muted/40 text-muted-foreground')} /></label>
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Plan</span>
                <input defaultValue={d.plan?.name ?? ''} readOnly className="h-10 w-full rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground" /></label>
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Seats</span>
                <input defaultValue={d.sub ? String(d.sub.seats) : ''} readOnly className="h-10 w-full rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground" /></label>
            </div>
            {canManageOrg && (
              <div className="flex items-center gap-3">
                <Button className="gap-1.5" disabled={!nameChanged} onClick={saveOrgName}><CheckCircle2 className="h-4 w-4" /> Save changes</Button>
                {nameChanged && <span className="text-xs text-muted-foreground">Renaming will update the organisation everywhere and log the change.</span>}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Renaming the organisation updates it across the hub and records what it was, who changed it and when in the Audit activity log. Plan and seat changes are handled from the partner-wide Financial Hub.</p>
          </Card>
        );
      })()}

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

      {/* ── Member / learner profile drawer ── */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold shrink-0">{initials(selected.name)}</div>
                  <div className="min-w-0">
                    <DialogTitle className="flex items-center gap-2 flex-wrap">{selected.name}
                      {selectedLearner && <span className={cn('rounded px-2 py-0.5 text-[10px] font-medium', lifecyclePill(selectedLearner.lifecycleStatus))}>{selectedLearner.lifecycleStatus}</span>}
                      {(selected.status === 'suspended' || selected.status === 'archived') && <span className="rounded px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 capitalize">{selected.status}</span>}
                    </DialogTitle>
                    <DialogDescription>{selected.email} · <span className="capitalize">{ROLE_LABEL[selected.role]}</span> · {d.org.name}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                {/* In-drawer confirmation (visible above the modal, unlike the page flash) */}
                {drawerMsg && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/30 px-3 py-2 flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> {drawerMsg}
                  </div>
                )}

                <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Role in this organisation</span>
                  <select value={selected.role} onChange={(e) => { setMemberRole(selected.id, e.target.value as OrgRole); drawerNote(`Role updated to ${ROLE_LABEL[e.target.value as OrgRole]}.`); }}
                    className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                    <option value="learner">Learner</option><option value="coach">Coach</option><option value="org_admin">Org admin</option>
                  </select></label>

                {/* Reset password - choose channel */}
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Reset password - send link via</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { recordReset(selected.id, 'email'); drawerNote(`Password reset link sent to ${selected.email}.`); }}><Mail className="h-3.5 w-3.5" /> Email</Button>
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={!selectedLearner?.whatsappOptIn} onClick={() => { recordReset(selected.id, 'whatsapp'); drawerNote(`Password reset link sent via WhatsApp to ${selectedLearner?.phone}.`); }}><Smartphone className="h-3.5 w-3.5" /> WhatsApp</Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    {selected.lastReset ? <>Last reset {fmtDate(selected.lastReset.at)} via {selected.lastReset.channel === 'whatsapp' ? 'WhatsApp' : 'email'}.</> : <>No password reset on record.</>}
                  </p>
                  {selectedLearner && !selectedLearner.whatsappOptIn && <p className="text-[11px] text-muted-foreground mt-0.5">WhatsApp reset unavailable - learner has not opted in.</p>}
                </div>

                {/* Account actions */}
                <div className="grid grid-cols-2 gap-2">
                  {canManageOrg && <Button variant="outline" className="gap-2 justify-start col-span-2 border-primary/40 text-primary" onClick={() => viewAsMember(selected)}><Eye className="h-4 w-4" /> View as {selected.name.split(' ')[0]} (impersonate)</Button>}
                  <Button variant="outline" className="gap-2 justify-start" onClick={() => drawerNote(`Login help link resent to ${selected.email}.`)}><LifeBuoy className="h-4 w-4" /> Resend login help</Button>
                  {selected.status === 'suspended' ? (
                    <Button variant="outline" className="gap-2 justify-start text-emerald-600" onClick={() => { setMemberStatus(selected.id, 'active'); drawerNote(`${selected.name} reactivated.`); }}><RotateCcw className="h-4 w-4" /> Reactivate</Button>
                  ) : (
                    <Button variant="outline" className="gap-2 justify-start text-red-600" onClick={() => { setMemberStatus(selected.id, 'suspended'); drawerNote(`${selected.name} suspended.`); }}><Ban className="h-4 w-4" /> Suspend account</Button>
                  )}
                  {selected.status === 'archived' ? (
                    <Button variant="outline" className="gap-2 justify-start text-emerald-600" onClick={() => { setMemberStatus(selected.id, 'active'); drawerNote(`${selected.name} restored from archive.`); }}><RotateCcw className="h-4 w-4" /> Restore</Button>
                  ) : (
                    <Button variant="outline" className="gap-2 justify-start" onClick={() => { setMemberStatus(selected.id, 'archived'); drawerNote(`${selected.name} archived. Record kept, access removed.`); }}><FileText className="h-4 w-4" /> Archive</Button>
                  )}
                  {confirmDelete ? (
                    <div className="col-span-1 flex items-center gap-1.5">
                      <Button size="sm" variant="outline" className="flex-1 text-red-600 border-red-300" onClick={() => deleteMember(selected.id, selected.name)}>Confirm delete</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    </div>
                  ) : (
                    <Button variant="outline" className="gap-2 justify-start text-red-600" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /> Delete account</Button>
                  )}
                </div>
                {confirmDelete && <p className="text-[11px] text-red-600">Deleting permanently removes {selected.name}'s account and record from {d.org.name}. Consider Archive if you may need it later.</p>}

                {selectedLearner && (
                  <>
                    {/* Personal */}
                    <div className="rounded-lg border border-border p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Personal</div>
                      <div className="grid sm:grid-cols-2 gap-x-4">
                        <ProfileRow icon={Calendar} label="Date of birth">{fmtDate(selectedLearner.dob)} · {selectedLearner.age} yrs</ProfileRow>
                        <ProfileRow icon={User} label="Gender">{selectedLearner.gender}</ProfileRow>
                        <ProfileRow icon={Fingerprint} label="ID / passport">{selectedLearner.idNumber.slice(0, 6)}*****{selectedLearner.idNumber.slice(-2)}</ProfileRow>
                        <ProfileRow icon={Globe} label="Nationality">{selectedLearner.nationality}</ProfileRow>
                        <ProfileRow icon={Languages} label="Home language">{selectedLearner.homeLanguage}</ProfileRow>
                        <ProfileRow icon={Users} label="Population group (B-BBEE)">{selectedLearner.populationGroup}</ProfileRow>
                        <ProfileRow icon={Accessibility} label="Disability">{selectedLearner.disability}</ProfileRow>
                      </div>
                    </div>

                    {/* Contact */}
                    <div className="rounded-lg border border-border p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Contact</div>
                      <div className="grid sm:grid-cols-2 gap-x-4">
                        <ProfileRow icon={Phone} label="Phone">{selectedLearner.phone}</ProfileRow>
                        <ProfileRow icon={Smartphone} label="WhatsApp">{selectedLearner.whatsappOptIn ? <Badge className="bg-emerald-600 text-[10px]">Opted in</Badge> : <Badge variant="outline" className="text-[10px]">Not opted in</Badge>}</ProfileRow>
                        <ProfileRow icon={Mail} label="Email">{selectedLearner.email}</ProfileRow>
                        <ProfileRow icon={Heart} label="Emergency contact">{selectedLearner.emergencyContact}</ProfileRow>
                        <div className="sm:col-span-2"><ProfileRow icon={MapPin} label="Home address">{selectedLearner.address}</ProfileRow></div>
                      </div>
                    </div>

                    {/* Education & Employment */}
                    <div className="rounded-lg border border-border p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Education &amp; employment</div>
                      <div className="grid sm:grid-cols-2 gap-x-4">
                        <ProfileRow icon={GraduationCap} label="Highest qualification">{selectedLearner.highestQualification}</ProfileRow>
                        <ProfileRow icon={Briefcase} label="Employment status">{selectedLearner.employmentStatus}</ProfileRow>
                        <ProfileRow icon={Briefcase} label="Current occupation">{selectedLearner.jobTitle}</ProfileRow>
                        <ProfileRow icon={Building} label="Employer">{selectedLearner.employer}</ProfileRow>
                      </div>
                    </div>

                    {/* Programme */}
                    <div className="rounded-lg border border-border p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Programme &amp; funding</div>
                      <div className="grid sm:grid-cols-2 gap-x-4">
                        <ProfileRow icon={Landmark} label="Funder">{selectedLearner.funder}</ProfileRow>
                        <ProfileRow icon={BookOpen} label="Current course">{selectedLearner.course}</ProfileRow>
                        <ProfileRow icon={TrendingUp} label="Progress">
                          <span className="flex items-center gap-2"><Progress value={selectedLearner.progress} className="h-1.5 w-24" /> {selectedLearner.progress}%</span>
                        </ProfileRow>
                        <ProfileRow icon={CheckCircle2} label="Learner status"><span className="capitalize">{selectedLearner.status.replace('-', ' ')}</span></ProfileRow>
                        <ProfileRow icon={UserPlus} label="Registered">via {selectedLearner.enrolledVia} · {fmtDate(selectedLearner.enrolledAt)}</ProfileRow>
                        <ProfileRow icon={Clock} label="Last active">{fmtDate(selectedLearner.lastActive)}</ProfileRow>
                      </div>
                    </div>
                  </>
                )}

                <p className="text-xs text-muted-foreground">Actions apply only within {d.org.name} and are written to the audit trail. Delivery of emails / WhatsApp messages is a backend step.</p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Self-enrolment dialog (org level: email or WhatsApp) ── */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Learner self-enrolment</DialogTitle>
            <DialogDescription>Send a self-enrolment link so learners can register themselves into {d.org.name}. Registration works by email or WhatsApp.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Self-enrolment link</div>
              <div className="flex items-center gap-2">
                <input readOnly value={enrollLink} className="h-10 flex-1 rounded-md border border-input bg-muted/40 px-3 text-xs text-muted-foreground" />
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { try { navigator.clipboard?.writeText(enrollLink); } catch { /* noop */ } flashMsg('Link copied.'); }}><Link2 className="h-3.5 w-3.5" /> Copy</Button>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Send via</div>
              <div className="flex gap-2">
                <button onClick={() => setEnrollChannel('email')} className={cn('flex-1 rounded-lg border px-3 py-2 text-sm inline-flex items-center justify-center gap-1.5 transition', enrollChannel === 'email' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}><Mail className="h-4 w-4" /> Email</button>
                <button onClick={() => setEnrollChannel('whatsapp')} className={cn('flex-1 rounded-lg border px-3 py-2 text-sm inline-flex items-center justify-center gap-1.5 transition', enrollChannel === 'whatsapp' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}><Smartphone className="h-4 w-4" /> WhatsApp</button>
              </div>
            </div>
            <label className="text-xs block">
              <span className="mb-1 block font-medium text-muted-foreground">{enrollChannel === 'email' ? 'Recipient email(s)' : 'Recipient WhatsApp number(s)'}</span>
              <input value={enrollTo} onChange={(e) => setEnrollTo(e.target.value)} placeholder={enrollChannel === 'email' ? 'name@example.com, ...' : '+27 82 000 0000, ...'} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </label>
            <Button className="w-full gap-1.5" disabled={!enrollTo.trim()} onClick={() => { setEnrollTo(''); setEnrollOpen(false); flashMsg(`Self-enrolment link sent via ${enrollChannel === 'email' ? 'email' : 'WhatsApp'}.`); }}><Send className="h-4 w-4" /> Send invitation</Button>
            <p className="text-xs text-muted-foreground">Learners who register through this link are added to {d.org.name} and can then be placed into a class.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
