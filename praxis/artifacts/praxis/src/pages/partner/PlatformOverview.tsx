import React, { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard, SectionTitle } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Building, Users, Landmark, Wallet, Receipt, Percent, ShieldCheck,
  ChevronRight, ChevronDown, BookOpen, ArrowRight, TrendingUp,
} from 'lucide-react';
import { platformOverview, setActivePartner, ZAR } from '@/lib/partnerHubData';
import { orgNameOverride, useOrgOverrides } from '@/lib/orgOverridesStore';

export function PlatformOverview() {
  const { user } = useSession();
  const [, navigate] = useLocation();
  useOrgOverrides(); // reflect org renames in the per-partner org lists
  const { partners, totals } = useMemo(() => platformOverview(), []);
  const [open, setOpen] = useState<Set<string>>(new Set(partners.map((p) => p.id)));

  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const enter = (id: string) => { setActivePartner(id); navigate('/partner'); };

  const agStatus = (s: string) => (s === 'active' ? 'bg-emerald-600' : s === 'expiring' ? 'bg-amber-500' : 'bg-muted text-muted-foreground');

  return (
    <div className="space-y-6">
      <PageHeader title="Partner Hub" icon={LayoutDashboard}
        subtitle={`${totals.partners} partners on the platform. Everything at a glance - open any partner to work inside their hub.`} />

      {/* Platform KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Building} label="Partners" value={totals.partners} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={Building} label="Organisations" value={totals.orgs} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={Users} label={`Seats (${totals.activeSeats} active)`} value={totals.seats} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={Landmark} label="Funders" value={totals.funders} tint="bg-blue-500/10 text-blue-600" />
      </div>

      {/* Overall platform financials */}
      <Card className="p-5">
        <SectionTitle>Platform financials</SectionTitle>
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Monthly recurring (incl. VAT)</div><div className="mt-1 text-xl font-bold tabular-nums">{ZAR(totals.mrrGross)}</div></div>
          <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground flex items-center gap-1"><Receipt className="h-3.5 w-3.5" /> Outstanding (incl. VAT)</div><div className={cn('mt-1 text-xl font-bold tabular-nums', totals.overdue && 'text-red-600')}>{ZAR(totals.outstanding)}</div></div>
          <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground flex items-center gap-1"><Landmark className="h-3.5 w-3.5" /> Funding value</div><div className="mt-1 text-xl font-bold tabular-nums">{ZAR(totals.funderValue)}</div></div>
          <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground flex items-center gap-1"><Percent className="h-3.5 w-3.5" /> VAT collected</div><div className="mt-1 text-xl font-bold tabular-nums">{ZAR(totals.vatCollected)}</div></div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">Aggregated across all partners. Funder received this cycle: {ZAR(totals.funderReceived)} · {totals.accounts} staff accounts · {totals.delegated} delegated admins.</div>
      </Card>

      {/* Per-partner breakdown */}
      <div>
        <SectionTitle>Partners</SectionTitle>
        <div className="mt-3 space-y-3">
          {partners.map((p) => {
            const isOpen = open.has(p.id);
            return (
              <Card key={p.id} className="overflow-hidden">
                {/* Partner header */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <button onClick={() => toggle(p.id)} className="flex items-center gap-2.5 min-w-0 text-left">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold shrink-0">{p.name.charAt(0)}</span>
                    <span className="font-semibold truncate">{p.name}</span>
                  </button>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span><Building className="inline h-3.5 w-3.5 mr-1" />{p.orgs.length} orgs</span>
                    <span><Users className="inline h-3.5 w-3.5 mr-1" />{p.totalSeats} seats</span>
                    <span><Landmark className="inline h-3.5 w-3.5 mr-1" />{p.fundersCount} funders</span>
                    <span className="hidden sm:inline"><Wallet className="inline h-3.5 w-3.5 mr-1" />{ZAR(p.mrrGross)}/mo</span>
                    <Button size="sm" className="gap-1.5" onClick={() => enter(p.id)}>Open hub <ArrowRight className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-border p-4 grid lg:grid-cols-3 gap-4 bg-muted/20">
                    {/* Organisations */}
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><Building className="h-3.5 w-3.5" /> Organisations</div>
                      <div className="space-y-1.5">
                        {p.orgs.map((o) => (
                          <button key={o.id} onClick={() => { setActivePartner(p.id); navigate(`/partner/org/${o.id}`); }}
                            className="w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-left hover:border-primary/40">
                            <span className="truncate">{orgNameOverride(o.id) ?? o.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{o.activeSeats}/{o.seats}</span>
                          </button>
                        ))}
                        {p.orgs.length === 0 && <div className="text-xs text-muted-foreground">No organisations.</div>}
                      </div>
                    </div>

                    {/* Funders */}
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" /> Funders</div>
                      <div className="space-y-1.5">
                        {p.funders.map((f) => (
                          <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                            <span className="truncate">{f.funder}</span>
                            <span className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-muted-foreground tabular-nums">{ZAR(f.value)}</span>
                              <Badge className={cn('text-[10px]', agStatus(f.status))}>{f.status}</Badge>
                            </span>
                          </div>
                        ))}
                        {p.funders.length === 0 && <div className="text-xs text-muted-foreground">No funders.</div>}
                      </div>
                    </div>

                    {/* Financial snapshot */}
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Financial hub</div>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"><span className="text-muted-foreground">Monthly (incl. VAT)</span><span className="font-medium tabular-nums">{ZAR(p.mrrGross)}</span></div>
                        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"><span className="text-muted-foreground">Outstanding</span><span className={cn('font-medium tabular-nums', p.overdue && 'text-amber-600')}>{ZAR(p.outstanding)}</span></div>
                        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"><span className="text-muted-foreground">Funding value</span><span className="font-medium tabular-nums">{ZAR(p.funderValue)}</span></div>
                        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"><span className="text-muted-foreground">Staff / delegated</span><span className="font-medium tabular-nums">{p.accounts} / {p.delegated}</span></div>
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
    </div>
  );
}
