import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGetMe } from '@workspace/api-client-react';
import { apiFetch } from '@/lib/api';
import { getPending, addPending, removePending, loadDraft, saveDraft, type Pending } from '@/lib/offlineStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Send, Plus, Trash2, CheckCircle2, Lock, BookOpen, Lightbulb, Paperclip, Link2, Loader2, Upload, Download, CloudOff, RefreshCw, Clock, Target, Zap, Brain, Check, Trophy,
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
 * Evidence Canvas for a single Practice Credential. This is the practice-first workspace: capture the
 * experience and reflect over time (Gibbs), gather evidence, talk it through with the Socratic coach
 * (Mutale), self-check against the gateway, and submit the portfolio for independent review. There are
 * no modules or lessons here, and no marks: the reviewer returns developmental feedback either way.
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
type ChatMsg = { role: 'user' | 'assistant'; content: string };

const GIBBS = [
  { key: 'description', label: 'What happened', hint: 'Describe the situation plainly. Who, what, when.' },
  { key: 'feelings', label: 'Feelings', hint: 'How did you feel? How did others feel, or likely feel?' },
  { key: 'evaluation', label: 'Evaluation', hint: 'What was good or bad about it?' },
  { key: 'analysis', label: 'Analysis', hint: 'Why? Bring in a leadership idea only where your decision needs it.' },
  { key: 'conclusion', label: 'Conclusion', hint: 'What is the lesson? What would you do differently?' },
  { key: 'action', label: 'Action', hint: 'What will you do next, and when?' },
  { key: 'note', label: 'Quick note', hint: 'A thought to capture now and come back to.' },
];
// Predictive-processing stages live alongside the Gibbs stages but are captured in their own panel.
const EXTRA_LABELS: Record<string, string> = { prediction: 'Prediction', surprise: 'What surprised me' };
const stageLabel = (k: string) => GIBBS.find((g) => g.key === k)?.label ?? EXTRA_LABELS[k] ?? 'Note';

