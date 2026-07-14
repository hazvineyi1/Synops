import React, { useState } from 'react';
import { useParams, useSearch, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API } from '@/lib/api';
import { useGetMe } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { 
  BookOpen, ClipboardList, MessageSquare, Megaphone, BarChart2, 
  Calendar, FileText, Users, UsersRound, Plus, ChevronRight, Pin,
  CheckCircle, Clock, AlertCircle, Play
} from 'lucide-react';
import { InteractiveVideoPlayer } from '@/components/InteractiveVideoPlayer';

// --- Types ---
interface Course { id: string; title: string; description: string; status: string; competencyTags: string[]; nqfLevel?: number; }
interface Module { id: string; courseId: string; title: string; description?: string; order: number; status: string; lessonType?: string; estimatedMinutes: number; beatCount: number; beats?: Beat[]; }
interface Beat { id: string; type: string; title: string; order: number; videoUrl?: string; narration?: string | null; bulletPoints?: string[] | null; scenario?: string | null; }
interface Assignment { id: string; title: string; description?: string; dueDate?: string; pointsPossible: number; published: boolean; }
interface Discussion { id: string; title: string; body: string; isPinned?: boolean; replyCount: number; createdAt: string; author?: { firstName: string; lastName: string; }; }
interface Announcement { id: string; title: string; body: string; pinned?: boolean; createdAt: string; author?: { firstName: string; lastName: string; }; }
interface GradeEntry { assignmentId: string; assignmentTitle: string; dueDate?: string; pointsPossible: number; score: number | null; letterGrade?: string; missing: boolean; late: boolean; }
interface RosterEntry { enrolmentId: string; user: { id: string; firstName: string; lastName: string; email: string; }; enrolmentStatus: string; }
interface Group { id: string; name: string; description?: string; members: { userId: string; role: string; user: { firstName: string; lastName: string; }; }[]; }
interface Page { id: string; title: string; slug: string; body: string; published: boolean; updatedAt: string; frontPage?: boolean; author?: { firstName: string; lastName: string; }; }
interface Event { id: string; title: string; type: string; startDate: string; color?: string; linkedAssignmentId?: string; }
interface Enrolment { id: string; status: string; }
interface ModuleProgress { moduleId: string; title: string; order: number; viewedBeats: number; totalBeats: number; percent: number; complete: boolean; }
interface CourseProgress { courseId: string; viewedBeats: number; totalBeats: number; percent: number; modules: ModuleProgress[]; }

const TABS = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'modules', label: 'Modules', icon: BookOpen },
  { id: 'assignments', label: 'Assignments', icon: ClipboardList },
  { id: 'discussions', label: 'Discussions', icon: MessageSquare },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'gradebook', label: 'Gradebook', icon: BarChart2 },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'pages', label: 'Pages', icon: FileText },
  { id: 'people', label: 'People', icon: Users },
  { id: 'groups', label: 'Groups', icon: UsersRound },
];

function parseMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\| (.+) \|$/gm, (m) => {
      const cells = m.split('|').filter(Boolean).map(c => c.trim());
      return '<tr>' + cells.map(c => `<td class="border border-border px-3 py-1.5 text-sm">${c}</td>`).join('') + '</tr>';
    })
    .replace(/\n/g, '<br/>');
}

function formatDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOverdue(dueDate?: string) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

const LESSON_TYPE_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  socratic: { icon: MessageSquare, label: 'Socratic',   color: 'text-violet-600' },
  video:    { icon: Play,          label: 'Video',      color: 'text-blue-600'   },
  slides:   { icon: BookOpen,      label: 'Slides',     color: 'text-emerald-600'},
  quiz:     { icon: ClipboardList, label: 'Quiz',       color: 'text-amber-600'  },
};

