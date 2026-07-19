import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  FileText, Upload, Receipt, FileSignature, Landmark, ShieldCheck, Folder,
  Search, CheckCircle2, Clock, AlertTriangle, Trash2,
} from 'lucide-react';
import { getActivePartnerId } from '@/lib/partnerHubData';
import { orgLabel, useOrgOverrides } from '@/lib/orgOverridesStore';

type DocCategory = 'invoice' | 'contract' | 'funder' | 'compliance' | 'other';
type DocStatus = 'filed' | 'pending' | 'action-required';
interface Doc { id: string; orgId: string | null; orgName: string | null; name: string; category: DocCategory; status: DocStatus; size: string | null; fileUrl: string | null; createdAt: string }
interface OrgLite { id: string; name: string; partnerId: string | null }

const CATS: { key: DocCategory; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { key: 'invoice', label: 'Invoices', icon: Receipt, hint: 'Tax invoices, statements, proof of payment' },
  { key: 'contract', label: 'Contracts', icon: FileSignature, hint: 'MSAs, SLAs, order forms, addenda' },
  { key: 'funder', label: 'Funder agreements', icon: Landmark, hint: 'SETA grants, NSFAS registers, disbursement letters' },
  { key: 'compliance', label: 'Compliance', icon: ShieldCheck, hint: 'B-BBEE evidence, POEs, unit-standard records' },
  { key: 'other', label: 'Other', icon: Folder, hint: 'Anything else worth filing' },
];
const STATUS_OPTS: DocStatus[] = ['pending', 'filed', 'action-required'];
const statusStyle: Record<DocStatus, { cls: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  filed: { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', icon: CheckCircle2, label: 'Filed' },
  pending: { cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', icon: Clock, label: 'Pending' },
  'action-required': { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', icon: AlertTriangle, label: 'Action required' },
};
const sizeLabel = (bytes: number) => (bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Documents & Filing — a real, persistent filing register per partner (partner_documents). Upload
 * records each file's metadata; status is tracked per document. Durable storage of the file BYTES
 * (with virus scan + retention) is a further step needing storage credentials, so this files the
 * paperwork register rather than the binaries.
 */
export function PartnerDocuments() {
  const { user } = useSession();
  useOrgOverrides();
  const partnerId = user?.partnerId ?? getActivePartnerId();
  const qc = useQueryClient();

  const { data: docs, isLoading } = useQuery({
    queryKey: ['partner-documents', partnerId],
    queryFn: () => apiFetch<Doc[]>(`/partners/${partnerId}/documents`),
    enabled: !!partnerId,
  });
  const { data: orgsData } = useQuery({ queryKey: ['organisations'], queryFn: () => apiFetch<OrgLite[]>('/organisations') });
  const orgs = (orgsData ?? []).filter((o) => o.partnerId === partnerId);
  const list = docs ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['partner-documents', partnerId] });
  const create = useMutation({ mutationFn: (body: Record<string, unknown>) => apiFetch(`/partners/${partnerId}/documents`, { method: 'POST', body: JSON.stringify(body) }), onSuccess: invalidate });
  const patch = useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiFetch(`/partners/${partnerId}/documents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), onSuccess: invalidate });
  const del = useMutation({ mutationFn: (id: string) => apiFetch(`/partners/${partnerId}/documents/${id}`, { method: 'DELETE' }), onSuccess: invalidate });

  const [cat, setCat] = useState<DocCategory | 'all'>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [q, setQ] = useState('');
  const [uploadCat, setUploadCat] = useState<DocCategory>('invoice');
  const [uploadOrg, setUploadOrg] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => list.filter((d) =>
    (cat === 'all' || d.category === cat) &&
    (orgFilter === 'all' || d.orgName === orgFilter) &&
    (q.trim() === '' || d.name.toLowerCase().includes(q.trim().toLowerCase())),
  ), [list, cat, orgFilter, q]);

  const counts = useMemo(() => ({
    total: list.length,
    invoice: list.filter((d) => d.category === 'invoice').length,
    contract: list.filter((d) => d.category === 'contract').length,
    action: list.filter((d) => d.status === 'action-required').length,
  }), [list]);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !partnerId) return;
    const orgId = orgs.find((o) => o.name === uploadOrg)?.id ?? null;
    Array.from(files).forEach((f) => create.mutate({ name: f.name, category: uploadCat, orgName: uploadOrg || null, orgId, size: sizeLabel(f.size), status: 'pending' }));
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Documents & Filing" icon={FileText} subtitle="One filing register for invoices, contracts, funder agreements and compliance paperwork." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={FileText} label="Documents filed" value={counts.total} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={Receipt} label="Invoices" value={counts.invoice} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={FileSignature} label="Contracts" value={counts.contract} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={AlertTriangle} label="Action required" value={counts.action} tint={counts.action ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'} />
      </div>

      {/* Upload */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3"><Upload className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">File paperwork</h3></div>
        <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <label className="text-xs">
            <span className="mb-1 block font-medium text-muted-foreground">Category</span>
            <select value={uploadCat} onChange={(e) => setUploadCat(e.target.value as DocCategory)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              {CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-muted-foreground">Organisation</span>
            <select value={uploadOrg} onChange={(e) => setUploadOrg(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">Partner-wide (no org)</option>
              {orgs.map((o) => <option key={o.id} value={o.name}>{orgLabel(o.name)}</option>)}
            </select>
          </label>
          <div>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <Button className="gap-2 w-full" disabled={!partnerId} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Choose files</Button>
          </div>
        </div>
        <button onClick={() => fileRef.current?.click()} className="mt-3 w-full rounded-xl border-2 border-dashed border-border py-6 text-center text-sm text-muted-foreground hover:border-primary/40 hover:bg-muted/30 transition-colors">
          Click to browse - {CATS.find((c) => c.key === uploadCat)?.hint}
        </button>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setCat('all')} className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition', cat === 'all' ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-primary/40')}>All ({list.length})</button>
        {CATS.map((c) => (
          <button key={c.key} onClick={() => setCat(c.key)} className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition inline-flex items-center gap-1.5', cat === c.key ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-primary/40')}>
            <c.icon className="h-3.5 w-3.5" /> {c.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs">
            <option value="all">All organisations</option>
            {orgs.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files" className="h-8 w-44 pl-8 text-xs" />
          </div>
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left p-3">Document</th><th className="text-left p-3">Category</th><th className="text-left p-3">Organisation</th>
              <th className="text-left p-3">Status</th><th className="text-left p-3">Filed</th><th className="text-right p-3">Size</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
            {filtered.map((d) => {
              const c = CATS.find((x) => x.key === d.category) ?? CATS[4];
              const s = statusStyle[d.status] ?? statusStyle.pending;
              return (
                <tr key={d.id} className="hover:bg-muted/20">
                  <td className="p-3"><div className="flex items-center gap-2"><c.icon className="h-4 w-4 text-muted-foreground shrink-0" /><span className="font-medium truncate max-w-[240px]">{d.name}</span></div></td>
                  <td className="p-3 text-muted-foreground">{c.label}</td>
                  <td className="p-3 text-muted-foreground">{d.orgName ? orgLabel(d.orgName) : <span className="italic">Partner-wide</span>}</td>
                  <td className="p-3">
                    <select value={d.status} onChange={(e) => patch.mutate({ id: d.id, body: { status: e.target.value } })}
                      className={cn('rounded px-2 py-0.5 text-[10px] font-medium border-0 cursor-pointer', s.cls)}>
                      {STATUS_OPTS.map((st) => <option key={st} value={st}>{statusStyle[st].label}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(d.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="p-3 text-right tabular-nums text-muted-foreground">{d.size ?? '—'}</td>
                  <td className="p-3 text-right"><Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => del.mutate(d.id)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                </tr>
              );
            })}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">{list.length === 0 ? 'No documents filed yet. Use the panel above to file paperwork.' : 'No documents match these filters.'}</td></tr>
            )}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted-foreground">The filing register (names, categories, org, status) is stored persistently. Durable storage of the file contents themselves — with virus scan and retention policy — is a further step that needs live storage credentials.</p>
    </div>
  );
}
