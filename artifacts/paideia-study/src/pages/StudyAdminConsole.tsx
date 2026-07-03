import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStudyAuth } from "@/hooks/use-study-auth";
import {
  useStudyAdminOverview,
  useStudyAdminFunnel,
  useStudyAdminUsage,
  useStudyAdminBreakdown,
  useStudyAdminLogins,
  useStudyAdminUsers,
  useStudyAdminUserDetail,
  useStudyAdminUpgradeTargets,
  useStudyAdminAnnouncements,
  useStudyCreateAnnouncement,
  useStudyUpdateAnnouncement,
  useStudyAdminPlans,
  useStudyCreatePlan,
  useStudyUpdatePlan,
  useStudyAdminPaymentMethods,
  useStudyCreatePaymentMethod,
  useStudyUpdatePaymentMethod,
  useStudyAdminAudit,
  useStudyAdminUserAction,
  useStudyAdminCreateUser,
  useStudyAdminDeleteUser,
  useStudyAdminImpersonate,
  useStudyAdminApiKeys,
  useStudyCreateApiKey,
  useStudyRevokeApiKey,
  useAdminAmbassadors,
  useAdminPayouts,
  useAdminUpdatePayout,
  useAdminSetAmbassadorTier,
  useAdminSetAmbassadorStatus,
  useAdminAmbassadorReferrals,
  useAdminAmbassadorEvents,
  type AdminUserRow,
  type AdminUpgradeTarget,
  type AdminAmbassadorRow,
} from "@/hooks/use-study-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  LayoutDashboard, Users, CreditCard, Megaphone, ShieldCheck, KeyRound,
  ArrowLeft, LogOut, Loader2, Search, Download, Plus, Trash2, Eye, Copy, Menu, Gift,
} from "lucide-react";

function fmtUsd(minor: number | null | undefined): string {
  return `$${(Number(minor ?? 0) / 100).toFixed(2)}`;
}

// ─── formatting helpers ──────────────────────────────────────────────────────

