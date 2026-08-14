import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';
import { useGetMe } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, BookOpen, ArrowRight, CheckCircle2, FileWarning, Trash2, Library } from 'lucide-react';

/** One component of the nine a module needs, with the label the author sees. */
type MissingComponent = { key: string; label: string };
/** Full per-module completeness detail returned by GET /courses/incomplete. */
type ModuleDetail = {
  moduleId: string;
  moduleTitle: string;
  status: string;
  published: boolean;
  complete: boolean;
  missing: MissingComponent[];
};
type IncompleteCourse = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  moduleCount: number;
  complete: boolean;
  courseIssues: string[];
  modules: ModuleDetail[];
};

/**
 * The nine components every module needs, in display order. Kept in sync with the server's
 * COMPONENT_ORDER / COMPONENT_LABELS (courseCompleteness.ts). Present ones render green with a
 * check; missing ones render red with a warning.
 */
const ALL_COMPONENTS: MissingComponent[] = [
  { key: 'description', label: 'Module description' },
  { key: 'objectives', label: 'Learning objectives' },
  { key: 'readings', label: 'A published reading' },
  { key: 'videos', label: 'A video lesson' },
  { key: 'interactives', label: 'A published interactive activity' },
  { key: 'caseStudy', label: 'A published case study' },
  { key: 'assignment', label: 'A published assignment' },
  { key: 'discussion', label: 'A discussion' },
  { key: 'structure', label: 'Lesson structure (ordered beats)' },
];

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
  const [publishingId, setPublishingId] = React.useState<string | null>(null);
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

  /** Flip a course to published. Only offered once every module is complete AND published, so
   * publishing here makes the course catalogue-eligible and it moves out of this list. */
  const publishToCatalogue = async (id: string) => {
    setPublishingId(id);
    try {
      await apiFetch(`/courses/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'published' }) });
      await qc.invalidateQueries({ queryKey: ['courses'] });
    } catch {
      window.alert('Could not move this course to the catalogue. Please try again.');
    } finally {
      setPublishingId(null);
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
          {courses.map((course) => {
            const modules = course.modules ?? [];
            const doneCount = modules.filter((m) => m.complete && m.published).length;
            // Every module is fully built and published; the only thing left is to publish the
            // course itself. That is when we offer the one-click move to the catalogue.
            const readyForCatalogue = modules.length > 0 && doneCount === modules.length && course.status !== 'published';
            return (
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
                      {modules.length > 0 && (
                        <> - {doneCount} of {modules.length} ready</>
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
                    {readyForCatalogue ? (
                      <Button
                        size="sm"
                        onClick={() => publishToCatalogue(course.id)}
                        disabled={publishingId === course.id}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Library className="mr-1.5 h-4 w-4" />
                        {publishingId === course.id ? 'Moving...' : 'Move to course catalogue'}
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => navigate(`/courses/${course.id}`)}>
                        Open to finish <ArrowRight className="ml-1.5 h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Course is fully built; a single flag left to flip. */}
                  {readyForCatalogue && (
                    <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                      <span>Every module is built and published. Move it to the course catalogue to make it available to learners.</span>
                    </div>
                  )}

                  {/* Course-wide blockers (no modules). Shown only when the course is not yet catalogue-ready. */}
                  {!readyForCatalogue && course.courseIssues.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {course.courseIssues.map((issue, i) => (
                        <li key={i}>
                          <Badge variant="secondary" className="font-normal text-amber-700 bg-amber-500/10">{issue}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Per-module: every component, green check when present, red warning when missing. */}
                  {modules.length > 0 ? (
                    <div className="space-y-3">
                      {modules.map((m) => {
                        const missingKeys = new Set(m.missing.map((x) => x.key));
                        const moduleReady = m.complete && m.published;
                        return (
                          <div key={m.moduleId} className="rounded-xl border border-border bg-muted/30 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-medium text-foreground truncate">{m.moduleTitle || 'Untitled module'}</span>
                              {moduleReady ? (
                                <Badge className="text-[10px] gap-1 border-transparent bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15">
                                  <CheckCircle2 className="h-3 w-3" /> Ready
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] capitalize">{m.status}</Badge>
                              )}
                            </div>
                            <ul className="flex flex-wrap gap-1.5">
                              {ALL_COMPONENTS.map((c) => {
                                const missing = missingKeys.has(c.key);
                                return (
                                  <li
                                    key={c.key}
                                    className={
                                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ' +
                                      (missing
                                        ? 'bg-rose-500/10 text-rose-700'
                                        : 'bg-emerald-500/10 text-emerald-700')
                                    }
                                  >
                                    {missing
                                      ? <AlertTriangle className="h-3 w-3" />
                                      : <CheckCircle2 className="h-3 w-3" />}
                                    {c.label}
                                  </li>
                                );
                              })}
                              {!m.published && (
                                <li className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700">
                                  <AlertTriangle className="h-3 w-3" /> Module not published yet
                                </li>
                              )}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    course.courseIssues.length === 0 && (
                      <p className="text-sm text-muted-foreground">All modules are complete; this course is not catalogue-ready yet.</p>
                    )
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
