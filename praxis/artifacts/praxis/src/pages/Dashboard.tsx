import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useGetMe, useGetAnalyticsOverview, useListPartners, useGetPartnerStats, useListOrganisations } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, BookOpen, Award, TrendingUp, Building, FileText, AlertTriangle } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { LearnerHome } from '@/pages/LearnerHome';
import { FunderDashboard } from '@/pages/FunderDashboard';

export function Dashboard() {
  const { data: user } = useGetMe();

  if (!user) return null;

  // Learners get the redesigned learner hub: courses + progress + what's due + what's
  // new + the coach as a clear entry point, rather than a coach-only spine page.
  if (user.role === 'learner') {
    return <LearnerHome firstName={user.firstName} />;
  }

  // Funders get a dedicated read-only, aggregate-only impact view (decision §10.2).
  if (user.role === 'funder') {
    return <FunderDashboard firstName={user.firstName} />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-serif font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground">Welcome back, {user.firstName || 'User'}. Here's what's happening.</p>
      </div>

      {user.role === 'super_admin' && <SuperAdminDashboard />}
      {user.role === 'partner_admin' && <PartnerAdminDashboard partnerId={user.partnerId ?? undefined} />}
      {user.role === 'org_admin' && <OrgAdminDashboard />}
      {user.role === 'coach' && <CoachDashboard />}
      {user.role === 'instructional_designer' && <InstructionalDesignerDashboard />}
    </div>
  );
}