function ModuleRow({ mod }: { mod: Module }) {
  const [, navigate] = useLocation();
  const isEmpty = mod.beatCount === 0;

  return (
    <Card
      className={cn(
        'transition-shadow',
        !isEmpty && 'hover:shadow-md cursor-pointer',
        isEmpty && 'opacity-60',
      )}
      onClick={() => !isEmpty && navigate(`/courses/${mod.courseId}/modules/${mod.id}`)}
    >
      <CardHeader>
        <div className="flex items-center gap-4">
          {/* Order badge */}
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0 shrink-0">
            {String(mod.order).padStart(2, '0')}
          </div>
          {/* Title & meta */}
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{mod.title}</CardTitle>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {mod.estimatedMinutes}min
              </span>
              <span>·</span>
              <span>{mod.beatCount} {mod.beatCount === 1 ? 'page' : 'pages'}</span>
              {isEmpty && <span className="text-amber-600">· No content yet</span>}
            </div>
          </div>
          {/* Status + arrow */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={mod.status === 'published' ? 'default' : 'secondary'} className="text-xs">
              {mod.status}
            </Badge>
            {!isEmpty && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

export function CourseDetail() {
  const { courseId } = useParams<{ courseId: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(search);
  const activeTab = searchParams.get('tab') || 'overview';
  const [ivBeat, setIvBeat] = useState<Beat | null>(null);
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const qc = useQueryClient();

  const { data: user } = useGetMe();
  const role = user?.role ?? 'learner';
  const isInstructor = ['coach', 'org_admin', 'partner_admin', 'super_admin'].includes(role);

  const setTab = (tab: string) => navigate(`/courses/${courseId}?tab=${tab}`);

  const { data: course, isLoading: courseLoading } = useQuery({ queryKey: ['course', courseId], queryFn: () => apiFetch<Course>(`/courses/${courseId}`) });
  // Real completion, computed from beats the learner has actually viewed.
  const { data: progress } = useQuery({
    queryKey: ['course-progress', courseId],
    queryFn: () => apiFetch<CourseProgress>(`/progress/course/${courseId}`),
    enabled: !!courseId,
  });
  const { data: modules } = useQuery({ queryKey: ['modules', courseId], queryFn: () => apiFetch<Module[]>(`/courses/${courseId}/modules`), enabled: activeTab === 'modules' || activeTab === 'overview' });
  const { data: assignments } = useQuery({ queryKey: ['assignments', courseId], queryFn: () => apiFetch<Assignment[]>(`/courses/${courseId}/assignments`), enabled: activeTab === 'assignments' });
  const { data: discussions } = useQuery({ queryKey: ['discussions', courseId], queryFn: () => apiFetch<Discussion[]>(`/courses/${courseId}/discussions`), enabled: activeTab === 'discussions' });
  const { data: announcements } = useQuery({ queryKey: ['announcements', courseId], queryFn: () => apiFetch<Announcement[]>(`/courses/${courseId}/announcements`), enabled: activeTab === 'announcements' || activeTab === 'overview' });
  const { data: myGrades } = useQuery({ queryKey: ['grades', courseId, 'me'], queryFn: () => apiFetch<{ grades: GradeEntry[]; totalEarned: number; totalPossible: number; overallPercent: number; }>(`/courses/${courseId}/gradebook/me`), enabled: activeTab === 'gradebook' && !isInstructor });
  const { data: events } = useQuery({ queryKey: ['events', courseId], queryFn: () => apiFetch<Event[]>(`/courses/${courseId}/events`), enabled: activeTab === 'calendar' });
  const { data: pages } = useQuery({ queryKey: ['pages', courseId], queryFn: () => apiFetch<Page[]>(`/courses/${courseId}/pages`), enabled: activeTab === 'pages' });
  const { data: roster } = useQuery({ queryKey: ['roster', courseId], queryFn: () => apiFetch<RosterEntry[]>(`/courses/${courseId}/roster`), enabled: activeTab === 'people' });
  const { data: groups } = useQuery({ queryKey: ['groups', courseId], queryFn: () => apiFetch<Group[]>(`/courses/${courseId}/groups`), enabled: activeTab === 'groups' });
  const { data: enrolment } = useQuery({ queryKey: ['enrolment', courseId, 'me'], queryFn: () => apiFetch<Enrolment | null>(`/courses/${courseId}/my-enrolment`) });

  const enrolMutation = useMutation({
    mutationFn: () => apiFetch(`/courses/${courseId}/enrol`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['enrolment', courseId] }),
  });

  const joinGroupMutation = useMutation({
    mutationFn: (groupId: string) => apiFetch(`/groups/${groupId}/join`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups', courseId] }),
  });

  if (courseLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
  if (!course) return <div className="text-muted-foreground">Course not found.</div>;

  return (
    <div className="space-y-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <a href="/courses" className="hover:text-foreground transition-colors">Courses</a>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium truncate max-w-xs">{course.title}</span>
      </div>

      {/* Course header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{course.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">{course.description}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {course.nqfLevel && <Badge variant="outline">NQF Level {course.nqfLevel}</Badge>}
            {course.competencyTags?.map((t: string) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
          </div>
        </div>
        {role === 'learner' && !enrolment && (
          <Button onClick={() => enrolMutation.mutate()} disabled={enrolMutation.isPending}>
            {enrolMutation.isPending ? 'Enrolling...' : 'Enrol Now'}
          </Button>
        )}
        {enrolment && <Badge variant="outline" className="text-green-600 border-green-600">Enrolled</Badge>}
      </div>

      {/* Real completion, from beats actually viewed. Only shown to enrolled learners:
          an unenrolled visitor browsing the catalog has no progress to speak of. */}
      {enrolment && progress && progress.totalBeats > 0 && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">
              {progress.percent >= 100 ? 'Course complete' : 'Your progress'}
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {progress.viewedBeats} of {progress.totalBeats} steps · {progress.percent}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                progress.percent >= 100 ? 'bg-green-600' : 'bg-primary',
              )}
              style={{ width: `${progress.percent}%` }}
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Course completion"
            />
          </div>
          {progress.modules?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {progress.modules.map((m) => (
                <span
                  key={m.moduleId}
                  title={`${m.title}: ${m.viewedBeats}/${m.totalBeats}`}
                  className={cn(
                    'text-[11px] px-2 py-0.5 rounded-full border',
                    m.complete
                      ? 'border-green-600/40 bg-green-600/10 text-green-700'
                      : m.percent > 0
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground',
                  )}
                >
                  {m.complete ? '✓ ' : ''}{m.title}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="border-b border-border mb-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <Card>
                <CardHeader><CardTitle>About this course</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">{course.description}</p>
                </CardContent>
              </Card>
              {/* Front page content */}
              {pages?.find(p => p.frontPage) && (
                <Card>
                  <CardHeader><CardTitle>{pages.find(p => p.frontPage)!.title}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: parseMarkdown(pages.find(p => p.frontPage)!.body) }} />
                  </CardContent>
                </Card>
              )}
              {/* Pinned announcement */}
              {announcements?.find(a => a.pinned) && (
                <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-amber-600" />
                      <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Pinned Announcement</span>
                    </div>
                    <CardTitle className="text-base">{announcements.find(a => a.pinned)!.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{announcements.find(a => a.pinned)!.body.slice(0, 200)}{announcements.find(a => a.pinned)!.body.length > 200 ? '...' : ''}</p>
                  </CardContent>
                </Card>
              )}
            </div>
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Upcoming</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {assignments?.filter(a => a.dueDate && !isOverdue(a.dueDate)).slice(0, 3).map(a => (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="truncate text-foreground">{a.title}</span>
                      <span className="text-muted-foreground text-xs flex-shrink-0">{formatDate(a.dueDate)}</span>
                    </div>
                  ))}
                  {!assignments?.some(a => a.dueDate && !isOverdue(a.dueDate)) && <p className="text-xs text-muted-foreground">No upcoming deadlines</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Quick links</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {['assignments', 'discussions', 'gradebook'].map(t => (
                    <button key={t} onClick={() => setTab(t)} className="w-full text-left text-sm text-primary hover:underline capitalize flex items-center gap-1">
                      <ChevronRight className="h-3 w-3" /> {t}
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* MODULES */}
        {activeTab === 'modules' && (
          <div className="space-y-4">
            {!modules && <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>}
            {modules?.length === 0 && <div className="text-center text-muted-foreground py-12">No modules yet.</div>}
            {modules?.map((mod) => (
              <ModuleRow key={mod.id} mod={mod} />
            ))}
          </div>
        )}

        {/* ASSIGNMENTS */}
        {activeTab === 'assignments' && (
          <div className="space-y-3">
            {!assignments && <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>}
            {assignments?.length === 0 && <div className="text-center text-muted-foreground py-12">No assignments yet.</div>}
            {assignments?.map((a) => (
              <Card key={a.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/courses/${courseId}/assignments/${a.id}`)}>
                <CardContent className="py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">{a.title}</div>
                    {a.description && <div className="text-sm text-muted-foreground truncate">{a.description}</div>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm text-muted-foreground">{a.pointsPossible} pts</span>
                    {a.dueDate && (
                      <Badge variant={isOverdue(a.dueDate) ? 'destructive' : 'outline'} className="text-xs">
                        {isOverdue(a.dueDate) ? 'OVERDUE' : formatDate(a.dueDate)}
                      </Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* DISCUSSIONS */}
        {activeTab === 'discussions' && (
          <div className="space-y-3">
            {isInstructor && (
              <div className="flex justify-end mb-4">
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" /> New Discussion
                </Button>
              </div>
            )}
            {!discussions && <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>}
            {discussions?.length === 0 && <div className="text-center text-muted-foreground py-12">No discussions yet.</div>}
            {discussions?.map((d) => (
              <Card key={d.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/courses/${courseId}/discussions/${d.id}`)}>
                <CardContent className="py-4 flex items-center gap-4">
                  {d.isPinned && <Pin className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">{d.title}</div>
                    <div className="text-sm text-muted-foreground truncate mt-0.5">{d.body.slice(0, 100)}</div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      {d.author && <span>{d.author.firstName} {d.author.lastName}</span>}
                      <span>•</span>
                      <span>{d.replyCount} replies</span>
                      <span>•</span>
                      <span>{formatDate(d.createdAt)}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ANNOUNCEMENTS */}
        {activeTab === 'announcements' && (
          <div className="space-y-3">
            {isInstructor && (
              <div className="flex justify-end mb-4">
                <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> New Announcement</Button>
              </div>
            )}
            {!announcements && <Skeleton className="h-32" />}
            {announcements?.length === 0 && <div className="text-center text-muted-foreground py-12">No announcements yet.</div>}
            {announcements?.map((a) => (
              <Card key={a.id} className={cn(a.pinned && "border-amber-200")}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    {a.pinned && <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">📌 Pinned</Badge>}
                    <CardTitle className="text-base">{a.title}</CardTitle>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.author && <>{a.author.firstName} {a.author.lastName} · </>}{formatDate(a.createdAt)}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">{a.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* GRADEBOOK */}
        {activeTab === 'gradebook' && (
          <div className="space-y-4">
            {!isInstructor && myGrades && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">My Grades</h2>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-foreground">{myGrades.overallPercent?.toFixed(1) ?? '—'}%</div>
                    <div className="text-xs text-muted-foreground">Overall ({myGrades.totalEarned} / {myGrades.totalPossible} pts)</div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Assignment</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Score</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Grade</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myGrades.grades.map((g) => (
                        <tr key={g.assignmentId} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-2.5 px-3">
                            <div>{g.assignmentTitle}</div>
                            {g.dueDate && <div className="text-xs text-muted-foreground">{formatDate(g.dueDate)}</div>}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {g.score !== null ? `${g.score} / ${g.pointsPossible}` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {g.letterGrade ? <Badge variant="outline">{g.letterGrade}</Badge> : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {g.missing && <Badge variant="destructive" className="text-xs">Missing</Badge>}
                            {g.late && !g.missing && <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">Late</Badge>}
                            {g.score !== null && !g.missing && !g.late && <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />}
                            {!g.missing && g.score === null && !g.late && <span className="text-xs text-muted-foreground">Pending</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {isInstructor && (
              <div className="text-center py-12 space-y-3">
                <BarChart2 className="h-10 w-10 text-muted-foreground mx-auto" />
                <div className="text-muted-foreground">Full gradebook with all learner scores</div>
                <Button onClick={() => navigate(`/courses/${courseId}/gradebook`)}>View Full Gradebook</Button>
              </div>
            )}
          </div>
        )}

        {/* CALENDAR */}
        {activeTab === 'calendar' && (
          <div className="space-y-4">
            {!events && <Skeleton className="h-64" />}
            {events?.length === 0 && <div className="text-center text-muted-foreground py-12">No events scheduled.</div>}
            {events && events.length > 0 && (
              <div className="space-y-2">
                {events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()).map((e) => (
                  <div key={e.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30">
                    <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: e.color ?? '#6366f1' }} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">{e.title}</div>
                      <div className="text-xs text-muted-foreground">{e.type.replace('_', ' ')}</div>
                    </div>
                    <div className="text-sm text-muted-foreground">{formatDate(e.startDate)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PAGES */}
        {activeTab === 'pages' && (
          <div className="space-y-4">
            {isInstructor && (
              <div className="flex justify-end mb-4">
                <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> New Page</Button>
              </div>
            )}
            {selectedPage ? (
              <div>
                <Button variant="ghost" size="sm" className="mb-4" onClick={() => setSelectedPage(null)}>← Back to Pages</Button>
                <Card>
                  <CardHeader><CardTitle>{selectedPage.title}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: parseMarkdown(selectedPage.body) }} />
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="space-y-2">
                {!pages && <Skeleton className="h-32" />}
                {pages?.length === 0 && <div className="text-center text-muted-foreground py-12">No pages yet.</div>}
                {pages?.map((p) => (
                  <Card key={p.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedPage(p)}>
                    <CardContent className="py-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-foreground">{p.title}</div>
                        {p.author && <div className="text-xs text-muted-foreground mt-0.5">{p.author.firstName} {p.author.lastName} · {formatDate(p.updatedAt)}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        {p.frontPage && <Badge variant="outline" className="text-xs">Front Page</Badge>}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PEOPLE */}
        {activeTab === 'people' && (
          <div className="space-y-4">
            {!roster && <Skeleton className="h-48" />}
            {roster && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-muted-foreground">{roster.length} enrolled</div>
                  {isInstructor && <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Add Learner</Button>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Name</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Email</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((r) => (
                        <tr key={r.enrolmentId} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-2.5 px-3 font-medium">{r.user?.firstName} {r.user?.lastName}</td>
                          <td className="py-2.5 px-3 text-muted-foreground">{r.user?.email}</td>
                          <td className="py-2.5 px-3">
                            <Badge variant={r.enrolmentStatus === 'completed' ? 'default' : r.enrolmentStatus === 'active' ? 'secondary' : 'outline'} className="text-xs">
                              {r.enrolmentStatus}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* GROUPS */}
        {activeTab === 'groups' && (
          <div className="space-y-4">
            {isInstructor && (
              <div className="flex justify-end mb-4">
                <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> New Group</Button>
              </div>
            )}
            {!groups && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1,2].map(i => <Skeleton key={i} className="h-32" />)}</div>}
            {groups?.length === 0 && <div className="text-center text-muted-foreground py-12">No groups yet.</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groups?.map((g) => {
                const isMember = g.members.some(m => m.userId === user?.id);
                return (
                  <Card key={g.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{g.name}</CardTitle>
                      {g.description && <p className="text-xs text-muted-foreground">{g.description}</p>}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1 mb-3">
                        {g.members.map((m) => (
                          <div key={m.userId} className="flex items-center gap-2 text-sm">
                            <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                              {m.user?.firstName?.[0]}
                            </div>
                            <span>{m.user?.firstName} {m.user?.lastName}</span>
                            {m.role === 'leader' && <Badge variant="outline" className="text-xs">Leader</Badge>}
                          </div>
                        ))}
                      </div>
                      {role === 'learner' && !isMember && (
                        <Button size="sm" variant="outline" onClick={() => joinGroupMutation.mutate(g.id)} disabled={joinGroupMutation.isPending}>Join</Button>
                      )}
                      {isMember && <Badge variant="secondary" className="text-xs">You're in this group</Badge>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Interactive Video Modal */}
      {ivBeat && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-background rounded-xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold">{ivBeat.title}</h3>
              <Button variant="ghost" size="sm" onClick={() => setIvBeat(null)}>✕ Close</Button>
            </div>
            <div className="p-4">
              <InteractiveVideoPlayer
                beatId={ivBeat.id}
                videoUrl={ivBeat.videoUrl!}
                onComplete={() => setIvBeat(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
