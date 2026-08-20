import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ClipboardCheck, MessageSquareQuote, FileText, Link2, Paperclip, CheckCircle2, ArrowRight, Inbox,
} from 'lucide-react';

/**
 * Reviewer workspace (independent of tutors). A reviewer sees only their own queue (never more than
 * 16). They read the full portfolio and record a gateway-based, developmental review: no marks, no
 * pass/fail. The outcome is "recognised" or "referred for resubmission", and BOTH carry developmental
 * feedback that returns to the candidate.
 */
type QueueRow = { id: string; candidate_id: string; submitted_at: string; code: string; title: string; first_name: string | null; last_name: string | null; email: string; reflection_count: number; evidence_count: number };
type Reflection = { stage: string; content: string; created_at: string };
type Evidence = { kind: string; title: string | null; body: string | null; url: string | null };
type Portfolio = {
  id: string; code: string; title: string; activity_brief: string | null; gateway_guidance: string | null;
  first_name: string | null; last_name: string | null; email: string; justification: string | null;
  reflections: Reflection[]; evidence: Evidence[];
};

const name = (r: { first_name: string | null; last_name: string | null; email: string }) =>
  [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email;
const stageLabel = (k: string) => ({ description: 'What happened', feelings: 'Feelings', evaluation: 'Evaluation', analysis: 'Analysis', conclusion: 'Conclusion', action: 'Action', note: 'Note' } as Record<string, string>)[k] ?? 'Note';

export function PracticeReview() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const { data: queue = [] } = useQuery({ queryKey: ['practice-queue'], queryFn: () => apiFetch<QueueRow[]>('/practice/queue') });

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <PageHeader
        title="Review queue"
        icon={ClipboardCheck}
        subtitle={`${queue.length} portfolio${queue.length === 1 ? '' : 's'} waiting. You review against the three gateways and return developmental feedback. There is no pass or fail.`}
      />

      <div className="grid lg:grid-cols-[320px_1fr] gap-4 items-start">
        {/* Queue */}
        <div className="space-y-2">
          {queue.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground border-dashed">
              <Inbox className="mx-auto h-8 w-8 mb-2 text-muted-foreground/60" /> Your queue is empty.
            </Card>
          )}
          {queue.map((q) => (
            <button key={q.id} onClick={() => setSelected(q.id)}
              className={`w-full text-left rounded-xl border p-3 transition-colors ${selected === q.id ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
              <div className="font-medium text-sm truncate">{name(q)}</div>
              <div className="text-xs text-muted-foreground">{q.title}</div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><MessageSquareQuote className="h-3 w-3" />{q.reflection_count}</span>
                <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{q.evidence_count}</span>
                <span>{new Date(q.submitted_at).toLocaleDateString()}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Portfolio + review */}
        <div>
          {selected
            ? <PortfolioReview id={selected} onDone={() => { setSelected(null); qc.invalidateQueries({ queryKey: ['practice-queue'] }); }} />
            : <Card className="p-10 text-center text-sm text-muted-foreground">Select a portfolio to review.</Card>}
        </div>
      </div>
    </div>
  );
}

function PortfolioReview({ id, onDone }: { id: string; onDone: () => void }) {
  const { data: p } = useQuery({ queryKey: ['practice-portfolio', id], queryFn: () => apiFetch<Portfolio>(`/practice/portfolio/${id}`) });
  const [g1, setG1] = useState(false);
  const [g2, setG2] = useState(false);
  const [g3, setG3] = useState(false);
  const [outcome, setOutcome] = useState<'reviewed' | 'referred'>('reviewed');
  const [feedback, setFeedback] = useState('');

  const review = useMutation({
    mutationFn: () => apiFetch(`/practice/portfolio/${id}/review`, { method: 'POST', body: JSON.stringify({ g1, g2, g3, outcome, feedback: feedback.trim() }) }),
    onSuccess: onDone,
  });

  if (!p) return <Card className="p-10 text-center text-sm text-muted-foreground">Loading portfolio...</Card>;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-serif text-xl font-bold">{p.title}</h2>
          <Badge variant="outline" className="text-[10px]">{name(p)}</Badge>
        </div>
        {p.activity_brief && <p className="mt-2 text-sm"><span className="font-medium">Activity: </span>{p.activity_brief}</p>}
        {p.justification && <p className="mt-1 text-xs text-muted-foreground italic">Chosen because: "{p.justification}"</p>}
        {p.gateway_guidance && <p className="mt-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">{p.gateway_guidance}</p>}
      </Card>

      {/* Reflection */}
      <Card className="p-5">
        <div className="text-sm font-semibold mb-2 flex items-center gap-2"><MessageSquareQuote className="h-4 w-4 text-primary" /> Reflection ({p.reflections.length})</div>
        {p.reflections.length === 0 ? <p className="text-sm text-muted-foreground">No reflection captured.</p> : (
          <ol className="space-y-2 border-l-2 border-border pl-4">
            {p.reflections.map((r, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary/60" />
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{stageLabel(r.stage)} · {new Date(r.created_at).toLocaleDateString()}</div>
                <p className="text-sm whitespace-pre-wrap">{r.content}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Evidence */}
      <Card className="p-5">
        <div className="text-sm font-semibold mb-2 flex items-center gap-2"><Paperclip className="h-4 w-4 text-primary" /> Evidence ({p.evidence.length})</div>
        {p.evidence.length === 0 ? <p className="text-sm text-muted-foreground">No evidence attached.</p> : (
          <ul className="space-y-2">
            {p.evidence.map((e, i) => (
              <li key={i} className="rounded-lg border border-border bg-muted/20 p-2.5">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {e.kind === 'link' ? <Link2 className="h-3.5 w-3.5 text-blue-600" /> : <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />}
                  {e.title || (e.kind === 'link' ? 'Link' : 'Note')}
                </div>
                {e.body && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{e.body}</p>}
                {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline break-all">{e.url}</a>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Review */}
      <Card className="p-5 space-y-3 border-primary/30">
        <div className="text-sm font-semibold flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-primary" /> Your review</div>
        <p className="text-xs text-muted-foreground">Balance the whole portfolio; the gateways are a guide, not a checklist to tick mechanically.</p>
        <div className="space-y-2">
          {[
            { on: g1, set: setG1, label: 'G1 · Relevant activity: they have done something substantially relevant.' },
            { on: g2, set: setG2, label: 'G2 · Personal contribution: their own actions and decisions are identifiable.' },
            { on: g3, set: setG3, label: 'G3 · Learning from practice: their reflection shows what they learned.' },
          ].map((c, i) => (
            <label key={i} className="flex items-start gap-2.5 rounded-lg border border-border p-2.5 text-sm cursor-pointer hover:bg-muted/30">
              <input type="checkbox" checked={c.on} onChange={(e) => c.set(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Outcome</div>
          <div className="flex gap-2">
            <button onClick={() => setOutcome('reviewed')} className={`flex-1 rounded-lg border p-2.5 text-sm ${outcome === 'reviewed' ? 'border-emerald-500/50 bg-emerald-500/5 text-emerald-700' : 'border-border hover:bg-muted/30'}`}>
              <CheckCircle2 className="h-4 w-4 inline mr-1.5" /> Recognised
            </button>
            <button onClick={() => setOutcome('referred')} className={`flex-1 rounded-lg border p-2.5 text-sm ${outcome === 'referred' ? 'border-amber-500/50 bg-amber-500/5 text-amber-700' : 'border-border hover:bg-muted/30'}`}>
              <ArrowRight className="h-4 w-4 inline mr-1.5" /> Refer for resubmission
            </button>
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Developmental feedback (returned to the candidate, required for both outcomes)</div>
          <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={5} placeholder="What did they do well, what could they develop, and where next? Always developmental, never a mark."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end">
          <Button disabled={!feedback.trim() || review.isPending} onClick={() => review.mutate()} className="gap-1.5">
            {review.isPending ? 'Sending...' : outcome === 'reviewed' ? 'Recognise & send feedback' : 'Refer & send feedback'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
