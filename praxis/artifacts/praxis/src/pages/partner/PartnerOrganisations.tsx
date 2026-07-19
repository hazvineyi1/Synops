import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Building, ChevronRight, Wallet, Users, Landmark, Receipt, ShieldCheck, GraduationCap, Mail,
  Plus, CheckCircle2, Sparkles,
} from 'lucide-react';
import { getPartnerHub, orgDetail, financeRollup, createOrg, isCreatedOrg, useHubData, ZAR } from '@/lib/partnerHubData';
import { orgNameOverride, useOrgOverrides } from '@/lib/orgOverridesStore';

/**
 * Organisations (selector). The Main-Admin's list of every organisation under the partner. Picking
 * one steps fully INTO that organisation's own hub (/partner/org/:id). A super admin or partner
 * admin can also CREATE an organisation here - it is pushed into this partner and behaves exactly
 * like a seeded org (its own hub, financials and reports).
 */
export function PartnerOrganisations() {
  const { user } = useSession();
  const [, navigate] = useLocation();
  useOrgOverrides();
  useHubData(); // re-render when an org is created
  const h = getPartnerHub(user?.partnerId);
  const fin = financeRollup(h);
  const canManage = user?.role === 'partner_admin' || user?.role === 'super_admin';

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [planId, setPlanId] = useState(h.plans[1]?.id ?? h.plans[0]?.id ?? '');
  const [seats, setSeats] = useState(30);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  const submit = () => {
    const id = createOrg(h.partnerId, { name, planId, seats, adminName, adminEmail }, user?.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : 'Super Admin', user?.role === 'super_admin' ? 'Super Admin' : 'Partner Admin');
    if (!id) return;
    setOpen(false);
    setFlash(`${name} created. Opening its hub…`);
    setName(''); setSeats(30); setAdminName(''); setAdminEmail('');
    window.setTimeout(() => navigate(`/partner/org/${id}`), 650);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organisations"
        icon={Building}
        subtitle={`${h.partnerName} - ${h.orgs.length} organisation${h.orgs.length === 1 ? '' : 's'}. Open one to work inside it.`}
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
        <StatCard icon={Building} label="Organisations" value={h.orgs.length} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={Users} label="Total seats" value={fin.totalSeats} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={ShieldCheck} label="Delegated admins" value={h.delegatedAdmins.length} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={Receipt} label="Outstanding" value={ZAR(fin.outstanding)} tint={fin.overdue ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {h.orgs.map((o) => {
          const d = orgDetail(h, o.id);
          return (
            <button key={o.id} onClick={() => navigate(`/partner/org/${o.id}`)}
              className="rounded-xl border border-border bg-card p-5 text-left hover:border-primary/40 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0"><Building className="h-5 w-5" /></span>
                  <span className="font-semibold truncate">{orgNameOverride(o.id) ?? o.name}</span>
                  {isCreatedOrg(o.id) && <Badge className="bg-emerald-100 text-emerald-700 shrink-0">New</Badge>}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" />{d.plan?.name ?? 'No plan'}</span>
                <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{d.sub ? `${d.sub.activeSeats}/${d.sub.seats} seats` : '-'}</span>
                <span className="flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" />{d.funders.length} funder{d.funders.length === 1 ? '' : 's'}</span>
                <span className="flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5" />{d.coaches.length} coach{d.coaches.length === 1 ? '' : 'es'}</span>
                {d.delegated.length > 0 && <span className="flex items-center gap-1.5 text-violet-600"><ShieldCheck className="h-3.5 w-3.5" />{d.delegated.length} delegated</span>}
                {d.openInvoices > 0 && <span className="flex items-center gap-1.5 text-amber-600"><Receipt className="h-3.5 w-3.5" />{d.openInvoices} open invoice{d.openInvoices === 1 ? '' : 's'}</span>}
              </div>
              <div className={cn('mt-3 text-xs font-medium text-primary')}>Open organisation →</div>
            </button>
          );
        })}
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
            <DialogDescription>Provision a new organisation under {h.partnerName}. It gets its own hub, seats and reporting immediately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Organisation name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Capitec Skills Academy"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Plan</span>
                <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {h.plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {ZAR(p.pricePerSeat)}/seat</option>)}
                </select></label>
              <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Seats</span>
                <input type="number" min={1} value={seats} onChange={(e) => setSeats(Math.max(1, Number(e.target.value) || 0))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Org admin name (optional)</span>
                <input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Full name"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
              <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Org admin email (optional)</span>
                <input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@org.co.za"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
            </div>
            <p className="text-xs text-muted-foreground">If you add an admin email, they are invited as the organisation's admin (status: invited).</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button className="gap-1.5" disabled={!name.trim()} onClick={submit}><Plus className="h-4 w-4" /> Create organisation</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
