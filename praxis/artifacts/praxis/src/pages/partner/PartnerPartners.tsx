import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Building, Users, Landmark, ShieldCheck, ChevronRight, Wallet, Lock, CheckCircle2 } from 'lucide-react';
import { allPartners, setActivePartner, getActivePartnerId, ZAR } from '@/lib/partnerHubData';

/**
 * Partners (super-admin). Every partner on the platform. Selecting one makes it the active partner
 * so the whole Partner Hub - Overview, Organisations, Financial Hub, Funders, Accounts, Audit and
 * every org/class beneath - resolves to that partner, giving full access to its dependencies.
 */
export function PartnerPartners() {
  const { user } = useSession();
  const [, navigate] = useLocation();
  const partners = allPartners();
  const [activeId, setActiveId] = useState<string | null>(getActivePartnerId());

  const isSuper = user?.role === 'super_admin';

  const open = (id: string) => {
    setActivePartner(id);
    setActiveId(id);
    navigate('/partner');
  };

  if (!isSuper) {
    return (
      <div className="space-y-4">
        <PageHeader title="Partners" icon={Building} subtitle="Every partner on the platform." />
        <Card className="p-6 flex items-start gap-3 text-sm">
          <Lock className="h-5 w-5 text-primary shrink-0" />
          <div className="text-muted-foreground">Only the platform super admin can view and switch between partners. As a partner admin you already have full access to your own partner across the hub.</div>
        </Card>
      </div>
    );
  }

  const totals = partners.reduce((t, p) => ({ orgs: t.orgs + p.orgs, seats: t.seats + p.seats, value: t.value + p.agreementValue }), { orgs: 0, seats: 0, value: 0 });

  return (
    <div className="space-y-6">
      <PageHeader title="Partners" icon={Building} subtitle={`${partners.length} partners on the platform. Open one to work inside its Partner Hub with full access.`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Building} label="Partners" value={partners.length} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={Building} label="Organisations" value={totals.orgs} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={Users} label="Total seats" value={totals.seats} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={Landmark} label="Funding value" value={ZAR(totals.value)} tint="bg-blue-500/10 text-blue-600" />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {partners.map((p) => {
          const active = activeId === p.id;
          return (
            <button key={p.id} onClick={() => open(p.id)}
              className={cn('rounded-xl border bg-card p-5 text-left transition-colors', active ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-primary/40 hover:bg-muted/30')}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold shrink-0">{p.name.charAt(0)}</span>
                  <div className="min-w-0">
                    <div className="font-semibold truncate flex items-center gap-2">{p.name} {active && <Badge className="bg-emerald-600 text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" /> Active</Badge>}</div>
                    <div className="text-xs text-muted-foreground">{p.id}</div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Building className="h-3.5 w-3.5" />{p.orgs} organisation{p.orgs === 1 ? '' : 's'}</span>
                <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{p.seats} seats</span>
                <span className="flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" />{p.funders} funder{p.funders === 1 ? '' : 's'}</span>
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />{p.delegated} delegated</span>
                <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{p.accounts} staff accounts</span>
                <span className="flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" />{ZAR(p.agreementValue)} funded</span>
              </div>
              <div className="mt-3 text-xs font-medium text-primary">{active ? 'Currently viewing - open hub' : 'Open partner hub'} -&gt;</div>
            </button>
          );
        })}
      </div>

      <Card className="p-4 flex items-start gap-3 text-sm border-dashed">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="text-muted-foreground">Opening a partner sets it as the active partner: the Overview, Organisations, Financial Hub, Funders, Documents, Accounts, Communications and Audit - and every organisation and class beneath - all resolve to that partner. Return here any time to switch.</div>
      </Card>
    </div>
  );
}
