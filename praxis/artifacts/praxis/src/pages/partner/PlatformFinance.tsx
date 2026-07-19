import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { StatCard, SectionTitle } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Wallet, Receipt, Landmark, Percent, TrendingUp, FolderOpen, Upload, FileText, Search,
  CheckCircle2, AlertTriangle, Clock, Trash2, Building,
} from 'lucide-react';
import { ZAR } from '@/lib/partnerHubData';

const FILING_TYPES = ['Partnership', 'MSA', 'MOU', 'DPA', 'SLA', 'NDA', 'Funder Agreement'] as const;
type FilingType = typeof FILING_TYPES[number];
type FilingStatus = 'active' | 'expiring' | 'draft' | 'expired';

interface FinPartner { id: string; name: string; mrrGross: number; outstanding: number; funderValue: number; vatCollected: number; overdue: boolean }
interface Financials { partners: FinPartner[]; totals: { mrrGross: number; outstanding: number; funderValue: number; vatCollected: number; overdue: boolean } }
interface Filing { id: string; title: string; docType: string; partner: string | null; counterparty: string | null; status: FilingStatus; signed: string | null; expires: string | null; size: string | null }
interface PartnerLite { id: string; name: string }

const ST: Record<FilingStatus, { chip: string; icon: React.ElementType; label: string }> = {
  active: { chip: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, label: 'Active' },
  expiring: { chip: 'bg-amber-100 text-amber-700', icon: AlertTriangle, label: 'Expiring' },
  draft: { chip: 'bg-blue-100 text-blue-700', icon: Clock, label: 'Draft' },
  expired: { chip: 'bg-red-100 text-red-700', icon: AlertTriangle, label: 'Expired' },
};

