import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Landmark, Users, ShieldCheck, ExternalLink, CheckCircle2, Plus, Trash2, X, Pencil, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { getActivePartnerId, ZAR } from '@/lib/partnerHubData';
import { orgLabel, useOrgOverrides } from '@/lib/orgOverridesStore';

// A real funding agreement from GET /partners/:id/funding.
interface Agreement {
  id: string; funderName: string; funderType: string; orgId: string | null; orgName: string | null;
  seatsFunded: number; value: number; startDate: string | null; expiry: string | null;
  status: string; conditions: string[];
}
interface OrgLite { id: string; name: string; partnerId: string | null }
interface Member { id: string; name: string; role: string }
interface SeatAssignment { id: string; learnerId: string; learnerName: string | null }

const FUNDER_TYPES = ['SETA', 'Corporate CSI', 'NSFAS', 'Government', 'Foundation', 'Other'];
const fmtMonth = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' }) : '—');

function NumInput({ value, onChange, onCommit, prefix, width = 'w-32' }: { value: number; onChange: (n: number) => void; onCommit?: () => void; prefix?: string; width?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 h-8 focus-within:ring-2 focus-within:ring-primary/30', width)}>
      {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
      <input type="number" min={0} value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
        onBlur={() => onCommit?.()}
        className="w-full bg-transparent text-right text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
    </span>
  );
}

// One agreement's funded-seat allocation: assign specific learners to the grant's seats so
// completion evidence attributes back to the funder. Used = live count; capacity = seatsFunded.
function AgreementSeats({ partnerId, agreement, learners, used, onChanged }: {
  partnerId: string | null; agreement: Agreement; learners: Member[]; used: number; onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState('');
  const { data: seats } = useQuery({
    queryKey: ['funding-seats', agreement.id],
    queryFn: () => apiFetch<SeatAssignment[]>(`/partners/${partnerId}/funding/${agreement.id}/seats`),
    enabled: open && !!partnerId,
  });
  const liveUsed = open && seats ? seats.length : used;
  const pct = agreement.seatsFunded > 0 ? Math.min(100, Math.round((liveUsed / agreement.seatsFunded) * 100)) : 0;
  const refresh = () => { qc.invalidateQueries({ queryKey: ['funding-seats', agreement.id] }); onChanged(); };
  const assign = useMutation({
    mutationFn: (m: Member) => apiFetch(`/partners/${partnerId}/funding/${agreement.id}/seats`, { method: 'POST', body: JSON.stringify({ learnerId: m.id, learnerName: m.name }) }),
    onSuccess: () => { refresh(); setPick(''); },
    onError: (e: any) => window.alert(e?.message ?? 'Could not assign the seat.'),
  });
  const remove = useMutation({ mutationFn: (id: string) => apiFetch(`/partners/${partnerId}/funding/${agreement.id}/seats/${id}`, { method: 'DELETE' }), onSuccess: refresh });
  const assignedIds = new Set((seats ?? []).map((s) => s.learnerId));
  const available = learners.filter((l) => !assignedIds.has(l.id));
  const full = liveUsed >= agreement.seatsFunded;

  return (
    <Card className="p-4">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex flex-wrap items-center justify-between gap-3 text-left">
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
          <span className="font-medium truncate">{agreement.funderName}</span>
          <span className="text-muted-foreground text-sm">· {agreement.orgName ? orgLabel(agreement.orgName) : 'All organisations'}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{liveUsed} / {agreement.seatsFunded} seats used</span>
      </button>
      <Progress value={pct} className="h-2 mt-2" />
      {open && (
        <div className="mt-3 space-y-2">
          {(seats ?? []).map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
              <span className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-muted-foreground" /> {s.learnerName ?? s.learnerId}</span>
              <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => remove.mutate(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
          {(seats ?? []).length === 0 && <div className="text-xs text-muted-foreground">No learners assigned yet.</div>}
          <div className="flex items-center gap-2 pt-1">
            <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={full || available.length === 0} className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50">
              <option value="">{full ? 'All funded seats used' : available.length === 0 ? 'No unassigned learners' : 'Assign a learner…'}</option>
              {available.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <Button size="sm" className="gap-1.5" disabled={!pick || assign.isPending} onClick={() => { const m = available.find((l) => l.id === pick); if (m) assign.mutate(m); }}><Plus className="h-3.5 w-3.5" /> Assign</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Funders Hub (spec §4) — now backed by real funding_agreements. A partner's funding agreements,
 * funded-seat totals and grant conditions persist via /partners/:id/funding. Seat-level assignment
 * to individual learners is still to come, so the allocation view is derived read-only from the
 * funded-seat count on each agreement.
 */
export function PartnerFunders() {
  const { user } = useSession();
  useOrgOverrides();
  const partnerId = user?.partnerId ?? getActivePartnerId();
  const qc = useQueryClient();

  const { data: apiAgreements, isLoading } = useQuery({
    queryKey: ['partner-funding', partnerId],
    queryFn: () => apiFetch<Agreement[]>(`/partners/${partnerId}/funding`),
    enabled: !!partnerId,
  });
  const { data: orgsData } = useQuery({ queryKey: ['organisations'], queryFn: () => apiFetch<OrgLite[]>('/organisations') });
  const orgs = (orgsData ?? []).filter((o) => o.partnerId === partnerId);
  const { data: membersData } = useQuery({ queryKey: ['partner-members', partnerId], queryFn: () => apiFetch<Member[]>(`/partners/${partnerId}/members`), enabled: !!partnerId });
  const learners = (membersData ?? []).filter((m) => m.role === 'learner');
  const { data: usageData } = useQuery({ queryKey: ['partner-funding-usage', partnerId], queryFn: () => apiFetch<{ used: Record<string, number> }>(`/partners/${partnerId}/funding-usage`), enabled: !!partnerId });
  const usedMap = usageData?.used ?? {};
  const refreshUsage = () => qc.invalidateQueries({ queryKey: ['partner-funding-usage', partnerId] });

  // Local mirror so inline edits feel instant; commits persist via PATCH.
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  useEffect(() => { setAgreements(apiAgreements ?? []); }, [apiAgreements]);

  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(null), 2800); };

  const invalidate = () => qc.invalidateQueries({ queryKey: ['partner-funding', partnerId] });
  const patchM = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Agreement> }) =>
      apiFetch(`/partners/${partnerId}/funding/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: invalidate,
  });
  const createM = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch(`/partners/${partnerId}/funding`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); flashMsg('Funding agreement added.'); setAddOpen(false); setForm(blankForm); },
    onError: (e: any) => flashMsg(e?.message ?? 'Could not add the agreement.'),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => apiFetch(`/partners/${partnerId}/funding/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); flashMsg('Agreement removed.'); },
  });

  const setLocal = (id: string, patch: Partial<Agreement>) => setAgreements((xs) => xs.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const commit = (id: string, patch: Partial<Agreement>) => { setLocal(id, patch); patchM.mutate({ id, patch }); };
  const commitField = (id: string, key: keyof Agreement) => {
    const cur = agreements.find((a) => a.id === id);
    if (cur) patchM.mutate({ id, patch: { [key]: cur[key] } as Partial<Agreement> });
  };
  const addCondition = (id: string, c: string) => {
    const v = c.trim(); if (!v) return;
    const cur = agreements.find((a) => a.id === id);
    commit(id, { conditions: [...(cur?.conditions ?? []), v] });
  };
  const removeCondition = (id: string, c: string) => {
    const cur = agreements.find((a) => a.id === id);
    commit(id, { conditions: (cur?.conditions ?? []).filter((x) => x !== c) });
  };

  // Add-agreement dialog state
  const [addOpen, setAddOpen] = useState(false);
  const blankForm = { funder: '', funderType: 'SETA', orgName: '', value: 0, seatsFunded: 0, start: '2026-04-01', expiry: '2027-03-31', status: 'active', conditions: '' };
  const [form, setForm] = useState(blankForm);
  const [condDraft, setCondDraft] = useState<Record<string, string>>({});

  const submitAdd = () => {
    if (!form.funder.trim()) return;
    createM.mutate({
      funderName: form.funder.trim(), funderType: form.funderType,
      orgId: orgs.find((o) => o.name === form.orgName)?.id ?? null, orgName: form.orgName || null,
      value: form.value, seatsFunded: form.seatsFunded, startDate: form.start, expiry: form.expiry,
      status: form.status, conditions: form.conditions.split(',').map((c) => c.trim()).filter(Boolean),
    });
  };

  const roll = useMemo(() => ({
    funders: new Set(agreements.map((a) => a.funderName)).size,
    fundedSeats: agreements.reduce((s, a) => s + (a.seatsFunded || 0), 0),
    funderValue: agreements.reduce((s, a) => s + (a.value || 0), 0),
    count: agreements.length,
  }), [agreements]);

  return (
    <div className="space-y-6">
      <PageHeader title="Funders Hub" icon={Landmark} subtitle="Funding agreements, funded-seat totals and grant conditions."
        action={<Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add funder</Button>} />

      {flash && (
        <Card className="p-3 border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {flash}
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Landmark} label="Funders" value={roll.funders} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={Users} label="Funded seats" value={roll.fundedSeats} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={ShieldCheck} label="Agreement value" value={ZAR(roll.funderValue)} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={FileText} label="Agreements" value={roll.count} tint="bg-blue-500/10 text-blue-600" />
      </div>

      <Tabs defaultValue="agreements">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="agreements">Funding Agreements</TabsTrigger>
          <TabsTrigger value="allocation">Seat Allocation</TabsTrigger>
          <TabsTrigger value="conditions">B-BBEE / SETA Conditions</TabsTrigger>
          <TabsTrigger value="portal">Funder Portal</TabsTrigger>
        </TabsList>

        {/* Funding Agreements — real, editable */}
        <TabsContent value="agreements" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Pencil className="h-3 w-3" /> Value, funded seats, status and conditions save automatically. Add a funder with the button above.</p>
          {isLoading && <Card className="p-6 text-center text-sm text-muted-foreground">Loading agreements…</Card>}
          {agreements.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{a.funderName}</span>
                    <Badge variant="outline" className="text-[10px]">{a.funderType}</Badge>
                    <select value={a.status} onChange={(e) => commit(a.id, { status: e.target.value })}
                      className="h-6 rounded border border-input bg-background px-1 text-[11px]">
                      <option value="active">active</option><option value="expiring">expiring</option><option value="pending">pending</option><option value="expired">expired</option>
                    </select>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {a.orgName ? orgLabel(a.orgName) : 'All organisations'} · {fmtMonth(a.startDate)} - {fmtMonth(a.expiry)}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="space-y-1.5 text-right">
                    <div className="flex items-center justify-end gap-1.5"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Value</span><NumInput value={a.value} onChange={(n) => setLocal(a.id, { value: n })} onCommit={() => commitField(a.id, 'value')} prefix="R" width="w-36" /></div>
                    <div className="flex items-center justify-end gap-1.5"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Funded seats</span><NumInput value={a.seatsFunded} onChange={(n) => setLocal(a.id, { seatsFunded: n })} onCommit={() => commitField(a.id, 'seatsFunded')} width="w-24" /></div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 text-red-600" onClick={() => deleteM.mutate(a.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {a.conditions.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" /> {c}
                    <button onClick={() => removeCondition(a.id, c)} className="ml-0.5 text-muted-foreground hover:text-red-600"><X className="h-3 w-3" /></button>
                  </span>
                ))}
                <span className="inline-flex items-center gap-1">
                  <input value={condDraft[a.id] ?? ''} onChange={(e) => setCondDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { addCondition(a.id, condDraft[a.id] ?? ''); setCondDraft((d) => ({ ...d, [a.id]: '' })); } }}
                    placeholder="Add condition" className="h-7 w-40 rounded-full border border-dashed border-input bg-background px-3 text-xs" />
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { addCondition(a.id, condDraft[a.id] ?? ''); setCondDraft((d) => ({ ...d, [a.id]: '' })); }}><Plus className="h-3.5 w-3.5" /></Button>
                </span>
              </div>
            </Card>
          ))}
          {!isLoading && agreements.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">No funding agreements yet. Add a funder to get started.</Card>}
        </TabsContent>

        {/* Seat Allocation — assign real learners to a grant's funded seats */}
        <TabsContent value="allocation" className="mt-4 space-y-3">
          {agreements.map((a) => (
            <AgreementSeats key={a.id} partnerId={partnerId} agreement={a} learners={learners} used={usedMap[a.id] ?? 0} onChanged={refreshUsage} />
          ))}
          {agreements.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">No agreements yet. Add a funder first.</Card>}
          <p className="text-xs text-muted-foreground">Assigning a learner to a funded seat links them to the grant, so completion evidence attributes back to the right agreement. Capacity is the agreement's funded-seat count.</p>
        </TabsContent>

        {/* B-BBEE / SETA Conditions — derived from agreements */}
        <TabsContent value="conditions" className="mt-4">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Funder</th><th className="text-left p-3">Condition</th><th className="text-left p-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agreements.flatMap((a) => a.conditions.map((c, i) => (
                  <tr key={a.id + i}>
                    <td className="p-3 font-medium whitespace-nowrap">{a.funderName}</td>
                    <td className="p-3">{c}</td>
                    <td className="p-3"><span className="inline-flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> On track</span></td>
                  </tr>
                )))}
                {agreements.every((a) => a.conditions.length === 0) && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No conditions recorded.</td></tr>}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">Grant-specific compliance. Completion and outcome evidence is drawn from learner Progress data and rolls up into the SETA/QCTO reports.</p>
        </TabsContent>

        {/* Funder Portal — derived from agreement funders */}
        <TabsContent value="portal" className="mt-4 space-y-3">
          <Card className="p-4 text-sm text-muted-foreground">
            Each funder gets a scoped, read-only dashboard showing only the seats and outcomes tied to their own agreement - never other funders' data or the partner's finances.
          </Card>
          {Array.from(new Set(agreements.map((a) => a.funderName))).map((f) => (
            <Card key={f} className="p-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{f}</div>
                <div className="text-xs text-muted-foreground">Scoped dashboard · outcomes for funded seats only</div>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5"><ExternalLink className="h-3.5 w-3.5" /> Portal link</Button>
            </Card>
          ))}
          {agreements.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">No funders yet.</Card>}
        </TabsContent>
      </Tabs>

      {/* Add funder / agreement dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a funder</DialogTitle>
            <DialogDescription>Create a funding agreement. Figures can be edited afterwards on the card.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs col-span-2"><span className="mb-1 block font-medium text-muted-foreground">Funder name</span>
                <input value={form.funder} onChange={(e) => setForm((f) => ({ ...f, funder: e.target.value }))} placeholder="e.g. MICT SETA" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Type</span>
                <select value={form.funderType} onChange={(e) => setForm((f) => ({ ...f, funderType: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                  {FUNDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select></label>
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Organisation</span>
                <select value={form.orgName} onChange={(e) => setForm((f) => ({ ...f, orgName: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">All organisations</option>
                  {orgs.map((o) => <option key={o.id} value={o.name}>{orgLabel(o.name)}</option>)}
                </select></label>
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Agreement value (R)</span>
                <input type="number" min={0} value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: Math.max(0, Number(e.target.value)) }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Funded seats</span>
                <input type="number" min={0} value={form.seatsFunded} onChange={(e) => setForm((f) => ({ ...f, seatsFunded: Math.max(0, Number(e.target.value)) }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Start</span>
                <input type="date" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Expiry</span>
                <input type="date" value={form.expiry} onChange={(e) => setForm((f) => ({ ...f, expiry: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
              <label className="text-xs col-span-2"><span className="mb-1 block font-medium text-muted-foreground">Conditions (comma-separated)</span>
                <input value={form.conditions} onChange={(e) => setForm((f) => ({ ...f, conditions: e.target.value }))} placeholder="B-BBEE skills spend, Min. 70% completion" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
            </div>
            <Button className="w-full gap-1.5" disabled={!form.funder.trim() || createM.isPending} onClick={submitAdd}><Plus className="h-4 w-4" /> {createM.isPending ? 'Adding…' : 'Add funding agreement'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
