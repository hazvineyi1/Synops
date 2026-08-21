import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGetMe } from '@workspace/api-client-react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAdaptive } from '@/lib/adaptive';
import { nextMove, overallProgress } from '@/lib/adaptive';
import { Overline, Rule, EditorialCard, Meter, ModeToggle, NextMoveBanner, CycleRing } from '@/components/editorial';
import {
  Plus, ArrowRight, Lock, CheckCircle2, MessageSquareQuote, ChevronUp, ChevronDown,
} from 'lucide-react';

/**
 * The Cockpit, revamped in the editorial design system. Practice-first, not a course. Type-led and
 * high-contrast: each credential is a Kolb cycle shown as a four-cell strip that fills as your own
 * practice moves through experience, reflection, naming and trying. The interface adapts, guided or
 * pro density, one recommended next move up top, and a masthead that reads your overall progress.
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
const statusColor = (s: string) =>
  s === 'reviewed' ? 'text-emerald-600' : s === 'referred' ? 'text-amber-600' : s === 'submitted' ? 'text-primary' : 'text-muted-foreground';

const STAGES = [
  { key: 'e', label: 'Experience' },
  { key: 'r', label: 'Reflect' },
  { key: 'n', label: 'Name it' },
  { key: 't', label: 'Try it' },
] as const;

/** Which Kolb stages this credential's practice has reached, from evidence + reflection stages. */
function litStages(m: Mine) {
  const sc = m.stage_counts ?? {};
  return {
    e: (m.evidence_count ?? 0) > 0 || (sc.description ?? 0) > 0,
    r: (sc.feelings ?? 0) > 0 || (sc.evaluation ?? 0) > 0 || (sc.note ?? 0) > 0 || (sc.surprise ?? 0) > 0,
    n: (sc.analysis ?? 0) > 0 || (sc.conclusion ?? 0) > 0,
    t: (sc.action ?? 0) > 0,
  };
}