export function PlatformFinance() {
  const qc = useQueryClient();
  const { data: fin } = useQuery({ queryKey: ['platform-financials'], queryFn: () => apiFetch<Financials>('/platform/financials') });
  const { data: filings } = useQuery({ queryKey: ['platform-filings'], queryFn: () => apiFetch<Filing[]>('/platform/filings') });
  const { data: partnersList } = useQuery({ queryKey: ['partners'], queryFn: () => apiFetch<PartnerLite[]>('/partners') });

  const partners = fin?.partners ?? [];
  const totals = fin?.totals ?? { mrrGross: 0, outstanding: 0, funderValue: 0, vatCollected: 0, overdue: false };
  const filingList = filings ?? [];
  const partnerNames = (partnersList ?? []).map((p) => p.name);

  const fileRef = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(null), 3500); };
  const invalidateFilings = () => qc.invalidateQueries({ queryKey: ['platform-filings'] });

  const create = useMutation({ mutationFn: (body: Record<string, unknown>) => apiFetch('/platform/filings', { method: 'POST', body: JSON.stringify(body) }), onSuccess: () => { invalidateFilings(); flashMsg('Filed to the cabinet.'); } });
  const patch = useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiFetch(`/platform/filings/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), onSuccess: invalidateFilings });
  const del = useMutation({ mutationFn: (id: string) => apiFetch(`/platform/filings/${id}`, { method: 'DELETE' }), onSuccess: invalidateFilings });

  // Filing filters
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState<FilingType | 'all'>('all');
  const [partnerF, setPartnerF] = useState<string>('all');

  // Upload form
  const [upOpen, setUpOpen] = useState(false);
  const [upTitle, setUpTitle] = useState('');
  const [upType, setUpType] = useState<FilingType>('MOU');
  const [upPartner, setUpPartner] = useState<string>('Platform');
  const [upCounter, setUpCounter] = useState('');
  const [upFileName, setUpFileName] = useState('');

  const onFile = (f: File | null) => { if (f) { setUpFileName(f.name); if (!upTitle) setUpTitle(f.name.replace(/\.[^.]+$/, '')); } };
  const submitUpload = () => {
    if (!upTitle.trim()) return;
    create.mutate({ title: upTitle.trim(), docType: upType, partner: upPartner, counterparty: upCounter.trim() || '-', status: 'active', signed: new Date().toISOString().slice(0, 10), size: upFileName ? 'uploaded' : '-' });
    setUpOpen(false); setUpTitle(''); setUpCounter(''); setUpFileName('');
  };

  const filtered = filingList.filter((f) =>
    (typeF === 'all' || f.docType === typeF) &&
    (partnerF === 'all' || f.partner === partnerF) &&
    (q.trim() === '' || `${f.title} ${f.counterparty ?? ''} ${f.partner ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const expiringCount = filingList.filter((f) => f.status === 'expiring' || f.status === 'expired').length;

  return (
    <div className="space-y-6">
      <PageHeader title="Financial Hub" icon={Wallet} subtitle="Platform-wide financials across every partner, and the cabinet for contracts and MOUs." />

      {flash && (
        <Card className="p-3 border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {flash}
        </Card>
      )}

      <Tabs defaultValue="financials">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="financials" className="gap-1.5"><TrendingUp className="h-4 w-4" /> Financials</TabsTrigger>
          <TabsTrigger value="filing" className="gap-1.5"><FolderOpen className="h-4 w-4" /> Contracts &amp; MOUs</TabsTrigger>
        </TabsList>

        {/* Financials — aggregated from real per-partner billing + funding */}
        <TabsContent value="financials" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={Wallet} label="Monthly recurring (incl. VAT)" value={ZAR(totals.mrrGross)} tint="bg-emerald-500/10 text-emerald-600" />
            <StatCard icon={Receipt} label="Outstanding (incl. VAT)" value={ZAR(totals.outstanding)} tint={totals.overdue ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'} />
            <StatCard icon={Landmark} label="Funding value" value={ZAR(totals.funderValue)} tint="bg-blue-500/10 text-blue-600" />
            <StatCard icon={Percent} label="VAT collected" value={ZAR(totals.vatCollected)} tint="bg-violet-500/10 text-violet-600" />
          </div>

          <Card className="overflow-hidden">
            <div className="p-4 border-b border-border"><SectionTitle>Per-partner financials</SectionTitle></div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Partner</th>
                  <th className="text-right p-3">Monthly (incl. VAT)</th>
                  <th className="text-right p-3">Outstanding</th>
                  <th className="text-right p-3">Funding value</th>
                  <th className="text-right p-3">VAT collected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {partners.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 text-right tabular-nums">{ZAR(p.mrrGross)}</td>
                    <td className={cn('p-3 text-right tabular-nums', p.overdue && 'text-amber-600')}>{ZAR(p.outstanding)}</td>
                    <td className="p-3 text-right tabular-nums">{ZAR(p.funderValue)}</td>
                    <td className="p-3 text-right tabular-nums">{ZAR(p.vatCollected)}</td>
                  </tr>
                ))}
                {partners.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No partners yet.</td></tr>}
                {partners.length > 0 && (
                  <tr className="bg-muted/30 font-semibold">
                    <td className="p-3">Platform total</td>
                    <td className="p-3 text-right tabular-nums">{ZAR(totals.mrrGross)}</td>
                    <td className="p-3 text-right tabular-nums">{ZAR(totals.outstanding)}</td>
                    <td className="p-3 text-right tabular-nums">{ZAR(totals.funderValue)}</td>
                    <td className="p-3 text-right tabular-nums">{ZAR(totals.vatCollected)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-muted-foreground">Aggregated live from each partner's subscriptions, invoices and funding agreements.</p>
        </TabsContent>

        {/* Contracts & MOUs — real filing cabinet */}
        <TabsContent value="filing" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={FileText} label="Documents on file" value={filingList.length} tint="bg-indigo-500/10 text-indigo-600" />
            <StatCard icon={FolderOpen} label="MOUs" value={filingList.filter((f) => f.docType === 'MOU').length} tint="bg-violet-500/10 text-violet-600" />
            <StatCard icon={Building} label="Contracts / MSAs" value={filingList.filter((f) => f.docType === 'MSA' || f.docType === 'SLA' || f.docType === 'Partnership').length} tint="bg-emerald-500/10 text-emerald-600" />
            <StatCard icon={AlertTriangle} label="Expiring / expired" value={expiringCount} tint={expiringCount ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'} />
          </div>

          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, counterparty, partner" className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm" />
              </div>
              <select value={typeF} onChange={(e) => setTypeF(e.target.value as FilingType | 'all')} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="all">All types</option>
                {FILING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={partnerF} onChange={(e) => setPartnerF(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="all">All partners</option>
                <option value="Platform">Platform-wide</option>
                {partnerNames.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <Button size="sm" className="gap-1.5" onClick={() => setUpOpen((v) => !v)}><Upload className="h-4 w-4" /> File document</Button>
            </div>

            {upOpen && (
              <div className="rounded-lg border border-border p-3 grid sm:grid-cols-2 gap-2 bg-muted/20">
                <input type="file" ref={fileRef} className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
                <label className="text-xs block sm:col-span-2"><span className="mb-1 block font-medium text-muted-foreground">Title</span>
                  <input value={upTitle} onChange={(e) => setUpTitle(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
                <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Type</span>
                  <select value={upType} onChange={(e) => setUpType(e.target.value as FilingType)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {FILING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select></label>
                <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Partner</span>
                  <select value={upPartner} onChange={(e) => setUpPartner(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="Platform">Platform-wide</option>
                    {partnerNames.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select></label>
                <label className="text-xs block sm:col-span-2"><span className="mb-1 block font-medium text-muted-foreground">Counterparty</span>
                  <input value={upCounter} onChange={(e) => setUpCounter(e.target.value)} placeholder="Other signatory" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
                <div className="sm:col-span-2 flex items-center gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5" /> {upFileName || 'Attach file'}</Button>
                  <Button size="sm" className="gap-1.5 ml-auto" disabled={!upTitle.trim() || create.isPending} onClick={submitUpload}><CheckCircle2 className="h-3.5 w-3.5" /> File it</Button>
                </div>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Document</th><th className="text-left p-3">Type</th><th className="text-left p-3">Partner</th><th className="text-left p-3">Counterparty</th><th className="text-left p-3">Expires</th><th className="text-left p-3">Status</th><th className="p-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((f) => {
                  const s = ST[f.status] ?? ST.active;
                  return (
                    <tr key={f.id} className="hover:bg-muted/20">
                      <td className="p-3"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground shrink-0" /><span className="font-medium">{f.title}</span></div></td>
                      <td className="p-3"><Badge variant="secondary">{f.docType}</Badge></td>
                      <td className="p-3 text-muted-foreground">{f.partner}</td>
                      <td className="p-3 text-muted-foreground">{f.counterparty}</td>
                      <td className="p-3 text-muted-foreground">{f.expires ? new Date(f.expires).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td>
                      <td className="p-3">
                        <select value={f.status} onChange={(e) => patch.mutate({ id: f.id, body: { status: e.target.value } })}
                          className={cn('rounded px-2 py-1 text-xs font-medium border-0 cursor-pointer', s.chip)}>
                          <option value="active">Active</option><option value="expiring">Expiring</option><option value="expired">Expired</option><option value="draft">Draft</option>
                        </select>
                      </td>
                      <td className="p-3 text-right"><Button size="sm" variant="ghost" className="h-8 text-muted-foreground hover:text-red-600" onClick={() => del.mutate(f.id)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">{filingList.length === 0 ? 'No documents filed yet. Use "File document" above.' : 'No documents match your filters.'}</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
