import React from 'react';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Landmark, Users, ShieldCheck, ExternalLink, CheckCircle2 } from 'lucide-react';
import { getPartnerHub, fundersRollup, ZAR } from '@/lib/partnerHubData';

const agStatus = (s: string) =>
  s === 'active' ? 'bg-emerald-600' : s === 'expiring' ? 'bg-amber-500' : 'bg-muted text-muted-foreground';

/**
 * Funders Hub (spec §4). Funding agreements, funded-seat allocation, funder portal access and
 * grant-condition tracking (B-BBEE / SETA). SEEDED data; KYC/onboarding and the funder portal
 * itself are scaffolded here for review, not wired to external systems.
 */
export function PartnerFunders() {
  const { user } = useSession();
  const h = getPartnerHub(user?.partnerId);
  const fun = fundersRollup(h);

  return (
    <div className="space-y-6">
      <PageHeader title="Funders Hub" icon={Landmark} subtitle={`${h.partnerName} - funding agreements, seat allocation and grant conditions.`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Landmark} label="Active funders" value={fun.funders} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={Users} label="Funded seats" value={fun.fundedSeats} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={ShieldCheck} label="Agreement value" value={ZAR(fun.funderValue)} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={ExternalLink} label="Scheduled disbursement" value={ZAR(fun.scheduled)} tint="bg-blue-500/10 text-blue-600" />
      </div>

      <Tabs defaultValue="agreements">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="agreements">Funding Agreements</TabsTrigger>
          <TabsTrigger value="allocation">Seat Allocation</TabsTrigger>
          <TabsTrigger value="conditions">B-BBEE / SETA Conditions</TabsTrigger>
          <TabsTrigger value="portal">Funder Portal</TabsTrigger>
        </TabsList>

        {/* Funding Agreements & Terms */}
        <TabsContent value="agreements" className="mt-4 space-y-3">
          {h.agreements.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{a.funder}</span>
                    <Badge variant="outline" className="text-[10px]">{a.funderType}</Badge>
                    <Badge className={cn('text-[10px]', agStatus(a.status))}>{a.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {a.scopeOrgs.join(', ')} · {new Date(a.start).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })} – {new Date(a.expiry).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold tabular-nums">{ZAR(a.value)}</div>
                  <div className="text-xs text-muted-foreground">{a.seatsFunded} funded seats</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {a.conditions.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" /> {c}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </TabsContent>

        {/* Seat Allocation */}
        <TabsContent value="allocation" className="mt-4 space-y-3">
          {h.allocations.map((al) => {
            const pct = al.allocated > 0 ? Math.round((al.used / al.allocated) * 100) : 0;
            return (
              <Card key={al.id} className="p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <span className="font-medium">{al.funder}</span>
                    <span className="text-muted-foreground text-sm"> · {al.orgName}</span>
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">{al.used} / {al.allocated} seats used</span>
                </div>
                <Progress value={pct} className="h-2" />
                <div className="mt-1 text-xs text-muted-foreground">{al.allocated - al.used} funded seats still available to assign</div>
              </Card>
            );
          })}
          <p className="text-xs text-muted-foreground">Assigning a funded seat links a specific learner to a funder's grant, so completion evidence attributes back to the right agreement.</p>
        </TabsContent>

        {/* B-BBEE / SETA Conditions */}
        <TabsContent value="conditions" className="mt-4">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Funder</th><th className="text-left p-3">Condition</th><th className="text-left p-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {h.agreements.flatMap((a) => a.conditions.map((c, i) => (
                  <tr key={a.id + i}>
                    <td className="p-3 font-medium whitespace-nowrap">{a.funder}</td>
                    <td className="p-3">{c}</td>
                    <td className="p-3"><span className="inline-flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> On track</span></td>
                  </tr>
                )))}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">Grant-specific compliance (distinct from general platform compliance). Completion and outcome evidence is drawn from learner Progress data and rolls up into the SETA/QCTO reports.</p>
        </TabsContent>

        {/* Funder Portal */}
        <TabsContent value="portal" className="mt-4 space-y-3">
          <Card className="p-4 text-sm text-muted-foreground">
            Each funder gets a scoped, read-only dashboard showing only the seats and outcomes tied to their own agreement - never other funders' data or the partner's finances. Proposed default visibility (per the spec's Open Decisions): completion rates, credentials issued, and coaching hours for their funded seats; not individual learner PII.
          </Card>
          {Array.from(new Set(h.agreements.map((a) => a.funder))).map((f) => (
            <Card key={f} className="p-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{f}</div>
                <div className="text-xs text-muted-foreground">Scoped dashboard · outcomes for funded seats only</div>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5"><ExternalLink className="h-3.5 w-3.5" /> Portal link</Button>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
