import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchMeta } from '@/lib/api';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Users, Check, X, Send, ShieldCheck, KeyRound, Ban, RotateCcw,
  Clock, Settings2, UserPlus, CheckCircle2, Info, Eye, Archive, Trash2, Building2, Copy, Search,
} from 'lucide-react';
import { getActivePartnerId, DELEGATABLE_POWERS, type Invite } from '@/lib/partnerHubData';

// A real account row from GET /partners/:id/members.
interface Member { id: string; name: string; email: string; role: string; status: string; orgName: string | null; organisationId: string | null; archived?: boolean; deleted?: boolean; updatedAt: string }
interface DelegatedAdmin { id: string; name: string; email: string; orgName: string | null; powers: string[]; status: string; createdAt: string }
interface OrgLite { id: string; name: string; partnerId: string | null }
interface LoginEv { at: string; outcome: string; ip: string; device: string; impersonated: boolean }

const CAPS = [
  'View all organisations',
  'Financial Hub & invoicing',
  'Funders Hub & agreements',
  'Create org / coach accounts',
  'Create learner accounts',
  'Manage course catalog',
  'Deliver & grade courses',
  'Consume courses',
] as const;
type Tier = 'Partner' | 'Coach' | 'Org-admin' | 'Learner';
const MATRIX: Record<Tier, boolean[]> = {
  Partner:   [true, true, true, true, true, true, true, false],
  Coach:     [false, false, false, true, true, true, true, false],
  'Org-admin': [false, false, false, false, true, true, true, false],
  Learner:   [false, false, false, false, false, false, false, true],
};
const TIER_NOTE: Record<Tier, string> = {
  Partner: 'Top-level account. Owns Financial Hub, Funders Hub, branding and platform admin.',
  Coach: 'Delegated provisioning tier. Creates and manages Organisation accounts.',
  'Org-admin': 'Manages Learners, catalog and activities for its own cohort.',
  Learner: 'End user. Consumes courses and generates progress data.',
};

const roleBadge = (r: string) =>
  r === 'org_admin' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
    : 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300';

/**
 * Accounts & Roles (spec §2, upgrade §5/§8). Provisioning and lifecycle for every account below
 * the Partner tier: the role/permission matrix, invites, and now per-account controls (password
 * reset, login help, suspend/reactivate, login-activity history) plus delegated organisation
 * admins - a junior admin scoped to one organisation with only the powers the Partner grants.
 */
