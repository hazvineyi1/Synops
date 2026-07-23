import { useEffect, useState, useCallback } from "react";
import { Redirect } from "wouter";
import { apiFetch, apiFetchMeta } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Languages, Check, X } from "lucide-react";

interface Row {
  id: string;
  lang: string;
  languageName: string;
  sourceText: string;
  translatedText: string;
  status: string;
  contentType: string;
}

const LANGS = [
  { code: "", name: "All languages" },
  { code: "zu", name: "isiZulu" },
  { code: "xh", name: "isiXhosa" },
  { code: "af", name: "Afrikaans" },
];

/**
 * Native-speaker translation review queue (super admin). Machine drafts collect here as
 * learners read content in a South-African language; a reviewer approves (optionally
 * correcting the text) or rejects each one. Approved translations become canonical.
 */
export default function TranslationReview() {
  const { user } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [lang, setLang] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status: "machine", limit: "50" });
      if (lang) qs.set("lang", lang);
      const { data, total } = await apiFetchMeta<Row[]>(`/platform/translations?${qs.toString()}`);
      setRows(data ?? []);
      setTotal(total);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { void load(); }, [load]);

  const review = async (id: string, decision: "approve" | "reject") => {
    setBusy(id);
    try {
      await apiFetch(`/platform/translations/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, translatedText: edits[id] }),
      });
      setRows((r) => r.filter((x) => x.id !== id));
      setTotal((t) => (t != null ? Math.max(0, t - 1) : t));
    } catch {
      /* leave the row in place so the reviewer can retry */
    } finally {
      setBusy(null);
    }
  };

  if (user && user.role !== "super_admin") return <Redirect to="/dashboard" />;

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-8">
      <div>
        <h1 className="flex items-center gap-2 font-serif text-3xl font-bold text-foreground">
          <Languages className="h-7 w-7 text-primary" /> Translation review
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Machine-translated drafts awaiting native-speaker sign-off. Approve to make a translation
          canonical, or reject to withhold it. Legal content is never shown to learners until approved here.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {LANGS.map((l) => (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            className={`rounded-full px-3 py-1 text-sm ${lang === l.code ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {l.name}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">{total ?? rows.length} pending</span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nothing awaiting review. All caught up.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-muted px-2 py-0.5 font-medium">{r.languageName}</span>
                  <span className="rounded bg-muted px-2 py-0.5">{r.contentType}</span>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Source (English)</p>
                  <p className="text-sm text-foreground">{r.sourceText}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Translation ({r.languageName})</p>
                  <textarea
                    className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm text-foreground"
                    rows={3}
                    defaultValue={r.translatedText}
                    onChange={(e) => setEdits((m) => ({ ...m, [r.id]: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy === r.id} onClick={() => review(r.id, "approve")}>
                    <Check className="mr-1 h-4 w-4" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => review(r.id, "reject")}>
                    <X className="mr-1 h-4 w-4" /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
