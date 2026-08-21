import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from 'lucide-react';

/**
 * Public attestation page (no login). A witness the candidate named, a manager, peer or report, opens
 * their magic link and confirms, in their own name, that the real event happened and the candidate did
 * it. This is the strongest authenticity signal because it comes from outside the candidate's account.
 */
type Att = {
  relationship: string; prompt: string; status: string;
  response_name?: string | null; credential_title: string; candidate_first_name: string | null;
};

const REL: Record<string, string> = { manager: 'their manager', peer: 'a colleague', report: 'someone they lead', other: 'a witness' };

export function AttestPage({ params }: { params?: { token?: string } }) {
  const token = params?.token ?? '';
  const [data, setData] = useState<Att | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Att>(`/practice/attest/${token}`).then(setData).catch((e) => setError(e?.message || 'This link is not valid.')).finally(() => setLoading(false));
  }, [token]);

  const respond = async (decision: 'confirm' | 'decline') => {
    if (!name.trim()) { setFormErr('Please enter your name.'); return; }
    setFormErr(null); setSubmitting(true);
    try {
      const r = await apiFetch<{ status: string }>(`/practice/attest/${token}`, { method: 'POST', body: JSON.stringify({ name: name.trim(), role: role.trim(), comment: comment.trim(), decision }) });
      setDone(r.status);
    } catch (e: any) { setFormErr(e?.message || 'Could not submit. Try again.'); } finally { setSubmitting(false); }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background text-foreground flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );

  if (loading) return shell(<div className="text-muted-foreground inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>);
  if (error || !data) return shell(
    <div className="ed-card p-8">
      <div className="ed-overline text-muted-foreground">Attestation</div>
      <h1 className="ed-h2 mt-2">This link is not valid</h1>
      <p className="text-sm text-muted-foreground mt-2">{error || 'The attestation could not be found. Ask the person who sent it for a new link.'}</p>
    </div>
  );

  const who = data.candidate_first_name || 'A professional';
  const alreadyAnswered = data.status !== 'pending' && !done;

  if (done || alreadyAnswered) {
    const status = done || data.status;
    return shell(
      <div className="ed-card p-8">
        <div className="ed-overline text-muted-foreground">Attestation</div>
        <div className="mt-3 inline-flex items-center gap-2">
          {status === 'confirmed' ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <XCircle className="h-6 w-6 text-muted-foreground" />}
          <h1 className="ed-h2">{status === 'confirmed' ? 'Thank you, confirmed' : 'Response recorded'}</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-3">{status === 'confirmed'
          ? `Your confirmation has been added to ${who}'s portfolio. It helps an independent reviewer trust that this work is real. You can close this page.`
          : `Your response has been recorded. You can close this page.`}</p>
      </div>
    );
  }

  return shell(
    <div className="ed-card p-8 space-y-5">
      <div>
        <div className="ed-overline text-muted-foreground inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> A request to confirm</div>
        <h1 className="ed-h2 mt-2">{who} has asked you to confirm something</h1>
        <p className="text-sm text-muted-foreground mt-2">They named you as {REL[data.relationship] || 'a witness'} for the Practice Credential <span className="text-foreground font-medium">{data.credential_title}</span>. Please confirm only what you actually witnessed, in your own name.</p>
      </div>

      <div className="border-l-2 border-primary pl-3">
        <div className="ed-overline text-muted-foreground">They are asking you to confirm</div>
        <p className="text-sm mt-1 whitespace-pre-wrap">{data.prompt}</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium">Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="mt-1 w-full rounded-none border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium">Your role or relationship (optional)</label>
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Ward Manager, St Mary's" className="mt-1 w-full rounded-none border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium">Anything you would add (optional)</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="A sentence in your own words, if you wish." className="mt-1 w-full rounded-none border border-input bg-background px-3 py-2 text-sm" />
        </div>
        {formErr && <p className="text-xs text-rose-600">{formErr}</p>}
        <div className="flex items-center gap-2">
          <Button disabled={submitting} onClick={() => respond('confirm')} className="gap-1.5 rounded-none">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirm this is true
          </Button>
          <Button variant="outline" disabled={submitting} onClick={() => respond('decline')} className="gap-1.5 rounded-none">
            <XCircle className="h-4 w-4" /> I cannot confirm
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Your name and response are shared with {who} and their reviewer. Nothing else about you is stored.</p>
      </div>
    </div>
  );
}
