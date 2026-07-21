import React, { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/context/SessionContext';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Building, ChevronRight, Wallet, Users, Landmark, Receipt, ShieldCheck, GraduationCap, Mail,
  Plus, CheckCircle2, Sparkles,
} from 'lucide-react';
import { ZAR, getActivePartnerId } from '@/lib/partnerHubData';

/**
 * Organisations (selector) — now backed by REAL data. Every card's plan/seats/funders/coaches/
 * delegated/open-invoices is computed from the same partner-scoped endpoints the individual Hub
 * pages use (/organisations, /partners/:id/billing, /funding, /delegated-admins, /members), so the
 * overview agrees with the hubs instead of showing fabricated figures from the old client mock.
 */
type OrgRow = { id: string; name: string; industry?: string | null; memberCount?: number };
type Sub = { orgId?: string | null; planName?: string; seats?: number; activeSeats?: number; pricePerSeat?: number };
type Invoice = { orgId?: string | null; status?: string; net?: number };
type Funding = { orgId?: string | null };
type Delegate = { orgId?: string | null };
type Member = { role?: string; organisationId?: string | null };

export function PartnerOrganisations() {
  const { user } = useSession();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const partnerId = user?.partnerId ?? getActivePartnerId() ?? '';
  const canManage = user?.role === 'partner_admin' || user?.role === 'super_admin';

  const { data: orgs = [] } = useQuery({
    queryKey: ['organisations'],
    queryFn: () => apiFetch<OrgRow[]>('/organisations'),
  });
  const { data: billing } = useQuery({
    queryKey: ['partner-billing', partnerId],
    queryFn: () => apiFetch<{ subscriptions: Sub[]; invoices: Invoice[] }>(`/partners/${partnerId}/billing`),
    enabled: !!partnerId,
  });
  const { data: funding = [] } = useQuery({
    queryKey: ['partner-funding', partnerId],
    queryFn: () => apiFetch<Funding[]>(`/partners/${partnerId}/funding`),
    enabled: !!partnerId,
  });
  const { data: delegated = [] } = useQuery({
    queryKey: ['partner-delegated', partnerId],
    queryFn: () => apiFetch<Delegate[]>(`/partners/${partnerId}/delegated-admins`),
    enabled: !!partnerId,
  });
  const { data: members = [] } = useQuery({
    queryKey: ['partner-members', partnerId],
    queryFn: () => apiFetch<Member[]>(`/partners/${partnerId}/members`),
    enabled: !!partnerId,
  });

  const subs = billing?.subscriptions ?? [];
  const invoices = billing?.invoices ?? [];

  const fin = useMemo(() => {
    const totalSeats = subs.reduce((a, s) => a + (s.seats ?? 0), 0);
    const openInvoices = invoices.filter((i) => (i.status ?? 'due') !== 'paid');
    const outstanding = openInvoices.reduce((a, i) => a + (i.net ?? 0), 0);
    return { totalSeats, outstanding, overdue: openInvoices.length > 0 };
  }, [subs, invoices]);

  const perOrg = (orgId: string) => {
    const sub = subs.find((s) => s.orgId === orgId) ?? null;
    return {
      sub,
      funders: funding.filter((f) => f.orgId === orgId).length,
      coaches: members.filter((m) => m.role === 'coach' && m.organisationId === orgId).length,
      delegated: delegated.filter((d) => d.orgId === orgId).length,
      openInvoices: invoices.filter((i) => i.orgId === orgId && (i.status ?? 'due') !== 'paid').length,
    };
  };

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  const createOrg = useMutation({
    mutationFn: () => apiFetch<{ id: string }>('/organisations', { method: 'POST', body: JSON.stringify({ name: name.trim(), industry: industry.trim() || null }) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['organisations'] });
      setOpen(false);
      setFlash(`${name} created. Opening its hub…`);
      setName(''); setIndustry('');
      window.setTimeout(() => navigate(`/partner/org/${r.id}`), 650);
    },
    onError: (e: any) => setFlash(e?.message ?? 'Could not create the organisation.'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organisations"
        icon={Building}
        subtitle={`${orgs.length} organisation${orgs.length === 1 ? '' : 's'}. Open one to work inside it.`}
        action={canManage ? (
          <Button className="gap-1.5" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New organisation</Button>
        ) : undefined}
      />

      {flash && (
        <Card className="p-3 border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {flash}
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Building} label="Organisations" value={orgs.length} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={Users} label="Total seats" value={fin.totalSeats} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={ShieldCheck} label="Delegated admins" value={delegated.length} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={Receipt} label="Outstanding" value={ZAR(fin.outstanding)} tint={fin.overdue ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {orgs.map((o) => {
          const d = perOrg(o.id);
          return (
            <button key={o.id} onClick={() => navigate(`/partner/org/${o.id}`)}
              className="rounded-xl border border-border bg-card p-5 text-left hover:border-primary/40 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0"><Building className="h-5 w-5" /></span>
                  <span className="font-semibold truncate">{o.name}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" />{d.sub?.planName ?? 'No plan'}</span>
                <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{d.sub ? `${d.sub.activeSeats ?? 0}/${d.sub.seats ?? 0} seats` : '-'}</span>
                <span className="flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" />{d.funders} funder{d.funders === 1 ? '' : 's'}</span>
                <span className="flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5" />{d.coaches} coach{d.coaches === 1 ? '' : 'es'}</span>
                {d.delegated > 0 && <span className="flex items-center gap-1.5 text-violet-600"><ShieldCheck className="h-3.5 w-3.5" />{d.delegated} delegated</span>}
                {d.openInvoices > 0 && <span className="flex items-center gap-1.5 text-amber-600"><Receipt className="h-3.5 w-3.5" />{d.openInvoices} open invoice{d.openInvoices === 1 ? '' : 's'}</span>}
              </div>
              <div className={cn('mt-3 text-xs font-medium text-primary')}>Open organisation →</div>
            </button>
          );
        })}
        {orgs.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground sm:col-span-2 border-dashed">
            No organisations yet.{canManage ? ' Create one to get started.' : ''}
          </Card>
        )}
      </div>

      {!canManage && (
        <Card className="p-4 flex items-start gap-3 text-sm border-dashed">
          <Mail className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="text-muted-foreground">New organisations are onboarded by the Synops engagement team during setup. To add one, raise a request from Support and it will appear here once provisioned.</div>
        </Card>
      )}

      {/* Create organisation */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> New organisation</DialogTitle>
            <DialogDescription>Provision a new organisation under this partner. It gets its own hub and reporting immediately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Organisation name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Capitec Skills Academy"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
            <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Industry (optional)</span>
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Enterprise & Supplier Development"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
            <p className="text-xs text-muted-foreground">Seats, plan and admins are configured inside the organisation's own hub after it is created.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button className="gap-1.5" disabled={!name.trim() || createOrg.isPending} onClick={() => createOrg.mutate()}><Plus className="h-4 w-4" /> {createOrg.isPending ? 'Creating…' : 'Create organisation'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
