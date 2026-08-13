import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ActivityPlayer } from "@/components/ActivityPlayer";
import { RichTextEditor } from "@/components/RichTextEditor";
import { apiFetch } from "@/lib/api";
import { activitiesApi, type Activity } from "@/lib/activitiesApi";
import {
  TEMPLATES, emptySpec, validateSpec, renderActivity,
  type InteractionType, type ActivitySpec,
} from "@/lib/activityTemplates";
import { X, Plus, Trash2, Eye, Check } from "lucide-react";

const TYPE_KEYS: InteractionType[] = ["quiz", "flashcards", "matching", "order", "categorize"];
const isType = (k: unknown): k is InteractionType => typeof k === "string" && (TYPE_KEYS as string[]).includes(k);

const BLOOMS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"];
const DIFFS = ["foundational", "intermediate", "advanced"];

/**
 * No-code builder: pick an interaction type, fill a simple content form, see a live preview,
 * and it generates the self-contained gamified HTML via the shared template engine. This is
 * the same renderer the AI generator and the library use, one spec, many interactives.
 */
export function ActivityBuilder({ onClose, onCreated, activity }: { onClose: () => void; onCreated: (a: Activity) => void; activity?: Activity | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const initialType: InteractionType = activity && isType(activity.kind) ? activity.kind : "quiz";
  const [type, setType] = useState<InteractionType>(initialType);
  const [title, setTitle] = useState(activity?.title ?? "");
  const [instructions, setInstructions] = useState(activity?.instructions ?? "");
  const [bloom, setBloom] = useState(activity?.bloomsLevel ?? "Understand");
  const [difficulty, setDifficulty] = useState(activity?.difficulty ?? "foundational");
  const [published, setPublished] = useState(activity?.published ?? true);
  // Spec is edited loosely then validated/cleaned by the engine on save. When editing an existing
  // no-code activity we load its saved spec so every field is editable again (with rich text).
  const [spec, setSpec] = useState<any>(() => (activity?.spec ? JSON.parse(JSON.stringify(activity.spec)) : emptySpec(initialType)));

  const [genAllImg, setGenAllImg] = useState(false);
  const pickType = (t: InteractionType) => {
    setType(t); setSpec(emptySpec(t));
    const meta = TEMPLATES.find((m) => m.type === t); if (meta) setBloom(meta.defaultBloom);
  };
  const patch = (fn: (s: any) => void) => setSpec((prev: any) => { const n = JSON.parse(JSON.stringify(prev)); fn(n); return n; });

  // Generate a photorealistic image for every flashcard (from its front text), so flip cards are visual.
  const genAllCardImages = async () => {
    const cards = (spec as any).cards ?? [];
    if (!cards.length) return;
    setGenAllImg(true);
    try {
      for (let i = 0; i < cards.length; i++) {
        const prompt = ((cards[i].front ?? '') as string).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || 'flashcard concept';
        try { const r = await apiFetch<{ imageUrl: string }>('/activities/generate-image', { method: 'POST', body: JSON.stringify({ title: prompt }) }); if (r.imageUrl) patch((s) => { s.cards[i].img = r.imageUrl; }); } catch { /* skip one */ }
      }
    } finally { setGenAllImg(false); }
  };

  const previewHtml = useMemo(() => {
    try { return validateSpec(type, spec as ActivitySpec) ? "" : renderActivity(type, spec as ActivitySpec); }
    catch { return ""; }
  }, [type, spec]);

  const create = useMutation({
    mutationFn: () => {
      const err = validateSpec(type, spec as ActivitySpec);
      if (err) throw new Error(err);
      if (!title.trim()) throw new Error("Give the activity a title.");
      const input = {
        title: title.trim(), instructions: instructions.trim() || null,
        html: renderActivity(type, spec as ActivitySpec),
        source: "html" as const, kind: type, bloomsLevel: bloom, difficulty, published,
        spec, imageUrl: activity?.imageUrl ?? null,
      };
      return activity ? activitiesApi.update(activity.id, input) : activitiesApi.create(input);
    },
    onSuccess: (a) => { toast({ title: activity ? "Activity saved" : "Activity created" }); qc.invalidateQueries({ queryKey: ["activities"] }); onCreated(a); },
    onError: (e) => toast({ title: "Could not save", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-auto rounded-xl bg-white shadow-xl border">
        <div className="sticky top-0 bg-white border-b px-5 py-3 flex items-center justify-between z-10">
          <h2 className="font-semibold">{activity ? "Edit interactive" : "Build an interactive"}</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Saving…" : activity ? "Save changes" : "Create activity"}</Button>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Type picker */}
        <div className="px-5 pt-4 flex flex-wrap gap-2">
          {TEMPLATES.map((m) => (
            <button key={m.type} onClick={() => pickType(m.type)}
              className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${type === m.type ? "bg-[hsl(222_47%_20%)] text-white border-transparent" : "hover:bg-muted"}`}
              title={m.blurb}>{m.label}</button>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-5 p-5">
          {/* Left: content form */}
          <div className="space-y-3">
            <div><Label className="text-sm">Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fixed vs variable costs" /></div>
            <div><Label className="text-sm">Instructions (optional)</Label><Input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Shown above the activity" /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-sm">Bloom's</Label>
                <select value={bloom} onChange={(e) => setBloom(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm">{BLOOMS.map((b) => <option key={b}>{b}</option>)}</select></div>
              <div><Label className="text-sm">Difficulty</Label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm capitalize">{DIFFS.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
              <div><Label className="text-sm">Published</Label>
                <select value={published ? "1" : "0"} onChange={(e) => setPublished(e.target.value === "1")} className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"><option value="1">Yes</option><option value="0">Draft</option></select></div>
            </div>

            <div className="border-t pt-3">
              {type === "quiz" && <QuizForm spec={spec} patch={patch} />}
              {type === "flashcards" && (
                <>
                  <div className="mb-2 flex justify-end">
                    <Button type="button" size="sm" variant="outline" disabled={genAllImg} onClick={genAllCardImages}>{genAllImg ? 'Generating images…' : 'Generate an image for every card'}</Button>
                  </div>
                  <PairForm spec={spec} patch={patch} field="cards" a="front" b="back" labelA="Front (prompt)" labelB="Back (answer)" addLabel="card" rich imageField="img" />
                </>
              )}
              {type === "matching" && <PairForm spec={spec} patch={patch} field="pairs" a="left" b="right" labelA="Item" labelB="Its match" addLabel="pair" rich />}
              {type === "order" && <OrderForm spec={spec} patch={patch} />}
              {type === "categorize" && <CategorizeForm spec={spec} patch={patch} />}
            </div>
          </div>

          {/* Right: live preview */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Eye className="h-4 w-4" /> Live preview</div>
            {previewHtml ? <ActivityPlayer html={previewHtml} disabled /> : (
              <div className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground text-center">Fill in the content on the left to preview your activity here.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Per-item image control: paste a URL or generate a photorealistic one from a prompt. ── */
function ItemImage({ url, onChange, prompt }: { url?: string; onChange: (u: string) => void; prompt: string }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-md border border-dashed p-2 space-y-1.5">
      {url ? (
        <div className="relative">
          <img src={url} alt="" className="h-20 w-full object-cover rounded" />
          <button type="button" onClick={() => onChange("")} className="absolute top-1 right-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">Clear</button>
        </div>
      ) : null}
      <div className="flex gap-1.5">
        <Input value={url ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="Image URL, or generate →" className="h-8 text-xs" />
        <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" disabled={busy}
          onClick={async () => {
            setBusy(true);
            try { const r = await apiFetch<{ imageUrl: string }>("/activities/generate-image", { method: "POST", body: JSON.stringify({ title: prompt }) }); if (r.imageUrl) onChange(r.imageUrl); }
            catch (e) { toast({ title: "Could not generate image", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
            finally { setBusy(false); }
          }}>{busy ? "…" : "Generate"}</Button>
      </div>
    </div>
  );
}

const stripTags = (h?: string) => (h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/* ── Per-type content forms ── */
function Row({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 space-y-1.5">{children}</div>
      {onRemove && <button onClick={onRemove} className="mt-1 p-1 rounded hover:bg-rose-500/10 text-rose-600" title="Remove"><Trash2 className="h-4 w-4" /></button>}
    </div>
  );
}
const AddBtn = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <Button size="sm" variant="outline" onClick={onClick}><Plus className="h-4 w-4 mr-1" />Add {label}</Button>
);

function QuizForm({ spec, patch }: { spec: any; patch: (fn: (s: any) => void) => void }) {
  const nQ = spec.questions.length;
  return (
    <div className="space-y-4">
      {spec.questions.map((q: any, qi: number) => (
        <div key={qi} className="rounded-lg border p-3 space-y-2">
          <Row onRemove={spec.questions.length > 1 ? () => patch((s) => s.questions.splice(qi, 1)) : undefined}>
            <Label className="text-xs text-muted-foreground">Question {qi + 1}</Label>
            <RichTextEditor key={`q${nQ}:${qi}`} value={q.q} onChange={(h) => patch((s) => { s.questions[qi].q = h; })} />
            <div className="mt-1"><ItemImage url={q.img} prompt={stripTags(q.q) || "quiz question"} onChange={(u) => patch((s) => { s.questions[qi].img = u || undefined; })} /></div>
          </Row>
          <div className="pl-1 space-y-2">
            <Label className="text-xs text-muted-foreground">Answers (select the correct one)</Label>
            {q.options.map((o: any, oi: number) => (
              <div key={oi} className="flex items-start gap-2">
                <input type="radio" className="mt-2.5 shrink-0" name={`c${qi}`} checked={!!o.correct} onChange={() => patch((s) => s.questions[qi].options.forEach((x: any, k: number) => x.correct = k === oi))} title="Correct answer" />
                <div className="flex-1 min-w-0"><RichTextEditor key={`o${q.options.length}:${qi}:${oi}`} value={o.t} onChange={(h) => patch((s) => { s.questions[qi].options[oi].t = h; })} /></div>
                {q.options.length > 2 && <button onClick={() => patch((s) => s.questions[qi].options.splice(oi, 1))} className="mt-2 p-1 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            ))}
            <Input className="text-xs" value={q.options.find((o: any) => o.correct)?.why ?? ""} placeholder="Why the correct answer is right (feedback)"
              onChange={(e) => patch((s) => { const c = s.questions[qi].options.find((o: any) => o.correct); if (c) c.why = e.target.value; })} />
            <button onClick={() => patch((s) => s.questions[qi].options.push({ t: "", correct: false }))} className="text-xs text-primary">+ option</button>
          </div>
        </div>
      ))}
      <AddBtn onClick={() => patch((s) => s.questions.push({ q: "", options: [{ t: "", correct: true, why: "" }, { t: "", correct: false }] }))} label="question" />
    </div>
  );
}

function PairForm({ spec, patch, field, a, b, labelA, labelB, addLabel, rich, imageField }: { spec: any; patch: (fn: (s: any) => void) => void; field: string; a: string; b: string; labelA: string; labelB: string; addLabel: string; rich?: boolean; imageField?: string }) {
  const rows = spec[field] as any[];
  return (
    <div className={rich ? "space-y-4" : "space-y-2"}>
      {rows.map((row: any, i: number) => (
        <Row key={i} onRemove={rows.length > 1 ? () => patch((s) => s[field].splice(i, 1)) : undefined}>
          {rich ? (
            <div className="space-y-2 rounded-lg border p-3">
              <div><Label className="text-xs text-muted-foreground">{labelA}</Label><RichTextEditor key={`${field}${rows.length}:a:${i}`} value={row[a]} onChange={(h) => patch((s) => { s[field][i][a] = h; })} /></div>
              <div><Label className="text-xs text-muted-foreground">{labelB}</Label><RichTextEditor key={`${field}${rows.length}:b:${i}`} value={row[b]} onChange={(h) => patch((s) => { s[field][i][b] = h; })} /></div>
              {imageField && (
                <div><Label className="text-xs text-muted-foreground">Image (optional)</Label><ItemImage url={row[imageField]} prompt={stripTags(row[a]) || "flashcard"} onChange={(u) => patch((s) => { s[field][i][imageField] = u || undefined; })} /></div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Input value={row[a]} placeholder={labelA} onChange={(e) => patch((s) => { s[field][i][a] = e.target.value; })} />
              <Input value={row[b]} placeholder={labelB} onChange={(e) => patch((s) => { s[field][i][b] = e.target.value; })} />
            </div>
          )}
        </Row>
      ))}
      <AddBtn onClick={() => patch((s) => s[field].push({ [a]: "", [b]: "" }))} label={addLabel} />
    </div>
  );
}

function OrderForm({ spec, patch }: { spec: any; patch: (fn: (s: any) => void) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Enter the steps in the CORRECT order, learners will see them shuffled.</p>
      {spec.items.map((it: string, i: number) => (
        <Row key={i} onRemove={spec.items.length > 2 ? () => patch((s) => s.items.splice(i, 1)) : undefined}>
          <div className="flex items-start gap-2"><span className="text-xs w-5 mt-2 text-muted-foreground">{i + 1}.</span>
            <div className="flex-1"><RichTextEditor key={`step${spec.items.length}:${i}`} value={it} onChange={(h) => patch((s) => { s.items[i] = h; })} /></div></div>
        </Row>
      ))}
      <AddBtn onClick={() => patch((s) => s.items.push(""))} label="step" />
    </div>
  );
}

function CategorizeForm({ spec, patch }: { spec: any; patch: (fn: (s: any) => void) => void }) {
  const buckets: string[] = spec.buckets;
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm">Buckets</Label>
        <div className="space-y-1.5 mt-1">
          {buckets.map((bk: string, i: number) => (
            <Row key={i} onRemove={buckets.length > 2 ? () => patch((s) => s.buckets.splice(i, 1)) : undefined}>
              <Input value={bk} placeholder={`Bucket ${i + 1}`} onChange={(e) => patch((s) => { s.buckets[i] = e.target.value; })} />
            </Row>
          ))}
          <AddBtn onClick={() => patch((s) => s.buckets.push(""))} label="bucket" />
        </div>
      </div>
      <div>
        <Label className="text-sm">Items</Label>
        <div className="space-y-1.5 mt-1">
          {spec.items.map((it: any, i: number) => (
            <Row key={i} onRemove={spec.items.length > 1 ? () => patch((s) => s.items.splice(i, 1)) : undefined}>
              <div className="space-y-1.5">
                <RichTextEditor key={`item${spec.items.length}:${i}`} value={it.text} onChange={(h) => patch((s) => { s.items[i].text = h; })} />
                <select value={it.bucket} onChange={(e) => patch((s) => { s.items[i].bucket = e.target.value; })} className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm">
                  <option value="">Which bucket?…</option>
                  {buckets.filter((b) => b.trim()).map((b, k) => <option key={k} value={b}>{stripTags(b) || b}</option>)}
                </select>
              </div>
            </Row>
          ))}
          <AddBtn onClick={() => patch((s) => s.items.push({ text: "", bucket: "" }))} label="item" />
        </div>
      </div>
    </div>
  );
}

export const _icons = { Check };
