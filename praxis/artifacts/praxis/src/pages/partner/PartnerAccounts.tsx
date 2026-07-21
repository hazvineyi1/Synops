import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
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
  Users, Check, X, Send, ShieldCheck, KeyRound, LifeBuoy, Ban, RotateCcw,
  Clock, Settings2, UserPlus, CheckCircle2, Info, Eye,
} from 'lucide-react';
import { getActivePartnerId, DELEGATABLE_POWERS, type Invite } from '@/lib/partnerHubData';

// A real account row from GET /partners/:id/members.
interface Member { id: string; name: string; email: string; role: string; status: string; orgName: string | null; updatedAt: string }
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

  // Real accounts belonging to this partner.
  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['partner-members', partnerId],
    queryFn: () => apiFetch<Member[]>(`/partners/${partnerId}/members`),
    enabled: !!partnerId,
  });
  const accounts: Member[] = members ?? [];

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

  // Lifecycle actions (super admin only) hit the real platform-user endpoints.
  const lifecycle = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'suspend' | 'reactivate' }) =>
      apiFetch(`/platform/users/${id}/${action}`, { method: 'POST' }),
    onSuccess: (_r, v) => { qc.invalidateQueries({ queryKey: ['partner-members', partnerId] }); setSelected(null); flashMsg(v.action === 'suspend' ? 'Account suspended.' : 'Account reactivated.'); },
    onError: () => flashMsg('Could not update the account.'),
  });
  const resetLink = useMutation({
    mutationFn: (id: string) => apiFetch<{ emailed?: boolean; link?: string }>(`/platform/users/${id}/reset-link`, { method: 'POST' }),
    onSuccess: (r) => flashMsg(r.emailed ? 'Password-reset link emailed.' : 'Password-reset link created (copy from Platform Console).'),
    onError: () => flashMsg('Could not create a reset link.'),
  });
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
      setInvites((xs) => [{ id: Math.random().toString(36).slice(2), email: r.email, role: r.role, orgName: selOrg?.name ?? '', sentAt: new Date().toISOString().slice(0, 10) }, ...xs]);
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
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Role</th><th className="text-left p-3">Organisation</th><th className="text-left p-3">Status</th><th className="text-left p-3">Last active</th><th className="p-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {membersLoading && (<tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading accounts…</td></tr>)}
                {!membersLoading && accounts.length === 0 && (<tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No accounts for this partner yet.</td></tr>)}
                {accounts.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/20">
                    <td className="p-3"><div className="font-medium">{a.name}</div><div className="text-xs text-muted-foreground">{a.email}</div></td>
                    <td className="p-3"><span className={cn('rounded px-2 py-0.5 text-xs font-medium capitalize', roleBadge(a.role))}>{a.role.replace(/_/g, ' ')}</span></td>
                    <td className="p-3">{a.orgName ?? '—'}</td>
                    <td className="p-3"><Badge variant={a.status === 'active' ? 'secondary' : 'outline'} className={cn('capitalize', a.status === 'suspended' && 'border-red-300 text-red-600')}>{a.status}</Badge></td>
                    <td className="p-3 text-muted-foreground">{new Date(a.updatedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</td>
                    <td className="p-3 text-right"><Button size="sm" variant="ghost" className="gap-1.5 h-8" onClick={() => setSelected(a)}><Settings2 className="h-3.5 w-3.5" /> Manage</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
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
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>{selected.email} · <span className="capitalize">{selected.role.replace(/_/g, ' ')}</span> · {selected.orgName ?? '—'}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Lifecycle actions — wired to the real platform-user endpoints (super admin). */}
                {isSuper ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="gap-2 justify-start" disabled={resetLink.isPending} onClick={() => resetLink.mutate(selected.id)}>
                      <KeyRound className="h-4 w-4" /> Reset password
                    </Button>
                    {selected.status === 'suspended' ? (
                      <Button variant="outline" className="gap-2 justify-start text-emerald-600" disabled={lifecycle.isPending} onClick={() => lifecycle.mutate({ id: selected.id, action: 'reactivate' })}>
                        <RotateCcw className="h-4 w-4" /> Reactivate
                      </Button>
                    ) : (
                      <Button variant="outline" className="gap-2 justify-start text-red-600" disabled={lifecycle.isPending} onClick={() => lifecycle.mutate({ id: selected.id, action: 'suspend' })}>
                        <Ban className="h-4 w-4" /> Suspend
                      </Button>
                    )}
                    <div className="col-span-2 flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                      Status: <Badge variant={selected.status === 'active' ? 'secondary' : 'outline'} className={cn('capitalize', selected.status === 'suspended' && 'border-red-300 text-red-600')}>{selected.status}</Badge>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" /> Password resets and suspend/reactivate are performed by the platform team. Status: <Badge variant={selected.status === 'active' ? 'secondary' : 'outline'} className={cn('capitalize', selected.status === 'suspended' && 'border-red-300 text-red-600')}>{selected.status}</Badge>
                  </div>
                )}

                {/* Real "View as" impersonation - see and navigate the app exactly as this account. */}
                {selected.role !== 'partner_admin' && selected.role !== 'super_admin' && (
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
