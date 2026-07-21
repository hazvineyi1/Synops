import React, { useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/context/SessionContext';
import { apiFetch } from '@/lib/api';
import { useBrandTheme } from '@/context/ThemeProvider';
import { PageHeader } from '@/components/PageHeader';
import { StatCard, SectionTitle } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Wallet, Landmark, Users, ArrowRight, AlertTriangle,
  Building, ShieldCheck, Receipt, FileText, ChevronRight,
} from 'lucide-react';
import { ZAR, getActivePartnerId } from '@/lib/partnerHubData';

const VAT = 0.15;
type OrgRow = { id: string; name: string };
type Sub = { orgId?: string | null; planName?: string; seats?: number; activeSeats?: number; pricePerSeat?: number };
type Invoice = { orgId?: string | null; status?: string; net?: number };
type Funding = { orgId?: string | null; funderName?: string; seatsFunded?: number; value?: number; status?: string; expiry?: string | null };
type Delegate = { orgId?: string | null };

/**
 * Partner Platform Overview — the top-level dashboard for a Partner account. REAL data: aggregates
 * the same partner-scoped endpoints the Financial/Funders/Organisations hubs use (/organisations,
 * /partners/:id/billing, /funding, /delegated-admins). Replaces the old partnerHubData mock, which
 * rendered the fabricated TalentForge/MTN/Vodacom tenant here.
 */
