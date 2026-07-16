import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/context/SessionContext";
import { casesApi, type CaseRow } from "@/lib/casesApi";
import { Plus, Play, Pencil, BookOpen, Layers } from "lucide-react";

const CAN_AUTHOR = ["super_admin", "instructional_designer", "org_admin", "partner_admin"];

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
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");

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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
