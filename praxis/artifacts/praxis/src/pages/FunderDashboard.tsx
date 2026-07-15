import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Award, GraduationCap, Clock, Download, Building } from 'lucide-react';

type OrgRow = {
  organisationId: string;
  organisationName: string | null;
  learners: number;
  completions: number;
  credentials: number;
  coachingHours: number | null;
};
type Report = {
  organisations: OrgRow[];
  totals: { learners: number; completions: number; credentials: number; coachingHours: number };
};

/**
 * Funder / sponsor dashboard (decision doc §10.2). Read-only, aggregate-only. Shows the
 * outcomes for the organisations this funder finances and nothing else — no individual
 * learner data ever reaches this view.
 */
export function FunderDashboard({ firstName }: { firstName?: string | null }) {
  const { data: report, isLoading } = useQuery({
    queryKey: ['funder', 'report'],
    queryFn: () => apiFetch<Report>('/funder/report'),
  });

  if (isLoading) return <LoadingSkeleton />;

  const orgs = report?.organisations ?? [];
  const totals = report?.totals ?? { learners: 0, completions: 0, credentials: 0, coachingHours: 0 };

  const exportCsv = () => {
    const header = ['Organisation', 'Learners', 'Completions', 'Credentials', 'Coaching hours'];
    const rows = orgs.map((o) => [o.organisationName ?? o.organisationId, o.learners, o.completions, o.credentials, o.coachingHours ?? 0]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'funder-impact-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold tracking-tight">Impact overview</h1>
          <p className="text-muted-foreground">
            Aggregate outcomes across the programmes you fund{firstName ? `, ${firstName}` : ''}.
          </p>
        </div>
        {orgs.length > 0 && (
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        )}
      </div>

      {orgs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Building className="h-10 w-10 mx-auto mb-4 opacity-40" />
            No funded organisations are assigned to your account yet. Your Synops contact will grant access.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <Stat title="Learners" value={totals.learners} icon={Users} />
            <Stat title="Completions" value={totals.completions} icon={GraduationCap} />
            <Stat title="Credentials" value={totals.credentials} icon={Award} />
            <Stat title="Coaching hours" value={totals.coachingHours} icon={Clock} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>By organisation</CardTitle>
              <CardDescription>Read-only. Aggregate figures only — no individual learner data.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2 pr-4 font-medium">Organisation</th>
                      <th className="py-2 px-4 font-medium text-right">Learners</th>
                      <th className="py-2 px-4 font-medium text-right">Completions</th>
                      <th className="py-2 px-4 font-medium text-right">Credentials</th>
                      <th className="py-2 pl-4 font-medium text-right">Coaching hrs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgs.map((o) => (
                      <tr key={o.organisationId} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium">{o.organisationName ?? o.organisationId}</td>
                        <td className="py-3 px-4 text-right">{o.learners}</td>
                        <td className="py-3 px-4 text-right">{o.completions}</td>
                        <td className="py-3 px-4 text-right">{o.credentials}</td>
                        <td className="py-3 pl-4 text-right">{o.coachingHours ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ title, value, icon: Icon }: { title: string; value: number; icon: React.ElementType }) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex justify-between items-start">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="p-2 bg-primary/5 rounded-md text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <h3 className="text-3xl font-serif font-bold">{value}</h3>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-muted rounded-xl" />
        ))}
      </div>
      <div className="h-64 bg-muted rounded-xl" />
    </div>
  );
}
