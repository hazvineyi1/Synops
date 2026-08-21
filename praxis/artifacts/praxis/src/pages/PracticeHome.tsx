import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGetMe } from '@workspace/api-client-react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAdaptive } from '@/lib/adaptive';
import { nextMove, overallProgress } from '@/lib/adaptive';
import { useBrandTheme } from '@/context/ThemeProvider';
import { Overline, Rule, EditorialCard, Meter, ModeToggle, NextMoveBanner, CycleRing } from '@/components/editorial';
import {
  Plus, ArrowRight, Lock, CheckCircle2, MessageSquareQuote, ChevronUp, ChevronDown, ShieldCheck, Copy,
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
  credential_public_id: string | null;
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

type Twin = {
  credentials: Array<{ id: string; title: string; status: string; reflections: number }>;
  recognised: number; inProgress: number; reflectionTotal: number;
  stageCounts: Record<string, number>;
  authenticity: { typedLivePct: number; attestationsConfirmed: number };
  recommendedNext: { id: string; title: string; summary: string | null } | null;
};
const TWIN_MOVES = ['description', 'feelings', 'evaluation', 'analysis', 'conclusion', 'action', 'prediction', 'surprise'];

function LongitudinalTwin({ coachName = 'Mutale' }: { coachName?: string }) {
  const { data } = useQuery({ queryKey: ['practice-twin'], queryFn: () => apiFetch<Twin>('/practice/twin') });
  const [syn, setSyn] = useState<{ themes: string[]; edge: string | null; note?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!data || data.reflectionTotal === 0) return null;
  const movesWorked = TWIN_MOVES.filter((k) => (data.stageCounts?.[k] || 0) > 0).length;
  const reveal = async () => {
    setBusy(true); setErr(null);
    try { setSyn(await apiFetch('/practice/twin/synthesis', { method: 'POST', body: JSON.stringify({}) })); }
    catch (e: any) { setErr(e?.message || 'Could not synthesise just now.'); }
    finally { setBusy(false); }
  };
  const stats = [
    { label: 'Recognised', value: data.recognised },
    { label: 'In progress', value: data.inProgress },
    { label: 'Reflective range', value: `${movesWorked}/8` },
    { label: 'Typed live', value: `${data.authenticity.typedLivePct}%` },
  ];
  return (
    <EditorialCard accent className="p-6 space-y-4">
      <div>
        <Overline>Your cognitive twin, across your practice</Overline>
        <h2 className="ed-h2 mt-1">How you lead, over time</h2>
        <p className="text-sm text-muted-foreground mt-1">The model {coachName} holds of you across every credential, not just one. It grows as you do, drawn only from your own words.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="border border-border p-3">
            <div className="ed-num text-2xl">{s.value}</div>
            <div className="ed-overline text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
      {syn ? (
        <div className="space-y-2">
          {syn.themes?.length ? (
            <>
              <Overline>Your leadership signature</Overline>
              <ul className="space-y-1.5">
                {syn.themes.map((t, i) => <li key={i} className="text-sm border-l-2 border-primary pl-3">{t}</li>)}
              </ul>
              {syn.edge && <p className="text-sm text-muted-foreground border-l-2 border-amber-500 pl-3">Your growth edge: {syn.edge}</p>}
            </>
          ) : <p className="text-sm text-muted-foreground">{syn.note}</p>}
        </div>
      ) : (
        <div>
          <button onClick={reveal} disabled={busy} className="ed-overline text-foreground underline ed-underline inline-flex items-center gap-1.5">{busy ? 'Reading your reflections...' : 'Reveal my leadership signature'}</button>
          {err && <p className="text-xs text-rose-600 mt-1">{err}</p>}
        </div>
      )}
      {data.recommendedNext && (
        <p className="text-xs text-muted-foreground border-t border-border pt-3">A practice that could be next for you: <span className="text-foreground font-medium">{data.recommendedNext.title}</span>. Choose it above when you are ready.</p>
      )}
    </EditorialCard>
  );
}

function Orientation({ name, programName, isEducator, hasCredentials, onStart }: { name?: string; programName: string; isEducator: boolean; hasCredentials: boolean; onStart: () => void }) {
  const [open, setOpen] = useState(!hasCredentials || isEducator);
  const coachName = isEducator ? 'Eve' : 'Mutale';
  const goal = isEducator
    ? 'Your goal is to earn your first credential: recognition that you can genuinely do one thing in your teaching. You earn it by trying one real thing with your students, reflecting on what happened with your coach, and adding a little evidence. No courses, no grades.'
    : 'Your goal is to earn your first credential: recognition of one real thing you can do as a leader. You earn it by using something real from your work, reflecting on it with your coach, and adding evidence. No courses, no grades.';
  const steps: [string, string][] = isEducator ? [
    ['Choose a focus', 'Pick a credential below that fits something you already do, or want to try, with your students.'],
    ['Do something real', 'Try it in your own classroom. It does not have to be new, use something from this term.'],
    [`Reflect with ${coachName}`, `Talk it through with your coach. ${coachName} asks the questions; you do the thinking. Capture what you did, what surprised you, and what you learned.`],
    ['Get recognised', 'When your portfolio is ready, submit it. A reviewer recognises it or refers it back, always with feedback, and issues your verifiable credential.'],
  ] : [
    ['Choose a credential', 'Pick a leadership practice you want recognised, and say in a line why.'],
    ['Do the work', 'Use something real from your practice, from the last six months if you like.'],
    [`Reflect with ${coachName}`, 'Your Socratic coach helps you turn the experience into articulated learning and evidence.'],
    ['Get recognised', 'Submit your portfolio. A reviewer recognises it or refers it back, with developmental feedback either way.'],
  ];
  return (
    <EditorialCard accent className="p-6 sm:p-8 space-y-4">
      <div>
        <Overline>{hasCredentials ? 'How this works' : 'Start here'}</Overline>
        <h2 className="ed-h2 mt-1">{name ? `Welcome, ${name}` : `Welcome to ${programName}`}</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{goal}</p>
      </div>
      <button onClick={() => setOpen((o) => !o)} className="ed-overline text-foreground underline ed-underline">
        {open ? 'Hide the steps' : 'Show me the four steps'}
      </button>
      {open && (
        <ol className="space-y-3">
          {steps.map(([title, detail], i) => (
            <li key={i} className="flex gap-3">
              <span className="ed-num text-lg text-primary w-6 shrink-0">{i + 1}</span>
              <div><div className="text-sm font-medium">{title}</div><div className="text-sm text-muted-foreground">{detail}</div></div>
            </li>
          ))}
        </ol>
      )}
      <div className="border-t border-border pt-3 space-y-1.5 text-xs text-muted-foreground">
        <div><span className="font-medium text-foreground">A credential</span> is recognition that you can genuinely do one thing in practice, earned by showing real evidence, not by sitting a course or passing a test.</div>
        <div><span className="font-medium text-foreground">The cycle</span> is the four moves inside every credential: {isEducator ? 'try something real with your students' : 'do something real in your practice'}, reflect on it, name what you learned, and try it again. The progress bar fills as you work them.</div>
        <div><span className="font-medium text-foreground">Guided and Pro</span> (top right) change how much help you see: Guided explains each step, Pro is a denser view once you know your way around.</div>
      </div>
      {!hasCredentials && (
        <div className="pt-1">
          <div className="ed-overline text-muted-foreground mb-2">Your first step</div>
          <Button onClick={onStart} className="rounded-none gap-2">
            Choose your first credential
            <ArrowRight className="h-4 w-4" />
          </Button>
          <p className="text-xs text-muted-foreground mt-2">Pick one that fits something you {isEducator ? 'already do with your students' : 'already do in your work'}. You can change your mind later.</p>
        </div>
      )}
    </EditorialCard>
  );
}

function CredentialLink({ publicId }: { publicId: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/verify/${publicId}`;
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } };
  return (
    <div className="mt-2 flex items-center gap-3 flex-wrap">
      <a href={url} target="_blank" rel="noreferrer" className="ed-overline text-primary underline ed-underline inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Your verified credential</a>
      <button onClick={copy} className="ed-overline text-muted-foreground hover:text-foreground inline-flex items-center gap-1">{copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy link'}</button>
    </div>
  );
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
  const { data: brand } = useBrandTheme();
  const isEducator = (brand?.displayName || '').toLowerCase().includes('educator');
  const programName = brand?.displayName || 'Practice';
  const coachName = isEducator ? 'Eve' : 'Mutale';
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
    <div className={`max-w-4xl mx-auto space-y-8 ${isEducator ? 'theme-warm' : ''}`}>
      {/* Masthead */}
      <div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <Overline>{isEducator ? 'Professional learning, from your own classroom' : 'Practice, not courses'}</Overline>
            <h1 className="ed-display mt-3">{me?.firstName ? `${me.firstName}'s practice` : 'My practice'}</h1>
            {isEducator && <p className="text-sm text-muted-foreground mt-2">Grow your teaching one real classroom experiment at a time.</p>}
          </div>
          <div className="flex items-center gap-3">
            <ModeToggle />
            <Button className="gap-1.5 rounded-none" onClick={() => setPicking((p) => !p)}><Plus className="h-4 w-4" /> Choose a credential</Button>
          </div>
        </div>
        <Rule strong className="mt-6" />
        {mine.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-4">
              <Overline>{stateWord}</Overline>
              <div className="flex-1"><Meter value={progress} /></div>
              <div className="ed-num text-sm text-muted-foreground w-10 text-right">{Math.round(progress * 100)}%</div>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">How far you have worked the four-move cycle across all your credentials. It is not a grade, and it does not need to reach 100 percent to submit.</p>
          </div>
        )}
        {guided && (
          <p className="text-sm text-muted-foreground mt-4 max-w-2xl">
            {isEducator
              ? 'You are not sitting a course. You earn each credential by trying something real with your own students, reflecting on what happened, and gathering a little evidence. Work at your own pace; the cycle fills as you go.'
              : 'You are not taking a course. Each credential is a cycle you move through in your own practice: have an experience, reflect on it, name what it means, and try it again. The strip fills as you go.'}
          </p>
        )}
      </div>

      {/* Start here: a warm orientation with clear goals and steps, especially for new candidates. */}
      <Orientation name={me?.firstName} programName={programName} isEducator={isEducator} hasCredentials={mine.length > 0} onStart={() => setPicking(true)} />

      {/* Adaptive learning path: the single most useful next move */}
      <NextMoveBanner move={move} onCta={onNextMove} />

      {guided && mine.length > 0 && (
        <EditorialCard className="p-5 flex items-start gap-3">
          <MessageSquareQuote className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium">Reflect on WhatsApp</div>
            <div className="text-xs text-muted-foreground">Once your number is linked, message {coachName} to reflect on the go, on cheap data. It flows straight into your active credential's cycle.</div>
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
                        <div className="mt-4">
                          <div className="inline-flex items-center gap-1.5 border border-emerald-500/40 text-emerald-700 px-2.5 py-1 ed-overline">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Recognised
                          </div>
                          {m.credential_public_id && <CredentialLink publicId={m.credential_public_id} />}
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

      <LongitudinalTwin coachName={coachName} />

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
