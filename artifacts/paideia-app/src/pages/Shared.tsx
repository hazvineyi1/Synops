import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { SharedItem } from "@/lib/types";
import { Inbox } from "lucide-react";

const KIND_LABELS: Record<SharedItem["resourceType"], string> = {
  plan: "Lesson plan",
  worksheet: "Worksheet",
  quiz: "Quiz",
  "parent-draft": "Parent update",
};

const KIND_PATHS: Record<SharedItem["resourceType"], string> = {
  plan: "/plans",
  worksheet: "/worksheets",
  quiz: "/quizzes",
  "parent-draft": "/parent-drafts",
};

export default function Shared() {
  const [items, setItems] = useState<SharedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setLoc] = useLocation();

  async function load() {
    setLoading(true);
    const r = await api.get<{ items: SharedItem[] }>("/resource-shares/inbox");
    setItems(r.items);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function open(item: SharedItem) {
    setError(null);
    setBusyId(item.id);
    try {
      const r = await api.post<{ kind: SharedItem["resourceType"]; id: string }>(`/resource-shares/${item.id}/claim`);
      setLoc(`${KIND_PATHS[r.kind]}/${r.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open");
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <header className="mb-8 flex items-start gap-3">
        <Inbox className="h-7 w-7 text-primary mt-1" />
        <div>
          <h1 className="font-serif text-4xl text-primary mb-2">Shared with you</h1>
          <p className="text-muted-foreground">Open a share to drop a copy into your library. You can then edit or adapt it freely.</p>
        </div>
      </header>
      {error ? <div className="text-sm text-destructive mb-4">{error}</div> : null}
      {loading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="border rounded-lg bg-card p-8 text-center text-muted-foreground">
          Nothing shared with you yet.
        </div>
      ) : (
        <div className="border rounded-lg bg-card divide-y">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{KIND_LABELS[item.resourceType]}</span>
                  <span className="text-[11px] text-muted-foreground">· from {item.fromName} ({item.fromEmail})</span>
                  <span className="text-[11px] text-muted-foreground">· {new Date(item.sharedAt).toLocaleDateString()}</span>
                  {item.viewedAt ? null : <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent uppercase tracking-wide font-semibold">New</span>}
                </div>
                {item.message ? <div className="text-sm text-foreground/80 italic">"{item.message}"</div> : null}
              </div>
              <div className="shrink-0">
                {item.copiedResourceId ? (
                  <Button size="sm" variant="outline" onClick={() => setLoc(`${KIND_PATHS[item.resourceType]}/${item.copiedResourceId}`)}>Open copy</Button>
                ) : (
                  <Button size="sm" onClick={() => open(item)} disabled={busyId === item.id} data-track="shared_claim">
                    {busyId === item.id ? "Opening..." : "Open and copy"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
