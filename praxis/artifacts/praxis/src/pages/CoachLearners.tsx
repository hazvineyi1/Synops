import React from 'react';
import { useListCoachLearners, useGetLearnerPresession } from '@workspace/api-client-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { FileText, AlertCircle, Activity, Award, AlertTriangle, Sparkles, Send, Plus, CheckCircle2, Circle, Loader2, LifeBuoy } from 'lucide-react';
import { Link } from 'wouter';

interface PlanItem { kind: string; title: string; why: string; category: string | null; done: boolean; }
interface CoachAssist { summary: string; talkingPoints: string[]; sessionFocus: string; suggestedMessage: string; }
interface Intervention {
  alertId: string; courseId: string; courseTitle: string; userId: string;
  learnerName: string; learnerEmail: string | null;
  status: 'off_track' | 'at_risk' | 'on_track';
  reasons: string[]; masteryPct: number | null;
  plan: { planId: string; rationale: string | null; items: PlanItem[]; done: number; total: number } | null;
  coachNote: string | null; coachAssist: CoachAssist | null; coachAssistAt: string | null;
  resolvedAt: string | null; updatedAt: string;
}

export function CoachLearners() {
  const { data: learners, isLoading } = useListCoachLearners();

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-serif font-bold tracking-tight">My Learners</h1>
        <p className="text-muted-foreground">Monitor readiness scores and intervene when competency gaps emerge.</p>
      </div>

      <InterventionsSection />

      <h2 className="text-lg font-bold pt-2">All learners</h2>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-6 py-4 font-medium">Learner</th>
                  <th className="px-6 py-4 font-medium">Readiness Score</th>
                  <th className="px-6 py-4 font-medium">Top Gaps</th>
                  <th className="px-6 py-4 font-medium">Last Activity</th>
                  <th className="px-6 py-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y border-t border-border">
                {isLoading && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading learners...</td></tr>
                )}
                {learners?.map(learner => (
                  <tr key={learner.userId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {(learner.firstName?.[0] || '') + (learner.lastName?.[0] || '') || learner.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-foreground">{learner.firstName} {learner.lastName}</p>
                          <p className="text-xs text-muted-foreground">{learner.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="w-32 space-y-1.5">
                        <div className="flex justify-between text-xs font-medium">
                          <span className={learner.readinessScore < 0.6 ? 'text-destructive' : 'text-foreground'}>
                            {Math.round(learner.readinessScore * 100)}%
                          </span>
                        </div>
                        <Progress 
                          value={learner.readinessScore * 100} 
                          className="h-1.5" 
                          indicatorClassName={learner.readinessScore < 0.6 ? 'bg-destructive' : 'bg-primary'}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {learner.topGaps?.slice(0, 2).map((gap, i) => (
                          <Badge key={i} variant="outline" className="bg-destructive/5 text-destructive border-destructive/20 text-[10px]">
                            {gap}
                          </Badge>
                        ))}
                        {(!learner.topGaps || learner.topGaps.length === 0) && (
                          <span className="text-xs text-muted-foreground">None identified</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {learner.lastActivityAt ? new Date(learner.lastActivityAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <PreSessionDialog userId={learner.userId} name={`${learner.firstName} ${learner.lastName}`} />
                    </td>
                  </tr>
                ))}
                {learners?.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No learners assigned to you.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreSessionDialog({ userId, name }: { userId: string, name: string }) {
  // Query only runs when dialog opens
  const [open, setOpen] = React.useState(false);
  const { data: brief, isLoading } = useGetLearnerPresession(userId, { query: { enabled: open, queryKey: ['presession', userId] } });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">Pre-session Brief</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Coaching Brief: {name}</DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Generating brief...</div>
        ) : brief ? (
          <div className="space-y-6 pt-4">
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 rounded-xl p-4">
                <h4 className="font-semibold text-green-800 dark:text-green-400 mb-2 flex items-center gap-2 text-sm uppercase tracking-wider">
                  <Award className="h-4 w-4" /> Demonstrated Strengths
                </h4>
                <ul className="space-y-1 text-sm">
                  {brief.strengths.map((s, i) => <li key={i}>• {s}</li>)}
                  {brief.strengths.length === 0 && <li className="text-muted-foreground italic">Insufficient data</li>}
                </ul>
              </div>
              
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-xl p-4">
                <h4 className="font-semibold text-red-800 dark:text-red-400 mb-2 flex items-center gap-2 text-sm uppercase tracking-wider">
                  <AlertCircle className="h-4 w-4" /> Competency Gaps
                </h4>
                <ul className="space-y-1 text-sm">
                  {brief.gaps.map((g, i) => <li key={i}>• {g}</li>)}
                  {brief.gaps.length === 0 && <li className="text-muted-foreground italic">No major gaps identified</li>}
                </ul>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" /> Recent Activity
              </h4>
              <div className="space-y-3 pl-2 border-l-2 border-border ml-2">
                {brief.recentActivity.slice(0, 3).map(act => (
                  <div key={act.id} className="relative pl-4">
                    <div className="absolute w-2 h-2 rounded-full bg-primary -left-[5px] top-1.5 ring-4 ring-background" />
                    <p className="text-sm font-medium">{act.description}</p>
                    <p className="text-xs text-muted-foreground">{new Date(act.createdAt).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </div>

            {brief.pendingWork.length > 0 && (
              <div className="bg-muted rounded-xl p-4">
                <h4 className="font-semibold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Work Pending Review
                </h4>
                <div className="space-y-2">
                  {brief.pendingWork.map(work => (
                    <div key={work.id} className="flex justify-between items-center bg-background p-3 rounded-lg border border-border">
                      <div>
                        <p className="font-medium text-sm">{work.title}</p>
                        <p className="text-xs text-muted-foreground">{work.moduleTitle}</p>
                      </div>
                      <Link href="/coach/submissions">
                        <Button size="sm" variant="outline">Review</Button>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 flex justify-end gap-2">
              <Button onClick={() => setOpen(false)}>Close Brief</Button>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-muted-foreground">Brief unavailable.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const STATUS_STYLE: Record<string, string> = {
  off_track: 'text-red-700 bg-red-50 border-red-200',
  at_risk: 'text-amber-700 bg-amber-50 border-amber-200',
  on_track: 'text-green-700 bg-green-50 border-green-200',
};
const STATUS_LABEL: Record<string, string> = { off_track: 'Off track', at_risk: 'At risk', on_track: 'On track' };

/** The heart of the coach: learners the system has flagged, with their adaptive plan to work. */
function InterventionsSection() {
  const { data: items, isLoading } = useQuery<Intervention[]>({
    queryKey: ['coach-interventions'],
    queryFn: () => apiFetch<Intervention[]>('/coach/interventions'),
  });

  if (isLoading) return <Skeletonish />;
  if (!items || items.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3 opacity-70" />
          <h3 className="font-serif font-bold text-lg">Nobody needs intervention right now</h3>
          <p className="text-muted-foreground text-sm mt-1">When a learner falls behind, they'll appear here with a ready-made plan to work through together.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <LifeBuoy className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Needs your attention</h2>
        <Badge variant="outline" className="ml-1">{items.length}</Badge>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {items.map((iv) => <InterventionCard key={iv.alertId} iv={iv} />)}
      </div>
    </div>
  );
}

function Skeletonish() {
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{[1, 2].map(i => <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />)}</div>;
}

function InterventionCard({ iv }: { iv: Intervention }) {
  const [open, setOpen] = React.useState(false);
  const pct = iv.plan && iv.plan.total ? Math.round((iv.plan.done / iv.plan.total) * 100) : 0;
  return (
    <Card className="border-0 shadow-md">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold">{iv.learnerName}</p>
            <p className="text-xs text-muted-foreground">{iv.courseTitle}</p>
          </div>
          <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${STATUS_STYLE[iv.status]}`}>
            {STATUS_LABEL[iv.status]}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {iv.reasons.map((r, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">{r}</span>
          ))}
          {iv.masteryPct != null && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">Mastery {Math.round(iv.masteryPct)}%</span>
          )}
        </div>
        {iv.plan && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground"><span>Plan progress</span><span>{iv.plan.done}/{iv.plan.total}</span></div>
            <Progress value={pct} className="h-1.5" />
          </div>
        )}
        <Button className="w-full" onClick={() => setOpen(true)}>
          <LifeBuoy className="h-4 w-4 mr-2" /> Open intervention
        </Button>
      </CardContent>
      {open && <InterventionDialog iv={iv} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function InterventionDialog({ iv, onClose }: { iv: Intervention; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [note, setNote] = React.useState(iv.coachNote ?? '');
  const [nudge, setNudge] = React.useState('');
  const [stepTitle, setStepTitle] = React.useState('');
  const [assist, setAssist] = React.useState<CoachAssist | null>(iv.coachAssist);
  const [assisting, setAssisting] = React.useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['coach-interventions'] });
  const base = `/coach/interventions/${iv.alertId}`;

  const toggleStep = useMutation({
    mutationFn: (index: number) => apiFetch(`${base}/plan/toggle`, { method: 'POST', body: JSON.stringify({ index, done: !iv.plan!.items[index].done }) }),
    onSuccess: invalidate,
  });
  const addStep = useMutation({
    mutationFn: () => apiFetch(`${base}/plan/step`, { method: 'POST', body: JSON.stringify({ title: stepTitle }) }),
    onSuccess: () => { setStepTitle(''); invalidate(); },
  });
  const saveNote = useMutation({
    mutationFn: () => apiFetch(`${base}/note`, { method: 'PATCH', body: JSON.stringify({ note }) }),
    onSuccess: () => { invalidate(); toast({ title: 'Note saved' }); },
  });
  const resolve = useMutation({
    mutationFn: () => apiFetch(`${base}/resolve`, { method: 'POST', body: JSON.stringify({ resolved: true }) }),
    onSuccess: () => { invalidate(); toast({ title: 'Marked resolved', description: `${iv.learnerName} cleared from your intervention list.` }); onClose(); },
  });
  const sendNudge = useMutation({
    mutationFn: () => apiFetch(`${base}/nudge`, { method: 'POST', body: JSON.stringify({ message: nudge }) }),
    onSuccess: (r: any) => { setNudge(''); toast({ title: 'Nudge sent', description: r?.emailed ? 'Delivered in-app and by email.' : 'Delivered in-app.' }); },
  });

  const runAssist = async () => {
    setAssisting(true);
    try {
      const a = await apiFetch<CoachAssist>(`${base}/assist`, { method: 'POST', body: '{}' });
      setAssist(a);
      if (!nudge) setNudge(a.suggestedMessage);
    } catch {
      toast({ title: 'Could not generate guidance', variant: 'destructive' });
    } finally { setAssisting(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-2">
            {iv.learnerName}
            <span className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_STYLE[iv.status]}`}>{STATUS_LABEL[iv.status]}</span>
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{iv.courseTitle}{iv.masteryPct != null ? ` · Mastery ${Math.round(iv.masteryPct)}%` : ''}</p>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Why flagged */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5 mb-1"><AlertTriangle className="h-3.5 w-3.5" /> Why flagged</p>
            <p className="text-sm text-amber-900">{iv.reasons.join(' · ') || 'Below expected progress.'}</p>
          </div>

          {/* Adaptive plan */}
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-2">Adaptive plan</h4>
            {iv.plan?.rationale && <p className="text-sm text-muted-foreground mb-3 italic">{iv.plan.rationale}</p>}
            <div className="space-y-2">
              {(iv.plan?.items ?? []).map((it, i) => (
                <button
                  key={i}
                  onClick={() => toggleStep.mutate(i)}
                  className="w-full text-left flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors"
                >
                  {it.done ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" /> : <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />}
                  <div>
                    <p className={`text-sm font-medium ${it.done ? 'line-through text-muted-foreground' : ''}`}>{it.title}</p>
                    <p className="text-xs text-muted-foreground">{it.why}</p>
                  </div>
                </button>
              ))}
              {(!iv.plan || iv.plan.items.length === 0) && <p className="text-sm text-muted-foreground italic">No plan steps yet — add one below.</p>}
            </div>
            <div className="flex gap-2 mt-3">
              <input
                value={stepTitle}
                onChange={(e) => setStepTitle(e.target.value)}
                placeholder="Add a step (e.g. Redo the pricing worksheet)"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <Button variant="outline" disabled={!stepTitle.trim() || addStep.isPending} onClick={() => addStep.mutate()}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </div>

          {/* AI coaching guidance */}
          <div className="rounded-xl border border-border p-4 bg-muted/20">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> Coaching guidance</h4>
              <Button size="sm" variant="outline" onClick={runAssist} disabled={assisting}>
                {assisting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {assist ? 'Regenerate' : 'Generate'}
              </Button>
            </div>
            {assist ? (
              <div className="space-y-3 text-sm">
                <p>{assist.summary}</p>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Session focus</p>
                  <p className="font-medium">{assist.sessionFocus}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Talking points</p>
                  <ul className="space-y-1">
                    {assist.talkingPoints.map((p, i) => <li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{p}</span></li>)}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Generate personalised talking points and a ready-to-send message for {iv.learnerName.split(' ')[0]}.</p>
            )}
          </div>

          {/* Coach note */}
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-2">Your note</h4>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Private notes on this intervention…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex justify-end mt-2">
              <Button size="sm" variant="outline" disabled={saveNote.isPending} onClick={() => saveNote.mutate()}>Save note</Button>
            </div>
          </div>

          {/* Nudge the learner */}
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5"><Send className="h-4 w-4" /> Nudge {iv.learnerName.split(' ')[0]}</h4>
            <textarea
              value={nudge}
              onChange={(e) => setNudge(e.target.value)}
              rows={3}
              placeholder="Send an encouraging message (in-app, and email if enabled)…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex justify-between items-center mt-2">
              {assist && <button className="text-xs text-primary hover:underline" onClick={() => setNudge(assist.suggestedMessage)}>Use suggested message</button>}
              <div className="flex-1" />
              <Button size="sm" disabled={!nudge.trim() || sendNudge.isPending} onClick={() => sendNudge.mutate()}>
                <Send className="h-4 w-4 mr-1.5" /> Send nudge
              </Button>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-border">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button variant="secondary" disabled={resolve.isPending} onClick={() => resolve.mutate()}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Mark back on track
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
