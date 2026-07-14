import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityPlayer, type ActivityPlayerHandleResult } from "@/components/ActivityPlayer";
import { activitiesApi } from "@/lib/activitiesApi";

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

  const submit = useMutation({
    mutationFn: (r: ActivityPlayerHandleResult) => activitiesApi.submit(id, r.payload, r.score),
    onSuccess: (s) => { setDone(true); setScore(s.score); },
  });

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-border bg-white/90 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => history.length > 1 ? history.back() : setLocation("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <span className="font-medium truncate">{activity?.title ?? "Activity"}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
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
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
            <h2 className="text-xl font-semibold mb-1">Handed in</h2>
            <p className="text-muted-foreground">
              Your work has been submitted{score != null ? <> with a score of <strong>{score}</strong></> : null}. Your coach can now review it.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="outline" onClick={() => { setDone(false); }}>Try again</Button>
              <Button onClick={() => setLocation("/dashboard")}>Back to dashboard</Button>
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

            <ActivityPlayer html={activity.html} onSubmit={(r) => submit.mutate(r)} />

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