export function PartnerOverview() {
  const { user } = useSession();
  const [, navigate] = useLocation();
  const { data: brand } = useBrandTheme();
  const partnerId = user?.partnerId ?? getActivePartnerId() ?? '';
  const partnerName = brand?.displayName || 'Your organisation';

  const { data: orgs = [] } = useQuery({ queryKey: ['organisations'], queryFn: () => apiFetch<OrgRow[]>('/organisations') });
  const { data: billing } = useQuery({ queryKey: ['partner-billing', partnerId], queryFn: () => apiFetch<{ subscriptions: Sub[]; invoices: Invoice[] }>(`/partners/${partnerId}/billing`), enabled: !!partnerId });
  const { data: funding = [] } = useQuery({ queryKey: ['partner-funding', partnerId], queryFn: () => apiFetch<Funding[]>(`/partners/${partnerId}/funding`), enabled: !!partnerId });
  const { data: delegated = [] } = useQuery({ queryKey: ['partner-delegated', partnerId], queryFn: () => apiFetch<Delegate[]>(`/partners/${partnerId}/delegated-admins`), enabled: !!partnerId });

  const subs = billing?.subscriptions ?? [];
  const invoices = billing?.invoices ?? [];

  const fin = useMemo(() => {
    const mrrNet = subs.reduce((a, s) => a + (s.pricePerSeat ?? 0) * (s.seats ?? 0), 0);
    const totalSeats = subs.reduce((a, s) => a + (s.seats ?? 0), 0);
    const activeSeats = subs.reduce((a, s) => a + (s.activeSeats ?? 0), 0);
    const open = invoices.filter((i) => (i.status ?? 'due') !== 'paid');
    const outstandingNet = open.reduce((a, i) => a + (i.net ?? 0), 0);
    const receivedNet = invoices.filter((i) => i.status === 'paid').reduce((a, i) => a + (i.net ?? 0), 0);
    return {
      mrrGross: Math.round(mrrNet * (1 + VAT)), totalSeats, activeSeats,
      outstanding: Math.round(outstandingNet * (1 + VAT)), overdue: open.length,
      received: Math.round(receivedNet * (1 + VAT)),
    };
  }, [subs, invoices]);

  const soon = Date.now() + 60 * 86400000;
  const fun = useMemo(() => ({
    fundedSeats: funding.reduce((a, f) => a + (f.seatsFunded ?? 0), 0),
    expiring: funding.filter((f) => f.status === 'expired' || (f.expiry && Date.parse(f.expiry) <= soon)).length,
  }), [funding]);

  const perOrg = (orgId: string) => {
    const sub = subs.find((s) => s.orgId === orgId) ?? null;
    return {
      plan: sub?.planName ?? null,
      seats: sub?.seats ?? 0,
      delegated: delegated.filter((d) => d.orgId === orgId).length,
      openInvoices: invoices.filter((i) => i.orgId === orgId && (i.status ?? 'due') !== 'paid').length,
    };
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner Hub"
        icon={LayoutDashboard}
        subtitle={`${partnerName} - your financial, funder, account and compliance controls in one place.`}
        action={<Badge variant="outline" className="gap-1.5"><Building className="h-3.5 w-3.5" /> {orgs.length} {orgs.length === 1 ? 'organisation' : 'organisations'}</Badge>}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: 'Organisations', icon: Building, href: '/partner/organisations' },
          { label: 'Financial Hub', icon: Wallet, href: '/partner/finance' },
          { label: 'Funders Hub', icon: Landmark, href: '/partner/funders' },
          { label: 'Documents', icon: FileText, href: '/partner/documents' },
          { label: 'Accounts & Roles', icon: Users, href: '/partner/accounts' },
          { label: 'Audit', icon: ShieldCheck, href: '/partner/audit' },
        ].map((q) => (
          <button key={q.href} onClick={() => navigate(q.href)}
            className="rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:border-primary/40 hover:bg-muted/40 transition-colors flex items-center gap-2.5">
            <q.icon className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs font-medium truncate">{q.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Wallet} label="Monthly recurring (incl. VAT)" value={ZAR(fin.mrrGross)} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={Users} label={`Seats (${fin.activeSeats} active)`} value={fin.totalSeats} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={Landmark} label="Funded seats" value={fun.fundedSeats} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={Receipt} label="Outstanding invoices" value={ZAR(fin.outstanding)} tint={fin.overdue ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'} />
      </div>

      {(fin.overdue > 0 || fun.expiring > 0) && (
        <Card className="p-4 border-amber-200 bg-amber-50/60 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold">Needs your attention</div>
              <div className="text-muted-foreground">
                {fin.overdue > 0 && <span>{fin.overdue} open invoice{fin.overdue > 1 ? 's' : ''}. </span>}
                {fun.expiring > 0 && <span>{fun.expiring} funding agreement{fun.expiring > 1 ? 's' : ''} expiring soon. </span>}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <SectionTitle action={<Button size="sm" variant="ghost" className="gap-1" onClick={() => navigate('/partner/organisations')}>Manage <ArrowRight className="h-3.5 w-3.5" /></Button>}>Organisations</SectionTitle>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          {orgs.map((o) => {
            const d = perOrg(o.id);
            return (
              <button key={o.id} onClick={() => navigate(`/partner/org/${o.id}`)}
                className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/40 hover:bg-muted/40 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{o.name}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {d.plan && <span><Wallet className="inline h-3 w-3 mr-1" />{d.plan}</span>}
                  <span><Users className="inline h-3 w-3 mr-1" />{d.seats} seats</span>
                  {d.delegated > 0 && <span><ShieldCheck className="inline h-3 w-3 mr-1" />{d.delegated} delegated admin{d.delegated > 1 ? 's' : ''}</span>}
                  {d.openInvoices > 0 && <span className="text-amber-600"><Receipt className="inline h-3 w-3 mr-1" />{d.openInvoices} open invoice{d.openInvoices > 1 ? 's' : ''}</span>}
                </div>
              </button>
            );
          })}
          {orgs.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground sm:col-span-2 border-dashed">No organisations yet.</Card>}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <SectionTitle action={<Button size="sm" variant="ghost" className="gap-1" onClick={() => navigate('/partner/finance')}>Open <ArrowRight className="h-3.5 w-3.5" /></Button>}>Financial Hub</SectionTitle>
          <div className="mt-3 space-y-2.5 text-sm">
            {subs.map((s, i) => (
              <div key={s.orgId ?? i} className="flex items-center justify-between gap-3">
                <span className="truncate">{orgs.find((o) => o.id === s.orgId)?.name ?? 'Organisation'}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {s.planName && <Badge variant="secondary" className="text-[10px]">{s.planName}</Badge>}
                  <span className="text-muted-foreground tabular-nums">{s.activeSeats ?? 0}/{s.seats ?? 0} seats</span>
                </span>
              </div>
            ))}
            {subs.length === 0 && <div className="text-muted-foreground">No subscriptions yet.</div>}
            <div className="border-t border-border pt-2.5 flex items-center justify-between">
              <span className="text-muted-foreground">Received (paid, incl. VAT)</span>
              <span className="font-semibold tabular-nums">{ZAR(fin.received)}</span>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle action={<Button size="sm" variant="ghost" className="gap-1" onClick={() => navigate('/partner/funders')}>Open <ArrowRight className="h-3.5 w-3.5" /></Button>}>Funders Hub</SectionTitle>
          <div className="mt-3 space-y-2.5 text-sm">
            {funding.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="truncate">{a.funderName}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-muted-foreground tabular-nums">{a.seatsFunded ?? 0} seats · {ZAR(a.value ?? 0)}</span>
                  <Badge className={cn('text-[10px]', a.status === 'expired' ? 'bg-amber-500' : 'bg-emerald-600')}>{a.status ?? 'active'}</Badge>
                </span>
              </div>
            ))}
            {funding.length === 0 && <div className="text-muted-foreground">No funding agreements yet.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
