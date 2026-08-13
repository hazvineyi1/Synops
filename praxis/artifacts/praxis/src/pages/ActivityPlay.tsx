import React, { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityPlayer, type ActivityPlayerHandleResult } from "@/components/ActivityPlayer";
import { InteractiveVideoPlayer, type IVQuestion } from "@/components/InteractiveVideoPlayer";
import { activitiesApi } from "@/lib/activitiesApi";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
import { personaByEmail } from "@/lib/k12Personas";

/** Full-screen learner view for completing and handing in an interactive activity. */
export function ActivityPlay({ params }: { params: { activityId: string } }) {
  const id = params.activityId;
  const [, setLocation] = useLocation();
  const [done, setDone] = useState(false);
  const [score, setScore] = useState<number | null>(null);

  const { data: activity, isLoading, error } = useQuery({
    queryKey: ["activity", id],
    queryFn: () => activitiesApi.get(id),
  });

  // Coach-assisted math activities have their own interactive surface, not the sandboxed player.
  useEffect(() => {
    if ((activity as { kind?: string } | undefined)?.kind === "math-coach") setLocation(`/math-coach/${id}`);
  }, [activity, id, setLocation]);

  const submit = useMutation({
    mutationFn: (r: ActivityPlayerHandleResult) => activitiesApi.submit(id, r.payload, r.score),
    onSuccess: (s) => { setDone(true); setScore(s.score); },
  });

  // The rubric this activity is graded against, if one is attached.
  const rubricId = (activity as { rubricId?: string | null } | undefined)?.rubricId ?? null;
  const { data: rubric } = useQuery({
    queryKey: ["rubric", rubricId],
    queryFn: () => apiFetch<{ title: string; criteria: { name: string; descriptor: string; points: number }[]; totalPoints: number }>(`/rubrics/${rubricId}`),
    enabled: !!rubricId,
  });

  // Young K-12 learners should move FORWARD after practice (next lesson / done), not land back on
  // the same module. Everyone else returns to the lesson they came from.
  const { user } = useSession();
  const persona = personaByEmail(user?.email);
  const young = !!persona && (persona.band === "early" || persona.band === "elementary");
  const a = activity as { courseId?: string | null; moduleId?: string | null } | undefined;
  const courseId = a?.courseId ?? undefined;
  const { data: courseModules } = useQuery({
    queryKey: ["modules", courseId],
    queryFn: () => apiFetch<{ id: string; order: number }[]>(`/courses/${courseId}/modules`),
    enabled: young && !!courseId,
  });
  const orderedMods = (courseModules ?? []).slice().sort((x, y) => x.order - y.order);
  const curIdx = orderedMods.findIndex((mm) => mm.id === a?.moduleId);
  const nextMod = curIdx >= 0 ? orderedMods[curIdx + 1] : undefined;
  const sameModule = a?.courseId && a?.moduleId ? `/courses/${a.courseId}/modules/${a.moduleId}` : "/dashboard";
  // A young learner who just finished the LAST lesson of the course is DONE, send them to their
  // lessons home with a clear finish, not back to the course start (which looks like the beginning).
  const courseComplete = young && orderedMods.length > 0 && curIdx >= 0 && !nextMod;
  const backTo = young
    ? (nextMod ? `/courses/${a?.courseId}/modules/${nextMod.id}` : "/dashboard")
    : sameModule;

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-border bg-white/90 backdrop-blur">
        <div className={`${young ? 'max-w-5xl' : 'max-w-3xl'} mx-auto px-4 py-3 flex items-center gap-3`}>
          <Button variant="ghost" size="sm" onClick={() => history.length > 1 ? history.back() : setLocation("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <span className="font-medium truncate">{activity?.title ?? "Activity"}</span>
          <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={() => setLocation(backTo)}>
            Next <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </header>

      <main className={`${young ? 'max-w-5xl' : 'max-w-3xl'} mx-auto px-4 py-6`}>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-20 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading activity…
          </div>
        ) : error || !activity ? (
          <div className="rounded-xl border border-red-800 bg-red-950/10 p-6 text-red-700">
            This activity could not be loaded. It may be unpublished or removed.
          </div>
        ) : done ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center">
            <div className={young ? 'text-6xl mb-2' : ''}>{young ? (courseComplete ? '🏆' : '🎉') : <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />}</div>
            <h2 className="text-2xl font-bold mb-1">{young ? (courseComplete ? 'You finished it all!' : 'Great job!') : 'Handed in'}</h2>
            <p className="text-muted-foreground">
              {young
                ? (courseComplete ? 'You finished the whole class. Amazing work! 🌟' : 'Nice work! Tap the button for your next lesson.')
                : <>Your work has been submitted{score != null ? <> with a score of <strong>{score}</strong></> : null}. Your coach can now review it.</>}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              {!young && <Button variant="outline" onClick={() => { setDone(false); }}>Try again</Button>}
              <Button onClick={() => setLocation(backTo)} className={young ? 'animate-bounce text-lg font-bold rounded-full px-8 py-6' : ''}>
                {young ? (courseComplete ? 'Back to my lessons 🏠' : 'Next lesson') : 'Continue'} <ArrowRight className={young ? 'h-6 w-6 ml-1' : 'h-4 w-4 ml-1'} />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-serif font-bold tracking-tight">{activity.title}</h1>
              {activity.instructions && (
                <p className="text-muted-foreground mt-1">{activity.instructions}</p>
              )}
            </div>

            {(activity as { imageUrl?: string | null }).imageUrl && (
              <img src={(activity as { imageUrl?: string | null }).imageUrl!} alt="" className="w-full max-h-64 object-cover rounded-2xl border border-border" />
            )}

            {(activity as { kind?: string }).kind === "video" ? (() => {
              let vid = ""; let qs: IVQuestion[] = [];
              try { const p = JSON.parse(activity.html || "{}"); vid = p.videoUrl || activity.embedUrl || ""; qs = Array.isArray(p.questions) ? p.questions : []; }
              catch { vid = activity.embedUrl || activity.html || ""; }
              return <InteractiveVideoPlayer videoUrl={vid} questions={qs} onComplete={() => submit.mutate({ payload: { watched: true }, score: 100 })} />;
            })() : (
              <ActivityPlayer html={activity.html} embedUrl={activity.embedUrl} onSubmit={(r) => submit.mutate(r)} />
            )}

            {rubric && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <h2 className="font-serif font-bold text-base flex items-center gap-2 mb-2"><span className="h-4 w-1 rounded-full bg-primary" /> How this is graded — {rubric.title} <span className="text-xs font-normal text-muted-foreground">· {rubric.totalPoints} pts</span></h2>
                <div className="divide-y divide-border/60">
                  {rubric.criteria.map((c, i) => (
                    <div key={i} className="flex items-start gap-3 py-2 text-sm">
                      <div className="min-w-0 flex-1"><p className="font-medium">{c.name}</p>{c.descriptor && <p className="text-xs text-muted-foreground">{c.descriptor}</p>}</div>
                      <span className="text-muted-foreground shrink-0">{c.points} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {submit.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
              </div>
            )}
            {submit.isError && (
              <div className="text-sm text-red-600">
                Could not submit: {submit.error instanceof Error ? submit.error.message : "unknown error"}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              The activity runs in a secure sandbox. It hands in your result when you complete it.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
