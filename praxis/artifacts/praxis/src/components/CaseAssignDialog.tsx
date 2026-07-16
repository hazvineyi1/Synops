import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { casesApi, type AssignTier, type CaseAssignmentRow } from "@/lib/casesApi";
import { X, Users, Building2, GraduationCap, Layers, Check, Trash2, CalendarClock } from "lucide-react";

const TIER_COPY: Record<AssignTier, { noun: string; verb: string; icon: React.ComponentType<{ className?: string }> }> = {
  partner: { noun: "partners", verb: "Assign to partners", icon: Building2 },
  organisation: { noun: "organisations", verb: "Assign to organisations", icon: Building2 },
  learner: { noun: "learners", verb: "Assign to learners", icon: GraduationCap },
};

const STATUS_BADGE: Record<string, string> = {
  assigned: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  in_progress: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  completed: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  revoked: "bg-rose-500/10 text-rose-700 border-rose-500/30",
};

/**
 * Assign a case one tier down the distribution chain. The API decides the actor's tier
 * (Hub -> partners, partner_admin -> orgs, org_admin -> learners) and returns the eligible
 * targets; this dialog just renders whatever tier came back.
 */
export function CaseAssignDialog({ caseId, caseTitle, onClose }: { caseId: string; caseTitle: string; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string>("");

  const targetsQ = useQuery({ queryKey: ["assign-targets", caseId], queryFn: () => casesApi.assignTargets(caseId) });
  const assignmentsQ = useQuery({ queryKey: ["assignments", caseId], queryFn: () => casesApi.caseAssignments(caseId) });

  const tier = targetsQ.data?.tier;
  const copy = tier ? TIER_COPY[tier] : null;

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const assign = useMutation({
    mutationFn: () => casesApi.assign(caseId, {
      targetIds: [...selected],
      groupId: group ?? undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["assignments", caseId] });
      qc.invalidateQueries({ queryKey: ["assign-targets", caseId] });
      setSelected(new Set()); setGroup(null);
      toast({ title: r.created ? `Assigned to ${r.created} ${copy?.noun ?? "recipients"}` : "Nothing new to assign", description: r.skipped ? `${r.skipped} already had it.` : undefined });
    },
    onError: (e: Error) => toast({ title: "Could not assign", description: e.message, variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => casesApi.revokeAssignment(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assignments", caseId] }); qc.invalidateQueries({ queryKey: ["assign-targets", caseId] }); },
    onError: (e: Error) => toast({ title: "Could not revoke", description: e.message, variant: "destructive" }),
  });

  const activeAssignments = useMemo(() => (assignmentsQ.data ?? []).filter((a) => a.status !== "revoked"), [assignmentsQ.data]);
  const nothingSelected = selected.size === 0 && !group;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-auto rounded-xl bg-white shadow-xl border">
        <div className="sticky top-0 bg-white border-b px-5 py-3.5 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Assign case</p>
            <h2 className="font-semibold truncate">{caseTitle}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-5">
          {targetsQ.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-md" />)}</div>
          ) : !tier || !copy ? (
            <p className="text-sm text-muted-foreground">Your role cannot assign this case.</p>
          ) : (
            <>
              <div>
                <div className="flex items-center gap-1.5 mb-2 text-sm font-medium"><copy.icon className="h-4 w-4" /> Choose {copy.noun}</div>
                {(targetsQ.data?.targets.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
                    {tier === "organisation" ? "No organisations under your partner yet." : tier === "learner" ? "No learners in your organisation yet." : "No partners yet."}
                  </p>
                ) : (
                  <div className="space-y-1 max-h-52 overflow-auto rounded-md border p-1">
                    {targetsQ.data!.targets.map((t) => (
                      <label key={t.id} className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm ${t.alreadyAssigned ? "opacity-55" : "hover:bg-muted cursor-pointer"}`}>
                        <input type="checkbox" disabled={t.alreadyAssigned} checked={t.alreadyAssigned || selected.has(t.id)} onChange={() => toggle(t.id)} />
                        <span className="flex-1 truncate">{t.name}</span>
                        {t.alreadyAssigned && <span className="text-[11px] text-emerald-700 inline-flex items-center gap-0.5"><Check className="h-3 w-3" /> assigned</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {tier === "learner" && (targetsQ.data?.groups.length ?? 0) > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-sm font-medium"><Layers className="h-4 w-4" /> Or a whole cohort</div>
                  <div className="flex flex-wrap gap-1.5">
                    {targetsQ.data!.groups.map((g) => (
                      <button key={g.id} onClick={() => setGroup((cur) => cur === g.id ? null : g.id)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${group === g.id ? "bg-[hsl(222_47%_20%)] text-white border-transparent" : "hover:bg-muted"}`}>
                        {g.name}{g.courseTitle ? ` · ${g.courseTitle}` : ""} ({g.memberCount})
                      </button>
                    ))}
                  </div>
                  {group && <p className="text-[11px] text-muted-foreground mt-1.5">Every current member of this cohort gets the case.</p>}
                </div>
              )}

              <label className="block text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1"><CalendarClock className="h-3.5 w-3.5" /> Due date (optional)</span>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </label>

              <Button className="w-full" disabled={nothingSelected || assign.isPending} onClick={() => assign.mutate()}>
                {assign.isPending ? "Assigning…" : copy.verb}
              </Button>
            </>
          )}

          {/* Current grants */}
          <div className="pt-1">
            <div className="flex items-center gap-1.5 mb-2 text-sm font-medium"><Users className="h-4 w-4" /> Current assignments</div>
            {assignmentsQ.isLoading ? (
              <Skeleton className="h-8 rounded-md" />
            ) : activeAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not assigned to anyone yet.</p>
            ) : (
              <div className="space-y-1.5">
                {activeAssignments.map((a: CaseAssignmentRow) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm rounded-md border px-2.5 py-1.5">
                    <span className="flex-1 truncate">{a.targetName ?? a.tier}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{a.tier}</span>
                    {a.dueDate && <span className="text-[11px] text-muted-foreground">due {new Date(a.dueDate).toLocaleDateString()}</span>}
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full border capitalize ${STATUS_BADGE[a.status] ?? ""}`}>{a.status.replace("_", " ")}</span>
                    <button onClick={() => revoke.mutate(a.id)} disabled={revoke.isPending} title="Revoke" className="p-1 rounded hover:bg-rose-500/10 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
