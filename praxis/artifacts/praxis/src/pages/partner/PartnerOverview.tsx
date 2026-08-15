import React, { useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/context/SessionContext';
import { apiFetch } from '@/lib/api';
import { useBrandTheme } from '@/context/ThemeProvider';
import { PageHeader } from '@/components/PageHeader';
import { StatCard, SectionTitle } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard, Users, ArrowRight, Building, ChevronRight, Megaphone, Palette, Settings, GraduationCap,
} from 'lucide-react';
import { getActivePartnerId } from '@/lib/partnerHubData';

type OrgRow = { id: string; name: string; memberCount?: number };
type Member = { role?: string; organisationId?: string | null };

/**
 * Partner Hub overview (learning-only): organisations, people and coaches at a glance, plus quick
 * links to the learning-admin surfaces. No billing/funder/paperwork.
 */
export function PartnerOverview() {
  const { user } = useSession();
  const [, navigate] = useLocation();
  const { data: brand } = useBrandTheme();
  const partnerId = user?.partnerId ?? getActivePartnerId() ?? '';
  const partnerName = brand?.displayName || 'Your organisation';

  const { data: orgs = [] } = useQuery({ queryKey: ['organisations', partnerId], queryFn: () => apiFetch<OrgRow[]>(`/organisations${partnerId ? `?partnerId=${encodeURIComponent(partnerId)}` : ''}`), enabled: !!partnerId });
  const { data: members = [] } = useQuery({ queryKey: ['partner-members', partnerId], queryFn: () => apiFetch<Member[]>(`/partners/${partnerId}/members`), enabled: !!partnerId });

  const totals = useMemo(() => ({
    people: orgs.reduce((a, o) => a + (o.memberCount ?? 0), 0),
    coaches: members.filter((m) => m.role === 'coach').length,
  }), [orgs, members]);
  const coachesFor = (orgId: string) => members.filter((m) => m.role === 'coach' && m.organisationId === orgId).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner Hub"
        icon={LayoutDashboard}
        subtitle={`${partnerName} - your organisations, learners and coaching in one place.`}
        action={<Badge variant="outline" className="gap-1.5"><Building className="h-3.5 w-3.5" /> {orgs.length} {orgs.length === 1 ? 'organisation' : 'organisations'}</Badge>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: 'Organisations', icon: Building, href: '/partner/organisations' },
          { label: 'Accounts & Roles', icon: Users, href: '/partner/accounts' },
          { label: 'Communications', icon: Megaphone, href: '/partner/comms' },
          { label: 'Branding', icon: Palette, href: '/partner/theme' },
        ].map((q) => (
          <button key={q.href} onClick={() => navigate(q.href)}
            className="rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:border-primary/40 hover:bg-muted/40 transition-colors flex items-center gap-2.5">
            <q.icon className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs font-medium truncate">{q.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard icon={Building} label="Organisations" value={orgs.length} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={Users} label="People" value={totals.people} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={GraduationCap} label="Coaches" value={totals.coaches} tint="bg-violet-500/10 text-violet-600" />
      </div>

      <Card className="p-5">
        <SectionTitle action={<Button size="sm" variant="ghost" className="gap-1" onClick={() => navigate('/partner/organisations')}>Manage <ArrowRight className="h-3.5 w-3.5" /></Button>}>Organisations</SectionTitle>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          {orgs.map((o) => (
            <button key={o.id} onClick={() => navigate(`/partner/org/${o.id}`)}
              className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/40 hover:bg-muted/40 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{o.name}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span><Users className="inline h-3 w-3 mr-1" />{o.memberCount ?? 0} {o.memberCount === 1 ? 'person' : 'people'}</span>
                <span><GraduationCap className="inline h-3 w-3 mr-1" />{coachesFor(o.id)} coach{coachesFor(o.id) === 1 ? '' : 'es'}</span>
              </div>
            </button>
          ))}
          {orgs.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground sm:col-span-2 border-dashed">No organisations yet.</Card>}
        </div>
      </Card>
    </div>
  );
}
