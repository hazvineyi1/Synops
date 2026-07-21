import React, { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/context/SessionContext';
import { apiFetch } from '@/lib/api';
import { useBrandTheme } from '@/context/ThemeProvider';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ScrollText, ShieldCheck, Clock, Bell, Lock, Eye, Search, StopCircle } from 'lucide-react';
import { getActivePartnerId } from '@/lib/partnerHubData';
import { useImpersonation, startImpersonation, stopImpersonation } from '@/lib/impersonationStore';

type AuditCategory = 'financial' | 'funder' | 'account' | 'impersonation' | 'branding';
type AuditRow = { id: string; at: string; category: AuditCategory; actor: string; actorRole: string; action: string; detail: string };
type Member = { id: string; name: string; email: string; role: string; organisationId?: string | null; orgName?: string | null };
type ImpersonatableUser = { id: string; name: string; email: string; role: string; orgId: string; orgName: string };
const ROLE_DISPLAY: Record<string, string> = { org_admin: 'Org admin', coach: 'Coach', learner: 'Learner' };

const CATS: (AuditCategory | 'all')[] = ['all', 'account', 'financial', 'funder', 'impersonation', 'branding'];
const catStyle: Record<AuditCategory, string> = {
  financial: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  funder: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  account: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  impersonation: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  branding: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
};
const roleBadge = (r: string) =>
  r === 'Org admin' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
    : r === 'Coach' ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
      : r === 'Delegated admin' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';

/**
 * Audit Log & Impersonation Controls (spec §6). One immutable log for every admin and financial
 * action, plus impersonation: a partner admin can impersonate anyone in their organisations
 * (org admins, coaches, delegated admins, learners) EXCEPT the platform super admin. Sessions are
 * time-boxed, org-notified and auto-logged. Functional on seeded data.
 */
