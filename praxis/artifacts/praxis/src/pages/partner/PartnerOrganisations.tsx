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
  Building, ChevronRight, Users, GraduationCap, Mail, Plus, CheckCircle2, Trash2,
} from 'lucide-react';
import { getActivePartnerId } from '@/lib/partnerHubData';

/**
 * Organisations selector (learning-only). Shows each organisation with its people and coaches, and
 * lets an admin open, create or delete one. No billing/funding/paperwork surfaces.
 */
type OrgRow = { id: string; name: string; industry?: string | null; memberCount?: number };
type Member = { role?: string; organisationId?: string | null };

export function PartnerOrganisations() {
  const { user } = useSession();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const partnerId = user?.partnerId ?? getActivePartnerId() ?? '';
  const canManage = user?.role === 'partner_admin' || user?.role === 'super_admin';

  // Scope the list to THIS partner (keyed by partnerId so switching partners refetches, and a super
  // admin inside a partner never sees another partner's orgs). Wait for a partner before loading.
  const { data: orgs = [] } = useQuery({
    queryKey: ['organisations', partnerId],
    queryFn: () => apiFetch<OrgRow[]>(`/organisations${partnerId ? `?partnerId=${encodeURIComponent(partnerId)}` : ''}`),
    enabled: !!partnerId,
  });
  const { data: members = [] } = useQuery({
    queryKey: ['partner-members', partnerId],
    queryFn: () => apiFetch<Member[]>(`/partners/${partnerId}/members`),
    enabled: !!partnerId,
  });

  const totals = useMemo(() => {
    const people = orgs.reduce((a, o) => a + (o.memberCount ?? 0), 0);
    const coaches = members.filter((m) => m.role === 'coach').length;
    return { people, coaches };
  }, [orgs, members]);

  const coachesFor = (orgId: string) => members.filter((m) => m.role === 'coach' && m.organisationId === orgId).length;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  const createOrg = useMutation({
    mutationFn: () => apiFetch<{ id: string }>('/organisations', { method: 'POST', body: JSON.stringify({ name: name.trim(), industry: industry.trim() || null, partnerId: partnerId || undefined }) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['organisations'] });
      setOpen(false);
      setFlash(`${name} created. Opening its hub…`);
      setName(''); setIndustry('');
      window.setTimeout(() => navigate(`/partner/org/${r.id}`), 650);
    },
    onError: (e: any) => setFlash(e?.message ?? 'Could not create the organisation.'),
  });

  // Delete an organisation and everything scoped to it (members, learners, classes, delivery). Uses
  // ?force=true so a seeded, non-empty org can actually be removed. Guarded by an explicit confirm.
  const deleteOrg = useMutation({
    mutationFn: (id: string) => apiFetch(`/organisations/${id}?force=true`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['organisations'] }); setFlash('Organisation deleted.'); },
    onError: (e: any) => setFlash(e?.message ?? 'Could not delete the organisation.'),
  });
  const confirmDelete = (o: OrgRow) => {
    if (window.confirm(`Delete "${o.name}" and ALL of its members, learners, classes and delivery data? This cannot be undone. (Partner courses are not affected.)`)) {
      deleteOrg.mutate(o.id);
    }
  };

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

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard icon={Building} label="Organisations" value={orgs.length} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={Users} label="People" value={totals.people} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={GraduationCap} label="Coaches" value={totals.coaches} tint="bg-violet-500/10 text-violet-600" />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {orgs.map((o) => (
          <div key={o.id} onClick={() => navigate(`/partner/org/${o.id}`)}
            className="cursor-pointer rounded-xl border border-border bg-card p-5 text-left hover:border-primary/40 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0"><Building className="h-5 w-5" /></span>
                <span className="font-semibold truncate">{o.name}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{o.memberCount ?? 0} {o.memberCount === 1 ? 'person' : 'people'}</span>
              <span className="flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5" />{coachesFor(o.id)} coach{coachesFor(o.id) === 1 ? '' : 'es'}</span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className={cn('text-xs font-medium text-primary')}>Open organisation →</span>
              {canManage && (
                <button
                  onClick={(e) => { e.stopPropagation(); confirmDelete(o); }}
                  disabled={deleteOrg.isPending}
                  className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                  title={`Delete ${o.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
            </div>
          </div>
        ))}
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
            <DialogTitle className="flex items-center gap-2">New organisation</DialogTitle>
            <DialogDescription>Provision a new organisation under this partner. It gets its own hub immediately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Organisation name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Capitec Skills Academy"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
            <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Industry (optional)</span>
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Enterprise & Supplier Development"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
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
