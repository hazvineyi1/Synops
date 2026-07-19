import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Wallet, Receipt, Landmark, Percent, ScrollText, Plus, Trash2, Pencil } from 'lucide-react';
import { getActivePartnerId, ZAR, ZAR2, VAT_RATE } from '@/lib/partnerHubData';
import { orgLabel, useOrgOverrides } from '@/lib/orgOverridesStore';

interface Sub { id: string; orgId: string | null; orgName: string | null; planName: string; pricePerSeat: number; seats: number; activeSeats: number }
interface Invoice { id: string; orgId: string | null; orgName: string | null; number: string; period: string | null; net: number; status: string; issued: string | null; due: string | null }
interface Agreement { id: string; funderName: string; orgName: string | null; seatsFunded: number; value: number; status: string }
interface OrgLite { id: string; name: string; partnerId: string | null }

const PLANS = [{ name: 'Essential', price: 180 }, { name: 'Growth', price: 240 }, { name: 'Scale', price: 320 }];
const statusPill = (s: string) =>
  s === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
    : s === 'overdue' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';

function NumInput({ value, onChange, onCommit, prefix, suffix, width = 'w-28' }: { value: number; onChange: (n: number) => void; onCommit?: () => void; prefix?: string; suffix?: string; width?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 h-8 focus-within:ring-2 focus-within:ring-primary/30', width)}>
      {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
      <input type="number" min={0} value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
        onBlur={() => onCommit?.()}
        className="w-full bg-transparent text-right text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </span>
  );
}

/**
 * Financial Hub (spec §3) — now backed by real billing tables. Subscriptions and invoices persist
 * via /partners/:id/billing. Funder disbursement is derived from the real funding agreements.
 * VAT is derived from real invoices. No payment gateway: "Mark paid" sets the invoice status.
 */
export function PartnerFinance() {
  const { user } = useSession();
  useOrgOverrides();
  const partnerId = user?.partnerId ?? getActivePartnerId();
  const qc = useQueryClient();

  const { data: billing, isLoading } = useQuery({
    queryKey: ['partner-billing', partnerId],
    queryFn: () => apiFetch<{ subscriptions: Sub[]; invoices: Invoice[] }>(`/partners/${partnerId}/billing`),
    enabled: !!partnerId,
  });
  const { data: funding } = useQuery({ queryKey: ['partner-funding', partnerId], queryFn: () => apiFetch<Agreement[]>(`/partners/${partnerId}/funding`), enabled: !!partnerId });
  const { data: orgsData } = useQuery({ queryKey: ['organisations'], queryFn: () => apiFetch<OrgLite[]>('/organisations') });
  const orgs = (orgsData ?? []).filter((o) => o.partnerId === partnerId);

  const [subs, setSubs] = useState<Sub[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  useEffect(() => { if (billing) { setSubs(billing.subscriptions); setInvoices(billing.invoices); } }, [billing]);

  const [vatPct, setVatPct] = useState<number>(Math.round(VAT_RATE * 100));
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(null), 2500); };
  const vatFrac = vatPct / 100;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['partner-billing', partnerId] });
  const subPatch = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Sub> }) => apiFetch(`/partners/${partnerId}/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }), onSuccess: invalidate });
  const subDelete = useMutation({ mutationFn: (id: string) => apiFetch(`/partners/${partnerId}/subscriptions/${id}`, { method: 'DELETE' }), onSuccess: () => { invalidate(); flashMsg('Subscription removed.'); } });
  const subCreate = useMutation({ mutationFn: (body: Record<string, unknown>) => apiFetch(`/partners/${partnerId}/subscriptions`, { method: 'POST', body: JSON.stringify(body) }), onSuccess: () => { invalidate(); setAddSub(false); flashMsg('Subscription added.'); } });
  const invPatch = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Invoice> }) => apiFetch(`/partners/${partnerId}/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }), onSuccess: invalidate });
  const invDelete = useMutation({ mutationFn: (id: string) => apiFetch(`/partners/${partnerId}/invoices/${id}`, { method: 'DELETE' }), onSuccess: () => { invalidate(); flashMsg('Invoice removed.'); } });
  const invCreate = useMutation({ mutationFn: (body: Record<string, unknown>) => apiFetch(`/partners/${partnerId}/invoices`, { method: 'POST', body: JSON.stringify(body) }), onSuccess: () => { invalidate(); setAddInv(false); flashMsg('Invoice created.'); } });

  const setLocalSub = (id: string, patch: Partial<Sub>) => setSubs((xs) => xs.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const commitSub = (id: string, key: keyof Sub) => { const cur = subs.find((s) => s.id === id); if (cur) subPatch.mutate({ id, patch: { [key]: cur[key] } as Partial<Sub> }); };
  const setLocalInv = (id: string, patch: Partial<Invoice>) => setInvoices((xs) => xs.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const commitInvNet = (id: string) => { const cur = invoices.find((i) => i.id === id); if (cur) invPatch.mutate({ id, patch: { net: cur.net } }); };

  const mrrNet = useMemo(() => subs.reduce((s, x) => s + x.pricePerSeat * x.seats, 0), [subs]);
  const outstanding = useMemo(() => invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.net * (1 + vatFrac), 0), [invoices, vatFrac]);
  const overdue = useMemo(() => invoices.filter((i) => i.status === 'overdue').length, [invoices]);
  const vat = useMemo(() => ({
    collected: invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.net * vatFrac, 0),
    pending: invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.net * vatFrac, 0),
  }), [invoices, vatFrac]);
  const funderReceived = useMemo(() => (funding ?? []).filter((a) => a.status === 'active').reduce((s, a) => s + a.value, 0), [funding]);

  // Add dialogs
  const [addSub, setAddSub] = useState(false);
  const [subForm, setSubForm] = useState({ orgName: '', planName: 'Essential', pricePerSeat: 180, seats: 0 });
  const [addInv, setAddInv] = useState(false);
  const [invForm, setInvForm] = useState({ orgName: '', number: '', period: '', net: 0 });

  return (
    <div className="space-y-6">
      <PageHeader title="Financial Hub" icon={Wallet} subtitle="Subscriptions, invoicing, funder disbursement and VAT." />

      {flash && (
        <Card className="p-3 border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-2 text-sm">
          <Pencil className="h-4 w-4 text-emerald-600" /> {flash}
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Wallet} label="Monthly recurring (excl. VAT)" value={ZAR(mrrNet)} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={Receipt} label="Outstanding (incl. VAT)" value={ZAR(outstanding)} tint={overdue ? 'bg-red-500/10 text-red-600' : 'bg-muted text-muted-foreground'} />
        <StatCard icon={Landmark} label="Active funding value" value={ZAR(funderReceived)} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={Percent} label="VAT collected" value={ZAR(vat.collected)} tint="bg-indigo-500/10 text-indigo-600" />
      </div>

      <Tabs defaultValue="subs">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="subs">Subscriptions</TabsTrigger>
          <TabsTrigger value="invoices">Invoicing &amp; Payments</TabsTrigger>
          <TabsTrigger value="disb">Funder Disbursement</TabsTrigger>
          <TabsTrigger value="vat">Tax / VAT</TabsTrigger>
        </TabsList>

        {/* Subscriptions */}
        <TabsContent value="subs" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Pencil className="h-3 w-3" /> Per-seat price and seat counts save on blur; the monthly total updates live.</p>
            <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setAddSub(true)}><Plus className="h-4 w-4" /> Add subscription</Button>
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Organisation</th><th className="text-left p-3">Plan</th><th className="text-right p-3">R / seat</th><th className="text-right p-3">Seats</th><th className="text-right p-3">Monthly (excl. VAT)</th><th className="p-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
                {subs.map((s) => (
                  <tr key={s.id}>
                    <td className="p-3 font-medium">{s.orgName ? orgLabel(s.orgName) : '—'}</td>
                    <td className="p-3">
                      <select value={s.planName} onChange={(e) => { const p = PLANS.find((x) => x.name === e.target.value); setLocalSub(s.id, { planName: e.target.value, ...(p ? { pricePerSeat: p.price } : {}) }); subPatch.mutate({ id: s.id, patch: { planName: e.target.value, ...(p ? { pricePerSeat: p.price } : {}) } }); }}
                        className="h-7 rounded border border-input bg-background px-1 text-xs">
                        {PLANS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                        {!PLANS.some((p) => p.name === s.planName) && <option value={s.planName}>{s.planName}</option>}
                      </select>
                    </td>
                    <td className="p-3 text-right"><NumInput value={s.pricePerSeat} onChange={(n) => setLocalSub(s.id, { pricePerSeat: n })} onCommit={() => commitSub(s.id, 'pricePerSeat')} prefix="R" width="w-24" /></td>
                    <td className="p-3 text-right"><NumInput value={s.seats} onChange={(n) => setLocalSub(s.id, { seats: n })} onCommit={() => commitSub(s.id, 'seats')} width="w-20" /></td>
                    <td className="p-3 text-right tabular-nums font-medium">{ZAR(s.pricePerSeat * s.seats)}</td>
                    <td className="p-3 text-right"><Button size="sm" variant="ghost" className="h-8 text-red-600" onClick={() => subDelete.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
                {!isLoading && subs.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No subscriptions yet. Add one to start billing.</td></tr>}
                {subs.length > 0 && (
                  <tr className="bg-muted/20"><td className="p-3 font-semibold" colSpan={4}>Total monthly recurring (excl. VAT)</td><td className="p-3 text-right tabular-nums font-semibold">{ZAR(mrrNet)}</td><td></td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* Invoices */}
        <TabsContent value="invoices" className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Pencil className="h-3 w-3" /> Net amounts save on blur; VAT and totals recompute. "Mark paid" records the payment.</p>
            <Button size="sm" className="gap-2 shrink-0" onClick={() => setAddInv(true)}><Plus className="h-3.5 w-3.5" /> New invoice</Button>
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Invoice</th><th className="text-left p-3">Organisation</th><th className="text-left p-3">Period</th><th className="text-right p-3">Net</th><th className="text-right p-3">VAT {vatPct}%</th><th className="text-right p-3">Total</th><th className="text-left p-3">Status</th><th className="p-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="p-3 font-mono text-xs">{i.number}</td>
                    <td className="p-3">{i.orgName ? orgLabel(i.orgName) : '—'}</td>
                    <td className="p-3 text-muted-foreground">{i.period ?? '—'}</td>
                    <td className="p-3 text-right">{i.status === 'paid' ? <span className="tabular-nums">{ZAR(i.net)}</span> : <NumInput value={i.net} onChange={(n) => setLocalInv(i.id, { net: n })} onCommit={() => commitInvNet(i.id)} prefix="R" />}</td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{ZAR(i.net * vatFrac)}</td>
                    <td className="p-3 text-right tabular-nums font-medium">{ZAR(i.net * (1 + vatFrac))}</td>
                    <td className="p-3"><span className={cn('rounded px-2 py-0.5 text-xs font-medium', statusPill(i.status))}>{i.status}</span></td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {i.status !== 'paid' && <Button size="sm" variant="outline" onClick={() => { setLocalInv(i.id, { status: 'paid' }); invPatch.mutate({ id: i.id, patch: { status: 'paid' } }); flashMsg('Invoice marked paid.'); }}>Mark paid</Button>}
                      <Button size="sm" variant="ghost" className="h-8 text-red-600 ml-1" onClick={() => invDelete.mutate(i.id)}><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No invoices yet.</td></tr>}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">Payment gateway integration is not yet wired — "Mark paid" records the payment status. Card capture and multi-currency come with the gateway.</p>
        </TabsContent>

        {/* Funder Disbursement — derived from real funding agreements */}
        <TabsContent value="disb" className="mt-4">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Funder</th><th className="text-left p-3">Organisation</th><th className="text-right p-3">Funded seats</th><th className="text-right p-3">Value</th><th className="text-left p-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(funding ?? []).map((a) => (
                  <tr key={a.id}>
                    <td className="p-3 font-medium">{a.funderName}</td>
                    <td className="p-3">{a.orgName ? orgLabel(a.orgName) : 'All organisations'}</td>
                    <td className="p-3 text-right tabular-nums">{a.seatsFunded}</td>
                    <td className="p-3 text-right tabular-nums font-medium">{ZAR(a.value)}</td>
                    <td className="p-3"><Badge variant="outline" className="text-[10px] capitalize">{a.status}</Badge></td>
                  </tr>
                ))}
                {(funding ?? []).length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No funding agreements. Add them in the Funders Hub.</td></tr>}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">Disbursements are drawn from the real funding agreements in the Funders Hub.</p>
        </TabsContent>

        {/* Tax / VAT — derived from real invoices */}
        <TabsContent value="vat" className="mt-4 space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <StatCard icon={Percent} label="VAT collected (paid invoices)" value={ZAR2(vat.collected)} tint="bg-emerald-500/10 text-emerald-600" />
            <StatCard icon={Percent} label="VAT pending (unpaid)" value={ZAR2(vat.pending)} tint="bg-amber-500/10 text-amber-600" />
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Percent className="h-4 w-4" /> VAT rate</div>
              <div className="mt-2 flex items-center gap-2">
                <NumInput value={vatPct} onChange={setVatPct} suffix="%" width="w-20" />
                {vatPct !== Math.round(VAT_RATE * 100) && <button className="text-xs text-primary underline" onClick={() => setVatPct(Math.round(VAT_RATE * 100))}>reset to 15%</button>}
              </div>
            </Card>
          </div>
          <Card className="p-4 flex items-start gap-3 text-sm text-muted-foreground">
            <ScrollText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>Invoices are raised VAT-inclusive at the rate above (SA standard rate 15%). VAT201 export and automated SARS submission are part of the tax-integration phase.</div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add subscription */}
      <Dialog open={addSub} onOpenChange={setAddSub}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add subscription</DialogTitle><DialogDescription>Bill an organisation on a plan.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Organisation</span>
              <select value={subForm.orgName} onChange={(e) => setSubForm((f) => ({ ...f, orgName: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="">Select…</option>
                {orgs.map((o) => <option key={o.id} value={o.name}>{orgLabel(o.name)}</option>)}
              </select></label>
            <div className="grid grid-cols-3 gap-3">
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Plan</span>
                <select value={subForm.planName} onChange={(e) => { const p = PLANS.find((x) => x.name === e.target.value); setSubForm((f) => ({ ...f, planName: e.target.value, pricePerSeat: p?.price ?? f.pricePerSeat })); }} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                  {PLANS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select></label>
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">R / seat</span>
                <input type="number" min={0} value={subForm.pricePerSeat} onChange={(e) => setSubForm((f) => ({ ...f, pricePerSeat: Math.max(0, Number(e.target.value)) }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Seats</span>
                <input type="number" min={0} value={subForm.seats} onChange={(e) => setSubForm((f) => ({ ...f, seats: Math.max(0, Number(e.target.value)) }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
            </div>
            <Button className="w-full gap-1.5" disabled={!subForm.orgName || subCreate.isPending} onClick={() => { const o = orgs.find((x) => x.name === subForm.orgName); subCreate.mutate({ orgId: o?.id ?? null, orgName: subForm.orgName, planName: subForm.planName, pricePerSeat: subForm.pricePerSeat, seats: subForm.seats, activeSeats: 0 }); }}><Plus className="h-4 w-4" /> {subCreate.isPending ? 'Adding…' : 'Add subscription'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add invoice */}
      <Dialog open={addInv} onOpenChange={setAddInv}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New invoice</DialogTitle><DialogDescription>Raise an invoice for an organisation.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Organisation</span>
              <select value={invForm.orgName} onChange={(e) => setInvForm((f) => ({ ...f, orgName: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="">Select…</option>
                {orgs.map((o) => <option key={o.id} value={o.name}>{orgLabel(o.name)}</option>)}
              </select></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Invoice no. (optional)</span>
                <input value={invForm.number} onChange={(e) => setInvForm((f) => ({ ...f, number: e.target.value }))} placeholder="auto" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Period</span>
                <input value={invForm.period} onChange={(e) => setInvForm((f) => ({ ...f, period: e.target.value }))} placeholder="Jul 2026" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
              <label className="text-xs col-span-2"><span className="mb-1 block font-medium text-muted-foreground">Net amount (R, excl. VAT)</span>
                <input type="number" min={0} value={invForm.net} onChange={(e) => setInvForm((f) => ({ ...f, net: Math.max(0, Number(e.target.value)) }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
            </div>
            <Button className="w-full gap-1.5" disabled={!invForm.orgName || invCreate.isPending} onClick={() => { const o = orgs.find((x) => x.name === invForm.orgName); invCreate.mutate({ orgId: o?.id ?? null, orgName: invForm.orgName, number: invForm.number || undefined, period: invForm.period, net: invForm.net, status: 'due' }); }}><Plus className="h-4 w-4" /> {invCreate.isPending ? 'Creating…' : 'Create invoice'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
