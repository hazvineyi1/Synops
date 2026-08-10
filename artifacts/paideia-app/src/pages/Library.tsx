import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useCatalog } from "@/hooks/use-catalog";
import type { LibraryItem, Sample } from "@/lib/types";
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

const SAMPLE_KIND_LABELS: Record<string, string> = {
  lesson_plan: "Lesson plan",
  worksheet: "Worksheet",
  quiz: "Quiz",
  parent_draft: "Parent update",
};

type Tab = "templates" | "mine";

export default function Library() {
  const [tab, setTab] = useState<Tab>("templates");

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-serif text-4xl text-primary mb-2">Library</h1>
        <p className="text-muted-foreground">
          Ready-made templates and lesson options to copy and edit, plus everything you've created.
        </p>
      </header>
      <div className="inline-flex rounded-lg border bg-card p-1 mb-6">
        <button
          onClick={() => setTab("templates")}
          className={`px-4 py-1.5 text-sm rounded-md transition ${tab === "templates" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          data-track="library_tab_templates"
        >
          Templates
        </button>
        <button
          onClick={() => setTab("mine")}
          className={`px-4 py-1.5 text-sm rounded-md transition ${tab === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          data-track="library_tab_mine"
        >
          My resources
        </button>
      </div>
      {tab === "templates" ? <TemplatesTab /> : <MyResourcesTab />}
    </AppShell>
  );
}

function TemplatesTab() {
  const { regions } = useCatalog();
  const [region, setRegion] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    if (region !== "all") q.set("region", region);
    if (kind !== "all") q.set("kind", kind);
    const qs = q.toString() ? `?${q.toString()}` : "";
    void api
      .get<{ samples: Sample[] }>(`/samples${qs}`)
      .then((r) => setSamples(r.samples))
      .finally(() => setLoading(false));
  }, [region, kind]);

  return (
    <>
      <div className="flex flex-wrap gap-3 mb-6">
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Region" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All regions</SelectItem>
            {regions.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="lesson_plan">Lesson plans</SelectItem>
            <SelectItem value="worksheet">Worksheets</SelectItem>
            <SelectItem value="quiz">Quizzes</SelectItem>
            <SelectItem value="parent_draft">Parent updates</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground self-center ml-auto">{samples.length} templates</div>
      </div>
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading.</p>
      ) : samples.length === 0 ? (
        <div className="border rounded-lg bg-card p-8 text-center text-muted-foreground">No templates match these filters.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {samples.map((s) => (
            <Link
              key={s.id}
              href={`/samples/${s.id}`}
              className="block bg-card border rounded-lg p-5 hover:border-primary transition"
            >
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                {SAMPLE_KIND_LABELS[s.kind] ?? s.kind} · {s.subject} · {s.yearGroup}
              </div>
              <div className="font-serif text-xl text-primary mb-1">{s.title}</div>
              <div className="text-sm text-muted-foreground">{s.description}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function MyResourcesTab() {
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
    <>
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
          {items.length === 0 ? "Nothing here yet. Copy a template above, or create your first lesson plan, worksheet or quiz." : "No matches for those filters."}
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
    </>
  );
}
