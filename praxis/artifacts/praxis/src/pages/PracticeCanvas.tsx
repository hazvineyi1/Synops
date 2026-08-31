import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGetMe } from '@workspace/api-client-react';
import { apiFetch } from '@/lib/api';
import { getPending, addPending, removePending, loadDraft, saveDraft, type Pending } from '@/lib/offlineStore';
import { demoProfile, type Audience } from '@/lib/demoProfile';
import { NameItDiscovery } from '@/pages/NameItDiscovery';
import { CycleRing } from '@/components/editorial';
import { useBrandTheme } from '@/context/ThemeProvider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Send, Plus, Trash2, CheckCircle2, Lock, BookOpen, Lightbulb, Paperclip, Link2, Loader2, Upload, Download, CloudOff, RefreshCw, Clock, Target, Zap, Check, Trophy, Copy, ShieldCheck, Users, X,
} from 'lucide-react';

/** Offline capture: pending queue + connection status, flushed automatically when back online. */
function useOffline(ccId: string, onSynced: () => void) {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pending, setPending] = useState<Pending[]>(() => getPending(ccId));
  const [flushing, setFlushing] = useState(false);
  const refresh = useCallback(() => setPending(getPending(ccId)), [ccId]);
  const flush = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const items = getPending(ccId);
    if (!items.length) { return; }
    setFlushing(true);
    for (const it of items) {
      try { await apiFetch(it.endpoint, { method: 'POST', body: JSON.stringify(it.payload) }); removePending(it.id); }
      catch { break; } // likely offline again; stop and try later
    }
    setFlushing(false); refresh(); onSynced();
  }, [ccId, refresh, onSynced]);
  useEffect(() => {
    const on = () => { setOnline(true); flush(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    flush();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [flush]);
  const enqueue = useCallback((p: Omit<Pending, 'id' | 'createdAt' | 'ccId'>) => {
    addPending({ ...p, ccId });
    refresh();
    if (typeof navigator === 'undefined' || navigator.onLine) flush();
  }, [ccId, refresh, flush]);
  return { online, pending, flushing, flush, enqueue };
}

/**
 * Authenticity provenance: tracks how a reflection was actually produced, so the portfolio can prove a
 * person did the thinking (typed live) rather than pasting generated text. A trust signal, never a gate.
 */
function useCaptureProvenance() {
  const startRef = useRef<number | null>(null);
  const pasteRef = useRef(0);
  const onType = () => { if (startRef.current == null) startRef.current = Date.now(); };
  const onPaste = () => { pasteRef.current += 1; };
  const read = () => ({
    source: pasteRef.current > 0 ? 'pasted' : 'typed',
    typedMs: startRef.current ? Date.now() - startRef.current : 0,
    pasteCount: pasteRef.current,
  });
  const reset = () => { startRef.current = null; pasteRef.current = 0; };
  return { onType, onPaste, read, reset };
}

/**
 * The Portfolio, rebuilt to adapt to the learning process. It is not a stack of forms: it IS the Kolb
 * cycle. It opens on the move the candidate should make next, foregrounds only that stage's capture
 * tool, tunes Mutale's opening question to that stage, and folds everything already captured into a
 * growing body of work. The gateway appears only when the cycle is whole. No modules, no marks.
 */
type Mine = {
  id: string; credential_id: string; code: string; title: string; summary: string | null;
  activity_brief: string | null; gateway_guidance: string | null; example_assignment: string | null;
  status: string; self_g1: boolean; self_g2: boolean; self_g3: boolean;
  latest_feedback: string | null; latest_outcome: string | null;
  justification: string | null;
};
type Reflection = { id: string; stage: string; content: string; created_at: string };
type Evidence = { id: string; kind: string; title: string | null; body: string | null; url: string | null; created_at: string };
type ChatMsg = { role: 'user' | 'assistant'; content: string; kind?: 'chat' | 'observation' | 'analysis' };

const GIBBS = [
  { key: 'description', label: 'What happened', hint: 'Describe the situation plainly. Who, what, when.' },
  { key: 'feelings', label: 'Feelings', hint: 'How did you feel? How did others feel, or likely feel?' },
  { key: 'evaluation', label: 'Evaluation', hint: 'What was good or bad about it?' },
  { key: 'analysis', label: 'Analysis', hint: 'Why? Bring in a leadership idea only where your decision needs it.' },
  { key: 'conclusion', label: 'Conclusion', hint: 'What is the lesson? What would you do differently?' },
  { key: 'action', label: 'Action', hint: 'What will you do next, and when?' },
  { key: 'note', label: 'Quick note', hint: 'A thought to capture now and come back to.' },
];
const EXTRA_LABELS: Record<string, string> = { prediction: 'Prediction', surprise: 'What surprised me' };
const stageLabel = (k: string) => GIBBS.find((g) => g.key === k)?.label ?? EXTRA_LABELS[k] ?? 'Note';

// The four Kolb moves that organise the portfolio, each mapped to the capture it invites and the
// question Mutale opens with when the candidate is working that move.
const CYCLE = [
  { key: 'e', label: 'Experience', focus: 'Capture what you actually did', reflect: ['description'],
    coach: 'Walk me through what actually happened. Who was involved, and what did you decide?',
    guide: 'Describe what actually happened, in plain words, as if you were telling a colleague over coffee. Who was there? What did you do, step by step? What did you decide, and why? Do not polish it or justify yourself yet, just capture the real moment.',
    starters: ['What actually happened was', 'The moment I mean is', 'I decided to', 'What I did was'],
    strong: 'Specific and first-person: "On Tuesday I noticed two students had stopped writing, so I paired them rather than pushing them on alone, because I judged the block was confidence, not ability." Names a real moment, a decision, and a reason.',
    weak: 'Vague and general: "The lesson went fine and most people did the work." No moment, no decision, nothing a reviewer can actually see you do.' },
  { key: 'r', label: 'Reflect', focus: 'Look back on it', reflect: ['feelings', 'evaluation'],
    coach: 'Before it happened, what did you expect? Where did reality differ, and how did it feel?',
    guide: 'Now look back honestly. How did it feel, for you and for the people involved? What went well, and what did not? What did you expect would happen, and where did it surprise you? The surprise is usually where the learning is.',
    starters: ['I expected', 'What surprised me was', 'It felt', 'What worked was', 'What did not work was'],
    strong: 'Honest and specific: "I expected the pairing to help, but one of them went quieter, not louder. That surprised me, and it made me question whether I had read the room right." Names a real feeling and a genuine surprise.',
    weak: 'Tidy and safe: "It went well and I was happy with it." Nothing you did not already know, and no surprise to learn from.' },
  { key: 'n', label: 'Name it', focus: 'Name the idea it points to', reflect: ['analysis', 'conclusion'],
    coach: 'What does this tell you about how you lead? Try to name the principle underneath it.',
    guide: 'Step back from the single event to the idea underneath it. What does this tell you about how you work? Try to finish this sentence in one line: "What I learned is..." as if it were advice you would give another person.',
    starters: ['What I learned is', 'The principle underneath this is', 'This tells me that', 'What I would say to another person is'],
    strong: 'A portable principle: "What I learned is that a quiet student is giving me information, not resisting me, and my first move should be to find out what, not to push harder." A one-line idea you could hand to someone else.',
    weak: 'A restatement: "I learned that pairing students can help." Just describes the event again, without an idea that travels beyond it.' },
  { key: 't', label: 'Try it', focus: 'Plan your next turn', reflect: ['action'],
    coach: 'Knowing this, what will you do differently the next time?',
    guide: 'Turn the insight into action. What is one concrete thing you will do differently next time, and when? Be specific enough that someone could later check whether you actually did it.',
    starters: ['Next time I will', 'By the end of this week I will', 'The one change I will make is'],
    strong: 'Concrete and checkable: "Next lesson, before I reassign anyone, I will ask each quiet student one question about where they got stuck, and note what they say." Specific enough that you could check whether you did it.',
    weak: 'A good intention: "I will try to be more aware of quiet students." Nothing specific enough to actually do or check.' },
] as const;

/** Which Kolb stages this credential's practice has reached, from evidence + reflection stages. */
function litStages(reflections: Reflection[], evidence: Evidence[]) {
  const has = (s: string) => reflections.some((r) => r.stage === s);
  return {
    e: evidence.length > 0 || has('description'),
    r: has('feelings') || has('evaluation') || has('note') || has('surprise'),
    n: has('analysis') || has('conclusion'),
    t: has('action'),
  } as Record<string, boolean>;
}

export function PracticeCanvas() {
  const [, params] = useRoute('/practice/c/:id');
  const id = params?.id ?? '';
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data: me } = useGetMe();
  const { data: brand } = useBrandTheme();
  const { guided, coachName, themeClass, audience } = demoProfile(brand?.displayName);
  const { data: mine = [] } = useQuery({ queryKey: ['practice-me'], queryFn: () => apiFetch<Mine[]>('/practice/me') });
  const cc = mine.find((m) => m.id === id);
  const { data: reflections = [] } = useQuery({ queryKey: ['practice-reflections', id], queryFn: () => apiFetch<Reflection[]>(`/practice/me/credentials/${id}/reflections`), enabled: !!id });
  const { data: evidence = [] } = useQuery({ queryKey: ['practice-evidence', id], queryFn: () => apiFetch<Evidence[]>(`/practice/me/credentials/${id}/evidence`), enabled: !!id });

  const invalidate = useCallback(() => { qc.invalidateQueries({ queryKey: ['practice-reflections', id] }); qc.invalidateQueries({ queryKey: ['practice-evidence', id] }); qc.invalidateQueries({ queryKey: ['practice-me'] }); }, [qc, id]);
  const off = useOffline(id, invalidate);

  // Entering a credential should start at the top of the page, not wherever the home page was scrolled.
  // The early call can fire before the credential's content has loaded (so the page is still short and
  // the scroll is a no-op); once cc resolves the page grows tall, so we re-assert top then, and again on
  // the next frame after paint. We also turn off the browser's scroll restoration, which would otherwise
  // drop the reader back to their previous position on this URL.
  useEffect(() => {
    if ('scrollRestoration' in history) { try { history.scrollRestoration = 'manual'; } catch { /* ignore */ } }
  }, []);
  useEffect(() => {
    // The app scrolls inside #app-main-scroll (a fixed-height flex layout), not the window - so reset
    // THAT. Re-assert once cc resolves (the page grows tall then) and again on the next frame.
    const toTop = () => {
      const el = document.getElementById('app-main-scroll');
      if (el) el.scrollTop = 0;
      window.scrollTo(0, 0);
    };
    toTop();
    const r = requestAnimationFrame(toTop);
    return () => cancelAnimationFrame(r);
  }, [id, cc?.id]);

  // Opening the canvas starts the credential (chosen -> in progress) so it becomes the active one.
  useEffect(() => {
    if (cc && cc.status === 'chosen') {
      apiFetch(`/practice/me/credentials/${id}`, { method: 'PATCH', body: JSON.stringify({ start: true }) }).then(() => invalidate()).catch(() => {});
    }
  }, [cc?.status, id, invalidate]);

  const submitted = cc?.status === 'submitted' || cc?.status === 'reviewed';
  const readOnly = submitted;

  const lit = litStages(reflections, evidence);
  const litCount = CYCLE.filter((s) => lit[s.key]).length;
  const firstIncomplete = CYCLE.find((s) => !lit[s.key])?.key ?? 't';
  // Adaptive default: the portfolio opens on the next move to make; the candidate can jump anywhere.
  const [picked, setPicked] = useState<string | null>(null);
  const activeStage = picked ?? firstIncomplete;
  const stage = CYCLE.find((s) => s.key === activeStage)!;
  // When the learner writes in a field, nudge the coach to observe it (ongoing commentary / probe).
  const [observeReq, setObserveReq] = useState<{ text: string; n: number } | null>(null);
  const handleLearnerWrote = (text: string) => { if (text && text.trim().length > 12) setObserveReq({ text: text.trim(), n: Date.now() }); };
  // Eve guidance can be turned off entirely; the choice persists, and Eve is always one tap away again.
  const [eveOn, setEveOn] = useState<boolean>(() => { try { return localStorage.getItem('praxis_eve_guidance') !== 'off'; } catch { return true; } });
  const setGuidance = (on: boolean) => { setEveOn(on); try { localStorage.setItem('praxis_eve_guidance', on ? 'on' : 'off'); } catch { /* storage blocked */ } };
  // Educator flow: picking a field opens Eve in a popup that talks the learner through filling that box.
  // Only when guidance is on; with Eve off, fields fall back to writing directly on the page.
  const [eveField, setEveField] = useState<string | null>(null);
  const openEve = guided && !readOnly && eveOn ? (s: string) => setEveField(s) : undefined;

  return (
    <div className={`max-w-6xl mx-auto space-y-4 ${themeClass}`}>
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => navigate('/practice')} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> My credentials</button>
        {guided && !readOnly && (
          <button onClick={() => setGuidance(!eveOn)} role="switch" aria-checked={eveOn}
            className={`inline-flex items-center gap-2.5 rounded-full border px-3 py-1.5 transition-colors ${eveOn ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-border bg-muted/40 hover:bg-muted/60'}`}
            title={eveOn ? `${coachName} is guiding you. Click to write on your own.` : `${coachName} is off. Click to turn guidance back on.`}>
            <span className="text-xs font-semibold text-foreground">{coachName} guidance</span>
            <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${eveOn ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${eveOn ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
            </span>
            <span className={`text-xs font-bold uppercase tracking-wide ${eveOn ? 'text-emerald-600' : 'text-muted-foreground'}`}>{eveOn ? 'On' : 'Off'}</span>
          </button>
        )}
      </div>

      {(!off.online || off.pending.length > 0) && (
        <div className={`flex items-center justify-between gap-3 border p-3 text-sm ${off.online ? 'border-amber-500/30 bg-amber-500/5 text-amber-800' : 'border-muted bg-muted/40 text-muted-foreground'}`}>
          <span className="inline-flex items-center gap-2">
            {off.online ? <Clock className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
            {off.online
              ? `${off.pending.length} change${off.pending.length === 1 ? '' : 's'} saved on your device, waiting to upload.`
              : "You are offline. Keep working, your reflections and notes are saved on this device and will upload when you reconnect."}
          </span>
          {off.online && off.pending.length > 0 && (
            <Button size="sm" variant="outline" disabled={off.flushing} onClick={off.flush} className="gap-1.5 shrink-0 rounded-none">
              <RefreshCw className={`h-3.5 w-3.5 ${off.flushing ? 'animate-spin' : ''}`} /> {off.flushing ? 'Syncing...' : 'Sync now'}
            </Button>
          )}
        </div>
      )}

      {/* Header: the credential and where its cycle stands */}
      <Card className="rounded-none p-5">
        <div className="flex items-start gap-4">
          <CycleRing e={lit.e} r={lit.r} n={lit.n} t={lit.t} />
          <div className="min-w-0 flex-1">
            <div className="ed-overline text-muted-foreground">Practice credential</div>
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              <h1 className="ed-h2">{cc?.title ?? 'Credential'}</h1>
              {cc && <Badge variant="outline" className="text-[10px] capitalize rounded-none">{cc.status.replace('_', ' ')}</Badge>}
            </div>
            {cc?.activity_brief && <p className="mt-2 text-sm"><span className="font-medium">Activity: </span>{cc.activity_brief}</p>}
            <GuidanceStrip cc={cc} />
          </div>
        </div>
        {cc?.latest_feedback && (cc.status === 'reviewed' || cc.status === 'referred') && (
          <div className={`mt-3 border-l-2 pl-3 text-sm ${cc.status === 'reviewed' ? 'border-emerald-500' : 'border-amber-500'}`}>
            <div className="font-medium mb-1">{cc.status === 'reviewed' ? 'Recognised' : 'Referred for resubmission'} · developmental feedback</div>
            <p className="whitespace-pre-wrap text-muted-foreground">{cc.latest_feedback}</p>
          </div>
        )}
      </Card>

      {/* The cognitive twin: the model Mutale holds, shown plainly. Tapping a move opens a field to add it. */}
      <TwinPanel me={me} cc={cc} reflections={reflections} readOnly={readOnly} onSaved={invalidate} coachName={coachName} onLearnerWrote={handleLearnerWrote} onAskEve={openEve} />

      <div className={guided ? '' : 'grid lg:grid-cols-[1fr_380px] gap-4 items-start'}>
        <div className="space-y-4">
          {/* The cycle rail: the portfolio is the cycle, and this is how you move round it. */}
          <div>
            <div className="ed-overline text-muted-foreground mb-2">The cycle</div>
            <StageRail lit={lit} active={activeStage} onPick={setPicked} />
          </div>

          {/* Adaptive focus zone: only the current move's capture tools, unless submitted. */}
          {!submitted && (
            <div className="space-y-4">
              <div>
                <div className="ed-overline text-muted-foreground">{lit[stage.key] ? 'Worked, refine or add more' : `Step ${CYCLE.findIndex((s) => s.key === stage.key) + 1} of 4 · your focus now`}</div>
                <h2 className="ed-h2 mt-1">{stage.focus}</h2>
                <div className="mt-2 border-l-2 border-primary/40 pl-3">
                  <div className="ed-overline text-muted-foreground">How to respond</div>
                  <p className="text-sm text-muted-foreground mt-0.5">{stage.guide}</p>
                </div>
                <WorkedExample strong={examplesFor(stage.key, audience)?.strong ?? stage.strong} weak={examplesFor(stage.key, audience)?.weak ?? stage.weak} />
                {guided && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    {eveOn
                      ? <span>{coachName} is helping you fill each box. <button onClick={() => setGuidance(false)} className="underline ed-underline hover:text-foreground">Turn {coachName} off</button></span>
                      : <span>{coachName} is off, you are writing these yourself. <button onClick={() => setGuidance(true)} className="underline ed-underline text-primary">Bring {coachName} back</button></span>}
                  </div>
                )}
              </div>
              {stage.key === 'e' && (
                <>
                  <EvidencePanel id={id} evidence={evidence} readOnly={readOnly} onChange={invalidate} off={off} showList={false} />
                  <ReflectionPanel key="e" id={id} reflections={reflections} readOnly={readOnly} onChange={invalidate} off={off} focusStages={['description']} showTimeline={false} heading="Describe what happened" starters={stage.starters} onLearnerWrote={handleLearnerWrote} onAskEve={openEve} coachName={coachName} />
                </>
              )}
              {stage.key === 'r' && (
                <>
                  <PredictionPanel key="rp" id={id} reflections={reflections} readOnly={readOnly} onChange={invalidate} showList={false} onLearnerWrote={handleLearnerWrote} onAskEve={openEve} coachName={coachName} />
                  <ReflectionPanel key="r" id={id} reflections={reflections} readOnly={readOnly} onChange={invalidate} off={off} focusStages={['feelings', 'evaluation']} showTimeline={false} heading="Look back on it" starters={stage.starters} onLearnerWrote={handleLearnerWrote} onAskEve={openEve} coachName={coachName} />
                </>
              )}
              {stage.key === 'n' && (
                <>
                  {audience === 'leadership' && !readOnly && <NameItDiscovery id={id} coachName={coachName} onSaved={invalidate} />}
                  <ReflectionPanel key="n" id={id} reflections={reflections} readOnly={readOnly} onChange={invalidate} off={off} focusStages={['analysis', 'conclusion']} showTimeline={false} heading="Name the idea it points to" starters={stage.starters} onLearnerWrote={handleLearnerWrote} onAskEve={openEve} coachName={coachName} />
                </>
              )}
              {stage.key === 't' && (
                <ReflectionPanel key="t" id={id} reflections={reflections} readOnly={readOnly} onChange={invalidate} off={off} focusStages={['action']} showTimeline={false} heading="Plan your next turn" starters={stage.starters} onLearnerWrote={handleLearnerWrote} onAskEve={openEve} coachName={coachName} />
              )}
            </div>
          )}

          {/* The growing body of work: everything captured, read-only, always here. */}
          <BodyOfWork reflections={reflections} evidence={evidence} />

          {/* Third-party attestation: outside corroboration, the strongest authenticity signal. */}
          {cc && <AttestationPanel id={id} readOnly={readOnly} />}

          {/* Connectivism: share your recognised practice, and learn from peers who worked the same credential. */}
          {cc && cc.status === 'reviewed' && <ExemplarShare id={id} />}
          {cc && <PeerExemplars credentialId={cc.credential_id} />}

          {/* The gateway opens only when the cycle is whole. */}
          {!submitted && (litCount >= 4
            ? <GatewaySubmit cc={cc} reflections={reflections.length} evidence={evidence.length} onChange={invalidate} />
            : (
              <Card className="rounded-none p-5 flex items-center gap-3 text-sm text-muted-foreground">
                <Lock className="h-4 w-4 shrink-0" />
                Work all four moves of the cycle to open the gateway. {4 - litCount} to go.
              </Card>
            ))}
          {submitted && <GatewaySubmit cc={cc} reflections={reflections.length} evidence={evidence.length} onChange={invalidate} />}
        </div>

        {/* The wider coach panel is only for the leadership programme; educators use the focused popup. */}
        {!guided && <CoachPanel cc={cc} stageHint={submitted ? undefined : stage.coach} coachName={coachName} observeReq={observeReq} onCaptured={invalidate} readOnly={readOnly} />}
      </div>

      {/* The coach, focused on one box: opens when the learner picks a field (guided flow). */}
      {eveField && cc && (
        <EveFieldModal ccId={cc.id} stage={eveField} coachName={coachName} audience={audience} guidance={eveOn} onGuidanceChange={setGuidance} onClose={() => setEveField(null)} onSaved={invalidate} />
      )}
    </div>
  );
}

function GuidanceStrip({ cc }: { cc: any }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!cc) return null;
  const items = [
    { k: 'gateway', label: 'How this is reviewed', icon: CheckCircle2, body: cc.gateway_guidance },
    { k: 'example', label: 'Example', icon: BookOpen, body: cc.example_assignment },
  ].filter((i) => i.body);
  if (!items.length) return null;
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <button key={i.k} onClick={() => setOpen(open === i.k ? null : i.k)}
            className={`inline-flex items-center gap-1.5 border px-3 py-1 text-xs ${open === i.k ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
            <i.icon className="h-3.5 w-3.5" /> {i.label}
          </button>
        ))}
      </div>
      {items.filter((i) => i.k === open).map((i) => (
        <p key={i.k} className="bg-muted/40 p-3 text-xs text-muted-foreground whitespace-pre-wrap">{i.body}</p>
      ))}
    </div>
  );
}

function StageRail({ lit, active, onPick }: { lit: Record<string, boolean>; active: string; onPick: (k: string) => void }) {
  return (
    <div className="grid grid-cols-4 border border-foreground/15">
      {CYCLE.map((s, i) => {
        const on = lit[s.key]; const cur = active === s.key;
        return (
          <button key={s.key} onClick={() => onPick(s.key)} aria-current={cur}
            className={`px-3 py-3 text-left border-foreground/15 transition-colors ${i > 0 ? 'border-l' : ''} ${cur ? 'bg-foreground text-background' : 'hover:bg-muted/40'}`}>
            <div className={`ed-overline inline-flex items-center gap-1.5 ${cur ? 'opacity-80' : on ? 'text-primary' : 'text-muted-foreground'}`}>
              {on ? <Check className="h-3 w-3" /> : <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-50" />}
              {String(i + 1).padStart(2, '0')}
            </div>
            <div className={`text-xs font-medium mt-1 ${cur || on ? '' : 'text-muted-foreground'}`}>{s.label}</div>
          </button>
        );
      })}
    </div>
  );
}

/** A collapsible pair of examples so learners see what a strong vs weak response looks like. */
function WorkedExample({ strong, weak }: { strong: string; weak: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen((o) => !o)} className="ed-overline text-primary underline ed-underline">
        {open ? 'Hide the examples' : 'See a strong vs weak response'}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="border-l-2 border-emerald-500 pl-3">
            <div className="ed-overline text-emerald-700">Strong</div>
            <p className="text-sm text-muted-foreground mt-0.5">{strong}</p>
          </div>
          <div className="border-l-2 border-amber-500 pl-3">
            <div className="ed-overline text-amber-700">Weak</div>
            <p className="text-sm text-muted-foreground mt-0.5">{weak}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** The read-only portfolio: everything captured so far, folded into one calm view. */
function BodyOfWork({ reflections, evidence }: { reflections: Reflection[]; evidence: Evidence[] }) {
  const predictions = reflections.filter((r) => r.stage === 'prediction');
  const surprises = reflections.filter((r) => r.stage === 'surprise');
  const timeline = reflections.filter((r) => r.stage !== 'prediction' && r.stage !== 'surprise');
  const pairCount = Math.max(predictions.length, surprises.length);
  if (!reflections.length && !evidence.length) return null;
  return (
    <Card className="rounded-none p-5 space-y-4">
      <div className="ed-overline text-foreground">Your body of work so far</div>

      {pairCount > 0 && (
        <div className="space-y-2">
          <div className="ed-overline text-muted-foreground inline-flex items-center gap-1.5"><Target className="h-3 w-3" /> Predictions and surprises</div>
          <ol className="space-y-2">
            {Array.from({ length: pairCount }).map((_, i) => {
              const p = predictions[i]; const s = surprises[i];
              return (
                <li key={i} className="border border-border">
                  {p && <div className="p-2.5 border-b border-border"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">You expected</div><p className="text-sm whitespace-pre-wrap">{p.content}</p></div>}
                  {s && <div className="p-2.5 bg-amber-500/5"><div className="text-[11px] uppercase tracking-wide text-amber-700">What happened</div><p className="text-sm whitespace-pre-wrap">{s.content}</p></div>}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {timeline.length > 0 && (
        <div className="space-y-2">
          <div className="ed-overline text-muted-foreground inline-flex items-center gap-1.5"><Lightbulb className="h-3 w-3" /> Reflection</div>
          <ol className="space-y-2 border-l-2 border-border pl-4">
            {timeline.map((r) => (
              <li key={r.id} className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary/60" />
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{stageLabel(r.stage)} · {new Date(r.created_at).toLocaleDateString()}</div>
                <p className="text-sm whitespace-pre-wrap">{r.content}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {evidence.length > 0 && (
        <div className="space-y-2">
          <div className="ed-overline text-muted-foreground inline-flex items-center gap-1.5"><Paperclip className="h-3 w-3" /> Evidence</div>
          <ul className="space-y-2">
            {evidence.map((e) => (
              <li key={e.id} className="border border-border bg-muted/20 p-2.5">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {e.kind === 'link' ? <Link2 className="h-3.5 w-3.5 text-blue-600" /> : e.kind === 'file' ? <Download className="h-3.5 w-3.5 text-emerald-600" /> : <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />}
                  {e.kind === 'file' && e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{e.title || 'File'}</a> : (e.title || (e.kind === 'link' ? 'Link' : 'Note'))}
                </div>
                {e.body && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{e.body}</p>}
                {e.url && e.kind !== 'file' && <a href={e.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline break-all">{e.url}</a>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function TwinPanel({ me, cc, reflections, readOnly, onSaved, coachName = 'Mutale', onLearnerWrote, onAskEve }: { me: any; cc: Mine | undefined; reflections: Reflection[]; readOnly?: boolean; onSaved?: () => void; coachName?: string; onLearnerWrote?: (text: string) => void; onAskEve?: (stage: string) => void }) {
  const [openHint, setOpenHint] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const prov = useCaptureProvenance();
  if (!cc) return null;
  const name = me?.firstName;
  const counts: Record<string, number> = {};
  for (const r of reflections) counts[r.stage] = (counts[r.stage] ?? 0) + 1;
  const earned = MOVES.filter((m) => counts[m.key]).length;
  const complete = earned === MOVES.length;
  const pick = (key: string) => { setOpenHint((cur) => (cur === key ? null : key)); setDraft(''); prov.reset(); };
  const openMove = MOVES.find((m) => m.key === openHint);
  const save = async () => {
    const text = draft.trim();
    if (!text || !openHint) return;
    setBusy(true);
    try { await apiFetch(`/practice/me/credentials/${cc.id}/reflections`, { method: 'POST', body: JSON.stringify({ stage: openHint, content: text, ...prov.read() }) }); setDraft(''); prov.reset(); onSaved?.(); onLearnerWrote?.(text); }
    catch { /* keep the text to retry */ } finally { setBusy(false); }
  };

  return (
    <Card className="rounded-none p-5 space-y-4 border-primary/20">
      <div>
        <div className="ed-overline text-foreground">What {coachName} is learning about how you lead</div>
        <p className="text-xs text-muted-foreground mt-1">This is the model your coach holds{name ? `, ${name}` : ''}, drawn only from your own words. {coachName} remembers it so you do not have to, and uses it to make its questions personal. It never replaces your thinking.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="border border-border p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Your prior practice, in your words</div>
          <p className="text-sm mt-1 whitespace-pre-wrap">{cc.justification?.trim() || `Not captured yet. Tell ${coachName} why this credential fits your real work.`}</p>
        </div>
        <div className="border border-border p-3 flex items-center gap-3">
          <ReflectiveRing earned={earned} total={MOVES.length} />
          <div className="min-w-0">
            <div className="text-sm font-medium">Reflective range</div>
            <div className="text-xs text-muted-foreground">{complete ? 'Full range explored. Strong work.' : `${earned} of ${MOVES.length} moves explored, tap one to add it`}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {MOVES.map((m) => {
            const n = counts[m.key] ?? 0; const got = n > 0; const active = openHint === m.key;
            return (
              <button key={m.key} type="button" onClick={() => (onAskEve ? onAskEve(m.key) : pick(m.key))}
                aria-pressed={active}
                className={`group relative text-left border p-2.5 transition-all duration-200 hover:-translate-y-0.5 ${
                  active ? 'border-primary bg-primary/10 ring-2 ring-primary/50'
                    : got ? 'border-primary/40 bg-primary/5 hover:bg-primary/10'
                      : 'border-dashed border-border hover:border-primary/30'
                }`}>
                <div className="flex items-center gap-2 pr-5">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${got ? 'bg-primary text-primary-foreground' : active ? 'border-2 border-primary text-transparent' : 'border border-border text-transparent'}`}>
                    <Check className="h-3 w-3" />
                  </span>
                  <span className={`text-xs font-medium truncate ${got || active ? '' : 'text-muted-foreground'}`}>{m.label}</span>
                </div>
                {got && <span className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-primary/15 px-1 text-center text-[10px] font-medium text-primary">{n}</span>}
              </button>
            );
          })}
        </div>

        {openHint && openMove && (
          <div className="border border-primary/40 bg-primary/5 p-3 space-y-2">
            <div className="text-xs font-medium">{openMove.label}</div>
            <p className="text-xs text-muted-foreground">{openMove.hint} {counts[openHint] ? `You have worked this ${counts[openHint]} time${counts[openHint] === 1 ? '' : 's'}.` : 'Not yet in your portfolio.'}</p>
            {!readOnly && (
              <>
                <textarea value={draft} onChange={(e) => { setDraft(e.target.value); prov.onType(); }} onPaste={prov.onPaste} rows={3} autoFocus
                  placeholder={`Write your ${openMove.label.toLowerCase()}...`}
                  className="w-full rounded-none border border-input bg-background px-3 py-2 text-sm" />
                <div className="flex justify-end">
                  <Button size="sm" disabled={!draft.trim() || busy} onClick={save} className="gap-1.5 rounded-none">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add to portfolio
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {complete && (
          <div className="flex items-center gap-2 border border-primary/30 bg-primary/5 p-2.5 text-xs font-medium text-primary">
            <Trophy className="h-4 w-4" /> Full reflective range: you have worked every move of the cycle.
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground border-t border-border pt-2">Cognitive twin and co-regulation with AI. {coachName} carries the memory and the structure, beneficial offloading, so your attention stays on the thinking that only you can do.</p>
    </Card>
  );
}

const MOVES = [
  { key: 'description', label: 'What happened', hint: 'Describe the situation plainly: who, what, when.' },
  { key: 'feelings', label: 'Feelings', hint: 'Name how you felt, and how others felt or likely felt.' },
  { key: 'evaluation', label: 'Evaluation', hint: 'What was good or bad about how it went?' },
  { key: 'analysis', label: 'Analysis', hint: 'Why did it unfold that way? Bring in an idea where your decision needs it.' },
  { key: 'conclusion', label: 'Conclusion', hint: 'What is the lesson? What would you do differently?' },
  { key: 'action', label: 'Action', hint: 'What will you do next, and when?' },
  { key: 'prediction', label: 'Prediction', hint: 'What did you expect to happen beforehand?' },
  { key: 'surprise', label: 'Surprise', hint: 'Where did reality differ from your prediction?' },
];

function ReflectiveRing({ earned, total }: { earned: number; total: number }) {
  const r = 20, c = 2 * Math.PI * r, pct = total ? earned / total : 0;
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 shrink-0" aria-hidden="true">
      <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" className="stroke-muted-foreground/25" />
      <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" strokeLinecap="round" transform="rotate(-90 24 24)"
        className="stroke-primary" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      <text x="24" y="28" textAnchor="middle" className="fill-foreground ed-num" style={{ fontSize: 13, fontWeight: 600 }}>{earned}</text>
    </svg>
  );
}

function PredictionPanel({ id, reflections, readOnly, onChange, showList = true, onLearnerWrote, onAskEve, coachName = 'Eve' }: { id: string; reflections: Reflection[]; readOnly: boolean; onChange: () => void; showList?: boolean; onLearnerWrote?: (text: string) => void; onAskEve?: (stage: string) => void; coachName?: string }) {
  const predictions = reflections.filter((r) => r.stage === 'prediction');
  const surprises = reflections.filter((r) => r.stage === 'surprise');
  const pairCount = Math.max(predictions.length, surprises.length);
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [busy, setBusy] = useState(false);
  const endpoint = `/practice/me/credentials/${id}/reflections`;
  const prov = useCaptureProvenance();
  const save = async () => {
    const e = expected.trim(), a = actual.trim();
    if (!e && !a) return;
    const p = prov.read();
    setBusy(true);
    try {
      if (e) await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ stage: 'prediction', content: e, ...p }) });
      if (a) await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ stage: 'surprise', content: a, ...p }) });
      setExpected(''); setActual(''); prov.reset(); onChange(); onLearnerWrote?.(`${e} ${a}`.trim());
    } catch { /* leave the text in place to retry */ } finally { setBusy(false); }
  };
  return (
    <Card className="rounded-none p-5 space-y-3">
      <div className="flex items-center gap-2 ed-overline text-foreground"><Target className="h-4 w-4 text-primary" /> Prediction and surprise</div>
      <p className="text-xs text-muted-foreground">Name what you expected before it happened, then what actually happened. The gap between them, the surprise, is where the learning is. This is predictive processing: a broken prediction teaches you the most.</p>
      {showList && pairCount > 0 && (
        <ol className="space-y-3">
          {Array.from({ length: pairCount }).map((_, i) => {
            const p = predictions[i]; const s = surprises[i];
            return (
              <li key={i} className="border border-border overflow-hidden">
                {p && (
                  <div className="p-3 border-b border-border">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1"><Target className="h-3 w-3" /> You expected</div>
                    <p className="text-sm whitespace-pre-wrap mt-0.5">{p.content}</p>
                  </div>
                )}
                {s && (
                  <div className="p-3 bg-amber-500/5">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-amber-700 inline-flex items-center gap-1"><Zap className="h-3 w-3" /> What actually happened</div>
                    <p className="text-sm whitespace-pre-wrap mt-0.5">{s.content}</p>
                  </div>
                )}
                {p && s && <div className="px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/40">The gap is your prediction error, the insight lives here.</div>}
              </li>
            );
          })}
        </ol>
      )}
      {!readOnly && onAskEve && (
        <>
          <button type="button" onClick={() => onAskEve('prediction')}
            className="w-full inline-flex items-center justify-center gap-2 border border-primary bg-primary/10 text-primary px-3 py-2 text-sm font-medium hover:bg-primary/15">
            Talk to {coachName} about what you expected
          </button>
          <div className="ed-overline text-muted-foreground text-center">or write it yourself</div>
        </>
      )}
      {!readOnly && (
        <div className="space-y-2 border border-border p-3">
          <div>
            <label className="text-xs font-medium">Before it happened, I expected...</label>
            <textarea value={expected} onChange={(e) => { setExpected(e.target.value); prov.onType(); }} onPaste={prov.onPaste} rows={2} placeholder="What did you think would happen?" className="mt-1 w-full rounded-none border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium">What actually happened, what surprised me...</label>
            <textarea value={actual} onChange={(e) => { setActual(e.target.value); prov.onType(); }} onPaste={prov.onPaste} rows={2} placeholder="Where did reality differ from your prediction?" className="mt-1 w-full rounded-none border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={busy || (!expected.trim() && !actual.trim())} onClick={save} className="gap-1.5 rounded-none"><Plus className="h-4 w-4" /> Log prediction</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ReflectionPanel({ id, reflections, readOnly, onChange, off, focusStages, showTimeline = true, heading = 'Reflection', starters, onLearnerWrote, onAskEve, coachName = 'Eve' }: { id: string; reflections: Reflection[]; readOnly: boolean; onChange: () => void; off: ReturnType<typeof useOffline>; focusStages?: string[]; showTimeline?: boolean; heading?: string; starters?: string[]; onLearnerWrote?: (text: string) => void; onAskEve?: (stage: string) => void; coachName?: string }) {
  const draftKey = `refl_${id}_${focusStages ? focusStages.join('-') : 'all'}`;
  const stagesToShow = focusStages ? GIBBS.filter((g) => focusStages.includes(g.key)) : GIBBS;
  const [stage, setStage] = useState(focusStages ? focusStages[0] : 'note');
  const [content, setContent] = useState(() => loadDraft(draftKey));
  const [busy, setBusy] = useState(false);
  useEffect(() => { saveDraft(draftKey, content); }, [content, draftKey]);
  const endpoint = `/practice/me/credentials/${id}/reflections`;
  const pendingReflections = off.pending.filter((p) => p.kind === 'reflection');
  const timeline = reflections.filter((r) => r.stage !== 'prediction' && r.stage !== 'surprise');
  const prov = useCaptureProvenance();

  const submitReflection = async () => {
    const text = content.trim();
    if (!text) return;
    const payload = { stage, content: text, ...prov.read() };
    setBusy(true);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      off.enqueue({ kind: 'reflection', endpoint, payload, display: text, stage });
      setContent(''); saveDraft(draftKey, ''); prov.reset(); setBusy(false); return;
    }
    try { await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(payload) }); setContent(''); saveDraft(draftKey, ''); prov.reset(); onChange(); onLearnerWrote?.(text); }
    catch { off.enqueue({ kind: 'reflection', endpoint, payload, display: text, stage }); setContent(''); saveDraft(draftKey, ''); prov.reset(); }
    finally { setBusy(false); }
  };

  return (
    <Card className="rounded-none p-5 space-y-3">
      <div className="flex items-center gap-2 ed-overline text-foreground"><Lightbulb className="h-4 w-4 text-primary" /> {heading}</div>
      {!focusStages && <p className="text-xs text-muted-foreground">Reflection happens over time and in bits. Capture a thought whenever it comes, and work the stages as you go. Learning becomes visible here.</p>}

      {showTimeline && (timeline.length > 0 || pendingReflections.length > 0) && (
        <ol className="space-y-2 border-l-2 border-border pl-4">
          {timeline.map((r) => (
            <li key={r.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary/60" />
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{stageLabel(r.stage)} · {new Date(r.created_at).toLocaleDateString()}</div>
              <p className="text-sm whitespace-pre-wrap">{r.content}</p>
            </li>
          ))}
          {pendingReflections.map((p) => (
            <li key={p.id} className="relative opacity-70">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-amber-500/70" />
              <div className="text-[11px] font-medium uppercase tracking-wide text-amber-700 inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {stageLabel(p.stage || 'note')} · saved on device</div>
              <p className="text-sm whitespace-pre-wrap">{p.payload.content}</p>
            </li>
          ))}
        </ol>
      )}

      {!readOnly && (
        <div className="space-y-2 border border-border p-3">
          {stagesToShow.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {stagesToShow.map((g) => (
                <button key={g.key} onClick={() => setStage(g.key)}
                  className={`px-2.5 py-1 text-xs ${stage === g.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>{g.label}</button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{GIBBS.find((g) => g.key === stage)?.hint}</p>
          {onAskEve && (
            <>
              <button type="button" onClick={() => onAskEve(stage)}
                className="w-full inline-flex items-center justify-center gap-2 border border-primary bg-primary/10 text-primary px-3 py-2 text-sm font-medium hover:bg-primary/15">
                Talk to {coachName} to fill this
              </button>
              <div className="ed-overline text-muted-foreground text-center">or write it yourself</div>
            </>
          )}
          {starters && starters.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[11px] text-muted-foreground self-center">Stuck? Start with:</span>
              {starters.map((s) => (
                <button key={s} type="button" onClick={() => { setContent((c) => (c ? `${c} ${s} ` : `${s} `)); prov.onType(); }}
                  className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-[11px] text-primary hover:bg-primary/10">{s}…</button>
              ))}
            </div>
          )}
          <textarea value={content} onChange={(e) => { setContent(e.target.value); prov.onType(); }} onPaste={prov.onPaste} rows={3} placeholder="Write your reflection..."
            className="w-full rounded-none border border-input bg-background px-3 py-2 text-sm" />
          <div className="flex justify-end">
            <Button size="sm" disabled={!content.trim() || busy} onClick={submitReflection} className="gap-1.5 rounded-none"><Plus className="h-4 w-4" /> Add to reflection</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function EvidencePanel({ id, evidence, readOnly, onChange, off, showList = true }: { id: string; evidence: Evidence[]; readOnly: boolean; onChange: () => void; off: ReturnType<typeof useOffline>; showList?: boolean }) {
  const [kind, setKind] = useState<'text' | 'link' | 'file'>('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endpoint = `/practice/me/credentials/${id}/evidence`;
  const pendingEvidence = off.pending.filter((p) => p.kind === 'evidence');

  const submitEvidence = async () => {
    const payload = { kind, title: title.trim() || null, body: kind === 'text' ? body.trim() : null, url: kind === 'link' ? url.trim() : null };
    const display = title.trim() || (kind === 'link' ? url.trim() : body.trim());
    setBusy(true);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      off.enqueue({ kind: 'evidence', endpoint, payload, display }); setTitle(''); setBody(''); setUrl(''); setBusy(false); return;
    }
    try { await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(payload) }); setTitle(''); setBody(''); setUrl(''); onChange(); }
    catch { off.enqueue({ kind: 'evidence', endpoint, payload, display }); setTitle(''); setBody(''); setUrl(''); }
    finally { setBusy(false); }
  };
  const del = useMutation({ mutationFn: (eid: string) => apiFetch(`/practice/me/evidence/${eid}`, { method: 'DELETE' }), onSuccess: onChange });

  const upload = async (file: File) => {
    setErr(null); setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('read failed')); r.readAsDataURL(file);
      });
      const dataBase64 = dataUrl.split(',')[1] ?? '';
      await apiFetch(`/practice/me/credentials/${id}/evidence/upload`, { method: 'POST', body: JSON.stringify({ filename: file.name, dataBase64, title: title.trim() || file.name }) });
      setTitle(''); onChange();
      if (fileRef.current) fileRef.current.value = '';
    } catch (e: any) {
      setErr(e?.message ?? 'Could not upload that file.');
    } finally { setUploading(false); }
  };

  return (
    <Card className="rounded-none p-5 space-y-3">
      <div className="flex items-center gap-2 ed-overline text-foreground"><Paperclip className="h-4 w-4 text-primary" /> Evidence</div>
      <p className="text-xs text-muted-foreground">Show what you actually did: a note, a link, or a file (a document, a photo of your work, a voice note). Different experiences produce different, valid evidence.</p>

      {showList && evidence.length > 0 && (
        <ul className="space-y-2">
          {evidence.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-2 border border-border bg-muted/20 p-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {e.kind === 'link' ? <Link2 className="h-3.5 w-3.5 text-blue-600" /> : e.kind === 'file' ? <Download className="h-3.5 w-3.5 text-emerald-600" /> : <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />}
                  {e.kind === 'file' && e.url
                    ? <a href={e.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{e.title || 'File'}</a>
                    : (e.title || (e.kind === 'link' ? 'Link' : 'Note'))}
                </div>
                {e.body && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{e.body}</p>}
                {e.url && e.kind !== 'file' && <a href={e.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline break-all">{e.url}</a>}
              </div>
              {!readOnly && <button onClick={() => del.mutate(e.id)} className="text-destructive hover:text-destructive/80 shrink-0" title="Remove"><Trash2 className="h-4 w-4" /></button>}
            </li>
          ))}
        </ul>
      )}

      {pendingEvidence.length > 0 && (
        <ul className="space-y-2">
          {pendingEvidence.map((p) => (
            <li key={p.id} className="flex items-start gap-2 border border-amber-500/30 bg-amber-500/5 p-2.5 opacity-80">
              <Clock className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium">{p.payload.title || (p.payload.kind === 'link' ? 'Link' : 'Note')} <span className="text-[11px] font-normal text-amber-700">· saved on device</span></div>
                {p.payload.body && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{p.payload.body}</p>}
                {p.payload.url && <span className="text-xs text-primary break-all">{p.payload.url}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="space-y-2 border border-border p-3">
          <div className="flex gap-1.5">
            <button onClick={() => setKind('text')} className={`px-2.5 py-1 text-xs ${kind === 'text' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>Note</button>
            <button onClick={() => setKind('link')} className={`px-2.5 py-1 text-xs ${kind === 'link' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>Link</button>
            <button onClick={() => setKind('file')} className={`px-2.5 py-1 text-xs ${kind === 'file' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>File</button>
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="w-full rounded-none border border-input bg-background px-3 py-2 text-sm" />
          {kind === 'text' && <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Describe the evidence..." className="w-full rounded-none border border-input bg-background px-3 py-2 text-sm" />}
          {kind === 'link' && <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="w-full rounded-none border border-input bg-background px-3 py-2 text-sm" />}
          {kind === 'file' && (
            <div>
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
              <Button size="sm" variant="outline" className="gap-1.5 rounded-none" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {uploading ? 'Uploading...' : 'Choose a file'}
              </Button>
              {err && <p className="text-xs text-rose-600 mt-1.5">{err}</p>}
            </div>
          )}
          {kind !== 'file' && (
            <div className="flex justify-end">
              <Button size="sm" disabled={busy || (kind === 'text' ? !body.trim() : !url.trim())} onClick={submitEvidence} className="gap-1.5 rounded-none"><Plus className="h-4 w-4" /> Add evidence</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

type Attestation = { id: string; token: string; relationship: string; prompt: string; attester_name: string | null; status: string; response_name: string | null; response_role: string | null; response_comment: string | null; responded_at: string | null };
const REL_LABELS: [string, string][] = [['manager', 'Manager'], ['peer', 'Colleague'], ['report', 'Someone I lead'], ['other', 'Other']];

function AttestationPanel({ id, readOnly }: { id: string; readOnly: boolean }) {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({ queryKey: ['practice-attest', id], queryFn: () => apiFetch<Attestation[]>(`/practice/me/credentials/${id}/attestations`), enabled: !!id });
  const [rel, setRel] = useState('manager');
  const [prompt, setPrompt] = useState('');
  const [who, setWho] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const create = useMutation({ mutationFn: () => apiFetch(`/practice/me/credentials/${id}/attestations`, { method: 'POST', body: JSON.stringify({ relationship: rel, prompt: prompt.trim(), attesterName: who.trim() || null }) }), onSuccess: () => { setPrompt(''); setWho(''); qc.invalidateQueries({ queryKey: ['practice-attest', id] }); } });
  const del = useMutation({ mutationFn: (aid: string) => apiFetch(`/practice/me/attestations/${aid}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['practice-attest', id] }) });
  const link = (t: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/attest/${t}`;
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(link(t)); setCopied(t); setTimeout(() => setCopied(null), 2000); } catch { /* clipboard blocked */ } };
  const relLabel = (k: string) => REL_LABELS.find((r) => r[0] === k)?.[1] ?? k;

  return (
    <Card className="rounded-none p-5 space-y-3">
      <div className="flex items-center gap-2 ed-overline text-foreground"><ShieldCheck className="h-4 w-4 text-primary" /> Third-party attestation</div>
      <p className="text-xs text-muted-foreground">Ask someone who was there, a manager, a colleague, or someone you lead, to confirm the real event happened and that it was you. Create a link and send it to them yourself. Their confirmation is the strongest proof your portfolio can carry.</p>

      {list.length > 0 && (
        <ul className="space-y-2">
          {list.map((a) => (
            <li key={a.id} className={`border p-3 text-sm ${a.status === 'confirmed' ? 'border-emerald-500/40 bg-emerald-500/5' : a.status === 'declined' ? 'border-rose-500/40 bg-rose-500/5' : 'border-border'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="ed-overline text-muted-foreground">{a.status === 'confirmed' ? 'Confirmed' : a.status === 'declined' ? 'Declined' : 'Awaiting response'} · {relLabel(a.relationship)}</span>
                {a.status === 'pending' && !readOnly && <button onClick={() => del.mutate(a.id)} className="text-destructive hover:text-destructive/80" title="Revoke"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{a.prompt}</p>
              {a.status === 'confirmed' && <p className="text-xs mt-1.5"><CheckCircle2 className="h-3.5 w-3.5 inline text-emerald-600 mr-1" />{a.response_name}{a.response_role ? `, ${a.response_role}` : ''}{a.response_comment ? ` — "${a.response_comment}"` : ''}</p>}
              {a.status === 'pending' && (
                <div className="mt-2 flex items-center gap-2">
                  <input readOnly value={link(a.token)} onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 rounded-none border border-input bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground" />
                  <Button size="sm" variant="outline" className="gap-1.5 rounded-none shrink-0" onClick={() => copy(a.token)}>{copied === a.token ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied === a.token ? 'Copied' : 'Copy link'}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="space-y-2 border border-border p-3">
          <div className="flex flex-wrap gap-1.5">
            {REL_LABELS.map(([k, l]) => (
              <button key={k} onClick={() => setRel(k)} className={`px-2.5 py-1 text-xs ${rel === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>{l}</button>
            ))}
          </div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} placeholder="What should they confirm? e.g. That I led the ward through the night the power failed, in March." className="w-full rounded-none border border-input bg-background px-3 py-2 text-sm" />
          <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Their name (optional, just for your reference)" className="w-full rounded-none border border-input bg-background px-3 py-2 text-sm" />
          <div className="flex justify-end">
            <Button size="sm" disabled={!prompt.trim() || create.isPending} onClick={() => create.mutate()} className="gap-1.5 rounded-none"><Plus className="h-4 w-4" /> Create attestation link</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

type Exemplar = { headline: string; excerpt: string | null; author_name: string | null; created_at: string };
function PeerExemplars({ credentialId }: { credentialId: string }) {
  const { data = [] } = useQuery({ queryKey: ['practice-exemplars', credentialId], queryFn: () => apiFetch<Exemplar[]>(`/practice/exemplars/${credentialId}`), enabled: !!credentialId });
  if (!data.length) return null;
  return (
    <Card className="rounded-none p-5 space-y-3">
      <div className="flex items-center gap-2 ed-overline text-foreground"><Users className="h-4 w-4 text-primary" /> Learn from peers</div>
      <p className="text-xs text-muted-foreground">How others in your programme approached this credential. Learning is also connection.</p>
      <ul className="space-y-2">
        {data.map((e, i) => (
          <li key={i} className="border border-border p-3">
            <div className="text-sm font-medium">{e.headline}</div>
            {e.excerpt && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{e.excerpt}</p>}
            <div className="text-[11px] text-muted-foreground mt-1">{e.author_name || 'A peer'}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

type MyExemplar = { id: string; headline: string; excerpt: string | null; author_name: string | null } | null;
function ExemplarShare({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: mine } = useQuery({ queryKey: ['practice-my-exemplar', id], queryFn: () => apiFetch<MyExemplar>(`/practice/me/credentials/${id}/exemplar`), enabled: !!id });
  const [headline, setHeadline] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [anon, setAnon] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (mine) { setHeadline(mine.headline); setExcerpt(mine.excerpt || ''); setAnon(!mine.author_name); } }, [mine]);
  const save = useMutation({ mutationFn: () => apiFetch(`/practice/me/credentials/${id}/exemplar`, { method: 'POST', body: JSON.stringify({ headline: headline.trim(), excerpt: excerpt.trim(), anonymous: anon }) }), onSuccess: () => { setOpen(false); qc.invalidateQueries({ queryKey: ['practice-my-exemplar', id] }); } });
  const del = useMutation({ mutationFn: () => apiFetch(`/practice/me/credentials/${id}/exemplar`, { method: 'DELETE' }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['practice-my-exemplar', id] }); setOpen(false); } });
  const shared = !!mine;
  return (
    <Card className="rounded-none p-5 space-y-3">
      <div className="flex items-center gap-2 ed-overline text-foreground"><Users className="h-4 w-4 text-primary" /> Share with peers</div>
      <p className="text-xs text-muted-foreground">Your credential is recognised. You can share a short headline and an excerpt to help others in your programme learn from your practice. Optional, and only what you choose.</p>
      {shared && !open ? (
        <div className="border border-emerald-500/40 bg-emerald-500/5 p-3">
          <div className="text-sm font-medium">{mine!.headline}</div>
          {mine!.excerpt && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{mine!.excerpt}</p>}
          <div className="text-[11px] text-muted-foreground mt-1">Shared as {mine!.author_name || 'anonymous'}</div>
          <div className="flex gap-4 mt-2">
            <button onClick={() => setOpen(true)} className="ed-overline text-foreground underline">Edit</button>
            <button onClick={() => del.mutate()} className="ed-overline text-destructive">Unshare</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 border border-border p-3">
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="A one-line headline, e.g. Forming a team no one wanted to join." className="w-full rounded-none border border-input bg-background px-3 py-2 text-sm" />
          <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={3} placeholder="An excerpt worth sharing (optional). Choose what you are comfortable with." className="w-full rounded-none border border-input bg-background px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Share anonymously</label>
          <div className="flex justify-end gap-2">
            {shared && <Button size="sm" variant="outline" className="rounded-none" onClick={() => setOpen(false)}>Cancel</Button>}
            <Button size="sm" disabled={!headline.trim() || save.isPending} onClick={() => save.mutate()} className="gap-1.5 rounded-none"><Plus className="h-4 w-4" /> {shared ? 'Update' : 'Share'} exemplar</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function GatewaySubmit({ cc, reflections, evidence, onChange }: { cc: Mine | undefined; reflections: number; evidence: number; onChange: () => void }) {
  const qc = useQueryClient();
  const patch = useMutation({
    mutationFn: (body: any) => apiFetch(`/practice/me/credentials/${cc!.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: onChange,
  });
  const submit = useMutation({
    mutationFn: () => apiFetch(`/practice/me/credentials/${cc!.id}/submit`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['practice-me'] }); },
  });
  if (!cc) return null;
  const submitted = cc.status === 'submitted' || cc.status === 'reviewed';
  const checks = [
    { key: 'self_g1', label: 'G1 · I have done something substantially relevant to this credential', on: cc.self_g1, field: 'selfG1' },
    { key: 'self_g2', label: 'G2 · My own actions and contribution are clear in my evidence', on: cc.self_g2, field: 'selfG2' },
    { key: 'self_g3', label: 'G3 · My reflection shows what I learned from doing it', on: cc.self_g3, field: 'selfG3' },
  ];
  const allChecked = cc.self_g1 && cc.self_g2 && cc.self_g3;
  const ready = allChecked && reflections > 0 && evidence > 0;

  return (
    <Card className="rounded-none p-5 space-y-3">
      <div className="flex items-center gap-2 ed-overline text-foreground"><CheckCircle2 className="h-4 w-4 text-primary" /> Gateway self-check</div>
      <p className="text-xs text-muted-foreground">Before you submit, check your portfolio against the three gateways a reviewer uses. There is no pass or fail: your portfolio is either recognised or referred for resubmission, and both come with developmental feedback.</p>
      <div className="space-y-2">
        {checks.map((c) => (
          <label key={c.key} className={`flex items-start gap-2.5 border p-2.5 text-sm ${submitted ? 'opacity-70' : 'cursor-pointer hover:bg-muted/30'}`}>
            <input type="checkbox" checked={c.on} disabled={submitted} onChange={(e) => patch.mutate({ [c.field]: e.target.checked })} className="mt-0.5 h-4 w-4" />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
      {submitted ? (
        <div className="bg-blue-500/10 p-3 text-sm text-blue-700 inline-flex items-center gap-2"><Lock className="h-4 w-4" /> Submitted for independent review.</div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{ready ? 'Ready to submit.' : 'Add at least one reflection and one piece of evidence, and check all three gateways.'}</span>
          <Button size="sm" disabled={!ready || submit.isPending} onClick={() => submit.mutate()} className="gap-1.5 shrink-0 rounded-none"><Send className="h-4 w-4" /> Submit for review</Button>
        </div>
      )}
    </Card>
  );
}

// Per-field Eve setup: the label, a one-line hint, and the question Eve opens the popup with. Framed for
// educators, but usable anywhere. When a learner picks a box, Eve opens here and talks them into filling it.
const EVE_FIELDS: Record<string, { label: string; hint: string; opener: string }> = {
  description: { label: 'What happened', hint: 'A plain account of the moment: who, what, when.', opener: "Let's capture what actually happened. Walk me through the moment, what did you do with your students, and when?" },
  feelings: { label: 'Feelings', hint: 'How you felt, and how your students felt or likely felt.', opener: 'How did it feel in the room, for you and for your students?' },
  evaluation: { label: 'Evaluation', hint: 'What was good or bad about how it went.', opener: 'As you look back, what went well, and what did not?' },
  analysis: { label: 'Analysis', hint: 'Why it went the way it did; the idea underneath.', opener: 'Why do you think it went the way it did? What is the idea underneath it?' },
  conclusion: { label: 'Conclusion', hint: 'The lesson, or a principle you could hand to another teacher.', opener: 'If you handed one lesson from this to another teacher, what would it be?' },
  action: { label: 'Action', hint: 'One concrete thing you will try next, and when.', opener: 'Knowing this, what is one thing you will try differently next time, and when?' },
  prediction: { label: 'Prediction', hint: 'What you expected to happen beforehand.', opener: 'Before it happened, what did you expect would happen?' },
  surprise: { label: 'Surprise', hint: 'Where reality differed from what you expected.', opener: 'Where did it surprise you? Where did reality differ from what you expected?' },
};

// Justice-audience variants of the per-field openers (PEJ), framed for prosecutors and investigators.
const EVE_FIELDS_JUSTICE: Record<string, { label: string; hint: string; opener: string }> = {
  description: { label: 'What happened', hint: 'A plain account of the moment: who, what, when. Composite, initials only.', opener: "Let's capture what actually happened, as a composite. Walk me through the moment at the scene or in the contact, what did you do, and when?" },
  feelings: { label: 'Feelings', hint: 'How you felt, and how others at the scene felt or likely felt.', opener: 'What was the pressure like in that moment, for you and for the people there?' },
  evaluation: { label: 'Evaluation', hint: 'What was sound or unsound about how it went.', opener: 'Looking back, what held up well, and what did not?' },
  analysis: { label: 'Analysis', hint: 'Why it went the way it did; the principle underneath.', opener: 'Why do you think it went the way it did? What is the principle underneath it?' },
  conclusion: { label: 'Conclusion', hint: 'The lesson, or a standard you could hand to a colleague.', opener: 'If you handed one lesson from this to a colleague, what would it be?' },
  action: { label: 'Action', hint: 'One concrete thing you will do differently next time, and when.', opener: 'Knowing this, what is one thing you will do differently at the next scene or contact, and when?' },
  prediction: { label: 'Prediction', hint: 'What you expected to happen beforehand.', opener: 'Before it happened, what did you expect would happen?' },
  surprise: { label: 'Surprise', hint: 'Where reality differed from what you expected.', opener: 'Where did it surprise you, where did reality differ from what you expected?' },
};

// Justice-audience worked examples (strong vs weak) per Kolb move, so PEJ learners see field-relevant models.
const JUSTICE_EXAMPLES: Record<string, { strong: string; weak: string }> = {
  e: { strong: 'Specific and first-person: "At the de-occupied site I logged the time, held everyone back from the suspected device, and photographed the approach before anything was touched, because clearance came before the exhibit." Names a real moment, a decision, and a reason.', weak: 'Vague and general: "We documented the scene and secured the evidence." No moment, no decision, nothing a reviewer can actually see you do.' },
  r: { strong: 'Honest and specific: "I expected the open account to be vaguer than direct questions, but the witness volunteered a timing detail I would not have asked for, and it held." Names a real expectation and a genuine surprise.', weak: 'Tidy and safe: "The interview went well and I got what I needed." Nothing you did not already know, and no surprise to learn from.' },
  n: { strong: 'A portable principle: "What I learned is that integrity is a property of the record, not the object, so I now read a seizure log for the gap first, not the contents." A one-line idea you could hand to a colleague.', weak: 'A restatement: "I learned that chain of custody is important." Just describes the event again, without an idea that travels beyond it.' },
  t: { strong: 'Concrete and checkable: "Before I sign any log next week, I will confirm every item logged out has been logged back in, and initial the check." Specific enough that you could verify you did it.', weak: 'A good intention: "I will be more careful with custody records." Nothing specific enough to actually do or check.' },
};

// Leadership-audience variants (MRB), framed for leaders reflecting on their own work.
const EVE_FIELDS_LEADERSHIP: Record<string, { label: string; hint: string; opener: string }> = {
  description: { label: 'What happened', hint: 'A plain account of the moment: who, what, when.', opener: "Let's capture what actually happened. Walk me through the moment at work, what did you do, and when?" },
  feelings: { label: 'Feelings', hint: 'How you felt, and how the people involved felt or likely felt.', opener: 'What was it like in that moment, for you and for the people involved?' },
  evaluation: { label: 'Evaluation', hint: 'What was good or bad about how it went.', opener: 'As you look back, what went well, and what did not?' },
  analysis: { label: 'Analysis', hint: 'Why it went the way it did; the principle underneath.', opener: 'Why do you think it went the way it did? What is the principle underneath it?' },
  conclusion: { label: 'Conclusion', hint: 'The lesson, or a principle you could hand to another leader.', opener: 'If you handed one lesson from this to another leader, what would it be?' },
  action: { label: 'Action', hint: 'One concrete thing you will do differently next time, and when.', opener: 'Knowing this, what is one thing you will do differently next time, and when?' },
  prediction: { label: 'Prediction', hint: 'What you expected to happen beforehand.', opener: 'Before it happened, what did you expect would happen?' },
  surprise: { label: 'Surprise', hint: 'Where reality differed from what you expected.', opener: 'Where did it surprise you, where did reality differ from what you expected?' },
};

const LEADERSHIP_EXAMPLES: Record<string, { strong: string; weak: string }> = {
  e: { strong: 'Specific and first-person: "On Monday two people on the team had gone quiet in stand-ups, so I spoke to each of them alone rather than raising it in the group, because I judged it was trust, not performance." Names a real moment, a decision, and a reason.', weak: 'Vague and general: "The team had some issues and I dealt with them." No moment, no decision, nothing a reviewer can actually see you do.' },
  r: { strong: 'Honest and specific: "I expected the one-to-ones to clear the air, but one person went further into their shell, which made me question whether I had read it right." Names a real feeling and a genuine surprise.', weak: 'Tidy and safe: "It went well and I was happy with how I handled it." Nothing you did not already know, and no surprise to learn from.' },
  n: { strong: 'A portable principle: "What I learned is that silence from someone I lead is information, not resistance, and my first move should be to understand it, not correct it." A one-line idea you could hand to another leader.', weak: 'A restatement: "I learned that one-to-ones can help." Just describes the event again, without an idea that travels beyond it.' },
  t: { strong: 'Concrete and checkable: "Before the next retro, I will ask each quieter team member one question about what is getting in their way, and note what they say." Specific enough that you could check whether you did it.', weak: 'A good intention: "I will pay more attention to quiet team members." Nothing specific enough to actually do or check.' },
};

const fieldFor = (stage: string, audience?: Audience) => {
  const map = audience === 'justice' ? EVE_FIELDS_JUSTICE : audience === 'leadership' ? EVE_FIELDS_LEADERSHIP : EVE_FIELDS;
  return map[stage] ?? EVE_FIELDS[stage] ?? { label: 'This box', hint: '', opener: 'Tell me what happened.' };
};
const examplesFor = (stageKey: string, audience?: Audience): { strong: string; weak: string } | undefined =>
  audience === 'justice' ? JUSTICE_EXAMPLES[stageKey] : audience === 'leadership' ? LEADERSHIP_EXAMPLES[stageKey] : undefined;

type Capture = { target: 'reflection' | 'evidence'; stage?: string; title?: string; text: string; label: string };

/**
 * Eve, focused on ONE box. A centered popup that opens when a learner picks a field. Eve asks a focused
 * question, the learner talks, and Eve drafts that box in their own words. Eve-first, but the draft is
 * always editable and they can write it themselves. Adding it saves straight to that field and closes.
 */
function EveFieldModal({ ccId, stage, coachName, audience, onGuidanceChange, onClose, onSaved }: { ccId: string; stage: string; coachName: string; audience?: Audience; guidance: boolean; onGuidanceChange: (on: boolean) => void; onClose: () => void; onSaved: () => void }) {
  const field = fieldFor(stage, audience);
  const [messages, setMessages] = useState<ChatMsg[]>([{ role: 'assistant', content: field.opener, kind: 'chat' }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [lastEveDraft, setLastEveDraft] = useState('');
  const [saving, setSaving] = useState(false);
  // First-time offer: the learner can decline guidance entirely and just write it themselves.
  const [decided, setDecided] = useState<boolean>(() => { try { return localStorage.getItem('praxis_eve_decided') === '1'; } catch { return true; } });
  const decide = (guideMe: boolean) => { try { localStorage.setItem('praxis_eve_decided', '1'); } catch { /* storage blocked */ } setDecided(true); if (!guideMe) { onGuidanceChange(false); onClose(); } };
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [messages, loading]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);

  const applyDraft = (text: string) => { setLastEveDraft(text); setDraft((d) => (d.trim() === '' || d === lastEveDraft ? text : d)); };

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const next: ChatMsg[] = [...messages, { role: 'user', content: text.trim(), kind: 'chat' }];
    setMessages(next); setInput(''); setLoading(true);
    try {
      const r = await apiFetch<{ reply: string }>('/practice/coach', { method: 'POST', body: JSON.stringify({ messages: next, candidateCredentialId: ccId, coachName, focusHint: `${field.label}: ${field.hint}` }) });
      setMessages((m) => [...m, { role: 'assistant', content: r.reply, kind: 'chat' }]);
      // Draft this box from what they have said, in their own words.
      try {
        const cap = await apiFetch<{ captures: Capture[] }>('/practice/coach/capture', { method: 'POST', body: JSON.stringify({ candidateCredentialId: ccId, messages: next, coachName, focusStage: stage }) });
        if (cap.captures?.[0]?.text) applyDraft(cap.captures[0].text);
      } catch { /* draft is best-effort */ }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'I could not respond just now. Try again in a moment.', kind: 'chat' }]);
    } finally { setLoading(false); }
  };

  const add = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/practice/me/credentials/${ccId}/reflections`, { method: 'POST', body: JSON.stringify({ stage, content: draft.trim(), source: 'coached', typedMs: 0, pasteCount: 0 }) });
      onSaved(); onClose();
    } catch { /* leave open to retry */ } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg bg-background border border-border shadow-xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <div className="ed-overline text-primary">{coachName} · {field.label}</div>
            <p className="text-xs text-muted-foreground mt-1">{field.hint} Talk it through with {coachName}, and it drafts this box for you. <button onClick={() => { onGuidanceChange(false); onClose(); }} className="underline ed-underline hover:text-foreground">Turn {coachName} off</button></p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        {!decided && (
          <div className="border-b border-border bg-primary/5 p-4">
            <p className="text-sm">Want me to help you think this through, or would you rather write it yourself? You can change this anytime.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" className="rounded-none" onClick={() => decide(true)}>Guide me through it</Button>
              <Button size="sm" variant="outline" className="rounded-none" onClick={() => decide(false)}>I'll write it myself</Button>
            </div>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[140px]">
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
              <span className={`inline-block max-w-[90%] px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{m.content}</span>
            </div>
          ))}
          {loading && <div className="text-muted-foreground text-sm inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {coachName} is thinking...</div>}
        </div>

        <div className="border-t border-border p-3 space-y-3">
          <div className="flex items-end gap-2">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} autoFocus placeholder={`Answer ${coachName}...`}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              className="flex-1 resize-none rounded-none border border-input bg-background px-3 py-2 text-sm" />
            <Button size="sm" disabled={!input.trim() || loading} onClick={() => send(input)} className="rounded-none"><Send className="h-4 w-4" /></Button>
          </div>

          <div className="border border-primary/30 bg-primary/5 p-2.5 space-y-2">
            <div className="ed-overline text-muted-foreground">Your {field.label.toLowerCase()} {draft ? '· edit if you like' : '· or write it yourself'}</div>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} placeholder={`As you talk, ${coachName} fills this in. You can also type it here.`}
              className="w-full rounded-none border border-input bg-background px-3 py-2 text-sm" />
            <div className="flex items-center justify-end">
              <Button size="sm" disabled={!draft.trim() || saving} onClick={add} className="gap-1.5 rounded-none">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add to portfolio</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoachPanel({ cc, stageHint, coachName = 'Mutale', observeReq, onCaptured, readOnly, compact }: { cc: Mine | undefined; stageHint?: string; coachName?: string; observeReq?: { text: string; n: number } | null; onCaptured?: () => void; readOnly?: boolean; compact?: boolean }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [offerAnalysis, setOfferAnalysis] = useState(false);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastObserve = useRef(0);
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [messages, loading, analysing, captures]);

  // Load the persisted conversation once, so it is part of the portfolio and survives a reload.
  useEffect(() => {
    if (!cc?.id) return;
    apiFetch<Array<{ role: string; content: string; kind: string }>>(`/practice/me/credentials/${cc.id}/coach`)
      .then((rows) => { if (Array.isArray(rows) && rows.length) setMessages(rows.map((r) => ({ role: r.role === 'learner' ? 'user' as const : 'assistant' as const, content: r.content, kind: (r.kind as any) || 'chat' }))); })
      .catch(() => {});
  }, [cc?.id]);

  // Draft portfolio entries from what the learner has said, in their own words. Runs quietly in the
  // background after each message, and on demand, so talking to the coach fills the fields for them.
  const requestCaptures = useCallback(async (msgs: ChatMsg[], manual = false) => {
    if (!cc?.id || readOnly) return;
    if (manual) setDrafting(true);
    try {
      const r = await apiFetch<{ captures: Capture[] }>('/practice/coach/capture', { method: 'POST', body: JSON.stringify({ candidateCredentialId: cc.id, messages: msgs, coachName }) });
      const fresh = Array.isArray(r.captures) ? r.captures : [];
      // Merge, skipping anything already suggested (same target+text) so cards do not pile up.
      setCaptures((prev) => {
        const seen = new Set(prev.map((c) => `${c.target}|${c.text}`));
        return [...prev, ...fresh.filter((c) => !seen.has(`${c.target}|${c.text}`))];
      });
    } catch { /* capture is best-effort */ } finally { if (manual) setDrafting(false); }
  }, [cc?.id, coachName, readOnly]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const next: ChatMsg[] = [...messages, { role: 'user', content: text.trim(), kind: 'chat' }];
    setMessages(next); setInput(''); setLoading(true);
    try {
      const r = await apiFetch<{ reply: string }>('/practice/coach', { method: 'POST', body: JSON.stringify({ messages: next, candidateCredentialId: cc?.id, credentialTitle: cc?.title, activityBrief: cc?.activity_brief, coachName }) });
      setMessages((m) => [...m, { role: 'assistant', content: r.reply, kind: 'chat' }]);
      requestCaptures(next); // quietly draft portfolio entries from the exchange
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'I could not respond just now. Try again in a moment.', kind: 'chat' }]);
    } finally { setLoading(false); }
  };

  const editCapture = (i: number, text: string) => setCaptures((cs) => cs.map((c, j) => (j === i ? { ...c, text } : c)));
  const dismissCapture = (i: number) => setCaptures((cs) => cs.filter((_, j) => j !== i));
  const addCapture = async (i: number) => {
    const c = captures[i];
    if (!c || !cc?.id || !c.text.trim()) return;
    setSavingIdx(i);
    try {
      if (c.target === 'evidence') {
        await apiFetch(`/practice/me/credentials/${cc.id}/evidence`, { method: 'POST', body: JSON.stringify({ kind: 'text', title: c.title || null, body: c.text.trim() }) });
      } else {
        await apiFetch(`/practice/me/credentials/${cc.id}/reflections`, { method: 'POST', body: JSON.stringify({ stage: c.stage, content: c.text.trim(), source: 'coached', typedMs: 0, pasteCount: 0 }) });
      }
      dismissCapture(i);
      setMessages((m) => [...m, { role: 'assistant', content: `Added to your portfolio under ${c.label}. You can still edit or remove it on the left.`, kind: 'observation' }]);
      onCaptured?.();
    } catch { /* leave the card so they can retry */ } finally { setSavingIdx(null); }
  };

  // React to a field write: ask the coach to observe it (a brief insight or a probing question).
  useEffect(() => {
    if (!observeReq || !cc?.id || observeReq.n === lastObserve.current) return;
    lastObserve.current = observeReq.n;
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch<{ reply: string; offerAnalysis?: boolean }>('/practice/coach/observe', { method: 'POST', body: JSON.stringify({ candidateCredentialId: cc.id, text: observeReq.text, coachName }) });
        if (cancelled) return;
        setMessages((m) => [...m, { role: 'assistant', content: r.reply, kind: 'observation' }]);
        if (r.offerAnalysis) setOfferAnalysis(true);
      } catch { /* observation is best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [observeReq?.n, cc?.id, coachName]);

  const analyse = async () => {
    if (!cc?.id || analysing) return;
    setAnalysing(true); setOfferAnalysis(false);
    try {
      const r = await apiFetch<{ reply: string }>('/practice/coach/analysis', { method: 'POST', body: JSON.stringify({ candidateCredentialId: cc.id, coachName }) });
      setMessages((m) => [...m, { role: 'assistant', content: r.reply, kind: 'analysis' }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'I could not analyse that just now. Try again in a moment.', kind: 'chat' }]);
    } finally { setAnalysing(false); }
  };

  const bubble = (m: ChatMsg) => {
    if (m.role === 'user') return <span className="inline-block max-w-[90%] px-3 py-2 text-sm whitespace-pre-wrap bg-primary text-primary-foreground">{m.content}</span>;
    if (m.kind === 'analysis') return (
      <div className="border-l-2 border-primary bg-primary/5 p-3 text-sm whitespace-pre-wrap">
        <div className="ed-overline text-primary mb-1">{coachName}'s analysis</div>{m.content}
      </div>
    );
    if (m.kind === 'observation') return (
      <div className="border-l-2 border-primary/40 pl-3 text-sm whitespace-pre-wrap text-muted-foreground">
        <span className="ed-overline text-primary mr-1.5">{coachName} notices</span>{m.content}
      </div>
    );
    return <span className="inline-block max-w-[90%] px-3 py-2 text-sm whitespace-pre-wrap bg-muted">{m.content}</span>;
  };

  return (
    <Card className={`rounded-none p-0 flex flex-col overflow-hidden lg:sticky lg:top-4 ${compact ? 'h-[440px]' : 'h-[70vh]'}`}>
      <div className="border-b border-border p-3">
        <div className="ed-overline text-foreground">{coachName} · {compact ? 'the bigger conversation' : 'your thinking partner'}</div>
        <p className="text-xs text-muted-foreground mt-1">{compact
          ? `Optional. Fill each box with the ${coachName} button on the left. Use this space to think more broadly, or ask ${coachName} anything about your practice.`
          : `A Socratic coach. ${coachName} asks, you think, and comments as you write. As you talk, ${coachName} drafts portfolio entries from your own words, so you never type the same thing twice.`}</p>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground space-y-3">
            <div className="border border-border p-3 space-y-1.5">
              <div className="ed-overline text-foreground">How to use {coachName}</div>
              <p className="text-xs">{coachName} is your thinking partner, not a search engine. {coachName} will not give you answers or write your reflection for you, but asks questions and offers insight, grounded in real research, as you work.</p>
              <p className="text-xs"><span className="font-medium text-foreground">How:</span> tell {coachName} what happened in plain words, or just start writing in the fields, {coachName} will notice and respond. Answer honestly, even when unsure. There are no wrong answers here.</p>
              <p className="text-xs"><span className="font-medium text-foreground">Why:</span> putting your own thinking into words is how experience turns into learning. If {coachName} simply handed you the answer, you would learn nothing.</p>
            </div>
            {stageHint
              ? <p><span className="font-medium text-foreground">To get going, {coachName} asks:</span> <em>"{stageHint}"</em>  Type your answer below.</p>
              : <p><span className="font-medium text-foreground">Start with a real moment,</span> here or in the fields on the left.</p>}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>{bubble(m)}</div>
        ))}
        {captures.map((c, i) => (
          <div key={`cap-${i}`} className="border border-primary/40 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-1.5 ed-overline text-primary"><Plus className="h-3.5 w-3.5" /> {coachName} can add this · {c.label}</div>
            <p className="text-[11px] text-muted-foreground">Drawn from your own words. Edit it, then add it to your portfolio.</p>
            {!readOnly ? (
              <textarea value={c.text} onChange={(e) => editCapture(i, e.target.value)} rows={3}
                className="w-full rounded-none border border-input bg-background px-2.5 py-2 text-sm" />
            ) : <p className="text-sm whitespace-pre-wrap">{c.text}</p>}
            {!readOnly && (
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => dismissCapture(i)} className="ed-overline text-muted-foreground hover:text-foreground">Not this</button>
                <Button size="sm" disabled={savingIdx === i || !c.text.trim()} onClick={() => addCapture(i)} className="gap-1.5 rounded-none">
                  {savingIdx === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add to {c.label}
                </Button>
              </div>
            )}
          </div>
        ))}
        {(loading || analysing || drafting) && <div className="text-muted-foreground text-sm inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {coachName} is {drafting ? 'drafting your entries' : 'thinking'}...</div>}
        {offerAnalysis && !analysing && (
          <button onClick={analyse} className="ed-overline text-primary underline ed-underline">Yes, {coachName}, show me the pattern you see</button>
        )}
      </div>
      <div className="border-t border-border p-2 space-y-2">
        {!readOnly && messages.some((m) => m.role === 'user') && !drafting && (
          <button onClick={() => requestCaptures(messages, true)} className="ed-overline text-primary hover:text-primary/80 inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Turn our talk into portfolio entries</button>
        )}
        {messages.some((m) => m.role === 'user' || m.kind === 'observation') && !analysing && (
          <button onClick={analyse} className="ed-overline text-muted-foreground hover:text-foreground block">Ask {coachName} to analyse my reflection so far</button>
        )}
        <div className="flex items-end gap-2">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} placeholder={stageHint ? `Answer ${coachName}, or tell it what happened...` : `Tell ${coachName} what happened...`}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            className="flex-1 resize-none rounded-none border border-input bg-background px-3 py-2 text-sm" />
          <Button size="sm" disabled={!input.trim() || loading} onClick={() => send(input)} className="rounded-none"><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    </Card>
  );
}
