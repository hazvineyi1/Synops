import { useState } from "react";
import { useIsAdmin, useAdminOverview, useAdminUsage, useAdminBreakdown, useAdminUsers, useAdminUserDetail, useAdminLogins } from "@/lib/admin-api";
import type { AdminOverview, BreakdownItem, AdminUser } from "@/lib/admin-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Activity, MessageSquare, BookOpen, CheckSquare, ClipboardCheck, Loader2, ShieldAlert, Clock, Building2, Gift, Target, Sparkles, Globe } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const PERSONALITY_LABELS: Record<string, string> = {
  drill: "Drill Sergeant",
  socratic: "Socratic Mentor",
  warm: "Warm Encourager",
  analyst: "The Analyst",
};

const GOAL_LABELS: Record<string, string> = {
  bar: "Bar Exam",
  certification: "Certification",
  university: "University",
  general: "General Study",
};

const BASELINE_LABELS: Record<string, string> = {
  zero: "Starting Fresh",
  foundations: "Some Foundations",
  solid: "Solid Base",
  rusty: "Rusty",
};

function labelFor(map: Record<string, string>, key: string | null): string {
  if (!key) return "Not set";
  return map[key] ?? key;
}

// Seconds -> compact "2h 5m" / "12m" / "45s".
function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function locationStr(city: string | null, country: string | null): string {
  return [city, country].filter(Boolean).join(", ") || "Unknown";
}