export function PracticeCanvas() {
  const [, params] = useRoute('/practice/c/:id');
  const id = params?.id ?? '';
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data: me } = useGetMe();
  const { data: mine = [] } = useQuery({ queryKey: ['practice-me'], queryFn: () => apiFetch<Mine[]>('/practice/me') });
  const cc = mine.find((m) => m.id === id);
  const { data: reflections = [] } = useQuery({ queryKey: ['practice-reflections', id], queryFn: () => apiFetch<Reflection[]>(`/practice/me/credentials/${id}/reflections`), enabled: !!id });
  const { data: evidence = [] } = useQuery({ queryKey: ['practice-evidence', id], queryFn: () => apiFetch<Evidence[]>(`/practice/me/credentials/${id}/evidence`), enabled: !!id });

  const invalidate = useCallback(() => { qc.invalidateQueries({ queryKey: ['practice-reflections', id] }); qc.invalidateQueries({ queryKey: ['practice-evidence', id] }); qc.invalidateQueries({ queryKey: ['practice-me'] }); }, [qc, id]);
  const off = useOffline(id, invalidate);

  // Opening the canvas starts the credential (chosen -> in progress) so it becomes the active one.
  useEffect(() => {
    if (cc && cc.status === 'chosen') {
      apiFetch(`/practice/me/credentials/${id}`, { method: 'PATCH', body: JSON.stringify({ start: true }) }).then(() => invalidate()).catch(() => {});
    }
  }, [cc?.status, id, invalidate]);

  const submitted = cc?.status === 'submitted' || cc?.status === 'reviewed';
  const readOnly = submitted;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <button onClick={() => navigate('/practice')} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> My credentials</button>

      {/* Connection + pending-sync status. On expensive, intermittent data, work is saved on the device
          and uploaded automatically when back online. */}
      {(!off.online || off.pending.length > 0) && (
        <div className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm ${off.online ? 'border-amber-500/30 bg-amber-500/5 text-amber-800' : 'border-muted bg-muted/40 text-muted-foreground'}`}>
          <span className="inline-flex items-center gap-2">
            {off.online ? <Clock className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
            {off.online
              ? `${off.pending.length} change${off.pending.length === 1 ? '' : 's'} saved on your device, waiting to upload.`
              : "You are offline. Keep working, your reflections and notes are saved on this device and will upload when you reconnect."}
          </span>
          {off.online && off.pending.length > 0 && (
            <Button size="sm" variant="outline" disabled={off.flushing} onClick={off.flush} className="gap-1.5 shrink-0">
              <RefreshCw className={`h-3.5 w-3.5 ${off.flushing ? 'animate-spin' : ''}`} /> {off.flushing ? 'Syncing...' : 'Sync now'}
            </Button>
          )}
        </div>
      )}

      {/* Header */}
      <Card className="rounded-none p-5">
        <div className="ed-overline text-muted-foreground">Practice credential</div>
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          <h1 className="ed-h2">{cc?.title ?? 'Credential'}</h1>
          {cc && <Badge variant="outline" className="text-[10px] capitalize rounded-none">{cc.status.replace('_', ' ')}</Badge>}
        </div>
        {cc?.activity_brief && <p className="mt-2 text-sm"><span className="font-medium">Activity: </span>{cc.activity_brief}</p>}
        <GuidanceStrip cc={cc} />
        {cc?.latest_feedback && (cc.status === 'reviewed' || cc.status === 'referred') && (
          <div className={`mt-3 rounded-xl border p-3 text-sm ${cc.status === 'reviewed' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
            <div className="font-medium mb-1">{cc.status === 'reviewed' ? 'Recognised' : 'Referred for resubmission'} · developmental feedback</div>
            <p className="whitespace-pre-wrap text-muted-foreground">{cc.latest_feedback}</p>
          </div>
        )}
      </Card>

      {/* Cognitive twin: the model Mutale holds about this candidate, shown to them plainly. This makes
          the offloading principle visible, Mutale carries the memory and structure, never the thinking. */}
      <TwinPanel me={me} cc={cc} reflections={reflections} />

      <div className="grid lg:grid-cols-[1fr_380px] gap-4 items-start">
        {/* Left: prediction + reflection + evidence + gateway + submit */}
        <div className="space-y-4">
          <PredictionPanel id={id} reflections={reflections} readOnly={readOnly} onChange={invalidate} />
          <ReflectionPanel id={id} reflections={reflections} readOnly={readOnly} onChange={invalidate} off={off} />
          <EvidencePanel id={id} evidence={evidence} readOnly={readOnly} onChange={invalidate} off={off} />
          <GatewaySubmit cc={cc} reflections={reflections.length} evidence={evidence.length} onChange={invalidate} />
        </div>

        {/* Right: Socratic coach */}
        <CoachPanel cc={cc} />
      </div>
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
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${open === i.k ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
            <i.icon className="h-3.5 w-3.5" /> {i.label}
          </button>
        ))}
      </div>
      {items.filter((i) => i.k === open).map((i) => (
        <p key={i.k} className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground whitespace-pre-wrap">{i.body}</p>
      ))}
    </div>
  );
}

// The eight reflective "moves" a candidate can collect: the six Gibbs stages plus the two
// predictive-processing moves. Working all eight = a full reflective range.
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
      <text x="24" y="28" textAnchor="middle" className="fill-foreground" style={{ fontSize: 13, fontWeight: 600 }}>{earned}</text>
    </svg>
  );
}

