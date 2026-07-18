import React, { useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Building, ChevronRight, ArrowLeft, Wallet, Users, Landmark, Receipt,
  ShieldCheck, FileText, GraduationCap, Mail,
} from 'lucide-react';
import { getPartnerHub, orgDetail, financeRollup, ZAR, DELEGATABLE_POWERS } from '@/lib/partnerHubData';

/**
 * Organisations (upgrade §8). The Main-Admin's org-by-org map of the tenant. The index lists
 * every organisation with headline health; drilling in opens a single organisation's sub-hub —
 * subscription, seats, delegated admins, funders, invoices and paperwork — all scoped to that one
 * org. Partner-wide (Main-Admin) controls live in their own sections and never leak into an org view.
 */
export function PartnerOrganisations() {
  const { user } = useSession();
  const [, navigate] = useLocation();
  const search = useSearch();
  const h = getPartnerHub(user?.partnerId);
  const fin = financeRollup(h);

  const initial = new URLSearchParams(search).get('org');
  const [openOrg, setOpenOrg] = useState<string | null>(initial);

  const detail = useMemo(() => (openOrg ? orgDetail(h, openOrg) : null), [openOrg, h]);

  // ---- Single organisation sub-hub ----
  if (detail && detail.org) {
    const d = detail;
    return (
      <div className="space-y-6">
        <button onClick={() => { setOpenOrg(null); navigate('/partner/organisations'); }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All organisations
        </button>

        <PageHeader
          title={d.org.name}
          icon={Building}
          subtitle={`Organisation sub-hub — everything scoped to ${d.org.name}, and nothing beyond it.`}
          action={d.plan ? <Badge variant="outline" className="gap-1.5"><Wallet className="h-3.5 w-3.5" /> {d.plan.name}</Badge> : undefined}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Seats (active)" value={d.sub ? `${d.sub.activeSeats}/${d.sub.seats}` : '—'} tint="bg-indigo-500/10 text-indigo-600" />
          <StatCard icon={Landmark} label="Funder agreements" value={d.funders.length} tint="bg-violet-500/10 text-violet-600" />
          <StatCard icon={Receipt} label="Open invoices" value={d.openInvoices} tint={d.openInvoices ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'} />
          <StatCard icon={FileText} label="Documents" value={d.docs} tint="bg-emerald-500/10 text-emerald-600" />
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Team */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Team</h3>
            <div className="space-y-2 text-sm">
              {[...d.admins, ...d.coaches].map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><div className="font-medium truncate">{a.name}</div><div className="text-xs text-muted-foreground truncate">{a.email}</div></div>
                  <span className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="capitalize text-[10px]">{a.role.replace('_', ' ')}</Badge>
                    <Badge variant={a.status === 'active' ? 'outline' : 'outline'} className={cn('capitalize text-[10px]', a.status === 'suspended' && 'border-red-300 text-red-600')}>{a.status}</Badge>
                  </span>
                </div>
              ))}
              {d.admins.length + d.coaches.length === 0 && <div className="text-muted-foreground">No team accounts yet.</div>}
            </div>
            <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => navigate('/partner/accounts')}><Users className="h-3.5 w-3.5" /> Manage accounts</Button>
          </Card>

          {/* Delegated admins for this org */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Delegated admins</h3>
            <div className="space-y-2.5 text-sm">
              {d.delegated.map((da) => (
                <div key={da.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{da.name}</span>
                    <Badge variant="secondary" className="capitalize text-[10px]">{da.status}</Badge>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {da.powers.map((p) => {
                      const meta = DELEGATABLE_POWERS.find((x) => x.key === p);
                      return <span key={p} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{meta?.label ?? p}</span>;
                    })}
                  </div>
                </div>
              ))}
              {d.delegated.length === 0 && <div className="text-muted-foreground">No delegated admin for this organisation.</div>}
            </div>
            <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => navigate('/partner/accounts')}><ShieldCheck className="h-3.5 w-3.5" /> Delegate / adjust powers</Button>
          </Card>

          {/* Funders */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" /> Funding</h3>
            <div className="space-y-2 text-sm">
              {d.funders.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{f.funder}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-muted-foreground tabular-nums">{f.seatsFunded} seats · {ZAR(f.value)}</span>
                    <Badge className={cn('text-[10px]', f.status === 'expiring' ? 'bg-amber-500' : f.status === 'pending' ? 'bg-muted text-muted-foreground' : 'bg-emerald-600')}>{f.status}</Badge>
                  </span>
                </div>
              ))}
              {d.funders.length === 0 && <div className="text-muted-foreground">No funder agreements scoped to this organisation.</div>}
            </div>
            <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => navigate('/partner/funders')}><Landmark className="h-3.5 w-3.5" /> Open Funders Hub</Button>
          </Card>

          {/* Documents */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Paperwork</h3>
            <div className="space-y-2 text-sm">
              {h.documents.filter((doc) => doc.orgName === d.name).map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{doc.name}</span>
                  <Badge variant="outline" className="capitalize text-[10px] shrink-0">{doc.status.replace('-', ' ')}</Badge>
                </div>
              ))}
              {h.documents.filter((doc) => doc.orgName === d.name).length === 0 && <div className="text-muted-foreground">No documents filed for this organisation.</div>}
            </div>
            <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => navigate('/partner/documents')}><FileText className="h-3.5 w-3.5" /> Open filing cabinet</Button>
          </Card>
        </div>

        <Card className="p-4 flex items-start gap-3 text-sm border-dashed">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="text-muted-foreground">You are viewing a <span className="text-foreground font-medium">single organisation</span>. Partner-wide Main-Admin controls — cross-org finance, funder master data, branding and audit — are deliberately kept in their own sections and are not editable from inside an organisation.</div>
        </Card>
      </div>
    );
  }

  // ---- Index: all organisations ----
  return (
    <div className="space-y-6">
      <PageHeader
        title="Organisations"
        icon={Building}
        subtitle={`${h.partnerName} — ${h.orgs.length} organisation${h.orgs.length === 1 ? '' : 's'}. Drill into any one for its scoped sub-hub.`}
      />

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
            <button key={o.id} onClick={() => { setOpenOrg(o.id); navigate(`/partner/organisations?org=${o.id}`); }}
              className="rounded-xl border border-border bg-card p-5 text-left hover:border-primary/40 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0"><Building className="h-5 w-5" /></span>
                  <span className="font-semibold truncate">{o.name}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" />{d.plan?.name ?? 'No plan'}</span>
                <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{d.sub ? `${d.sub.activeSeats}/${d.sub.seats} seats` : '—'}</span>
                <span className="flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" />{d.funders.length} funder{d.funders.length === 1 ? '' : 's'}</span>
                <span className="flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5" />{d.coaches.length} coach{d.coaches.length === 1 ? '' : 'es'}</span>
                {d.delegated.length > 0 && <span className="flex items-center gap-1.5 text-violet-600"><ShieldCheck className="h-3.5 w-3.5" />{d.delegated.length} delegated</span>}
                {d.openInvoices > 0 && <span className="flex items-center gap-1.5 text-amber-600"><Receipt className="h-3.5 w-3.5" />{d.openInvoices} open invoice{d.openInvoices === 1 ? '' : 's'}</span>}
              </div>
            </button>
          );
        })}
      </div>

      <Card className="p-4 flex items-start gap-3 text-sm border-dashed">
        <Mail className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="text-muted-foreground">New organisations are onboarded by the Synops engagement team during setup. To add one, raise a request from Support and it will appear here once provisioned.</div>
      </Card>
    </div>
  );
}
