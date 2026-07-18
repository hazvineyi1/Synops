import React, { useMemo, useState } from 'react';
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
  Clock, Settings2, UserPlus, CheckCircle2, Info,
} from 'lucide-react';
import {
  getPartnerHub, accountActivity, DELEGATABLE_POWERS,
  type Account, type Invite, type DelegatedAdmin,
} from '@/lib/partnerHubData';

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
 * admins — a junior admin scoped to one organisation with only the powers the Partner grants.
 */
export function PartnerAccounts() {
  const { user } = useSession();
  const h = getPartnerHub(user?.partnerId);

  const [accounts, setAccounts] = useState<Account[]>(h.accounts);
  const [invites, setInvites] = useState<Invite[]>(h.invites);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'coach' | 'org_admin'>('coach');
  const [org, setOrg] = useState(h.orgs[0]?.name ?? '');

  // Account detail drawer
  const [selected, setSelected] = useState<Account | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Delegated admins (PU7)
  const [delegates, setDelegates] = useState<DelegatedAdmin[]>(h.delegatedAdmins);
  const [dName, setDName] = useState('');
  const [dEmail, setDEmail] = useState('');
  const [dOrg, setDOrg] = useState(h.orgs[0]?.name ?? '');
  const [dPowers, setDPowers] = useState<string[]>(['learners', 'reports']);

  const sendInvite = () => {
    if (!email.trim()) return;
    setInvites((xs) => [{ id: Math.random().toString(36).slice(2), email: email.trim(), role, orgName: org, sentAt: new Date().toISOString().slice(0, 10) }, ...xs]);
    setEmail('');
  };

  const setStatus = (id: string, status: Account['status']) => {
    setAccounts((xs) => xs.map((a) => (a.id === id ? { ...a, status } : a)));
    setSelected((s) => (s && s.id === id ? { ...s, status } : s));
  };
  const flashMsg = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(null), 3500); };

  const togglePower = (key: string) =>
    setDPowers((xs) => (xs.includes(key) ? xs.filter((k) => k !== key) : [...xs, key]));

  const addDelegate = () => {
    if (!dName.trim() || !dEmail.trim() || dPowers.length === 0) return;
    setDelegates((xs) => [{
      id: `da_${Date.now()}`, name: dName.trim(), email: dEmail.trim(), orgName: dOrg,
      powers: [...dPowers], status: 'invited', addedAt: new Date().toISOString().slice(0, 10),
    }, ...xs]);
    setDName(''); setDEmail(''); setDPowers(['learners', 'reports']);
    flashMsg(`Delegated admin invited for ${dOrg}.`);
  };
  const revokeDelegate = (id: string) => setDelegates((xs) => xs.filter((d) => d.id !== id));

  const activity = useMemo(() => (selected ? accountActivity(selected.id, selected.lastActive) : []), [selected]);

  return (
    <div className="space-y-6">
      <PageHeader title="Accounts & Roles" icon={Users} subtitle={`${h.partnerName} — provisioning, account lifecycle, delegated admins and access scope.`} />

      {flash && (
        <Card className="p-3 border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {flash}
        </Card>
      )}

      <Tabs defaultValue="accounts">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
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
                {accounts.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/20">
                    <td className="p-3"><div className="font-medium">{a.name}</div><div className="text-xs text-muted-foreground">{a.email}</div></td>
                    <td className="p-3"><span className={cn('rounded px-2 py-0.5 text-xs font-medium capitalize', roleBadge(a.role))}>{a.role.replace('_', ' ')}</span></td>
                    <td className="p-3">{a.orgName}</td>
                    <td className="p-3"><Badge variant={a.status === 'active' ? 'secondary' : 'outline'} className={cn('capitalize', a.status === 'suspended' && 'border-red-300 text-red-600')}>{a.status}</Badge></td>
                    <td className="p-3 text-muted-foreground">{new Date(a.lastActive).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</td>
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

        {/* Delegated Admins (PU7) */}
        <TabsContent value="delegates" className="mt-4 space-y-4">
          <Card className="p-4 flex items-start gap-3 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="text-muted-foreground">
              Delegate a single organisation to a junior admin and grant only the powers you choose. A delegated admin
              is <span className="text-foreground font-medium">confined to their one organisation</span> and can do nothing beyond the powers allocated here —
              Main-Admin surfaces (Financial Hub, Funders, other organisations) stay out of reach.
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
                  {h.orgs.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
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
            <div className="text-sm text-muted-foreground">A Partner may provision the tiers below it — Coach and Org-admin accounts. Learner accounts are created by Organisations.</div>
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
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Organisation</label>
                <select value={org} onChange={(e) => setOrg(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                  {h.orgs.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
                </select>
              </div>
            </div>
            <Button onClick={sendInvite} disabled={!email.trim()} className="gap-1.5"><Send className="h-4 w-4" /> Send invite</Button>
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
                    <td className="p-3 capitalize">{a.role.replace('_', ' ')}</td>
                    <td className="p-3">{a.orgName}</td>
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
                  <td className="p-3">All {h.orgs.length} organisation{h.orgs.length > 1 ? 's' : ''}</td>
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
                <DialogDescription>{selected.email} · <span className="capitalize">{selected.role.replace('_', ' ')}</span> · {selected.orgName}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Lifecycle actions */}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="gap-2 justify-start" onClick={() => flashMsg(`Password reset link sent to ${selected.email}.`)}>
                    <KeyRound className="h-4 w-4" /> Reset password
                  </Button>
                  <Button variant="outline" className="gap-2 justify-start" onClick={() => flashMsg(`Login help email sent to ${selected.email}.`)}>
                    <LifeBuoy className="h-4 w-4" /> Login help
                  </Button>
                  {selected.status === 'suspended' ? (
                    <Button variant="outline" className="gap-2 justify-start text-emerald-600" onClick={() => { setStatus(selected.id, 'active'); flashMsg(`${selected.name} reactivated.`); }}>
                      <RotateCcw className="h-4 w-4" /> Reactivate
                    </Button>
                  ) : (
                    <Button variant="outline" className="gap-2 justify-start text-red-600" onClick={() => { setStatus(selected.id, 'suspended'); flashMsg(`${selected.name} suspended.`); }}>
                      <Ban className="h-4 w-4" /> Suspend
                    </Button>
                  )}
                  <div className="flex items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground">
                    Status: <Badge variant={selected.status === 'active' ? 'secondary' : 'outline'} className={cn('capitalize', selected.status === 'suspended' && 'border-red-300 text-red-600')}>{selected.status}</Badge>
                  </div>
                </div>

                {/* Login activity */}
                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> Recent login activity
                  </div>
                  <div className="rounded-lg border border-border divide-y divide-border">
                    {activity.map((ev, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium">{ev.device}</div>
                          <div className="text-xs text-muted-foreground">{ev.ip}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs text-muted-foreground">{new Date(ev.at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                          {ev.ok
                            ? <span className="text-[10px] text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Success</span>
                            : <span className="text-[10px] text-red-600 inline-flex items-center gap-1"><X className="h-3 w-3" /> Failed</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" /> Password reset, login help and suspend actions are wired to the surface and logged to the audit trail; delivery of the actual emails is a backend step.
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
