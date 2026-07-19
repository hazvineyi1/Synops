import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { StatCard, SectionTitle } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Building, Users, Landmark, Wallet, Receipt, Percent, ShieldCheck,
  ChevronRight, ChevronDown, ArrowRight, TrendingUp, HeartPulse, GraduationCap,
  AlertTriangle, CheckCircle2, BellRing,
} from 'lucide-react';
import { setActivePartner, registerRealPartners, ZAR } from '@/lib/partnerHubData';
import { orgNameOverride, useOrgOverrides } from '@/lib/orgOverridesStore';

interface ApiPartner { id: string; name: string; slug: string; status: string; orgCount?: number; learnerCount?: number }
interface ApiOrg { id: string; name: string; partnerId: string | null; memberCount?: number }

const ALERT_SEV: Record<string, { ring: string; text: string }> = {
  warn: { ring: 'border-amber-300 bg-amber-50/70 dark:bg-amber-950/20', text: 'text-amber-600' },
  info: { ring: 'border-blue-200 bg-blue-50/60 dark:bg-blue-950/20', text: 'text-blue-600' },
  ok: { ring: 'border-border bg-muted/20', text: 'text-emerald-600' },
};

export function PlatformOverview() {
  const [, navigate] = useLocation();
  useOrgOverrides();

  const { data: partners, isLoading: pLoading } = useQuery({
    queryKey: ['partners'],
    queryFn: () => apiFetch<ApiPartner[]>('/partners'),
  });
  const { data: orgs } = useQuery({
    queryKey: ['organisations'],
    queryFn: () => apiFetch<ApiOrg[]>('/organisations'),
  });
  const { data: fin } = useQuery({
    queryKey: ['platform-financials'],
    queryFn: () => apiFetch<{ partners: { id: string; mrrGross: number; outstanding: number; funderValue: number; vatCollected: number }[]; totals: { mrrGross: number; outstanding: number; funderValue: number; vatCollected: number } }>('/platform/financials'),
  });
  const finTotals = fin?.totals ?? { mrrGross: 0, outstanding: 0, funderValue: 0, vatCollected: 0 };
  const finByPartner = new Map((fin?.partners ?? []).map((p) => [p.id, p]));
  const { data: alertData } = useQuery({
    queryKey: ['platform-alerts'],
    queryFn: () => apiFetch<{ alerts: { id: string; label: string; count: number; severity: string; detail: string }[]; health: { learners: number; activeEnrolments: number; engagementRate: number } }>('/platform/alerts'),
  });
  const alerts = alertData?.alerts ?? [];
  const openAlerts = alerts.filter((a) => a.count > 0);
  const alertHealth = alertData?.health ?? { learners: 0, activeEnrolments: 0, engagementRate: 0 };

  // Real partners drive getPartnerHub's empty-hub fallback, so opening one never shows demo data.
  useEffect(() => {
    if (partners) registerRealPartners(partners.map((p) => ({ id: p.id, name: p.name })));
  }, [partners]);

  const orgsByPartner = useMemo(() => {
    const m = new Map<string, ApiOrg[]>();
    for (const o of orgs ?? []) {
      if (!o.partnerId) continue;
      const arr = m.get(o.partnerId) ?? [];
      arr.push(o);
      m.set(o.partnerId, arr);
    }
    return m;
  }, [orgs]);

  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => { if (partners) setOpen(new Set(partners.map((p) => p.id))); }, [partners]);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const enter = (id: string) => { setActivePartner(id); navigate('/partner'); };

  const partnerCount = partners?.length ?? 0;
  const orgCount = orgs?.filter((o) => o.partnerId).length ?? 0;
  const learnerTotal = (partners ?? []).reduce((s, p) => s + (p.learnerCount ?? 0), 0);

  const statusChip = (s: string) =>
    s === 'active' ? 'bg-emerald-100 text-emerald-700' : s === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';

  return (
    <div className="space-y-6">
      <PageHeader title="Partner Hub" icon={LayoutDashboard}
        subtitle={`${partnerCount} partner${partnerCount === 1 ? '' : 's'} on the platform. Open any partner to work inside their hub.`} />

      {/* Real platform KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Building} label="Partners" value={partnerCount} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={Building} label="Organisations" value={orgCount} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={GraduationCap} label="Learners" value={learnerTotal} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={ShieldCheck} label="System" value={'Healthy'} tint="bg-blue-500/10 text-blue-600" />
      </div>

      {/* Attention needed — REAL alerts derived from live data */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <SectionTitle>Attention needed</SectionTitle>
          <Badge className={cn('gap-1', openAlerts.length ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>
            {openAlerts.length ? <><BellRing className="h-3 w-3" /> {openAlerts.length} to review</> : <><CheckCircle2 className="h-3 w-3" /> All clear</>}
          </Badge>
        </div>
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-5 gap-3">
          {alerts.map((a) => {
            const s = ALERT_SEV[a.severity] ?? ALERT_SEV.ok;
            return (
              <div key={a.id} className={cn('rounded-lg border p-3', s.ring)}>
                <div className="flex items-start justify-between gap-2">
                  <div className={cn('text-2xl font-bold tabular-nums', a.count ? s.text : 'text-muted-foreground')}>{a.count}</div>
                  {a.count > 0 ? <AlertTriangle className={cn('h-4 w-4', s.text)} /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                </div>
                <div className="mt-1 text-sm font-medium capitalize leading-tight">{a.label}</div>
                <div className="text-xs text-muted-foreground">{a.detail}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" /> {alertHealth.learners} learners</span>
          <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> {alertHealth.activeEnrolments} active enrolments</span>
        </div>
      </Card>

      {/* Per-partner breakdown (REAL) */}
      <div>
        <SectionTitle>Partners</SectionTitle>
        <div className="mt-3 space-y-3">
          {pLoading && <Card className="p-6 text-sm text-muted-foreground">Loading partners…</Card>}
          {!pLoading && partnerCount === 0 && (
            <Card className="p-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">No partners yet.</p>
              <Button size="sm" className="gap-1.5" onClick={() => navigate('/admin/partners')}>
                <Building className="h-3.5 w-3.5" /> Create your first partner
              </Button>
            </Card>
          )}
          {(partners ?? []).map((p) => {
            const isOpen = open.has(p.id);
            const pOrgs = orgsByPartner.get(p.id) ?? [];
            return (
              <Card key={p.id} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <button onClick={() => toggle(p.id)} className="flex items-center gap-2.5 min-w-0 text-left">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold shrink-0">{p.name.charAt(0)}</span>
                    <span className="font-semibold truncate">{p.name}</span>
                    <Badge className={cn('text-[10px] capitalize', statusChip(p.status))}>{p.status}</Badge>
                  </button>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span><Building className="inline h-3.5 w-3.5 mr-1" />{pOrgs.length || (p.orgCount ?? 0)} orgs</span>
                    <span><GraduationCap className="inline h-3.5 w-3.5 mr-1" />{p.learnerCount ?? 0} learners</span>
                    <span className="hidden sm:inline font-mono text-[11px]">{p.slug}</span>
                    <Button size="sm" className="gap-1.5" onClick={() => enter(p.id)}>Open hub <ArrowRight className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-border p-4 grid lg:grid-cols-3 gap-4 bg-muted/20">
                    {/* Organisations (REAL) */}
                    <div className="lg:col-span-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><Building className="h-3.5 w-3.5" /> Organisations</div>
                      <div className="grid sm:grid-cols-2 gap-1.5">
                        {pOrgs.map((o) => (
                          <button key={o.id} onClick={() => { setActivePartner(p.id); navigate(`/partner/org/${o.id}`); }}
                            className="w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-left hover:border-primary/40">
                            <span className="truncate">{orgNameOverride(o.id) ?? o.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{o.memberCount ?? 0} members</span>
                          </button>
                        ))}
                        {pOrgs.length === 0 && <div className="text-xs text-muted-foreground">No organisations yet.</div>}
                      </div>
                    </div>

                    {/* Commercials (REAL) */}
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Commercials</div>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"><span className="text-muted-foreground">Monthly (incl. VAT)</span><span className="font-medium tabular-nums">{ZAR(finByPartner.get(p.id)?.mrrGross ?? 0)}</span></div>
                        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"><span className="text-muted-foreground">Funding value</span><span className="font-medium tabular-nums">{ZAR(finByPartner.get(p.id)?.funderValue ?? 0)}</span></div>
                      </div>
                      <Button size="sm" variant="outline" className="mt-2 gap-1.5 w-full" onClick={() => { setActivePartner(p.id); navigate('/partner/finance'); }}><Wallet className="h-3.5 w-3.5" /> Open Financial Hub</Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Platform financials — REAL, aggregated across partners */}
      <Card className="p-5">
        <SectionTitle>Platform financials</SectionTitle>
        <p className="mt-1 text-xs text-muted-foreground">Aggregated live from every partner's subscriptions, invoices and funding agreements.</p>
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Monthly recurring</div><div className="mt-1 text-xl font-bold tabular-nums">{ZAR(finTotals.mrrGross)}</div></div>
          <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground flex items-center gap-1"><Receipt className="h-3.5 w-3.5" /> Outstanding</div><div className="mt-1 text-xl font-bold tabular-nums">{ZAR(finTotals.outstanding)}</div></div>
          <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground flex items-center gap-1"><Landmark className="h-3.5 w-3.5" /> Funding value</div><div className="mt-1 text-xl font-bold tabular-nums">{ZAR(finTotals.funderValue)}</div></div>
          <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground flex items-center gap-1"><Percent className="h-3.5 w-3.5" /> VAT collected</div><div className="mt-1 text-xl font-bold tabular-nums">{ZAR(finTotals.vatCollected)}</div></div>
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <HeartPulse className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Learner engagement <span className="font-semibold text-foreground">{alertHealth.engagementRate}%</span> <span className="text-muted-foreground">({alertHealth.activeEnrolments} of {alertHealth.learners} learners active)</span></span>
        </div>
      </Card>
    </div>
  );
}
