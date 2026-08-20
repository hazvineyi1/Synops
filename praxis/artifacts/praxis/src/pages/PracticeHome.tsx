import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Compass, Plus, ArrowRight, Lock, CheckCircle2, MessageSquareQuote, FileText, ChevronUp, ChevronDown, Sparkles,
} from 'lucide-react';

/**
 * Practice Credentials home ("My Credentials"). Practice-first, not a course: the candidate chooses
 * credentials, justifies and orders them, and opens each one's Evidence Canvas. Sequence can be
 * reordered freely until the candidate settles their first two, then it locks.
 */
type Credential = { id: string; code: string; title: string; summary: string | null; activity_brief: string | null; gateway_guidance: string | null; example_assignment: string | null };
type Mine = Credential & {
  credential_id: string; status: string; sort: number; justification: string | null;
  sequence_locked: boolean; reflection_count: number; evidence_count: number;
  latest_feedback: string | null; latest_outcome: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  chosen: 'Chosen', in_progress: 'In progress', submitted: 'With reviewer', reviewed: 'Reviewed', referred: 'Resubmit',
};
const statusTint = (s: string) =>
  s === 'reviewed' ? 'bg-emerald-500/15 text-emerald-700'
    : s === 'referred' ? 'bg-amber-500/15 text-amber-700'
      : s === 'submitted' ? 'bg-blue-500/15 text-blue-700'
        : 'bg-muted text-muted-foreground';

export function PracticeHome() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data: mine = [] } = useQuery({ queryKey: ['practice-me'], queryFn: () => apiFetch<Mine[]>('/practice/me') });
  const { data: catalogue = [] } = useQuery({ queryKey: ['practice-credentials'], queryFn: () => apiFetch<Credential[]>('/practice/credentials') });

  const [picking, setPicking] = useState(false);
  const chosenIds = new Set(mine.map((m) => m.credential_id));
  const available = catalogue.filter((c) => !chosenIds.has(c.id));
  const settledTwo = mine.length >= 2;
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
      <PageHeader
        title="My Practice Credentials"
        icon={Compass}
        subtitle="You are not taking a course. You are turning what you already do as a leader into recognised credentials: reflect on real experience, gather evidence, and submit it for recognition."
        action={<Button className="gap-1.5" onClick={() => setPicking((p) => !p)}><Plus className="h-4 w-4" /> Choose a credential</Button>}
      />

      {mine.length > 0 && (
        <Card className="p-4 flex items-start gap-3 border-dashed">
          <MessageSquareQuote className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium">Reflect on WhatsApp</div>
            <div className="text-xs text-muted-foreground">Once your number is linked to the programme, you can message Mutale on WhatsApp to reflect on the go, on cheap data. What you write there is saved to your active credential here. Ask your programme coordinator to switch it on.</div>
          </div>
        </Card>
      )}

      {/* Choose credentials */}
      {(picking || mine.length === 0) && (
        <Card className="p-5 space-y-3 border-primary/30">
          <div className="text-sm font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Choose your credentials</div>
          <p className="text-xs text-muted-foreground">Pick the leadership practices you want recognised, and say in a line why you chose each. You can reorder them freely until you settle your first two, then the sequence locks.</p>
          {available.length === 0 && <p className="text-sm text-muted-foreground">You have chosen every credential in this programme.</p>}
          <div className="space-y-2">
            {available.map((c) => <ChooseRow key={c.id} cred={c} onChoose={(justification) => choose.mutate({ credentialId: c.id, justification })} busy={choose.isPending} />)}
          </div>
        </Card>
      )}

      {/* Chosen credentials */}
      <div className="space-y-3">
        {mine.map((m, idx) => (
          <Card key={m.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-serif font-semibold text-lg">{m.title}</span>
                  <Badge className={`text-[10px] border-transparent ${statusTint(m.status)}`}>{STATUS_LABEL[m.status] ?? m.status}</Badge>
                  {m.sequence_locked && <Badge variant="outline" className="text-[10px] gap-1"><Lock className="h-3 w-3" /> Locked</Badge>}
                </div>
                {m.summary && <p className="text-sm text-muted-foreground mt-0.5">{m.summary}</p>}
                {m.justification && <p className="text-xs text-muted-foreground mt-1 italic">"{m.justification}"</p>}
              </div>
              {!anyLocked && mine.length > 1 && (
                <div className="flex flex-col shrink-0">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move up"><ChevronUp className="h-4 w-4" /></button>
                  <button onClick={() => move(idx, 1)} disabled={idx === mine.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move down"><ChevronDown className="h-4 w-4" /></button>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><MessageSquareQuote className="h-3.5 w-3.5" /> {m.reflection_count} reflection{m.reflection_count === 1 ? '' : 's'}</span>
              <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> {m.evidence_count} evidence item{m.evidence_count === 1 ? '' : 's'}</span>
            </div>

            {/* Returned developmental feedback */}
            {m.latest_feedback && (m.status === 'reviewed' || m.status === 'referred') && (
              <div className={`mt-3 rounded-xl border p-3 text-sm ${m.status === 'reviewed' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                <div className="flex items-center gap-1.5 font-medium mb-1">
                  {m.status === 'reviewed' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <ArrowRight className="h-4 w-4 text-amber-600" />}
                  {m.status === 'reviewed' ? 'Recognised' : 'Referred for resubmission'} · developmental feedback
                </div>
                <p className="whitespace-pre-wrap text-muted-foreground">{m.latest_feedback}</p>
              </div>
            )}

            <div className="mt-3">
              <Button size="sm" onClick={() => navigate(`/practice/c/${m.id}`)} className="gap-1.5">
                {m.status === 'referred' ? 'Revise and resubmit' : m.status === 'submitted' ? 'View portfolio' : 'Open canvas'} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Lock sequence prompt */}
      {settledTwo && !anyLocked && (
        <Card className="p-4 flex items-center justify-between gap-3 border-dashed">
          <div className="text-sm text-muted-foreground">Happy with your credentials and their order? Locking sets your sequence for the programme. You can still work on them in any order.</div>
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
