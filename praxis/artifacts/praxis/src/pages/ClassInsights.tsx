import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, TrendingUp, Trophy, AlertTriangle, Activity, GraduationCap, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

interface ClassRow { id: string; name: string; orgId: string; learnerCount: number }
interface LearnerInsight {
  userId: string; name: string; email: string; progressPct: number; avgScore: number | null;
  activitiesDone: number; attempts: number; lastActiveAt: string | null;
  status: "on_track" | "at_risk" | "off_track"; reasons: string[];
}
interface Insights {
  className?: string; learnerCount: number; courseCount: number;
  summary: { onTrack: number; atRisk: number; offTrack: number; avgProgress: number; avgScore: number | null; activitiesCompleted: number; participationPct: number };
  topGames: { activityId: string; title: string; kind: string; plays: number; avgScore: number | null }[];
  learners: LearnerInsight[];
}

const STATUS = {
  on_track: { label: "On track", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", dot: "bg-emerald-500" },
  at_risk: { label: "At risk", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30", dot: "bg-amber-500" },
  off_track: { label: "Off track", cls: "bg-red-500/15 text-red-700 border-red-500/30", dot: "bg-red-500" },
} as const;

function Bar({ pct, color = "bg-indigo-500" }: { pct: number; color?: string }) {
  return <div className="h-2 rounded-full bg-muted overflow-hidden w-full"><div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
}
function ago(iso: string | null): string {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`;
}

export function ClassInsights() {
  const { data: classes, isLoading: loadingClasses } = useQuery({ queryKey: ["my-classes"], queryFn: () => apiFetch<ClassRow[]>("/my-classes") });
  const [classId, setClassId] = useState("");
  useEffect(() => { if (!classId && classes && classes.length) setClassId(classes[0].id); }, [classes, classId]);
  const { data, isLoading } = useQuery({ queryKey: ["class-insights", classId], queryFn: () => apiFetch<Insights>(`/classes/${classId}/insights`), enabled: !!classId });

  const attention = (data?.learners ?? []).filter((l) => l.status !== "on_track");

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight">Class insights</h1>
          <p className="text-muted-foreground">How your learners are doing across their lessons and games — at a glance, with who needs a nudge.</p>
        </div>
        {(classes?.length ?? 0) > 0 && (
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
            {(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.learnerCount})</option>)}
          </select>
        )}
      </div>

      {loadingClasses ? (
        <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center"><Loader2 className="h-5 w-5 animate-spin" /> Loading classes…</div>
      ) : (classes?.length ?? 0) === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">No classes yet. Once a class has learners and courses, its insights show up here.</Card>
      ) : isLoading || !data ? (
        <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center"><Loader2 className="h-5 w-5 animate-spin" /> Crunching the numbers…</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" /> Learners</div>
              <div className="text-3xl font-bold mt-1">{data.learnerCount}</div>
              <div className="text-xs text-muted-foreground mt-1">{data.summary.participationPct}% have played something</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="h-4 w-4" /> Avg lesson progress</div>
              <div className="text-3xl font-bold mt-1">{data.summary.avgProgress}%</div>
              <div className="mt-2"><Bar pct={data.summary.avgProgress} /></div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><GraduationCap className="h-4 w-4" /> Avg game score</div>
              <div className="text-3xl font-bold mt-1">{data.summary.avgScore == null ? "—" : `${data.summary.avgScore}%`}</div>
              <div className="text-xs text-muted-foreground mt-1">{data.summary.activitiesCompleted} activities completed</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Activity className="h-4 w-4" /> Status</div>
              <div className="flex gap-3 mt-2 text-sm">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> {data.summary.onTrack}</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> {data.summary.atRisk}</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> {data.summary.offTrack}</span>
              </div>
              <div className="flex mt-2 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500" style={{ width: `${pctOf(data.summary.onTrack, data.learnerCount)}%` }} />
                <div className="bg-amber-500" style={{ width: `${pctOf(data.summary.atRisk, data.learnerCount)}%` }} />
                <div className="bg-red-500" style={{ width: `${pctOf(data.summary.offTrack, data.learnerCount)}%` }} />
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Needs attention */}
            <Card className="p-4 lg:col-span-1">
              <div className="flex items-center gap-2 font-semibold mb-3"><AlertTriangle className="h-4 w-4 text-amber-500" /> Needs attention</div>
              {attention.length === 0 ? (
                <p className="text-sm text-muted-foreground">Everyone's on track. 🎉</p>
              ) : (
                <ul className="space-y-2">
                  {attention.map((l) => (
                    <li key={l.userId} className="rounded-lg border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{l.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS[l.status].cls}`}>{STATUS[l.status].label}</span>
                      </div>
                      {l.reasons.length > 0 && <div className="text-xs text-muted-foreground mt-1">{l.reasons.join(" · ")}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Roster table */}
            <Card className="p-0 lg:col-span-2 overflow-hidden">
              <div className="px-4 py-3 border-b font-semibold text-sm">All learners</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="px-4 py-2 font-medium">Learner</th>
                      <th className="px-3 py-2 font-medium w-40">Progress</th>
                      <th className="px-3 py-2 font-medium">Score</th>
                      <th className="px-3 py-2 font-medium">Games</th>
                      <th className="px-3 py-2 font-medium">Last active</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.learners.map((l) => (
                      <tr key={l.userId} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5"><div className="font-medium">{l.name}</div><div className="text-[11px] text-muted-foreground">{l.email}</div></td>
                        <td className="px-3 py-2.5"><div className="flex items-center gap-2"><Bar pct={l.progressPct} /><span className="text-xs tabular-nums w-9 text-right">{l.progressPct}%</span></div></td>
                        <td className="px-3 py-2.5 tabular-nums">{l.avgScore == null ? "—" : `${l.avgScore}%`}</td>
                        <td className="px-3 py-2.5 tabular-nums">{l.activitiesDone}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{ago(l.lastActiveAt)}</td>
                        <td className="px-3 py-2.5"><span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${STATUS[l.status].cls}`}><span className={`h-1.5 w-1.5 rounded-full ${STATUS[l.status].dot}`} />{STATUS[l.status].label}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Top games */}
          {data.topGames.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-2 font-semibold mb-3"><Trophy className="h-4 w-4 text-amber-500" /> Most-played activities</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.topGames.map((g) => (
                  <div key={g.activityId} className="rounded-lg border p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0"><div className="font-medium text-sm truncate">{g.title}</div><div className="text-[11px] text-muted-foreground capitalize">{g.kind.replace("-", " ")}</div></div>
                    <div className="text-right shrink-0"><div className="text-sm font-bold">{g.plays} plays</div>{g.avgScore != null && <div className="text-[11px] text-muted-foreground">avg {g.avgScore}%</div>}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function pctOf(n: number, total: number): number { return total > 0 ? (n / total) * 100 : 0; }
