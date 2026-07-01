import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  AdminStats,
  AdminEngagement,
  AdminProduct,
  AdminAiUsage,
  AdminPilots,
  AdminPilot,
  AdminDigest,
  PendingTeacher,
  PilotStatus,
  WaitlistEntry,
  Teacher,
  Student,
} from "@/lib/types";

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="border rounded-lg bg-card p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-serif text-3xl text-primary mt-1">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );
}

function fmtUsd(v: number): string {
  if (v >= 100) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
}

function fmtNum(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

function Bar({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-3 bg-muted rounded">
      <div className="h-full rounded" style={{ width: `${pct}%`, background: color ?? "var(--primary)" }} />
    </div>
  );
}

function statusColor(s: string): string {
  switch (s) {
    case "new": return "bg-blue-100 text-blue-800";
    case "contacted": return "bg-amber-100 text-amber-800";
    case "scheduled": return "bg-purple-100 text-purple-800";
    case "in_pilot": return "bg-teal-100 text-teal-800";
    case "won": return "bg-green-100 text-green-800";
    case "lost": return "bg-rose-100 text-rose-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

const PILOT_STATUSES: PilotStatus[] = ["new", "contacted", "scheduled", "in_pilot", "won", "lost"];

export default function Admin() {
  const { teacher, loading: authLoading, impersonator, impersonateTeacher, impersonateStudent, stopImpersonating } = useAuth();
  const [, setLoc] = useLocation();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [digest, setDigest] = useState<AdminDigest | null>(null);
  const [engagement, setEngagement] = useState<AdminEngagement | null>(null);
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [aiUsage, setAiUsage] = useState<AdminAiUsage | null>(null);
  const [pilots, setPilots] = useState<AdminPilots | null>(null);
  const [pilotFilter, setPilotFilter] = useState<string>("all");
  const [pending, setPending] = useState<PendingTeacher[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!teacher) {
      setLoc("/login");
      return;
    }
    if (!teacher?.isAdmin) {
      setError("This page is for the founder admin account only.");
      setLoading(false);
      return;
    }
    Promise.all([
      api.get<AdminStats>("/admin/stats"),
      api.get<AdminDigest>("/admin/digest"),
      api.get<AdminEngagement>("/admin/engagement"),
      api.get<AdminProduct>("/admin/product"),
      api.get<AdminAiUsage>("/admin/ai-usage"),
      api.get<AdminPilots>("/admin/pilots"),
      api.get<{ pending: PendingTeacher[] }>("/admin/pending-teachers"),
      api.get<{ waitlist: WaitlistEntry[] }>("/admin/waitlist"),
      api.get<{ students: Student[] }>("/admin/students"),
    ])
      .then(([s, d, e, p, a, pl, pt, wl, st]) => {
        setStats(s);
        setDigest(d);
        setEngagement(e);
        setProduct(p);
        setAiUsage(a);
        setPilots(pl);
        setPending(pt.pending);
        setWaitlist(wl.waitlist);
        setStudents(st.students);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [teacher, authLoading, setLoc]);

  async function reloadPilots(status: string) {
    const path = status === "all" ? "/admin/pilots" : `/admin/pilots?status=${encodeURIComponent(status)}`;
    const r = await api.get<AdminPilots>(path);
    setPilots(r);
  }

  async function updatePilot(id: string, patch: { status?: PilotStatus; notes?: string | null }) {
    await api.patch(`/admin/pilots/${id}`, patch);
    await reloadPilots(pilotFilter);
  }

  async function reloadPending() {
    const r = await api.get<{ pending: PendingTeacher[] }>("/admin/pending-teachers");
    setPending(r.pending);
  }

  async function approveTeacher(id: string) {
    await api.post(`/admin/teachers/${id}/approve`);
    await reloadPending();
  }

  async function suspendTeacher(id: string) {
    await api.post(`/admin/teachers/${id}/suspend`);
    await reloadPending();
  }

  async function mintResetLink(id: string): Promise<{ token: string; email: string; expiresAt: string }> {
    return api.post<{ token: string; email: string; expiresAt: string }>(`/admin/teachers/${id}/reset-link`);
  }

  async function reloadWaitlist() {
    const r = await api.get<{ waitlist: WaitlistEntry[] }>("/admin/waitlist");
    setWaitlist(r.waitlist);
  }
  async function markWaitlistFulfilled(id: string) {
    await api.post(`/admin/waitlist/${id}/fulfilled`);
    await reloadWaitlist();
  }
  async function unmarkWaitlistFulfilled(id: string) {
    await api.del(`/admin/waitlist/${id}/fulfilled`);
    await reloadWaitlist();
  }

  const openWaitlistCount = waitlist.filter((w) => !w.fulfilledAt).length;

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {impersonator ? (
          <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-amber-800">
              <strong>Impersonation active:</strong> You are viewing as <strong>{teacher?.name}</strong> ({teacher?.email})
            </div>
            <Button size="sm" variant="outline" onClick={() => { void stopImpersonating(); window.location.reload(); }}>
              Stop impersonating
            </Button>
          </div>
        ) : null}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serif text-3xl md:text-4xl text-primary">Founder dashboard</h1>
            <p className="text-muted-foreground mt-2">
              Engagement, product use, AI cost, and pilot pipeline at a glance.
            </p>
          </div>
          <div className="flex gap-2">
            <a href="/api/copilot/admin/export/pilots.csv" className="text-sm underline text-primary" data-track="admin_export" data-track-kind="pilots">
              Export pilots CSV
            </a>
            <a href="/api/copilot/admin/export/teachers.csv" className="text-sm underline text-primary" data-track="admin_export" data-track-kind="teachers">
              Export teachers CSV
            </a>
            <a href="/api/copilot/admin/export/events.csv" className="text-sm underline text-primary" data-track="admin_export" data-track-kind="events">
              Export events CSV
            </a>
            <a href="/api/copilot/admin/export/ai-usage.csv" className="text-sm underline text-primary" data-track="admin_export" data-track-kind="ai_usage">
              Export AI usage CSV
            </a>
          </div>
        </div>

        {error ? <div className="mt-8 p-4 border rounded bg-rose-50 text-rose-800">{error}</div> : null}
        {loading ? <div className="mt-8 text-muted-foreground">Loading founder analytics.</div> : null}

        {!loading && stats ? (
          <Tabs defaultValue="digest" className="mt-8">
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="digest" data-track="admin_tab" data-track-tab="digest">Digest</TabsTrigger>
              <TabsTrigger value="overview" data-track="admin_tab" data-track-tab="overview">Overview</TabsTrigger>
              <TabsTrigger value="engagement" data-track="admin_tab" data-track-tab="engagement">Engagement</TabsTrigger>
              <TabsTrigger value="product" data-track="admin_tab" data-track-tab="product">Product</TabsTrigger>
              <TabsTrigger value="ai" data-track="admin_tab" data-track-tab="ai">AI usage</TabsTrigger>
              <TabsTrigger value="pilots" data-track="admin_tab" data-track-tab="pilots">Pilots</TabsTrigger>
              <TabsTrigger value="approvals" data-track="admin_tab" data-track-tab="approvals">
                Approvals{pending.length > 0 ? ` (${pending.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="waitlist" data-track="admin_tab" data-track-tab="waitlist">
                Waitlist{openWaitlistCount > 0 ? ` (${openWaitlistCount})` : ""}
              </TabsTrigger>
              <TabsTrigger value="students" data-track="admin_tab" data-track-tab="students">
                Students{students.length > 0 ? ` (${students.length})` : ""}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="digest" className="mt-6">
              {digest ? <DigestTab data={digest} /> : null}
            </TabsContent>

            <TabsContent value="overview" className="mt-6">
              <OverviewTab stats={stats} />
            </TabsContent>

            <TabsContent value="engagement" className="mt-6">
              {engagement ? <EngagementTab data={engagement} onImpersonate={impersonateTeacher} /> : null}
            </TabsContent>

            <TabsContent value="product" className="mt-6">
              {product ? <ProductTab data={product} /> : null}
            </TabsContent>

            <TabsContent value="ai" className="mt-6">
              {aiUsage ? <AiTab data={aiUsage} /> : null}
            </TabsContent>

            <TabsContent value="approvals" className="mt-6">
              <ApprovalsTab pending={pending} onApprove={approveTeacher} onSuspend={suspendTeacher} onResetLink={mintResetLink} onImpersonate={impersonateTeacher} />
            </TabsContent>

            <TabsContent value="waitlist" className="mt-6">
              <WaitlistTab
                entries={waitlist}
                onFulfilled={markWaitlistFulfilled}
                onUnfulfilled={unmarkWaitlistFulfilled}
              />
            </TabsContent>

            <TabsContent value="students" className="mt-6">
              <StudentsTab students={students} onImpersonate={impersonateStudent} />
            </TabsContent>

            <TabsContent value="pilots" className="mt-6">
              {pilots ? (
                <PilotsTab
                  data={pilots}
                  filter={pilotFilter}
                  onFilter={(v) => {
                    setPilotFilter(v);
                    void reloadPilots(v);
                  }}
                  onUpdate={updatePilot}
                />
              ) : null}
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </AppShell>
  );
}

function WaitlistTab({
  entries,
  onFulfilled,
  onUnfulfilled,
}: {
  entries: WaitlistEntry[];
  onFulfilled: (id: string) => Promise<void>;
  onUnfulfilled: (id: string) => Promise<void>;
}) {
  const open = entries.filter((e) => !e.fulfilledAt);
  const done = entries.filter((e) => e.fulfilledAt);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-xl text-primary">Paid plan waitlist</h2>
        <p className="text-sm text-muted-foreground">
          Teachers asking to be notified when paid plans go live. Mark a row as contacted once you've reached out.
        </p>
      </div>

      <section>
        <h3 className="font-medium text-sm mb-3">Open ({open.length})</h3>
        {open.length === 0 ? (
          <div className="text-sm text-muted-foreground border rounded-md p-4 bg-card">No one on the waitlist yet.</div>
        ) : (
          <div className="space-y-2">
            {open.map((e) => (
              <WaitlistRow key={e.id} entry={e} onFulfilled={onFulfilled} onUnfulfilled={onUnfulfilled} />
            ))}
          </div>
        )}
      </section>

      {done.length > 0 ? (
        <section>
          <h3 className="font-medium text-sm mb-3 text-muted-foreground">Contacted ({done.length})</h3>
          <div className="space-y-2">
            {done.map((e) => (
              <WaitlistRow key={e.id} entry={e} onFulfilled={onFulfilled} onUnfulfilled={onUnfulfilled} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function WaitlistRow({
  entry,
  onFulfilled,
  onUnfulfilled,
}: {
  entry: WaitlistEntry;
  onFulfilled: (id: string) => Promise<void>;
  onUnfulfilled: (id: string) => Promise<void>;
}) {
  const fulfilled = !!entry.fulfilledAt;
  return (
    <div className={`border rounded-lg p-4 bg-card flex flex-col md:flex-row md:items-start gap-3 ${fulfilled ? "opacity-60" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-medium">{entry.teacherName}</span>
          <a href={`mailto:${entry.email}`} className="text-sm text-primary underline truncate">{entry.email}</a>
          {entry.schoolName ? <span className="text-xs text-muted-foreground">· {entry.schoolName}</span> : null}
          {entry.country ? <span className="text-xs text-muted-foreground">· {entry.country}</span> : null}
        </div>
        {entry.note ? (
          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">"{entry.note}"</p>
        ) : null}
        <div className="text-xs text-muted-foreground mt-2">
          Joined {new Date(entry.createdAt).toLocaleString()}
          {entry.fulfilledAt ? ` · contacted ${new Date(entry.fulfilledAt).toLocaleString()}` : ""}
        </div>
      </div>
      <div className="shrink-0">
        {fulfilled ? (
          <Button variant="outline" size="sm" onClick={() => onUnfulfilled(entry.id)}>Reopen</Button>
        ) : (
          <Button size="sm" onClick={() => onFulfilled(entry.id)}>Mark contacted</Button>
        )}
      </div>
    </div>
  );
}

function Delta({ current, previous, format = "num", invertSign = false }: { current: number; previous: number; format?: "num" | "usd"; invertSign?: boolean }) {
  const diff = current - previous;
  const pct = previous === 0 ? (current === 0 ? 0 : 100) : (diff / previous) * 100;
  const goodWhenUp = !invertSign;
  const isUp = diff > 0;
  const color = diff === 0 ? "text-muted-foreground" : ((isUp === goodWhenUp) ? "text-green-700" : "text-rose-700");
  const arrow = diff === 0 ? "·" : isUp ? "▲" : "▼";
  const formatted = format === "usd" ? fmtUsd(Math.abs(diff)) : fmtNum(Math.abs(diff));
  const pctStr = previous === 0 ? (current === 0 ? "0%" : "new") : `${Math.abs(Math.round(pct))}%`;
  return <span className={`text-xs ${color}`}>{arrow} {formatted} ({pctStr} vs prior 7d)</span>;
}

function DigestCell({ label, current, previous, format = "num", invertSign = false }: { label: string; current: number; previous: number; format?: "num" | "usd"; invertSign?: boolean }) {
  return (
    <div className="border rounded-lg bg-card p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-serif text-3xl text-primary mt-1">{format === "usd" ? fmtUsd(current) : fmtNum(current)}</div>
      <div className="mt-1"><Delta current={current} previous={previous} format={format} invertSign={invertSign} /></div>
    </div>
  );
}

function DigestTab({ data }: { data: AdminDigest }) {
  const c = data.current;
  const p = data.previous;
  const resourcesCurrent: number = c.lessonPlans + c.worksheets + c.quizzes + c.parentDrafts;
  const resourcesPrev: number = p.lessonPlans + p.worksheets + p.quizzes + p.parentDrafts;
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-xl text-primary">This week at a glance</h2>
        <p className="text-sm text-muted-foreground">
          {new Date(data.windowStart).toLocaleDateString()} to {new Date(data.windowEnd).toLocaleDateString()}, compared with the prior 7 days.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DigestCell label="New sign-ups" current={c.signups} previous={p.signups} />
        <DigestCell label="Pilot requests" current={c.pilots} previous={p.pilots} />
        <DigestCell label="Active teachers" current={c.activeTeachers} previous={p.activeTeachers} />
        <DigestCell label="Resources created" current={resourcesCurrent} previous={resourcesPrev} />
        <DigestCell label="Assignments" current={c.assignments} previous={p.assignments} />
        <DigestCell label="Student submissions" current={c.submissions} previous={p.submissions} />
        <DigestCell label="AI cost" current={c.aiCostUsd} previous={p.aiCostUsd} format="usd" invertSign />
        <DigestCell label="Events captured" current={c.events} previous={p.events} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-serif text-lg text-primary mb-2">New pilot requests this week</h3>
          <div className="border rounded-lg bg-card divide-y">
            {data.newPilots.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No new pilot requests in the last 7 days.</div>
            ) : null}
            {data.newPilots.map((p) => (
              <div key={p.id} className="p-4 text-sm">
                <div className="font-medium">{p.contactName} <span className="text-xs text-muted-foreground font-normal">· {p.status.replace(/_/g, " ")}</span></div>
                <div className="text-xs text-muted-foreground">
                  <a className="underline" href={`mailto:${p.contactEmail}`}>{p.contactEmail}</a>
                  {p.organization || p.schoolName ? ` · ${p.organization ?? p.schoolName}` : ""}
                  {p.country ? ` · ${p.country}` : ""}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{new Date(p.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-serif text-lg text-primary mb-2">Most active teachers this week</h3>
          <div className="border rounded-lg bg-card divide-y">
            {data.topTeachers.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No teacher activity yet this week.</div>
            ) : null}
            {data.topTeachers.map((t) => (
              <div key={t.id} className="p-4 text-sm flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.email}{t.schoolName ? ` · ${t.schoolName}` : ""}</div>
                </div>
                <div className="text-right">
                  <div className="font-serif text-xl text-primary">{t.events}</div>
                  <div className="text-xs text-muted-foreground">events</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h3 className="font-serif text-lg text-primary mb-2">Top events this week</h3>
        <div className="border rounded-lg bg-card p-4 space-y-1">
          {data.topEvents.length === 0 ? <div className="text-sm text-muted-foreground">No events captured yet.</div> : null}
          {data.topEvents.map((e, i) => {
            const max = Math.max(1, ...data.topEvents.map((x) => x.count));
            return (
              <div key={`${e.name}-${i}`} className="flex items-center gap-3 text-sm">
                <span className="flex-1 truncate">{e.name}{e.surface ? <span className="ml-2 text-xs text-muted-foreground">{e.surface}</span> : null}</span>
                <div className="w-1/3"><Bar value={e.count} max={max} /></div>
                <span className="w-16 text-right text-muted-foreground tabular-nums">{e.count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ stats }: { stats: AdminStats }) {
  const maxWeekly = Math.max(1, ...stats.weeklyActivity.map((w) => w.resources + w.submissions));
  const maxDaily = Math.max(1, ...stats.dailyActivity.map((d) => d.activeTeachers));
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Teachers" value={stats.totals.teachers} hint={`${stats.totals.activeTeachersThisWeek} active this week`} />
        <Stat label="Active today" value={stats.totals.activeTeachersToday} />
        <Stat label="Resources" value={fmtNum(stats.totals.lessonPlans + stats.totals.worksheets + stats.totals.quizzes + stats.totals.parentDrafts)} hint="Plans, worksheets, quizzes, drafts" />
        <Stat label="Submissions" value={fmtNum(stats.totals.submissions)} />
        <Stat label="Classes" value={stats.totals.classes} hint={`${stats.totals.students} students`} />
        <Stat label="Pilot requests" value={stats.totals.pilotRequests} />
        <Stat label="AI cost (all time)" value={fmtUsd(stats.totals.aiCostUsd)} hint={`${fmtNum(stats.totals.aiCalls)} calls, ${fmtNum(stats.totals.aiTokens)} tokens`} />
        <Stat label="Events captured" value={fmtNum(stats.totals.events)} />
      </div>

      <div>
        <h2 className="font-serif text-xl text-primary mb-3">Signup funnel</h2>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Signed up" value={stats.signupFunnel.signups} />
          <Stat label="Created a resource" value={stats.signupFunnel.createdResource} hint={pctHint(stats.signupFunnel.createdResource, stats.signupFunnel.signups)} />
          <Stat label="Returned after week 1" value={stats.signupFunnel.returnedAfterWeek} hint={pctHint(stats.signupFunnel.returnedAfterWeek, stats.signupFunnel.signups)} />
        </div>
      </div>

      <div>
        <h2 className="font-serif text-xl text-primary mb-3">Daily active teachers (last 30 days)</h2>
        <div className="border rounded-lg bg-card p-4 space-y-1">
          {stats.dailyActivity.map((d) => (
            <div key={d.day} className="flex items-center gap-3 text-xs">
              <span className="w-24 text-muted-foreground">{new Date(d.day).toLocaleDateString()}</span>
              <div className="flex-1"><Bar value={d.activeTeachers} max={maxDaily} /></div>
              <span className="w-12 text-right tabular-nums">{d.activeTeachers}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-serif text-xl text-primary mb-3">Weekly activity (last 4 weeks)</h2>
        <div className="border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr><th className="text-left p-3">Week of</th><th className="text-right p-3">New teachers</th><th className="text-right p-3">Resources</th><th className="text-right p-3">Submissions</th><th className="p-3">Volume</th></tr>
            </thead>
            <tbody>
              {stats.weeklyActivity.map((w) => (
                <tr key={w.weekStart} className="border-t">
                  <td className="p-3">{new Date(w.weekStart).toLocaleDateString()}</td>
                  <td className="p-3 text-right tabular-nums">{w.teachers}</td>
                  <td className="p-3 text-right tabular-nums">{w.resources}</td>
                  <td className="p-3 text-right tabular-nums">{w.submissions}</td>
                  <td className="p-3 w-1/3"><Bar value={w.resources + w.submissions} max={maxWeekly} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="font-serif text-xl text-primary mb-3">Recent signups</h2>
        <div className="border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr><th className="text-left p-3">Name</th><th className="text-left p-3">School</th><th className="text-left p-3">Region</th><th className="text-left p-3">When</th></tr></thead>
            <tbody>
              {stats.recentSignups.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-3"><div className="font-medium">{t.name}</div><div className="text-xs text-muted-foreground">{t.email}</div></td>
                  <td className="p-3">{t.schoolName ?? "-"}{t.country ? ` · ${t.country}` : ""}</td>
                  <td className="p-3">{t.region}</td>
                  <td className="p-3 text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function pctHint(n: number, d: number): string {
  if (d === 0) return "no signups yet";
  return `${Math.round((n / d) * 100)}% of signups`;
}

function EngagementTab({ data, onImpersonate }: { data: AdminEngagement; onImpersonate: (id: string) => Promise<Teacher | null> }) {
  const maxFeature = Math.max(1, ...data.featureUsage.map((f) => f.total));
  const [busyId, setBusyId] = useState<string | null>(null);
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-xl text-primary mb-3">Weekly retention cohorts</h2>
        <div className="border rounded-lg bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3">Cohort week</th>
                <th className="text-right p-3">Size</th>
                {Array.from({ length: 8 }).map((_, i) => (
                  <th key={i} className="text-right p-3">W{i}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.retentionCohorts.map((c) => (
                <tr key={c.weekStart} className="border-t">
                  <td className="p-3">{new Date(c.weekStart).toLocaleDateString()}</td>
                  <td className="p-3 text-right tabular-nums">{c.size}</td>
                  {Array.from({ length: 8 }).map((_, i) => {
                    const v = c.retention[i] ?? 0;
                    const pct = c.size > 0 ? Math.round((v / c.size) * 100) : 0;
                    const intensity = Math.min(1, pct / 100);
                    return (
                      <td key={i} className="p-3 text-right tabular-nums" style={{ background: v ? `rgba(31,42,92,${0.08 + intensity * 0.5})` : undefined }}>
                        {v ? `${pct}%` : "-"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">W0 is the cohort week. WN is the % of that cohort active in week N.</p>
      </div>

      <div>
        <h2 className="font-serif text-xl text-primary mb-3">Feature usage</h2>
        <div className="border rounded-lg bg-card p-4 space-y-2">
          {data.featureUsage.map((f) => (
            <div key={f.feature} className="flex items-center gap-3 text-sm">
              <span className="w-32 capitalize">{f.feature.replace(/_/g, " ")}</span>
              <div className="flex-1"><Bar value={f.total} max={maxFeature} /></div>
              <span className="w-32 text-right text-muted-foreground tabular-nums">{f.total} · {f.uniqueTeachers} teachers</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-serif text-xl text-primary mb-3">Teacher leaderboard</h2>
        <div className="border rounded-lg bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3">Teacher</th>
                <th className="text-right p-3">Plans</th>
                <th className="text-right p-3">Sheets</th>
                <th className="text-right p-3">Quizzes</th>
                <th className="text-right p-3">Drafts</th>
                <th className="text-right p-3">Assigns</th>
                <th className="text-right p-3">Events</th>
                <th className="text-left p-3">Last seen</th>
                <th className="text-left p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.teacherLeaderboard.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.email}{t.schoolName ? ` · ${t.schoolName}` : ""}</div>
                  </td>
                  <td className="p-3 text-right tabular-nums">{t.lessonPlans}</td>
                  <td className="p-3 text-right tabular-nums">{t.worksheets}</td>
                  <td className="p-3 text-right tabular-nums">{t.quizzes}</td>
                  <td className="p-3 text-right tabular-nums">{t.parentDrafts}</td>
                  <td className="p-3 text-right tabular-nums">{t.assignments}</td>
                  <td className="p-3 text-right tabular-nums">{t.events}</td>
                  <td className="p-3 text-muted-foreground">{t.lastSeen ? new Date(t.lastSeen).toLocaleString() : "-"}</td>
                  <td className="p-3">
                    <Button
                      size="sm" variant="ghost"
                      disabled={busyId === t.id}
                      onClick={() => {
                        setBusyId(t.id);
                        void onImpersonate(t.id).then(() => { window.location.reload(); });
                      }}
                    >
                      Impersonate
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProductTab({ data }: { data: AdminProduct }) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-xl text-primary mb-3">Surface mix (last 30 days)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {data.surfaceBreakdown.map((s) => (
            <Stat key={s.label} label={s.label} value={fmtNum(s.count)} hint={`${fmtNum(s.uniqueUsers)} unique`} />
          ))}
        </div>
      </div>
      <TopList title="Top events (last 30 days)" items={data.topEvents} />
      <TopList title="Top pages: teacher app" items={data.topPagesApp} />
      <TopList title="Top pages: marketing site" items={data.topPagesSite} />
    </div>
  );
}

function TopList({ title, items }: { title: string; items: { label: string; surface: string | null; count: number; uniqueUsers: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div>
      <h2 className="font-serif text-xl text-primary mb-3">{title}</h2>
      <div className="border rounded-lg bg-card p-4 space-y-1">
        {items.length === 0 ? <div className="text-sm text-muted-foreground">No data yet.</div> : null}
        {items.map((i, idx) => (
          <div key={`${i.label}-${i.surface ?? "all"}-${idx}`} className="flex items-center gap-3 text-sm">
            <span className="flex-1 truncate" title={i.label}>
              {i.label || "(empty)"}
              {i.surface ? <span className="ml-2 text-xs text-muted-foreground">{i.surface}</span> : null}
            </span>
            <div className="w-1/3"><Bar value={i.count} max={max} /></div>
            <span className="w-28 text-right text-muted-foreground tabular-nums">{i.count} · {i.uniqueUsers} u</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AiTab({ data }: { data: AdminAiUsage }) {
  const maxDaily = Math.max(1, ...data.daily.map((d) => d.costUsd));
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total cost" value={fmtUsd(data.totals.costUsd)} hint={`${fmtNum(data.totals.calls)} calls`} />
        <Stat label="Successful" value={fmtNum(data.totals.successful)} hint={`${data.totals.failed} failed`} />
        <Stat label="Total tokens" value={fmtNum(data.totals.totalTokens)} hint={`${fmtNum(data.totals.promptTokens)} in / ${fmtNum(data.totals.completionTokens)} out`} />
        <Stat label="Avg latency" value={`${data.totals.avgLatencyMs} ms`} />
      </div>

      <div>
        <h2 className="font-serif text-xl text-primary mb-3">Daily AI spend (last 30 days)</h2>
        <div className="border rounded-lg bg-card p-4 space-y-1">
          {data.daily.map((d) => (
            <div key={d.day} className="flex items-center gap-3 text-xs">
              <span className="w-24 text-muted-foreground">{new Date(d.day).toLocaleDateString()}</span>
              <div className="flex-1"><Bar value={d.costUsd} max={maxDaily} color="var(--accent, #C9971C)" /></div>
              <span className="w-20 text-right tabular-nums">{fmtUsd(d.costUsd)}</span>
              <span className="w-12 text-right text-muted-foreground tabular-nums">{d.calls}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-serif text-xl text-primary mb-3">By feature</h2>
        <div className="border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr><th className="text-left p-3">Kind</th><th className="text-right p-3">Calls</th><th className="text-right p-3">Tokens</th><th className="text-right p-3">Cost</th></tr></thead>
            <tbody>
              {data.byKind.map((k) => (
                <tr key={k.kind} className="border-t">
                  <td className="p-3 capitalize">{k.kind.replace(/_/g, " ")}</td>
                  <td className="p-3 text-right tabular-nums">{k.calls}</td>
                  <td className="p-3 text-right tabular-nums">{fmtNum(k.tokens)}</td>
                  <td className="p-3 text-right tabular-nums">{fmtUsd(k.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="font-serif text-xl text-primary mb-3">Top teachers by AI spend</h2>
        <div className="border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr><th className="text-left p-3">Teacher</th><th className="text-right p-3">Calls</th><th className="text-right p-3">Tokens</th><th className="text-right p-3">Cost</th></tr></thead>
            <tbody>
              {data.byTeacher.map((t, idx) => (
                <tr key={t.id ?? `unknown-${idx}`} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.email ?? ""}{t.schoolName ? ` · ${t.schoolName}` : ""}</div>
                  </td>
                  <td className="p-3 text-right tabular-nums">{t.calls}</td>
                  <td className="p-3 text-right tabular-nums">{fmtNum(t.tokens)}</td>
                  <td className="p-3 text-right tabular-nums">{fmtUsd(t.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PilotsTab({
  data,
  filter,
  onFilter,
  onUpdate,
}: {
  data: AdminPilots;
  filter: string;
  onFilter: (v: string) => void;
  onUpdate: (id: string, patch: { status?: PilotStatus; notes?: string | null }) => Promise<void>;
}) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of data.statusCounts) m.set(s.status, s.count);
    return m;
  }, [data.statusCounts]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {PILOT_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onFilter(s)}
            data-track="admin_pilot_filter"
            data-track-status={s}
            className={`border rounded-lg p-4 text-left transition ${filter === s ? "ring-2 ring-primary" : "hover:bg-muted/40"}`}
          >
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.replace(/_/g, " ")}</div>
            <div className="font-serif text-2xl text-primary mt-1">{counts.get(s) ?? 0}</div>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => onFilter("all")} data-track="admin_pilot_filter" data-track-status="all">
          All ({data.pilots.length})
        </Button>
      </div>

      <div className="space-y-3">
        {data.pilots.length === 0 ? (
          <div className="border rounded-lg bg-card p-6 text-muted-foreground">No pilot requests match this filter.</div>
        ) : null}
        {data.pilots.map((p) => (
          <PilotCard key={p.id} pilot={p} onUpdate={onUpdate} />
        ))}
      </div>
    </div>
  );
}

function ApprovalsTab({
  pending,
  onApprove,
  onSuspend,
  onResetLink,
  onImpersonate,
}: {
  pending: PendingTeacher[];
  onApprove: (id: string) => Promise<void>;
  onSuspend: (id: string) => Promise<void>;
  onResetLink: (id: string) => Promise<{ token: string; email: string; expiresAt: string }>;
  onImpersonate: (id: string) => Promise<Teacher | null>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-xl text-primary">Awaiting approval</h2>
        <p className="text-sm text-muted-foreground">
          New teachers cannot create resources until you approve them here. Use the reset link button to mint a one-time password reset for any teacher who has lost access.
        </p>
      </div>
      {pending.length === 0 ? (
        <div className="border rounded-lg bg-card p-6 text-muted-foreground">No new sign-ups waiting. Nice and quiet.</div>
      ) : null}
      {pending.map((t) => (
        <ApprovalRow key={t.id} teacher={t} onApprove={onApprove} onSuspend={onSuspend} onResetLink={onResetLink} onImpersonate={onImpersonate} />
      ))}
    </div>
  );
}

function ApprovalRow({
  teacher,
  onApprove,
  onSuspend,
  onResetLink,
  onImpersonate,
}: {
  teacher: PendingTeacher;
  onApprove: (id: string) => Promise<void>;
  onSuspend: (id: string) => Promise<void>;
  onResetLink: (id: string) => Promise<{ token: string; email: string; expiresAt: string }>;
  onImpersonate: (id: string) => Promise<Teacher | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function doApprove() { setBusy(true); try { await onApprove(teacher.id); } finally { setBusy(false); } }
  async function doSuspend() { setBusy(true); try { await onSuspend(teacher.id); } finally { setBusy(false); } }
  async function doReset() {
    setBusy(true);
    try {
      const r = await onResetLink(teacher.id);
      const base = window.location.origin + window.location.pathname.replace(/\/admin.*/, "");
      setLink(`${base}/reset-password?token=${r.token}`);
    } finally { setBusy(false); }
  }
  async function doImpersonate() {
    setBusy(true);
    try { await onImpersonate(teacher.id); window.location.reload(); } finally { setBusy(false); }
  }
  async function copyLink() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); } catch { /* ignore */ }
  }

  return (
    <div className="border rounded-lg bg-card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-medium text-lg">{teacher.name}</div>
          <div className="text-sm text-muted-foreground">
            <a className="underline" href={`mailto:${teacher.email}`}>{teacher.email}</a>
            {teacher.schoolName ? ` · ${teacher.schoolName}` : ""}
            {teacher.country ? ` · ${teacher.country}` : ""}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Region: {teacher.region}
            {teacher.subjects.length > 0 ? ` · Subjects: ${teacher.subjects.join(", ")}` : ""}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Signed up {new Date(teacher.createdAt).toLocaleString()}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={doApprove} disabled={busy} data-track="admin_approve_teacher">Approve</Button>
          <Button size="sm" variant="outline" onClick={doSuspend} disabled={busy} data-track="admin_suspend_teacher">Suspend</Button>
          <Button size="sm" variant="outline" onClick={doImpersonate} disabled={busy} data-track="admin_impersonate_teacher">Impersonate</Button>
          <Button size="sm" variant="outline" onClick={doReset} disabled={busy} data-track="admin_mint_reset_link">Reset link</Button>
        </div>
      </div>
      {link ? (
        <div className="mt-3 p-3 bg-muted/40 rounded text-xs">
          <div className="font-medium mb-1">One-time reset link (valid 24 hours):</div>
          <div className="flex gap-2 items-center">
            <code className="flex-1 truncate">{link}</code>
            <Button size="sm" variant="outline" onClick={copyLink}>Copy</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PilotCard({
  pilot,
  onUpdate,
}: {
  pilot: AdminPilot;
  onUpdate: (id: string, patch: { status?: PilotStatus; notes?: string | null }) => Promise<void>;
}) {
  const [notes, setNotes] = useState(pilot.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function setStatus(s: PilotStatus) {
    setSaving(true);
    try { await onUpdate(pilot.id, { status: s }); } finally { setSaving(false); }
  }

  async function saveNotes() {
    setSaving(true);
    try { await onUpdate(pilot.id, { notes: notes || null }); } finally { setSaving(false); }
  }

  return (
    <div className="border rounded-lg bg-card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-medium text-lg">{pilot.contactName}</div>
            <Badge className={statusColor(pilot.status)}>{pilot.status.replace(/_/g, " ")}</Badge>
            <span className="text-xs text-muted-foreground">source: {pilot.source}</span>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            <a className="underline" href={`mailto:${pilot.contactEmail}`}>{pilot.contactEmail}</a>
            {pilot.organization ? ` · ${pilot.organization}` : ""}
            {pilot.schoolName ? ` · ${pilot.schoolName}` : ""}
            {pilot.country ? ` · ${pilot.country}` : ""}
            {pilot.gradeLevels ? ` · ${pilot.gradeLevels}` : ""}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Received {new Date(pilot.createdAt).toLocaleString()}
            {pilot.contactedAt ? ` · Contacted ${new Date(pilot.contactedAt).toLocaleString()}` : ""}
          </div>
          {pilot.sourcePath || pilot.sourceReferrer || pilot.sourceUtm ? (
            <div className="text-xs text-muted-foreground mt-1">
              {pilot.sourcePath ? <>From <code>{pilot.sourcePath}</code> </> : null}
              {pilot.sourceReferrer ? <>via <code>{pilot.sourceReferrer}</code> </> : null}
              {pilot.sourceUtm ? <>utm: <code>{JSON.stringify(pilot.sourceUtm)}</code></> : null}
            </div>
          ) : null}
        </div>
        <div className="w-56">
          <Select value={pilot.status} onValueChange={(v) => void setStatus(v as PilotStatus)} disabled={saving}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PILOT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {pilot.message ? (
        <div className="mt-3 text-sm whitespace-pre-wrap p-3 bg-muted/40 rounded">{pilot.message}</div>
      ) : null}
      <div className="mt-3">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Founder notes</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Add notes about this lead (next step, decision-maker, timing)." className="mt-1" />
        <div className="flex justify-end mt-2">
          <Button size="sm" onClick={() => void saveNotes()} disabled={saving} data-track="admin_pilot_save_notes">Save notes</Button>
        </div>
      </div>
    </div>
  );
}

function StudentsTab({ students, onImpersonate }: { students: Student[]; onImpersonate: (id: string) => Promise<void> }) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (students.length === 0) {
    return <div className="text-muted-foreground">No students yet.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        {students.length} student{students.length === 1 ? "" : "s"}. Click <strong>Impersonate</strong> to enter that student's Synops Coach view.
      </div>
      {students.map((s) => (
        <div key={s.id} className="border rounded-lg bg-card p-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-medium text-lg">
              {s.firstName} {s.lastInitial}
            </div>
            <div className="text-sm text-muted-foreground">
              {s.email ? <a className="underline" href={`mailto:${s.email}`}>{s.email}</a> : <span className="italic">No email</span>}
              {s.joinCode ? ` · Join code: ${s.joinCode}` : ""}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Created {new Date(s.createdAt).toLocaleString()}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busyId === s.id}
            onClick={() => {
              setBusyId(s.id);
              void onImpersonate(s.id).then(() => {
                window.location.href = "/student/tutor";
              });
            }}
            data-track="admin_impersonate_student"
          >
            {busyId === s.id ? "Impersonating..." : "Impersonate"}
          </Button>
        </div>
      ))}
    </div>
  );
}