function TwinPanel({ me, cc, reflections }: { me: any; cc: Mine | undefined; reflections: Reflection[] }) {
  const [openHint, setOpenHint] = useState<string | null>(null);
  if (!cc) return null;
  const name = me?.firstName;
  const counts: Record<string, number> = {};
  for (const r of reflections) counts[r.stage] = (counts[r.stage] ?? 0) + 1;
  const earned = MOVES.filter((m) => counts[m.key]).length;
  const complete = earned === MOVES.length;

  return (
    <Card className="rounded-none p-5 space-y-4 border-primary/20">
      <div>
        <div className="flex items-center gap-2 ed-overline text-foreground"><Brain className="h-4 w-4 text-primary" /> What Mutale is learning about how you lead</div>
        <p className="text-xs text-muted-foreground mt-1">This is the model your coach holds{name ? `, ${name}` : ''}, drawn only from your own words. Mutale remembers it so you do not have to, and uses it to make its questions personal. It never replaces your thinking.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Your prior practice, in your words</div>
          <p className="text-sm mt-1 whitespace-pre-wrap">{cc.justification?.trim() || 'Not captured yet. Tell Mutale why this credential fits your real work.'}</p>
        </div>
        <div className="rounded-xl border border-border p-3 flex items-center gap-3">
          <ReflectiveRing earned={earned} total={MOVES.length} />
          <div className="min-w-0">
            <div className="text-sm font-medium">Reflective range</div>
            <div className="text-xs text-muted-foreground">{complete ? 'Full range explored. Strong work.' : `${earned} of ${MOVES.length} moves explored, tap one to see it`}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {MOVES.map((m) => {
            const n = counts[m.key] ?? 0; const got = n > 0; const active = openHint === m.key;
            return (
              <button key={m.key} type="button" onClick={() => setOpenHint(active ? null : m.key)}
                aria-pressed={active}
                className={`group relative text-left rounded-xl border p-2.5 transition-all duration-200 hover:-translate-y-0.5 ${got ? 'border-primary/40 bg-primary/5 hover:bg-primary/10' : 'border-dashed border-border hover:border-primary/30'} ${active ? 'ring-2 ring-primary/40' : ''}`}>
                <div className="flex items-center gap-2 pr-5">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${got ? 'bg-primary text-primary-foreground' : 'border border-border text-transparent'}`}>
                    <Check className="h-3 w-3" />
                  </span>
                  <span className={`text-xs font-medium truncate ${got ? '' : 'text-muted-foreground'}`}>{m.label}</span>
                </div>
                {got && <span className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-primary/15 px-1 text-center text-[10px] font-medium text-primary">{n}</span>}
              </button>
            );
          })}
        </div>

        {openHint && (
          <p className="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
            {MOVES.find((m) => m.key === openHint)?.hint}{' '}
            <span className="text-foreground/70">{counts[openHint] ? `You have worked this ${counts[openHint]} time${counts[openHint] === 1 ? '' : 's'}.` : 'Not yet in your portfolio, try it next.'}</span>
          </p>
        )}

        {complete && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2.5 text-xs font-medium text-primary">
            <Trophy className="h-4 w-4" /> Full reflective range: you have worked every move of the cycle.
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground border-t border-border pt-2">Cognitive twin and co-regulation with AI. Mutale carries the memory and the structure, beneficial offloading, so your attention stays on the thinking that only you can do.</p>
    </Card>
  );
}

function PredictionPanel({ id, reflections, readOnly, onChange }: { id: string; reflections: Reflection[]; readOnly: boolean; onChange: () => void }) {
  const predictions = reflections.filter((r) => r.stage === 'prediction');
  const surprises = reflections.filter((r) => r.stage === 'surprise');
  const pairCount = Math.max(predictions.length, surprises.length);
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [busy, setBusy] = useState(false);
  const endpoint = `/practice/me/credentials/${id}/reflections`;
  const save = async () => {
    const e = expected.trim(), a = actual.trim();
    if (!e && !a) return;
    setBusy(true);
    try {
      if (e) await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ stage: 'prediction', content: e }) });
      if (a) await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ stage: 'surprise', content: a }) });
      setExpected(''); setActual(''); onChange();
    } catch { /* leave the text in place to retry */ } finally { setBusy(false); }
  };
  return (
    <Card className="rounded-none p-5 space-y-3">
      <div className="flex items-center gap-2 ed-overline text-foreground"><Target className="h-4 w-4 text-primary" /> Prediction and surprise</div>
      <p className="text-xs text-muted-foreground">Name what you expected before it happened, then what actually happened. The gap between them, the surprise, is where the learning is. This is predictive processing: a broken prediction teaches you the most.</p>
      {pairCount > 0 && (
        <ol className="space-y-3">
          {Array.from({ length: pairCount }).map((_, i) => {
            const p = predictions[i]; const s = surprises[i];
            return (
              <li key={i} className="rounded-xl border border-border overflow-hidden">
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
      {!readOnly && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <div>
            <label className="text-xs font-medium">Before it happened, I expected...</label>
            <textarea value={expected} onChange={(e) => setExpected(e.target.value)} rows={2} placeholder="What did you think would happen?" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium">What actually happened, what surprised me...</label>
            <textarea value={actual} onChange={(e) => setActual(e.target.value)} rows={2} placeholder="Where did reality differ from your prediction?" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={busy || (!expected.trim() && !actual.trim())} onClick={save} className="gap-1.5"><Plus className="h-4 w-4" /> Log prediction</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ReflectionPanel({ id, reflections, readOnly, onChange, off }: { id: string; reflections: Reflection[]; readOnly: boolean; onChange: () => void; off: ReturnType<typeof useOffline> }) {
  const draftKey = `refl_${id}`;
  const [stage, setStage] = useState('note');
  const [content, setContent] = useState(() => loadDraft(draftKey));
  const [busy, setBusy] = useState(false);
  useEffect(() => { saveDraft(draftKey, content); }, [content, draftKey]);
  const endpoint = `/practice/me/credentials/${id}/reflections`;
  const pendingReflections = off.pending.filter((p) => p.kind === 'reflection');
  // Prediction and surprise entries have their own panel above; keep them out of the Gibbs timeline.
  const timeline = reflections.filter((r) => r.stage !== 'prediction' && r.stage !== 'surprise');

  const submitReflection = async () => {
    const text = content.trim();
    if (!text) return;
    const payload = { stage, content: text };
    setBusy(true);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      off.enqueue({ kind: 'reflection', endpoint, payload, display: text, stage });
      setContent(''); saveDraft(draftKey, ''); setBusy(false); return;
    }
    try { await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(payload) }); setContent(''); saveDraft(draftKey, ''); onChange(); }
    catch { off.enqueue({ kind: 'reflection', endpoint, payload, display: text, stage }); setContent(''); saveDraft(draftKey, ''); }
    finally { setBusy(false); }
  };

  return (
    <Card className="rounded-none p-5 space-y-3">
      <div className="flex items-center gap-2 ed-overline text-foreground"><Lightbulb className="h-4 w-4 text-primary" /> Reflection</div>
      <p className="text-xs text-muted-foreground">Reflection happens over time and in bits. Capture a thought whenever it comes, and work the stages as you go. Learning becomes visible here.</p>

      {(timeline.length > 0 || pendingReflections.length > 0) && (
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
        <div className="space-y-2 rounded-xl border border-border p-3">
          <div className="flex flex-wrap gap-1.5">
            {GIBBS.map((g) => (
              <button key={g.key} onClick={() => setStage(g.key)}
                className={`rounded-full px-2.5 py-1 text-xs ${stage === g.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>{g.label}</button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{GIBBS.find((g) => g.key === stage)?.hint}</p>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="Write your reflection..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <div className="flex justify-end">
            <Button size="sm" disabled={!content.trim() || busy} onClick={submitReflection} className="gap-1.5"><Plus className="h-4 w-4" /> Add to reflection</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function EvidencePanel({ id, evidence, readOnly, onChange, off }: { id: string; evidence: Evidence[]; readOnly: boolean; onChange: () => void; off: ReturnType<typeof useOffline> }) {
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

  // Notes and links can be captured offline and uploaded on reconnect. Files need a connection.
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

      {evidence.length > 0 && (
        <ul className="space-y-2">
          {evidence.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/20 p-2.5">
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
            <li key={p.id} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 opacity-80">
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
        <div className="space-y-2 rounded-xl border border-border p-3">
          <div className="flex gap-1.5">
            <button onClick={() => setKind('text')} className={`rounded-full px-2.5 py-1 text-xs ${kind === 'text' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>Note</button>
            <button onClick={() => setKind('link')} className={`rounded-full px-2.5 py-1 text-xs ${kind === 'link' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>Link</button>
            <button onClick={() => setKind('file')} className={`rounded-full px-2.5 py-1 text-xs ${kind === 'file' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>File</button>
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          {kind === 'text' && <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Describe the evidence..." className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />}
          {kind === 'link' && <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />}
          {kind === 'file' && (
            <div>
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
              <Button size="sm" variant="outline" className="gap-1.5" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {uploading ? 'Uploading...' : 'Choose a file'}
              </Button>
              {err && <p className="text-xs text-rose-600 mt-1.5">{err}</p>}
            </div>
          )}
          {kind !== 'file' && (
            <div className="flex justify-end">
              <Button size="sm" disabled={busy || (kind === 'text' ? !body.trim() : !url.trim())} onClick={submitEvidence} className="gap-1.5"><Plus className="h-4 w-4" /> Add evidence</Button>
            </div>
          )}
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
          <label key={c.key} className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-sm ${submitted ? 'opacity-70' : 'cursor-pointer hover:bg-muted/30'}`}>
            <input type="checkbox" checked={c.on} disabled={submitted} onChange={(e) => patch.mutate({ [c.field]: e.target.checked })} className="mt-0.5 h-4 w-4" />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
      {submitted ? (
        <div className="rounded-lg bg-blue-500/10 p-3 text-sm text-blue-700 inline-flex items-center gap-2"><Lock className="h-4 w-4" /> Submitted for independent review.</div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{ready ? 'Ready to submit.' : 'Add at least one reflection and one piece of evidence, and check all three gateways.'}</span>
          <Button size="sm" disabled={!ready || submit.isPending} onClick={() => submit.mutate()} className="gap-1.5 shrink-0"><Send className="h-4 w-4" /> Submit for review</Button>
        </div>
      )}
    </Card>
  );
}

function CoachPanel({ cc }: { cc: Mine | undefined }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const next = [...messages, { role: 'user' as const, content: text.trim() }];
    setMessages(next); setInput(''); setLoading(true);
    try {
      const r = await apiFetch<{ reply: string }>('/practice/coach', { method: 'POST', body: JSON.stringify({ messages: next, candidateCredentialId: cc?.id, credentialTitle: cc?.title, activityBrief: cc?.activity_brief }) });
      setMessages((m) => [...m, { role: 'assistant', content: r.reply }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'I could not respond just now. Try again in a moment.' }]);
    } finally { setLoading(false); }
  };

  return (
    <Card className="rounded-none p-0 flex flex-col overflow-hidden lg:sticky lg:top-4 h-[70vh]">
      <div className="border-b border-border p-3">
        <div className="text-sm font-semibold">Mutale · your thinking partner</div>
        <p className="text-xs text-muted-foreground">A Socratic coach. Mutale asks, you think. Turn your experience into articulated learning.</p>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground">
            <p>Start with a real moment. For example: <em>"Two people declined to join the team I was forming, and I'm not sure what to do."</em></p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <span className={`inline-block max-w-[90%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{m.content}</span>
          </div>
        ))}
        {loading && <div className="text-muted-foreground text-sm inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Mutale is thinking...</div>}
      </div>
      <div className="border-t border-border p-2 flex items-end gap-2">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} placeholder="Tell Mutale what happened..."
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm" />
        <Button size="sm" disabled={!input.trim() || loading} onClick={() => send(input)}><Send className="h-4 w-4" /></Button>
      </div>
    </Card>
  );
}
