import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { gradebookApi, type GradebookSettings, type LetterBand } from "@/lib/gradebookApi";
import { Plus, Trash2 } from "lucide-react";

const DEFAULT_BANDS: LetterBand[] = [
  { label: "A", min: 90 }, { label: "B", min: 80 }, { label: "C", min: 70 }, { label: "D", min: 60 }, { label: "F", min: 0 },
];

export function GradebookSettingsDialog({
  courseId,
  categories,
  open,
  onOpenChange,
}: {
  courseId: string;
  categories: string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["gb-settings", courseId], queryFn: () => gradebookApi.settings(courseId), enabled: open });

  const [s, setS] = useState<GradebookSettings | null>(null);
  useEffect(() => {
    if (q.data && open) {
      setS({
        ...q.data,
        letterBands: q.data.letterBands?.length ? q.data.letterBands : DEFAULT_BANDS,
        categoryWeights: q.data.categoryWeights ?? {},
      });
    }
  }, [q.data, open]);

  const save = useMutation({
    mutationFn: (body: GradebookSettings) => gradebookApi.saveSettings(courseId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gradebook", courseId] });
      qc.invalidateQueries({ queryKey: ["gb-settings", courseId] });
      onOpenChange(false);
    },
  });

  const upd = (patch: Partial<GradebookSettings>) => setS((cur) => (cur ? { ...cur, ...patch } : cur));
  const setCatW = (cat: string, v: number) => setS((cur) => (cur ? { ...cur, categoryWeights: { ...cur.categoryWeights, [cat]: v } } : cur));
  const setBand = (i: number, patch: Partial<LetterBand>) =>
    setS((cur) => (cur ? { ...cur, letterBands: cur.letterBands.map((b, j) => (j === i ? { ...b, ...patch } : b)) } : cur));
  const addBand = () => setS((cur) => (cur ? { ...cur, letterBands: [...cur.letterBands, { label: "", min: 0 }] } : cur));
  const removeBand = (i: number) => setS((cur) => (cur ? { ...cur, letterBands: cur.letterBands.filter((_, j) => j !== i) } : cur));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Grading settings</DialogTitle>
          <DialogDescription>Weight categories and the summative/formative split, and set letter-grade bands. Applies to this course.</DialogDescription>
        </DialogHeader>

        {!s ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-5">
            {/* Weighting */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Switch checked={s.weightingEnabled} onCheckedChange={(v) => upd({ weightingEnabled: v })} /> Use weighted grading
              </label>
              {s.weightingEnabled && (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Summative weight</Label>
                      <Input type="number" min={0} max={100} value={s.summativeWeight} onChange={(e) => upd({ summativeWeight: Number(e.target.value) })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Formative (practice) weight</Label>
                      <Input type="number" min={0} max={100} value={s.formativeWeight} onChange={(e) => upd({ formativeWeight: Number(e.target.value) })} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Relative weights — e.g. 70 / 30. Formative 0 = practice never counts.</p>
                  {categories.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Category weights</Label>
                      {categories.map((cat) => (
                        <div key={cat} className="flex items-center gap-2">
                          <span className="flex-1 truncate text-sm text-foreground">{cat}</span>
                          <Input type="number" min={0} className="w-24" value={s.categoryWeights[cat] ?? 1} onChange={(e) => setCatW(cat, Number(e.target.value))} />
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground">Relative weights across categories within each bucket. Blank/1 = equal.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Letters */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Switch checked={s.lettersEnabled} onCheckedChange={(v) => upd({ lettersEnabled: v })} /> Show letter grades
              </label>
              {s.lettersEnabled && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <span className="flex-1">Label</span>
                    <span className="w-28">Minimum %</span>
                    <span className="w-8" />
                  </div>
                  {s.letterBands.map((b, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input className="flex-1" value={b.label} placeholder="e.g. A or Competent" onChange={(e) => setBand(i, { label: e.target.value })} />
                      <Input type="number" min={0} max={100} className="w-28" value={b.min} onChange={(e) => setBand(i, { min: Number(e.target.value) })} />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeBand(i)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="gap-1" onClick={addBand}><Plus className="h-3.5 w-3.5" /> Add band</Button>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!s || save.isPending} onClick={() => s && save.mutate(s)}>{save.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