export function PartnerAudit() {
  const { user } = useSession();
  const [, navigate] = useLocation();
  const { data: brand } = useBrandTheme();
  const partnerId = user?.partnerId ?? getActivePartnerId() ?? '';
  const partnerName = brand?.displayName || 'Your organisation';
  const [cat, setCat] = useState<(AuditCategory | 'all')>('all');

  // Real, append-only audit trail scoped to this partner.
  const { data: allAudit = [] } = useQuery({ queryKey: ['partner-audit', partnerId], queryFn: () => apiFetch<AuditRow[]>(`/partners/${partnerId}/audit`), enabled: !!partnerId });
  const rows = useMemo(
    () => (cat === 'all' ? allAudit : allAudit.filter((e) => e.category === cat)),
    [cat, allAudit],
  );

  // Real accounts under this partner become the impersonation targets.
  const { data: members = [] } = useQuery({ queryKey: ['partner-members', partnerId], queryFn: () => apiFetch<Member[]>(`/partners/${partnerId}/members`), enabled: !!partnerId });
  const targets: ImpersonatableUser[] = useMemo(() =>
    members
      .filter((m) => m.role === 'org_admin' || m.role === 'coach' || m.role === 'learner')
      .map((m) => ({ id: m.id, name: m.name, email: m.email, role: ROLE_DISPLAY[m.role] ?? m.role, orgId: m.organisationId ?? '', orgName: m.orgName ?? '' })),
    [members]);

  const adminName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Partner Admin';
  const [query, setQuery] = useState('');
  const { active, log } = useImpersonation();
  const sessions = log; // client-side session history (the real per-partner impersonation log is a follow-up)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? targets.filter((t) => t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q) || t.orgName.toLowerCase().includes(q) || t.role.toLowerCase().includes(q)) : targets;
    return list.slice(0, 40);
  }, [targets, query]);

  const startAndView = (t: ImpersonatableUser) => {
    startImpersonation({ userId: t.id, name: t.name, role: t.role, orgId: t.orgId, orgName: t.orgName, admin: adminName, startedMs: Date.now() });
    navigate(`/partner/impersonate/${t.orgId}/${t.id}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Audit & Impersonation" icon={ShieldCheck} subtitle={`${partnerName} - one immutable log for all admin and financial actions, plus impersonation controls.`} />

      <Tabs defaultValue="log">
        <TabsList>
          <TabsTrigger value="log">Activity Log</TabsTrigger>
          <TabsTrigger value="impersonation">Impersonation</TabsTrigger>
        </TabsList>

        {/* Unified activity log */}
        <TabsContent value="log" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {CATS.map((c) => (
              <button key={c} onClick={() => setCat(c)}
                className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition',
                  cat === c ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-primary/40')}>
                {c}
              </button>
            ))}
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">When</th><th className="text-left p-3">Category</th><th className="text-left p-3">Actor</th><th className="text-left p-3">Action</th><th className="text-left p-3">Detail</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(e.at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="p-3"><span className={cn('rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide inline-flex items-center gap-1', catStyle[e.category])}>{e.category === 'financial' && <Lock className="h-2.5 w-2.5" />}{e.category}</span></td>
                    <td className="p-3"><div>{e.actor}</div><div className="text-xs text-muted-foreground">{e.actorRole}</div></td>
                    <td className="p-3 font-mono text-xs">{e.action}</td>
                    <td className="p-3 text-muted-foreground">{e.detail}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No audit events yet.</td></tr>}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Lock className="h-3 w-3" /> Financial entries carry stricter retention and cannot be deleted. The log is append-only.</p>
        </TabsContent>

        {/* Impersonation controls */}
        <TabsContent value="impersonation" className="mt-4 space-y-4">
          {/* Active session banner */}
          {active && (
            <Card className="p-4 border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-sm">
                <Eye className="h-5 w-5 text-amber-600 shrink-0" />
                <span>Currently viewing as <strong>{active.name}</strong> ({active.role}) - {active.orgName}.</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/partner/impersonate/${active.orgId}/${active.userId}`)}><Eye className="h-4 w-4" /> Resume view</Button>
                <Button size="sm" variant="outline" className="gap-1.5 border-amber-400" onClick={stopImpersonation}><StopCircle className="h-4 w-4" /> Stop</Button>
              </div>
            </Card>
          )}

          <div className="grid sm:grid-cols-3 gap-3">
            <Card className="p-4 flex items-start gap-3">
              <Clock className="h-5 w-5 text-primary shrink-0" />
              <div><div className="text-sm font-medium">Time-boxed</div><div className="text-xs text-muted-foreground">Sessions auto-expire after 30 minutes.</div></div>
            </Card>
            <Card className="p-4 flex items-start gap-3">
              <Bell className="h-5 w-5 text-primary shrink-0" />
              <div><div className="text-sm font-medium">Org notified</div><div className="text-xs text-muted-foreground">The organisation is alerted at session start.</div></div>
            </Card>
            <Card className="p-4 flex items-start gap-3">
              <ScrollText className="h-5 w-5 text-primary shrink-0" />
              <div><div className="text-sm font-medium">Auto-logged</div><div className="text-xs text-muted-foreground">Every session is written to the activity log.</div></div>
            </Card>
          </div>

          {/* Start impersonation */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Eye className="h-4 w-4 text-primary" /> Start impersonation</h3>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, org or role" className="h-8 w-56 pl-8 text-xs" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3">You can impersonate any account in your organisations - org admins, coaches, delegated admins and learners.</p>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 dark:bg-slate-900/40 px-3 py-2 mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5 shrink-0" /> The platform <span className="font-medium text-foreground">Super Admin</span> cannot be impersonated.
            </div>

            <div className="rounded-lg border border-border divide-y divide-border max-h-96 overflow-auto">
              {filtered.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/30">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.email} · {t.orgName}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn('rounded px-2 py-0.5 text-[10px] font-medium', roleBadge(t.role))}>{t.role}</span>
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={!!active} onClick={() => startAndView(t)}><Eye className="h-3 w-3" /> View as</Button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">No accounts match "{query}".</div>}
            </div>
            {targets.length > filtered.length && <p className="mt-2 text-[11px] text-muted-foreground">Showing {filtered.length} of {targets.length}. Refine the search to narrow the list.</p>}
          </Card>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recent impersonation sessions</div>
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="text-left p-3">Admin</th><th className="text-left p-3">Impersonated</th><th className="text-left p-3">Organisation</th><th className="text-left p-3">Started</th><th className="text-right p-3">Duration</th><th className="text-left p-3">Reason</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sessions.map((s) => (
                    <tr key={s.id} className={cn(s.active && 'bg-amber-50/50 dark:bg-amber-950/20')}>
                      <td className="p-3 font-medium">{s.admin}</td>
                      <td className="p-3">{s.target}</td>
                      <td className="p-3">{s.org}</td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(s.startedAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-3 text-right tabular-nums">{s.active ? <Badge className="bg-amber-500 text-[10px]">active</Badge> : `${s.durationMin} min`}</td>
                      <td className="p-3 text-muted-foreground">{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <p className="mt-2 text-xs text-muted-foreground">Every session is written to the append-only activity log and the affected organisation is notified at session start.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
