import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/context/SessionContext";
import { casesApi, type CaseRow, type MyAssignmentRow } from "@/lib/casesApi";
import { CaseAssignDialog } from "@/components/CaseAssignDialog";
import { Plus, Play, Pencil, BookOpen, Layers, Share2, CalendarClock, Clock, CheckCircle2 } from "lucide-react";

const CAN_AUTHOR = ["super_admin", "instructional_designer", "org_admin", "partner_admin"];
// Roles that can distribute a case one tier down the chain (same set as authors).
const CAN_ASSIGN = CAN_AUTHOR;

const DIFFICULTY_BADGE: Record<string, string> = {
  foundational: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  intermediate: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  advanced: "bg-purple-500/15 text-purple-700 border-purple-500/30",
};

export function Cases() {
  const { user } = useSession();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canAuthor = !!user && CAN_AUTHOR.includes(user.role);
  const canAssign = !!user && CAN_ASSIGN.includes(user.role);
  const isLearner = user?.role === "learner";
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [assignFor, setAssignFor] = useState<{ id: string; title: string } | null>(null);

  const { data: cases, isLoading } = useQuery({
    queryKey: ["cases", filter],
    queryFn: () => casesApi.list(filter === "all" ? undefined : filter),
  });

  const create = useMutation({
    mutationFn: () => casesApi.create({ title: "Untitled case" }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ["cases"] }); navigate(`/cases/${c.id}/edit`); },
    onError: (e: Error) => toast({ title: "Could not create", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {assignFor && <CaseAssignDialog caseId={assignFor.id} caseTitle={assignFor.title} onClose={() => setAssignFor(null)} />}

      {isLearner && <MyAssignedCases />}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight">Case studies</h1>
          <p className="text-muted-foreground">Authored Socratic cases — work a real scenario through guided questioning, then get a reasoning analysis.</p>
        </div>
        {canAuthor && (
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="h-4 w-4 mr-2" /> New case
          </Button>
        )}
      </div>

      {canAuthor && (
        <div className="flex gap-1">
          {(["all", "published", "draft"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-md capitalize transition-colors ${filter === f ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : !cases?.length ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          <Layers className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p>No cases yet.</p>
          {canAuthor && <p className="text-sm mt-1">Create one to get started.</p>}
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cases.map((c: CaseRow) => (
            <Card key={c.id} className="flex flex-col">
              <CardContent className="pt-5 flex flex-col flex-1 gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-snug">{c.title}</h3>
                  {c.status === "draft" && <Badge variant="outline" className="shrink-0">Draft</Badge>}
                </div>
                {c.learningObjective && <p className="text-sm text-muted-foreground line-clamp-2">{c.learningObjective}</p>}
                <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${DIFFICULTY_BADGE[c.difficulty] ?? ""}`}>{c.difficulty}</span>
                  {c.isLibrary && <span className="text-xs px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-700 border-blue-500/30 inline-flex items-center gap-1"><BookOpen className="h-3 w-3" /> Library</span>}
                  <span className="text-xs px-2 py-0.5 rounded-full border bg-muted text-muted-foreground">{c.promptLimit} prompts</span>
                </div>
                <div className="flex gap-2 pt-2">
                  {c.status === "published" && (
                    <Button size="sm" className="flex-1" onClick={() => navigate(`/cases/${c.id}/begin`)}>
                      <Play className="h-4 w-4 mr-1.5" /> Start
                    </Button>
                  )}
                  {canAuthor && (
                    <Link href={`/cases/${c.id}/edit`} className={c.status === "published" ? "" : "flex-1"}>
                      <Button size="sm" variant="outline" className="w-full">
                        <Pencil className="h-4 w-4 mr-1.5" /> {c.status === "published" ? "Edit" : "Edit draft"}
                      </Button>
                    </Link>
                  )}
                  {canAssign && c.status === "published" && (
                    <Button size="sm" variant="outline" onClick={() => setAssignFor({ id: c.id, title: c.title })} title="Assign to partners / orgs / learners">
                      <Share2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** Learner's "Assigned to me" strip: cases pushed down the chain, with due date + progress. */
function MyAssignedCases() {
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery({ queryKey: ["my-case-assignments"], queryFn: () => casesApi.myAssignments() });
  const rows = (data ?? []).filter((a) => a.caseStatus === "published");
  if (isLoading) return <Skeleton className="h-28 rounded-xl" />;
  if (!rows.length) return null;

  const dueLabel = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso); const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
    if (days < 0) return { text: `Overdue by ${Math.abs(days)}d`, cls: "text-rose-700" };
    if (days === 0) return { text: "Due today", cls: "text-amber-700" };
    if (days <= 3) return { text: `Due in ${days}d`, cls: "text-amber-700" };
    return { text: `Due ${d.toLocaleDateString()}`, cls: "text-muted-foreground" };
  };
  const statusPill = (s: string) =>
    s === "completed" ? { text: "Completed", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", Icon: CheckCircle2 }
    : s === "in_progress" ? { text: "In progress", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30", Icon: Clock }
    : { text: "Not started", cls: "bg-slate-500/15 text-slate-700 border-slate-500/30", Icon: Play };

  return (
    <div className="rounded-xl border bg-[hsl(222_47%_20%)] text-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className="h-4 w-4" />
        <h2 className="font-semibold">Assigned to you</h2>
        <span className="text-xs opacity-70">{rows.length}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((a: MyAssignmentRow) => {
          const due = dueLabel(a.dueDate);
          const st = statusPill(a.status);
          return (
            <div key={a.id} className="rounded-lg bg-white text-foreground p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold leading-snug text-sm">{a.caseTitle}</h3>
                <span className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1 ${st.cls}`}><st.Icon className="h-3 w-3" />{st.text}</span>
              </div>
              {a.learningObjective && <p className="text-xs text-muted-foreground line-clamp-2">{a.learningObjective}</p>}
              <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                {due ? <span className={`text-[11px] font-medium ${due.cls}`}>{due.text}</span> : <span />}
                <Button size="sm" onClick={() => navigate(`/cases/${a.caseId}/begin`)}>
                  {a.status === "completed" ? "Revisit" : a.status === "in_progress" ? "Continue" : "Start"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
