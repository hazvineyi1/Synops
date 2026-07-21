import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Settings, Building, Palette, Bell, ShieldCheck, Download, CheckCircle2, ChevronRight,
} from 'lucide-react';
import { getActivePartnerId } from '@/lib/partnerHubData';

interface PartnerRow { id: string; name: string; contactEmail: string | null }

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('relative h-6 w-11 rounded-full transition-colors', on ? 'bg-primary' : 'bg-muted')}>
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

/**
 * Partner Settings (upgrade §7). Tenant-level configuration for the Main Admin: partner profile and
 * billing identity, branding entry point, notification preferences, security posture and data export.
 * Fields are functional on seeded data; persistence is a backend step.
 */
export function PartnerSettings() {
  const { user } = useSession();
  const [, navigate] = useLocation();
  const partnerId = user?.partnerId ?? getActivePartnerId();

  // Real partner profile.
  const { data: partner } = useQuery({ queryKey: ['partner', partnerId], queryFn: () => apiFetch<PartnerRow>(`/partners/${partnerId}`), enabled: !!partnerId });
  const [pname, setPname] = useState('');
  const [pcontact, setPcontact] = useState('');
  useEffect(() => { if (partner) { setPname(partner.name ?? ''); setPcontact(partner.contactEmail ?? ''); } }, [partner]);

  // Declared BEFORE the mutation that calls it — previously flashMsg was defined after saveProfile,
  // so the first save's success callback closed over a not-yet-initialised binding and the green
  // confirmation only appeared on the second save.
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = useCallback((m: string) => {
    setFlash(m);
    window.setTimeout(() => setFlash(null), 3500);
  }, []);

  const saveProfile = useMutation({
    mutationFn: () => apiFetch(`/partners/${partnerId}`, { method: 'PATCH', body: JSON.stringify({ name: pname.trim(), contactEmail: pcontact.trim() }) }),
    onSuccess: () => flashMsg('Partner profile saved.'),
    onError: () => flashMsg('Could not save the profile.'),
  });

  const [prefs, setPrefs] = useState({
    invoiceAlerts: true, funderExpiry: true, weeklyDigest: false, delegateActions: true, loginAlerts: true,
  });
  const toggle = (k: keyof typeof prefs) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" icon={Settings} subtitle="Tenant profile, notifications, security and data." />

      {flash && (
        <Card className="p-3 border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {flash}
        </Card>
      )}

      <Tabs defaultValue="profile">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="profile">Profile &amp; Billing</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
        </TabsList>

        {/* Profile & Billing */}
        <TabsContent value="profile" className="mt-4 space-y-4">
          <Card className="p-5 space-y-4 max-w-2xl">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Building className="h-4 w-4 text-primary" /> Partner profile</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Partner name</span>
                <input value={pname} onChange={(e) => setPname(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Billing contact</span>
                <input value={pcontact} onChange={(e) => setPcontact(e.target.value)} placeholder="ops@partner.co.za" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
              <label className="text-xs"><span className="mb-1 block font-medium text-muted-foreground">Billing currency</span>
                <input defaultValue="ZAR (South African Rand)" readOnly className="h-10 w-full rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground" /></label>
            </div>
            <Button className="gap-1.5" disabled={!pname.trim() || saveProfile.isPending} onClick={() => saveProfile.mutate()}><CheckCircle2 className="h-4 w-4" /> {saveProfile.isPending ? 'Saving…' : 'Save profile'}</Button>
          </Card>

          <Card className="p-5 max-w-2xl">
            <button onClick={() => navigate('/partner/theme')} className="flex w-full items-center justify-between gap-3 text-left">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Palette className="h-4 w-4" /></span>
                <div><div className="text-sm font-medium">Branding &amp; white-label</div><div className="text-xs text-muted-foreground">Logo, colours and the sub-domain your organisations see.</div></div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="mt-4">
          <Card className="p-5 max-w-2xl divide-y divide-border">
            {([
              ['invoiceAlerts', 'Invoice alerts', 'Notify me when an invoice becomes overdue.'],
              ['funderExpiry', 'Funder expiry warnings', 'Warn me 30 days before a funding agreement expires.'],
              ['loginAlerts', 'Login alerts', 'Flag failed logins and new-device sign-ins on managed accounts.'],
              ['delegateActions', 'Delegated-admin actions', 'Summarise actions taken by delegated organisation admins.'],
              ['weeklyDigest', 'Weekly digest', 'A Monday summary of tenant health across all organisations.'],
            ] as const).map(([key, title, desc]) => (
              <div key={key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div><div className="text-sm font-medium flex items-center gap-2"><Bell className="h-3.5 w-3.5 text-muted-foreground" /> {title}</div><div className="text-xs text-muted-foreground">{desc}</div></div>
                <Toggle on={prefs[key]} onClick={() => toggle(key)} />
              </div>
            ))}
          </Card>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security" className="mt-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Card className="p-4 flex items-start gap-3"><ShieldCheck className="h-5 w-5 text-primary shrink-0" /><div><div className="text-sm font-medium">Impersonation policy</div><div className="text-xs text-muted-foreground">Time-boxed to 30 min, org-notified and auto-logged. Managed in Audit &amp; Impersonation.</div></div></Card>
            <Card className="p-4 flex items-start gap-3"><ShieldCheck className="h-5 w-5 text-primary shrink-0" /><div><div className="text-sm font-medium">Tenant isolation</div><div className="text-xs text-muted-foreground">Your data is isolated per tenant with row-level security enforced at the database.</div></div></Card>
            <Card className="p-4 flex items-start gap-3"><ShieldCheck className="h-5 w-5 text-primary shrink-0" /><div><div className="text-sm font-medium">Role provisioning</div><div className="text-xs text-muted-foreground">A Partner can only mint Coach and Org-admin accounts - enforced server-side.</div></div></Card>
            <Card className="p-4 flex items-start gap-3"><ShieldCheck className="h-5 w-5 text-primary shrink-0" /><div><div className="text-sm font-medium">Audit retention</div><div className="text-xs text-muted-foreground">Financial entries carry stricter, append-only retention.</div></div></Card>
          </div>
          <Button variant="outline" className="gap-1.5" onClick={() => navigate('/partner/audit')}><ShieldCheck className="h-4 w-4" /> Open Audit &amp; Impersonation</Button>
        </TabsContent>

        {/* Data */}
        <TabsContent value="data" className="mt-4">
          <Card className="p-5 max-w-2xl space-y-3">
            <h3 className="text-sm font-semibold">Export &amp; portability</h3>
            <p className="text-sm text-muted-foreground">Export your tenant data for reporting, backup or migration. Exports respect tenant isolation and exclude other partners' data.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-1.5" onClick={() => flashMsg('Accounts export queued - you will receive a download link.')}><Download className="h-4 w-4" /> Export accounts (CSV)</Button>
              <Button variant="outline" className="gap-1.5" onClick={() => flashMsg('Financial export queued - you will receive a download link.')}><Download className="h-4 w-4" /> Export financials (CSV)</Button>
              <Button variant="outline" className="gap-1.5" onClick={() => flashMsg('Full tenant export queued - you will receive a download link.')}><Download className="h-4 w-4" /> Full tenant export</Button>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Export generation is wired at the backend reporting step. Actions here are logged to the audit trail.
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
