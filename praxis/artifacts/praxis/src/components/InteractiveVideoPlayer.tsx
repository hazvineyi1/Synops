import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle } from 'lucide-react';
import { resolveVideo } from '@/lib/videoEmbed';

/**
 * Interactive video player. Plays a clip inline and pauses at each checkpoint timestamp to pop a
 * question, so a short clip is active rather than passive. Works with YouTube/Khan (via the YouTube
 * IFrame API, which lets us read currentTime and pause/resume) and with direct video files. Other
 * providers (Vimeo, TikTok…) fall back to a plain inline embed without checkpoints. With zero questions
 * it degrades gracefully to a normal inline player.
 */
export interface IVQuestion {
  id: string;
  videoTimestamp: number;
  stem: string;
  options: { id: string; text: string }[];
  questionType: string;
  points: number;
  pauseOnReach: boolean;
  // Present only for inline (catalog-authored) questions, enables local grading with no beat.
  correctOptionIds?: string[];
  feedbackCorrect?: string;
  feedbackIncorrect?: string;
}
interface IVResponse { correct: boolean | null; feedback?: string; correctOptionIds?: string[] }
/** Provide beatId (module video, graded server-side) OR questions (inline, graded locally). */
interface Props { beatId?: string; videoUrl: string; questions?: IVQuestion[]; onComplete?: () => void }

// Load the YouTube IFrame API once and resolve when ready.
let ytApiPromise: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
  const w = window as any;
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') prev(); resolve(w.YT); };
    if (!document.getElementById('yt-iframe-api')) {
      const s = document.createElement('script');
      s.id = 'yt-iframe-api'; s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
  return ytApiPromise;
}

