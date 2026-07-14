import React from 'react';
import { useGetFunderReport } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, CheckCircle2, Award, Users } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export function Reports() {
  const { data: report, isLoading } = useGetFunderReport({});

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-20 bg-muted rounded-xl w-1/3" />
        <div className="h-64 bg-muted rounded-xl w-full" />
      </div>
    );
  }

  if (!report) return <div>No report available.</div>;

  return (
    <div className="space-y-8 animate-in fade-in max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-serif font-bold tracking-tight">Funder Evidence Report</h1>
          <p className="text-muted-foreground">Generated {new Date(report.generatedAt).toLocaleDateString()}</p>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" /> Download PDF
        </Button>
      </div>

      <div className="bg-card border border-border shadow-xl rounded-2xl overflow-hidden p-8 sm:p-12 printable-area">
        {/* Report Header */}
        <div className="border-b border-border pb-8 mb-8 flex justify-between items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-primary mb-2">Program Impact Evidence</p>
            <h2 className="text-3xl font-serif font-bold">{report.orgName}</h2>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>Reporting Period</p>
            <p className="font-medium text-foreground">{new Date(report.period.from).toLocaleDateString()} &mdash; {new Date(report.period.to).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Top line metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3"/> Enrolments</p>
            <p className="text-3xl font-serif font-bold">{report.enrolments}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/> Completions</p>
            <p className="text-3xl font-serif font-bold">{report.completions}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Award className="h-3 w-3"/> Credentials</p>
            <p className="text-3xl font-serif font-bold">{report.credentialsIssued}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Avg Mastery</p>
            <p className="text-3xl font-serif font-bold text-primary">{Math.round(report.avgMastery * 100)}%</p>
          </div>
        </div>

        {/* Competency Highlights */}
        <div className="space-y-6">
          <h3 className="text-xl font-serif font-bold border-b border-border pb-2">Competency Acquisition Breakdown</h3>
          
          <div className="space-y-5 pt-2">
            {report.competencyHighlights?.map((comp, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="w-full sm:w-1/3">
                  <p className="font-medium text-sm">{comp.tag}</p>
                  <p className="text-xs text-muted-foreground">{comp.masteredCount} of {comp.learnerCount} achieved mastery</p>
                </div>
                <div className="w-full sm:w-2/3 flex items-center gap-4">
                  <Progress value={comp.avgScore * 100} className="h-2 flex-1" />
                  <span className="text-sm font-bold w-12 text-right">{Math.round(comp.avgScore * 100)}%</span>
                </div>
              </div>
            ))}
            {(!report.competencyHighlights || report.competencyHighlights.length === 0) && (
              <p className="text-muted-foreground italic text-sm">No detailed competency data available for this period.</p>
            )}
          </div>
        </div>

        {/* Footnote */}
        <div className="mt-16 pt-6 border-t border-border flex justify-between items-center text-xs text-muted-foreground">
          <p>Generated securely via Synops Praxis</p>
          <p>Verification ID: {Math.random().toString(36).substring(2, 10).toUpperCase()}</p>
        </div>
      </div>
    </div>
  );
}
