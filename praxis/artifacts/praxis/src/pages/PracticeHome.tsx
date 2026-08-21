import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Compass, Plus, ArrowRight, Lock, CheckCircle2, MessageSquareQuote, ChevronUp, ChevronDown, Sparkles,
} from 'lucide-react';

/**
 * The Cockpit: the practice-first home. Each credential is a Kolb cycle, not a course. You navigate
 * by the four stages of experiential learning (experience, reflect, name it, try it), and the wheel
 * lights up as your own practice moves through the cycle. No modules, no progress bars.
 */
type Credential = { id: string; code: string; title: string; summary: string | null; activity_brief: string | null; gateway_guidance: string | null; example_assignment: string | null };
type Mine = Credential & {
  credential_id: string; status: string; sort: number; justification: string | null;
  sequence_locked: boolean; reflection_count: number; evidence_count: number;
  stage_counts: Record<string, number> | null;
  latest_feedback: string | null; latest_outcome: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  chosen: 'Not yet started', in_progress: 'In the cycle', submitted: 'With a reviewer', reviewed: 'Recognised', referred: 'Come back with more',
};
const statusTint = (s: string) =>
  s === 'reviewed' ? 'bg-emerald-500/15 text-emerald-700'
    : s === 'referred' ? 'bg-amber-500/15 text-amber-700'
      : s === 'submitted' ? 'bg-blue-500/15 text-blue-700'
        : 'bg-muted text-muted-foreground';

const STAGES = [
  { key: 'e', label: 'Experience', tint: 'text-amber-600', dot: 'bg-amber-500' },
  { key: 'r', label: 'Reflect', tint: 'text-blue-600', dot: 'bg-blue-500' },
  { key: 'n', label: 'Name it', tint: 'text-violet-600', dot: 'bg-violet-500' },
  { key: 't', label: 'Try it', tint: 'text-teal-600', dot: 'bg-teal-500' },
] as const;

/** Which Kolb stages this credential's practice has reached, from evidence + reflection stages. */
function litStages(m: Mine) {
  const sc = m.stage_counts ?? {};
  return {
    e: (m.evidence_count ?? 0) > 0 || (sc.description ?? 0) > 0,
    r: (sc.feelings ?? 0) > 0 || (sc.evaluation ?? 0) > 0 || (sc.note ?? 0) > 0,
    n: (sc.analysis ?? 0) > 0 || (sc.conclusion ?? 0) > 0,
    t: (sc.action ?? 0) > 0,
  };
}

function CycleWheel({ e, r, n, t }: { e: boolean; r: boolean; n: boolean; t: boolean }) {
  const litCount = [e, r, n, t].filter(Boolean).length;
  const Dot = ({ cx, cy, on, cls }: { cx: number; cy: number; on: boolean; cls: string }) => (
    <circle cx={cx} cy={cy} r={13} fill="currentColor" className={on ? cls : 'text-muted-foreground/20'} />
  );
  return (
    <svg viewBox="0 0 150 150" className="w-[132px] h-[132px] shrink-0" aria-hidden="true">
      <defs>
        <marker id="cw-ah" markerWidth="8" markerHeight="8" refX="5" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.2" />
        </marker>
      </defs>
      <g stroke="hsl(var(--muted-foreground))" strokeWidth="1" fill="none" strokeDasharray="2 5" opacity="0.45">
        <path d="M91 27 A55 55 0 0 1 123 91" markerEnd="url(#cw-ah)" />
        <path d="M123 91 A55 55 0 0 1 59 123" markerEnd="url(#cw-ah)" />
        <path d="M59 123 A55 55 0 0 1 27 59" markerEnd="url(#cw-ah)" />
        <path d="M27 59 A55 55 0 0 1 91 27" markerEnd="url(#cw-ah)" />
      </g>
      <Dot cx={75} cy={20} on={e} cls="text-amber-500" />
      <Dot cx={130} cy={75} on={r} cls="text-blue-500" />
      <Dot cx={75} cy={130} on={n} cls="text-violet-500" />
      <Dot cx={20} cy={75} on={t} cls="text-teal-500" />
      <circle cx={75} cy={75} r={26} fill="hsl(var(--card))" stroke="hsl(var(--border))" />
      <text x={75} y={73} textAnchor="middle" fontSize={14} fill="hsl(var(--foreground))">{litCount}/4</text>
      <text x={75} y={88} textAnchor="middle" fontSize={8} fill="hsl(var(--muted-foreground))">of the cycle</text>
    </svg>
  );
}

