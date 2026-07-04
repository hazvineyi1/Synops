import { useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import {
  useListTimeEntries,
  getListTimeEntriesQueryKey,
  useCreateTimeEntry,
  useStopTimeEntry,
  useUpdateTimeEntry,
  useDeleteTimeEntry,
  type TimeEntry,
} from "@workspace/compass-api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Play, Square, Plus, Pencil, Trash2, Timer, Clock, Users } from "lucide-react";
import { ProjectWorkspace } from "@/components/engine/ProjectWorkspace";
import { useAuth, authErrorMessage } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const pad = (n: number) => n.toString().padStart(2, "0");

/** "0:05:09" for the live stopwatch readout. */
function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** "2h 5m" (rounded to whole minutes) for logged durations and totals. */
function formatDuration(totalSeconds: number): string {
  const mins = Math.round(Math.max(0, totalSeconds) / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

function formatDay(iso: string, source: string): string {
  // Manual entries are stored anchored at noon UTC so the UTC calendar date
  // equals the date the user picked; render them in UTC so the chosen day is
  // shown exactly everywhere. Timer entries are real instants, shown locally.
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(source === "manual" ? { timeZone: "UTC" } : {}),
  });
}

/** yyyy-mm-dd for a date input value, in local time or UTC. */
function toDateInput(iso: string, utc = false): string {
  const d = new Date(iso);
  return utc
    ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const todayInput = () => toDateInput(new Date().toISOString());

const entrySchema = z
  .object({
    date: z.string().min(1, "Select a date"),
    hours: z.number({ invalid_type_error: "Enter a number" }).int().min(0).max(24),
    minutes: z.number({ invalid_type_error: "Enter a number" }).int().min(0).max(59),
    note: z.string().max(500, "Keep the note under 500 characters").optional(),
  })
  .refine((v) => v.hours * 60 + v.minutes >= 1, {
    message: "Log at least one minute",
    path: ["minutes"],
  });

type EntryValues = z.infer<typeof entrySchema>;

export default function ProjectTime() {
  const params = useParams();
  const projectId = parseInt(params.id || "0", 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const myUserId = user?.id;
  const listKey = getListTimeEntriesQueryKey(projectId);

  const { data } = useListTimeEntries(projectId, {
    query: { enabled: !!projectId, queryKey: listKey },
  });
  const entries = useMemo(
    () => (data ?? []).filter((e) => e.projectId === projectId),
    [data, projectId],
  );

  const createEntry = useCreateTimeEntry();
  const stopEntry = useStopTimeEntry();
  const updateEntry = useUpdateTimeEntry();
  const deleteEntry = useDeleteTimeEntry();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: listKey });
  const fail = (err: unknown, fallback: string) =>
    toast({ title: authErrorMessage(err) || fallback, variant: "destructive" });

  // The server allows one running timer per person per project, so there is at
  // most one running entry that belongs to the current user.
  const runningEntry = useMemo(
    () => entries.find((e) => !e.endedAt && e.userId === myUserId) ?? null,
    [entries, myUserId],
  );

  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    if (!runningEntry) return;
    setNowTs(Date.now());
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [runningEntry]);
  const runningSeconds = runningEntry
    ? Math.floor((nowTs - new Date(runningEntry.startedAt).getTime()) / 1000)
    : 0;

  const [timerNote, setTimerNote] = useState("");

  function startTimer() {
    createEntry.mutate(
      { projectId, data: { kind: "timer", description: timerNote.trim() || undefined } },
      {
        onSuccess: () => {
          invalidate();
          setTimerNote("");
          toast({ title: "Timer started" });
        },
        onError: (err) => fail(err, "Could not start the timer"),
      },
    );
  }

  function stopTimer() {
    if (!runningEntry) return;
    stopEntry.mutate(
      { id: runningEntry.id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Timer stopped" });
        },
        onError: (err) => fail(err, "Could not stop the timer"),
      },
    );
  }

  const manualForm = useForm<EntryValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: { date: todayInput(), hours: 0, minutes: 0, note: "" },
  });

  function submitManual(values: EntryValues) {
    createEntry.mutate(
      {
        projectId,
        data: {
          kind: "manual",
          minutes: values.hours * 60 + values.minutes,
          spentOn: values.date,
          description: values.note?.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          manualForm.reset({ date: todayInput(), hours: 0, minutes: 0, note: "" });
          toast({ title: "Time logged" });
        },
        onError: (err) => fail(err, "Could not log time"),
      },
    );
  }

  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const editForm = useForm<EntryValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: { date: todayInput(), hours: 0, minutes: 0, note: "" },
  });

  useEffect(() => {
    if (!editing) return;
    const mins = Math.round((editing.durationSeconds ?? 0) / 60);
    editForm.reset({
      date: toDateInput(editing.startedAt, editing.source === "manual"),
      hours: Math.floor(mins / 60),
      minutes: mins % 60,
      note: editing.description ?? "",
    });
  }, [editing, editForm]);

  function submitEdit(values: EntryValues) {
    if (!editing) return;
    updateEntry.mutate(
      {
        id: editing.id,
        data: {
          minutes: values.hours * 60 + values.minutes,
          spentOn: values.date,
          description: values.note?.trim() ? values.note.trim() : null,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setEditing(null);
          toast({ title: "Entry updated" });
        },
        onError: (err) => fail(err, "Could not update the entry"),
      },
    );
  }

  const [deleting, setDeleting] = useState<TimeEntry | null>(null);
  function confirmDelete() {
    if (!deleting) return;
    deleteEntry.mutate(
      { id: deleting.id },
      {
        onSuccess: () => {
          invalidate();
          setDeleting(null);
          toast({ title: "Entry deleted" });
        },
        onError: (err) => fail(err, "Could not delete the entry"),
      },
    );
  }

  const totalSeconds = entries.reduce((sum, e) => sum + (e.durationSeconds ?? 0), 0);
  const loggedCount = entries.filter((e) => e.endedAt).length;
  const perPerson = useMemo(() => {
    const map = new Map<number, { name: string; seconds: number; running: boolean }>();
    for (const e of entries) {
      const cur = map.get(e.userId) ?? {
        name: e.userName ?? `User ${e.userId}`,
        seconds: 0,
        running: false,
      };
      cur.seconds += e.durationSeconds ?? 0;
      if (!e.endedAt) cur.running = true;
      map.set(e.userId, cur);
    }
    return [...map.values()].sort((a, b) => b.seconds - a.seconds);
  }, [entries]);

  return (
    <ProjectWorkspace subtitle="Track time spent on this project.">
      {() => (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Live stopwatch */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Timer className="h-5 w-5 text-primary" aria-hidden="true" /> Live timer
                </CardTitle>
                <CardDescription>
                  Start a stopwatch while you work; it keeps running on the server until you stop it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {runningEntry ? (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/40 p-5">
                    <div>
                      <div className="text-3xl font-semibold tabular-nums" aria-live="off">
                        {formatClock(runningSeconds)}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Running since {new Date(runningEntry.startedAt).toLocaleTimeString()}
                        {runningEntry.description ? ` - ${runningEntry.description}` : ""}
                      </p>
                    </div>
                    <Button onClick={stopTimer} disabled={stopEntry.isPending} variant="destructive">
                      <Square className="mr-2 h-4 w-4" aria-hidden="true" />
                      {stopEntry.isPending ? "Stopping..." : "Stop timer"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="timer-note">What are you working on? (optional)</Label>
                      <Input
                        id="timer-note"
                        value={timerNote}
                        maxLength={500}
                        onChange={(e) => setTimerNote(e.target.value)}
                        placeholder="Storyboard review, standards mapping..."
                      />
                    </div>
                    <Button onClick={startTimer} disabled={createEntry.isPending}>
                      <Play className="mr-2 h-4 w-4" aria-hidden="true" />
                      {createEntry.isPending ? "Starting..." : "Start timer"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Totals */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" aria-hidden="true" /> Total logged
                </CardTitle>
                <CardDescription>{loggedCount} completed entries.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tabular-nums">{formatDuration(totalSeconds)}</div>
                {perPerson.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Users className="h-3.5 w-3.5" aria-hidden="true" /> By person
                    </div>
                    <ul className="space-y-1.5">
                      {perPerson.map((p) => (
                        <li key={p.name} className="flex items-center justify-between text-sm">
                          <span className="truncate">
                            {p.name}
                            {p.running && (
                              <Badge variant="secondary" className="ml-2 align-middle">
                                Running
                              </Badge>
                            )}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {formatDuration(p.seconds)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Manual entry */}
          <Card>
            <CardHeader>
              <CardTitle>Log time manually</CardTitle>
              <CardDescription>Add time you have already worked, with the date and a short note.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={manualForm.handleSubmit(submitManual)}
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="manual-date">Date</Label>
                  <Input id="manual-date" type="date" max={todayInput()} {...manualForm.register("date")} />
                  {manualForm.formState.errors.date && (
                    <p className="text-sm text-destructive">{manualForm.formState.errors.date.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="manual-hours">Hours</Label>
                  <Input
                    id="manual-hours"
                    type="number"
                    min={0}
                    max={24}
                    {...manualForm.register("hours", { valueAsNumber: true })}
                  />
                  {manualForm.formState.errors.hours && (
                    <p className="text-sm text-destructive">{manualForm.formState.errors.hours.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="manual-minutes">Minutes</Label>
                  <Input
                    id="manual-minutes"
                    type="number"
                    min={0}
                    max={59}
                    {...manualForm.register("minutes", { valueAsNumber: true })}
                  />
                  {manualForm.formState.errors.minutes && (
                    <p className="text-sm text-destructive">{manualForm.formState.errors.minutes.message}</p>
                  )}
                </div>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="manual-note">Note (optional)</Label>
                  <Input id="manual-note" maxLength={500} {...manualForm.register("note")} />
                </div>
                <div className="sm:col-span-2 lg:col-span-5">
                  <Button type="submit" disabled={createEntry.isPending}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Log time
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Entries list */}
          <Card>
            <CardHeader>
              <CardTitle>Time entries</CardTitle>
              <CardDescription>Newest first. Edit or remove any entry you can access.</CardDescription>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 text-center text-muted-foreground">
                  <Clock className="mb-4 h-12 w-12 text-muted" aria-hidden="true" />
                  <p>No time logged yet. Start the timer or add an entry above.</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {entries.map((entry) => {
                    const isRunning = !entry.endedAt;
                    return (
                      <li
                        key={entry.id}
                        className="flex flex-wrap items-start justify-between gap-3 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium tabular-nums">
                              {isRunning ? "Running" : formatDuration(entry.durationSeconds ?? 0)}
                            </span>
                            <Badge variant="outline">
                              {entry.source === "timer" ? "Timer" : "Manual"}
                            </Badge>
                            <span className="text-sm text-muted-foreground">{formatDay(entry.startedAt, entry.source)}</span>
                            <span className="text-sm text-muted-foreground">
                              {entry.userName ?? `User ${entry.userId}`}
                            </span>
                          </div>
                          {entry.description && (
                            <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {!isRunning && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditing(entry)}
                              aria-label="Edit entry"
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleting(entry)}
                            aria-label="Delete entry"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Edit dialog */}
          <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit time entry</DialogTitle>
                <DialogDescription>Adjust the duration, date, or note.</DialogDescription>
              </DialogHeader>
              <form onSubmit={editForm.handleSubmit(submitEdit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-date">Date</Label>
                  <Input id="edit-date" type="date" max={todayInput()} {...editForm.register("date")} />
                  {editForm.formState.errors.date && (
                    <p className="text-sm text-destructive">{editForm.formState.errors.date.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-hours">Hours</Label>
                    <Input
                      id="edit-hours"
                      type="number"
                      min={0}
                      max={24}
                      {...editForm.register("hours", { valueAsNumber: true })}
                    />
                    {editForm.formState.errors.hours && (
                      <p className="text-sm text-destructive">{editForm.formState.errors.hours.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-minutes">Minutes</Label>
                    <Input
                      id="edit-minutes"
                      type="number"
                      min={0}
                      max={59}
                      {...editForm.register("minutes", { valueAsNumber: true })}
                    />
                    {editForm.formState.errors.minutes && (
                      <p className="text-sm text-destructive">{editForm.formState.errors.minutes.message}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-note">Note (optional)</Label>
                  <Textarea id="edit-note" rows={3} maxLength={500} {...editForm.register("note")} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateEntry.isPending}>
                    {updateEntry.isPending ? "Saving..." : "Save changes"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Delete confirm */}
          <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this time entry?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the entry. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete} disabled={deleteEntry.isPending}>
                  {deleteEntry.isPending ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </ProjectWorkspace>
  );
}
