import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';
import { useGetMe } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, BookOpen, ArrowRight, CheckCircle2, FileWarning, Trash2 } from 'lucide-react';

/** One module's blocking reasons (missing components, and/or "not published yet"). */
type IncompleteReason = { moduleId: string; moduleTitle: string; moduleStatus: string; missing: string[] };
type IncompleteCourse = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  moduleCount: number;
  complete: boolean;
  courseIssues: string[];
  incompleteReasons: IncompleteReason[];
};

/**
 * "Incomplete courses" repository (Hub-only: Super Admin + Instructional Designer).
 *
 * The catalogue only ever shows fully-built, published courses. Everything still being built lands
 * here, with the exact per-module list of what is missing, and a link to open each course and finish
 * it. This is the author's worklist, not a learner surface.
 */
export function IncompleteCourses() {
  const { data: user } = useGetMe();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const isHub = user?.role === 'super_admin' || user?.role === 'instructional_designer';

  const remove = async (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}" and everything in it? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await apiFetch(`/courses/${id}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['courses'] });
    } catch {
      window.alert('Could not delete this course. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const { data: courses, isLoading, isError } = useQuery({
    queryKey: ['courses', 'incomplete'],
    queryFn: () => apiFetch<IncompleteCourse[]>('/courses/incomplete'),
    enabled: isHub,
    retry: false,
  });

  if (!isHub) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <FileWarning className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
        <h1 className="text-xl font-serif font-semibold mb-1">Not available</h1>
        <p className="text-sm text-muted-foreground">The Incomplete courses repository is for Hub authors only.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <h1 className="text-2xl font-serif font-bold tracking-tight">Incomplete courses</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Courses that are not yet ready for the catalogue. Each one shows exactly what every module is
          still missing. Learners never see these; finish a course and it moves to the catalogue automatically.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Could not load the incomplete courses. Please try again.
          </CardContent>
        </Card>
      )}

      {courses && courses.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600 mb-3" />
            <h2 className="font-serif font-semibold text-lg mb-1">Every course is complete</h2>
            <p className="text-sm text-muted-foreground">There are no incomplete courses right now. Nice work.</p>
          </CardContent>
        </Card>
      )}

      {courses && courses.length > 0 && (
        <div className="space-y-4">
          {courses.map((course) => (
            <Card key={course.id} className="overflow-hidden">
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{course.title}</span>
                    <Badge variant="outline" className="text-[10px] capitalize shrink-0">{course.status}</Badge>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {course.moduleCount} {course.moduleCount === 1 ? 'module' : 'modules'}
                    {course.incompleteReasons.length > 0 && (
                      <> - {course.incompleteReasons.length} still need{course.incompleteReasons.length === 1 ? 's' : ''} work</>
                    )}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(course.id, course.title)}
                    disabled={deletingId === course.id}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    {deletingId === course.id ? 'Deleting...' : 'Delete'}
                  </Button>
                  <Button size="sm" onClick={() => navigate(`/courses/${course.id}`)}>
                    Open to finish <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Course-wide blockers (not published yet, no modules). */}
                {course.courseIssues.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {course.courseIssues.map((issue, i) => (
                      <li key={i}>
                        <Badge variant="secondary" className="font-normal text-amber-700 bg-amber-500/10">{issue}</Badge>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Per-module: exactly what is missing. */}
                {course.incompleteReasons.length > 0 ? (
                  <div className="space-y-3">
                    {course.incompleteReasons.map((m) => (
                      <div key={m.moduleId} className="rounded-xl border border-border bg-muted/30 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium text-foreground truncate">{m.moduleTitle || 'Untitled module'}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">{m.moduleStatus}</Badge>
                        </div>
                        <ul className="flex flex-wrap gap-1.5">
                          {m.missing.map((label, i) => (
                            <li key={i} className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-700">
                              <AlertTriangle className="h-3 w-3" /> {label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  course.courseIssues.length === 0 && (
                    <p className="text-sm text-muted-foreground">All modules are complete; this course is not catalogue-ready yet.</p>
                  )
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