export function PartnerAccounts() {
  const { user } = useSession();
  const partnerId = user?.partnerId ?? getActivePartnerId();
  const isSuper = user?.role === 'super_admin';
  const qc = useQueryClient();

  // Real accounts belonging to this partner. Paged server-side: a debounced search hits the backend
  // (so it finds people beyond the current page), and Load more raises the page size. The true total
  // comes from the X-Total-Count header, so a large partner is never silently truncated.
  const [search, setSearch] = useState('');
  const [q, setQ] = useState(''); // debounced search actually sent to the server
  const [limit, setLimit] = useState(500);
  React.useEffect(() => {
    const t = window.setTimeout(() => { setQ(search.trim()); setLimit(500); }, 300);
    return () => window.clearTimeout(t);
  }, [search]);
  const { data: membersMeta, isLoading: membersLoading } = useQuery({
    queryKey: ['partner-members', partnerId, q, limit],
    queryFn: () => apiFetchMeta<Member[]>(
      `/partners/${partnerId}/members?limit=${limit}${q ? `&search=${encodeURIComponent(q)}` : ''}`,
    ),
    enabled: !!partnerId,
  });
  const accounts: Member[] = membersMeta?.data ?? [];
  const totalAccounts: number | null = membersMeta?.total ?? null;
  const hasMore = totalAccounts != null && accounts.length < totalAccounts && limit < 2000;

  // Real organisations for the invite / delegate dropdowns.
  const { data: orgsData } = useQuery({ queryKey: ['organisations'], queryFn: () => apiFetch<OrgLite[]>('/organisations') });
  // A super admin has no partnerId of their own, so the backend already returns every org they may
  // administer; only a partner-scoped admin needs the extra client-side narrowing. (This was the bug
  // that left the invite dropdown empty for super admins.)
  const orgs = isSuper ? (orgsData ?? []) : (orgsData ?? []).filter((o) => o.partnerId === partnerId);

  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'coach' | 'org_admin' | 'learner'>('coach');
  const [org, setOrg] = useState(''); // holds the organisation ID
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  // Account detail drawer
  const [selected, setSelected] = useState<Member | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Real "View as" - become the account for a short session and land in their own view of the app.
  const impersonateM = useMutation({
    mutationFn: (id: string) => apiFetch(`/partners/${partnerId ?? 'platform'}/impersonate/${id}`, { method: 'POST' }),
    onSuccess: () => { window.location.href = '/'; },
    onError: (e: any) => flashMsg(e?.message ?? 'Could not start the session.'),
  });

  const flashMsg = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(null), 3500); };

  // Delegated admins (PU7) — real, persistent register.
  const { data: delegatesData } = useQuery({ queryKey: ['delegated-admins', partnerId], queryFn: () => apiFetch<DelegatedAdmin[]>(`/partners/${partnerId}/delegated-admins`), enabled: !!partnerId });
  const delegates = delegatesData ?? [];
  const [dName, setDName] = useState('');
  const [dEmail, setDEmail] = useState('');
  const [dOrg, setDOrg] = useState('');
  const [dPowers, setDPowers] = useState<string[]>(['learners', 'reports']);
  const invalidateDelegates = () => qc.invalidateQueries({ queryKey: ['delegated-admins', partnerId] });
  const addDelegateM = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch(`/partners/${partnerId}/delegated-admins`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { invalidateDelegates(); setDName(''); setDEmail(''); setDPowers(['learners', 'reports']); flashMsg('Delegated admin invited.'); },
    onError: () => flashMsg('Could not add the delegated admin.'),
  });
  const revokeDelegateM = useMutation({ mutationFn: (id: string) => apiFetch(`/partners/${partnerId}/delegated-admins/${id}`, { method: 'DELETE' }), onSuccess: invalidateDelegates });

  // Real provisioning: creates the account (invited) and returns a one-time set-password link.
  const inviteM = useMutation({
    mutationFn: () => {
      const selOrg = orgs.find((o) => o.id === org);
      const pid = selOrg?.partnerId ?? partnerId;
      return apiFetch<{ email: string; role: string; link: string; emailed: boolean }>(`/partners/${pid}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), role, organisationId: org }),
      });
    },
    onSuccess: (r) => {
      const selOrg = orgs.find((o) => o.id === org);
      setInvites((xs) => [{ id: Math.random().toString(36).slice(2), email: r.email, role: r.role as 'coach' | 'org_admin', orgName: selOrg?.name ?? '', sentAt: new Date().toISOString().slice(0, 10) }, ...xs]);
      setInviteLink(r.link);
      qc.invalidateQueries({ queryKey: ['partner-members', partnerId] });
      flashMsg(r.emailed ? 'Invite emailed with a set-password link.' : 'Account created. Copy the set-password link below to share it.');
      setEmail('');
    },
    onError: (e: any) => flashMsg(e?.message ?? 'Could not create the account.'),
  });
  const sendInvite = () => { if (!email.trim() || !org) return; setInviteLink(null); inviteM.mutate(); };
  const togglePower = (key: string) => setDPowers((xs) => (xs.includes(key) ? xs.filter((k) => k !== key) : [...xs, key]));
  const addDelegate = () => {
    if (!dName.trim() || !dEmail.trim() || dPowers.length === 0) return;
    addDelegateM.mutate({ name: dName.trim(), email: dEmail.trim(), orgName: dOrg || null, orgId: orgs.find((o) => o.name === dOrg)?.id ?? null, powers: dPowers, status: 'invited' });
  };
  const revokeDelegate = (id: string) => revokeDelegateM.mutate(id);

  // Real login activity for the selected account (super admin only).
  const { data: loginActivity } = useQuery({
    queryKey: ['login-activity', selected?.id],
    queryFn: () => apiFetch<LoginEv[]>(`/platform/users/${selected!.id}/login-activity`),
    enabled: isSuper && !!selected,
  });
  const activity = loginActivity ?? [];

  // ── Manage-drawer account actions (partner-admin OR super admin) ────────────────────────────
  // Credential result (temp password / reset link) shown inside the drawer for the selected account.
  const [cred, setCred] = useState<{ link?: string; password?: string; emailed?: boolean } | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false); // two-step confirm for (soft) delete
  const invalidateMembers = () => qc.invalidateQueries({ queryKey: ['partner-members', partnerId] });

  const credM = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: 'temp' | 'link' }) =>
      apiFetch<{ link?: string; password?: string; emailed?: boolean }>(`/partners/${partnerId}/members/${id}/credentials`, { method: 'POST', body: JSON.stringify({ mode }) }),
    onSuccess: (r, v) => { setCred(r); flashMsg(v.mode === 'temp' ? 'Temporary password set.' : (r.emailed ? 'Reset link emailed.' : 'Reset link created — copy it below.')); },
    onError: (e: any) => flashMsg(e?.message ?? 'Could not update credentials.'),
  });
  const lifecycleM = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'suspend' | 'reactivate' | 'archive' | 'restore' | 'delete' }) =>
      apiFetch(`/partners/${partnerId}/members/${id}/lifecycle`, { method: 'POST', body: JSON.stringify({ action }) }),
    onSuccess: (_r, v) => {
      invalidateMembers();
      const msg: Record<string, string> = { suspend: 'Account suspended.', reactivate: 'Account reactivated.', archive: 'Account archived.', restore: 'Account restored.', delete: 'Account removed (recoverable).' };
      flashMsg(msg[v.action] ?? 'Account updated.');
      setSelected(null); setPendingDelete(false); setCred(null);
    },
    onError: (e: any) => flashMsg(e?.message ?? 'Could not update the account.'),
  });
  const reassignM = useMutation({
    mutationFn: ({ id, organisationId }: { id: string; organisationId: string | null }) =>
      apiFetch(`/partners/${partnerId}/members/${id}/organisation`, { method: 'POST', body: JSON.stringify({ organisationId }) }),
    onSuccess: (_r, v) => { invalidateMembers(); setSelected((s) => (s ? { ...s, organisationId: v.organisationId, orgName: orgs.find((o) => o.id === v.organisationId)?.name ?? null } : s)); flashMsg('Organisation updated.'); },
    onError: (e: any) => flashMsg(e?.message ?? 'Could not move the account.'),
  });

  // Roster split: active roster vs archived/removed (shown only when the toggle is on).
  const [showRemoved, setShowRemoved] = useState(false);
  const liveAccounts = accounts.filter((a) => !a.archived && !a.deleted);
  const removedAccounts = accounts.filter((a) => a.archived || a.deleted);

  // Learner pool: learners attached to the PARTNER (not yet in any org), then assigned into orgs.
  const [poolEmail, setPoolEmail] = useState('');
  const [poolTest, setPoolTest] = useState(false);
  const [poolResult, setPoolResult] = useState<{ email: string; password?: string; link?: string } | null>(null);
  const { data: poolData, refetch: refetchPool } = useQuery({
    queryKey: ['partner-learners', partnerId],
    queryFn: () => apiFetch<Array<{ id: string; email: string; firstName: string | null; lastName: string | null; status: string; organisationId: string | null; orgName: string | null }>>(`/partners/${partnerId}/learners`),
    enabled: !!partnerId,
  });
  const pool = poolData ?? [];
  const addPoolM = useMutation({
    mutationFn: () => apiFetch<{ id: string; email: string; password?: string; link?: string }>(`/partners/${partnerId}/learners`, { method: 'POST', body: JSON.stringify({ email: poolEmail.trim(), test: poolTest }) }),
    onSuccess: (r) => { setPoolResult(r); setPoolEmail(''); refetchPool(); flashMsg(r.password ? 'Test learner created with a login password.' : 'Learner added to the pool.'); },
    onError: (e: any) => flashMsg(e?.message ?? 'Could not add the learner.'),
  });
  const assignPoolM = useMutation({
    mutationFn: (b: { userId: string; organisationId: string | null }) => apiFetch(`/partners/${partnerId}/learners/${b.userId}/assign`, { method: 'POST', body: JSON.stringify({ organisationId: b.organisationId }) }),
    onSuccess: () => { refetchPool(); qc.invalidateQueries({ queryKey: ['partner-members', partnerId] }); flashMsg('Learner assignment updated.'); },
    onError: (e: any) => flashMsg(e?.message ?? 'Could not assign the learner.'),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Accounts & Roles" icon={Users} subtitle="Provisioning, account lifecycle, delegated admins and access scope." />

      {flash && (
        <Card className="p-3 border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {flash}
        </Card>
      )}

      <Tabs defaultValue="accounts">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="pool">Learner Pool</TabsTrigger>
          <TabsTrigger value="delegates">Delegated Admins</TabsTrigger>
          <TabsTrigger value="invite">Create &amp; Invite</TabsTrigger>
          <TabsTrigger value="roles">Role Definitions</TabsTrigger>
          <TabsTrigger value="scope">Access Scope</TabsTrigger>
        </TabsList>

        {/* Accounts */}
        <TabsContent value="accounts" className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email…"
                className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            {removedAccounts.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
                Show archived &amp; removed ({removedAccounts.length})
              </label>
            )}
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Role</th><th className="text-left p-3">Organisation</th><th className="text-left p-3">Status</th><th className="text-left p-3">Last active</th><th className="p-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {membersLoading && (<tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading accounts…</td></tr>)}
                {!membersLoading && liveAccounts.length === 0 && !showRemoved && (<tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No active accounts for this partner yet.</td></tr>)}
                {(showRemoved ? accounts : liveAccounts).map((a) => (
                  <tr key={a.id} className={cn('hover:bg-muted/20', (a.archived || a.deleted) && 'opacity-60')}>
                    <td className="p-3"><div className="font-medium">{a.name}</div><div className="text-xs text-muted-foreground">{a.email}</div></td>
                    <td className="p-3"><span className={cn('rounded px-2 py-0.5 text-xs font-medium capitalize', roleBadge(a.role))}>{a.role.replace(/_/g, ' ')}</span></td>
                    <td className="p-3">{a.orgName ?? '—'}</td>
                    <td className="p-3">
                      {a.deleted ? <Badge variant="outline" className="border-red-300 text-red-600">Removed</Badge>
                        : a.archived ? <Badge variant="outline" className="border-amber-300 text-amber-600">Archived</Badge>
                        : <Badge variant={a.status === 'active' ? 'secondary' : 'outline'} className={cn('capitalize', a.status === 'suspended' && 'border-red-300 text-red-600')}>{a.status}</Badge>}
                    </td>
                    <td className="p-3 text-muted-foreground">{new Date(a.updatedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</td>
                    <td className="p-3 text-right"><Button size="sm" variant="ghost" className="gap-1.5 h-8" onClick={() => { setCred(null); setPendingDelete(false); setSelected(a); }}><Settings2 className="h-3.5 w-3.5" /> Manage</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {totalAccounts != null && accounts.length > 0 && (
            <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted-foreground">
              <span>Showing {accounts.length} of {totalAccounts}{q ? ' matching' : ''}</span>
              {hasMore && (
                <Button size="sm" variant="outline" className="h-7" onClick={() => setLimit((l) => Math.min(l + 500, 2000))}>Load more</Button>
              )}
            </div>
          )}
          {invites.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Pending invites</div>
              <div className="space-y-2">
                {invites.map((iv) => (
                  <Card key={iv.id} className="p-3 flex items-center justify-between text-sm">
                    <div><span className="font-medium">{iv.email}</span> <span className="text-muted-foreground">· {iv.role.replace('_', ' ')} · {iv.orgName}</span></div>
                    <Badge variant="outline">invited {new Date(iv.sentAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</Badge>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Learner Pool — provision learners to the Partner, then assign into organisations */}
        <TabsContent value="pool" className="mt-4 space-y-4">
          <Card className="p-4 flex items-start gap-3 text-sm">
            <Users className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="text-muted-foreground">
              Add learners to your <span className="text-foreground font-medium">partner account</span> without picking an organisation yet, then assign each into an organisation when you're ready. Tick <span className="text-foreground font-medium">Test account</span> to set a login password immediately instead of sending an invite.
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Add a learner</h3></div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs flex-1 min-w-[240px]"><span className="mb-1 block font-medium text-muted-foreground">Email</span>
                <input value={poolEmail} onChange={(e) => setPoolEmail(e.target.value)} placeholder="learner@email.com" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground pb-2.5"><input type="checkbox" checked={poolTest} onChange={(e) => setPoolTest(e.target.checked)} /> Test account (set a login password now)</label>
              <Button className="gap-1.5 mb-0.5" disabled={addPoolM.isPending || !poolEmail.trim()} onClick={() => { setPoolResult(null); addPoolM.mutate(); }}><UserPlus className="h-4 w-4" /> {addPoolM.isPending ? 'Adding…' : 'Add learner'}</Button>
            </div>
            {poolResult && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2 text-xs flex flex-wrap items-center gap-2">
                <span className="font-medium">{poolResult.email}</span>
                {poolResult.password && <>· temporary password <code className="rounded bg-background border px-1.5 py-0.5 font-semibold">{poolResult.password}</code><Button size="sm" variant="outline" className="h-6 px-2" onClick={() => { navigator.clipboard?.writeText(poolResult.password!); flashMsg('Password copied.'); }}>Copy</Button></>}
                {poolResult.link && <>· set-password link <code className="truncate max-w-[280px] rounded bg-background border px-1.5 py-0.5">{poolResult.link}</code><Button size="sm" variant="outline" className="h-6 px-2" onClick={() => { navigator.clipboard?.writeText(poolResult.link!); flashMsg('Link copied.'); }}>Copy</Button></>}
              </div>
            )}
          </Card>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Learners ({pool.length})</div>
            <Card className="overflow-hidden">
              {pool.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No learners in the pool yet. Add one above.</div>
              ) : (
                <div className="divide-y divide-border">
                  {pool.map((l) => (
                    <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/20">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{[l.firstName, l.lastName].filter(Boolean).join(' ') || l.email}</div>
                        <div className="text-xs text-muted-foreground truncate">{l.email} · {l.orgName ? `in ${l.orgName}` : <span className="text-amber-600 font-medium">Unassigned</span>}</div>
                      </div>
                      <select value={l.organisationId ?? ''} onChange={(e) => assignPoolM.mutate({ userId: l.id, organisationId: e.target.value || null })} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                        <option value="">Unassigned (pool)</option>
                        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* Delegated Admins (PU7) */}
        <TabsContent value="delegates" className="mt-4 space-y-4">
          <Card className="p-4 flex items-start gap-3 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="text-muted-foreground">
              Delegate a single organisation to a junior admin and grant only the powers you choose. A delegated admin
              is <span className="text-foreground font-medium">confined to their one organisation</span> and can do nothing beyond the powers allocated here -               Main-Admin surfaces (Financial Hub, Funders, other organisations) stay out of reach.
            </div>
          </Card>

          {/* Existing delegates */}
          <div className="space-y-2">
            {delegates.map((d) => (
              <Card key={d.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{d.name}</span>
                      <Badge variant={d.status === 'active' ? 'secondary' : 'outline'} className="capitalize text-[10px]">{d.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{d.email} · scoped to <span className="font-medium text-foreground">{d.orgName}</span></div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {d.powers.map((p) => {
                        const meta = DELEGATABLE_POWERS.find((x) => x.key === p);
                        return <span key={p} className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{meta?.label ?? p}</span>;
                      })}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="gap-1.5 h-8 text-red-600 hover:text-red-700 shrink-0" onClick={() => revokeDelegate(d.id)}><Ban className="h-3.5 w-3.5" /> Revoke</Button>
                </div>
              </Card>
            ))}
            {delegates.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">No delegated admins yet.</Card>}
          </div>

          {/* Delegate form */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Delegate an organisation</h3></div>
            <div className="grid md:grid-cols-3 gap-3">
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Name</span>
                <input value={dName} onChange={(e) => setDName(e.target.value)} placeholder="Junior admin name" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Email</span>
                <input value={dEmail} onChange={(e) => setDEmail(e.target.value)} placeholder="name@org.co.za" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Organisation</span>
                <select value={dOrg} onChange={(e) => setDOrg(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">Select organisation…</option>
                  {orgs.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
                </select></label>
            </div>
            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">Powers granted for {dOrg}</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {DELEGATABLE_POWERS.map((p) => {
                  const on = dPowers.includes(p.key);
                  return (
                    <button key={p.key} type="button" onClick={() => togglePower(p.key)}
                      className={cn('flex items-start gap-2.5 rounded-lg border p-3 text-left transition', on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}>
                      <span className={cn('mt-0.5 flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span><span className="block text-sm font-medium">{p.label}</span><span className="block text-xs text-muted-foreground">{p.help}</span></span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={addDelegate} disabled={!dName.trim() || !dEmail.trim() || dPowers.length === 0} className="gap-1.5"><Send className="h-4 w-4" /> Send delegated invite</Button>
              <span className="text-xs text-muted-foreground">{dPowers.length} power{dPowers.length === 1 ? '' : 's'} selected</span>
            </div>
          </Card>
        </TabsContent>

        {/* Create & Invite */}
        <TabsContent value="invite" className="mt-4">
          <Card className="p-5 max-w-xl space-y-3">
            <div className="text-sm text-muted-foreground">A Partner may provision the tiers below it - Coach, Org-admin and Learner accounts, each scoped to one organisation. (Learners can also self-enrol via a cohort link - see a cohort's Share link.)</div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.co.za" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value as any)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                  <option value="coach">Coach</option>
                  <option value="org_admin">Org-admin</option>
                  <option value="learner">Learner</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Organisation</label>
                <select value={org} onChange={(e) => setOrg(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">Select organisation…</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            </div>
            <Button onClick={sendInvite} disabled={!email.trim() || !org || inviteM.isPending} className="gap-1.5"><Send className="h-4 w-4" /> {inviteM.isPending ? 'Creating…' : 'Send invite'}</Button>
            {inviteLink && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs space-y-1.5">
                <div className="font-medium text-foreground">Set-password link (share with the invitee):</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-background px-2 py-1 border">{inviteLink}</code>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => { navigator.clipboard?.writeText(inviteLink); flashMsg('Link copied.'); }}>Copy</Button>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">The invitee receives a set-password link; the account is inactive until they accept. All invites are written to the Partner Activity Audit Log.</p>
          </Card>
        </TabsContent>

        {/* Role Definitions */}
        <TabsContent value="roles" className="mt-4 space-y-4">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left p-3 min-w-[200px]">Capability</th>
                  {(Object.keys(MATRIX) as Tier[]).map((t) => <th key={t} className="p-3 text-center">{t}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {CAPS.map((cap, i) => (
                  <tr key={cap}>
                    <td className="p-3">{cap}</td>
                    {(Object.keys(MATRIX) as Tier[]).map((t) => (
                      <td key={t} className="p-3 text-center">
                        {MATRIX[t][i]
                          ? <Check className="h-4 w-4 text-emerald-600 mx-auto" />
                          : <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(Object.keys(TIER_NOTE) as Tier[]).map((t) => (
              <Card key={t} className="p-4">
                <div className="font-semibold text-sm">{t}</div>
                <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{TIER_NOTE[t]}</div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Access Scope */}
        <TabsContent value="scope" className="mt-4 space-y-3">
          <Card className="p-4 flex items-start gap-3 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="text-muted-foreground">Access scope defines what each account can see across the organisations under this Partner. A Coach or Org-admin is scoped to their assigned organisation; the Partner sees all.</div>
          </Card>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Account</th><th className="text-left p-3">Role</th><th className="text-left p-3">Scoped to</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="p-3 font-medium">{a.name}</td>
                    <td className="p-3 capitalize">{a.role.replace(/_/g, ' ')}</td>
                    <td className="p-3">{a.orgName ?? '—'}</td>
                  </tr>
                ))}
                {delegates.map((d) => (
                  <tr key={d.id}>
                    <td className="p-3 font-medium">{d.name}</td>
                    <td className="p-3">Delegated admin</td>
                    <td className="p-3">{d.orgName} <span className="text-xs text-muted-foreground">({d.powers.length} powers)</span></td>
                  </tr>
                ))}
                <tr className="bg-muted/20">
                  <td className="p-3 font-medium">{user?.firstName ?? 'You'} (Partner)</td>
                  <td className="p-3">Partner Admin</td>
                  <td className="p-3">All {orgs.length} organisation{orgs.length === 1 ? '' : 's'}</td>
                </tr>
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Account detail drawer (PU6) */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setCred(null); setPendingDelete(false); } }}>
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
          {selected && (() => {
            const isSelf = selected.id === user?.id;
            const isAdminTarget = selected.role === 'partner_admin' || selected.role === 'super_admin';
            // Who may run lifecycle/credential actions on this target: never yourself; a partner admin
            // may not manage another admin tier (the backend enforces this too).
            const canManage = !isSelf && (isSuper || !isAdminTarget);
            const removed = !!(selected.archived || selected.deleted);
            return (
              <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>{selected.email} · <span className="capitalize">{selected.role.replace(/_/g, ' ')}</span> · {selected.orgName ?? '—'}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Current state */}
                <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                  Status:
                  {selected.deleted ? <Badge variant="outline" className="border-red-300 text-red-600">Removed</Badge>
                    : selected.archived ? <Badge variant="outline" className="border-amber-300 text-amber-600">Archived</Badge>
                    : <Badge variant={selected.status === 'active' ? 'secondary' : 'outline'} className={cn('capitalize', selected.status === 'suspended' && 'border-red-300 text-red-600')}>{selected.status}</Badge>}
                </div>

                {!canManage ? (
                  <div className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {isSelf ? 'You cannot run account actions on your own account here.' : 'Admin accounts can only be managed by the platform team.'}
                  </div>
                ) : (
                  <>
                    {/* Credentials */}
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Credentials</div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="gap-2 justify-start" disabled={credM.isPending} onClick={() => credM.mutate({ id: selected.id, mode: 'link' })}>
                          <KeyRound className="h-4 w-4" /> {selected.status === 'invited' ? 'Resend invite link' : 'Email reset link'}
                        </Button>
                        <Button variant="outline" className="gap-2 justify-start" disabled={credM.isPending} onClick={() => credM.mutate({ id: selected.id, mode: 'temp' })}>
                          <KeyRound className="h-4 w-4" /> Set temp password
                        </Button>
                      </div>
                      {cred && (
                        <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2 text-xs flex flex-wrap items-center gap-2">
                          {cred.password && <>Temporary password <code className="rounded bg-background border px-1.5 py-0.5 font-semibold">{cred.password}</code><Button size="sm" variant="outline" className="h-6 px-2 gap-1" onClick={() => { navigator.clipboard?.writeText(cred.password!); flashMsg('Password copied.'); }}><Copy className="h-3 w-3" /> Copy</Button></>}
                          {cred.link && <>{cred.emailed ? 'Emailed. Link: ' : 'Set-password link: '}<code className="truncate max-w-[260px] rounded bg-background border px-1.5 py-0.5">{cred.link}</code><Button size="sm" variant="outline" className="h-6 px-2 gap-1" onClick={() => { navigator.clipboard?.writeText(cred.link!); flashMsg('Link copied.'); }}><Copy className="h-3 w-3" /> Copy</Button></>}
                        </div>
                      )}
                    </div>

                    {/* Reassign organisation */}
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Organisation</div>
                      <select value={selected.organisationId ?? ''} disabled={reassignM.isPending} onChange={(e) => reassignM.mutate({ id: selected.id, organisationId: e.target.value || null })} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                        <option value="">Unassigned</option>
                        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </div>

                    {/* Lifecycle */}
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account lifecycle</div>
                      <div className="grid grid-cols-2 gap-2">
                        {selected.status === 'suspended' ? (
                          <Button variant="outline" className="gap-2 justify-start text-emerald-600" disabled={lifecycleM.isPending} onClick={() => lifecycleM.mutate({ id: selected.id, action: 'reactivate' })}>
                            <RotateCcw className="h-4 w-4" /> Reactivate
                          </Button>
                        ) : (
                          <Button variant="outline" className="gap-2 justify-start text-red-600" disabled={lifecycleM.isPending || removed} onClick={() => lifecycleM.mutate({ id: selected.id, action: 'suspend' })}>
                            <Ban className="h-4 w-4" /> Suspend
                          </Button>
                        )}
                        {removed ? (
                          <Button variant="outline" className="gap-2 justify-start text-emerald-600" disabled={lifecycleM.isPending} onClick={() => lifecycleM.mutate({ id: selected.id, action: 'restore' })}>
                            <RotateCcw className="h-4 w-4" /> Restore
                          </Button>
                        ) : (
                          <Button variant="outline" className="gap-2 justify-start text-amber-600" disabled={lifecycleM.isPending} onClick={() => lifecycleM.mutate({ id: selected.id, action: 'archive' })}>
                            <Archive className="h-4 w-4" /> Archive
                          </Button>
                        )}
                      </div>
                      {/* Soft delete with a two-step confirm */}
                      {!selected.deleted && (
                        pendingDelete ? (
                          <div className="mt-2 rounded-md border border-red-300 bg-red-50/60 dark:bg-red-950/20 px-3 py-2 text-xs space-y-2">
                            <div className="text-red-700 dark:text-red-300">Remove <span className="font-medium">{selected.name}</span>? They lose access immediately. This is recoverable — the account moves to “archived &amp; removed” and can be restored.</div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="h-7 gap-1 text-red-600 border-red-300" disabled={lifecycleM.isPending} onClick={() => lifecycleM.mutate({ id: selected.id, action: 'delete' })}><Trash2 className="h-3.5 w-3.5" /> Confirm remove</Button>
                              <Button size="sm" variant="ghost" className="h-7" onClick={() => setPendingDelete(false)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <Button variant="ghost" className="mt-2 gap-2 justify-start text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setPendingDelete(true)}>
                            <Trash2 className="h-4 w-4" /> Delete account…
                          </Button>
                        )
                      )}
                    </div>
                  </>
                )}

                {/* Real "View as" impersonation - see and navigate the app exactly as this account. */}
                {!isAdminTarget && !removed && (
                  <Button variant="outline" className="w-full gap-2 justify-start border-primary/40 text-primary" disabled={impersonateM.isPending} onClick={() => impersonateM.mutate(selected.id)}>
                    <Eye className="h-4 w-4" /> {impersonateM.isPending ? 'Opening…' : `View as ${selected.name.split(' ')[0]} (open their courses)`}
                  </Button>
                )}

                {/* Login activity — real sign-in trail (super admin) */}
                {isSuper && (
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" /> Recent login activity
                    </div>
                    <div className="rounded-lg border border-border divide-y divide-border">
                      {activity.map((ev, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{ev.impersonated ? 'Impersonation' : (ev.device || 'Sign-in')}</div>
                            <div className="text-xs text-muted-foreground">{ev.ip}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs text-muted-foreground">{new Date(ev.at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                            {ev.outcome === 'success'
                              ? <span className="text-[10px] text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Success</span>
                              : <span className="text-[10px] text-red-600 inline-flex items-center gap-1"><X className="h-3 w-3" /> {ev.outcome}</span>}
                          </div>
                        </div>
                      ))}
                      {activity.length === 0 && <div className="px-3 py-4 text-center text-xs text-muted-foreground">No login events recorded for this account yet.</div>}
                    </div>
                  </div>
                )}
              </div>
            </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
