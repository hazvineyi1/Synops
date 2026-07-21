import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Activity, AlertTriangle, LifeBuoy, CheckCircle2, Users, UserCog, ArrowRight, Mail, Loader2 } from 'lucide-react';

interface CoachRow { coachId: string; name: string; sectionsLed: number; learners: number; flagged: number; resolved: number }
interface Health {
  summary: { flaggedLearners: number; offTrack: number; atRisk: number; unassignedFlagged: number; activeInterventions: number; resolvedTotal: number; resolutionRate: number | null; coaches: number; courses: number };
  coaches: CoachRow[];
}

export function CoachingHealth() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<Health>({ queryKey: ['coaching-health'], queryFn: () => apiFetch<Health>('/coaching/health') });
  const digest = useMutation({
    mutationFn: () => apiFetch<{ sent: boolean; configured: boolean; to?: string; message?: string }>('/coaching/health/digest', { method: 'POST', body: '{}' }),
    onSuccess: (r) => {
      if (!r.configured) toast({ title: 'Email not configured', description: r.message ?? 'Set up email delivery to send digests.', variant: 'destructive' });
      else if (r.sent) toast({ title: 'Digest sent', description: `Emailed to ${r.to}.` });
      else toast({ title: 'Could not send', variant: 'destructive' });
    },
    onError: () => toast({ title: 'Could not send the digest', variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-serif font-bold tracking-tight flex items-center gap-3"><Activity className="h-8 w-8 text-primary" /> Coaching health</h1>
          <p className="text-muted-foreground">How your coaches are keeping learners on track — who's flagged, who's slipping through, and how quickly interventions get resolved.</p>
        </div>
        <Button variant="outline" className="shrink-0" disabled={digest.isPending} onClick={() => digest.mutate()}>
          {digest.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />} Email me this summary
        </Button>
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Flagged learners" value={data.summary.flaggedLearners} sub={`${data.summary.offTrack} off track · ${data.summary.atRisk} at risk`} icon={<AlertTriangle className="h-4 w-4" />} tone={data.summary.flaggedLearners ? 'amber' : undefined} />
            <Kpi label="Flagged & unassigned" value={data.summary.unassignedFlagged} sub="no coach yet" icon={<LifeBuoy className="h-4 w-4" />} tone={data.summary.unassignedFlagged ? 'red' : 'green'} />
            <Kpi label="Resolution rate" value={data.summary.resolutionRate == null ? '—' : `${data.summary.resolutionRate}%`} sub={`${data.summary.resolvedTotal} resolved`} icon={<CheckCircle2 className="h-4 w-4" />} tone="green" />
            <Kpi label={data.summary.coaches === 1 ? 'Coach' : 'Coaches'} value={data.summary.coaches} sub={`${data.summary.courses} course${data.summary.courses === 1 ? '' : 's'}`} icon={<UserCog className="h-4 w-4" />} />
          </div>

          {data.summary.unassignedFlagged > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
              <div className="flex items-start gap-2 text-sm text-red-900">
                <LifeBuoy className="h-5 w-5 mt-0.5 shrink-0 text-red-600" />
                <span><span className="font-bold">{data.summary.unassignedFlagged}</span> flagged learner{data.summary.unassignedFlagged === 1 ? ' is' : 's are'} slipping through with no coach assigned. Match them to a coach so someone owns the intervention.</span>
              </div>
              <Link href="/coaching/sections"><Button className="shrink-0">Assign now <ArrowRight className="h-4 w-4 ml-1.5" /></Button></Link>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-lg font-bold flex items-center gap-2"><Users className="h-5 w-5" /> Coaches</h2>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground uppercase tracking-wider text-xs">
                      <tr>
                        <th className="px-6 py-3 font-medium">Coach</th>
                        <th className="px-6 py-3 font-medium text-center">Sections</th>
                        <th className="px-6 py-3 font-medium text-center">Learners</th>
                        <th className="px-6 py-3 font-medium text-center">Flagged now</th>
                        <th className="px-6 py-3 font-medium text-center">Resolved</th>
                        <th className="px-6 py-3 font-medium">Load</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y border-t border-border">
                      {data.coaches.map((c) => {
                        const loadPct = c.learners ? Math.min(100, Math.round((c.flagged / c.learners) * 100)) : 0;
                        return (
                          <tr key={c.coachId} className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-3 font-medium text-foreground">{c.name}</td>
                            <td className="px-6 py-3 text-center text-muted-foreground">{c.sectionsLed}</td>
                            <td className="px-6 py-3 text-center text-muted-foreground">{c.learners}</td>
                            <td className="px-6 py-3 text-center">
                              {c.flagged > 0 ? <span className="font-bold text-red-600">{c.flagged}</span> : <span className="text-muted-foreground">0</span>}
                            </td>
                            <td className="px-6 py-3 text-center text-muted-foreground">{c.resolved}</td>
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-28 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div className={`h-full ${loadPct > 50 ? 'bg-red-500' : loadPct > 20 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${loadPct}%` }} />
                                </div>
                                <span className="text-xs text-muted-foreground">{loadPct}% flagged</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {data.coaches.length === 0 && (
                        <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No coaches lead a section yet. <Link href="/coaching/sections" className="text-primary hover:underline">Set up sections</Link>.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, icon, tone }: { label: string; value: React.ReactNode; sub?: string; icon: React.ReactNode; tone?: 'amber' | 'red' | 'green' }) {
  const toneCls = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : tone === 'green' ? 'text-green-600' : 'text-foreground';
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{icon}{label}</div>
        <p className={`text-2xl font-bold ${toneCls}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
