import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Building2, GraduationCap, ChevronRight, Users, Layers, BookOpen, AlertTriangle } from "lucide-react";

type Kind = "partners" | "organisations" | "courses" | "none";
interface Level { kind: Kind; label: string; partnerId?: string; organisationId?: string }

interface Health { learnersEvaluated: number; offTrack: number; atRisk: number; avgMastery: number | null }
interface PartnerRow extends Health { id: string; name: string; orgCount: number }
interface OrgRow extends Health { id: string; name: string; partnerId: string }
interface CourseRow extends Health { id: string; title: string; status: string; learnerCount: number; cohorts: { id: string; name: string }[] }

export function GradebookBrowser() {
  const nav = useQuery({
    queryKey: ["gb-nav"],
    queryFn: () => apiFetch<{ level: Kind; partnerId?: string | null; organisationId?: string | null }>("/gradebook/nav"),
  });
  const [stack, setStack] = useState<Level[]>([]);

  useEffect(() => {
    if (!nav.data || stack.length) return;
    if (nav.data.level === "partners") setStack([{ kind: "partners", label: "All partners" }]);
    else if (nav.data.level === "organisations") setStack([{ kind: "organisations", label: "Organisations", partnerId: nav.data.partnerId ?? undefined }]);
    else if (nav.data.level === "courses") setStack([{ kind: "courses", label: "Courses", organisationId: nav.data.organisationId ?? undefined }]);
    else setStack([{ kind: "none", label: "" }]);
  }, [nav.data, stack.length]);

  const top = stack[stack.length - 1];

  const data = useQuery<PartnerRow[] | OrgRow[] | CourseRow[]>({
    queryKey: ["gb-browse", top?.kind, top?.partnerId, top?.organisationId],
    enabled: !!top && top.kind !== "none",
    queryFn: () => {
      if (top.kind === "partners") return apiFetch<PartnerRow[]>("/gradebook/nav/partners");
      if (top.kind === "organisations") return apiFetch<OrgRow[]>(`/gradebook/nav/organisations${top.partnerId ? `?partnerId=${top.partnerId}` : ""}`);
      return apiFetch<CourseRow[]>(`/gradebook/nav/courses${top.organisationId ? `?organisationId=${top.organisationId}` : ""}`);
    },
  });

  const push = (lvl: Level) => setStack((s) => [...s, lvl]);
  const goto = (i: number) => setStack((s) => s.slice(0, i + 1));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gradebook</h1>
        <p className="text-sm text-muted-foreground">Browse to a course to see every learner's assignments, cases and activities in one place.</p>
      </div>

      {stack.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {stack.map((l, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <button
                onClick={() => goto(i)}
                className={cn("rounded px-1.5 py-0.5", i === stack.length - 1 ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {l.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {(nav.isLoading || data.isLoading) && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>}

      {top?.kind === "none" && <p className="text-muted-foreground">You don't have gradebook access. Learners can see their own grades under “My grades”.</p>}

      {data.data && top?.kind === "partners" && (
        <Grid>
          {(data.data as PartnerRow[]).map((p) => (
            <Card key={p.id} onClick={() => push({ kind: "organisations", label: p.name, partnerId: p.id })} icon={<Building2 className="h-5 w-5 text-primary" />} title={p.name} sub={`${p.orgCount} organisation${p.orgCount === 1 ? "" : "s"}`} footer={<HealthLine r={p} />} chevron />
          ))}
          {(data.data as PartnerRow[]).length === 0 && <Empty>No partners yet.</Empty>}
        </Grid>
      )}

      {data.data && top?.kind === "organisations" && (
        <Grid>
          {(data.data as OrgRow[]).map((o) => (
            <Card key={o.id} onClick={() => push({ kind: "courses", label: o.name, organisationId: o.id })} icon={<Building2 className="h-5 w-5 text-primary" />} title={o.name} footer={<HealthLine r={o} />} chevron />
          ))}
          {(data.data as OrgRow[]).length === 0 && <Empty>No organisations in scope.</Empty>}
        </Grid>
      )}

      {data.data && top?.kind === "courses" && (
        <Grid>
          {(data.data as CourseRow[]).map((c) => (
            <a key={c.id} href={`/courses/${c.id}/gradebook`} className="block">
              <div className="h-full rounded-xl border border-border bg-background p-4 transition hover:border-primary/40">
                <div className="flex items-start gap-3">
                  <GraduationCap className="mt-0.5 h-5 w-5 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">{c.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {c.learnerCount} learner{c.learnerCount === 1 ? "" : "s"}</span>
                      {c.cohorts.length > 0 && <span className="flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> {c.cohorts.length} cohort{c.cohorts.length === 1 ? "" : "s"}</span>}
                      {c.status !== "published" && <span className="rounded bg-muted px-1.5 py-0.5 uppercase">{c.status}</span>}
                    </div>
                    <HealthLine r={c} />
                  </div>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </a>
          ))}
          {(data.data as CourseRow[]).length === 0 && <Empty>No courses in scope yet.</Empty>}
        </Grid>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{children}</div>;
}
function Card({ icon, title, sub, onClick, chevron, footer }: { icon: React.ReactNode; title: string; sub?: string; onClick?: () => void; chevron?: boolean; footer?: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex h-full items-start gap-3 rounded-xl border border-border bg-background p-4 text-left transition hover:border-primary/40">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground">{title}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
        {footer}
      </div>
      {chevron && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}

function HealthLine({ r }: { r: { avgMastery: number | null; offTrack: number; learnersEvaluated: number } }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
      <span className={cn("rounded-full px-2 py-0.5 font-mono", r.avgMastery == null ? "bg-muted text-muted-foreground" : r.avgMastery >= 70 ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300")}>
        {r.avgMastery == null ? "no data" : `${r.avgMastery}% avg`}
      </span>
      {r.offTrack > 0 && (
        <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-red-800 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="h-3 w-3" /> {r.offTrack} off track
        </span>
      )}
      {r.learnersEvaluated > 0 && <span className="text-muted-foreground">{r.learnersEvaluated} evaluated</span>}
    </div>
  );
}
