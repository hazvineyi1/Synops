import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ClipboardCheck, MessageSquareQuote, FileText, Link2, Paperclip, CheckCircle2, ArrowRight, Inbox, Target, Zap, Brain, ShieldCheck, Sparkles, Loader2,
} from 'lucide-react';

/**
 * Reviewer workspace (independent of tutors). A reviewer sees only their own queue (never more than
 * 16). They read the full portfolio and record a gateway-based, developmental review: no marks, no
 * pass/fail. The outcome is "recognised" or "referred for resubmission", and BOTH carry developmental
 * feedback that returns to the candidate.
 */
type QueueRow = { id: string; candidate_id: string; submitted_at: string; code: string; title: string; first_name: string | null; last_name: string | null; email: string; reflection_count: number; evidence_count: number };
type Reflection = { stage: string; content: string; created_at: string; source?: string | null; typed_ms?: number | null; paste_count?: number | null };
type Evidence = { kind: string; title: string | null; body: string | null; url: string | null };
type Attestation = { relationship: string; prompt: string; status: string; response_name: string | null; response_role: string | null; response_comment: string | null; responded_at: string | null; created_at: string };
type Portfolio = {
  id: string; code: string; title: string; activity_brief: string | null; gateway_guidance: string | null;
  first_name: string | null; last_name: string | null; email: string; justification: string | null;
  reflections: Reflection[]; evidence: Evidence[]; attestations?: Attestation[];
};

const name = (r: { first_name: string | null; last_name: string | null; email: string }) =>
  [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email;
const stageLabel = (k: string) => ({ description: 'What happened', feelings: 'Feelings', evaluation: 'Evaluation', analysis: 'Analysis', conclusion: 'Conclusion', action: 'Action', note: 'Note', prediction: 'Prediction', surprise: 'What surprised me' } as Record<string, string>)[k] ?? 'Note';

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
            <Card className="rounded-none p-6 text-center text-sm text-muted-foreground border-dashed">
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
            : <Card className="rounded-none p-10 text-center text-sm text-muted-foreground">Select a portfolio to review.</Card>}
        </div>
      </div>
    </div>
  );
}

