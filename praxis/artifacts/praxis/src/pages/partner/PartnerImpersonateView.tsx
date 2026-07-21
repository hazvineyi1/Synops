import React, { useMemo } from 'react';
import { useLocation } from 'wouter';
import { useSession } from '@/context/SessionContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  Eye, StopCircle, Layers, BookOpen, GraduationCap, ClipboardList, TrendingUp, Clock,
  CheckCircle2, Users, MessageSquare, Building, ShieldCheck,
} from 'lucide-react';
import {
  getPartnerHub, findHubByOrgId, orgDetail, orgCourses, orgLearners, orgStaff, impersonatableUsers,
} from '@/lib/partnerHubData';
import { useOrgClasses, learnerSignals } from '@/lib/orgClassStore';
import { useImpersonation, stopImpersonation, getActiveImpersonation } from '@/lib/impersonationStore';

export function PartnerImpersonateView({ params }: { params?: { orgId?: string; userId?: string } }) {
  const { user } = useSession();
  const [, navigate] = useLocation();
  const orgId = params?.orgId ?? '';
  const userId = params?.userId ?? '';
  const h = findHubByOrgId(orgId) ?? getPartnerHub(user?.partnerId);
  const d = orgDetail(h, orgId);

  useImpersonation(); // subscribe so Exit re-renders
  const targetMeta = useMemo(() => impersonatableUsers(h).find((t) => t.id === userId), [h, userId]);
  const active = getActiveImpersonation();

  const learners = useMemo(() => orgLearners(h, orgId), [h, orgId]);
  const classes = useOrgClasses(orgId);
  const courses = useMemo(() => orgCourses(h, orgId), [h, orgId]);
  const staff = useMemo(() => orgStaff(h, orgId), [h, orgId]);

  const learner = learners.find((l) => l.id === userId);
  const role = targetMeta?.role ?? (learner ? 'Learner' : 'Account');
  const name = targetMeta?.name ?? learner?.name ?? active?.name ?? 'User';

  const exit = () => { stopImpersonation(); navigate('/partner/audit'); };

  const banner = (
    <Card className="p-3 border-amber-300 bg-amber-50/80 dark:bg-amber-950/30 flex items-center justify-between gap-3 sticky top-0 z-10">
      <div className="flex items-center gap-2.5 text-sm">
        <Eye className="h-5 w-5 text-amber-600 shrink-0" />
        <span>You are viewing the platform as <strong>{name}</strong> ({role}){d.org ? ` - ${d.org.name}` : ''}. This is what they see.</span>
      </div>
      <Button size="sm" variant="outline" className="gap-1.5 shrink-0 border-amber-400" onClick={exit}><StopCircle className="h-4 w-4" /> Exit impersonation</Button>
    </Card>
  );

  if (!targetMeta && !learner) {
    return (
      <div className="space-y-4">
        {banner}
        <Card className="p-6 text-center text-muted-foreground">This account could not be found in {d.org?.name ?? 'this organisation'}.</Card>
      </div>
    );
  }

  // ── LEARNER VIEW ──
  if (learner) {
    const myClasses = classes.filter((c) => c.learnerIds.includes(learner.id));
    const sig = learnerSignals(learner.id, learner.progress);
    const staffName = (id: string) => staff.find((s) => s.id === id)?.name ?? 'Assigned coach';
    const myCourseIds = Array.from(new Set(myClasses.flatMap((c) => c.courseIds)));
    const myCourses = myCourseIds.length ? courses.filter((c) => myCourseIds.includes(c.id)) : courses.filter((c) => c.title === learner.course);

    return (
      <div className="space-y-5">
        {banner}

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hi {learner.name.split(' ')[0]},</h1>
          <p className="text-sm text-muted-foreground">Here is your learning at {d.org?.name}.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4"><div className="text-2xl font-bold">{sig.grade}%</div><div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Current grade</div></Card>
          <Card className="p-4"><div className="text-2xl font-bold">{learner.progress}%</div><div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><ClipboardList className="h-3 w-3" /> Course progress</div></Card>
          <Card className="p-4"><div className="text-2xl font-bold">{sig.attendance}%</div><div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Attendance</div></Card>
          <Card className="p-4"><div className="text-2xl font-bold">{sig.lastActiveDays === 0 ? 'Today' : `${sig.lastActiveDays}d`}</div><div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Clock className="h-3 w-3" /> Last active</div></Card>
        </div>

        {/* My classes */}
        <div>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> My {myClasses.length === 1 ? 'class' : 'classes'}</h2>
          {myClasses.length === 0 ? (
            <Card className="p-5 text-sm text-muted-foreground">You are not in a class yet. Your coach or admin will add you to one.</Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {myClasses.map((c) => {
                const coach = c.staff.find((s) => s.role === 'coach') ?? c.staff.find((s) => s.role === 'facilitator');
                const clsCourses = courses.filter((x) => c.courseIds.includes(x.id));
                return (
                  <Card key={c.id} className="p-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> {c.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{c.learnerIds.length} learners</Badge>
                    </div>
                    <div className="mt-2 space-y-1.5 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground"><GraduationCap className="h-3.5 w-3.5" /> Coach: {coach ? staffName(coach.staffId) : 'To be assigned'}</div>
                      <div className="flex items-start gap-2 text-muted-foreground"><BookOpen className="h-3.5 w-3.5 mt-0.5" /> {clsCourses.length ? clsCourses.map((x) => x.title).join(', ') : 'No courses assigned yet'}</div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* My courses */}
        <div>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /> My courses</h2>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Course</th><th className="text-left p-3">Modality</th><th className="text-left p-3">My progress</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {myCourses.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3 font-medium">{c.title}</td>
                    <td className="p-3 text-muted-foreground">{c.modality}</td>
                    <td className="p-3"><div className="flex items-center gap-2"><Progress value={learner.progress} className="h-1.5 w-32" /><span className="text-xs tabular-nums text-muted-foreground">{learner.progress}%</span></div></td>
                  </tr>
                ))}
                {myCourses.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No courses yet.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" /> My coach</h3>
            {(() => {
              const firstCoach = myClasses.flatMap((c) => c.staff).find((s) => s.role === 'coach') ?? myClasses.flatMap((c) => c.staff).find((s) => s.role === 'facilitator');
              return <div className="text-sm">{firstCoach ? staffName(firstCoach.staffId) : 'No coach assigned yet.'}</div>;
            })()}
            <Button size="sm" variant="outline" disabled title="Messaging is available to the learner in their own session" className="mt-3 gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Message my coach</Button>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Preview only — the learner messages their coach from their own account.</p>
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Status</h3>
            <div className="text-sm"><Badge variant="outline" className={cn('capitalize', learner.status === 'at-risk' && 'border-amber-300 text-amber-600')}>{learner.status.replace('-', ' ')}</Badge></div>
            <p className="mt-2 text-xs text-muted-foreground">{learner.status === 'at-risk' ? 'You are a bit behind - your coach has been notified and can help you catch up.' : 'You are on track. Keep it up!'}</p>
          </Card>
        </div>
      </div>
    );
  }

  // ── STAFF (coach / org admin / delegated) VIEW ──
  const staffClasses = classes.filter((c) => c.staff.some((s) => s.staffId === userId));
  return (
    <div className="space-y-5">
      {banner}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
        <p className="text-sm text-muted-foreground">{role} at {d.org?.name}. This is the view for this account.</p>
      </div>

      {role === 'Coach' ? (
        <div>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Classes I coach</h2>
          {staffClasses.length === 0 ? (
            <Card className="p-5 text-sm text-muted-foreground">Not assigned to any class yet.</Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {staffClasses.map((c) => (
                <Card key={c.id} className="p-5">
                  <div className="font-semibold flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> {c.name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{c.learnerIds.length} learners</div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <Card className="p-5 flex items-start gap-3">
          {role === 'Delegated admin' ? <ShieldCheck className="h-5 w-5 text-primary shrink-0" /> : <Building className="h-5 w-5 text-primary shrink-0" />}
          <div className="text-sm text-muted-foreground">
            {name} manages <span className="font-medium text-foreground">{d.org?.name}</span> as a {role}. Open the organisation hub to see what they manage.
            <div className="mt-3"><Button size="sm" variant="outline" onClick={() => navigate(`/partner/org/${orgId}`)}>Open {d.org?.name}</Button></div>
          </div>
        </Card>
      )}
    </div>
  );
}
