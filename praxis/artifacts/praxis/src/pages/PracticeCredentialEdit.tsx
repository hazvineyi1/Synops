import React, { useEffect, useRef, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle2, BookOpen, Eye, Compass } from 'lucide-react';

type Credential = {
  id: string; partner_id: string; code: string; title: string; summary: string | null;
  activity_brief: string | null; gateway_guidance: string | null; example_assignment: string | null; rationale: string | null;
};

// The shared reflective cycle every credential uses (read-only preview here — it's the same framework
// for all credentials, edited in code, not per-credential).
const CYCLE = [
  { n: '01', label: 'Experience', focus: 'Capture what you actually did' },
  { n: '02', label: 'Reflect', focus: 'Look back on it' },
  { n: '03', label: 'Name it', focus: 'Name the idea it points to' },
  { n: '04', label: 'Try it', focus: 'Plan your next turn' },
];

/**
 * In-place, learner-styled editor for a practice credential. It renders the credential exactly as a
 * learner meets it (the intro card) and, for a super admin, every field is editable right there — no
 * separate form, no split. Each field auto-saves on blur. The reflective cycle is shown read-only so the
 * author experiences the lesson shape without leaving to find a link.
 */
export function PracticeCredentialEdit() {
  const [, params] = useRoute('/practice/credential/:id');
  const [, navigate] = useLocation();
  const id = params?.id ?? '';
  const { data: cred, isLoading, refetch } = useQuery({
    queryKey: ['credential-one', id],
    queryFn: () => apiFetch<Credential>(`/practice/credentials/one/${id}`),
    enabled: !!id,
  });

  const save = async (field: keyof Credential, value: string) => {
    await apiFetch(`/practice/credentials/${id}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) });
    refetch();
  };

  if (isLoading) return <div className="max-w-3xl mx-auto p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!cred) return <div className="max-w-3xl mx-auto p-8 text-sm text-muted-foreground">Credential not found.</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-4 py-2">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => navigate('/partner/courses')} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Courses
        </button>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] gap-1"><Eye className="h-3 w-3" /> Editing — this is the learner’s view</Badge>
        </div>
      </div>

      {/* Learner intro card, but every field is editable in place. */}
      <Card className="p-6 space-y-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Practice credential</div>
        <InlineField as="title" value={cred.title} placeholder="Credential title" onSave={(v) => save('title', v)} />
        <InlineField value={cred.summary ?? ''} placeholder="One line on what this credential recognises." muted onSave={(v) => save('summary', v)} />

        <FieldBlock label="Activity" hint="What the learner must do to demonstrate this.">
          <InlineField value={cred.activity_brief ?? ''} placeholder="Describe the activity…" onSave={(v) => save('activity_brief', v)} />
        </FieldBlock>

        <FieldBlock label="How this is reviewed" icon={<CheckCircle2 className="h-3.5 w-3.5" />} hint="What the reviewer looks for; pass or resubmit with feedback.">
          <InlineField value={cred.gateway_guidance ?? ''} placeholder="Describe how it’s reviewed…" onSave={(v) => save('gateway_guidance', v)} />
        </FieldBlock>

        <FieldBlock label="Example" icon={<BookOpen className="h-3.5 w-3.5" />} hint="A concrete example of a strong submission.">
          <InlineField value={cred.example_assignment ?? ''} placeholder="Give an example…" onSave={(v) => save('example_assignment', v)} />
        </FieldBlock>

        <FieldBlock label="Why this matters" hint="A short, research-grounded note on why this capability matters.">
          <InlineField value={cred.rationale ?? ''} placeholder="Why this matters…" onSave={(v) => save('rationale', v)} />
        </FieldBlock>

        <div className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="font-medium">Code</span>
          <InlineField value={cred.code} placeholder="short-code" compact onSave={(v) => save('code', v)} />
        </div>
      </Card>

      {/* Read-only preview of the shared reflective cycle, so the author sees the lesson shape. */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Compass className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">The cycle</span>
          <span className="text-xs text-muted-foreground">Shared by every credential — the learner works through these four stages.</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CYCLE.map((s) => (
            <div key={s.n} className="rounded-lg border border-border p-3">
              <div className="text-[10px] font-semibold text-muted-foreground">{s.n}</div>
              <div className="text-sm font-medium">{s.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.focus}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          To go through the full interactive experience (Mutale coaching, capturing moves), impersonate a learner from the Platform Console.
        </p>
      </Card>
    </div>
  );
}

function FieldBlock({ label, hint, icon, children }: { label: string; hint?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80">{icon}{label}</div>
      {hint && <div className="text-[11px] text-muted-foreground mb-1">{hint}</div>}
      {children}
    </div>
  );
}

/**
 * A field that looks like plain text but is editable: a borderless auto-growing textarea (or a heading
 * input for the title) that saves on blur when the value changed. Shows a brief "Saved" flash.
 */
function InlineField({ value, onSave, placeholder, as, muted, compact }: {
  value: string; onSave: (v: string) => Promise<void> | void; placeholder?: string;
  as?: 'title'; muted?: boolean; compact?: boolean;
}) {
  const [v, setV] = useState(value);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setV(value); }, [value]);
  // Auto-grow.
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }, [v]);

  const commit = async () => {
    if (v === value) return;
    setSaving(true);
    try { await onSave(v.trim()); setSaved(true); setTimeout(() => setSaved(false), 1500); }
    finally { setSaving(false); }
  };

  const base = 'w-full resize-none bg-transparent outline-none rounded-md px-2 -mx-2 py-1 hover:bg-muted/40 focus:bg-muted/50 focus:ring-1 focus:ring-ring transition-colors';
  const cls = as === 'title'
    ? `${base} text-2xl font-serif font-bold leading-tight`
    : `${base} text-sm ${muted ? 'text-muted-foreground' : 'text-foreground'} ${compact ? 'font-mono text-xs' : ''}`;

  return (
    <div className="relative">
      <textarea ref={ref} rows={1} value={v} placeholder={placeholder}
        onChange={(e) => setV(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (as === 'title' && e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
        className={cls} />
      {(saving || saved) && (
        <span className="absolute right-1 top-1 text-[10px] text-emerald-600">{saving ? 'Saving…' : 'Saved'}</span>
      )}
    </div>
  );
}

export default PracticeCredentialEdit;