function StageDots({ lit }: { lit: Record<string, boolean> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {STAGES.map((st) => {
        const on = lit[st.key];
        return (
          <span key={st.key} className={`inline-flex items-center gap-1.5 text-xs ${on ? '' : 'text-muted-foreground'}`}>
            <span className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${on ? 'bg-primary' : 'bg-muted-foreground/30'}`} /> {st.label}
          </span>
        );
      })}
    </div>
  );
}

export function PracticeHome() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { guided } = useAdaptive();
  const { data: me } = useGetMe();
  const { data: mine = [] } = useQuery({ queryKey: ['practice-me'], queryFn: () => apiFetch<Mine[]>('/practice/me') });
  const { data: catalogue = [] } = useQuery({ queryKey: ['practice-credentials'], queryFn: () => apiFetch<Credential[]>('/practice/credentials') });

  const [picking, setPicking] = useState(false);
  const chosenIds = new Set(mine.map((m) => m.credential_id));
  const available = catalogue.filter((c) => !chosenIds.has(c.id));
  const anyLocked = mine.some((m) => m.sequence_locked);
  const progress = overallProgress(mine as any);
  const move = nextMove(mine as any);
  const stateWord = mine.length === 0 ? 'Not started' : progress === 0 ? 'Beginning' : progress < 0.5 ? 'Underway' : progress < 1 ? 'Deep in practice' : 'Full range';

  const choose = useMutation({
    mutationFn: (b: { credentialId: string; justification: string }) =>
      apiFetch('/practice/me/credentials', { method: 'POST', body: JSON.stringify({ credentialId: b.credentialId, justification: b.justification, sort: mine.length }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['practice-me'] }),
  });
  const patch = useMutation({
    mutationFn: (b: { id: string; body: any }) => apiFetch(`/practice/me/credentials/${b.id}`, { method: 'PATCH', body: JSON.stringify(b.body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['practice-me'] }),
  });
  const reorder = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= mine.length || anyLocked) return;
    const a = mine[idx], b = mine[j];
    patch.mutate({ id: a.id, body: { sort: b.sort } });
    patch.mutate({ id: b.id, body: { sort: a.sort } });
  };
  const onNextMove = () => { if (move.href) navigate(move.href); else setPicking(true); };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Masthead */}
      <div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <Overline>Practice, not courses</Overline>
            <h1 className="ed-display mt-3">{me?.firstName ? `${me.firstName}'s practice` : 'My practice'}</h1>
          </div>
          <div className="flex items-center gap-3">
            <ModeToggle />
            <Button className="gap-1.5 rounded-none" onClick={() => setPicking((p) => !p)}><Plus className="h-4 w-4" /> Choose a credential</Button>
          </div>
        </div>
        <Rule strong className="mt-6" />
        {mine.length > 0 && (
          <div className="mt-4 flex items-center gap-4">
            <Overline>{stateWord}</Overline>
            <div className="flex-1"><Meter value={progress} /></div>
            <div className="ed-num text-sm text-muted-foreground w-10 text-right">{Math.round(progress * 100)}%</div>
          </div>
        )}
        {guided && (
          <p className="text-sm text-muted-foreground mt-4 max-w-2xl">
            You are not taking a course. Each credential is a cycle you move through in your own practice: have an
            experience, reflect on it, name what it means, and try it again. The strip fills as you go.
          </p>
        )}
      </div>

      {/* Adaptive learning path: the single most useful next move */}
      <NextMoveBanner move={move} onCta={onNextMove} />

      {guided && mine.length > 0 && (
        <EditorialCard className="p-5 flex items-start gap-3">
          <MessageSquareQuote className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium">Reflect on WhatsApp</div>
            <div className="text-xs text-muted-foreground">Once your number is linked, message Mutale to reflect on the go, on cheap data. It flows straight into your active credential's cycle.</div>
          </div>
        </EditorialCard>
      )}

      {(picking || mine.length === 0) && (
        <EditorialCard accent className="p-6 space-y-3">
          <Overline>Choose your credentials</Overline>
          {guided && <p className="text-xs text-muted-foreground">Pick the leadership practices you want recognised, and say in a line why. You can reorder them freely until you settle your first two, then the sequence locks.</p>}
          {available.length === 0 && <p className="text-sm text-muted-foreground">You have chosen every credential in this programme.</p>}
          <div className="space-y-2">
            {available.map((c) => <ChooseRow key={c.id} cred={c} guided={guided} onChoose={(justification) => choose.mutate({ credentialId: c.id, justification })} busy={choose.isPending} />)}
          </div>
        </EditorialCard>
      )}

      {/* The cockpit: an editorial Kolb strip per credential */}
      {mine.length > 0 && (
        <div>
          <Overline className="mb-3">Your credentials</Overline>
          <div className="space-y-4">
            {mine.map((m, idx) => {
              const lit = litStages(m);
              const cta = m.status === 'referred' ? 'Take another turn' : m.status === 'submitted' ? 'View portfolio' : m.status === 'reviewed' ? 'Revisit portfolio' : 'Enter the cycle';
              return (
                <EditorialCard key={m.id} hover className="p-6">
                  <div className="flex items-start gap-5">
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <CycleRing e={lit.e} r={lit.r} n={lit.n} t={lit.t} />
                      <span className="ed-num text-xs text-muted-foreground/50">{String(idx + 1).padStart(2, '0')}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Overline className={statusColor(m.status)}>{STATUS_LABEL[m.status] ?? m.status}</Overline>
                          <h3 className="ed-h2 mt-1.5">{m.title}</h3>
                        </div>
                        {!anyLocked && mine.length > 1 && (
                          <div className="flex flex-col shrink-0">
                            <button onClick={() => reorder(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move up"><ChevronUp className="h-4 w-4" /></button>
                            <button onClick={() => reorder(idx, 1)} disabled={idx === mine.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move down"><ChevronDown className="h-4 w-4" /></button>
                          </div>
                        )}
                      </div>

                      {m.justification && guided && <p className="mt-3 border-l-2 border-foreground/25 pl-3 text-sm italic text-muted-foreground">"{m.justification}"</p>}

                      <div className="mt-4"><StageDots lit={lit} /></div>

                      {m.status === 'reviewed' && (
                        <div className="mt-4 inline-flex items-center gap-1.5 border border-emerald-500/40 text-emerald-700 px-2.5 py-1 ed-overline">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Recognised
                        </div>
                      )}

                      {m.latest_feedback && (m.status === 'reviewed' || m.status === 'referred') && (
                        <div className={`mt-4 border-l-2 pl-3 text-sm ${m.status === 'reviewed' ? 'border-emerald-500' : 'border-amber-500'}`}>
                          <div className="flex items-center gap-1.5 font-medium mb-1">
                            {m.status === 'reviewed' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <ArrowRight className="h-4 w-4 text-amber-600" />}
                            {m.status === 'reviewed' ? 'Recognised' : 'Referred for resubmission'} · developmental feedback
                          </div>
                          <p className="whitespace-pre-wrap text-muted-foreground">{m.latest_feedback}</p>
                        </div>
                      )}

                      <div className="mt-5 flex items-center justify-between gap-3">
                        <button onClick={() => navigate(`/practice/c/${m.id}`)} className="group inline-flex items-center gap-2 ed-overline text-foreground underline ed-underline">
                          {cta}
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </button>
                        {m.sequence_locked && <span className="ed-overline text-muted-foreground inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Locked</span>}
                      </div>
                    </div>
                  </div>
                </EditorialCard>
              );
            })}
          </div>
        </div>
      )}

      {mine.length >= 2 && !anyLocked && (
        <EditorialCard className="p-5 flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">Happy with your credentials and their order? Locking sets your sequence for the programme. You can still work them in any order.</div>
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0 rounded-none" onClick={() => mine.forEach((m) => patch.mutate({ id: m.id, body: { lockSequence: true } }))}><Lock className="h-4 w-4" /> Lock my sequence</Button>
        </EditorialCard>
      )}
    </div>
  );
}

function ChooseRow({ cred, guided, onChoose, busy }: { cred: Credential; guided: boolean; onChoose: (justification: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState('');
  return (
    <div className="border border-foreground/15 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm">{cred.title}</div>
          {cred.summary && guided && <div className="text-xs text-muted-foreground">{cred.summary}</div>}
        </div>
        <Button size="sm" variant={open ? 'secondary' : 'outline'} className="shrink-0 rounded-none" onClick={() => setOpen((o) => !o)}>{open ? 'Cancel' : 'Choose'}</Button>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          {cred.activity_brief && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Activity: </span>{cred.activity_brief}</p>}
          <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2} placeholder="Why are you choosing this credential? (one or two lines)"
            className="w-full rounded-none border border-input bg-background px-3 py-2 text-sm" />
          <div className="flex justify-end">
            <Button size="sm" disabled={!why.trim() || busy} onClick={() => onChoose(why.trim())} className="gap-1.5 rounded-none"><Plus className="h-4 w-4" /> Add credential</Button>
          </div>
        </div>
      )}
    </div>
  );
}
