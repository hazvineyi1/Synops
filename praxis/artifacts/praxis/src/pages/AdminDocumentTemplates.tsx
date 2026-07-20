import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { FileText, Send, Eye, CheckCircle2, Users, Download } from 'lucide-react';

interface Template { key: string; title: string; docType: string }
interface PartnerLite { id: string; name: string }

export function AdminDocumentTemplates() {
  const qc = useQueryClient();
  const { data: templates, isLoading } = useQuery({ queryKey: ['document-templates'], queryFn: () => apiFetch<Template[]>('/platform/document-templates') });
  const { data: partners } = useQuery({ queryKey: ['partners'], queryFn: () => apiFetch<PartnerLite[]>('/partners') });

  const [viewing, setViewing] = useState<Template | null>(null);
  const { data: content, isLoading: contentLoading } = useQuery({
    queryKey: ['doc-template', viewing?.key],
    queryFn: () => apiFetch<{ title: string; contentHtml: string }>(`/document-templates/${viewing!.key}`),
    enabled: !!viewing,
  });

  const [sending, setSending] = useState<Template | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(null), 4000); };

  const { data: recipients } = useQuery({
    queryKey: ['doc-template-recipients', sending?.key],
    queryFn: () => apiFetch<{ partnerIds: string[] }>(`/platform/document-templates/${sending!.key}/recipients`),
    enabled: !!sending,
  });
  const alreadyIds = new Set(recipients?.partnerIds ?? []);

  const send = useMutation({
    mutationFn: () => apiFetch<{ sent: number; skipped: number }>(`/platform/document-templates/${sending!.key}/send`, { method: 'POST', body: JSON.stringify({ partnerIds: [...sel] }) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['doc-template-recipients', sending?.key] });
      setSending(null); setSel(new Set());
      flashMsg(`Sent to ${r.sent} partner${r.sent === 1 ? '' : 's'}${r.skipped ? ` (${r.skipped} already had it)` : ''}. It now appears in their Documents & Filing.`);
    },
    onError: (e: any) => flashMsg(e?.message ?? 'Could not send.'),
  });

  const openSend = (t: Template) => { setSending(t); setSel(new Set()); };

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Document Library" icon={FileText} subtitle="Synops's standard agreements and policies. View them, and send any document to your partners to store in their repository." />

      {flash && <Card className="p-3 border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {flash}</Card>}

      <p className="text-xs text-muted-foreground">These are templates pending independent legal review. The signable letterhead Word/PDF versions are managed alongside; the on-platform view below is the working copy super admin can distribute.</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {isLoading && <Card className="p-6 text-center text-muted-foreground sm:col-span-2 lg:col-span-3">Loading library…</Card>}
        {(templates ?? []).map((t) => (
          <Card key={t.key} className="p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium leading-snug">{t.title}</div>
                <Badge variant="secondary" className="mt-1 text-[10px]">{t.docType}</Badge>
              </div>
              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
            </div>
            <div className="mt-auto space-y-2">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5 flex-1" onClick={() => setViewing(t)}><Eye className="h-3.5 w-3.5" /> View</Button>
                <Button size="sm" className="gap-1.5 flex-1" onClick={() => openSend(t)}><Send className="h-3.5 w-3.5" /> Send</Button>
              </div>
              <div className="flex gap-2">
                <a href={`${API}/document-templates/${t.key}/download?format=docx`} className="flex-1"><Button size="sm" variant="ghost" className="gap-1.5 w-full text-xs"><Download className="h-3.5 w-3.5" /> Word</Button></a>
                <a href={`${API}/document-templates/${t.key}/download?format=pdf`} className="flex-1"><Button size="sm" variant="ghost" className="gap-1.5 w-full text-xs"><Download className="h-3.5 w-3.5" /> PDF</Button></a>
              </div>
            </div>
          </Card>
        ))}
        {!isLoading && (templates ?? []).length === 0 && <Card className="p-6 text-center text-muted-foreground sm:col-span-2 lg:col-span-3">No documents in the library.</Card>}
      </div>

      {/* View content */}
      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.title}</DialogTitle>
            <DialogDescription>On-platform working copy. Use the letterhead Word/PDF version for signature.</DialogDescription>
          </DialogHeader>
          {contentLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
            <div className="prose prose-sm max-w-none dark:prose-invert [&_table]:w-full [&_table]:text-sm [&_th]:text-left [&_th]:border-b [&_th]:p-2 [&_td]:p-2 [&_td]:border-b [&_h1]:text-lg [&_h2]:text-base [&_h1]:font-semibold [&_h2]:font-semibold" dangerouslySetInnerHTML={{ __html: content?.contentHtml ?? '' }} />
          )}
        </DialogContent>
      </Dialog>

      {/* Send to partners */}
      <Dialog open={!!sending} onOpenChange={(o) => { if (!o) setSending(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send to partners</DialogTitle>
            <DialogDescription>{sending?.title} will be filed in each selected partner's Documents & Filing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {(partners ?? []).map((p) => {
              const has = alreadyIds.has(p.id);
              return (
                <label key={p.id} className="flex items-center gap-2 text-sm rounded px-2 py-1.5 hover:bg-muted/50 cursor-pointer">
                  <input type="checkbox" className="h-4 w-4" disabled={has} checked={sel.has(p.id) || has} onChange={() => setSel((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} />
                  <span className="flex-1">{p.name}</span>
                  {has && <Badge variant="outline" className="text-[10px] gap-1"><Users className="h-3 w-3" /> Filed</Badge>}
                </label>
              );
            })}
            {(partners ?? []).length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No partners yet.</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSending(null)}>Cancel</Button>
            <Button className="gap-1.5" disabled={sel.size === 0 || send.isPending} onClick={() => send.mutate()}><Send className="h-4 w-4" /> {send.isPending ? 'Sending…' : `Send to ${sel.size || ''}`}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
