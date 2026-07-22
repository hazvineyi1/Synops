import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { gradebookApi, type GradebookColumn, type GradeType, type SourceType } from "@/lib/gradebookApi";
import { SlidersHorizontal } from "lucide-react";

interface OrgLite { id: string; name: string; partnerId: string | null }

type Row = {
  key: string;
  title: string;
  category: string;
  sourceType: SourceType;
  sourceId: string | null;
  itemId: string | null;
  gradeType: GradeType;
  itemType: "formative" | "summative";
  pointsPossible: number;
  includeInGrade: boolean;
};

const toRows = (cols: GradebookColumn[]): Row[] =>
  cols.map((c) => ({
    key: c.key, title: c.title, category: c.category, sourceType: c.sourceType, sourceId: c.sourceId, itemId: c.itemId,
    gradeType: (c.gradeType as GradeType) ?? "points", itemType: c.itemType, pointsPossible: c.pointsPossible, includeInGrade: c.includeInGrade,
  }));

/**
 * Configure how each deliverable in a course is graded — grade type (points / pass-fail / completion),
 * counts vs practice, points, and whether it is included. "Applies to" chooses the scope: the course
 * default (gradebook_items) or one organisation's override (gradebook_org_overrides). Writes through
 * PUT /courses/:id/gradebook/config.
 */
export function GradebookConfigDialog({
  courseId,
  columns,
  open,
  onOpenChange,
}: {
  courseId: string;
  columns: GradebookColumn[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<string>(""); // "" = course default, else orgId

  const orgsQ = useQuery({ queryKey: ["organisations"], queryFn: () => apiFetch<OrgLite[]>("/organisations"), enabled: open });
  // Effective columns for the selected scope (course default uses the passed columns).
  const scopedQ = useQuery({
    queryKey: ["gb-config-cols", courseId, scope],
    queryFn: () => gradebookApi.matrix(courseId, null, scope),
    enabled: open && !!scope,
  });
  const effCols = scope ? (scopedQ.data?.columns ?? []) : columns;

  const initial = useMemo(() => toRows(effCols), [effCols]);
  const [rows, setRows] = useState<Row[]>(initial);
  useEffect(() => { setRows(initial); }, [initial]);
  useEffect(() => { if (open) setScope(""); }, [open]);

  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = useMutation({
    mutationFn: async () => {
      const changed = rows.filter((r) => {
        const o = initial.find((x) => x.key === r.key);
        return !o || o.gradeType !== r.gradeType || o.itemType !== r.itemType || o.pointsPossible !== r.pointsPossible || o.includeInGrade !== r.includeInGrade;
      });
      for (const r of changed) {
        await gradebookApi.configColumn(courseId, {
          sourceType: r.sourceType, sourceId: r.sourceId, itemId: r.itemId,
          gradeType: r.gradeType, itemType: r.itemType, pointsPossible: r.pointsPossible, includeInGrade: r.includeInGrade,
          orgId: scope || undefined,
        });
      }
      return changed.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gradebook", courseId] });
      qc.invalidateQueries({ queryKey: ["gb-config-cols", courseId] });
      onOpenChange(false);
    },
  });

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) { (m.get(r.category) ?? m.set(r.category, []).get(r.category)!).push(r); }
    return [...m.entries()];
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /> Configure grading</DialogTitle>
          <DialogDescription>Set how each deliverable is graded. Points shows X/Y, Pass/Fail marks a threshold, Completion shows a %. “Counts” includes it in the overall grade; “Practice” is shown but not counted.</DialogDescription>
        </DialogHeader>

        <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span className="font-medium">Applies to:</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Course default (everywhere)</option>
            {(orgsQ.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name} (override)</option>)}
          </select>
          {scope && <span className="text-xs text-muted-foreground">Only this organisation’s learners are affected. Blank fields inherit the course default.</span>}
        </div>

        {scope && scopedQ.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading this organisation’s configuration…</div>
        ) : (
          <div className="space-y-4">
            {groups.map(([cat, grp]) => (
              <div key={cat}>
                <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{cat}</div>
                <div className="rounded-lg border border-border divide-y divide-border">
                  {grp.map((r) => (
                    <div key={r.key} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0 truncate font-medium" title={r.title}>{r.title}</div>
                      <select value={r.gradeType} onChange={(e) => set(r.key, { gradeType: e.target.value as GradeType })} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                        <option value="points">Points</option>
                        <option value="pass_fail">Pass/Fail</option>
                        <option value="completion">Completion %</option>
                      </select>
                      <select value={r.itemType} onChange={(e) => set(r.key, { itemType: e.target.value as "formative" | "summative" })} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                        <option value="summative">Counts</option>
                        <option value="formative">Practice</option>
                      </select>
                      <input type="number" min={0} value={r.pointsPossible} onChange={(e) => set(r.key, { pointsPossible: Number(e.target.value) })} disabled={r.gradeType !== "points"} className="h-8 w-16 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-40" title="Points possible (Points type only)" />
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Include in the overall grade">
                        <input type="checkbox" checked={r.includeInGrade} onChange={(e) => set(r.key, { includeInGrade: e.target.checked })} /> incl.
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {rows.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">No columns yet. Use “Sync activities” first to pull in every deliverable.</div>}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : scope ? "Save override" : "Save configuration"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
