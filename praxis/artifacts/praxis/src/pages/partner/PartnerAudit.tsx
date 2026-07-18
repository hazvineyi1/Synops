import React, { useMemo, useState } from 'react';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ScrollText, ShieldCheck, Clock, Bell, Lock } from 'lucide-react';
import { getPartnerHub, type AuditCategory } from '@/lib/partnerHubData';

const CATS: (AuditCategory | 'all')[] = ['all', 'account', 'financial', 'funder', 'impersonation', 'branding'];
const catStyle: Record<AuditCategory, string> = {
  financial: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  funder: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  account: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  impersonation: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  branding: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
};

/**
 * Audit Log & Impersonation Controls (spec §6). One immutable log for every admin and
 * financial action across the Partner Hub, with filtered views per category and stricter
 * retention on financial entries. Impersonation is time-boxed, auto-logged here, and the
 * affected organisation is notified at session start.
 */
export function PartnerAudit() {
  const { user } = useSession();
  const h = getPartnerHub(user?.partnerId);
  const [cat, setCat] = useState<(AuditCategory | 'all')>('all');

  const rows = useMemo(
    () => (cat === 'all' ? h.audit : h.audit.filter((e) => e.category === cat)),
    [cat, h.audit],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Audit & Impersonation" icon={ShieldCheck} subtitle={`${h.partnerName} — one immutable log for all admin and financial actions, plus impersonation controls.`} />

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
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Lock className="h-3 w-3" /> Financial entries carry stricter retention and cannot be deleted. The log is append-only.</p>
        </TabsContent>

        {/* Impersonation controls */}
        <TabsContent value="impersonation" className="mt-4 space-y-4">
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
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recent impersonation sessions</div>
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="text-left p-3">Admin</th><th className="text-left p-3">Impersonated</th><th className="text-left p-3">Organisation</th><th className="text-left p-3">Started</th><th className="text-right p-3">Duration</th><th className="text-left p-3">Reason</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {h.impersonations.map((s) => (
                    <tr key={s.id}>
                      <td className="p-3 font-medium">{s.admin}</td>
                      <td className="p-3">{s.target}</td>
                      <td className="p-3">{s.org}</td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(s.startedAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-3 text-right tabular-nums">{s.durationMin} min</td>
                      <td className="p-3 text-muted-foreground">{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <p className="mt-2 text-xs text-muted-foreground">Starting impersonation is done from the platform user directory; controls and history are surfaced here so a Partner can audit their team's use of it.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