function SuperAdminDashboard() {
  const { data: analytics, isLoading: analyticsLoading } = useGetAnalyticsOverview();
  const { data: partners, isLoading: partnersLoading } = useListPartners();

  if (analyticsLoading || partnersLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Learners" value={analytics?.totalLearners || 0} icon={Users} trend="+12% this month" />
        <StatCard title="Active Enrolments" value={analytics?.activeEnrolments || 0} icon={BookOpen} trend="+5% this week" />
        <StatCard title="Credentials Issued" value={analytics?.credentialsIssued || 0} icon={Award} trend="+24% all time" />
        <StatCard title="Avg Mastery" value={`${((analytics?.avgMastery || 0) * 100).toFixed(0)}%`} icon={TrendingUp} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Partner Tenants</CardTitle>
          <CardDescription>All active partner organizations on the platform.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {partners?.map(partner => (
              <div key={partner.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                    <Building className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{partner.name}</p>
                    <p className="text-sm text-muted-foreground">{partner.learnerCount || 0} learners &middot; {partner.status}</p>
                  </div>
                </div>
                <Link href="/admin/partners">
                  <Button variant="outline" size="sm">Manage</Button>
                </Link>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PartnerAdminDashboard({ partnerId }: { partnerId?: string }) {
  // NOTE: the generated hook disables the query when partnerId is null/undefined, so
  // `statsLoading` is only ever true while an ENABLED query is genuinely fetching. Never
  // gate the whole page on `!stats` — a disabled/errored query would hang the skeleton
  // forever (that was the infinite-loading Overview bug). Fall back to the orgs list.
  const { data: stats, isLoading: statsLoading } = useGetPartnerStats(partnerId as string);
  const { data: orgs, isLoading: orgsLoading } = useListOrganisations();

  if ((partnerId && statsLoading) || orgsLoading) return <LoadingSkeleton />;

  const s = stats ?? {
    orgCount: orgs?.length ?? 0,
    totalLearners: 0,
    activeEnrolments: 0,
    completionRate: 0,
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Organisations" value={s.orgCount} icon={Building} />
        <StatCard title="Total Learners" value={s.totalLearners} icon={Users} />
        <StatCard title="Active Enrolments" value={s.activeEnrolments} icon={BookOpen} />
        <StatCard title="Completion Rate" value={`${(s.completionRate * 100).toFixed(0)}%`} icon={TrendingUp} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Book of Business</CardTitle>
          <CardDescription>Organisations under your partnership.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orgs?.map(org => (
              <Card key={org.id} className="shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{org.name}</CardTitle>
                  <CardDescription>{org.industry || 'General'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium">{org.memberCount || 0} Members</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OrgAdminDashboard() {
  const { data: analytics, isLoading } = useGetAnalyticsOverview();

  if (isLoading) return <LoadingSkeleton />;

  const a = analytics ?? { totalLearners: 0, activeEnrolments: 0, credentialsIssued: 0 };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Team Members" value={a.totalLearners} icon={Users} />
        <StatCard title="Active Training" value={a.activeEnrolments} icon={BookOpen} />
        <StatCard title="Credentials Earned" value={a.credentialsIssued} icon={Award} />
      </div>

      {/* Workforce diagnostics would go here */}
      <Card>
        <CardHeader>
          <CardTitle>Workforce Diagnostics</CardTitle>
          <CardDescription>Competency gaps across your organisation.</CardDescription>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center text-muted-foreground border border-dashed rounded-md">
          Diagnostic charts rendering...
        </CardContent>
      </Card>
    </div>
  );
}

function CoachDashboard() {
  // Real data — the previous version showed hardcoded 24 / 7 / 82% figures, which is not acceptable
  // to show a coach at a paying partner.
  const { data: learners, isLoading: learnersLoading } = useQuery<any[]>({ queryKey: ['coach-learners'], queryFn: () => apiFetch('/coach/learners'), retry: false });
  const { data: submissions } = useQuery<any[]>({ queryKey: ['coach-submissions'], queryFn: () => apiFetch('/coach/submissions'), retry: false });

  const total = learners?.length ?? 0;
  const flagged = (learners ?? []).filter((l) => l.status === 'off_track' || l.status === 'at_risk');
  const pending = (submissions ?? []).filter((s) => s.status === 'submitted').length;
  const withMastery = (learners ?? []).map((l) => (typeof l.masteryPct === 'number' ? l.masteryPct : null)).filter((v): v is number => v !== null);
  const avgReadiness = withMastery.length ? Math.round(withMastery.reduce((a, b) => a + b, 0) / withMastery.length) : null;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Learners Assigned" value={learnersLoading ? '—' : total} icon={Users} />
        <StatCard title="Pending Submissions" value={pending} icon={FileText} />
        <StatCard title="Avg Learner Readiness" value={avgReadiness == null ? '—' : `${avgReadiness}%`} icon={TrendingUp} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Needs Attention</CardTitle>
          <CardDescription>Learners flagged off-track or at-risk in the gradebook.</CardDescription>
        </CardHeader>
        <CardContent>
          {learnersLoading ? (
            <div className="h-24 flex items-center justify-center text-muted-foreground">Loading…</div>
          ) : flagged.length === 0 ? (
            <div className="h-24 flex items-center justify-center text-muted-foreground">No learners need attention right now.</div>
          ) : (
            <div className="space-y-2">
              {flagged.slice(0, 6).map((l) => (
                <Link key={l.userId ?? l.id} href="/learners" className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30">
                  <span className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-amber-500" /> {l.name ?? l.email}</span>
                  <span className="text-xs text-muted-foreground capitalize">{String(l.status ?? '').replace('_', ' ')}</span>
                </Link>
              ))}
              {flagged.length > 6 && <Link href="/learners" className="block text-sm text-primary hover:underline pt-1">View all {flagged.length} →</Link>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


function InstructionalDesignerDashboard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Link href="/studio">
        <Card className="hover:bg-muted/30 transition-colors cursor-pointer h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Studio</CardTitle>
            <CardDescription>Author courses, modules and interactives for every organisation.</CardDescription>
          </CardHeader>
        </Card>
      </Link>
      <Link href="/compliance">
        <Card className="hover:bg-muted/30 transition-colors cursor-pointer h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Award className="h-5 w-5 text-primary" />Compliance &amp; standards</CardTitle>
            <CardDescription>Define QCTO/SETA unit standards and map them to content.</CardDescription>
          </CardHeader>
        </Card>
      </Link>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend }: { title: string, value: string | number, icon: any, trend?: string }) {
  return (
    <Card>
      <CardContent className="p-6 flex flex-col justify-between h-full space-y-4">
        <div className="flex justify-between items-start">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="p-2 bg-primary/5 rounded-md text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div>
          <h3 className="text-3xl font-serif font-bold">{value}</h3>
          {trend && <p className="text-xs text-muted-foreground mt-1">{trend}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted rounded-xl" />)}
      </div>
      <div className="h-64 bg-muted rounded-xl" />
    </div>
  );
}
