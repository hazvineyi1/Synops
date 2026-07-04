import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  useListMeetingRecordings,
  getListMeetingRecordingsQueryKey,
  useCreateMeetingRecording,
  useDeleteMeetingRecording,
  useRequestUploadUrl,
  useTranscribeMeetingRecording,
} from "@workspace/compass-api-client";
import { useQueryClient } from "@tanstack/react-query";
import {
  Mic,
  Link2,
  Square,
  UploadCloud,
  Loader2,
  CheckCircle2,
  Trash2,
  Clock,
  Sparkles,
  FileText,
  ChevronDown,
  ListPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";

export function formatDuration(sec?: number | null) {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function statusCode(err: unknown): number | undefined {
  return typeof err === "object" && err !== null && "status" in err
    ? (err as { status?: number }).status
    : undefined;
}

/** Minimal meeting shape this recorder belongs to and inserts notes into. */
export type RecordingInsertMeeting = { id: number; title: string; notes: string };

/** State snapshot the parent receives when in split-controls mode. */
export type RecorderControlsHandle = { start: () => void; stop: () => void };
export type RecorderStateSnapshot = {
  isRecording: boolean;
  recElapsed: number;
  hasPending: boolean;
};

type Props = {
  projectId: number;
  /** The meeting this recorder belongs to. Recordings are scoped to it. */
  meeting: RecordingInsertMeeting;
  /**
   * Persist drafted notes into this meeting. The parent owns the meeting
   * mutation and cache invalidation; this card only composes the text.
   */
  onInsertNotes?: (meetingId: number, notes: string) => Promise<void>;
  /**
   * When provided, the inline Record / Stop controls are hidden from this card.
   * The callback fires once (after mount) with stable start/stop functions so
   * the parent can render the controls wherever it likes.
   */
  onControlsReady?: (controls: RecorderControlsHandle) => void;
  /**
   * Called whenever recording state changes (isRecording, recElapsed,
   * hasPending). Use together with onControlsReady to drive externally-placed
   * controls. Fires on mount with initial state so the parent starts in sync.
   */
  onStateChange?: (state: RecorderStateSnapshot) => void;
};

/**
 * Self-contained meeting recordings card, scoped to a single meeting: capture
 * audio in the browser, then list, play, and remove recordings for THIS meeting.
 * Uploaded recordings can be transcribed and turned into a clean draft of meeting
 * notes, which the user can insert into the meeting's notes (feeding the agenda
 * generator). All recording state and the MediaRecorder lifecycle live here so
 * the surrounding page stays simple. Recordings carry the meeting id on the
 * server; the list is filtered to it.
 *
 * Split mode: provide onControlsReady + onStateChange to move the Record / Stop
 * controls out of this card so the parent can bracket its content with them.
 */
export function MeetingRecordings({ projectId, meeting, onInsertNotes, onControlsReady, onStateChange }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: recordings } = useListMeetingRecordings(projectId, {
    query: { enabled: !!projectId, queryKey: getListMeetingRecordingsQueryKey(projectId) },
  });
  const requestUploadUrl = useRequestUploadUrl();
  const createRecording = useCreateMeetingRecording();
  const deleteRecording = useDeleteMeetingRecording();
  const transcribeRecording = useTranscribeMeetingRecording();

  const [isRecording, setIsRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [pendingRec, setPendingRec] = useState<{ blob: Blob; url: string; durationSec: number } | null>(null);
  const [captureTitle, setCaptureTitle] = useState("");

  // Transcription / drafting UI state. Only one recording's notes panel is open
  // at a time, so a single set of insert controls is sufficient.
  const [transcribingId, setTranscribingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [insertMode, setInsertMode] = useState<"append" | "replace">("append");
  const [insertingId, setInsertingId] = useState<number | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef<number>(0);
  const recStreamRef = useRef<MediaStream | null>(null);

  // Refs holding the current implementations so stable callbacks (below) always
  // call the freshest version without needing to be recreated.
  const startImpl = useRef<() => Promise<void>>(async () => {});
  const stopImpl = useRef<() => void>(() => {});

  // Only this meeting's recordings. Legacy project-level rows (no meetingId) are
  // not shown here; recordings created through this card always carry the id.
  const recordingList = (recordings ?? []).filter((r) => r.meetingId === meeting.id);

  // Recording elapsed-time ticker
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording) {
      interval = setInterval(() => setRecElapsed((s) => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Revoke the local preview object URL when it is replaced or on unmount
  useEffect(() => {
    return () => {
      if (pendingRec) URL.revokeObjectURL(pendingRec.url);
    };
  }, [pendingRec]);

  // Release the microphone if the component unmounts mid-recording. Runs once on
  // unmount; refs (not state) hold the live recorder/stream so this stays current.
  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        // Recorder may already be inactive; ignore.
      }
      mediaRecorderRef.current = null;
      recStreamRef.current?.getTracks().forEach((t) => t.stop());
      recStreamRef.current = null;
    };
  }, []);

  const stopRecordingTracks = () => {
    recStreamRef.current?.getTracks().forEach((t) => t.stop());
    recStreamRef.current = null;
  };

  const startRecording = async () => {
    if (isRecording) return;
    if (pendingRec) {
      URL.revokeObjectURL(pendingRec.url);
      setPendingRec(null);
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({ title: "Recording not supported", description: "This browser cannot capture audio.", variant: "destructive" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStreamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const durationSec = Math.max(1, Math.round((Date.now() - recStartRef.current) / 1000));
        setPendingRec({ blob, url: URL.createObjectURL(blob), durationSec });
        stopRecordingTracks();
      };
      mediaRecorderRef.current = recorder;
      recStartRef.current = Date.now();
      setRecElapsed(0);
      recorder.start();
      setIsRecording(true);
    } catch {
      stopRecordingTracks();
      mediaRecorderRef.current = null;
      toast({ title: "Microphone blocked", description: "Allow microphone access to record.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  // Keep refs current every render so stable callbacks always delegate to fresh impls.
  startImpl.current = startRecording;
  stopImpl.current = stopRecording;

  // Stable callbacks the parent receives via onControlsReady. These never change
  // identity so the parent can call them from event handlers without stale-closure risk.
  const stableStart = useCallback(() => { startImpl.current(); }, []);
  const stableStop = useCallback(() => { stopImpl.current(); }, []);

  const splitMode = !!onControlsReady;

  // Fire onControlsReady once after mount with stable handles.
  useLayoutEffect(() => {
    if (!onControlsReady) return;
    onControlsReady({ start: stableStart, stop: stableStop });
    // stableStart / stableStop are stable; this intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify parent of state changes (and on initial mount so it starts in sync).
  useEffect(() => {
    onStateChange?.({ isRecording, recElapsed, hasPending: !!pendingRec });
  }, [isRecording, recElapsed, pendingRec, onStateChange]);

  const discardPending = () => {
    if (pendingRec) URL.revokeObjectURL(pendingRec.url);
    setPendingRec(null);
    setCaptureTitle("");
  };

  const saveRecording = async () => {
    if (!pendingRec) return;
    const contentType = pendingRec.blob.type || "audio/webm";
    const ext = contentType.includes("mp4") ? "mp4" : contentType.includes("ogg") ? "ogg" : "webm";
    try {
      const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
        data: { contentType, size: pendingRec.blob.size, name: `meeting-recording.${ext}` },
      });
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: pendingRec.blob,
      });
      if (!putRes.ok) throw new Error(`upload failed (${putRes.status})`);
      await createRecording.mutateAsync({
        projectId,
        data: {
          meetingId: meeting.id,
          kind: "upload",
          title: captureTitle.trim() || "Meeting recording",
          objectPath,
          contentType,
          sizeBytes: pendingRec.blob.size,
          durationSec: pendingRec.durationSec,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListMeetingRecordingsQueryKey(projectId) });
      discardPending();
      toast({ title: "Recording saved" });
    } catch {
      toast({ title: "Couldn't save recording", description: "Please try again.", variant: "destructive" });
    }
  };

  const removeRecording = async (id: number) => {
    try {
      await deleteRecording.mutateAsync({ id });
      if (expandedId === id) setExpandedId(null);
      queryClient.invalidateQueries({ queryKey: getListMeetingRecordingsQueryKey(projectId) });
    } catch {
      toast({ title: "Couldn't remove recording", description: "Please try again.", variant: "destructive" });
    }
  };

  // Open a recording's notes panel. The insert target is always this meeting.
  const openPanel = (id: number) => {
    setExpandedId(id);
    setInsertMode("append");
  };

  const transcribe = async (id: number) => {
    setTranscribingId(id);
    try {
      await transcribeRecording.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListMeetingRecordingsQueryKey(projectId) });
      openPanel(id);
      toast({ title: "Notes drafted", description: "Review the draft, then insert it into a meeting." });
    } catch (err) {
      const code = statusCode(err);
      if (code === 503) {
        setAiUnavailable(true);
        toast({
          title: "AI is not configured",
          description: "Transcription needs the AI integration. Everything else still works.",
          variant: "destructive",
        });
      } else if (code === 413) {
        toast({
          title: "Recording too large",
          description: "Audio must be under 25 MB and 20 minutes to transcribe.",
          variant: "destructive",
        });
      } else if (code === 422) {
        toast({
          title: "No notes could be drafted",
          description: "No speech could be detected, or the audio could not be read. Try a clearer recording.",
          variant: "destructive",
        });
      } else if (code === 409) {
        toast({
          title: "Cannot transcribe this item",
          description: "Only uploaded recordings can be transcribed.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Couldn't transcribe", description: "Please try again.", variant: "destructive" });
      }
    } finally {
      setTranscribingId(null);
    }
  };

  const insertNotes = async (recording: { id: number; draftNotes?: string | null; transcript?: string | null }) => {
    if (!onInsertNotes) return;
    const source = (recording.draftNotes ?? recording.transcript ?? "").trim();
    if (!source) return;
    const target = meeting;
    const existing = target.notes?.trim() ?? "";
    const newNotes = insertMode === "append" && existing ? `${existing}\n\n${source}` : source;
    setInsertingId(recording.id);
    try {
      await onInsertNotes(target.id, newNotes);
      toast({
        title: insertMode === "append" ? "Notes added to meeting" : "Meeting notes replaced",
        description: `Saved to "${target.title}".`,
      });
      setExpandedId(null);
    } catch {
      toast({ title: "Couldn't insert notes", description: "Please try again.", variant: "destructive" });
    } finally {
      setInsertingId(null);
    }
  };

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border bg-card px-5 py-4">
        <div className="flex items-center gap-2">
          <Mic className="h-5 w-5 text-primary" aria-hidden="true" />
          <div>
            <CardTitle className="text-lg">Meeting recordings</CardTitle>
            <CardDescription className="m-0">Record, then draft notes with AI to feed the agenda generator</CardDescription>
          </div>
        </div>
        <Badge variant="secondary" className="border-primary/20 bg-primary/10 text-primary shadow-none hover:bg-primary/10">
          {recordingList.length} saved
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5 p-6">
        {/* Inline record / stop controls -- hidden in split mode */}
        {!splitMode && (
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            {isRecording ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" aria-hidden="true" />
                <span className="font-mono text-sm text-foreground">{formatDuration(recElapsed)}</span>
                <span className="text-sm text-muted-foreground">Recording in progress</span>
                <Button size="sm" variant="outline" className="ml-auto border-red-600 text-red-700 hover:bg-red-50" onClick={stopRecording}>
                  <Square className="mr-1 h-3.5 w-3.5 fill-current" aria-hidden="true" /> Stop
                </Button>
              </div>
            ) : pendingRec ? null : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Capture meeting audio directly in your browser.</span>
                <Button size="sm" onClick={startRecording}>
                  <Mic className="mr-1 h-4 w-4" aria-hidden="true" /> Record
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Pending recording review -- always shown regardless of mode */}
        {pendingRec ? (
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
              Captured {formatDuration(pendingRec.durationSec)}. Review, then save.
            </div>
            <audio controls src={pendingRec.url} className="w-full" />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={captureTitle}
                onChange={(e) => setCaptureTitle(e.target.value)}
                placeholder="Recording title (optional)"
                className="flex-1"
                aria-label="Recording title"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveRecording} disabled={createRecording.isPending || requestUploadUrl.isPending}>
                  {createRecording.isPending || requestUploadUrl.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <UploadCloud className="mr-1 h-4 w-4" aria-hidden="true" />
                  )}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={discardPending}>Discard</Button>
              </div>
            </div>
          </div>
        ) : null}

        {aiUnavailable ? (
          <div
            role="status"
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            AI transcription is not configured for this workspace. Recording and manual notes still work.
          </div>
        ) : null}

        <div className="space-y-3">
          {recordingList.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              No recordings yet. Record audio to keep meeting context with the project.
            </div>
          ) : (
            recordingList.map((r) => {
              const isUpload = r.kind === "upload" && !!r.objectPath;
              const hasNotes = !!(r.transcript || r.draftNotes);
              const isExpanded = expandedId === r.id;
              const isTranscribing = transcribingId === r.id;
              return (
                <div key={r.id} className="rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-3 p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {r.kind === "upload" ? <Mic className="h-4 w-4" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{r.title}</span>
                        {hasNotes ? (
                          <Badge variant="secondary" className="shrink-0 border-primary/20 bg-primary/10 text-primary shadow-none hover:bg-primary/10">
                            Notes ready
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {r.durationSec ? (
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{formatDuration(r.durationSec)}</span>
                        ) : null}
                        <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {isUpload ? (
                      <audio controls preload="none" src={`/api/storage${r.objectPath}`} className="h-8 w-40 max-w-[40%]" />
                    ) : r.externalUrl ? (
                      <a href={r.externalUrl} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-medium text-primary hover:underline">
                        Open link
                      </a>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete recording: ${r.title}`}
                      onClick={() => removeRecording(r.id)}
                      disabled={deleteRecording.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </Button>
                  </div>

                  {isUpload ? (
                    <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
                      {hasNotes ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => (isExpanded ? setExpandedId(null) : openPanel(r.id))}
                          aria-expanded={isExpanded}
                        >
                          <FileText className="mr-1 h-4 w-4" aria-hidden="true" />
                          {isExpanded ? "Hide notes" : "View notes"}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => transcribe(r.id)}
                          disabled={isTranscribing || aiUnavailable}
                        >
                          {isTranscribing ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Sparkles className="mr-1 h-4 w-4" aria-hidden="true" />
                          )}
                          {isTranscribing ? "Transcribing..." : "Transcribe and draft notes"}
                        </Button>
                      )}
                    </div>
                  ) : null}

                  {isUpload && isExpanded && hasNotes ? (
                    <div className="space-y-4 border-t border-border bg-muted/10 p-4">
                      {r.transcript ? (
                        <Collapsible>
                          <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/40">
                            <span className="inline-flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Transcript
                            </span>
                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-card p-3 text-sm leading-relaxed text-muted-foreground">
                              {r.transcript}
                            </p>
                          </CollapsibleContent>
                        </Collapsible>
                      ) : null}

                      <div className="space-y-2">
                        <Label htmlFor={`draft-${r.id}`} className="text-sm font-medium">
                          {r.draftNotes ? "Draft notes" : "Transcript"}
                        </Label>
                        {!r.draftNotes ? (
                          <p className="text-xs text-muted-foreground">
                            Draft notes could not be generated, so the transcript is shown. You can still insert it into a meeting.
                          </p>
                        ) : null}
                        <Textarea
                          id={`draft-${r.id}`}
                          readOnly
                          value={r.draftNotes ?? r.transcript ?? ""}
                          className="min-h-40 resize-y bg-card font-normal"
                        />
                      </div>

                      {onInsertNotes ? (
                        <div className="space-y-3 rounded-md border border-border bg-card p-3">
                          <div className="space-y-1.5 sm:max-w-xs">
                            <Label htmlFor={`mode-${r.id}`} className="text-xs font-medium text-muted-foreground">
                              How to apply to this meeting's notes
                            </Label>
                            <Select value={insertMode} onValueChange={(v) => setInsertMode(v as "append" | "replace")}>
                              <SelectTrigger id={`mode-${r.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="append">Add to existing notes</SelectItem>
                                <SelectItem value="replace">Replace existing notes</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => insertNotes(r)}
                            disabled={insertingId === r.id}
                          >
                            {insertingId === r.id ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <ListPlus className="mr-1 h-4 w-4" aria-hidden="true" />
                            )}
                            Insert into notes
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