export function PracticeHome() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data: mine = [] } = useQuery({ queryKey: ['practice-me'], queryFn: () => apiFetch<Mine[]>('/practice/me') });
  const { data: catalogue = [] } = useQuery({ queryKey: ['practice-credentials'], queryFn: () => apiFetch<Credential[]>('/practice/credentials') });

  const [picking, setPicking] = useState(false);
  const chosenIds = new Set(mine.map((m) => m.credential_id));
  const available = catalogue.filter((c) => !chosenIds.has(c.id));
  const anyLocked = mine.some((m) => m.sequence_locked);

  const choose = useMutation({
    mutationFn: (b: { credentialId: string; justification: string }) =>
      apiFetch('/practice/me/credentials', { method: 'POST', body: JSON.stringify({ credentialId: b.credentialId, justification: b.justification, sort: mine.length }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['practice-me'] }),
  });
  const patch = useMutation({
    mutationFn: (b: { id: string; body: any }) => apiFetch(`/practice/me/credentials/${b.id}`, { method: 'PATCH', body: JSON.stringify(b.body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['practice-me'] }),
  });
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= mine.length || anyLocked) return;
    const a = mine[idx], b = mine[j];
    patch.mutate({ id: a.id, body: { sort: b.sort } });
    patch.mutate({ id: b.id, body: { sort: a.sort } });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-serif font-bold tracking-tight">My practice</h1>
          </div>
          <Button className="gap-1.5" onClick={() => setPicking((p) => !p)}><Plus className="h-4 w-4" /> Choose a credential</Button>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          You are not taking a course. Each credential is a cycle you move through in your own practice: have an
          experience, reflect on it, name what it means, and try it again. The wheel fills as you go.
        </p>
      </div>

      {mine.length > 0 && (
        <Card className="p-4 flex items-start gap-3 border-dashed">
          <MessageSquareQuote className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium">Reflect on WhatsApp</div>
            <div className="text-xs text-muted-foreground">Once your number is linked, message Mutale to reflect on the go, on cheap data. It flows straight into your active credential's cycle.</div>
          </div>
        </Card>
      )}

      {(picking || mine.length === 0) && (
        <Card className="p-5 space-y-3 border-primary/30">
          <div className="text-sm font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Choose your credentials</div>
          <p className="text-xs text-muted-foreground">Pick the leadership practices you want recognised, and say in a line why. You can reorder them freely until you settle your first two, then the sequence locks.</p>
          {available.length === 0 && <p className="text-sm text-muted-foreground">You have chosen every credential in this programme.</p>}
          <div className="space-y-2">
            {available.map((c) => <ChooseRow key={c.id} cred={c} onChoose={(justification) => choose.mutate({ credentialId: c.id, justification })} busy={choose.isPending} />)}
          </div>
        </Card>
      )}

      {/* The cockpit: a Kolb wheel per credential */}
      <div className="space-y-4">
        {mine.map((m, idx) => {
          const s = litStages(m);
          return (
            <Card key={m.id} className="p-5">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                <CycleWheel e={s.e} r={s.r} n={s.n} t={s.t} />
                <div className="min-w-0 flex-1 w-full">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-serif font-semibold text-lg">{m.title}</span>
                        <Badge className={`text-[10px] border-transparent ${statusTint(m.status)}`}>{STATUS_LABEL[m.status] ?? m.status}</Badge>
                        {m.sequence_locked && <Badge variant="outline" className="text-[10px] gap-1"><Lock className="h-3 w-3" /> Locked</Badge>}
                      </div>
                      {m.justification && <p className="text-xs text-muted-foreground mt-1 italic">"{m.justification}"</p>}
                    </div>
                    {!anyLocked && mine.length > 1 && (
                      <div className="flex flex-col shrink-0">
                        <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move up"><ChevronUp className="h-4 w-4" /></button>
                        <button onClick={() => move(idx, 1)} disabled={idx === mine.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move down"><ChevronDown className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {STAGES.map((st) => {
                      const on = (s as any)[st.key] as boolean;
                      return (
                        <span key={st.key} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${on ? 'bg-muted ' + st.tint : 'text-muted-foreground/60'}`}>
                          <span className={`h-2 w-2 rounded-full ${on ? st.dot : 'bg-muted-foreground/25'}`} /> {st.label}
                        </span>
                      );
                    })}
                  </div>

                  {m.latest_feedback && (m.status === 'reviewed' || m.status === 'referred') && (
                    <div className={`mt-3 rounded-xl border p-3 text-sm ${m.status === 'reviewed' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                      <div className="flex items-center gap-1.5 font-medium mb-1">
                        {m.status === 'reviewed' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <ArrowRight className="h-4 w-4 text-amber-600" />}
                        {m.status === 'reviewed' ? 'Recognised' : 'Referred for resubmission'} · developmental feedback
                      </div>
                      <p className="whitespace-pre-wrap text-muted-foreground">{m.latest_feedback}</p>
                    </div>
                  )}

                  <div className="mt-4">
                    <Button size="sm" onClick={() => navigate(`/practice/c/${m.id}`)} className="gap-1.5">
                      {m.status === 'referred' ? 'Take another turn' : m.status === 'submitted' ? 'View portfolio' : 'Enter the cycle'} <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {mine.length >= 2 && !anyLocked && (
        <Card className="p-4 flex items-center justify-between gap-3 border-dashed">
          <div className="text-sm text-muted-foreground">Happy with your credentials and their order? Locking sets your sequence for the programme. You can still work them in any order.</div>
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => mine.forEach((m) => patch.mutate({ id: m.id, body: { lockSequence: true } }))}><Lock className="h-4 w-4" /> Lock my sequence</Button>
        </Card>
      )}
    </div>
  );
}

function ChooseRow({ cred, onChoose, busy }: { cred: Credential; onChoose: (justification: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState('');
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm">{cred.title}</div>
          {cred.summary && <div className="text-xs text-muted-foreground">{cred.summary}</div>}
        </div>
        <Button size="sm" variant={open ? 'secondary' : 'outline'} className="shrink-0" onClick={() => setOpen((o) => !o)}>{open ? 'Cancel' : 'Choose'}</Button>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          {cred.activity_brief && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Activity: </span>{cred.activity_brief}</p>}
          <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2} placeholder="Why are you choosing this credential? (one or two lines)"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <div className="flex justify-end">
            <Button size="sm" disabled={!why.trim() || busy} onClick={() => onChoose(why.trim())} className="gap-1.5"><Plus className="h-4 w-4" /> Add credential</Button>
          </div>
        </div>
      )}
    </div>
  );
}
