import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useStudyAdminOverview,
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
  type AdminUserRow,
  type AdminUpgradeTarget,
} from "@/hooks/use-study-api";
import { useStudyAuth } from "@/hooks/use-study-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Loader2, Users, Activity, Target, LogIn, Megaphone,
  CreditCard, DollarSign, ShieldCheck, Search, Download, Plus, Trash2,
} from "lucide-react";

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
  a.href = url;
  a.download = filename;
  a.click();
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

// ─── sections ────────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data: ov } = useStudyAdminOverview();
  const { data: usage } = useStudyAdminUsage();
  const { data: bd } = useStudyAdminBreakdown();
  const maxUsage = Math.max(1, ...(usage ?? []).map((u) => u.events));

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
              <div
                key={u.day}
                className="flex-1 bg-primary/70 hover:bg-primary rounded-t"
                style={{ height: `${(u.events / maxUsage) * 100}%`, minHeight: 2 }}
                title={`${u.day}: ${u.events} events · ${u.active_users} active · ${u.new_users} new`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{usage?.[0]?.day}</span>
            <span>{usage?.[usage.length - 1]?.day}</span>
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

function UsersTab() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { data: users, isLoading } = useStudyAdminUsers(q);
  const detail = useStudyAdminUserDetail(selected);
  const action = useStudyAdminUserAction();
  const createUser = useStudyAdminCreateUser();
  const deleteUser = useStudyAdminDeleteUser();
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
                <option value="free">free</option>
                <option value="plus">plus</option>
                <option value="pro">pro</option>
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
                <TableHead>User</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Time</TableHead>
                <TableHead className="text-right">Materials</TableHead>
                <TableHead className="text-right">Practice</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead>Joined</TableHead>
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
                  <TableCell className="text-right tabular-nums">{u.practice_count}</TableCell>
                  <TableCell className="text-xs">{fmtDate(u.last_active_at)}</TableCell>
                  <TableCell className="text-xs">{fmtDate(u.created_at)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
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
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="outline" onClick={() => runAction(String(detail.data!.user["id"]), "set-admin", !detail.data!.user["is_admin"])}>
                    {detail.data.user["is_admin"] ? "Revoke admin" : "Make admin"}
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

function UpgradeTargetsTab() {
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
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Time</TableHead>
                <TableHead className="text-right">Materials</TableHead>
                <TableHead className="text-right">Practice</TableHead>
                <TableHead>Last active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(targets ?? []).map((t: AdminUpgradeTarget) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.email}{t.billing_country ? ` · ${t.billing_country}` : ""}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={t.engagement_score >= 20 ? "default" : "secondary"}>{t.engagement_score}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{t.session_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtDuration(t.total_time_seconds)}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.material_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.practice_count}</TableCell>
                  <TableCell className="text-xs">
                    {t.days_since_active == null ? "—" : t.days_since_active === 0 ? "today" : `${t.days_since_active}d ago`}
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

function LoginsTab() {
  const { data: logins, isLoading } = useStudyAdminLogins();
  return isLoading ? (
    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
  ) : (
    <div className="border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Plan</TableHead>
            <TableHead className="text-right">Duration</TableHead><TableHead>Device</TableHead>
            <TableHead>Location</TableHead><TableHead>IP</TableHead>
          </TableRow>
        </TableHeader>
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

function AnnouncementsTab() {
  const { data } = useStudyAdminAnnouncements();
  const create = useStudyCreateAnnouncement();
  const update = useStudyUpdateAnnouncement();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");

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
            <option value="all">Everyone</option>
            <option value="free">Free users (upgrade nudge)</option>
            <option value="paid">Paid users</option>
          </select>
          <Button className="w-full" onClick={submit} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Publish"}
          </Button>
        </CardContent>
      </Card>
      <div className="md:col-span-2 space-y-2">
        {(data?.announcements ?? []).map((a) => (
          <Card key={a.id}>
            <CardContent className="p-3 flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-sm flex items-center gap-2">
                  {a.title}
                  <Badge variant="outline">{a.audience}</Badge>
                  {!a.active ? <Badge variant="secondary">inactive</Badge> : null}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{a.body}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => update.mutate({ id: a.id, active: !a.active }, { onSuccess: refresh })}>
                {a.active ? "Deactivate" : "Reactivate"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PricingTab() {
  const { data } = useStudyAdminPlans();
  const create = useStudyCreatePlan();
  const update = useStudyUpdatePlan();
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [priceMajor, setPriceMajor] = useState("");
  function refresh() { qc.invalidateQueries({ queryKey: ["studyAdminPlans"] }); }
  function add() {
    if (!key.trim() || !name.trim()) return;
    create.mutate({ key, name, priceMinor: Math.round(Number(priceMajor || 0) * 100) }, { onSuccess: () => { setKey(""); setName(""); setPriceMajor(""); refresh(); } });
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="text-xs">Key</label><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="pro" /></div>
        <div><label className="text-xs">Name</label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pro" /></div>
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
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => update.mutate({ id: p.id, active: !p.active }, { onSuccess: refresh })}>
                    {p.active ? "Active" : "Inactive"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PaymentsTab() {
  const { data } = useStudyAdminPaymentMethods();
  const create = useStudyCreatePaymentMethod();
  const update = useStudyUpdatePaymentMethod();
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [provider, setProvider] = useState("");
  function refresh() { qc.invalidateQueries({ queryKey: ["studyAdminPaymentMethods"] }); }
  function add() {
    if (!key.trim() || !label.trim() || !provider.trim()) return;
    create.mutate({ key, label, provider }, { onSuccess: () => { setKey(""); setLabel(""); setProvider(""); refresh(); } });
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="text-xs">Key</label><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="ecocash" /></div>
        <div><label className="text-xs">Label</label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="EcoCash" /></div>
        <div><label className="text-xs">Provider</label><Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="paynow" /></div>
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
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => update.mutate({ id: m.id, enabled: !m.enabled }, { onSuccess: refresh })}>
                    {m.enabled ? "Enabled" : "Disabled"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AuditTab() {
  const { data } = useStudyAdminAudit();
  return (
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
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function StudyAdminConsole() {
  const { user, loading } = useStudyAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldCheck className="w-10 h-10 text-muted-foreground" />
        <div className="font-semibold">Admin access required</div>
        <p className="text-sm text-muted-foreground">Your account doesn&apos;t have admin permissions.</p>
        <Link href="/dashboard"><Button variant="outline"><ArrowLeft className="w-4 h-4 mr-1" /> Back to app</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">Coach Admin</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/coupons"><Button variant="ghost" size="sm">Coupons</Button></Link>
            <Link href="/admin/ambassadors"><Button variant="ghost" size="sm">Ambassadors</Button></Link>
            <Link href="/dashboard"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> App</Button></Link>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="overview"><Activity className="w-4 h-4 mr-1" /> Overview</TabsTrigger>
            <TabsTrigger value="users"><Users className="w-4 h-4 mr-1" /> Users</TabsTrigger>
            <TabsTrigger value="targets"><Target className="w-4 h-4 mr-1" /> Upgrade targets</TabsTrigger>
            <TabsTrigger value="logins"><LogIn className="w-4 h-4 mr-1" /> Logins</TabsTrigger>
            <TabsTrigger value="announce"><Megaphone className="w-4 h-4 mr-1" /> Announcements</TabsTrigger>
            <TabsTrigger value="pricing"><DollarSign className="w-4 h-4 mr-1" /> Pricing</TabsTrigger>
            <TabsTrigger value="payments"><CreditCard className="w-4 h-4 mr-1" /> Payments</TabsTrigger>
            <TabsTrigger value="audit"><ShieldCheck className="w-4 h-4 mr-1" /> Audit</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4"><OverviewTab /></TabsContent>
          <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
          <TabsContent value="targets" className="mt-4"><UpgradeTargetsTab /></TabsContent>
          <TabsContent value="logins" className="mt-4"><LoginsTab /></TabsContent>
          <TabsContent value="announce" className="mt-4"><AnnouncementsTab /></TabsContent>
          <TabsContent value="pricing" className="mt-4"><PricingTab /></TabsContent>
          <TabsContent value="payments" className="mt-4"><PaymentsTab /></TabsContent>
          <TabsContent value="audit" className="mt-4"><AuditTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
