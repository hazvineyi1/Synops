import React, { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useGetMe } from '@workspace/api-client-react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Users, ArrowLeft, Loader2, Plus, Lock } from 'lucide-react';

/*
 * Asynchronous Learning Sets. A member brings an experience; the group asks questions (round one accepts
 * ONLY questions — the structure does the facilitating); the author answers, opening the next round; then
 * lenses are proposed. Every question is a durable, assessable record of the asking skill.
 */

type SetRow = { id: string; title: string; member_count: number; topic_count: number };
type Member = { id: string; name: string; role: string };
type TopicRow = { id: string; title: string; status: string; round: number; author: string; is_author: boolean; question_count: number };
type Post = { id: string; kind: string; body: string; round: number; author: string; is_mine: boolean; created_at: string };

const STATUS_LABEL: Record<string, string> = { questions: 'Asking questions', lenses: 'Finding lenses', closed: 'Closed' };

// ── List of my sets ────────────────────────────────────────────────────────────────────────────
export function PracticeSets() {
  const [, navigate] = useLocation();
  const { data: me } = useGetMe();
  const [sets, setSets] = useState<SetRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [emails, setEmails] = useState('');
  const [busy, setBusy] = useState(false);
  const isSuper = me?.role === 'super_admin';

  const load = () => apiFetch<SetRow[]>('/practice/sets/mine').then(setSets).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load your sets.'));
  useEffect(() => { load(); }, []);

  const createSet = async () => {
    if (!title.trim()) return;
    setBusy(true); setErr(null);
    try {
      const list = emails.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      await apiFetch('/practice/sets', { method: 'POST', body: JSON.stringify({ title: title.trim(), emails: list }) });
      setTitle(''); setEmails(''); load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not create the set.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><h1 className="text-2xl font-serif font-bold tracking-tight">Learning Sets</h1></div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">Bring a real experience to a small group. The group helps you understand it by asking questions first, before anyone offers a theory. Everything is written, so you think across shifts and time zones, in your own time.</p>
      </div>

      {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}

      {isSuper && (
        <div className="rounded-md border border-border p-4 bg-muted/30">
          <div className="text-sm font-medium mb-2">Create a set</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Set name (e.g. Clinical leaders — cohort 1)" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mb-2" />
          <textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={2} placeholder="Member emails, comma or line separated (a set of eight works well)" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <Button size="sm" className="mt-2 gap-1.5" disabled={busy || !title.trim()} onClick={createSet}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create set</Button>
        </div>
      )}

      {!sets && !err && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
      {sets && sets.length === 0 && <p className="text-sm text-muted-foreground">You are not in a learning set yet.</p>}
      <div className="space-y-2">
        {(sets ?? []).map((s) => (
          <button key={s.id} onClick={() => navigate(`/practice/sets/${s.id}`)} className="w-full text-left rounded-md border border-border bg-background p-4 hover:border-primary/40 transition-colors">
            <div className="font-serif font-semibold">{s.title}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.member_count} member{s.member_count === 1 ? '' : 's'} · {s.topic_count} topic{s.topic_count === 1 ? '' : 's'}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── One set: members + topics + bring a topic ────────────────────────────────────────────────────
export function PracticeSet() {
  const [, params] = useRoute('/practice/sets/:id');
  const [, navigate] = useLocation();
  const id = params?.id ?? '';
  const [data, setData] = useState<{ set: { title: string }; role: string; members: Member[]; topics: TopicRow[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showBring, setShowBring] = useState(false);
  const [title, setTitle] = useState('');
  const [experience, setExperience] = useState('');
  const [phenomenon, setPhenomenon] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => apiFetch<any>(`/practice/sets/${id}`).then(setData).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load this set.'));
  useEffect(() => { if (id) load(); }, [id]);

  const bring = async () => {
    if (!title.trim() || !experience.trim()) return;
    setBusy(true); setErr(null);
    try {
      await apiFetch(`/practice/sets/${id}/topics`, { method: 'POST', body: JSON.stringify({ title: title.trim(), experience: experience.trim(), phenomenon: phenomenon.trim() || undefined }) });
      setTitle(''); setExperience(''); setPhenomenon(''); setShowBring(false); load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not post your topic.'); }
    finally { setBusy(false); }
  };

  if (err) return <div className="max-w-3xl mx-auto py-10 text-sm text-red-600">{err}</div>;
  if (!data) return <div className="max-w-3xl mx-auto py-10 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <button onClick={() => navigate('/practice/sets')} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> All sets</button>
      <h1 className="text-2xl font-serif font-bold tracking-tight">{data.set.title}</h1>
      <div className="text-xs text-muted-foreground">{data.members.map((m) => m.name + (m.role === 'facilitator' ? ' (facilitator)' : '')).join(' · ')}</div>

      <div className="flex items-center justify-between">
        <h2 className="font-serif font-semibold">Topics</h2>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowBring((v) => !v)}><Plus className="h-3.5 w-3.5" /> Bring a topic</Button>
      </div>

      {showBring && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-2">
          <p className="text-xs text-muted-foreground">Bring a real experience you are trying to understand. The group will ask you questions before offering any theory.</p>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A short title" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <textarea value={experience} onChange={(e) => setExperience(e.target.value)} rows={4} placeholder="What happened? Describe it plainly, as if telling a colleague." className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <textarea value={phenomenon} onChange={(e) => setPhenomenon(e.target.value)} rows={2} placeholder="What are you trying to understand about it? (optional)" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <Button size="sm" className="gap-1.5" disabled={busy || !title.trim() || !experience.trim()} onClick={bring}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Post to the set</Button>
        </div>
      )}

      <div className="space-y-2">
        {data.topics.length === 0 && <p className="text-sm text-muted-foreground">No topics yet. Be the first to bring one.</p>}
        {data.topics.map((t) => (
          <button key={t.id} onClick={() => navigate(`/practice/sets/${id}/t/${t.id}`)} className="w-full text-left rounded-md border border-border bg-background p-4 hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">{t.title}</div>
              <span className={`text-[11px] rounded px-2 py-0.5 ${t.status === 'closed' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">Brought by {t.is_author ? 'you' : t.author} · {t.question_count} question{t.question_count === 1 ? '' : 's'} asked</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── One topic: the questions-first thread ────────────────────────────────────────────────────────
export function PracticeTopic() {
  const [, params] = useRoute('/practice/sets/:id/t/:tid');
  const [, navigate] = useLocation();
  const setId = params?.id ?? '';
  const tid = params?.tid ?? '';
  const [data, setData] = useState<{ topic: any; posts: Post[]; myQuestionsThisRound: number; minQuestionsPerRound: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => apiFetch<any>(`/practice/topics/${tid}`).then(setData).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load this topic.'));
  useEffect(() => { if (tid) load(); }, [tid]);

  const post = async () => {
    if (!body.trim()) return;
    setBusy(true); setErr(null);
    try { await apiFetch(`/practice/topics/${tid}/posts`, { method: 'POST', body: JSON.stringify({ body: body.trim() }) }); setBody(''); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not post.'); }
    finally { setBusy(false); }
  };
  const advance = async () => {
    setBusy(true); setErr(null);
    try { await apiFetch(`/practice/topics/${tid}/advance`, { method: 'POST', body: JSON.stringify({}) }); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not advance.'); }
    finally { setBusy(false); }
  };

  if (err) return <div className="max-w-3xl mx-auto py-10 text-sm text-red-600">{err}</div>;
  if (!data) return <div className="max-w-3xl mx-auto py-10 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  const t = data.topic;
  const isQuestions = t.status === 'questions';
  const isLenses = t.status === 'lenses';
  const isClosed = t.status === 'closed';
  const kindLabel: Record<string, string> = { question: 'Question', answer: 'Answer', lens: 'Lens' };

  // What the compose box does depends on who you are and the phase.
  const composeLabel = isClosed ? '' : t.isAuthor ? 'Answer the questions' : isLenses ? 'Propose a lens' : 'Ask a question';
  const composePlaceholder = t.isAuthor
    ? 'Answer what the group has asked so far. Posting an answer opens the next round of questions.'
    : isLenses
      ? 'Suggest an idea or theory that might explain what is going on, and why.'
      : 'Ask an open question that helps them understand what happened. No advice yet.';

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <button onClick={() => navigate(`/practice/sets/${setId}`)} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Back to the set</button>

      <div className="rounded-md border border-border bg-background p-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-serif font-bold">{t.title}</h1>
          <span className={`text-[11px] rounded px-2 py-0.5 ${isClosed ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">Brought by {t.isAuthor ? 'you' : t.author} · round {t.round}</div>
        <p className="text-sm mt-3 whitespace-pre-wrap">{t.experience}</p>
        {t.phenomenon && <p className="text-sm text-muted-foreground mt-2"><span className="font-medium text-foreground">Trying to understand:</span> {t.phenomenon}</p>}
      </div>

      {isQuestions && (
        <div className="text-xs text-muted-foreground bg-muted/40 border border-border rounded px-3 py-2">
          Round one is for <strong>questions only</strong> — no advice or solutions yet. Good questions are how the group helps {t.isAuthor ? 'you' : t.author.split(' ')[0]} understand what happened.
        </div>
      )}

      <div className="space-y-3">
        {data.posts.map((p) => (
          <div key={p.id} className={`rounded-md border p-3 ${p.kind === 'answer' ? 'border-primary/30 bg-primary/5' : 'border-border bg-background'}`}>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className={`rounded px-1.5 py-0.5 ${p.kind === 'answer' ? 'bg-primary/15 text-primary' : p.kind === 'lens' ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground'}`}>{kindLabel[p.kind] ?? p.kind}</span>
              <span>{p.is_mine ? 'You' : p.author}</span>
              <span>· round {p.round}</span>
            </div>
            <p className="text-sm mt-1.5 whitespace-pre-wrap">{p.body}</p>
          </div>
        ))}
        {data.posts.length === 0 && <p className="text-sm text-muted-foreground">{t.isAuthor ? 'No questions yet — the group will start asking.' : 'Be the first to ask a question.'}</p>}
      </div>

      {!isClosed && (
        <div className="rounded-md border border-border bg-background p-3">
          <div className="text-sm font-medium">{composeLabel}</div>
          {!t.isAuthor && isQuestions && (
            <div className="text-xs text-muted-foreground mt-0.5">You have asked {data.myQuestionsThisRound} of {data.minQuestionsPerRound} questions this round.</div>
          )}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder={composePlaceholder} className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" className="gap-1.5" disabled={busy || !body.trim()} onClick={post}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Post {composeLabel.toLowerCase().startsWith('ask') ? 'question' : composeLabel.toLowerCase().startsWith('propose') ? 'lens' : 'answer'}</Button>
            {t.isAuthor && (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={advance}>
                {isQuestions ? 'Move to finding lenses' : 'Close this topic'}
              </Button>
            )}
          </div>
        </div>
      )}
      {isClosed && <div className="text-sm text-muted-foreground flex items-center gap-2"><Lock className="h-4 w-4" /> This topic is closed. The lenses proposed here are put forward for the library and curated afterwards.</div>}
    </div>
  );
}

export default PracticeSets;
