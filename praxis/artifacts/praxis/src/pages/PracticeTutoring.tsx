import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useSession } from '@/context/SessionContext';
import { getActivePartnerId } from '@/lib/partnerHubData';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserCheck, CheckCircle2 } from 'lucide-react';

/**
 * Tutors and learning plans. Under the framework each candidate agrees an individual learning plan with
 * their tutor. Tutors coach and never review their own candidates: the review queue skips a candidate's
 * tutor automatically. Admins assign tutors here; a tutor sees their candidates and agrees each plan.
 */
type Person = { id: string; first_name: string | null; last_name: string | null; email: string | null };
type PlanItem = { id: string; title: string; sort: number; status: string; justification: string | null; plan_approved_at: string | null };
type AdminData = { mode: 'admin'; candidates: Person[]; tutors: Person[]; assignments: Array<{ candidate_id: string; tutor_id: string }>; needsMigration?: boolean };
type TutorData = { mode: 'tutor'; tutees: Array<Person & { plan: PlanItem[] }> };

const name = (p: Person) => [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unnamed';

export function PracticeTutoring() {
  const { user } = useSession();
  const pid = user?.partnerId ?? getActivePartnerId() ?? '';
  const q = pid ? `?partnerId=${encodeURIComponent(pid)}` : '';
  const { data, refetch, isLoading } = useQuery({ queryKey: ['practice-tutoring', pid], queryFn: () => apiFetch<AdminData | TutorData>(`/practice/tutoring${q}`) });
  const assign = useMutation({
    mutationFn: ({ candidateId, tutorId }: { candidateId: string; tutorId: string }) =>
      apiFetch(`/practice/tutoring/${candidateId}${q}`, { method: 'PUT', body: JSON.stringify({ tutorId: tutorId || null }) }),
    onSuccess: () => refetch(),
  });
  const approve = useMutation({
    mutationFn: (candidateId: string) => apiFetch(`/practice/tutoring/${candidateId}/approve-plan`, { method: 'POST' }),
    onSuccess: () => refetch(),
  });

  if (isLoading || !data) return <div className="max-w-4xl mx-auto p-8 text-sm text-muted-foreground">Loading...</div>;

  if (data.mode === 'tutor') {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <PageHeader title="My candidates" icon={UserCheck} subtitle="Agree each candidate's learning plan: the credentials they chose, the order, and why. You coach these candidates and will not review their portfolios." />
        {data.tutees.length === 0 && <Card className="rounded-none p-6 text-sm text-muted-foreground">No candidates have been assigned to you yet.</Card>}
        {data.tutees.map((t) => {
          const pending = t.plan.filter((p) => !p.plan_approved_at).length;
          return (
            <Card key={t.id} className="rounded-none p-5 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{name(t)}</span>
                {t.plan.length > 0 && (pending === 0
                  ? <Badge className="rounded-none text-[10px] bg-emerald-600 text-white gap-1"><CheckCircle2 className="h-3 w-3" /> Plan agreed</Badge>
                  : <Badge variant="outline" className="rounded-none text-[10px]">{pending} to agree</Badge>)}
                {pending > 0 && <Button size="sm" className="ml-auto" disabled={approve.isPending} onClick={() => approve.mutate(t.id)}>Agree plan</Button>}
              </div>
              {t.plan.length === 0 ? (
                <p className="text-sm text-muted-foreground">No credentials chosen yet.</p>
              ) : (
                <ol className="space-y-2">
                  {t.plan.map((p, i) => (
                    <li key={p.id} className="text-sm border-l-2 border-border pl-3">
                      <div className="flex items-center gap-2"><span className="ed-num text-muted-foreground">{i + 1}</span><span className="font-medium">{p.title}</span>
                        <span className="text-xs text-muted-foreground">{p.status.replace('_', ' ')}</span>
                        {p.plan_approved_at && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                      </div>
                      {p.justification && <p className="text-xs text-muted-foreground mt-0.5">{p.justification}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          );
        })}
      </div>
    );
  }

  const tutorOf = new Map(data.assignments.map((a) => [a.candidate_id, a.tutor_id]));
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <PageHeader title="Tutors" icon={UserCheck} subtitle="Assign each candidate a tutor. Tutors agree learning plans and coach. A candidate's tutor is never assigned as their reviewer." />
      {data.needsMigration && <Card className="rounded-none p-4 text-sm text-muted-foreground">Tutor assignments are not set up on this database yet. Load the framework from the Leadership framework page to run the setup.</Card>}
      {data.tutors.length === 0 && <Card className="rounded-none p-4 text-sm text-muted-foreground">No tutors yet. Add people with the coach role under Accounts and Roles first.</Card>}
      <Card className="rounded-none p-0 divide-y divide-border">
        {data.candidates.length === 0 && <div className="p-5 text-sm text-muted-foreground">No candidates have chosen credentials yet.</div>}
        {data.candidates.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm">{name(c)}</div>
              {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
            </div>
            <select className="border border-input bg-background text-sm px-2 py-1.5 min-w-[12rem]" value={tutorOf.get(c.id) ?? ''}
              disabled={assign.isPending} onChange={(e) => assign.mutate({ candidateId: c.id, tutorId: e.target.value })}
              aria-label={`Tutor for ${name(c)}`}>
              <option value="">No tutor</option>
              {data.tutors.map((t) => <option key={t.id} value={t.id}>{name(t)}</option>)}
            </select>
          </div>
        ))}
      </Card>
    </div>
  );
}

export default PracticeTutoring;