function AuthenticitySignals({ reflections, attestations }: { reflections: Reflection[]; attestations: Attestation[] }) {
  if (!reflections.length && !attestations.length) return null;
  const n = reflections.length;
  const typed = reflections.filter((r) => r.source === 'typed').length;
  const pasted = reflections.filter((r) => r.source === 'pasted').length;
  const whatsapp = reflections.filter((r) => r.source === 'whatsapp').length;
  const days = new Set(reflections.map((r) => new Date(r.created_at).toDateString())).size;
  const times = reflections.map((r) => new Date(r.created_at).getTime()).filter((t) => !isNaN(t));
  const spanDays = times.length ? Math.round((Math.max(...times) - Math.min(...times)) / 86400000) : 0;
  const tiles = [
    { label: 'Typed live', value: `${typed}/${n}`, tone: 'good' as const },
    { label: 'Pasted', value: String(pasted), tone: (pasted > 0 ? 'warn' : 'muted') as const },
    { label: 'Via WhatsApp', value: String(whatsapp), tone: 'muted' as const },
    { label: 'Across', value: `${days} session${days === 1 ? '' : 's'}`, tone: 'muted' as const },
  ];
  const confirmed = attestations.filter((a) => a.status === 'confirmed');
  return (
    <Card className="rounded-none p-5 border-primary/20">
      <div className="ed-overline text-foreground mb-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Authenticity signals</div>
      <p className="text-xs text-muted-foreground">How this portfolio was produced. Reflecting in the candidate's own words, typed in the moment, spread over time, and confirmed by someone who was there, is what makes the credential trustworthy. These are signals, not proof, use your judgement.</p>

      {reflections.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {tiles.map((t) => (
              <div key={t.label} className={`border p-3 ${t.tone === 'warn' ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'}`}>
                <div className={`ed-num text-2xl ${t.tone === 'warn' ? 'text-amber-700' : t.tone === 'good' ? 'text-primary' : ''}`}>{t.value}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-0.5">{t.label}</div>
              </div>
            ))}
          </div>
          {pasted > 0 && (
            <p className="mt-3 border-l-2 border-amber-500 pl-3 text-xs text-amber-700">{pasted} of {n} reflective entr{pasted === 1 ? 'y was' : 'ies were'} pasted rather than typed live. Worth confirming they are in the candidate's own voice.</p>
          )}
          {spanDays >= 2 && pasted === 0 && (
            <p className="mt-3 border-l-2 border-emerald-500 pl-3 text-xs text-emerald-700">Captured live and across {spanDays} days, a strong signal of genuine reflection over real practice.</p>
          )}
        </>
      )}

      {attestations.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="ed-overline text-muted-foreground">Third-party attestation {confirmed.length > 0 && <span className="text-emerald-700">· {confirmed.length} confirmed</span>}</div>
          {attestations.map((a, i) => (
            <div key={i} className={`border-l-2 pl-3 text-xs ${a.status === 'confirmed' ? 'border-emerald-500' : a.status === 'declined' ? 'border-rose-500' : 'border-border'}`}>
              <div className="font-medium">
                {a.status === 'confirmed' ? `Confirmed by ${a.response_name || 'a witness'}${a.response_role ? `, ${a.response_role}` : ''}` : a.status === 'declined' ? `Declined by ${a.response_name || 'the witness'}` : 'Awaiting a response'} · {a.relationship}
              </div>
              <p className="text-muted-foreground">Asked to confirm: {a.prompt}</p>
              {a.response_comment && <p className="italic mt-0.5">"{a.response_comment}"</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function PortfolioReview({ id, onDone }: { id: string; onDone: () => void }) {
  const { data: p } = useQuery({ queryKey: ['practice-portfolio', id], queryFn: () => apiFetch<Portfolio>(`/practice/portfolio/${id}`) });
  const [g1, setG1] = useState(false);
  const [g2, setG2] = useState(false);
  const [g3, setG3] = useState(false);
  const [outcome, setOutcome] = useState<'reviewed' | 'referred'>('reviewed');
  const [feedback, setFeedback] = useState('');
  const [pre, setPre] = useState<any | null>(null);
  const [preLoading, setPreLoading] = useState(false);
  const [preErr, setPreErr] = useState<string | null>(null);
  const runPre = async () => {
    setPreLoading(true); setPreErr(null);
    try { setPre(await apiFetch<any>(`/practice/portfolio/${id}/prescreen`, { method: 'POST', body: JSON.stringify({}) })); }
    catch (e: any) { setPreErr(e?.message || 'Could not run the pre-screen.'); }
    finally { setPreLoading(false); }
  };

  const review = useMutation({
    mutationFn: () => apiFetch(`/practice/portfolio/${id}/review`, { method: 'POST', body: JSON.stringify({ g1, g2, g3, outcome, feedback: feedback.trim() }) }),
    onSuccess: onDone,
  });

  if (!p) return <Card className="rounded-none p-10 text-center text-sm text-muted-foreground">Loading portfolio...</Card>;

  const predictions = p.reflections.filter((r) => r.stage === 'prediction');
  const surprises = p.reflections.filter((r) => r.stage === 'surprise');
  const gibbsReflections = p.reflections.filter((r) => r.stage !== 'prediction' && r.stage !== 'surprise');
  const pairCount = Math.max(predictions.length, surprises.length);

  return (
    <div className="space-y-4">
      <Card className="rounded-none p-5">
        <div className="ed-overline text-muted-foreground">Portfolio for review</div>
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          <h2 className="ed-h2">{p.title}</h2>
          <Badge variant="outline" className="text-[10px] rounded-none">{name(p)}</Badge>
        </div>
        {p.activity_brief && <p className="mt-2 text-sm"><span className="font-medium">Activity: </span>{p.activity_brief}</p>}
        {p.justification && <p className="mt-1 text-xs text-muted-foreground italic">Chosen because: "{p.justification}"</p>}
        {p.gateway_guidance && <p className="mt-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">{p.gateway_guidance}</p>}
      </Card>

      {/* Coaching method and integrity: how this portfolio was produced, so the reviewer can trust it. */}
      <Card className="rounded-none p-5 border-primary/20">
        <div className="ed-overline text-foreground mb-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Coaching method and integrity</div>
        <p className="text-xs text-muted-foreground">Every reflection below is the candidate's own writing. Their coach, Mutale, is Socratic by design: it carries structure and memory for them (beneficial cognitive offloading, Risko and Gilbert) but never supplies the answer or the correct leadership style. It works the experiential cycle, concrete experience, reflective observation, abstract conceptualization, active experimentation (Kolb, after Dewey, Lewin and Piaget), surfaces predictions and the errors that follow, and co-regulates the thinking without taking it over. What you are reviewing is the candidate's cognition, supported, not replaced.</p>
      </Card>

      {/* Authenticity signals: how the portfolio was produced, so recognition rests on real practice. */}
      <AuthenticitySignals reflections={p.reflections} attestations={p.attestations ?? []} />

      {/* Predictions and surprises: predictive processing made reviewable. */}
      {pairCount > 0 && (
        <Card className="rounded-none p-5">
          <div className="ed-overline text-foreground mb-2 flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Predictions and surprises ({pairCount})</div>
          <ol className="space-y-3">
            {Array.from({ length: pairCount }).map((_, i) => {
              const pr = predictions[i]; const su = surprises[i];
              return (
                <li key={i} className="rounded-xl border border-border overflow-hidden">
                  {pr && (
                    <div className="p-3 border-b border-border">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1"><Target className="h-3 w-3" /> They expected</div>
                      <p className="text-sm whitespace-pre-wrap mt-0.5">{pr.content}</p>
                    </div>
                  )}
                  {su && (
                    <div className="p-3 bg-amber-500/5">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-amber-700 inline-flex items-center gap-1"><Zap className="h-3 w-3" /> What actually happened</div>
                      <p className="text-sm whitespace-pre-wrap mt-0.5">{su.content}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {/* Reflection */}
      <Card className="rounded-none p-5">
        <div className="ed-overline text-foreground mb-2 flex items-center gap-2"><MessageSquareQuote className="h-4 w-4 text-primary" /> Reflection ({gibbsReflections.length})</div>
        {gibbsReflections.length === 0 ? <p className="text-sm text-muted-foreground">No reflection captured.</p> : (
          <ol className="space-y-2 border-l-2 border-border pl-4">
            {gibbsReflections.map((r, i) => (
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
      <Card className="rounded-none p-5">
        <div className="ed-overline text-foreground mb-2 flex items-center gap-2"><Paperclip className="h-4 w-4 text-primary" /> Evidence ({p.evidence.length})</div>
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

      {/* Reviewer assist: a calibration pre-screen against the shared rubric. Advisory; the human decides. */}
      <Card className="rounded-none p-5 space-y-3 border-primary/20">
        <div className="ed-overline text-foreground flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Reviewer assist</div>
        <p className="text-xs text-muted-foreground">An AI reads this portfolio against the same three-gateway rubric every reviewer uses, and drafts developmental feedback. It is advisory, it keeps judgements consistent between reviewers. You decide the outcome and own the words.</p>
        {!pre && <Button size="sm" variant="outline" className="rounded-none gap-1.5" disabled={preLoading} onClick={runPre}>{preLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{preLoading ? 'Reading the portfolio...' : 'Run pre-screen'}</Button>}
        {preErr && <p className="text-xs text-rose-600">{preErr}</p>}
        {pre && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              {([['g1', 'G1 Relevant activity'], ['g2', 'G2 Personal contribution'], ['g3', 'G3 Learning from practice']] as [string, string][]).map(([k, label]) => {
                const g = pre[k]; if (!g) return null;
                const tint = g.verdict === 'met' ? 'text-emerald-700 border-emerald-500/40' : g.verdict === 'partial' ? 'text-amber-700 border-amber-500/40' : 'text-rose-700 border-rose-500/40';
                return <div key={k} className="text-xs"><span className={`ed-overline border px-1.5 py-0.5 ${tint}`}>{g.verdict}</span> <span className="font-medium">{label}.</span> <span className="text-muted-foreground">{g.rationale}</span></div>;
              })}
            </div>
            {Array.isArray(pre.gaps) && pre.gaps.length > 0 && (
              <div><div className="ed-overline text-muted-foreground mb-1">Gaps to close</div><ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">{pre.gaps.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>
            )}
            {pre.draftFeedback && (
              <div>
                <div className="ed-overline text-muted-foreground mb-1">Draft developmental feedback</div>
                <p className="text-xs whitespace-pre-wrap bg-muted/40 p-2.5">{pre.draftFeedback}</p>
                <div className="flex justify-end mt-1.5"><Button size="sm" variant="outline" className="rounded-none gap-1.5" onClick={() => setFeedback(pre.draftFeedback)}><ArrowRight className="h-3.5 w-3.5" /> Use as my draft</Button></div>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Edit it freely, or ignore it. The feedback you send is yours.</p>
          </div>
        )}
      </Card>

      {/* Review */}
      <Card className="rounded-none p-5 space-y-3 border-primary/30">
        <div className="ed-overline text-foreground flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-primary" /> Your review</div>
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
