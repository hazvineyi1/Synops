import React, { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Wallet, Receipt, Landmark, Percent, ScrollText, Upload, Pencil } from 'lucide-react';
import {
  getPartnerHub, fundersRollup, ZAR, ZAR2, VAT_RATE, type Invoice,
} from '@/lib/partnerHubData';
import { orgLabel, orgNameOverride, useOrgOverrides } from '@/lib/orgOverridesStore';

const statusPill = (s: Invoice['status']) =>
  s === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
    : s === 'overdue' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';

const disbPill = (s: string) =>
  s === 'received' ? 'bg-emerald-600' : s === 'scheduled' ? 'bg-blue-500' : 'bg-muted text-muted-foreground';

/** Small right-aligned numeric input for editing a figure inline. */
function NumInput({ value, onChange, prefix, suffix, width = 'w-28' }: { value: number; onChange: (n: number) => void; prefix?: string; suffix?: string; width?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 h-8 focus-within:ring-2 focus-within:ring-primary/30', width)}>
      {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
      <input
        type="number" min={0} value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
        className="w-full bg-transparent text-right text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </span>
  );
}

/**
 * Financial Hub (spec §3). Billing, funder disbursement and VAT for the partner's tenant.
 * SEEDED data, no live payment gateway or SARS integration yet. Key figures - plan prices,
 * per-org seats, invoice amounts and the VAT rate - are editable inline and everything derived
 * (monthly totals, VAT, outstanding) recomputes live, so the partner can model changes.
 */
export function PartnerFinance() {
  const { user } = useSession();
  const [, navigate] = useLocation();
  useOrgOverrides();
  const h = getPartnerHub(user?.partnerId);
  const fun = fundersRollup(h);

  // Editable figures.
  const [planPrices, setPlanPrices] = useState<Record<string, number>>(() => Object.fromEntries(h.plans.map((p) => [p.id, p.pricePerSeat])));
  const [seats, setSeats] = useState<Record<string, number>>(() => Object.fromEntries(h.subscriptions.map((s) => [s.orgId, s.seats])));
  const [vatPct, setVatPct] = useState<number>(Math.round(VAT_RATE * 100));
  const [invoices, setInvoices] = useState<Invoice[]>(h.invoices);
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(null), 2500); };

  const vatFrac = vatPct / 100;
  const markPaid = (id: string) => setInvoices((xs) => xs.map((i) => (i.id === id ? { ...i, status: 'paid' } : i)));
  const setInvoiceNet = (id: string, net: number) => setInvoices((xs) => xs.map((i) => (i.id === id ? { ...i, net } : i)));

  const mrrNet = useMemo(
    () => h.subscriptions.reduce((s, sub) => s + (planPrices[sub.planId] ?? 0) * (seats[sub.orgId] ?? 0), 0),
    [h.subscriptions, planPrices, seats],
  );
  const outstanding = useMemo(
    () => invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.net * (1 + vatFrac), 0),
    [invoices, vatFrac],
  );
  const overdue = useMemo(() => invoices.filter((i) => i.status === 'overdue').length, [invoices]);
  const vat = useMemo(() => ({
    collected: invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.net * vatFrac, 0),
    pending: invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.net * vatFrac, 0),
  }), [invoices, vatFrac]);

  return (
    <div className="space-y-6">
      <PageHeader title="Financial Hub" icon={Wallet} subtitle={`${h.partnerName} - subscriptions, invoicing, funder disbursement and VAT.`} />

      {flash && (
        <Card className="p-3 border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-2 text-sm">
          <Pencil className="h-4 w-4 text-emerald-600" /> {flash}
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Wallet} label="Monthly recurring (excl. VAT)" value={ZAR(mrrNet)} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={Receipt} label="Outstanding (incl. VAT)" value={ZAR(outstanding)} tint={overdue ? 'bg-red-500/10 text-red-600' : 'bg-muted text-muted-foreground'} />
        <StatCard icon={Landmark} label="Funder received this cycle" value={ZAR(fun.received)} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={Percent} label="VAT collected" value={ZAR(vat.collected)} tint="bg-indigo-500/10 text-indigo-600" />
      </div>

      <Tabs defaultValue="subs">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="subs">Subscriptions</TabsTrigger>
          <TabsTrigger value="invoices">Invoicing &amp; Payments</TabsTrigger>
          <TabsTrigger value="disb">Funder Disbursement</TabsTrigger>
          <TabsTrigger value="vat">Tax / VAT</TabsTrigger>
          <TabsTrigger value="audit">Financial Audit</TabsTrigger>
        </TabsList>

        {/* Subscriptions & Licensing */}
        <TabsContent value="subs" className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Pencil className="h-3 w-3" /> Plan prices and seat counts are editable - the monthly totals update as you type.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {h.plans.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="mt-2 flex items-center gap-2">
                  <NumInput value={planPrices[p.id] ?? 0} onChange={(n) => setPlanPrices((pp) => ({ ...pp, [p.id]: n }))} prefix="R" width="w-24" />
                  <span className="text-sm text-muted-foreground">/ seat / mo</span>
                </div>
              </Card>
            ))}
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Organisation</th><th className="text-left p-3">Plan</th><th className="text-right p-3">Seats</th><th className="text-right p-3">Active</th><th className="text-right p-3">Monthly (excl. VAT)</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {h.subscriptions.map((s) => {
                  const plan = h.plans.find((p) => p.id === s.planId)!;
                  const seatCount = seats[s.orgId] ?? 0;
                  const monthly = (planPrices[plan.id] ?? 0) * seatCount;
                  return (
                    <tr key={s.orgId}>
                      <td className="p-3 font-medium">{orgNameOverride(s.orgId) ?? orgLabel(s.orgName)}</td>
                      <td className="p-3"><Badge variant="secondary">{plan.name}</Badge></td>
                      <td className="p-3 text-right"><NumInput value={seatCount} onChange={(n) => setSeats((ss) => ({ ...ss, [s.orgId]: n }))} width="w-20" /></td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">{Math.min(s.activeSeats, seatCount)}</td>
                      <td className="p-3 text-right tabular-nums font-medium">{ZAR(monthly)}</td>
                    </tr>
                  );
                })}
                <tr className="bg-muted/20">
                  <td className="p-3 font-semibold" colSpan={4}>Total monthly recurring (excl. VAT)</td>
                  <td className="p-3 text-right tabular-nums font-semibold">{ZAR(mrrNet)}</td>
                </tr>
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* Invoicing & Payments */}
        <TabsContent value="invoices" className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Pencil className="h-3 w-3" /> Net amounts are editable; VAT and totals recompute. Upload supplier invoices to the filing cabinet.</p>
            <Button size="sm" variant="outline" className="gap-2 shrink-0" onClick={() => navigate('/partner/documents')}><Upload className="h-3.5 w-3.5" /> Upload invoice</Button>
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
                    <td className="p-3">{orgLabel(i.orgName)}</td>
                    <td className="p-3 text-muted-foreground">{i.period}</td>
                    <td className="p-3 text-right">{i.status === 'paid' ? <span className="tabular-nums">{ZAR(i.net)}</span> : <NumInput value={i.net} onChange={(n) => setInvoiceNet(i.id, n)} prefix="R" />}</td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{ZAR(i.net * vatFrac)}</td>
                    <td className="p-3 text-right tabular-nums font-medium">{ZAR(i.net * (1 + vatFrac))}</td>
                    <td className="p-3"><span className={cn('rounded px-2 py-0.5 text-xs font-medium', statusPill(i.status))}>{i.status}</span></td>
                    <td className="p-3 text-right">{i.status !== 'paid' && <Button size="sm" variant="outline" onClick={() => { markPaid(i.id); flashMsg('Invoice marked paid.'); }}>Mark paid</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">Payment gateway integration is not yet wired - "Mark paid" records the payment in this review build. Multi-currency and card capture come with the gateway.</p>
        </TabsContent>

        {/* Funder Disbursement */}
        <TabsContent value="disb" className="mt-4">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Funder</th><th className="text-left p-3">Organisation</th><th className="text-right p-3">Seats</th><th className="text-right p-3">Amount</th><th className="text-left p-3">Status</th><th className="text-left p-3">Date</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {h.disbursements.map((d) => (
                  <tr key={d.id}>
                    <td className="p-3 font-medium">{d.funder}</td>
                    <td className="p-3">{orgLabel(d.orgName)}</td>
                    <td className="p-3 text-right tabular-nums">{d.seats}</td>
                    <td className="p-3 text-right tabular-nums font-medium">{ZAR(d.amount)}</td>
                    <td className="p-3"><Badge className={cn('text-[10px]', disbPill(d.status))}>{d.status}</Badge></td>
                    <td className="p-3 text-muted-foreground">{new Date(d.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">Funder-paid seats flow from the Funders Hub agreements. Disbursements feed the received/scheduled totals above.</p>
        </TabsContent>

        {/* Tax / VAT */}
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
          <Card className="p-4 text-sm text-muted-foreground">
            Invoices are raised VAT-inclusive at the rate set above (South African standard rate is 15%). SARS-compliant tax invoices carry the partner VAT number, invoice number and issue date. VAT201 export and automated SARS submission are part of the tax-integration phase and are not wired in this review build.
          </Card>
        </TabsContent>

        {/* Financial Audit view */}
        <TabsContent value="audit" className="mt-4">
          <Card className="p-4 mb-3 flex items-start gap-3 text-sm">
            <ScrollText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="text-muted-foreground">This is a <span className="text-foreground font-medium">filtered view</span> of the unified Partner Activity Audit Log - financial entries only. Financial entries carry stricter retention than other categories.</div>
          </Card>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">When</th><th className="text-left p-3">Actor</th><th className="text-left p-3">Action</th><th className="text-left p-3">Detail</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {h.audit.filter((e) => e.category === 'financial').map((e) => (
                  <tr key={e.id}>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(e.at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="p-3">{e.actor}</td>
                    <td className="p-3 font-mono text-xs">{e.action}</td>
                    <td className="p-3 text-muted-foreground">{e.detail}</td>
                  </tr>
                ))}
                {h.audit.filter((e) => e.category === 'financial').length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No financial actions logged yet.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