function fmtDuration(seconds: number | null | undefined): string {
  const s = Math.round(Number(seconds ?? 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}
function money(minor: number, currency = "USD"): string {
  return `${currency} ${(minor / 100).toFixed(2)}`;
}
function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(filename: string, rows: Array<Record<string, unknown>>): void {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(","), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── small presentational pieces ─────────────────────────────────────────────

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {sub ? <div className="text-xs text-muted-foreground mt-0.5">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function BarList({ title, items }: { title: string; items: Array<{ key: string | null; count: number }> }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1.5">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground">No data yet.</div>
        ) : (
          items.map((i, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <div className="w-28 truncate" title={i.key ?? "—"}>{i.key ?? "—"}</div>
              <div className="flex-1 bg-muted rounded h-3 overflow-hidden">
                <div className="bg-primary h-full" style={{ width: `${(i.count / max) * 100}%` }} />
              </div>
              <div className="w-10 text-right tabular-nums">{i.count}</div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function DashboardSection() {
  const { data: ov } = useStudyAdminOverview();
  const { data: usage } = useStudyAdminUsage();
  const { data: bd } = useStudyAdminBreakdown();
  // Plot sessions AND learning-events per day (whichever is larger drives the bar),
  // so the chart isn't flat when there are sign-ins but no practice activity yet.
  const dayVal = (u: { events: number; sessions: number }) => Math.max(u.events, u.sessions);
  const maxUsage = Math.max(1, ...(usage ?? []).map(dayVal));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total users" value={ov?.total_users ?? 0} sub={`${ov?.paid_users ?? 0} paid · ${ov?.free_users ?? 0} free`} />
        <Kpi label="Active (7d)" value={ov?.active_users_7d ?? 0} sub={`${ov?.active_users_today ?? 0} today · ${ov?.active_users_30d ?? 0} in 30d`} />
        <Kpi label="New users (7d)" value={ov?.new_users_7d ?? 0} sub={`${ov?.new_users_today ?? 0} today · ${ov?.new_users_30d ?? 0} in 30d`} />
        <Kpi label="Paid revenue" value={money(ov?.revenue_minor_paid ?? 0)} sub="lifetime, paid status" />
        <Kpi label="Sessions" value={ov?.total_sessions ?? 0} sub={`${fmtDuration(ov?.total_time_seconds)} total time`} />
        <Kpi label="Materials" value={ov?.total_materials ?? 0} />
        <Kpi label="Practice sessions" value={ov?.total_practice ?? 0} />
        <Kpi label="Mock exams" value={ov?.total_exams ?? 0} />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Activity — last 30 days</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-0.5 h-32">
            {(usage ?? []).map((u) => (
              <div key={u.day} className="flex-1 bg-primary/70 hover:bg-primary rounded-t"
                style={{ height: `${(dayVal(u) / maxUsage) * 100}%`, minHeight: 2 }}
                title={`${u.day}: ${u.sessions} sessions · ${u.events} events · ${u.active_users} active · ${u.new_users} new`} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{usage?.[0]?.day}</span><span>{usage?.[usage.length - 1]?.day}</span>
          </div>
        </CardContent>
      </Card>
      <div className="grid md:grid-cols-3 gap-3">
        <BarList title="Plan" items={bd?.plans ?? []} />
        <BarList title="Country" items={bd?.countries ?? []} />
        <BarList title="Device" items={bd?.devices ?? []} />
        <BarList title="Subscription tier" items={bd?.tiers ?? []} />
        <BarList title="Most-used features" items={bd?.activities ?? []} />
      </div>
    </div>
  );
}

// ─── Students (roster + impersonation, logins, upgrade targets) ──────────────

function Roster() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { data: users, isLoading } = useStudyAdminUsers(q);
  const detail = useStudyAdminUserDetail(selected);
  const action = useStudyAdminUserAction();
  const createUser = useStudyAdminCreateUser();
  const deleteUser = useStudyAdminDeleteUser();
  const impersonate = useStudyAdminImpersonate();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [nu, setNu] = useState({ email: "", name: "", password: "", tier: "free" });
  const [addErr, setAddErr] = useState<string | null>(null);

  function refreshUsers() { qc.invalidateQueries({ queryKey: ["studyAdminUsers"] }); }
  function submitNewUser() {
    setAddErr(null);
    createUser.mutate(nu, {
      onSuccess: () => { setNu({ email: "", name: "", password: "", tier: "free" }); setShowAdd(false); refreshUsers(); },
      onError: (e) => setAddErr((e as { message?: string })?.message ?? "Could not create user"),
    });
  }
  function removeUser(id: string, email: string) {
    if (!window.confirm(`Permanently delete ${email} and ALL their data? This cannot be undone.`)) return;
    deleteUser.mutate(id, { onSuccess: refreshUsers });
  }
  function runImpersonate(id: string) {
    impersonate.mutate(id, { onSuccess: () => { window.location.href = "/study/coach"; } });
  }
  function runAction(id: string, act: "suspend" | "reactivate" | "set-admin", isAdmin?: boolean) {
    action.mutate({ id, action: act, isAdmin }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["studyAdminUsers"] });
        qc.invalidateQueries({ queryKey: ["studyAdminUserDetail"] });
      },
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search email or name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadCsv("coach-users.csv", (users ?? []) as unknown as Array<Record<string, unknown>>)}>
          <Download className="w-4 h-4 mr-1" /> Export CSV
        </Button>
        <Button size="sm" onClick={() => { setShowAdd((v) => !v); setAddErr(null); }}>
          <Plus className="w-4 h-4 mr-1" /> Add user
        </Button>
      </div>
      {showAdd ? (
        <Card>
          <CardContent className="p-3 flex flex-wrap items-end gap-2">
            <div><label className="text-xs">Email</label><Input value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} placeholder="user@example.com" /></div>
            <div><label className="text-xs">Name</label><Input value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} placeholder="Full name" /></div>
            <div><label className="text-xs">Password</label><Input type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} placeholder="min 8 chars" /></div>
            <div>
              <label className="text-xs block">Tier</label>
              <select className="border rounded h-9 px-2 text-sm bg-background" value={nu.tier} onChange={(e) => setNu({ ...nu, tier: e.target.value })}>
                <option value="free">free</option><option value="plus">plus</option><option value="pro">pro</option>
              </select>
            </div>
            <Button onClick={submitNewUser} disabled={createUser.isPending}>
              {createUser.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </Button>
            {addErr ? <span className="text-xs text-destructive self-center">{addErr}</span> : null}
          </CardContent>
        </Card>
      ) : null}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead><TableHead>Plan</TableHead>
                <TableHead className="text-right">Sessions</TableHead><TableHead className="text-right">Time</TableHead>
                <TableHead className="text-right">Materials</TableHead><TableHead>Last active</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users ?? []).map((u: AdminUserRow) => (
                <TableRow key={u.id} className="cursor-pointer" onClick={() => setSelected(u.id)}>
                  <TableCell>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.is_paid ? "default" : "secondary"}>{u.is_paid ? u.subscription_tier || "paid" : "free"}</Badge>
                    {u.is_admin ? <Badge variant="outline" className="ml-1">admin</Badge> : null}
                    {u.suspended ? <Badge variant="destructive" className="ml-1">suspended</Badge> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{u.session_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtDuration(u.total_time_seconds)}</TableCell>
                  <TableCell className="text-right tabular-nums">{u.material_count}</TableCell>
                  <TableCell className="text-xs">{fmtDate(u.last_active_at)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" title="Impersonate" onClick={() => runImpersonate(u.id)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      {u.suspended ? (
                        <Button size="sm" variant="outline" onClick={() => runAction(u.id, "reactivate")}>Reactivate</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => runAction(u.id, "suspend")}>Suspend</Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive" title="Delete user" onClick={() => removeUser(u.id, u.email)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>User detail</DialogTitle></DialogHeader>
          {detail.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : detail.data ? (
            <div className="space-y-4 text-sm">
              <div>
                <div className="font-medium">{String(detail.data.user["name"] ?? "")}</div>
                <div className="text-xs text-muted-foreground">{String(detail.data.user["email"] ?? "")}</div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button size="sm" variant="outline" onClick={() => runAction(String(detail.data!.user["id"]), "set-admin", !detail.data!.user["is_admin"])}>
                    {detail.data.user["is_admin"] ? "Revoke admin" : "Make admin"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => runImpersonate(String(detail.data!.user["id"]))}>
                    <Eye className="w-4 h-4 mr-1" /> Impersonate
                  </Button>
                </div>
              </div>
              <div>
                <div className="font-semibold text-xs uppercase text-muted-foreground mb-1">Recent sessions</div>
                <div className="border rounded max-h-48 overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>When</TableHead><TableHead>For</TableHead><TableHead>Device</TableHead><TableHead>Location</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {detail.data.sessions.map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{fmtDateTime(String(s["started_at"] ?? ""))}</TableCell>
                          <TableCell className="text-xs">{fmtDuration(Number(s["seconds"]))}</TableCell>
                          <TableCell className="text-xs">{String(s["device"] ?? "—")}</TableCell>
                          <TableCell className="text-xs">{[s["city"], s["country"]].filter(Boolean).join(", ") || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LoginsView() {
  const { data: logins, isLoading } = useStudyAdminLogins();
  return isLoading ? (
    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
  ) : (
    <div className="border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Plan</TableHead>
          <TableHead className="text-right">Duration</TableHead><TableHead>Device</TableHead><TableHead>Location</TableHead><TableHead>IP</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {(logins ?? []).map((l, i) => (
            <TableRow key={i}>
              <TableCell className="text-xs">{fmtDateTime(l.started_at)}</TableCell>
              <TableCell className="text-xs">{l.email ?? "—"}</TableCell>
              <TableCell><Badge variant={l.plan === "paid" ? "default" : "secondary"}>{l.plan}</Badge></TableCell>
              <TableCell className="text-right text-xs">{fmtDuration(l.seconds)}</TableCell>
              <TableCell className="text-xs">{l.device ?? "—"}</TableCell>
              <TableCell className="text-xs">{[l.city, l.region, l.country].filter(Boolean).join(", ") || "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{l.ip_address ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function UpgradeTargetsView() {
  const { data: targets, isLoading } = useStudyAdminUpgradeTargets();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Free users ranked by engagement — your warmest upgrade leads.</p>
        <Button variant="outline" size="sm" onClick={() => downloadCsv("upgrade-targets.csv", (targets ?? []) as unknown as Array<Record<string, unknown>>)}>
          <Download className="w-4 h-4 mr-1" /> Export CSV
        </Button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>User</TableHead><TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Sessions</TableHead><TableHead className="text-right">Time</TableHead>
              <TableHead className="text-right">Materials</TableHead><TableHead>Last active</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(targets ?? []).map((t: AdminUpgradeTarget) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.email}{t.billing_country ? ` · ${t.billing_country}` : ""}</div>
                  </TableCell>
                  <TableCell className="text-right"><Badge variant={t.engagement_score >= 20 ? "default" : "secondary"}>{t.engagement_score}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{t.session_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtDuration(t.total_time_seconds)}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.material_count}</TableCell>
                  <TableCell className="text-xs">{t.days_since_active == null ? "—" : t.days_since_active === 0 ? "today" : `${t.days_since_active}d ago`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function StudentsSection() {
  const [view, setView] = useState<"roster" | "logins" | "targets">("roster");
  const tabs: Array<{ id: typeof view; label: string }> = [
    { id: "roster", label: "Roster" },
    { id: "logins", label: "Sign-ins" },
    { id: "targets", label: "Upgrade targets" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {tabs.map((t) => (
          <Button key={t.id} size="sm" variant={view === t.id ? "default" : "ghost"} onClick={() => setView(t.id)}>{t.label}</Button>
        ))}
      </div>
      {view === "roster" ? <Roster /> : view === "logins" ? <LoginsView /> : <UpgradeTargetsView />}
    </div>
  );
}

// ─── Billing ─────────────────────────────────────────────────────────────────

function PlansPanel() {
  const { data } = useStudyAdminPlans();
  const create = useStudyCreatePlan();
  const update = useStudyUpdatePlan();
  const qc = useQueryClient();
  const [key, setKey] = useState(""); const [name, setName] = useState(""); const [priceMajor, setPriceMajor] = useState("");
  function refresh() { qc.invalidateQueries({ queryKey: ["studyAdminPlans"] }); }
  function add() {
    if (!key.trim() || !name.trim()) return;
    create.mutate({ key, name, priceMinor: Math.round(Number(priceMajor || 0) * 100) }, { onSuccess: () => { setKey(""); setName(""); setPriceMajor(""); refresh(); } });
  }
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Plans</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div><label className="text-xs">Key</label><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="pro" className="w-28" /></div>
          <div><label className="text-xs">Name</label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pro" className="w-32" /></div>
          <div><label className="text-xs">Price</label><Input value={priceMajor} onChange={(e) => setPriceMajor(e.target.value)} placeholder="9.99" className="w-24" /></div>
          <Button onClick={add} disabled={create.isPending}>Add plan</Button>
        </div>
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Key</TableHead><TableHead>Name</TableHead><TableHead className="text-right">Price</TableHead><TableHead>Interval</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data?.plans ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.key}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-right">{money(p.priceMinor, p.currency)}</TableCell>
                  <TableCell className="text-xs">{p.interval}</TableCell>
                  <TableCell>{p.id < 0 ? <Badge variant="outline" title="From the live pricing config — add a plan to override">config</Badge> : <Button size="sm" variant="outline" onClick={() => update.mutate({ id: p.id, active: !p.active }, { onSuccess: refresh })}>{p.active ? "Active" : "Inactive"}</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentMethodsPanel() {
  const { data } = useStudyAdminPaymentMethods();
  const create = useStudyCreatePaymentMethod();
  const update = useStudyUpdatePaymentMethod();
  const qc = useQueryClient();
  const [key, setKey] = useState(""); const [label, setLabel] = useState(""); const [provider, setProvider] = useState("");
  function refresh() { qc.invalidateQueries({ queryKey: ["studyAdminPaymentMethods"] }); }
  function add() {
    if (!key.trim() || !label.trim() || !provider.trim()) return;
    create.mutate({ key, label, provider }, { onSuccess: () => { setKey(""); setLabel(""); setProvider(""); refresh(); } });
  }
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Payment methods</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div><label className="text-xs">Key</label><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="ecocash" className="w-28" /></div>
          <div><label className="text-xs">Label</label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="EcoCash" className="w-32" /></div>
          <div><label className="text-xs">Provider</label><Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="paynow" className="w-28" /></div>
          <Button onClick={add} disabled={create.isPending}>Add method</Button>
        </div>
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Key</TableHead><TableHead>Label</TableHead><TableHead>Provider</TableHead><TableHead>Enabled</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data?.paymentMethods ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.key}</TableCell>
                  <TableCell>{m.label}</TableCell>
                  <TableCell className="text-xs">{m.provider}</TableCell>
                  <TableCell>{m.id < 0 ? <Badge variant="outline" title="From the billing config — add a method to override">config</Badge> : <Button size="sm" variant="outline" onClick={() => update.mutate({ id: m.id, enabled: !m.enabled }, { onSuccess: refresh })}>{m.enabled ? "Enabled" : "Disabled"}</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function BillingSection() {
  const { data: ov } = useStudyAdminOverview();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Paid users" value={ov?.paid_users ?? 0} />
        <Kpi label="Free users" value={ov?.free_users ?? 0} />
        <Kpi label="Paid revenue" value={money(ov?.revenue_minor_paid ?? 0)} />
        <Kpi label="Total users" value={ov?.total_users ?? 0} />
      </div>
      <PlansPanel />
      <PaymentMethodsPanel />
    </div>
  );
}

// ─── Announcements ───────────────────────────────────────────────────────────

function AnnouncementsSection() {
  const { data } = useStudyAdminAnnouncements();
  const create = useStudyCreateAnnouncement();
  const update = useStudyUpdateAnnouncement();
  const qc = useQueryClient();
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [audience, setAudience] = useState("all");
  function refresh() { qc.invalidateQueries({ queryKey: ["studyAdminAnnouncements"] }); }
  function submit() {
    if (!title.trim() || !body.trim()) return;
    create.mutate({ title, body, audience }, { onSuccess: () => { setTitle(""); setBody(""); refresh(); } });
  }
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card className="md:col-span-1">
        <CardHeader className="pb-2"><CardTitle className="text-sm">New announcement</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          <select className="w-full border rounded h-9 px-2 text-sm bg-background" value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="all">Everyone</option><option value="free">Free users (upgrade nudge)</option><option value="paid">Paid users</option>
          </select>
          <Button className="w-full" onClick={submit} disabled={create.isPending}>{create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Publish"}</Button>
        </CardContent>
      </Card>
      <div className="md:col-span-2 space-y-2">
        {(data?.announcements ?? []).map((a) => (
          <Card key={a.id}>
            <CardContent className="p-3 flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-sm flex items-center gap-2">{a.title}<Badge variant="outline">{a.audience}</Badge>{!a.active ? <Badge variant="secondary">inactive</Badge> : null}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{a.body}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => update.mutate({ id: a.id, active: !a.active }, { onSuccess: refresh })}>{a.active ? "Deactivate" : "Reactivate"}</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Access & audit ──────────────────────────────────────────────────────────

function AccessAuditSection() {
  const { data } = useStudyAdminAudit();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Every privileged admin action is recorded here. Grant or revoke admin from a user&apos;s row in Students.</p>
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead></TableRow></TableHeader>
          <TableBody>
            {(data?.audit ?? []).map((a) => (
              <TableRow key={a.id}>
                <TableCell className="text-xs">{fmtDateTime(a.createdAt)}</TableCell>
                <TableCell className="text-xs">{a.actorEmail ?? "—"}</TableCell>
                <TableCell className="text-xs font-mono">{a.action}</TableCell>
                <TableCell className="text-xs">{[a.targetType, a.targetId].filter(Boolean).join(":") || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Developer API ───────────────────────────────────────────────────────────

function DeveloperApiSection() {
  const { data } = useStudyAdminApiKeys();
  const create = useStudyCreateApiKey();
  const revoke = useStudyRevokeApiKey();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  function refresh() { qc.invalidateQueries({ queryKey: ["studyAdminApiKeys"] }); }
  function add() {
    if (!name.trim()) return;
    create.mutate({ name }, { onSuccess: (r) => { setNewKey(r.key); setName(""); refresh(); } });
  }
  function copy() {
    if (newKey) { void navigator.clipboard?.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">API keys authenticate integrations against the Coach API. The full key is shown once at creation — store it securely.</p>
      <div className="flex items-end gap-2">
        <div><label className="text-xs">Key name</label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Zapier integration" className="w-64" /></div>
        <Button onClick={add} disabled={create.isPending}>{create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Generate key</>}</Button>
      </div>
      {newKey ? (
        <Card className="border-primary/40">
          <CardContent className="p-3 space-y-1">
            <div className="text-xs font-medium">Copy your new key now — you won&apos;t see it again:</div>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted px-2 py-1 rounded flex-1 overflow-x-auto">{newKey}</code>
              <Button size="sm" variant="outline" onClick={copy}><Copy className="w-4 h-4 mr-1" />{copied ? "Copied" : "Copy"}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Prefix</TableHead><TableHead>Created</TableHead><TableHead>Last used</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(data?.apiKeys ?? []).map((k) => (
              <TableRow key={k.id}>
                <TableCell>{k.name}</TableCell>
                <TableCell className="font-mono text-xs">{k.prefix}…</TableCell>
                <TableCell className="text-xs">{fmtDate(k.createdAt)}</TableCell>
                <TableCell className="text-xs">{fmtDate(k.lastUsedAt)}</TableCell>
                <TableCell>{k.revokedAt ? <Badge variant="secondary">revoked</Badge> : <Badge variant="default">active</Badge>}</TableCell>
                <TableCell className="text-right">
                  {!k.revokedAt ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => revoke.mutate(k.id, { onSuccess: refresh })}>Revoke</Button> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Ambassadors ─────────────────────────────────────────────────────────────

function AmbassadorsTracker() {
  const { data, isLoading } = useAdminAmbassadors();
  const setTier = useAdminSetAmbassadorTier();
  const setStatus = useAdminSetAmbassadorStatus();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<AdminAmbassadorRow | null>(null);
  const referrals = useAdminAmbassadorReferrals(selected?.id ?? null);
  const events = useAdminAmbassadorEvents(selected?.id ?? null);
  function refresh() { qc.invalidateQueries({ queryKey: ["adminAmbassadors"] }); }

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (data?.ambassadors ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No ambassadors yet. Learners join from the Ambassador page in the app.</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Ambassador</TableHead><TableHead>Code</TableHead><TableHead>Tier</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Referrals</TableHead><TableHead className="text-right">Pending</TableHead>
              <TableHead className="text-right">Confirmed</TableHead><TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right">Lifetime</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data?.ambassadors ?? []).map((a) => (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => setSelected(a)}>
                  <TableCell><div className="font-medium">{a.userName}</div><div className="text-xs text-muted-foreground">{a.userEmail}</div></TableCell>
                  <TableCell className="font-mono text-xs">{a.referralCode}</TableCell>
                  <TableCell><Badge variant={a.tier === "lifetime" ? "default" : "secondary"}>{a.tier}</Badge></TableCell>
                  <TableCell><Badge variant={a.status === "active" ? "default" : "destructive"}>{a.status}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{a.referralsActive}/{a.referralsTotal}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUsd(a.balances.pendingUsdMinor)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUsd(a.balances.confirmedUsdMinor)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUsd(a.balances.availableUsdMinor)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUsd(a.balances.lifetimeEarnedUsdMinor)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setTier.mutate({ id: a.id, tier: a.tier === "lifetime" ? "standard" : "lifetime" }, { onSuccess: refresh })}>
                        {a.tier === "lifetime" ? "→ standard" : "→ lifetime"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: a.id, status: a.status === "active" ? "suspended" : "active" }, { onSuccess: refresh })}>
                        {a.status === "active" ? "Suspend" : "Activate"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selected?.userName} — ambassador detail</DialogTitle></DialogHeader>
          {selected ? (
            <div className="space-y-4 text-sm">
              <div className="text-xs text-muted-foreground break-all">
                Code <span className="font-mono text-foreground">{selected.referralCode}</span> · Link{" "}
                <span className="font-mono">/study/signup?ref={selected.referralCode}</span> · Payout {selected.payoutMethod ?? "—"} {selected.payoutHandle ?? ""}
              </div>
              <div>
                <div className="font-semibold text-xs uppercase text-muted-foreground mb-1">
                  Referred customers ({referrals.data?.referrals.length ?? 0}) — who signed up via the link
                </div>
                {referrals.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <div className="border rounded max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Customer</TableHead><TableHead>Signed up</TableHead><TableHead>Plan</TableHead>
                        <TableHead className="text-right">Sessions</TableHead><TableHead className="text-right">Time</TableHead>
                        <TableHead>Last active</TableHead><TableHead>Status</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {(referrals.data?.referrals ?? []).map((r) => (
                          <TableRow key={r.referral_id}>
                            <TableCell><div className="text-xs font-medium">{r.name}</div><div className="text-[11px] text-muted-foreground">{r.email}</div></TableCell>
                            <TableCell className="text-xs">{fmtDate(r.signed_up_at)}</TableCell>
                            <TableCell><Badge variant={r.is_paid ? "default" : "secondary"}>{r.is_paid ? r.subscription_tier : "free"}</Badge></TableCell>
                            <TableCell className="text-right text-xs">{r.session_count}</TableCell>
                            <TableCell className="text-right text-xs">{fmtDuration(r.total_time_seconds)}</TableCell>
                            <TableCell className="text-xs">{fmtDate(r.last_active_at)}</TableCell>
                            <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
              <div>
                <div className="font-semibold text-xs uppercase text-muted-foreground mb-1">Commission ledger</div>
                <div className="border rounded max-h-48 overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>When</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>State</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(events.data?.events ?? []).map((ev, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{fmtDate(String(ev["createdAt"] ?? ""))}</TableCell>
                          <TableCell className="text-right text-xs">{fmtUsd(Number(ev["amountUsdMinor"] ?? 0))}</TableCell>
                          <TableCell className="text-xs">{String(ev["state"] ?? "")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayoutsQueue() {
  const [filter, setFilter] = useState("requested");
  const { data, isLoading } = useAdminPayouts(filter === "all" ? undefined : filter);
  const updatePayout = useAdminUpdatePayout();
  const qc = useQueryClient();
  function refresh() { qc.invalidateQueries({ queryKey: ["adminPayouts"] }); }
  const filters = ["requested", "processing", "paid", "failed", "all"];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {filters.map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "ghost"} onClick={() => setFilter(f)}>{f}</Button>
        ))}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (data?.payouts ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No payouts in this state.</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Ambassador</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead><TableHead>Requested</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data?.payouts ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell><div className="text-xs font-medium">{p.userName}</div><div className="text-[11px] text-muted-foreground">{p.referralCode}</div></TableCell>
                  <TableCell className="text-xs">{p.method}{p.handle ? ` · ${p.handle}` : ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUsd(p.amountUsdMinor)}</TableCell>
                  <TableCell><Badge variant={p.status === "paid" ? "default" : p.status === "failed" ? "destructive" : "secondary"}>{p.status}</Badge></TableCell>
                  <TableCell className="text-xs">{fmtDate(p.requestedAt)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      {p.status === "requested" ? <Button size="sm" variant="outline" onClick={() => updatePayout.mutate({ id: p.id, status: "processing" }, { onSuccess: refresh })}>Process</Button> : null}
                      {p.status !== "paid" ? <Button size="sm" variant="outline" onClick={() => updatePayout.mutate({ id: p.id, status: "paid" }, { onSuccess: refresh })}>Mark paid</Button> : null}
                      {p.status !== "failed" && p.status !== "paid" ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => updatePayout.mutate({ id: p.id, status: "failed" }, { onSuccess: refresh })}>Fail</Button> : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function AmbassadorsSection() {
  const [view, setView] = useState<"ambassadors" | "payouts">("ambassadors");
  const tabs: Array<{ id: typeof view; label: string }> = [
    { id: "ambassadors", label: "Ambassadors" },
    { id: "payouts", label: "Payouts" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {tabs.map((t) => <Button key={t.id} size="sm" variant={view === t.id ? "default" : "ghost"} onClick={() => setView(t.id)}>{t.label}</Button>)}
      </div>
      {view === "ambassadors" ? <AmbassadorsTracker /> : <PayoutsQueue />}
    </div>
  );
}

// ─── shell ───────────────────────────────────────────────────────────────────

// Activation funnel + return-rate, on data we already collect. Shows where
// learners fall out between signing up and forming a returning habit.
function ActivationSection() {
  const { data, isLoading } = useStudyAdminFunnel();
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const max = data.signups || 1;
  const stages = [
    { label: "Signed up", value: data.signups },
    { label: "Uploaded material", value: data.activated },
    { label: "Practiced or took an exam", value: data.engaged },
    { label: "Retained (active in last 7 days)", value: data.retained },
  ];
  const returnRate = data.eligible_return
    ? Math.round((data.returned_after_day1 / data.eligible_return) * 100)
    : 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stages.map((s, i) => (
          <Kpi key={s.label} label={s.label} value={s.value}
            sub={i === 0 ? "learners" : `${Math.round((s.value / max) * 100)}% of signups`} />
        ))}
      </div>
      <div className="rounded-lg border bg-card p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Activation funnel</div>
        <div className="space-y-3">
          {stages.map((s) => {
            const pct = Math.round((s.value / max) * 100);
            return (
              <div key={s.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{s.label}</span>
                  <span className="text-muted-foreground tabular-nums">{s.value} · {pct}%</span>
                </div>
                <div className="h-2.5 rounded bg-muted overflow-hidden">
                  <div className="h-full rounded bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Return rate" value={`${returnRate}%`} sub="active again after their first day" />
        <Kpi label="Old enough to return" value={data.eligible_return} sub="accounts older than 1 day" />
      </div>
    </div>
  );
}

const SECTIONS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, title: "Dashboard", subtitle: "Platform health, activity, and usage at a glance." },
  { id: "activation", label: "Activation", icon: Activity, title: "Activation & retention", subtitle: "Where learners drop off, from signup to a returning habit." },
  { id: "students", label: "Students", icon: Users, title: "Students", subtitle: "Accounts, sign-ins, device & location, and per-learner actions." },
  { id: "billing", label: "Billing", icon: CreditCard, title: "Billing", subtitle: "Subscription mix, plans, and payment methods." },
  { id: "ambassadors", label: "Ambassadors", icon: Gift, title: "Ambassadors", subtitle: "Referral tracker, who signed up via each link, commission balances, and payouts." },
  { id: "announcements", label: "Announcements", icon: Megaphone, title: "Announcements", subtitle: "Broadcast messages to learners." },
  { id: "access", label: "Access & audit", icon: ShieldCheck, title: "Access & audit", subtitle: "The audit trail of admin actions." },
  { id: "developers", label: "Developer API", icon: KeyRound, title: "Developer API", subtitle: "API keys for integrations." },
] as const;

export default function StudyAdminConsole() {
  const { user, loading, logout } = useStudyAuth();
  const [section, setSection] = useState<string>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldCheck className="w-10 h-10 text-muted-foreground" />
        <div className="font-semibold">Admin access required</div>
        <p className="text-sm text-muted-foreground">Your account doesn&apos;t have admin permissions.</p>
        <a href="/study/coach"><Button variant="outline"><ArrowLeft className="w-4 h-4 mr-1" /> Back to app</Button></a>
      </div>
    );
  }

  const meta = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  const Sidebar = (
    <aside className="w-60 shrink-0 flex-col border-r border-border bg-card flex">
      <div className="border-b border-border px-4 py-4">
        <div className="font-serif text-lg font-semibold text-primary">Coach Admin</div>
        <div className="text-[11px] text-muted-foreground">Platform console</div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.id} type="button" onClick={() => { setSection(s.id); setMobileNav(false); }}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${section === s.id ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted"}`}>
              <Icon className="h-4 w-4" /> {s.label}
            </button>
          );
        })}
      </nav>
      <div className="space-y-1 border-t border-border p-2">
        <a href="/study/coach" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
          <ArrowLeft className="h-4 w-4" /> Open learner app
        </a>
        <button type="button" onClick={() => logout()} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-[100dvh] w-full bg-muted/20">
      <div className="hidden md:flex">{Sidebar}</div>
      {mobileNav ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNav(false)} />
          <div className="relative flex">{Sidebar}</div>
        </div>
      ) : null}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-4 md:p-6">
          <div className="flex items-center gap-2 mb-4 md:hidden">
            <Button variant="outline" size="sm" onClick={() => setMobileNav(true)}><Menu className="w-4 h-4" /></Button>
            <span className="font-semibold">Coach Admin</span>
          </div>
          <SectionHeader title={meta.title} subtitle={meta.subtitle} />
          {section === "dashboard" && <DashboardSection />}
          {section === "activation" && <ActivationSection />}
          {section === "students" && <StudentsSection />}
          {section === "billing" && <BillingSection />}
          {section === "ambassadors" && <AmbassadorsSection />}
          {section === "announcements" && <AnnouncementsSection />}
          {section === "access" && <AccessAuditSection />}
          {section === "developers" && <DeveloperApiSection />}
        </div>
      </main>
    </div>
  );
}
