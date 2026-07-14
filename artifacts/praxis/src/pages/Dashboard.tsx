import React from 'react';
import { useGetMe, useGetAnalyticsOverview, useListPartners, useGetPartnerStats, useListOrganisations } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, BookOpen, Award, TrendingUp, Building, FileText } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { CoachHome } from '@/pages/CoachHome';

export function Dashboard() {
  const { data: user } = useGetMe();

  if (!user) return null;

  // Learners get the coach-led "spine" home — the coach leads, no blank dashboard.
  if (user.role === 'learner') {
    return (
      <div className="animate-in fade-in duration-500">
        <CoachHome firstName={user.firstName} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-serif font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground">Welcome back, {user.firstName || 'User'}. Here's what's happening.</p>
      </div>

      {user.role === 'super_admin' && <SuperAdminDashboard />}
      {user.role === 'partner_admin' && <PartnerAdminDashboard partnerId={user.partnerId!} />}
      {user.role === 'org_admin' && <OrgAdminDashboard />}
      {user.role === 'coach' && <CoachDashboard />}
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
                <Link href={`/admin/partners/${partner.id}`}>
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

function PartnerAdminDashboard({ partnerId }: { partnerId: string }) {
  const { data: stats } = useGetPartnerStats(partnerId);
  const { data: orgs } = useListOrganisations();

  if (!stats) return <LoadingSkeleton />;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Organisations" value={stats.orgCount} icon={Building} />
        <StatCard title="Total Learners" value={stats.totalLearners} icon={Users} />
        <StatCard title="Active Enrolments" value={stats.activeEnrolments} icon={BookOpen} />
        <StatCard title="Completion Rate" value={`${(stats.completionRate * 100).toFixed(0)}%`} icon={TrendingUp} />
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
  // Assuming useGetOrgStats would be used if available, fallback to analytics overview for mockup
  const { data: analytics } = useGetAnalyticsOverview();
  
  if (!analytics) return <LoadingSkeleton />;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Team Members" value={analytics.totalLearners} icon={Users} />
        <StatCard title="Active Training" value={analytics.activeEnrolments} icon={BookOpen} />
        <StatCard title="Credentials Earned" value={analytics.credentialsIssued} icon={Award} />
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
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Learners Assigned" value={24} icon={Users} />
        <StatCard title="Pending Submissions" value={7} icon={FileText} />
        <StatCard title="Avg Learner Readiness" value="82%" icon={TrendingUp} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Needs Attention</CardTitle>
          <CardDescription>Learners with dropping readiness scores or pending reviews.</CardDescription>
        </CardHeader>
        <CardContent className="h-32 flex items-center justify-center text-muted-foreground">
          Go to Learners tab to view list.
        </CardContent>
      </Card>
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
