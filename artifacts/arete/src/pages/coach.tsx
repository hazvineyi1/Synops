import { useState, useRef, useEffect, useCallback } from "react";
import {
  useListMessages,
  useSendMessage,
  useDailyOpen,
  useGradeCheckpoint,
  getListMessagesQueryKey,
  useGetProfile,
  useGetProgressSummary,
  useListConcepts,
  useListCheckpoints,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Play, Clock, TrendingUp, AlertTriangle, Target, Calendar, Flame, Brain } from "lucide-react";
import { cn, sanitizeCoachText } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export default function Coach() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { t } = useT();
  const { data: profile } = useGetProfile();
  const { data: messages = [], isLoading: isLoadingMessages } = useListMessages();

  const sendMessage = useSendMessage();
  const dailyOpen = useDailyOpen();
  const gradeCheckpoint = useGradeCheckpoint();
  // One checkpoint is active at a time (the coach's latest message), so a single
  // answer/confidence pair is enough.
  const [checkpointAnswer, setCheckpointAnswer] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  // On mount, if no messages, try daily open
  useEffect(() => {
    if (!isLoadingMessages && messages.length === 0) {
      dailyOpen.mutate(undefined, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey() });
        }
      });
    }
  }, [isLoadingMessages, messages.length]);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sendMessage.isPending, dailyOpen.isPending]);
  const handleSend = useCallback((text: string = input) => {
    if (!text.trim() || sendMessage.isPending) return;

    setInput("");
    sendMessage.mutate({ data: { content: text.trim() } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey() });
      }
    });
  }, [input, sendMessage, queryClient]);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  const handleSubmitCheckpoint = useCallback(
    (conceptId: number, prompt: string) => {
      const answer = checkpointAnswer.trim();
      if (!answer || gradeCheckpoint.isPending) return;
      gradeCheckpoint.mutate(
        { data: { conceptId, prompt, userAnswer: answer, confidenceBefore: confidence } },
        {
          onSuccess: () => {
            setCheckpointAnswer("");
            setConfidence(null);
            queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey() });
          },
        },
      );
    },
    [checkpointAnswer, confidence, gradeCheckpoint, queryClient],
  );
  const isPending = sendMessage.isPending || dailyOpen.isPending || gradeCheckpoint.isPending;
  const personaLabel = profile?.coachPersonality
    ? t(`landing.p.${profile.coachPersonality}.title`, profile.coachPersonality)
    : t("coach.tutorFallback");
  return (
    <div className="flex flex-col h-full bg-background relative">
      <div className="hidden md:block p-4 border-b border-border/50 bg-background/95 backdrop-blur z-10 sticky top-0">
        <h1 className="font-serif text-xl text-primary font-medium">Arete</h1>
        <p className="text-xs text-muted-foreground capitalize">
          {personaLabel}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 md:p-8 space-y-6 md:space-y-8" ref={scrollRef}>
        <CoachMemory />
        {messages.map((msg, i) => {
          const isCoach = msg.role === "coach";

          return (
            <div key={msg.id || i} className={cn(
              "flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
              isCoach ? "justify-start" : "justify-end"
            )}>
              <div className={cn(
                "max-w-[85%] md:max-w-[75%] px-5 py-4",
                isCoach
                  ? "bg-card border-l-[3px] border-primary text-foreground shadow-sm rounded-r-2xl rounded-bl-2xl font-serif text-[1.05rem] leading-relaxed"
                  : "bg-primary text-primary-foreground text-base rounded-l-2xl rounded-tr-2xl"
              )}>
                <div className="whitespace-pre-wrap">{isCoach ? sanitizeCoachText(msg.content) : msg.content}</div>

                {isCoach && msg.richBlocks && typeof msg.richBlocks === 'object' && (
                  <div className="mt-4 pt-4 border-t border-border/50 flex flex-col gap-3 font-sans">
                    {/* Render Plan Card if it exists */}
                    {(msg.richBlocks as any).plan_card && (() => {
                      const planCard = (msg.richBlocks as any).plan_card;
                      const conceptCount = Array.isArray(planCard.conceptIds) ? planCard.conceptIds.length : 0;
                      return (
                        <div className="bg-background/50 rounded-lg p-4 border border-border">
                          <div className="flex justify-between items-center mb-2 gap-3">
                            <h4 className="font-semibold text-sm">{t("coach.todayPlan")}</h4>
                            {typeof planCard.estimatedMinutes === "number" && (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">{planCard.estimatedMinutes}m</span>
                            )}
                          </div>
                          {planCard.goalText && (
                            <p className="text-sm mb-1">{sanitizeCoachText(String(planCard.goalText))}</p>
                          )}
                          {conceptCount > 0 && (
                            <p className="text-xs text-muted-foreground mb-4">
                              {conceptCount} {conceptCount === 1 ? "concept" : "concepts"}
                            </p>
                          )}
                          <Button
                            size="sm"
                            className="w-full gap-2"
                            onClick={() => handleSend("Let's go")}
                            disabled={isPending}
                          >
                            <Play className="w-4 h-4" /> {t("coach.beginSession")}
                          </Button>
                        </div>
                      );
                    })()}

                    {/* Render Checkpoint (teach -> test). Only the latest message's
                        checkpoint is answerable; once answered, newer messages push
                        it out of last position and it reads as done. */}
                    {(msg.richBlocks as any).checkpoint && (() => {
                      const cp = (msg.richBlocks as any).checkpoint;
                      const isActive = i === messages.length - 1;
                      if (!isActive) {
                        return <p className="text-xs text-muted-foreground italic">Checkpoint answered.</p>;
                      }
                      const confidenceLabels = ["Not sure", "Shaky", "Fairly", "Certain"];
                      return (
                        <div className="bg-background/50 rounded-lg p-4 border border-border flex flex-col gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground mr-1">How sure are you?</span>
                            {[0, 1, 2, 3].map((lvl) => (
                              <Button
                                key={lvl}
                                type="button"
                                size="sm"
                                variant={confidence === lvl ? "default" : "outline"}
                                className="h-7 px-2.5 text-xs rounded-full"
                                onClick={() => setConfidence(lvl)}
                                disabled={gradeCheckpoint.isPending}
                              >
                                {confidenceLabels[lvl]}
                              </Button>
                            ))}
                          </div>
                          <Textarea
                            value={checkpointAnswer}
                            onChange={(e) => setCheckpointAnswer(e.target.value)}
                            placeholder="Answer in your own words..."
                            rows={3}
                            className="resize-none bg-card"
                            disabled={gradeCheckpoint.isPending}
                          />
                          <Button
                            size="sm"
                            className="self-end gap-2"
                            onClick={() => handleSubmitCheckpoint(Number(cp.conceptId), String(cp.prompt))}
                            disabled={!checkpointAnswer.trim() || gradeCheckpoint.isPending}
                          >
                            {gradeCheckpoint.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                            Submit answer
                          </Button>
                        </div>
                      );
                    })()}

                    {/* Render Quick Replies if they exist */}
                    {(msg.richBlocks as any).quick_replies && Array.isArray((msg.richBlocks as any).quick_replies) && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {((msg.richBlocks as any).quick_replies as string[]).map((reply: string, j: number) => (
                          <Button
                            key={j}
                            variant="outline"
                            size="sm"
                            className="rounded-full text-xs h-8 font-normal bg-background"
                            onClick={() => handleSend(reply)}
                            disabled={isPending}
                          >
                            {reply}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isPending && (
          <div className="flex w-full justify-start animate-in fade-in duration-300">
             <div className="max-w-[85%] rounded-r-2xl rounded-bl-2xl px-5 py-4 bg-card border-l-[3px] border-primary shadow-sm flex items-center h-[3.5rem]">
               <div className="thinking-dots">
                 <div></div><div></div><div></div><div></div>
               </div>
             </div>
          </div>
        )}
      </div>
      <div className="p-3 md:p-6 border-t border-border bg-background/95 backdrop-blur z-10 flex-shrink-0">
        <div className="relative max-w-3xl mx-auto">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("coach.inputPlaceholder")}
            rows={2}
            className="min-h-[52px] md:min-h-[60px] pr-14 py-3 resize-none bg-card rounded-xl border-muted focus-visible:ring-primary shadow-sm text-base"
            disabled={isPending}
          />
          <Button
            size="icon"
            className="absolute bottom-2 right-2 rounded-lg h-9 w-9"
            onClick={() => handleSend()}
            disabled={!input.trim() || isPending}
          >
            {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function lastSeenLabel(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  if (isNaN(then.getTime())) return null;
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  const b = new Date(then);
  b.setHours(0, 0, 0, 0);
  const d = Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)} wk ago`;
  return `${Math.floor(d / 30)} mo ago`;
}

// The coach's memory made visible: concrete facts it is tracking about the
// learner, drawn from real data (concepts, checkpoints, progress summary).
function CoachMemory() {
  const { data: summary } = useGetProgressSummary();
  const { data: concepts = [] } = useListConcepts();
  const { data: checkpoints = [] } = useListCheckpoints();

  if (concepts.length === 0 && checkpoints.length === 0) return null;

  // Only concepts that have actually been tested carry a real mastery signal;
  // brand-new ones should not be labeled "strongest" or "needs work".
  const tested = concepts.filter((c) => (c.reps ?? 0) > 0);
  let strongest = tested[0];
  let weakest = tested[0];
  for (const c of tested) {
    if (c.mastery > strongest.mastery) strongest = c;
    if (c.mastery < weakest.mastery) weakest = c;
  }

  const lastDate =
    checkpoints.length > 0
      ? checkpoints.map((c) => c.date).filter(Boolean).sort().slice(-1)[0]
      : null;
  const seen = lastSeenLabel(lastDate);

  const graded = checkpoints.filter((c) => c.coachGrade != null && c.confidenceBefore != null);
  let calibration: string | null = null;
  if (graded.length >= 2) {
    const avgConf = graded.reduce((s, c) => s + (c.confidenceBefore ?? 0), 0) / graded.length;
    const avgGrade = graded.reduce((s, c) => s + (c.coachGrade ?? 0), 0) / graded.length;
    const gap = avgConf - avgGrade;
    calibration =
      Math.abs(gap) <= 0.4
        ? "Confidence matches results"
        : gap > 0.4
          ? "Tends to overestimate"
          : "Sells yourself short";
  }

  const chips: { icon: React.ReactNode; label: string; value: string }[] = [];
  if (seen) chips.push({ icon: <Clock className="w-3.5 h-3.5" />, label: "Last seen", value: seen });
  if (strongest) {
    chips.push({
      icon: <TrendingUp className="w-3.5 h-3.5 text-primary" />,
      label: "Strongest",
      value: `${sanitizeCoachText(strongest.title)} (${Math.round(strongest.mastery * 100)}%)`,
    });
  }
  if (weakest && strongest && weakest.id !== strongest.id) {
    chips.push({
      icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />,
      label: "Needs work",
      value: `${sanitizeCoachText(weakest.title)} (${Math.round(weakest.mastery * 100)}%)`,
    });
  }
  if (calibration) {
    chips.push({ icon: <Target className="w-3.5 h-3.5" />, label: "Calibration", value: calibration });
  }
  if (summary?.examDaysRemaining != null) {
    chips.push({
      icon: <Calendar className="w-3.5 h-3.5 text-blue-500" />,
      label: "Exam in",
      value: `${summary.examDaysRemaining} days`,
    });
  }
  if (summary?.streakDays) {
    chips.push({
      icon: <Flame className="w-3.5 h-3.5 text-orange-500" />,
      label: "Streak",
      value: `${summary.streakDays} days`,
    });
  }
  chips.push({
    icon: <Brain className="w-3.5 h-3.5 text-purple-500" />,
    label: "Tracking",
    value: `${concepts.length} concept${concepts.length === 1 ? "" : "s"}`,
  });

  return (
    <div className="mb-2 rounded-xl border border-border bg-card/60 p-3 font-sans">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        What I remember
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 rounded-lg bg-background/70 border border-border/60 px-2.5 py-1 text-xs"
          >
            {chip.icon}
            <span className="text-muted-foreground">{chip.label}:</span>
            <span className="font-medium text-foreground">{chip.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
