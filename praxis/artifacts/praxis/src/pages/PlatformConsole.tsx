import React, { useState } from "react";
import { Redirect } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  UserCog,
  Copy,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/context/SessionContext";
import {
  platformApi,
  type PlatformUserRow,
  type Role,
} from "@/lib/platformApi";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "activity", label: "Login activity" },
  { id: "audit", label: "Audit log" },
  { id: "access", label: "Access requests" },
  { id: "prompts", label: "Prompt templates" },
  { id: "keys", label: "API keys" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const ROLES: Role[] = ["super_admin", "partner_admin", "org_admin", "coach", "learner"];

function roleLabel(r: string) {
  return r.replace(/_/g, " ");
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    suspended: "bg-red-500/15 text-red-600 border-red-500/30",
    invited: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${map[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {status}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const good = outcome === "success";
  const impersonated = outcome === "impersonated";
  const cls = good
    ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
    : impersonated
      ? "bg-indigo-500/15 text-indigo-600 border-indigo-500/30"
      : "bg-red-500/15 text-red-600 border-red-500/30";
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>{outcome.replace(/_/g, " ")}</span>;
}

/* ───────────────────────────── Overview ───────────────────────────── */

/** Stat card ported from Sokratify's SuperAdmin: white surface, serif value, warm labels. */
function StatCard({ label, value, sub, accent = "hsl(60 5% 14%)" }: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className="rounded-lg p-5 flex flex-col gap-1" style={{ background: "#fff", border: "1px solid hsl(43 15% 90%)" }}>
      <p className="text-2xl font-serif font-normal" style={{ color: accent }}>{value}</p>
      <p className="text-xs font-medium" style={{ color: "hsl(43 10% 45%)" }}>{label}</p>
      {sub && <p className="text-xs" style={{ color: "hsl(43 10% 58%)" }}>{sub}</p>}
    </div>
  );
}

function OverviewTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform", "overview"],
    queryFn: () => platformApi.overview(),
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    );
  }

  const failedAccent = data.failedLogins24h > 0 ? "hsl(0 65% 45%)" : "hsl(60 5% 14%)";

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total users" value={data.users.total} sub={`${data.users.active} active`} />
        <StatCard label="Partners" value={data.partners} />
        <StatCard label="Organisations" value={data.organisations} />
        <StatCard label="Enrolments" value={data.enrolments} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Logins (24h)" value={data.logins24h} />
        <StatCard label="Failed logins (24h)" value={data.failedLogins24h} accent={failedAccent} />
        <StatCard label="Invited (no password)" value={data.users.noPassword} />
        <StatCard label="Suspended" value={data.users.suspended} accent={data.users.suspended > 0 ? "hsl(0 65% 45%)" : "hsl(60 5% 14%)"} />

        {/* Users-by-status breakdown, mirroring Sokratify's plan-breakdown card */}
        <div className="rounded-lg p-5 col-span-2 lg:col-span-2" style={{ background: "#fff", border: "1px solid hsl(43 15% 90%)" }}>
          <p className="text-xs font-medium mb-3" style={{ color: "hsl(43 10% 45%)" }}>Users by status</p>
          <div className="space-y-2">
            {([
              ["Active", data.users.active, "hsl(145 45% 42%)"],
              ["Invited", data.users.invited, "hsl(38 80% 50%)"],
              ["Suspended", data.users.suspended, "hsl(0 65% 55%)"],
            ] as const).map(([k, v, dot]) => {
              const pct = data.users.total > 0 ? Math.round((Number(v) / data.users.total) * 100) : 0;
              return (
                <div key={k}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs flex items-center gap-2" style={{ color: "hsl(43 10% 45%)" }}>
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: dot }} />
                      {k}
                    </span>
                    <span className="text-sm font-medium" style={{ color: "hsl(60 5% 14%)" }}>{v}</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: "hsl(43 15% 92%)" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: dot }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* System health, mirroring Sokratify's health card */}
        <div className="rounded-lg p-5 col-span-2 lg:col-span-2" style={{ background: "#fff", border: "1px solid hsl(43 15% 90%)" }}>
          <p className="text-xs font-medium mb-3" style={{ color: "hsl(43 10% 45%)" }}>System health</p>
          <div className="space-y-2">
            {([
              ["Authentication", data.failedLogins24h === 0 ? "Healthy" : "Failed attempts logged", data.failedLogins24h === 0],
              ["Accounts", data.users.suspended === 0 ? "None suspended" : `${data.users.suspended} suspended`, data.users.suspended === 0],
              ["Onboarding", data.users.noPassword === 0 ? "All activated" : `${data.users.noPassword} pending`, data.users.noPassword === 0],
            ] as const).map(([k, v, ok]) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "hsl(43 10% 45%)" }}>{k}</span>
                <span className="text-xs flex items-center gap-1.5" style={{ color: ok ? "hsl(145 45% 38%)" : "hsl(38 70% 42%)" }}>
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: ok ? "hsl(145 45% 42%)" : "hsl(38 80% 50%)" }} />
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Users ───────────────────────────── */

