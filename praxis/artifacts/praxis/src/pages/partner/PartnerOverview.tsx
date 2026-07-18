import React from 'react';
import { useLocation } from 'wouter';
import { useSession } from '@/context/SessionContext';
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
import { getPartnerHub, financeRollup, fundersRollup, orgDetail, ZAR, type AuditCategory } from '@/lib/partnerHubData';

const catStyle: Record<AuditCategory, string> = {
  financial: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  funder: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  account: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  impersonation: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  branding: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
};

/**
 * Partner Platform Overview (spec §6). The single top-level dashboard for a Partner account:
 * aggregates the Financial Hub, the Funders Hub, and the unified activity log so the partner
 * sees the health of their whole tenant at a glance, then routes into each hub.
 */
export function PartnerOverview() {
  const { user } = useSession();
  const [, navigate] = useLocation();
  const h = getPartnerHub(user?.partnerId);
  const fin = financeRollup(h);
  const fun = fundersRollup(h);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner Hub"
        icon={LayoutDashboard}
        subtitle={`${h.partnerName} — your financial, funder, account and compliance controls in one place.`}
        action={<Badge variant="outline" className="gap-1.5"><Building className="h-3.5 w-3.5" /> {h.orgs.length} {h.orgs.length === 1 ? 'organisation' : 'organisations'}</Badge>}
      />

      {/* Quick jump bar — relocated from the bottom so the main-admin destinations are reachable up front */}
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

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Wallet} label="Monthly recurring (incl. VAT)" value={ZAR(fin.mrrGross)} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={Users} label={`Seats (${fin.activeSeats} active)`} value={fin.totalSeats} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={Landmark} label="Funded seats" value={fun.fundedSeats} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={Receipt} label="Outstanding invoices" value={ZAR(fin.outstanding)} tint={fin.overdue ? 'bg-red-500/10 text-red-600' : 'bg-muted text-muted-foreground'} />
      </div>

      {/* Attention strip */}
      {(fin.overdue > 0 || fun.expiring > 0) && (
        <Card className="p-4 border-amber-200 bg-amber-50/60 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold">Needs your attention</div>
              <div className="text-muted-foreground">
                {fin.overdue > 0 && <span>{fin.overdue} overdue invoice{fin.overdue > 1 ? 's' : ''}. </span>}
                {fun.expiring > 0 && <span>{fun.expiring} funding agreement{fun.expiring > 1 ? 's' : ''} expiring soon. </span>}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Financial snapshot */}
        <Card className="p-5">
          <SectionTitle action={<Button size="sm" variant="ghost" className="gap-1" onClick={() => navigate('/partner/finance')}>Open <ArrowRight className="h-3.5 w-3.5" /></Button>}>Financial Hub</SectionTitle>
          <div className="mt-3 space-y-2.5 text-sm">
            {h.subscriptions.map((s) => {
              const plan = h.plans.find((p) => p.id === s.planId);
              return (
                <div key={s.orgId} className="flex items-center justify-between gap-3">
                  <span className="truncate">{s.orgName}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-[10px]">{plan?.name}</Badge>
                    <span className="text-muted-foreground tabular-nums">{s.activeSeats}/{s.seats} seats</span>
                  </span>
                </div>
              );
            })}
            <div className="border-t border-border pt-2.5 flex items-center justify-between">
              <span className="text-muted-foreground">Received this cycle</span>
              <span className="font-semibold tabular-nums">{ZAR(fun.received)}</span>
            </div>
          </div>
        </Card>

        {/* Funders snapshot */}
        <Card className="p-5">
          <SectionTitle action={<Button size="sm" variant="ghost" className="gap-1" onClick={() => navigate('/partner/funders')}>Open <ArrowRight className="h-3.5 w-3.5" /></Button>}>Funders Hub</SectionTitle>
          <div className="mt-3 space-y-2.5 text-sm">
            {h.agreements.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3">
                <span className="truncate">{a.funder}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-muted-foreground tabular-nums">{a.seatsFunded} seats · {ZAR(a.value)}</span>
                  <Badge className={cn('text-[10px]', a.status === 'expiring' ? 'bg-amber-500' : a.status === 'pending' ? 'bg-muted text-muted-foreground' : 'bg-emerald-600')}>{a.status}</Badge>
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="p-5">
        <SectionTitle action={<Button size="sm" variant="ghost" className="gap-1" onClick={() => navigate('/partner/audit')}>Full log <ArrowRight className="h-3.5 w-3.5" /></Button>}>Recent activity</SectionTitle>
        <div className="mt-3 divide-y divide-border">
          {h.audit.slice(0, 5).map((e) => (
            <div key={e.id} className="flex items-start gap-3 py-2.5 text-sm">
              <span className={cn('rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide shrink-0', catStyle[e.category])}>{e.category}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{e.action.replace(/[._]/g, ' ')} <span className="text-muted-foreground font-normal">· {e.resource}</span></div>
                <div className="text-xs text-muted-foreground">{e.detail}</div>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{new Date(e.at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Organisations at a glance — org-by-org access, main-admin's map of the tenant */}
      <Card className="p-5">
        <SectionTitle action={<Button size="sm" variant="ghost" className="gap-1" onClick={() => navigate('/partner/organisations')}>Manage <ArrowRight className="h-3.5 w-3.5" /></Button>}>Organisations</SectionTitle>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          {h.orgs.map((o) => {
            const d = orgDetail(h, o.id);
            return (
              <button key={o.id} onClick={() => navigate(`/partner/org/${o.id}`)}
                className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/40 hover:bg-muted/40 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{o.name}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {d.plan && <span><Wallet className="inline h-3 w-3 mr-1" />{d.plan.name}</span>}
                  <span><Users className="inline h-3 w-3 mr-1" />{d.sub?.seats ?? 0} seats</span>
                  {d.delegated.length > 0 && <span><ShieldCheck className="inline h-3 w-3 mr-1" />{d.delegated.length} delegated admin{d.delegated.length > 1 ? 's' : ''}</span>}
                  {d.openInvoices > 0 && <span className="text-amber-600"><Receipt className="inline h-3 w-3 mr-1" />{d.openInvoices} open invoice{d.openInvoices > 1 ? 's' : ''}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
