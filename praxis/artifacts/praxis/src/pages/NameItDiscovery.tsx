import React, { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Lightbulb, HelpCircle, Check, ArrowRight } from 'lucide-react';

/*
 * "Name it" discovery flow for the leadership practice cycle. Implements the design: the candidate
 * describes an experience, the system recognises the PHENOMENA in it and offers SEVERAL lenses, the
 * candidate chooses one and then critically tests the fit. The coach never decides which theory applies.
 *
 * Sequence: (optional) inquiry beat — practise asking good questions → find the phenomenon → choose a
 * lens (bite-size, text-first) → test the fit (three questions the candidate answers into their portfolio).
 */

type Phenom = { id: string; label: string; why?: string };
type Lens = { id: string; name: string; tradition: string; gist: string; origin: string };

export function NameItDiscovery({ id, coachName = 'Mutale', onSaved }: { id: string; coachName?: string; onSaved?: () => void }) {
  const [inquiry, setInquiry] = useState('');
  const [inquiryFeedback, setInquiryFeedback] = useState<string | null>(null);
  const [inquiryBusy, setInquiryBusy] = useState(false);

  const [phenoms, setPhenoms] = useState<Phenom[] | null>(null);
  const [phenomBusy, setPhenomBusy] = useState(false);
  const [chosenPhenom, setChosenPhenom] = useState<Phenom | null>(null);

  const [lenses, setLenses] = useState<Lens[] | null>(null);
  const [lensBusy, setLensBusy] = useState(false);
  const [chosenLens, setChosenLens] = useState<Lens | null>(null);

  const [questions, setQuestions] = useState<string[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [testBusy, setTestBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cn = coachName || 'Mutale';

  const askInquiry = async () => {
    if (!inquiry.trim()) return;
    setInquiryBusy(true); setErr(null);
    try {
      const r = await apiFetch<{ reply: string }>('/practice/name/inquiry', { method: 'POST', body: JSON.stringify({ candidateCredentialId: id, questions: inquiry, coachName: cn }) });
      setInquiryFeedback(r.reply);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not reach the coach.'); }
    finally { setInquiryBusy(false); }
  };

  const findPhenomena = async () => {
    setPhenomBusy(true); setErr(null);
    try {
      const r = await apiFetch<{ phenomena: Phenom[] }>('/practice/name/phenomena', { method: 'POST', body: JSON.stringify({ candidateCredentialId: id }) });
      setPhenoms(r.phenomena ?? []);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not reach the coach.'); }
    finally { setPhenomBusy(false); }
  };

  const pickPhenom = async (p: Phenom) => {
    setChosenPhenom(p); setLenses(null); setChosenLens(null); setQuestions(null); setLensBusy(true); setErr(null);
    try {
      const r = await apiFetch<{ lenses: Lens[] }>(`/practice/name/phenomena/${encodeURIComponent(p.id)}/lenses`);
      setLenses(r.lenses ?? []);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load lenses.'); }
    finally { setLensBusy(false); }
  };

  const pickLens = async (l: Lens) => {
    if (!chosenPhenom) return;
    setChosenLens(l); setQuestions(null); setTestBusy(true); setErr(null);
    try {
      await apiFetch('/practice/name/select', { method: 'POST', body: JSON.stringify({ candidateCredentialId: id, phenomenonId: chosenPhenom.id, lensId: l.id }) });
      const r = await apiFetch<{ questions: string[] }>('/practice/name/interrogate', { method: 'POST', body: JSON.stringify({ candidateCredentialId: id, phenomenonId: chosenPhenom.id, lensId: l.id, coachName: cn }) });
      setQuestions(r.questions ?? []);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not reach the coach.'); }
    finally { setTestBusy(false); }
  };

  const saveAnswer = async (i: number) => {
    const content = (answers[i] ?? '').trim();
    if (!content) return;
    try {
      await apiFetch(`/practice/me/credentials/${id}/reflections`, { method: 'POST', body: JSON.stringify({ stage: 'analysis', content }) });
      setSaved((s) => ({ ...s, [i]: true }));
      onSaved?.();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };

  return (
    <div className="border border-primary/30 bg-primary/5 rounded-none p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-primary" />
        <span className="ed-overline text-primary">Make sense of it with theory</span>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        You do not need to know any theory in advance. Describe what you are trying to understand, and {cn} will help you find and test ideas that might explain it. The thinking stays yours.
      </p>

      {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}

      {/* Step 1 — inquiry beat: practise asking, before any theory */}
      <div className="rounded-none border border-border bg-background p-3">
        <div className="flex items-center gap-1.5 text-sm font-medium"><HelpCircle className="h-3.5 w-3.5 text-primary" /> First, what would you ask?</div>
        <p className="text-xs text-muted-foreground mt-0.5">Before naming anything, what questions would you ask your team or the people involved to understand what really happened? {cn} will help you sharpen the questions, not answer them.</p>
        <textarea
          value={inquiry}
          onChange={(e) => setInquiry(e.target.value)}
          rows={2}
          placeholder="e.g. What did each person think their role was? When did they first feel unsure?"
          className="mt-2 w-full rounded-none border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={inquiryBusy || !inquiry.trim()} onClick={askInquiry} className="gap-1.5">
            {inquiryBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Sharpen my questions
          </Button>
        </div>
        {inquiryFeedback && <p className="mt-2 text-sm text-foreground bg-muted/50 rounded px-3 py-2 whitespace-pre-wrap">{inquiryFeedback}</p>}
      </div>

      {/* Step 2 — find the phenomenon */}
      <div>
        {!phenoms && (
          <Button size="sm" disabled={phenomBusy} onClick={findPhenomena} className="gap-1.5">
            {phenomBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />} Help me find what this is about
          </Button>
        )}
        {phenoms && (
          <div>
            <div className="ed-overline text-muted-foreground mb-2">This might be about… which rings truest?</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {phenoms.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pickPhenom(p)}
                  className={`text-left rounded-none border p-3 transition-colors ${chosenPhenom?.id === p.id ? 'border-primary bg-primary/10 ring-1 ring-primary/40' : 'border-border bg-background hover:border-primary/40'}`}
                >
                  <div className="text-sm font-medium">{p.label}</div>
                  {p.why && <div className="text-xs text-muted-foreground mt-1">{p.why}</div>}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">These are possibilities, not a diagnosis. Pick the one closest to your experience, or re-run if none fit.</p>
          </div>
        )}
      </div>

      {/* Step 3 — choose a lens */}
      {chosenPhenom && (
        <div>
          <div className="ed-overline text-muted-foreground mb-2">Ideas that might explain "{chosenPhenom.label.toLowerCase()}"</div>
          {lensBusy && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Finding lenses…</div>}
          <div className="space-y-2">
            {(lenses ?? []).map((l) => (
              <button
                key={l.id}
                onClick={() => pickLens(l)}
                className={`w-full text-left rounded-none border p-3 transition-colors ${chosenLens?.id === l.id ? 'border-primary bg-primary/10 ring-1 ring-primary/40' : 'border-border bg-background hover:border-primary/40'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{l.name}</span>
                  {l.tradition === 'contextual' && <span className="text-[10px] uppercase tracking-wide text-primary border border-primary/40 rounded px-1">contextual</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{l.gist}</div>
                <div className="text-[11px] text-muted-foreground/80 mt-1 italic">{l.origin}</div>
              </button>
            ))}
          </div>
          {chosenLens && <p className="text-[11px] text-muted-foreground mt-2">You chose this, {cn} did not. Next, test whether it really fits.</p>}
        </div>
      )}

      {/* Step 4 — test the fit */}
      {chosenLens && (
        <div>
          <div className="ed-overline text-muted-foreground mb-2">Test the fit — is this really the best explanation?</div>
          {testBusy && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {cn} is preparing questions…</div>}
          <div className="space-y-3">
            {(questions ?? []).map((q, i) => (
              <div key={i} className="rounded-none border border-border bg-background p-3">
                <div className="text-sm font-medium">{q}</div>
                <textarea
                  value={answers[i] ?? ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                  rows={2}
                  placeholder="Your thinking…"
                  className="mt-2 w-full rounded-none border border-input bg-background px-3 py-2 text-sm"
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={!(answers[i] ?? '').trim() || saved[i]} onClick={() => saveAnswer(i)} className="gap-1.5">
                    {saved[i] ? <Check className="h-3.5 w-3.5 text-primary" /> : null} {saved[i] ? 'Added to your analysis' : 'Add to my analysis'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {questions && questions.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-2">Using a lens critically — testing it, not just citing it — is the point. When you have tested it, name the idea it leaves you with below.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default NameItDiscovery;
