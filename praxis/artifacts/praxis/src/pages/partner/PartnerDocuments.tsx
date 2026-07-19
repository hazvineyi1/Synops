import React, { useMemo, useRef, useState } from 'react';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  FileText, Upload, Receipt, FileSignature, Landmark, ShieldCheck, Folder,
  Search, CheckCircle2, Clock, AlertTriangle, Download,
} from 'lucide-react';
import { getPartnerHub, type PartnerDoc, type DocCategory } from '@/lib/partnerHubData';

const CATS: { key: DocCategory; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { key: 'invoice', label: 'Invoices', icon: Receipt, hint: 'Tax invoices, statements, proof of payment' },
  { key: 'contract', label: 'Contracts', icon: FileSignature, hint: 'MSAs, SLAs, order forms, addenda' },
  { key: 'funder', label: 'Funder agreements', icon: Landmark, hint: 'SETA grants, NSFAS registers, disbursement letters' },
  { key: 'compliance', label: 'Compliance', icon: ShieldCheck, hint: 'B-BBEE evidence, POEs, unit-standard records' },
  { key: 'other', label: 'Other', icon: Folder, hint: 'Anything else worth filing' },
];

const statusStyle: Record<PartnerDoc['status'], { cls: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  filed: { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', icon: CheckCircle2, label: 'Filed' },
  pending: { cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', icon: Clock, label: 'Pending' },
  'action-required': { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', icon: AlertTriangle, label: 'Action required' },
};

/**
 * Documents & Filing (spec §3/§4). A single filing cabinet for every piece of partner paperwork:
 * invoices, contracts, funder agreements and compliance records - uploaded, categorised, tagged to
 * an organisation and status-tracked. Upload is a functional client-side stand-in (no live storage
 * backend wired yet); everything else is real UI on seeded data.
 */
export function PartnerDocuments() {
  const { user } = useSession();
  const h = getPartnerHub(user?.partnerId);

  const [docs, setDocs] = useState<PartnerDoc[]>(h.documents);
  const [cat, setCat] = useState<DocCategory | 'all'>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [q, setQ] = useState('');
  const [uploadCat, setUploadCat] = useState<DocCategory>('invoice');
  const [uploadOrg, setUploadOrg] = useState<string>(h.orgs[0]?.name ?? '');
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => docs.filter((d) =>
    (cat === 'all' || d.category === cat) &&
    (orgFilter === 'all' || d.orgName === orgFilter) &&
    (q.trim() === '' || d.name.toLowerCase().includes(q.trim().toLowerCase())),
  ), [docs, cat, orgFilter, q]);

  const counts = useMemo(() => {
    const by = (c: DocCategory) => docs.filter((d) => d.category === c).length;
    return { total: docs.length, invoice: by('invoice'), contract: by('contract'), action: docs.filter((d) => d.status === 'action-required').length };
  }, [docs]);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const added: PartnerDoc[] = Array.from(files).map((f, i) => ({
      id: `up_${Date.now()}_${i}`,
      name: f.name,
      category: uploadCat,
      orgName: uploadOrg || null,
      status: 'pending',
      uploadedAt: new Date().toISOString().slice(0, 10),
      size: f.size > 1_000_000 ? `${(f.size / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`,
    }));
    setDocs((prev) => [...added, ...prev]);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Documents & Filing" icon={FileText} subtitle={`${h.partnerName} - one filing cabinet for invoices, contracts, funder agreements and compliance paperwork.`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={FileText} label="Documents filed" value={counts.total} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={Receipt} label="Invoices" value={counts.invoice} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={FileSignature} label="Contracts" value={counts.contract} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={AlertTriangle} label="Action required" value={counts.action} tint={counts.action ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'} />
      </div>

      {/* Upload */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Upload className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Upload paperwork</h3>
        </div>
        <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <label className="text-xs">
            <span className="mb-1 block font-medium text-muted-foreground">Category</span>
            <select value={uploadCat} onChange={(e) => setUploadCat(e.target.value as DocCategory)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              {CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-muted-foreground">Organisation</span>
            <select value={uploadOrg} onChange={(e) => setUploadOrg(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">Partner-wide (no org)</option>
              {h.orgs.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
            </select>
          </label>
          <div>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <Button className="gap-2 w-full" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Choose files</Button>
          </div>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          className="mt-3 w-full rounded-xl border-2 border-dashed border-border py-6 text-center text-sm text-muted-foreground hover:border-primary/40 hover:bg-muted/30 transition-colors">
          Drag files here or click to browse - {CATS.find((c) => c.key === uploadCat)?.hint}
        </button>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setCat('all')}
          className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition', cat === 'all' ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-primary/40')}>
          All ({docs.length})
        </button>
        {CATS.map((c) => (
          <button key={c.key} onClick={() => setCat(c.key)}
            className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition inline-flex items-center gap-1.5', cat === c.key ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-primary/40')}>
            <c.icon className="h-3.5 w-3.5" /> {c.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs">
            <option value="all">All organisations</option>
            {h.orgs.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
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
              <th className="text-left p-3">Document</th>
              <th className="text-left p-3">Category</th>
              <th className="text-left p-3">Organisation</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Uploaded</th>
              <th className="text-right p-3">Size</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((d) => {
              const c = CATS.find((x) => x.key === d.category)!;
              const s = statusStyle[d.status];
              return (
                <tr key={d.id} className="hover:bg-muted/20">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <c.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate max-w-[240px]">{d.name}</span>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{c.label}</td>
                  <td className="p-3 text-muted-foreground">{d.orgName ?? <span className="italic">Partner-wide</span>}</td>
                  <td className="p-3">
                    <span className={cn('rounded px-2 py-0.5 text-[10px] font-medium inline-flex items-center gap-1', s.cls)}>
                      <s.icon className="h-2.5 w-2.5" /> {s.label}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(d.uploadedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="p-3 text-right tabular-nums text-muted-foreground">{d.size}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="ghost" className="gap-1 h-7"><Download className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">No documents match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted-foreground">Uploads are held in this session as a functional preview. Wiring to durable partner storage (with virus scan and retention policy) is a backend step, kept separate because it needs live credentials.</p>
    </div>
  );
}
