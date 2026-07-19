import React, { useMemo, useState } from 'react';
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
import { Landmark, Users, ShieldCheck, ExternalLink, CheckCircle2, Plus, Trash2, X, Pencil } from 'lucide-react';
import { getPartnerHub, fundersRollup, ZAR, type FunderAgreement, type SeatAllocation } from '@/lib/partnerHubData';
import { orgLabel, useOrgOverrides } from '@/lib/orgOverridesStore';

const agStatus = (s: string) =>
  s === 'active' ? 'bg-emerald-600' : s === 'expiring' ? 'bg-amber-500' : 'bg-muted text-muted-foreground';

const FUNDER_TYPES = ['SETA', 'Corporate CSI', 'NSFAS', 'Government', 'Foundation', 'Other'];

function NumInput({ value, onChange, prefix, width = 'w-32' }: { value: number; onChange: (n: number) => void; prefix?: string; width?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 h-8 focus-within:ring-2 focus-within:ring-primary/30', width)}>
      {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
      <input type="number" min={0} value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
        className="w-full bg-transparent text-right text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
    </span>
  );
}

/**
 * Funders Hub (spec §4). Funding agreements, funded-seat allocation, funder portal and grant
 * conditions. Editable on seeded data: add funders/agreements, edit figures (value, funded seats,
 * allocation) and manage grant conditions. Persistence + funder KYC are the backend phase.
 */
export function PartnerFunders() {
  const { user } = useSession();
  useOrgOverrides();
  const h = getPartnerHub(user?.partnerId);
  const fun = fundersRollup(h);

  const [agreements, setAgreements] = useState<FunderAgreement[]>(h.agreements);
  const [allocations, setAllocations] = useState<SeatAllocation[]>(h.allocations);
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(null), 2800); };

  // Add-agreement dialog state
  const [addOpen, setAddOpen] = useState(false);
  const blankForm = { funder: '', funderType: 'SETA', orgName: h.orgs[0]?.name ?? '', value: 0, seatsFunded: 0, start: '2026-04-01', expiry: '2027-03-31', status: 'active' as FunderAgreement['status'], conditions: '' };
  const [form, setForm] = useState(blankForm);

  const setAg = (id: string, patch: Partial<FunderAgreement>) => setAgreements((xs) => xs.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const removeAg = (id: string) => setAgreements((xs) => xs.filter((a) => a.id !== id));
  const addCondition = (id: string, c: string) => { const v = c.trim(); if (v) setAg(id, { conditions: [...(agreements.find((a) => a.id === id)?.conditions ?? []), v] }); };
  const removeCondition = (id: string, c: string) => setAg(id, { conditions: (agreements.find((a) => a.id === id)?.conditions ?? []).filter((x) => x !== c) });

  const addAgreement = () => {
    if (!form.funder.trim()) return;
    const a: FunderAgreement = {
      id: `ag_${Date.now()}`, funder: form.funder.trim(), funderType: form.funderType,
      scopeOrgs: [form.orgName], seatsFunded: form.seatsFunded, value: form.value,
      start: form.start, expiry: form.expiry, status: form.status,
      conditions: form.conditions.split(',').map((c) => c.trim()).filter(Boolean),
    };
    setAgreements((xs) => [a, ...xs]);
    // seed a matching allocation so it appears in the allocation tab
    setAllocations((xs) => [{ id: `al_${Date.now()}`, funder: a.funder, orgName: form.orgName, allocated: form.seatsFunded, used: 0 }, ...xs]);
    setForm(blankForm); setAddOpen(false);
    flashMsg(`Funding agreement added for ${a.funder}.`);
  };

  const roll = useMemo(() => ({
    funders: new Set(agreements.map((a) => a.funder)).size,
    fundedSeats: agreements.reduce((s, a) => s + a.seatsFunded, 0),
    funderValue: agreements.reduce((s, a) => s + a.value, 0),
  }), [agreements]);

  const [condDraft, setCondDraft] = useState<Record<string, string>>({});

  return (
    <div className="space-y-6">
      <PageHeader title="Funders Hub" icon={Landmark} subtitle={`${h.partnerName} - funding agreements, seat allocation and grant conditions.`}
        action={<Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add funder</Button>} />

      {flash && (
        <Card className="p-3 border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {flash}
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Landmark} label="Active funders" value={roll.funders} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={Users} label="Funded seats" value={roll.fundedSeats} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={ShieldCheck} label="Agreement value" value={ZAR(roll.funderValue)} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={ExternalLink} label="Scheduled disbursement" value={ZAR(fun.scheduled)} tint="bg-blue-500/10 text-blue-600" />
      </div>

      <Tabs defaultValue="agreements">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="agreements">Funding Agreements</TabsTrigger>
          <TabsTrigger value="allocation">Seat Allocation</TabsTrigger>
          <TabsTrigger value="conditions">B-BBEE / SETA Conditions</TabsTrigger>
          <TabsTrigger value="portal">Funder Portal</TabsTrigger>
        </TabsList>

        {/* Funding Agreements & Terms - editable */}
        <TabsContent value="agreements" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Pencil className="h-3 w-3" /> Value, funded seats, status and conditions are editable. Add a funder with the button above.</p>
          {agreements.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{a.funder}</span>
                    <Badge variant="outline" className="text-[10px]">{a.funderType}</Badge>
                    <select value={a.status} onChange={(e) => setAg(a.id, { status: e.target.value as FunderAgreement['status'] })}
                      className="h-6 rounded border border-input bg-background px-1 text-[11px]">
                      <option value="active">active</option><option value="expiring">expiring</option><option value="pending">pending</option>
                    </select>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {a.scopeOrgs.map(orgLabel).join(', ')} · {new Date(a.start).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })} - {new Date(a.expiry).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="space-y-1.5 text-right">
                    <div className="flex items-center justify-end gap-1.5"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Value</span><NumInput value={a.value} onChange={(n) => setAg(a.id, { value: n })} prefix="R" width="w-36" /></div>
                    <div className="flex items-center justify-end gap-1.5"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Funded seats</span><NumInput value={a.seatsFunded} onChange={(n) => setAg(a.id, { seatsFunded: n })} width="w-24" /></div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 text-red-600" onClick={() => { removeAg(a.id); flashMsg('Agreement removed.'); }}><Trash2 className="h-4 w-4" /></Button>
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
          {agreements.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">No funding agreements yet. Add a funder to get started.</Card>}
        </TabsContent>

        {/* Seat Allocation - editable */}
        <TabsContent value="allocation" className="mt-4 space-y-3">
          {allocations.map((al) => {
            const pct = al.allocated > 0 ? Math.round((al.used / al.allocated) * 100) : 0;
            return (
              <Card key={al.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                  <div>
                    <span className="font-medium">{al.funder}</span>
                    <span className="text-muted-foreground text-sm"> · {orgLabel(al.orgName)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Used</span><NumInput value={al.used} onChange={(n) => setAllocations((xs) => xs.map((x) => (x.id === al.id ? { ...x, used: Math.min(n, x.allocated) } : x)))} width="w-20" />
                    <span>of</span><NumInput value={al.allocated} onChange={(n) => setAllocations((xs) => xs.map((x) => (x.id === al.id ? { ...x, allocated: n } : x)))} width="w-20" /><span>seats</span>
                  </div>
                </div>
                <Progress value={pct} className="h-2" />
                <div className="mt-1 text-xs text-muted-foreground">{Math.max(0, al.allocated - al.used)} funded seats still available to assign</div>
              </Card>
            );
          })}
          {allocations.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">No allocations yet.</Card>}
          <p className="text-xs text-muted-foreground">Assigning a funded seat links a specific learner to a funder's grant, so completion evidence attributes back to the right agreement.</p>
        </TabsContent>

        {/* B-BBEE / SETA Conditions */}
        <TabsContent value="conditions" className="mt-4">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Funder</th><th className="text-left p-3">Condition</th><th className="text-left p-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agreements.flatMap((a) => a.conditions.map((c, i) => (
                  <tr key={a.id + i}>
                    <td className="p-3 font-medium whitespace-nowrap">{a.funder}</td>
                    <td className="p-3">{c}</td>
                    <td className="p-3"><span className="inline-flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> On track</span></td>
                  </tr>
                )))}
                {agreements.every((a) => a.conditions.length === 0) && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No conditions recorded.</td></tr>}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">Grant-specific compliance (distinct from general platform compliance). Completion and outcome evidence is drawn from learner Progress data and rolls up into the SETA/QCTO reports.</p>
        </TabsContent>

        {/* Funder Portal */}
        <TabsContent value="portal" className="mt-4 space-y-3">
          <Card className="p-4 text-sm text-muted-foreground">
            Each funder gets a scoped, read-only dashboard showing only the seats and outcomes tied to their own agreement - never other funders' data or the partner's finances.
          </Card>
          {Array.from(new Set(agreements.map((a) => a.funder))).map((f) => (
            <Card key={f} className="p-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{f}</div>
                <div className="text-xs text-muted-foreground">Scoped dashboard · outcomes for funded seats only</div>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5"><ExternalLink className="h-3.5 w-3.5" /> Portal link</Button>
            </Card>
          ))}
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
                  {h.orgs.map((o) => <option key={o.id} value={o.name}>{orgLabel(o.name)}</option>)}
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
            <Button className="w-full gap-1.5" disabled={!form.funder.trim()} onClick={addAgreement}><Plus className="h-4 w-4" /> Add funding agreement</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
