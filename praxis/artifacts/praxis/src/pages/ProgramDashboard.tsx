import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useSession } from '@/context/SessionContext';
import { getActivePartnerId } from '@/lib/partnerHubData';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { BarChart3, Award, ShieldCheck, Users, ExternalLink } from 'lucide-react';

/**
 * Program insights: the institution / employer view. It turns the whole body of practice work into a
 * capability picture, which leadership practices the workforce is actually earning, how trustworthy the
 * evidence is, and who has been recognised, so a professional body or employer can see the value.
 */
type Overview = {
  totals: { candidates: number; chosen: number; in_progress: number; submitted: number; reviewed: number; referred: number };
  recognitionRate: number;
  authenticity: { typedLivePct: number; attestationsConfirmed: number };
  byCredential: Array<{ code: string; title: string; recognised: number; in_progress: number; submitted: number }>;
  recent: Array<{ public_id: string; recipient_name: string | null; credential_title: string | null; issued_at: string }>;
};

export function ProgramDashboard() {
  const { user } = useSession();
  // Scope to the partner we are acting inside, so a super admin never sees a cross-partner mix.
  const pid = user?.partnerId ?? getActivePartnerId() ?? '';
  const q = pid ? `?partnerId=${encodeURIComponent(pid)}` : '';
  const { data } = useQuery({ queryKey: ['practice-program', pid], queryFn: () => apiFetch<Overview>(`/practice/program-overview${q}`) });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader title="Program insights" icon={BarChart3} subtitle="Capability across the programme: what your people are earning, how sound the evidence is, and who has been recognised." />

      {!data ? (
        <Card className="rounded-none p-10 text-center text-sm text-muted-foreground">Loading...</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Professionals', value: data.totals.candidates, icon: Users },
              { label: 'Recognised', value: data.totals.reviewed, icon: Award },
              { label: 'Recognition rate', value: `${data.recognitionRate}%`, icon: BarChart3 },
              { label: 'In review', value: data.totals.submitted, icon: ShieldCheck },
            ].map((k) => (
              <Card key={k.label} className="rounded-none p-4">
                <k.icon className="h-4 w-4 text-primary" />
                <div className="ed-num text-3xl mt-2">{k.value}</div>
                <div className="ed-overline text-muted-foreground mt-1">{k.label}</div>
              </Card>
            ))}
          </div>

          <Card className="rounded-none p-5">
            <div className="ed-overline text-foreground mb-3">Capability by credential</div>
            {data.byCredential.length === 0 ? (
              <p className="text-sm text-muted-foreground">No credentials in progress yet.</p>
            ) : (
              <div className="space-y-3">
                {(() => {
                  const max = Math.max(1, ...data.byCredential.map((c) => c.recognised + c.submitted + c.in_progress));
                  return data.byCredential.map((c) => {
                    const total = c.recognised + c.submitted + c.in_progress;
                    return (
                      <div key={c.code}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{c.title}</span>
                          <span className="ed-num text-muted-foreground">{c.recognised} recognised</span>
                        </div>
                        <div className="mt-1 flex h-3 w-full bg-muted/40" style={{ width: `${Math.max(6, (total / max) * 100)}%` }}>
                          {c.recognised > 0 && <div className="bg-emerald-500" style={{ width: `${(c.recognised / total) * 100}%` }} title={`${c.recognised} recognised`} />}
                          {c.submitted > 0 && <div className="bg-primary" style={{ width: `${(c.submitted / total) * 100}%` }} title={`${c.submitted} in review`} />}
                          {c.in_progress > 0 && <div className="bg-muted-foreground/40" style={{ width: `${(c.in_progress / total) * 100}%` }} title={`${c.in_progress} in progress`} />}
                        </div>
                      </div>
                    );
                  });
                })()}
                <div className="flex flex-wrap gap-4 pt-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 bg-emerald-500" /> Recognised</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 bg-primary" /> In review</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 bg-muted-foreground/40" /> In progress</span>
                </div>
              </div>
            )}
          </Card>

          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="rounded-none p-5">
              <div className="ed-overline text-foreground mb-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Evidence integrity</div>
              <div className="flex items-baseline gap-2"><span className="ed-num text-3xl">{data.authenticity.typedLivePct}%</span><span className="text-sm text-muted-foreground">of reflection typed live, not pasted</span></div>
              <div className="mt-2 text-sm text-muted-foreground">{data.authenticity.attestationsConfirmed} third-party attestation{data.authenticity.attestationsConfirmed === 1 ? '' : 's'} confirmed across the programme.</div>
            </Card>

            <Card className="rounded-none p-5">
              <div className="ed-overline text-foreground mb-2 flex items-center gap-2"><Award className="h-4 w-4 text-primary" /> Recently recognised</div>
              {data.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No credentials issued yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.recent.map((r) => (
                    <li key={r.public_id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0"><span className="font-medium">{r.recipient_name}</span> <span className="text-muted-foreground">· {r.credential_title}</span></span>
                      <a href={`/verify/${r.public_id}`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 shrink-0 text-xs"><ExternalLink className="h-3 w-3" /> Verify</a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
