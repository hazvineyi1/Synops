import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users as UsersIcon,
  Building,
  GraduationCap,
  LogIn,
  ShieldAlert,
  KeyRound,
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

function OverviewTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform", "overview"],
    queryFn: () => platformApi.overview(),
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  const cards = [
    { label: "Total users", value: data.users.total, icon: UsersIcon },
    { label: "Active", value: data.users.active, icon: UsersIcon },
    { label: "Suspended", value: data.users.suspended, icon: ShieldAlert },
    { label: "No password set", value: data.users.noPassword, icon: KeyRound },
    { label: "Partners", value: data.partners, icon: Building },
    { label: "Organisations", value: data.organisations, icon: Building },
    { label: "Enrolments", value: data.enrolments, icon: GraduationCap },
    { label: "Logins (24h)", value: data.logins24h, icon: LogIn, sub: `${data.failedLogins24h} failed` },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-bold tracking-tight">{c.value}</div>
            {c.sub && <div className="text-xs text-muted-foreground mt-1">{c.sub}</div>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ───────────────────────────── Users ───────────────────────────── */

function UsersTab({ onOpen }: { onOpen: (u: PlatformUserRow) => void }) {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["platform", "users", q],
    queryFn: () => platformApi.listUsers(q),
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

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
    onSuccess: (r) => setResetLink(r.link),
    onError: (e: unknown) => toast({ title: "Could not create reset link", description: e instanceof Error ? e.message : "", variant: "destructive" }),
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

function AuditTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform", "audit"],
    queryFn: () => platformApi.audit(150),
  });

  return (
    <Card>
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

export function PlatformConsole() {
  const [tab, setTab] = useState<TabId>("overview");
  const [selected, setSelected] = useState<PlatformUserRow | null>(null);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight">Platform Console</h1>
        <p className="text-muted-foreground">Manage every account, session, and key across the platform.</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "users" && <UsersTab onOpen={setSelected} />}
      {tab === "activity" && <ActivityTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "keys" && <ApiKeysTab />}

      <UserDialog user={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