function planBadge(plan: string) {
  if (plan === "pro") return <Badge className="bg-primary/10 text-primary font-normal">Pro</Badge>;
  if (plan === "trial") return <Badge variant="secondary" className="font-normal">Trial</Badge>;
  return <Badge variant="outline" className="font-normal text-muted-foreground">Free</Badge>;
}

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: number | string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-semibold text-foreground leading-tight">{value}</p>
            <p className="text-xs text-muted-foreground truncate">{label}</p>
          </div>
        </div>
        {sub ? <p className="text-xs text-muted-foreground mt-2">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

function BreakdownCard({ title, description, items, labels }: { title: string; description: string; items: BreakdownItem[]; labels: Record<string, string> }) {
  const total = items.reduce((s, i) => s + i.count, 0);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-serif">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          items.map((item) => {
            const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
            return (
              <div key={item.key ?? "none"}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-foreground">{labelFor(labels, item.key)}</span>
                  <span className="text-muted-foreground">{item.count} ({pct}%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function OverviewGrid({ o }: { o: AdminOverview }) {
  const mrr = o.pro_users * 19;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      <StatCard icon={Users} label="Total learners" value={o.total_users} sub={`+${o.new_users_7d} in last 7 days`} />
      <StatCard icon={Activity} label="Active (7 days)" value={o.active_users_7d} sub={`${o.active_users_today} active today`} />
      <StatCard icon={Clock} label="Total time on app" value={formatDuration(o.total_time_seconds)} sub={`${o.total_sessions} sessions`} />
      <StatCard icon={Sparkles} label="Pro / trial" value={`${o.pro_users} / ${o.trial_users}`} sub={`~$${mrr}/mo from Pro`} />
      <StatCard icon={ClipboardCheck} label="Completed onboarding" value={o.assessments_complete} sub={`of ${o.total_users} learners`} />
      <StatCard icon={MessageSquare} label="Coach messages" value={o.total_messages} sub={`${o.total_user_messages} from learners`} />
      <StatCard icon={BookOpen} label="Concepts created" value={o.total_concepts} />
      <StatCard icon={CheckSquare} label="Checkpoints" value={o.total_checkpoints} sub={`avg grade ${o.avg_checkpoint_grade}/3`} />
      <StatCard icon={ClipboardCheck} label="Plans completed" value={o.completed_plans} sub={`of ${o.total_plans} created`} />
      <StatCard icon={Activity} label="Weekly retros" value={o.total_retros} />
      <StatCard icon={Building2} label="Institutions / cohorts" value={`${o.total_institutions} / ${o.total_cohorts}`} />
      <StatCard icon={Gift} label="Referrals" value={o.total_referrals} sub={`${o.active_api_keys} API keys · ${o.active_webhooks} webhooks`} />
    </div>
  );
}

export default function Admin() {
  const { data: me, isLoading: meLoading } = useIsAdmin();
  const isAdmin = !!me?.isAdmin;

  const { data: overview, isLoading: overviewLoading } = useAdminOverview(isAdmin);
  const { data: usage = [], isLoading: usageLoading } = useAdminUsage(isAdmin);
  const { data: breakdown, isLoading: breakdownLoading } = useAdminBreakdown(isAdmin);
  const { data: users = [], isLoading: usersLoading } = useAdminUsers(isAdmin);
  const { data: logins = [], isLoading: loginsLoading } = useAdminLogins(isAdmin);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  if (meLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <ShieldAlert className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h1 className="font-serif text-xl text-foreground mb-1">Admins only</h1>
          <p className="text-sm text-muted-foreground">You do not have access to this page.</p>
        </div>
      </div>
    );
  }

  const usageData = usage.map((d) => ({
    ...d,
    label: format(parseISO(d.day), "MMM d"),
  }));

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      <div className="p-4 md:p-6 md:px-8 border-b border-border bg-background/95 sticky top-0 z-10">
        <h1 className="font-serif text-xl md:text-2xl text-primary font-medium">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Usage, engagement, and what learners are studying.</p>
      </div>

      <div className="p-4 md:p-6 md:px-8 space-y-6 md:space-y-8">
        {overviewLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : overview ? (
          <OverviewGrid o={overview} />
        ) : (
          <p className="text-sm text-muted-foreground">Could not load overview stats. Try refreshing.</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-serif">Activity (last 30 days)</CardTitle>
              <CardDescription>Messages exchanged and learners active per day</CardDescription>
            </CardHeader>
            <CardContent>
              {usageLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={usageData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gMsg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(0 62% 29%)" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(0 62% 29%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={32} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Area type="monotone" dataKey="messages" name="Messages" stroke="hsl(0 62% 29%)" fill="url(#gMsg)" strokeWidth={2} />
                    <Area type="monotone" dataKey="active_users" name="Active learners" stroke="hsl(20 50% 45%)" fillOpacity={0} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-serif">New signups & checkpoints</CardTitle>
              <CardDescription>Daily new learners and checkpoints taken</CardDescription>
            </CardHeader>
            <CardContent>
              {usageLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={usageData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={32} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="new_users" name="New learners" fill="hsl(0 62% 29%)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="checkpoints" name="Checkpoints" fill="hsl(20 50% 55%)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {breakdownLoading ? (
            <div className="md:col-span-3 flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : !breakdown ? (
            <p className="md:col-span-3 text-sm text-muted-foreground">Could not load usage breakdown. Try refreshing.</p>
          ) : (
            <>
              <BreakdownCard title="Logins by country" description="Where sessions come from" items={breakdown.countries} labels={{}} />
              <BreakdownCard title="Devices" description="Browser / OS / form factor" items={breakdown.devices} labels={{}} />
              <BreakdownCard title="Study goals" description="What learners are preparing for" items={breakdown.goals} labels={GOAL_LABELS} />
              <BreakdownCard title="Coach personalities" description="Which coach learners prefer" items={breakdown.personalities} labels={PERSONALITY_LABELS} />
              <BreakdownCard title="Starting level" description="Self-reported baseline" items={breakdown.baselines} labels={BASELINE_LABELS} />
            </>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-serif flex items-center gap-2"><Globe className="w-4 h-4 text-primary" /> Recent logins</CardTitle>
            <CardDescription>Who signed in, when, from where, and on what (last {logins.length}).</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loginsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : logins.length === 0 ? (
              <p className="text-sm text-muted-foreground px-6 pb-6">No logins recorded yet. They appear here as people use the app.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Who</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logins.map((l, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <p className="font-medium text-foreground truncate max-w-[180px]">{l.name || "Learner"}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{l.email}</p>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{format(parseISO(l.started_at), "MMM d, HH:mm")}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{locationStr(l.city, l.country)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{l.device || "Unknown"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">{l.ip_address || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">{formatDuration(l.seconds)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-serif">Learners</CardTitle>
            <CardDescription>Most recently seen first ({users.length} shown) — click a row for sessions and progress.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {usersLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground px-6 pb-6">No learners yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Learner</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Studying for</TableHead>
                      <TableHead className="text-right">Concepts</TableHead>
                      <TableHead className="text-right">Mastered</TableHead>
                      <TableHead className="text-right">Checks</TableHead>
                      <TableHead className="text-right">Avg grade</TableHead>
                      <TableHead className="text-right">Logins</TableHead>
                      <TableHead className="text-right">Time spent</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Last seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id} className="cursor-pointer" onClick={() => setSelectedUser(u)}>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate max-w-[180px]">{u.name || "Learner"}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{u.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>{planBadge(u.plan)}</TableCell>
                        <TableCell>
                          {u.exam_name ? (
                            <div className="min-w-0">
                              <p className="text-sm text-foreground truncate max-w-[160px]" title={u.exam_name}>{u.exam_name}</p>
                              {u.goal ? <p className="text-xs text-muted-foreground">{labelFor(GOAL_LABELS, u.goal)}</p> : null}
                            </div>
                          ) : u.goal ? (
                            <Badge variant="secondary" className="font-normal">{labelFor(GOAL_LABELS, u.goal)}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">Not set</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{u.concept_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.mastered_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.checkpoint_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.checkpoint_count > 0 ? `${u.avg_grade}/3` : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.session_count}</TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">{formatDuration(u.total_time_seconds)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{format(parseISO(u.created_at), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{u.last_seen_at ? format(parseISO(u.last_seen_at), "MMM d, HH:mm") : "Never"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <UserDetailDialog user={selectedUser} onClose={() => setSelectedUser(null)} />
    </div>
  );
}

// Per-learner drill-down: login sessions (times + durations) and progress.
function UserDetailDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const { data, isLoading } = useAdminUserDetail(user?.id ?? null);
  return (
    <Dialog open={!!user} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">{user?.name || "Learner"}</DialogTitle>
        </DialogHeader>
        {!user ? null : isLoading || !data ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5 text-sm">
            <p className="text-xs text-muted-foreground -mt-2">{user.email} · {planBadge(user.plan)}</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Time spent" value={formatDuration(Number(data.user.total_time_seconds))} icon={Clock} />
              <Stat label="Logins" value={String(data.user.session_count ?? 0)} icon={Activity} />
              <Stat label="Mastered" value={`${data.user.mastered_count ?? 0}/${data.user.concept_count ?? 0}`} icon={Target} />
              <Stat label="Avg grade" value={data.user.checkpoint_count > 0 ? `${data.user.avg_grade}/3` : "—"} icon={CheckSquare} />
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Detail k="Exam" v={data.user.exam_name || "—"} />
              <Detail k="Exam date" v={data.user.exam_date ? format(parseISO(String(data.user.exam_date)), "MMM d, yyyy") : "—"} />
              <Detail k="Coach" v={labelFor(PERSONALITY_LABELS, data.user.coach_personality ?? null)} />
              <Detail k="Hours/week" v={String(data.user.hours_per_week ?? "—")} />
              <Detail k="Checkpoints" v={String(data.user.checkpoint_count ?? 0)} />
              <Detail k="Messages" v={String(data.user.message_count ?? 0)} />
              <Detail k="Plans completed" v={String(data.user.completed_plans ?? 0)} />
              <Detail k="Referrals" v={String(data.user.referral_count ?? 0)} />
              <Detail k="Joined" v={data.user.created_at ? format(parseISO(String(data.user.created_at)), "MMM d, yyyy") : "—"} />
              <Detail k="Last seen" v={data.user.last_seen_at ? format(parseISO(String(data.user.last_seen_at)), "MMM d, HH:mm") : "Never"} />
            </div>

            <div>
              <h4 className="font-medium text-foreground mb-2">Sessions (login times)</h4>
              {data.sessions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sessions recorded yet.</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {data.sessions.map((s, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 border-b border-border/40 py-1 text-xs">
                      <span className="text-foreground whitespace-nowrap">{format(parseISO(s.started_at), "MMM d, yyyy HH:mm")}</span>
                      <span className="text-muted-foreground truncate flex-1 text-right">
                        {locationStr(s.city, s.country)}{s.device ? ` · ${s.device}` : ""}
                      </span>
                      <span className="text-muted-foreground whitespace-nowrap">{formatDuration(s.seconds)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="font-medium text-foreground mb-2">Recent checkpoints</h4>
              {data.recentCheckpoints.length === 0 ? (
                <p className="text-xs text-muted-foreground">No checkpoints yet.</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {data.recentCheckpoints.map((c, i) => (
                    <div key={i} className="flex items-center justify-between border-b border-border/40 py-1 text-xs gap-3">
                      <span className="text-foreground truncate">{c.concept || "Concept"}</span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {c.coach_grade != null ? `${c.coach_grade}/3` : "—"}
                        {c.confidence_before != null ? ` · felt ${c.confidence_before}/3` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-foreground text-right truncate">{v}</span>
    </div>
  );
}
