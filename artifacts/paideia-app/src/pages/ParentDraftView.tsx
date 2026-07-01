import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { ParentDraft } from "@/lib/types";
import { ParentDraftView as Renderer } from "@/components/Renderers";
import { Copy, Trash2, Printer, Check, Share2 } from "lucide-react";
import { ShareResourceDialog } from "@/components/ShareResourceDialog";

export default function ParentDraftView() {
  const [, params] = useRoute<{ id: string }>("/parent-drafts/:id");
  const [, setLoc] = useLocation();
  const [d, setD] = useState<ParentDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!params?.id) return;
    void api.get<{ draft: ParentDraft }>(`/parent-drafts/${params.id}`)
      .then((r) => setD(r.draft))
      .finally(() => setLoading(false));
  }, [params?.id]);

  const onCopy = async () => {
    if (!d) return;
    const text = [
      `Subject: ${d.content.subject}`,
      "",
      d.content.greeting,
      "",
      ...(d.content.paragraphs ?? []),
      "",
      d.content.closing,
      d.content.signature,
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onDelete = async () => {
    if (!d) return;
    if (!confirm("Delete this draft?")) return;
    await api.del(`/parent-drafts/${d.id}`);
    setLoc("/dashboard");
  };

  if (loading) return <AppShell><p className="text-muted-foreground">Loading.</p></AppShell>;
  if (!d) return <AppShell><p>Draft not found.</p></AppShell>;

  return (
    <AppShell>
      <header className="mb-8 flex items-start justify-between gap-4 no-print">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Parent update · {d.tone}
          </div>
          <h1 className="font-serif text-4xl text-primary">Message about {d.studentName}</h1>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onCopy}>{copied ? <><Check className="h-4 w-4 mr-1" />Copied</> : <><Copy className="h-4 w-4 mr-1" />Copy</>}</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}><Share2 className="h-4 w-4 mr-1" />Share</Button>
          <Button variant="ghost" size="sm" onClick={onDelete}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>
        </div>
      </header>
      <Renderer c={d.content} />
      <ShareResourceDialog open={shareOpen} onOpenChange={setShareOpen} resourceType="parent-draft" resourceId={d.id} resourceTitle={`Message about ${d.studentName}`} />
    </AppShell>
  );
}
