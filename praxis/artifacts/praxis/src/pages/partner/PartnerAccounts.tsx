import React, { useState } from 'react';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Users, Check, X, Send, ShieldCheck } from 'lucide-react';
import { getPartnerHub, type Account, type Invite } from '@/lib/partnerHubData';

// Role Definitions — the permission matrix the spec calls for (§2). Partner sits above Coach,
// which provisions Organisations, which manage Learners. A partner_admin can only mint the
// tiers below it (coach, org_admin) -- matching the backend canAssignRole rule.
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
  //          view  fin   fund  acct  learn cat   deliver consume
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
 * Accounts & Roles (spec §2). Governs who can create, scope and revoke accounts below the
 * Partner tier: the role/permission matrix, the invite flow, and access-scope control.
 */
export function PartnerAccounts() {
  const { user } = useSession();
  const h = getPartnerHub(user?.partnerId);

  const [accounts] = useState<Account[]>(h.accounts);
  const [invites, setInvites] = useState<Invite[]>(h.invites);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'coach' | 'org_admin'>('coach');
  const [org, setOrg] = useState(h.orgs[0]?.name ?? '');

  const sendInvite = () => {
    if (!email.trim()) return;
    setInvites((xs) => [{ id: Math.random().toString(36).slice(2), email: email.trim(), role, orgName: org, sentAt: new Date().toISOString().slice(0, 10) }, ...xs]);
    setEmail('');
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Accounts & Roles" icon={Users} subtitle={`${h.partnerName} — role definitions, account provisioning and access scope.`} />

      <Tabs defaultValue="accounts">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="invite">Create &amp; Invite</TabsTrigger>
          <TabsTrigger value="roles">Role Definitions</TabsTrigger>
          <TabsTrigger value="scope">Access Scope</TabsTrigger>
        </TabsList>

        {/* Accounts */}
        <TabsContent value="accounts" className="mt-4">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Role</th><th className="text-left p-3">Organisation</th><th className="text-left p-3">Status</th><th className="text-left p-3">Last active</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="p-3"><div className="font-medium">{a.name}</div><div className="text-xs text-muted-foreground">{a.email}</div></td>
                    <td className="p-3"><span className={cn('rounded px-2 py-0.5 text-xs font-medium capitalize', roleBadge(a.role))}>{a.role.replace('_', ' ')}</span></td>
                    <td className="p-3">{a.orgName}</td>
                    <td className="p-3"><Badge variant={a.status === 'active' ? 'secondary' : 'outline'} className="capitalize">{a.status}</Badge></td>
                    <td className="p-3 text-muted-foreground">{new Date(a.lastActive).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</td>
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
    </div>
  );
}
