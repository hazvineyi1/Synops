import React, { useMemo, useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { gradebookApi, type GradebookColumn, type GradebookMatrix, type MatrixLearner } from "@/lib/gradebookApi";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useSession } from "@/context/SessionContext";
import { ChevronRight, MessageSquare, Plus, RefreshCw, TrendingDown, TrendingUp, Minus, AlertTriangle, Mail } from "lucide-react";

const bandCell = (f: number | null) =>
  f === null
    ? "bg-muted text-muted-foreground"
    : f >= 0.9
      ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
      : f >= 0.7
        ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
        : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400";

const pillBand = (band: string) =>
  band === "good"
    ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300"
    : band === "warn"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
      : band === "low"
        ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
        : "bg-muted text-muted-foreground";

export function CourseGradebook() {
  const { courseId } = useParams<{ courseId: string }>();
  const qc = useQueryClient();
  const { user } = useSession();
  const [groupId, setGroupId] = useState<string>("");
  const [includeFormative, setIncludeFormative] = useState(false);

  const { data: course } = useQuery({ queryKey: ["course", courseId], queryFn: () => apiFetch<any>(`/courses/${courseId}`) });
  const groups = useQuery({
    queryKey: ["course-groups", courseId],
    queryFn: () => apiFetch<any[]>(`/courses/${courseId}/groups`),
    retry: false,
  });
  const { data, isLoading } = useQuery({
    queryKey: ["gradebook", courseId, groupId],
    queryFn: () => gradebookApi.matrix(courseId, groupId || null),
  });

  const scan = useMutation({
    mutationFn: () => gradebookApi.scan(courseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gradebook", courseId] }),
  });
  const writeCell = useMutation({
    mutationFn: (b: Parameters<typeof gradebookApi.writeCell>[1]) => gradebookApi.writeCell(courseId, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gradebook", courseId] }),
  });
  const addManual = useMutation({
    mutationFn: (b: { title: string; pointsPossible: number; itemType: "formative" | "summative"; category: string }) =>
      gradebookApi.createItem(courseId, { sourceType: "manual", ...b }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gradebook", courseId] }),
  });
  const testEmail = useMutation({
    mutationFn: () => gradebookApi.testEmail(),
    onSuccess: (r) =>
      window.alert(
        r.sent
          ? `Test email sent to ${r.to}. Check your inbox.`
          : r.configured
            ? "Email is configured but the send failed — check the Resend key and the EMAIL_FROM sender domain."
            : "Email isn't configured yet. Set RESEND_API_KEY and EMAIL_FROM in Railway, then try again.",
      ),
    onError: (e: any) => window.alert(e?.message ?? "Test failed"),
  });

  // Group columns by category, preserving order.
  const grouped = useMemo(() => {
    const cols = data?.columns ?? [];
    const out: { category: string; cols: GradebookColumn[] }[] = [];
    for (const c of cols) {
      const last = out[out.length - 1];
      if (last && last.category === c.category) last.cols.push(c);
      else out.push({ category: c.category, cols: [c] });
    }
    return out;
  }, [data]);

  const flatCols = data?.columns ?? [];

  // Client-side overall so the formative toggle updates instantly.
  function overallFor(l: MatrixLearner): { pct: number | null; band: string } {
    let earned = 0;
    let possible = 0;
    for (const c of flatCols) {
      if (!c.includeInGrade) continue;
      if (c.itemType === "formative" && !includeFormative) continue;
      const cell = l.cells[c.key];
      if (cell?.fraction == null) continue;
      earned += cell.fraction * c.pointsPossible;
      possible += c.pointsPossible;
    }
    if (possible === 0) return { pct: null, band: "none" };
    const pct = (earned / possible) * 100;
    return { pct, band: pct >= 90 ? "good" : pct >= 70 ? "warn" : "low" };
  }

  const classAvg = useMemo(() => {
    const vals = (data?.learners ?? []).map((l) => overallFor(l).pct).filter((v): v is number => v !== null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, includeFormative]);

  function editNote(l: MatrixLearner, c: GradebookColumn) {
    const current = l.cells[c.key]?.note ?? "";
    const note = window.prompt(`Feedback for ${l.user?.firstName ?? "learner"} on ${c.title}:`, current);
    if (note === null) return;
    writeCell.mutate({ userId: l.userId, sourceType: c.sourceType, sourceId: c.sourceId, itemId: c.itemId, note });
  }
  function editScore(l: MatrixLearner, c: GradebookColumn, raw: string) {
    const v = raw.trim();
    const score = v === "" ? null : Math.max(0, Math.min(c.pointsPossible, Number(v)));
    writeCell.mutate({ userId: l.userId, sourceType: c.sourceType, sourceId: c.sourceId, itemId: c.itemId, score });
  }
  function addManualItem() {
    const title = window.prompt("Item name:");
    if (!title) return;
    const pointsPossible = Number(window.prompt("Points possible:", "20")) || 20;
    const type = (window.prompt("Type: formative or summative?", "summative") || "summative").toLowerCase().startsWith("f")
      ? "formative"
      : "summative";
    const category = window.prompt("Learning target / category:", "General") || "General";
    addManual.mutate({ title, pointsPossible, itemType: type as "formative" | "summative", category });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <a href="/courses" className="hover:text-foreground">Courses</a>
        <ChevronRight className="h-4 w-4" />
        <a href={`/courses/${courseId}`} className="hover:text-foreground">{course?.title ?? "Course"}</a>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Gradebook</span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gradebook</h1>
          <p className="text-sm text-muted-foreground">{data?.learners.length ?? 0} learners · every assignment, case and activity in one place</p>
        </div>
        <div className="text-right">
          <div className={cn("text-3xl font-bold", classAvg == null ? "text-muted-foreground" : classAvg >= 70 ? "text-green-600" : "text-amber-600")}>
            {classAvg == null ? "—" : `${classAvg}%`}
          </div>
          <div className="text-xs text-muted-foreground">{includeFormative ? "Class average (practice + mastery)" : "Class mastery average"}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {groups.data && groups.data.length > 0 && (
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">All cohorts</option>
            {groups.data.map((g: any) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={includeFormative} onCheckedChange={setIncludeFormative} />
          Count practice (formative) work
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={addManualItem}>
            <Plus className="h-4 w-4" /> Manual item
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => scan.mutate()} disabled={scan.isPending}>
            <RefreshCw className={cn("h-4 w-4", scan.isPending && "animate-spin")} /> Check who's off track
          </Button>
          {user?.role === "super_admin" && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => testEmail.mutate()} disabled={testEmail.isPending}>
              <Mail className="h-4 w-4" /> Test email
            </Button>
          )}
        </div>
      </div>

      {scan.data && (
        <p className="text-sm text-muted-foreground">
          Checked {scan.data.evaluated} learners · {scan.data.offTrack} off track · {scan.data.alerted} newly alerted (plans generated).
        </p>
      )}

      {isLoading && <Skeleton className="h-64" />}

      {data && (
        <div className="overflow-x-auto rounded-xl border border-border bg-background">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th rowSpan={2} className="sticky left-0 z-10 min-w-[210px] border-b border-r border-border bg-background px-4 py-2 text-left align-bottom text-xs font-semibold text-muted-foreground">
                  Learner
                </th>
                {grouped.map((g, i) => (
                  <th key={i} colSpan={g.cols.length} className="border-b border-border px-3 pt-3 pb-1 text-left text-xs font-bold text-foreground">
                    {g.category}
                  </th>
                ))}
                <th rowSpan={2} className="border-b border-l border-border px-3 py-2 text-center align-bottom text-xs font-semibold text-muted-foreground">Overall</th>
              </tr>
              <tr>
                {flatCols.map((c) => (
                  <th key={c.key} className="min-w-[92px] border-b border-border px-3 pb-2 text-left align-bottom text-xs font-medium text-muted-foreground">
                    <div className="leading-tight text-foreground">{c.title}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground/70">
                      {c.pointsPossible} pts
                      <span className={cn("rounded px-1 py-px uppercase tracking-wide", c.itemType === "formative" ? "bg-muted" : "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300")}>
                        {c.itemType === "formative" ? "Form" : "Summ"}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.learners.map((l) => {
                const ov = overallFor(l);
                return (
                  <tr key={l.userId} className="border-b border-border/60 hover:bg-muted/20">
                    <td className="sticky left-0 z-10 border-r border-border bg-background px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">
                            {l.user?.firstName} {l.user?.lastName}
                            {l.alert.status === "off_track" && (
                              <span title={(l.alert.reasonLabels ?? l.alert.reasons).join("; ")}>
                                <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-red-600" />
                              </span>
                            )}
                            {l.alert.status === "at_risk" && (
                              <span title="At risk"><AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-amber-500" /></span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className={cn("rounded-full px-2 py-0.5 font-mono text-[11px]", pillBand(ov.band))}>
                              {ov.pct == null ? "no grades" : `${Math.round(ov.pct)}%`}
                            </span>
                            <TrendIcon dir={l.trend.dir} label={l.trend.label} />
                          </div>
                        </div>
                      </div>
                    </td>
                    {flatCols.map((c) => {
                      const cell = l.cells[c.key];
                      const f = cell?.fraction ?? null;
                      const display = f == null ? "" : String(Math.round((f * c.pointsPossible) * 10) / 10);
                      return (
                        <td key={c.key} className="px-2 py-1.5 text-center">
                          <div className="relative inline-flex items-center">
                            {c.editable ? (
                              <input
                                defaultValue={display}
                                key={display}
                                placeholder="—"
                                onBlur={(e) => { if (e.target.value !== display) editScore(l, c, e.target.value); }}
                                className={cn("h-8 w-[62px] rounded-md text-center font-mono text-[13px] outline-none focus:ring-2 focus:ring-ring", bandCell(f), c.itemType === "formative" && "opacity-60")}
                              />
                            ) : (
                              <span className={cn("inline-block h-8 w-[62px] rounded-md pt-1.5 font-mono text-[13px]", bandCell(f), c.itemType === "formative" && "opacity-60")}>
                                {f == null ? "—" : display}
                              </span>
                            )}
                            <button
                              onClick={() => editNote(l, c)}
                              title={cell?.note ? cell.note : "Add feedback"}
                              className={cn("absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border text-[8px]", cell?.note ? "border-transparent bg-sky-600 text-white" : "border-border bg-background text-muted-foreground")}
                            >
                              <MessageSquare className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </td>
                      );
                    })}
                    <td className="border-l border-border px-3 py-2 text-center">
                      <span className={cn("rounded px-2 py-0.5 text-sm font-bold", pillBand(ov.band))}>
                        {ov.pct == null ? "—" : `${Math.round(ov.pct)}%`}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {data.learners.length === 0 && (
                <tr><td colSpan={flatCols.length + 2} className="py-12 text-center text-muted-foreground">No learners enrolled yet.</td></tr>
              )}
              {flatCols.length === 0 && data.learners.length > 0 && (
                <tr><td colSpan={2} className="py-8 text-center text-sm text-muted-foreground">No gradebook columns yet. Add a manual item, or open a case/activity and choose “Add to gradebook”.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Mastery (90%+)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Approaching (70–89%)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Needs support (below 70%)</span>
        <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-red-600" /> Off track — a study plan has been generated and the learner + coach notified</span>
      </div>
    </div>
  );
}

function TrendIcon({ dir, label }: { dir: string; label: string }) {
  if (dir === "up") return <span title={label} className="flex items-center text-[11px] text-green-600"><TrendingUp className="h-3 w-3" /></span>;
  if (dir === "down") return <span title={label} className="flex items-center text-[11px] text-amber-600"><TrendingDown className="h-3 w-3" /></span>;
  if (dir === "flat") return <span title={label} className="flex items-center text-[11px] text-muted-foreground"><Minus className="h-3 w-3" /></span>;
  return null;
}
