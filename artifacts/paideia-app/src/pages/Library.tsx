import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { LibraryItem } from "@/lib/types";
import { ShareResourceDialog } from "@/components/ShareResourceDialog";
import { Copy, Share2 } from "lucide-react";

const KIND_LABELS: Record<LibraryItem["kind"], string> = {
  plan: "Lesson plan",
  worksheet: "Worksheet",
  quiz: "Quiz",
  "parent-draft": "Parent update",
};

const KIND_PATHS: Record<LibraryItem["kind"], string> = {
  plan: "/plans",
  worksheet: "/worksheets",
  quiz: "/quizzes",
  "parent-draft": "/parent-drafts",
};

export default function Library() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [share, setShare] = useState<LibraryItem | null>(null);
  const [, setLoc] = useLocation();

  async function load() {
    setLoading(true);
    const r = await api.get<{ items: LibraryItem[] }>("/library");
    setItems(r.items);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (kind !== "all" && i.kind !== kind) return false;
      if (!q) return true;
      return [i.title, i.subject, i.yearGroup, i.topic ?? ""].some((s) => s.toLowerCase().includes(q));
    });
  }, [items, query, kind]);

  async function duplicate(item: LibraryItem) {
    const r = await api.post<{ kind: LibraryItem["kind"]; id: string }>("/library/duplicate", { kind: item.kind, id: item.id });
    setLoc(`${KIND_PATHS[r.kind]}/${r.id}`);
  }

  return (
    <AppShell>
      <header className="mb-8">
        <h1 className="font-serif text-4xl text-primary mb-2">Your library</h1>
        <p className="text-muted-foreground">Everything you've created in one place. Search, filter, duplicate or share.</p>
      </header>
      <div className="flex flex-wrap gap-3 mb-6">
        <Input placeholder="Search title, subject, topic..." value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-sm" />
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="plan">Lesson plans</SelectItem>
            <SelectItem value="worksheet">Worksheets</SelectItem>
            <SelectItem value="quiz">Quizzes</SelectItem>
            <SelectItem value="parent-draft">Parent updates</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground self-center ml-auto">{filtered.length} of {items.length}</div>
      </div>
      {loading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="border rounded-lg bg-card p-8 text-center text-muted-foreground">
          {items.length === 0 ? "Nothing here yet. Create your first lesson plan, worksheet or quiz to see it appear." : "No matches for those filters."}
        </div>
      ) : (
        <div className="border rounded-lg bg-card divide-y">
          {filtered.map((item) => (
            <div key={`${item.kind}-${item.id}`} className="flex items-center gap-4 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{KIND_LABELS[item.kind]}</span>
                  <span className="text-[11px] text-muted-foreground">·</span>
                  <span className="text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
                <Link href={`${KIND_PATHS[item.kind]}/${item.id}`} className="font-medium hover:underline truncate block">{item.title}</Link>
                <div className="text-xs text-muted-foreground truncate">{item.subject} · {item.yearGroup}{item.topic ? ` · ${item.topic}` : ""}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => duplicate(item)} data-track="library_duplicate"><Copy className="h-4 w-4 mr-1" />Duplicate</Button>
                <Button size="sm" variant="ghost" onClick={() => setShare(item)} data-track="library_share"><Share2 className="h-4 w-4 mr-1" />Share</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {share ? (
        <ShareResourceDialog open onOpenChange={(v) => { if (!v) setShare(null); }} resourceType={share.kind} resourceId={share.id} resourceTitle={share.title} />
      ) : null}
    </AppShell>
  );
}
