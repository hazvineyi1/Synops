import React from 'react';
import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

export function CourseGradebook() {
  const { courseId } = useParams<{ courseId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['gradebook', courseId],
    queryFn: () => apiFetch<{ assignments: any[]; learners: any[] }>(`/courses/${courseId}/gradebook`),
  });

  const { data: course } = useQuery({ queryKey: ['course', courseId], queryFn: () => apiFetch<any>(`/courses/${courseId}`) });

  function getScoreColor(pct: number | null) {
    if (pct === null) return '';
    if (pct >= 80) return 'text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400';
    if (pct >= 60) return 'text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400';
    return 'text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-400';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <a href="/courses" className="hover:text-foreground">Courses</a>
        <ChevronRight className="h-4 w-4" />
        <a href={`/courses/${courseId}?tab=gradebook`} className="hover:text-foreground">{course?.title ?? 'Course'}</a>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Gradebook</span>
      </div>

      <h1 className="text-2xl font-bold text-foreground">Gradebook</h1>

      {isLoading && <Skeleton className="h-64" />}

      {data && (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground sticky left-0 bg-muted/50 min-w-[200px] border-r border-border">Learner</th>
                {data.assignments.map((a) => (
                  <th key={a.id} className="text-center py-3 px-3 font-medium text-muted-foreground min-w-[120px] border-r border-border last:border-r-0">
                    <div className="text-xs leading-tight">{a.title}</div>
                    <div className="text-xs text-muted-foreground/60">{a.pointsPossible} pts</div>
                  </th>
                ))}
                <th className="text-center py-3 px-3 font-medium text-muted-foreground min-w-[90px]">Overall</th>
              </tr>
            </thead>
            <tbody>
              {data.learners.map((learner) => (
                <tr key={learner.userId} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="py-3 px-4 sticky left-0 bg-background border-r border-border">
                    <div className="font-medium text-foreground">{learner.user?.firstName} {learner.user?.lastName}</div>
                    <div className="text-xs text-muted-foreground">{learner.user?.email}</div>
                  </td>
                  {learner.scores.map((s: any) => {
                    const pct = s.score !== null ? (s.score / s.possibleScore) * 100 : null;
                    return (
                      <td key={s.assignmentId} className="py-3 px-3 text-center border-r border-border/50 last:border-r-0">
                        {s.excused ? (
                          <span className="text-xs text-muted-foreground">EX</span>
                        ) : s.missing ? (
                          <Badge variant="destructive" className="text-xs">Miss</Badge>
                        ) : s.score !== null ? (
                          <span className={cn("text-xs font-mono px-2 py-0.5 rounded", getScoreColor(pct))}>
                            {s.score}/{s.possibleScore}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-3 px-3 text-center">
                    {learner.overallPercent !== null ? (
                      <span className={cn("text-sm font-bold px-2 py-0.5 rounded", getScoreColor(learner.overallPercent))}>
                        {learner.overallPercent.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {data.learners.length === 0 && (
                <tr><td colSpan={data.assignments.length + 2} className="text-center py-12 text-muted-foreground">No learners enrolled yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
