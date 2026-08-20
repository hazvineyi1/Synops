import React, { useState, useRef, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Send, Plus, Trash2, CheckCircle2, Lock, BookOpen, Lightbulb, Paperclip, Link2, Loader2, Upload, Download,
} from 'lucide-react';

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
const stageLabel = (k: string) => GIBBS.find((g) => g.key === k)?.label ?? 'Note';

export function PracticeCanvas() {
  const [, params] = useRoute('/practice/c/:id');
  const id = params?.id ?? '';
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data: mine = [] } = useQuery({ queryKey: ['practice-me'], queryFn: () => apiFetch<Mine[]>('/practice/me') });
  const cc = mine.find((m) => m.id === id);
  const { data: reflections = [] } = useQuery({ queryKey: ['practice-reflections', id], queryFn: () => apiFetch<Reflection[]>(`/practice/me/credentials/${id}/reflections`), enabled: !!id });
  const { data: evidence = [] } = useQuery({ queryKey: ['practice-evidence', id], queryFn: () => apiFetch<Evidence[]>(`/practice/me/credentials/${id}/evidence`), enabled: !!id });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['practice-reflections', id] }); qc.invalidateQueries({ queryKey: ['practice-evidence', id] }); qc.invalidateQueries({ queryKey: ['practice-me'] }); };

  const submitted = cc?.status === 'submitted' || cc?.status === 'reviewed';
  const readOnly = submitted;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <button onClick={() => navigate('/practice')} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> My credentials</button>

      {/* Header */}
      <Card className="p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="font-serif text-2xl font-bold">{cc?.title ?? 'Credential'}</h1>
          {cc && <Badge variant="outline" className="text-[10px] capitalize">{cc.status.replace('_', ' ')}</Badge>}
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

      <div className="grid lg:grid-cols-[1fr_380px] gap-4 items-start">
        {/* Left: reflection + evidence + gateway + submit */}
        <div className="space-y-4">
          <ReflectionPanel id={id} reflections={reflections} readOnly={readOnly} onChange={invalidate} />
          <EvidencePanel id={id} evidence={evidence} readOnly={readOnly} onChange={invalidate} />
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

function ReflectionPanel({ id, reflections, readOnly, onChange }: { id: string; reflections: Reflection[]; readOnly: boolean; onChange: () => void }) {
  const [stage, setStage] = useState('note');
  const [content, setContent] = useState('');
  const add = useMutation({
    mutationFn: () => apiFetch(`/practice/me/credentials/${id}/reflections`, { method: 'POST', body: JSON.stringify({ stage, content: content.trim() }) }),
    onSuccess: () => { setContent(''); onChange(); },
  });
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold"><Lightbulb className="h-4 w-4 text-primary" /> Reflection</div>
      <p className="text-xs text-muted-foreground">Reflection happens over time and in bits. Capture a thought whenever it comes, and work the stages as you go. Learning becomes visible here.</p>

      {reflections.length > 0 && (
        <ol className="space-y-2 border-l-2 border-border pl-4">
          {reflections.map((r) => (
            <li key={r.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary/60" />
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{stageLabel(r.stage)} · {new Date(r.created_at).toLocaleDateString()}</div>
              <p className="text-sm whitespace-pre-wrap">{r.content}</p>
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
            <Button size="sm" disabled={!content.trim() || add.isPending} onClick={() => add.mutate()} className="gap-1.5"><Plus className="h-4 w-4" /> Add to reflection</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function EvidencePanel({ id, evidence, readOnly, onChange }: { id: string; evidence: Evidence[]; readOnly: boolean; onChange: () => void }) {
  const [kind, setKind] = useState<'text' | 'link' | 'file'>('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = useMutation({
    mutationFn: () => apiFetch(`/practice/me/credentials/${id}/evidence`, { method: 'POST', body: JSON.stringify({ kind, title: title.trim() || null, body: kind === 'text' ? body.trim() : null, url: kind === 'link' ? url.trim() : null }) }),
    onSuccess: () => { setTitle(''); setBody(''); setUrl(''); onChange(); },
  });
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
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4 text-primary" /> Evidence</div>
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
              <Button size="sm" disabled={add.isPending || (kind === 'text' ? !body.trim() : !url.trim())} onClick={() => add.mutate()} className="gap-1.5"><Plus className="h-4 w-4" /> Add evidence</Button>
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
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-primary" /> Gateway self-check</div>
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
      const r = await apiFetch<{ reply: string }>('/practice/coach', { method: 'POST', body: JSON.stringify({ messages: next, credentialTitle: cc?.title, activityBrief: cc?.activity_brief }) });
      setMessages((m) => [...m, { role: 'assistant', content: r.reply }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'I could not respond just now. Try again in a moment.' }]);
    } finally { setLoading(false); }
  };

  return (
    <Card className="p-0 flex flex-col overflow-hidden lg:sticky lg:top-4 h-[70vh]">
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
