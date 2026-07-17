import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { UserCog, Plus, X, AlertTriangle, Users, Trash2, LifeBuoy, GraduationCap } from 'lucide-react';

interface CourseLite { id: string; title: string; status?: string }
interface Learner { userId: string; name: string; email: string; status: 'off_track' | 'at_risk' | null; sectionId: string | null; sectionName: string | null }
interface Coach { userId: string; name: string; email: string; sectionsLed: number }
interface SectionMember { userId: string; name: string; email: string; status: string | null }
interface Section { id: string; name: string; leaderUserId: string | null; leaderName: string | null; members: SectionMember[] }
interface Matching {
  course: { id: string; title: string };
  sections: Section[];
  learners: Learner[];
  coaches: Coach[];
  summary: { totalLearners: number; assigned: number; unassigned: number; flaggedTotal: number; flaggedUnassigned: number };
}

const flagStyle: Record<string, string> = {
  off_track: 'bg-red-50 text-red-700 border-red-200',
  at_risk: 'bg-amber-50 text-amber-700 border-amber-200',
};
const flagLabel: Record<string, string> = { off_track: 'Off track', at_risk: 'At risk' };

export function CoachingMatching() {
  const { data: courses } = useQuery<CourseLite[]>({ queryKey: ['courses-lite'], queryFn: () => apiFetch<CourseLite[]>('/courses') });
  const [courseId, setCourseId] = React.useState<string>('');
  React.useEffect(() => { if (!courseId && courses && courses.length) setCourseId(courses[0].id); }, [courses, courseId]);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-serif font-bold tracking-tight flex items-center gap-3"><UserCog className="h-8 w-8 text-primary" /> Coaching &amp; sections</h1>
        <p className="text-muted-foreground">Assign learners to a coach so at-risk learners reach the right person. A coach only sees learners in the sections they lead.</p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground">Course</label>
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm min-w-[280px] focus:outline-none focus:ring-1 focus:ring-primary">
          {(!courses || courses.length === 0) && <option value="">No courses</option>}
          {courses?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      {courseId ? <MatchingBoard courseId={courseId} /> : <p className="text-muted-foreground">Create a course first.</p>}
    </div>
  );
}

