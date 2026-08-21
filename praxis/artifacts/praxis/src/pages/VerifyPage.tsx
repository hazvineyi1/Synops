import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ShieldCheck, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

/**
 * Public credential verification (no login). Anyone with the shareable id, an employer, a registry, a
 * professional body, can confirm the credential is real, who earned it, and that it is still valid. This
 * is what turns a recognised portfolio into portable currency.
 */
type Cred = {
  public_id: string; recipient_name: string | null; credential_title: string | null;
  issuer: string; g1: boolean; g2: boolean; g3: boolean; revoked: boolean; issued_at: string;
};

const GATES: [keyof Cred, string][] = [['g1', 'Relevant activity'], ['g2', 'Personal contribution'], ['g3', 'Learning from practice']];

export function VerifyPage({ params }: { params?: { publicId?: string } }) {
  const id = params?.publicId ?? '';
  const [data, setData] = useState<Cred | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Cred>(`/practice/verify/${id}`).then(setData).catch((e) => setError(e?.message || 'No credential with that id.')).finally(() => setLoading(false));
  }, [id]);

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background text-foreground flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );

  if (loading) return shell(<div className="text-muted-foreground inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</div>);
  if (error || !data) return shell(
    <div className="ed-card p-8">
      <div className="ed-overline text-muted-foreground">Credential verification</div>
      <h1 className="ed-h2 mt-2">Not found</h1>
      <p className="text-sm text-muted-foreground mt-2">{error || 'No credential matches this link.'}</p>
    </div>
  );

  const issued = new Date(data.issued_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  return shell(
    <div className="ed-card p-8 space-y-5">
      <div className="flex items-center gap-2">
        {data.revoked
          ? <><XCircle className="h-5 w-5 text-rose-600" /><span className="ed-overline text-rose-700">Revoked credential</span></>
          : <><ShieldCheck className="h-5 w-5 text-emerald-600" /><span className="ed-overline text-emerald-700">Verified credential</span></>}
      </div>

      <div>
        <div className="ed-overline text-muted-foreground">This credential was earned by</div>
        <h1 className="ed-display mt-2" style={{ fontSize: 'clamp(1.8rem,5vw,2.6rem)' }}>{data.recipient_name || 'A professional'}</h1>
      </div>

      <div className="border-l-2 border-primary pl-3">
        <div className="ed-overline text-muted-foreground">Practice credential</div>
        <p className="ed-h2 mt-1">{data.credential_title}</p>
      </div>

      <div>
        <div className="ed-overline text-muted-foreground mb-2">Recognised against three gateways</div>
        <div className="space-y-1.5">
          {GATES.map(([k, label]) => (
            <div key={k as string} className="flex items-center gap-2 text-sm">
              {data[k] ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
              <span className={data[k] ? '' : 'text-muted-foreground'}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ed-rule" />
      <div className="text-xs text-muted-foreground space-y-1">
        <div>Issued by <span className="text-foreground font-medium">{data.issuer}</span> on {issued}.</div>
        <div>Verification id: <span className="font-mono">{data.public_id}</span></div>
        <div>Recognition follows a reviewed practice portfolio: real evidence, the candidate's own reflection, and an independent human review. <a href={`/api/practice/verify/${data.public_id}/assertion`} className="text-primary hover:underline">Machine-readable record</a>.</div>
      </div>
    </div>
  );
}