export function InteractiveVideoPlayer({ beatId, videoUrl, questions: inlineQuestions, onComplete }: Props) {
  const resolved = resolveVideo(videoUrl);
  const ytId = (resolved.provider === 'youtube' || resolved.provider === 'khan')
    ? (resolved.src.match(/embed\/([A-Za-z0-9_-]{11})/)?.[1] ?? '') : '';
  const isFile = resolved.kind === 'file';
  const canCheckpoint = !!ytId || isFile;

  const videoRef = useRef<HTMLVideoElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytDivRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState<IVQuestion | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [response, setResponse] = useState<IVResponse | null>(null);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const triggeredRef = useRef<Set<string>>(new Set());

  const { data: fetched = [] } = useQuery<IVQuestion[]>({
    queryKey: ['iv-questions', beatId],
    queryFn: () => apiFetch(`/beats/${beatId}/interactive-questions`),
    enabled: !!beatId && !inlineQuestions,
  });
  const questions = inlineQuestions ?? fetched;
  const hasQuestions = questions.length > 0;
  const questionsRef = useRef<IVQuestion[]>([]);
  questionsRef.current = questions;

  const respondMutation = useMutation({
    mutationFn: ({ questionId, response }: { questionId: string; response: string | string[] }) =>
      apiFetch<IVResponse>(`/interactive-questions/${questionId}/respond`, { method: 'POST', body: JSON.stringify({ response }) }),
    onSuccess: (data) => setResponse(data),
  });

  const pausePlayer = useCallback(() => {
    if (ytPlayerRef.current?.pauseVideo) ytPlayerRef.current.pauseVideo();
    else videoRef.current?.pause();
  }, []);
  const playPlayer = useCallback(() => {
    if (ytPlayerRef.current?.playVideo) ytPlayerRef.current.playVideo();
    else videoRef.current?.play().catch(() => {});
  }, []);

  const triggerQuestion = useCallback((q: IVQuestion) => {
    if (triggeredRef.current.has(q.id)) return;
    triggeredRef.current.add(q.id);
    if (q.pauseOnReach) pausePlayer();
    setActiveQuestion(q);
    setSelectedOptions([]);
    setResponse(null);
  }, [pausePlayer]);

  const checkCheckpoints = useCallback((t: number) => {
    for (const q of questionsRef.current) {
      if (!triggeredRef.current.has(q.id) && t >= q.videoTimestamp && q.pauseOnReach) { triggerQuestion(q); break; }
    }
  }, [triggerQuestion]);

  // YouTube: create the IFrame-API player and poll currentTime.
  useEffect(() => {
    if (!ytId || !hasQuestions || !ytDivRef.current) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !ytDivRef.current) return;
      ytPlayerRef.current = new YT.Player(ytDivRef.current, {
        videoId: ytId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, origin: window.location.origin },
        events: { onReady: (e: any) => setDuration(e.target.getDuration?.() || 0) },
      });
      interval = setInterval(() => {
        const p = ytPlayerRef.current;
        if (!p || !p.getCurrentTime) return;
        const t = p.getCurrentTime() || 0;
        setCurrentTime(t);
        if (!duration && p.getDuration) setDuration(p.getDuration() || 0);
        checkCheckpoints(t);
      }, 500);
    });
    return () => { cancelled = true; if (interval) clearInterval(interval); try { ytPlayerRef.current?.destroy?.(); } catch { /* noop */ } ytPlayerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytId, hasQuestions]);

  const onFileTime = useCallback(() => {
    const t = videoRef.current?.currentTime ?? 0;
    setCurrentTime(t); checkCheckpoints(t);
  }, [checkCheckpoints]);

  const handleContinue = () => {
    if (activeQuestion) setAnsweredIds((prev) => new Set([...prev, activeQuestion.id]));
    const wasLast = questions.length > 0 && answeredIds.size + 1 >= questions.length;
    setActiveQuestion(null); setResponse(null); setSelectedOptions([]);
    playPlayer();
    if (wasLast) onComplete?.();
  };
  const handleSubmit = () => {
    if (!activeQuestion || selectedOptions.length === 0) return;
    if (beatId) {
      const resp = activeQuestion.questionType === 'check_all' ? selectedOptions : selectedOptions[0];
      respondMutation.mutate({ questionId: activeQuestion.id, response: resp });
    } else {
      // Inline (catalog) question, grade locally against the provided correct answers.
      const correctIds = activeQuestion.correctOptionIds ?? [];
      const isCorrect = activeQuestion.questionType === 'check_all'
        ? correctIds.length === selectedOptions.length && correctIds.every((c) => selectedOptions.includes(c))
        : correctIds.includes(selectedOptions[0]);
      setResponse({ correct: isCorrect, correctOptionIds: correctIds, feedback: isCorrect ? activeQuestion.feedbackCorrect : activeQuestion.feedbackIncorrect });
    }
  };
  const toggleOption = (optId: string) => {
    if (activeQuestion?.questionType === 'check_all') setSelectedOptions((p) => p.includes(optId) ? p.filter((o) => o !== optId) : [...p, optId]);
    else setSelectedOptions([optId]);
  };

  const allAnswered = questions.length > 0 && answeredIds.size >= questions.length;

  return (
    <div className="space-y-3">
      <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
        {ytId && hasQuestions ? (
          <div ref={ytDivRef} className="absolute inset-0 w-full h-full" />
        ) : isFile ? (
          <video ref={videoRef} src={resolved.src} className="w-full h-full object-contain" controls={!activeQuestion} onTimeUpdate={onFileTime} onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)} />
        ) : (
          // Providers without a JS API (Vimeo, TikTok…), inline embed, no checkpoints.
          <iframe src={resolved.src} title="Lesson video" className="absolute inset-0 w-full h-full" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        )}

        {activeQuestion && (
          <div className="absolute inset-0 bg-black/85 flex items-center justify-center p-4 z-10">
            <div className="bg-background rounded-xl shadow-2xl p-6 max-w-lg w-full space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Checkpoint · {activeQuestion.points} pt{activeQuestion.points !== 1 ? 's' : ''}</Badge>
                {response && <Badge variant={response.correct ? 'default' : 'destructive'} className="text-xs">{response.correct ? '✓ Correct' : '✗ Try again next time'}</Badge>}
              </div>
              <p className="text-foreground font-medium leading-relaxed">{activeQuestion.stem}</p>
              <div className="space-y-2">
                {activeQuestion.options.map((opt) => {
                  const selected = selectedOptions.includes(opt.id);
                  const isCorrect = response?.correctOptionIds?.includes(opt.id);
                  const isWrong = response && selected && !isCorrect;
                  return (
                    <button key={opt.id} onClick={() => !response && toggleOption(opt.id)} disabled={!!response}
                      className={cn("w-full text-left px-4 py-3 rounded-lg border text-sm transition-all",
                        selected && !response ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50 text-foreground",
                        isCorrect ? "border-green-500 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400" : "",
                        isWrong ? "border-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400" : "")}>
                      {opt.text}
                    </button>
                  );
                })}
              </div>
              {response?.feedback && (
                <div className={cn("p-3 rounded-md text-sm", response.correct ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300")}>
                  {response.correct ? <CheckCircle className="h-4 w-4 inline mr-1" /> : <XCircle className="h-4 w-4 inline mr-1" />}{response.feedback}
                </div>
              )}
              <div className="flex gap-2">
                {!response && <Button size="sm" onClick={handleSubmit} disabled={selectedOptions.length === 0 || respondMutation.isPending}>{respondMutation.isPending ? 'Checking…' : 'Submit'}</Button>}
                {response && <Button size="sm" onClick={handleContinue}>Continue →</Button>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Checkpoint markers along the timeline */}
      {questions.length > 0 && canCheckpoint && duration > 0 && (
        <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-primary/25" style={{ width: `${Math.min(100, (currentTime / duration) * 100)}%` }} />
          {questions.map((q) => (
            <div key={q.id} title={`Checkpoint at ${q.videoTimestamp}s`}
              className={cn("absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-background", answeredIds.has(q.id) ? "bg-green-500" : "bg-primary")}
              style={{ left: `calc(${Math.min(100, (q.videoTimestamp / duration) * 100)}% - 6px)` }} />
          ))}
        </div>
      )}

      {questions.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {allAnswered ? <><CheckCircle className="h-4 w-4 text-green-500" /> <span className="text-green-600 font-medium">All {questions.length} checkpoints answered</span></>
            : <span>{answeredIds.size} / {questions.length} checkpoints answered</span>}
        </div>
      )}
    </div>
  );
}