function MatchingBoard({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<Matching>({ queryKey: ['matching', courseId], queryFn: () => apiFetch<Matching>(`/courses/${courseId}/matching`) });
  const [newSection, setNewSection] = React.useState('');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['matching', courseId] });

  const createSection = useMutation({
    mutationFn: () => apiFetch(`/courses/${courseId}/groups`, { method: 'POST', body: JSON.stringify({ name: newSection.trim() }) }),
    onSuccess: () => { setNewSection(''); invalidate(); toast({ title: 'Section created' }); },
  });
  const assignMember = useMutation({
    mutationFn: (v: { sectionId: string; userId: string }) => apiFetch(`/groups/${v.sectionId}/members`, { method: 'POST', body: JSON.stringify({ userId: v.userId, role: 'member' }) }),
    onSuccess: invalidate,
  });
  const setLeader = useMutation({
    mutationFn: (v: { sectionId: string; userId: string }) => apiFetch(`/groups/${v.sectionId}/members`, { method: 'POST', body: JSON.stringify({ userId: v.userId, role: 'leader' }) }),
    onSuccess: () => { invalidate(); toast({ title: 'Coach assigned' }); },
  });
  const removeMember = useMutation({
    mutationFn: (v: { sectionId: string; userId: string }) => apiFetch(`/groups/${v.sectionId}/members/${v.userId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
  const deleteSection = useMutation({
    mutationFn: (sectionId: string) => apiFetch(`/groups/${sectionId}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); toast({ title: 'Section deleted' }); },
  });

  if (isLoading || !data) return <div className="h-64 bg-muted rounded-xl animate-pulse" />;

  const unassigned = data.learners.filter((l) => !l.sectionId);
  const s = data.summary;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Learners" value={s.totalLearners} icon={<Users className="h-4 w-4" />} />
        <Stat label="Assigned to a coach" value={`${s.assigned}/${s.totalLearners}`} icon={<UserCog className="h-4 w-4" />} />
        <Stat label="Flagged" value={s.flaggedTotal} icon={<AlertTriangle className="h-4 w-4" />} tone={s.flaggedTotal ? 'amber' : undefined} />
        <Stat label="Flagged & unassigned" value={s.flaggedUnassigned} icon={<LifeBuoy className="h-4 w-4" />} tone={s.flaggedUnassigned ? 'red' : undefined} />
      </div>

      {data.coaches.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>No coaches in this tenant yet. Add coaches under <span className="font-medium">Members</span>, then assign them to a section here.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unassigned learners */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold flex items-center gap-2"><GraduationCap className="h-5 w-5" /> Unassigned learners <Badge variant="outline">{unassigned.length}</Badge></h2>
          <Card>
            <CardContent className="p-3 space-y-2 max-h-[520px] overflow-y-auto">
              {unassigned.length === 0 && <p className="text-sm text-muted-foreground p-3">Everyone is assigned to a coach. 🎉</p>}
              {unassigned.map((l) => (
                <div key={l.userId} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{l.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{l.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {l.status && <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${flagStyle[l.status]}`}>{flagLabel[l.status]}</span>}
                    <select
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) assignMember.mutate({ sectionId: e.target.value, userId: l.userId }); }}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="" disabled>Assign to…</option>
                      {data.sections.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}{sec.leaderName ? ` · ${sec.leaderName}` : ''}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Sections */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold flex items-center gap-2"><UserCog className="h-5 w-5" /> Sections <Badge variant="outline">{data.sections.length}</Badge></h2>

          <div className="flex gap-2">
            <input value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="New section name (e.g. Cohort A)" className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <Button disabled={!newSection.trim() || createSection.isPending} onClick={() => createSection.mutate()}><Plus className="h-4 w-4 mr-1" /> Add section</Button>
          </div>

          {data.sections.length === 0 && <p className="text-sm text-muted-foreground">No sections yet — create one, assign a coach, then add learners.</p>}

          {data.sections.map((sec) => (
            <Card key={sec.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{sec.name}</p>
                    <p className="text-xs text-muted-foreground">{sec.members.length} learner{sec.members.length === 1 ? '' : 's'}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => { if (confirm(`Delete section "${sec.name}"?`)) deleteSection.mutate(sec.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Coach */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground w-14">Coach</span>
                  <select
                    value={sec.leaderUserId ?? ''}
                    onChange={(e) => { if (e.target.value) setLeader.mutate({ sectionId: sec.id, userId: e.target.value }); }}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="" disabled>Choose a coach…</option>
                    {data.coaches.map((c) => <option key={c.userId} value={c.userId}>{c.name}</option>)}
                  </select>
                </div>

                {/* Members */}
                <div className="space-y-1.5">
                  {sec.members.map((m) => (
                    <div key={m.userId} className="flex items-center justify-between gap-2 text-sm bg-muted/40 rounded-md px-2 py-1.5">
                      <span className="truncate">{m.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {m.status && <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${flagStyle[m.status]}`}>{flagLabel[m.status]}</span>}
                        <button className="text-muted-foreground hover:text-destructive" onClick={() => removeMember.mutate({ sectionId: sec.id, userId: m.userId })}><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                  {sec.members.length === 0 && <p className="text-xs text-muted-foreground italic">No learners yet — assign from the left.</p>}
                </div>

                {/* Quick add learner */}
                {unassigned.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) assignMember.mutate({ sectionId: sec.id, userId: e.target.value }); }}
                    className="w-full rounded-md border border-dashed border-border bg-background px-2 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">+ Add a learner to this section…</option>
                    {unassigned.map((l) => <option key={l.userId} value={l.userId}>{l.name}{l.status ? ` (${flagLabel[l.status]})` : ''}</option>)}
                  </select>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: React.ReactNode; icon: React.ReactNode; tone?: 'amber' | 'red' }) {
  const toneCls = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-foreground';
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{icon}{label}</div>
        <p className={`text-2xl font-bold ${toneCls}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
