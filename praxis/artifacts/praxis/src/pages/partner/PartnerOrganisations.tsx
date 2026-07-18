import React from 'react';
import { useLocation } from 'wouter';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Building, ChevronRight, Wallet, Users, Landmark, Receipt, ShieldCheck, GraduationCap, Mail,
} from 'lucide-react';
import { getPartnerHub, orgDetail, financeRollup, ZAR } from '@/lib/partnerHubData';

/**
 * Organisations (selector). The Main-Admin's list of every organisation under the partner. Picking
 * one steps fully INTO that organisation's own hub (/partner/org/:id) — its own sidebar, its own
 * delivery, people, funding, documents and billing — where nothing partner-wide is reachable. This
 * page and the Partner Overview are the only surfaces that sit above the organisations.
 */
export function PartnerOrganisations() {
  const { user } = useSession();
  const [, navigate] = useLocation();
  const h = getPartnerHub(user?.partnerId);
  const fin = financeRollup(h);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organisations"
        icon={Building}
        subtitle={`${h.partnerName} — ${h.orgs.length} organisation${h.orgs.length === 1 ? '' : 's'}. Open one to work inside it.`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Building} label="Organisations" value={h.orgs.length} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={Users} label="Total seats" value={fin.totalSeats} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={ShieldCheck} label="Delegated admins" value={h.delegatedAdmins.length} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={Receipt} label="Outstanding" value={ZAR(fin.outstanding)} tint={fin.overdue ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {h.orgs.map((o) => {
          const d = orgDetail(h, o.id);
          return (
            <button key={o.id} onClick={() => navigate(`/partner/org/${o.id}`)}
              className="rounded-xl border border-border bg-card p-5 text-left hover:border-primary/40 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0"><Building className="h-5 w-5" /></span>
                  <span className="font-semibold truncate">{o.name}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" />{d.plan?.name ?? 'No plan'}</span>
                <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{d.sub ? `${d.sub.activeSeats}/${d.sub.seats} seats` : '—'}</span>
                <span className="flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" />{d.funders.length} funder{d.funders.length === 1 ? '' : 's'}</span>
                <span className="flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5" />{d.coaches.length} coach{d.coaches.length === 1 ? '' : 'es'}</span>
                {d.delegated.length > 0 && <span className="flex items-center gap-1.5 text-violet-600"><ShieldCheck className="h-3.5 w-3.5" />{d.delegated.length} delegated</span>}
                {d.openInvoices > 0 && <span className="flex items-center gap-1.5 text-amber-600"><Receipt className="h-3.5 w-3.5" />{d.openInvoices} open invoice{d.openInvoices === 1 ? '' : 's'}</span>}
              </div>
              <div className={cn('mt-3 text-xs font-medium text-primary')}>Open organisation →</div>
            </button>
          );
        })}
      </div>

      <Card className="p-4 flex items-start gap-3 text-sm border-dashed">
        <Mail className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="text-muted-foreground">New organisations are onboarded by the Synops engagement team during setup. To add one, raise a request from Support and it will appear here once provisioned.</div>
      </Card>
    </div>
  );
}
