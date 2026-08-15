import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';
import { useGetMe } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, BookOpen, ArrowRight, CheckCircle2, FileWarning, Trash2, Library, Search, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  { key: 'caseStudy', label: 'A case study' },
  { key: 'assignment', label: 'An assignment' },
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
  const [query, setQuery] = React.useState('');
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [publishingModuleId, setPublishingModuleId] = React.useState<string | null>(null);
  const isHub = user?.role === 'super_admin' || user?.role === 'instructional_designer';

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

  /** Publish a single module. Modules can go live one at a time as they are finished, rather than
   * waiting for the whole course. Offered once a module has all nine components built. */
  const publishModule = async (moduleId: string) => {
    setPublishingModuleId(moduleId);
    try {
      await apiFetch(`/modules/${moduleId}/publish`, { method: 'POST' });
      await qc.invalidateQueries({ queryKey: ['courses'] });
    } catch {
      window.alert('Could not publish this module. Please try again.');
    } finally {
      setPublishingModuleId(null);
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

      {courses && courses.length > 0 && (() => {
        // Decorate each course with readiness so we can sort and summarise.
        const decorated = courses.map((course) => {
          const modules = course.modules ?? [];
          const doneCount = modules.filter((m) => m.complete && m.published).length;
          const total = modules.length;
          // Every module is fully built and published; the only thing left is to publish the
          // course itself. That is when we offer the one-click move to the catalogue.
          const readyForCatalogue = total > 0 && doneCount === total && course.status !== 'published';
          const ratio = total > 0 ? doneCount / total : 0;
          return { course, modules, doneCount, total, readyForCatalogue, ratio };
        });

        const q = query.trim().toLowerCase();
        const visible = decorated
          .filter(({ course }) => !q || course.title.toLowerCase().includes(q))
          // Catalogue-ready first, then closest-to-done, then alphabetical: least work surfaces on top.
          .sort((a, b) => {
            if (a.readyForCatalogue !== b.readyForCatalogue) return a.readyForCatalogue ? -1 : 1;
            if (b.ratio !== a.ratio) return b.ratio - a.ratio;
            return a.course.title.localeCompare(b.course.title);
          });

        const readyCount = decorated.filter((d) => d.readyForCatalogue).length;
        const allIds = visible.map((d) => d.course.id);
        const allOpen = allIds.length > 0 && allIds.every((id) => expanded.has(id));

        return (
          <div className="space-y-4">
            {/* Toolbar: search + counts + expand-all. Keeps the list scannable without scrolling. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search courses..."
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>
                  {decorated.length} {decorated.length === 1 ? 'course' : 'courses'}
                  {readyCount > 0 && <span className="text-emerald-700"> - {readyCount} ready to publish</span>}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setExpanded(allOpen ? new Set() : new Set(allIds))}
                >
                  {allOpen ? 'Collapse all' : 'Expand all'}
                </Button>
              </div>
            </div>

            {visible.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No courses match "{query}".
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              {visible.map(({ course, modules, doneCount, total, readyForCatalogue, ratio }) => {
                const isOpen = expanded.has(course.id);
                return (
                  <Card key={course.id} className="overflow-hidden">
                    {/* Compact, always-visible summary row. Click anywhere on the left to expand. */}
                    <div className="flex items-center gap-3 p-4">
                      <button
                        type="button"
                        onClick={() => toggle(course.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        aria-expanded={isOpen}
                      >
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                            isOpen ? '' : '-rotate-90',
                          )}
                        />
                        <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-foreground">{course.title}</span>
                            {readyForCatalogue ? (
                              <Badge className="shrink-0 gap-1 border-transparent bg-emerald-500/15 text-[10px] text-emerald-700 hover:bg-emerald-500/15">
                                <CheckCircle2 className="h-3 w-3" /> Ready
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="shrink-0 text-[10px] capitalize">{course.status}</Badge>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {total > 0
                              ? <>{doneCount} of {total} {total === 1 ? 'module' : 'modules'} ready</>
                              : <>{course.moduleCount} {course.moduleCount === 1 ? 'module' : 'modules'}</>}
                          </div>
                        </div>
                        {/* Readiness bar - a quick visual of how close the course is. */}
                        {total > 0 && (
                          <div className="hidden w-24 shrink-0 sm:block">
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn('h-full rounded-full', readyForCatalogue ? 'bg-emerald-500' : 'bg-amber-500')}
                                style={{ width: `${Math.round(ratio * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove(course.id, course.title)}
                          disabled={deletingId === course.id}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">{deletingId === course.id ? 'Deleting...' : 'Delete'}</span>
                        </Button>
                        {readyForCatalogue ? (
                          <Button
                            size="sm"
                            onClick={() => publishToCatalogue(course.id)}
                            disabled={publishingId === course.id}
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            <Library className="mr-1.5 h-4 w-4" />
                            {publishingId === course.id ? 'Moving...' : 'Move to catalogue'}
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => navigate(`/courses/${course.id}`)}>
                            Open <ArrowRight className="ml-1.5 h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Details only when expanded - this is what removes the endless scroll. */}
                    {isOpen && (
                      <CardContent className="space-y-4 border-t border-border pt-4">
                        {readyForCatalogue && (
                          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            <span>Every module is built and published. Move it to the course catalogue to make it available to learners.</span>
                          </div>
                        )}

                        {!readyForCatalogue && course.courseIssues.length > 0 && (
                          <ul className="flex flex-wrap gap-2">
                            {course.courseIssues.map((issue, i) => (
                              <li key={i}>
                                <Badge variant="secondary" className="bg-amber-500/10 font-normal text-amber-700">{issue}</Badge>
                              </li>
                            ))}
                          </ul>
                        )}

                        {modules.length > 0 ? (
                          <div className="space-y-3">
                            {modules.map((m) => {
                              const missingKeys = new Set(m.missing.map((x) => x.key));
                              const built = ALL_COMPONENTS.length - m.missing.length;
                              const totalComp = ALL_COMPONENTS.length;
                              const moduleReady = m.complete && m.published;
                              // All nine built but not yet flipped to published -> ready to publish on its own.
                              const readyToPublish = m.complete && !m.published;
                              const pct = Math.round((built / totalComp) * 100);
                              return (
                                <div key={m.moduleId} className="rounded-xl border border-border bg-muted/30 p-3">
                                  <div className="mb-2 flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span className="truncate text-sm font-medium text-foreground">{m.moduleTitle || 'Untitled module'}</span>
                                      {moduleReady ? (
                                        <Badge className="gap-1 border-transparent bg-emerald-500/15 text-[10px] text-emerald-700 hover:bg-emerald-500/15">
                                          <CheckCircle2 className="h-3 w-3" /> Published
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px] capitalize">{m.status}</Badge>
                                      )}
                                    </div>
                                    {/* Publish this one module on its own, as soon as it is fully built. */}
                                    {readyToPublish && (
                                      <Button
                                        size="sm"
                                        onClick={() => publishModule(m.moduleId)}
                                        disabled={publishingModuleId === m.moduleId}
                                        className="h-7 shrink-0 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
                                      >
                                        <Library className="mr-1 h-3.5 w-3.5" />
                                        {publishingModuleId === m.moduleId ? 'Publishing...' : 'Publish module'}
                                      </Button>
                                    )}
                                  </div>

                                  {/* How far to completion: built count + bar. */}
                                  <div className="mb-2 flex items-center gap-2">
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                      <div
                                        className={cn('h-full rounded-full', m.complete ? 'bg-emerald-500' : 'bg-amber-500')}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="shrink-0 text-xs font-medium text-muted-foreground">{built}/{totalComp} built</span>
                                  </div>

                                  {/* What is still missing, called out first so it is easy to see. */}
                                  {m.missing.length > 0 ? (
                                    <div>
                                      <p className="mb-1 text-xs font-medium text-rose-700">Still needed ({m.missing.length}):</p>
                                      <ul className="flex flex-wrap gap-1.5">
                                        {m.missing.map((c) => (
                                          <li
                                            key={c.key}
                                            className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-700"
                                          >
                                            <AlertTriangle className="h-3 w-3" />
                                            {c.label}
                                          </li>
                                        ))}
                                        {!m.published && !readyToPublish && (
                                          <li className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700">
                                            <AlertTriangle className="h-3 w-3" /> Not published yet
                                          </li>
                                        )}
                                      </ul>
                                    </div>
                                  ) : (
                                    <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      {m.published ? 'All components built and published.' : 'All components built. Ready to publish.'}
                                    </p>
                                  )}
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
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
