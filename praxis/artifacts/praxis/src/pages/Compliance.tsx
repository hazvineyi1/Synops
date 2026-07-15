import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useGetMe } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldCheck, Plus, Trash2, BookOpen, Link2 } from 'lucide-react';

type Std = { id: string; code: string; title: string; framework: string; nqfLevel: number | null; credits: number | null };
type Course = { id: string; title: string };
type CourseModule = { id: string; title: string };
type Mapping = { id: string; unitStandardId: string; targetType: string; targetId: string };
type ReportStd = {
  unitStandardId: string;
  code: string;
  title: string;
  framework: string;
  nqfLevel: number | null;
  credits: number | null;
  mappedModules: { moduleId: string; title: string | null }[];
  enrolledLearners: number;
  learnersCompleted: number;
  evidenceRecords: number;
};
type Report = { courseId: string; courseTitle: string; enrolledLearners: number; unitStandards: ReportStd[] };

/**
 * Compliance & standards UI (decision doc §10.4). Hub roles (Super Admin, Instructional
 * Designer) define unit standards and map them to content; any org staff can view the
 * auditable per-course completion report.
 */
export function Compliance() {
  const { data: user } = useGetMe();
  const isHub = user?.role === 'super_admin' || user?.role === 'instructional_designer';
  const qc = useQueryClient();

  const { data: standards } = useQuery({ queryKey: ['unit-standards'], queryFn: () => apiFetch<Std[]>('/compliance/unit-standards') });
  const { data: courses } = useQuery({ queryKey: ['courses'], queryFn: () => apiFetch<Course[]>('/courses') });
  const [courseId, setCourseId] = useState('');

  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [framework, setFramework] = useState('qcto');
  const [nqf, setNqf] = useState('');
  const [credits, setCredits] = useState('');

  const createStd = useMutation({
    mutationFn: () =>
      apiFetch('/compliance/unit-standards', {
        method: 'POST',
        body: JSON.stringify({ code, title, framework, nqfLevel: nqf ? Number(nqf) : null, credits: credits ? Number(credits) : null }),
      }),
    onSuccess: () => {
      setCode('');
      setTitle('');
      setNqf('');
      setCredits('');
      qc.invalidateQueries({ queryKey: ['unit-standards'] });
    },
  });
  const delStd = useMutation({
    mutationFn: (id: string) => apiFetch(`/compliance/unit-standards/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-standards'] });
      qc.invalidateQueries({ queryKey: ['mappings'] });
    },
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-serif font-bold tracking-tight">Compliance &amp; standards</h1>
        <p className="text-muted-foreground">QCTO/SETA unit standards, content mapping, and auditable completion reports.</p>
      </div>

      {isHub && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Unit standards</CardTitle>
            <CardDescription>Define the accreditation standards, then map them to the content that delivers them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} className="sm:col-span-1" />
              <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="sm:col-span-2" />
              <select value={framework} onChange={(e) => setFramework(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="qcto">QCTO</option>
                <option value="seta">SETA</option>
                <option value="nqf">NQF</option>
                <option value="other">Other</option>
              </select>
              <Input placeholder="NQF" type="number" value={nqf} onChange={(e) => setNqf(e.target.value)} />
              <Input placeholder="Credits" type="number" value={credits} onChange={(e) => setCredits(e.target.value)} />
            </div>
            <Button onClick={() => createStd.mutate()} disabled={!code || !title || createStd.isPending}>
              <Plus className="h-4 w-4 mr-2" />Add standard
            </Button>

            <div className="space-y-2 pt-2">
              {(standards ?? []).length === 0 && <p className="text-sm text-muted-foreground">No unit standards defined yet.</p>}
              {(standards ?? []).map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                  <div>
                    <p className="font-medium">
                      <span className="uppercase text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded mr-2">{s.framework}</span>
                      {s.code} — {s.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.nqfLevel != null ? `NQF ${s.nqfLevel}` : 'NQF —'} · {s.credits != null ? `${s.credits} credits` : 'credits —'}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => delStd.mutate(s.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" />Course</CardTitle>
          <CardDescription>Select a course to map standards and view its compliance report.</CardDescription>
        </CardHeader>
        <CardContent>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Select a course…</option>
            {(courses ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </CardContent>
      </Card>

      {courseId && <CourseCompliance courseId={courseId} standards={standards ?? []} isHub={isHub} />}
    </div>
  );
}

function CourseCompliance({ courseId, standards, isHub }: { courseId: string; standards: Std[]; isHub: boolean }) {
  const qc = useQueryClient();
  const { data: modules } = useQuery({ queryKey: ['course-modules', courseId], queryFn: () => apiFetch<CourseModule[]>(`/courses/${courseId}/modules`) });
  const { data: report } = useQuery({ queryKey: ['compliance-report', courseId], queryFn: () => apiFetch<Report>(`/courses/${courseId}/compliance-report`) });
  const { data: allMappings } = useQuery({ queryKey: ['mappings'], queryFn: () => apiFetch<Mapping[]>('/compliance/mappings') });

  const [stdId, setStdId] = useState('');
  const [target, setTarget] = useState(''); // "course" or "module:<id>"

  const moduleIds = new Set((modules ?? []).map((m) => m.id));
  const courseMappings = (allMappings ?? []).filter((m) => (m.targetType === 'course' && m.targetId === courseId) || (m.targetType === 'module' && moduleIds.has(m.targetId)));

  const addMapping = useMutation({
    mutationFn: () => {
      const [type, id] = target === 'course' ? ['course', courseId] : ['module', target.replace('module:', '')];
      return apiFetch('/compliance/mappings', { method: 'POST', body: JSON.stringify({ unitStandardId: stdId, targetType: type, targetId: id }) });
    },
    onSuccess: () => {
      setStdId('');
      setTarget('');
      qc.invalidateQueries({ queryKey: ['mappings'] });
      qc.invalidateQueries({ queryKey: ['compliance-report', courseId] });
    },
  });
  const delMapping = useMutation({
    mutationFn: (id: string) => apiFetch(`/compliance/mappings/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mappings'] });
      qc.invalidateQueries({ queryKey: ['compliance-report', courseId] });
    },
  });

  const stdLabel = (id: string) => {
    const s = standards.find((x) => x.id === id);
    return s ? `${s.code} — ${s.title}` : id;
  };
  const moduleLabel = (id: string) => (modules ?? []).find((m) => m.id === id)?.title ?? id;

  return (
    <>
      {isHub && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" />Standard mapping</CardTitle>
            <CardDescription>Map a standard to the whole course or to a specific module.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <select value={stdId} onChange={(e) => setStdId(e.target.value)} className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select standard…</option>
                {standards.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.title}</option>)}
              </select>
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Map to…</option>
                <option value="course">Whole course</option>
                {(modules ?? []).map((m) => <option key={m.id} value={`module:${m.id}`}>Module: {m.title}</option>)}
              </select>
              <Button onClick={() => addMapping.mutate()} disabled={!stdId || !target || addMapping.isPending}>
                <Plus className="h-4 w-4 mr-2" />Map
              </Button>
            </div>
            <div className="space-y-2">
              {courseMappings.length === 0 && <p className="text-sm text-muted-foreground">No mappings for this course yet.</p>}
              {courseMappings.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg border text-sm">
                  <span>
                    {stdLabel(m.unitStandardId)}{' '}
                    <span className="text-muted-foreground">→ {m.targetType === 'course' ? 'Whole course' : `Module: ${moduleLabel(m.targetId)}`}</span>
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => delMapping.mutate(m.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Compliance report</CardTitle>
          <CardDescription>
            {report ? `${report.courseTitle} — ${report.enrolledLearners} enrolled learner${report.enrolledLearners === 1 ? '' : 's'}` : 'Auditable completion by unit standard.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!report || report.unitStandards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unit standards are mapped to this course yet.</p>
          ) : (
            <div className="space-y-3">
              {report.unitStandards.map((s) => {
                const pct = s.enrolledLearners > 0 ? Math.round((s.learnersCompleted / s.enrolledLearners) * 100) : 0;
                return (
                  <div key={s.unitStandardId} className="p-4 rounded-lg border">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">
                          <span className="uppercase text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded mr-2">{s.framework}</span>
                          {s.code} — {s.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Mapped to: {s.mappedModules.length > 0 ? s.mappedModules.map((m) => m.title ?? m.moduleId).join(', ') : 'course'} · {s.evidenceRecords} evidence record{s.evidenceRecords === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-serif font-bold">{s.learnersCompleted}/{s.enrolledLearners}</p>
                        <p className="text-xs text-muted-foreground">completed</p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