const CREATE_ROLES = ["super_admin", "partner_admin", "org_admin", "coach", "learner", "instructional_designer", "funder"] as const;

function UsersTab({ onOpen }: { onOpen: (u: PlatformUserRow) => void }) {
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["platform", "users", q],
    queryFn: () => platformApi.listUsers(q),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", role: "learner" });
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [createdEmailed, setCreatedEmailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const create = useMutation({
    mutationFn: () => platformApi.createUser({
      email: form.email.trim(), firstName: form.firstName.trim() || undefined,
      lastName: form.lastName.trim() || undefined, role: form.role,
    }),
    onSuccess: (r) => {
      setCreatedLink(r.link);
      setCreatedEmailed(!!r.emailed);
      qc.invalidateQueries({ queryKey: ["platform", "users"] });
      toast({ title: "User created", description: r.emailed ? `Set-password link emailed to ${r.email}.` : `${r.email} — send them the set-password link below.` });
    },
    onError: (e: unknown) => toast({ title: "Could not create user", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });
  const resetCreate = () => { setForm({ email: "", firstName: "", lastName: "", role: "learner" }); setCreatedLink(null); setCreatedEmailed(false); setCopied(false); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => { resetCreate(); setCreateOpen(true); }}>Create user</Button>
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetCreate(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create user</DialogTitle></DialogHeader>
          {createdLink ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{createdEmailed
                ? "Account created and the set-password link was emailed to them. You can also copy it below (expires in 1 hour)."
                : "Account created. Send this one-time set-password link (expires in 1 hour). They set a password, then sign in."}</p>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
                <code className="flex-1 truncate text-xs">{createdLink}</code>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={async () => { await navigator.clipboard.writeText(createdLink).catch(() => {}); setCopied(true); }}>
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => resetCreate()}>Create another</Button>
                <Button onClick={() => { setCreateOpen(false); resetCreate(); }}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Email</span>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="person@org.co.za" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">First name</span>
                  <Input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} /></label>
                <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Last name</span>
                  <Input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} /></label>
              </div>
              <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Role</span>
                <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CREATE_ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{roleLabel(r)}</SelectItem>)}
                  </SelectContent>
                </Select></label>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button disabled={!form.email.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Creating…" : "Create user"}</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="font-medium px-4 py-3">Name</th>
                <th className="font-medium px-4 py-3">Role</th>
                <th className="font-medium px-4 py-3">Status</th>
                <th className="font-medium px-4 py-3">Last login</th>
                <th className="font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-4 py-3" colSpan={5}><Skeleton className="h-5 w-full" /></td>
                  </tr>
                ))
              ) : !data || data.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No users found.</td></tr>
              ) : (
                data.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border/50 hover:bg-muted/40 cursor-pointer"
                    onClick={() => onOpen(u)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-4 py-3 capitalize">{roleLabel(u.role)}</td>
                    <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{timeAgo(u.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm"><UserCog className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ─────────────────────── User detail + actions dialog ─────────────────────── */

function UserDialog({
  user,
  onClose,
}: {
  user: PlatformUserRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user: me } = useSession();
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: detail } = useQuery({
    queryKey: ["platform", "user", user?.id],
    queryFn: () => platformApi.getUser(user!.id),
    enabled: !!user,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["platform", "users"] });
    qc.invalidateQueries({ queryKey: ["platform", "user", user?.id] });
    qc.invalidateQueries({ queryKey: ["platform", "overview"] });
  };

  // A single mutation drives suspend / reactivate / revoke. Keeping it as one hook
  // (rather than a helper that calls useMutation N times) keeps hook order stable.
  const action = useMutation({
    mutationFn: (kind: "suspend" | "reactivate" | "revoke") =>
      kind === "suspend"
        ? platformApi.suspend(user!.id)
        : kind === "reactivate"
          ? platformApi.reactivate(user!.id)
          : platformApi.revokeSessions(user!.id),
    onSuccess: (_data, kind) => {
      toast({ title: kind === "suspend" ? "User suspended" : kind === "reactivate" ? "User reactivated" : "All sessions revoked" });
      invalidate();
    },
    onError: (e: unknown) => toast({ title: "Action failed", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  const roleMut = useMutation({
    mutationFn: (role: Role) => platformApi.setRole(user!.id, role),
    onSuccess: () => { toast({ title: "Role updated" }); invalidate(); },
    onError: (e: unknown) => toast({ title: "Could not change role", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  const impersonate = useMutation({
    mutationFn: () => platformApi.impersonate(user!.id),
    onSuccess: () => { window.location.href = "/dashboard"; },
    onError: (e: unknown) => toast({ title: "Could not impersonate", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  const makeResetLink = useMutation({
    mutationFn: () => platformApi.resetLink(user!.id),
    onSuccess: (r) => { setResetLink(r.link); if (r.emailed) toast({ title: "Reset link emailed", description: r.email }); },
    onError: (e: unknown) => toast({ title: "Could not create reset link", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: () => platformApi.deleteUser(user!.id),
    onSuccess: () => { toast({ title: "User deleted" }); invalidate(); onClose(); },
    onError: (e: unknown) => toast({ title: "Could not delete user", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  if (!user) return null;
  const isSelf = me?.id === user.id;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
  const activeSessions = detail?.sessions?.length ?? 0;

  const copyLink = async () => {
    if (!resetLink) return;
    await navigator.clipboard.writeText(resetLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) { setResetLink(null); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {name}
            <StatusBadge status={user.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-muted-foreground text-xs">Email</div>{user.email}</div>
            <div><div className="text-muted-foreground text-xs">Last login</div>{timeAgo(user.lastLoginAt)}</div>
            <div><div className="text-muted-foreground text-xs">Active sessions</div>{activeSessions}</div>
            <div><div className="text-muted-foreground text-xs">Password set</div>{user.hasPassword ? "Yes" : "No"}</div>
          </div>

          <div>
            <div className="text-muted-foreground text-xs mb-1">Role</div>
            <Select
              defaultValue={user.role}
              onValueChange={(v) => roleMut.mutate(v as Role)}
              disabled={isSelf}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{roleLabel(r)}</SelectItem>)}
              </SelectContent>
            </Select>
            {isSelf && <p className="text-xs text-muted-foreground mt-1">You cannot change your own role here.</p>}
          </div>

          {resetLink && (
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
              <div className="text-xs font-medium text-indigo-600 mb-1">One-time reset link (expires in 1 hour)</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs bg-background rounded px-2 py-1 border">{resetLink}</code>
                <Button size="sm" variant="outline" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {detail?.logins && detail.logins.length > 0 && (
            <div>
              <div className="text-muted-foreground text-xs mb-1">Recent sign-in attempts</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {detail.logins.slice(0, 6).map((l) => (
                  <div key={l.id} className="flex items-center justify-between text-xs">
                    <OutcomeBadge outcome={l.outcome} />
                    <span className="text-muted-foreground">{l.ipAddress ?? "—"} · {timeAgo(l.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-start">
          <Button
            size="sm"
            onClick={() => impersonate.mutate()}
            disabled={isSelf || impersonate.isPending}
          >
            Impersonate
          </Button>
          <Button size="sm" variant="outline" onClick={() => makeResetLink.mutate()} disabled={makeResetLink.isPending}>
            Reset link
          </Button>
          <Button size="sm" variant="outline" onClick={() => action.mutate("revoke")} disabled={action.isPending}>
            Revoke sessions
          </Button>
          {user.status === "suspended" ? (
            <Button size="sm" variant="outline" onClick={() => action.mutate("reactivate")} disabled={action.isPending}>
              Reactivate
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => action.mutate("suspend")}
              disabled={isSelf || action.isPending}
            >
              Suspend
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            disabled={isSelf || del.isPending}
            onClick={() => { if (window.confirm(`Permanently delete ${name}? This removes their login, sessions and enrolments. This cannot be undone.`)) del.mutate(); }}
          >
            {del.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Login activity ───────────────────────── */

function ActivityTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform", "activity"],
    queryFn: () => platformApi.loginActivity(150),
  });

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="font-medium px-4 py-3">Email</th>
              <th className="font-medium px-4 py-3">Outcome</th>
              <th className="font-medium px-4 py-3">IP</th>
              <th className="font-medium px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50"><td colSpan={4} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
              ))
            ) : !data || data.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No sign-in activity yet.</td></tr>
            ) : (
              data.map((l) => (
                <tr key={l.id} className="border-b border-border/50">
                  <td className="px-4 py-3">{l.email ?? "—"}</td>
                  <td className="px-4 py-3"><OutcomeBadge outcome={l.outcome} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{l.ipAddress ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{timeAgo(l.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ───────────────────────── Audit log ───────────────────────── */

/* ───────────────────────── Prompt templates ───────────────────────── */

function PromptTemplatesTab() {
  const qc = useQueryClient();
  const { data: orgs } = useQuery({ queryKey: ["platform", "orgs"], queryFn: () => platformApi.orgOptions() });
  const [orgId, setOrgId] = useState("");
  const { data: templates } = useQuery({
    queryKey: ["platform", "prompt-templates", orgId],
    queryFn: () => platformApi.promptTemplates(orgId),
    enabled: !!orgId,
  });
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [promptText, setPromptText] = useState("");

  const create = useMutation({
    mutationFn: () => platformApi.createPromptTemplate(orgId, { title, category: category || undefined, promptText }),
    onSuccess: () => {
      setTitle("");
      setCategory("");
      setPromptText("");
      qc.invalidateQueries({ queryKey: ["platform", "prompt-templates", orgId] });
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => platformApi.deletePromptTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform", "prompt-templates", orgId] }),
  });

  const selCls = "w-full h-10 rounded-md border border-input bg-background px-3 text-sm";

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={selCls}>
          <option value="">Select an organisation…</option>
          {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </Card>

      {orgId && (
        <>
          <Card className="p-4 space-y-3">
            <p className="font-medium text-sm">New template</p>
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} />
            <textarea
              placeholder="Prompt text — a reusable Socratic system-prompt snippet for this organisation"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button size="sm" onClick={() => create.mutate()} disabled={!title || !promptText || create.isPending}>Add template</Button>
          </Card>

          <Card className="divide-y divide-border">
            {(templates ?? []).length === 0 ? (
              <div className="px-4 py-10 text-center text-muted-foreground">No templates for this organisation yet.</div>
            ) : (
              (templates ?? []).map((t) => (
                <div key={t.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t.title} <span className="text-xs text-muted-foreground font-normal">· {t.category}</span>
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1 whitespace-pre-wrap">{t.promptText}</p>
                    {t.createdByName && <p className="text-xs text-muted-foreground/70 mt-1">by {t.createdByName}</p>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => del.mutate(t.id)} className="text-red-600 shrink-0">Delete</Button>
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Access requests ───────────────────────── */

function AccessRequestsTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const { data, isLoading } = useQuery({
    queryKey: ["platform", "access-requests", status],
    queryFn: () => platformApi.accessRequests(status || undefined),
  });
  const review = useMutation({
    mutationFn: (v: { id: string; status: "approved" | "denied" }) => platformApi.reviewAccessRequest(v.id, v.status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform", "access-requests"] }),
  });

  return (
    <Card>
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
          <option value="">All</option>
        </select>
      </div>
      <div className="divide-y divide-border">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : !data || data.length === 0 ? (
          <div className="px-4 py-10 text-center text-muted-foreground">No {status || ""} requests.</div>
        ) : (
          data.map((r) => (
            <div key={r.id} className="p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium">
                  {r.firstName} {r.lastName ?? ""}
                  <span className="text-muted-foreground font-normal"> · {r.email}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {r.organisationName ?? "—"} · wants {roleLabel(r.requestedRole)} · {timeAgo(r.createdAt)}
                </p>
                {r.message && <p className="text-sm mt-1">{r.message}</p>}
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {r.status === "pending" ? (
                  <>
                    <Button size="sm" onClick={() => review.mutate({ id: r.id, status: "approved" })} disabled={review.isPending}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => review.mutate({ id: r.id, status: "denied" })} disabled={review.isPending}>Deny</Button>
                  </>
                ) : (
                  <Badge variant="secondary" className="capitalize">{r.status}</Badge>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function AuditTab() {
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [since, setSince] = useState(0);
  const { data: opts } = useQuery({ queryKey: ["platform", "audit-actions"], queryFn: () => platformApi.auditActions() });
  const { data, isLoading } = useQuery({
    queryKey: ["platform", "audit", action, resourceType, since],
    queryFn: () => platformApi.audit({ action: action || undefined, resourceType: resourceType || undefined, since: since || undefined, limit: 300 }),
  });
  const selCls = "h-9 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 p-4 border-b border-border">
        <select value={action} onChange={(e) => setAction(e.target.value)} className={selCls}>
          <option value="">All actions</option>
          {(opts?.actions ?? []).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={resourceType} onChange={(e) => setResourceType(e.target.value)} className={selCls}>
          <option value="">All resources</option>
          {(opts?.resourceTypes ?? []).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={since} onChange={(e) => setSince(Number(e.target.value))} className={selCls}>
          <option value={0}>All time</option>
          <option value={1}>Last 24h</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>
        <a
          href={platformApi.auditExportUrl({ action: action || undefined, resourceType: resourceType || undefined, since: since || undefined })}
          className="ml-auto inline-flex items-center h-9 px-3 rounded-md border border-input text-sm font-medium hover:bg-muted/50"
        >
          Export CSV
        </a>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="font-medium px-4 py-3">Action</th>
              <th className="font-medium px-4 py-3">Resource</th>
              <th className="font-medium px-4 py-3">Actor</th>
              <th className="font-medium px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50"><td colSpan={4} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
              ))
            ) : !data || data.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No audit events yet.</td></tr>
            ) : (
              data.map((a) => (
                <tr key={a.id} className="border-b border-border/50">
                  <td className="px-4 py-3"><Badge variant="secondary" className="font-mono text-xs">{a.action}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground">{a.resourceType}{a.resourceId ? ` · ${a.resourceId.slice(0, 8)}` : ""}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{a.actorRole ? roleLabel(a.actorRole) : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{timeAgo(a.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ───────────────────────── API keys ───────────────────────── */

function ApiKeysTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["platform", "keys"],
    queryFn: () => platformApi.listApiKeys(),
  });

  const create = useMutation({
    mutationFn: () => platformApi.createApiKey(name.trim()),
    onSuccess: (r) => { setNewKey(r.key); setName(""); qc.invalidateQueries({ queryKey: ["platform", "keys"] }); },
    onError: (e: unknown) => toast({ title: "Could not create key", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => platformApi.revokeApiKey(id),
    onSuccess: () => { toast({ title: "Key revoked" }); qc.invalidateQueries({ queryKey: ["platform", "keys"] }); },
  });

  const copyKey = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 max-w-md">
        <Input placeholder="New key name (e.g. Reporting export)" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>Create</Button>
      </div>

      {newKey && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 max-w-2xl">
          <div className="text-xs font-medium text-emerald-600 mb-1">Copy this key now — it is shown only once.</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate text-xs bg-background rounded px-2 py-1 border">{newKey}</code>
            <Button size="sm" variant="outline" onClick={copyKey}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button>
          </div>
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="font-medium px-4 py-3">Name</th>
                <th className="font-medium px-4 py-3">Prefix</th>
                <th className="font-medium px-4 py-3">Last used</th>
                <th className="font-medium px-4 py-3">Status</th>
                <th className="font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50"><td colSpan={5} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
                ))
              ) : !data || data.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No API keys yet.</td></tr>
              ) : (
                data.map((k) => (
                  <tr key={k.id} className="border-b border-border/50">
                    <td className="px-4 py-3 font-medium">{k.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{k.prefix}…</td>
                    <td className="px-4 py-3 text-muted-foreground">{timeAgo(k.lastUsedAt)}</td>
                    <td className="px-4 py-3">
                      {k.revokedAt
                        ? <span className="text-xs text-red-600">revoked</span>
                        : <span className="text-xs text-emerald-600">active</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!k.revokedAt && (
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => revoke.mutate(k.id)}>Revoke</Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ───────────────────────────── Page ───────────────────────────── */

const SECTION_SUBTITLE: Record<TabId, string> = {
  overview: "Real-time stats across every tenant on the platform.",
  users: "Search, impersonate, and manage every account.",
  activity: "Recent sign-ins and failed attempts.",
  audit: "Immutable record of administrative actions.",
  access: "Review and approve inbound access requests.",
  prompts: "Reusable Socratic system-prompt snippets, per organisation.",
  keys: "Programmatic API keys for partner integrations.",
};

export function PlatformConsole() {
  const { user } = useSession();
  const [tab, setTab] = useState<TabId>("overview");
  const [selected, setSelected] = useState<PlatformUserRow | null>(null);

  // Belt-and-braces: every /platform/* endpoint is guarded by requireSuperAdmin, but keep
  // non-super users out of the console entirely.
  if (user && user.role !== "super_admin") {
    return <Redirect to="/dashboard" />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-serif font-bold tracking-tight" style={{ color: "hsl(60 5% 14%)" }}>
          {tab === "overview" ? "Platform overview" : (TABS.find((t) => t.id === tab)?.label ?? "Platform")}
        </h1>
        <p className="text-sm mt-1" style={{ color: "hsl(43 10% 45%)" }}>{SECTION_SUBTITLE[tab]}</p>
      </div>

      {/* Section nav — kept as a tab bar so the console lives inside the one app shell. */}
      <div className="flex gap-1 border-b" style={{ borderColor: "hsl(43 15% 88%)" }}>
        {TABS.map((tItem) => (
          <button
            key={tItem.id}
            onClick={() => setTab(tItem.id)}
            className="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={
              tab === tItem.id
                ? { borderColor: "hsl(222 47% 20%)", color: "hsl(60 5% 14%)" }
                : { borderColor: "transparent", color: "hsl(43 10% 50%)" }
            }
          >
            {tItem.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "users" && <UsersTab onOpen={setSelected} />}
      {tab === "activity" && <ActivityTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "access" && <AccessRequestsTab />}
      {tab === "prompts" && <PromptTemplatesTab />}
      {tab === "keys" && <ApiKeysTab />}

      <UserDialog user={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
