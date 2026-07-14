import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Play, Pause, CheckCircle, XCircle } from 'lucide-react';

interface IVQuestion {
  id: string;
  videoTimestamp: number;
  stem: string;
  options: { id: string; text: string }[];
  questionType: string;
  points: number;
  feedbackCorrect?: string;
  feedbackIncorrect?: string;
  pauseOnReach: boolean;
}

interface IVResponse {
  correct: boolean | null;
  feedback?: string;
  correctOptionIds?: string[];
}

interface Props {
  beatId: string;
  videoUrl: string;
  onComplete?: () => void;
}

function isYoutube(url: string) {
  return url.includes('youtube') || url.includes('youtu.be');
}

function getYoutubeId(url: string) {
  const match = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
  return match?.[1] ?? '';
}

export function InteractiveVideoPlayer({ beatId, videoUrl, onComplete }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [paused, setPaused] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<IVQuestion | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [response, setResponse] = useState<IVResponse | null>(null);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const triggeredRef = useRef<Set<string>>(new Set());

  const { data: questions = [] } = useQuery<IVQuestion[]>({
    queryKey: ['iv-questions', beatId],
    queryFn: () => apiFetch(`/beats/${beatId}/interactive-questions`),
  });

  const respondMutation = useMutation({
    mutationFn: ({ questionId, response }: { questionId: string; response: string | string[] }) =>
      apiFetch<IVResponse>(`/interactive-questions/${questionId}/respond`, {
        method: 'POST', body: JSON.stringify({ response }),
      }),
    onSuccess: (data) => setResponse(data),
  });

  const triggerQuestion = useCallback((q: IVQuestion) => {
    if (triggeredRef.current.has(q.id)) return;
    triggeredRef.current.add(q.id);
    if (videoRef.current && q.pauseOnReach) videoRef.current.pause();
    setPaused(true);
    setActiveQuestion(q);
    setSelectedOptions([]);
    setResponse(null);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const t = videoRef.current?.currentTime ?? 0;
    setCurrentTime(t);
    for (const q of questions) {
      if (!triggeredRef.current.has(q.id) && t >= q.videoTimestamp && q.pauseOnReach) {
        triggerQuestion(q);
        break;
      }
    }
  }, [questions, triggerQuestion]);

  const handleContinue = () => {
    if (activeQuestion) setAnsweredIds(prev => new Set([...prev, activeQuestion.id]));
    setActiveQuestion(null);
    setResponse(null);
    setSelectedOptions([]);
    if (videoRef.current) videoRef.current.play().catch(() => {});
    setPaused(false);
    if (questions.length > 0 && answeredIds.size + 1 >= questions.length) {
      onComplete?.();
    }
  };

  const handleSubmit = () => {
    if (!activeQuestion || selectedOptions.length === 0) return;
    const resp = activeQuestion.questionType === 'check_all' ? selectedOptions : selectedOptions[0];
    respondMutation.mutate({ questionId: activeQuestion.id, response: resp });
  };

  const toggleOption = (optId: string) => {
    if (activeQuestion?.questionType === 'check_all') {
      setSelectedOptions(prev => prev.includes(optId) ? prev.filter(o => o !== optId) : [...prev, optId]);
    } else {
      setSelectedOptions([optId]);
    }
  };

  const durationApprox = videoRef.current?.duration ?? 0;
  const youtube = isYoutube(videoUrl);
  const youtubeId = youtube ? getYoutubeId(videoUrl) : '';
  const allAnswered = questions.length > 0 && answeredIds.size >= questions.length;

  return (
    <div className="space-y-3">
      {/* Video */}
      <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
        {youtube ? (
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1`}
            className="absolute inset-0 w-full h-full"
            allowFullScreen
            allow="autoplay; encrypted-media"
          />
        ) : (
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-contain"
            controls={!activeQuestion}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
          />
        )}

        {/* Question overlay */}
        {activeQuestion && (
          <div className="absolute inset-0 bg-black/85 flex items-center justify-center p-4 z-10">
            <div className="bg-background rounded-xl shadow-2xl p-6 max-w-lg w-full space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Question · {activeQuestion.points} pt{activeQuestion.points !== 1 ? 's' : ''}</Badge>
                {response && (
                  <Badge variant={response.correct ? 'default' : 'destructive'} className="text-xs">
                    {response.correct ? '✓ Correct' : '✗ Incorrect'}
                  </Badge>
                )}
              </div>
              <p className="text-foreground font-medium leading-relaxed">{activeQuestion.stem}</p>
              <div className="space-y-2">
                {activeQuestion.options.map((opt) => {
                  const selected = selectedOptions.includes(opt.id);
                  const isCorrect = response?.correctOptionIds?.includes(opt.id);
                  const isWrong = response && selected && !isCorrect;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => !response && toggleOption(opt.id)}
                      disabled={!!response}
                      className={cn(
                        "w-full text-left px-4 py-3 rounded-lg border text-sm transition-all",
                        selected && !response ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50 text-foreground",
                        isCorrect ? "border-green-500 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400" : "",
                        isWrong ? "border-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400" : ""
                      )}
                    >
                      {opt.text}
                    </button>
                  );
                })}
              </div>
              {response?.feedback && (
                <div className={cn("p-3 rounded-md text-sm", response.correct ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300")}>
                  {response.correct ? <CheckCircle className="h-4 w-4 inline mr-1" /> : <XCircle className="h-4 w-4 inline mr-1" />}
                  {response.feedback}
                </div>
              )}
              <div className="flex gap-2">
                {!response && (
                  <Button size="sm" onClick={handleSubmit} disabled={selectedOptions.length === 0 || respondMutation.isPending}>
                    {respondMutation.isPending ? 'Checking...' : 'Submit Answer'}
                  </Button>
                )}
                {response && <Button size="sm" onClick={handleContinue}>Continue →</Button>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Question timestamp dots */}
      {questions.length > 0 && !youtube && (
        <div className="relative h-6 bg-muted rounded-full overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-primary/20 rounded-full transition-all" style={{ width: durationApprox > 0 ? `${(currentTime / durationApprox) * 100}%` : '0%' }} />
          {durationApprox > 0 && questions.map((q) => (
            <div
              key={q.id}
              title={`Question at ${q.videoTimestamp}s`}
              className={cn("absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-background transition-colors cursor-pointer", answeredIds.has(q.id) ? "bg-green-500" : "bg-primary")}
              style={{ left: `${(q.videoTimestamp / durationApprox) * 100}%` }}
            />
          ))}
        </div>
      )}

      {/* Summary */}
      {questions.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {allAnswered ? (
            <><CheckCircle className="h-4 w-4 text-green-500" /> <span className="text-green-600 font-medium">All {questions.length} questions answered</span></>
          ) : (
            <><span>{answeredIds.size} / {questions.length} questions answered</span></>
          )}
        </div>
      )}
    </div>
  );
}
