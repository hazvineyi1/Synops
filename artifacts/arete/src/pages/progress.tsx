import { useState, useEffect } from "react";
import {
  useGetProgressSummary,
  useListRetrospectives,
  useGenerateWeeklyRetro,
  getGetProgressSummaryQueryKey,
  getListRetrospectivesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Flame, Brain, Calendar, Target, Loader2, RefreshCw, Award } from "lucide-react";
import { format } from "date-fns";
import { sanitizeCoachText } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export default function Progress() {
  const queryClient = useQueryClient();
  const { t } = useT();
  const { data: summary, isLoading: isSummaryLoading } = useGetProgressSummary();
  const { data: retrospectives = [], isLoading: isRetroLoading } = useListRetrospectives();
  const generateRetro = useGenerateWeeklyRetro();
  const [outcome, setOutcome] = useState<any | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/progress/outcome", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active) setOutcome(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const handleGenerateRetro = () => {
    generateRetro.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRetrospectivesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetProgressSummaryQueryKey() });
      }
    });
  };
  if (isSummaryLoading || isRetroLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      <div className="p-4 md:p-6 md:px-8 border-b border-border bg-background/95 sticky top-0 z-10">
        <h1 className="font-serif text-xl md:text-2xl text-primary font-medium">{t("prog.title")}</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">{t("prog.subtitle")}</p>
      </div>
      <div className="p-4 md:p-8 space-y-6 md:space-y-8 max-w-5xl mx-auto w-full">
        {/* Outcome proof — evidence the coaching is working */}
        {outcome && (
          <Card className="shadow-sm border-l-4 border-l-primary bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="font-serif text-lg font-medium flex items-center gap-2">
                  <Award className="w-5 h-5 text-primary" /> Your outcome
                </CardTitle>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${verdictBadgeClass(outcome.verdict)}`}>
                  {verdictShort(outcome.verdict)}
                </span>
              </div>
              <CardDescription className="mt-1">{outcome.verdictLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Proof label="Readiness" value={`${outcome.readinessPercent}%`} />
                <Proof label="Checkpoints done" value={`${outcome.checkpointsCompleted}`} />
                <Proof
                  label="Accuracy"
                  value={`${outcome.accuracy?.recentPct ?? 0}%`}
                  sub={
                    outcome.accuracy?.deltaPct != null
                      ? `${outcome.accuracy.deltaPct >= 0 ? "+" : ""}${outcome.accuracy.deltaPct} pts vs earlier`
                      : undefined
                  }
                  up={outcome.accuracy?.deltaPct != null ? outcome.accuracy.deltaPct >= 0 : undefined}
                />
                <Proof label="Mastered" value={`${outcome.mastery?.mastered ?? 0} / ${outcome.mastery?.total ?? 0}`} />
                {outcome.calibration && <Proof label="Calibration" value={outcome.calibration} />}
                {outcome.pace?.daysToExam != null && (
                  <Proof
                    label="Exam in"
                    value={`${outcome.pace.daysToExam} days`}
                    sub={
                      outcome.pace.projectedReadyInDays != null
                        ? `~ready in ${outcome.pace.projectedReadyInDays} days`
                        : undefined
                    }
                  />
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatCard
            title={t("prog.streak")}
            value={`${summary?.streakDays || 0} ${t("prog.days")}`}
            icon={<Flame className="w-5 h-5 text-orange-500" />}
          />
          <StatCard
            title={t("prog.readiness")}
            value={`${summary?.readinessPercent || 0}%`}
            icon={<Target className="w-5 h-5 text-primary" />}
          />
          <StatCard
            title={t("prog.examIn")}
            value={summary?.examDaysRemaining ? `${summary.examDaysRemaining} ${t("prog.days")}` : t("prog.tbd")}
            icon={<Calendar className="w-5 h-5 text-blue-500" />}
          />
          <StatCard
            title={t("prog.mastered")}
            value={`${summary?.masteredConcepts || 0} / ${summary?.totalConcepts || 0}`}
            icon={<Brain className="w-5 h-5 text-purple-500" />}
          />
        </div>
        {/* Mastery Distribution */}
        <Card className="shadow-sm border-border bg-card">
          <CardHeader className="pb-4">
            <CardTitle className="font-serif text-lg font-medium">{t("prog.distTitle")}</CardTitle>
            <CardDescription>{t("prog.distDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <ProgressBar label={t("prog.mastered")} count={summary?.masteryBuckets?.mastered || 0} total={summary?.totalConcepts || 1} color="bg-primary" />
              <ProgressBar label={t("prog.reviewing")} count={summary?.masteryBuckets?.reviewing || 0} total={summary?.totalConcepts || 1} color="bg-chart-2" />
              <ProgressBar label={t("prog.learning")} count={summary?.masteryBuckets?.learning || 0} total={summary?.totalConcepts || 1} color="bg-chart-4" />
              <ProgressBar label={t("prog.new")} count={summary?.masteryBuckets?.new || 0} total={summary?.totalConcepts || 1} color="bg-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        {/* Retrospectives */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl font-medium text-foreground">{t("prog.retroTitle")}</h2>
            <Button variant="outline" size="sm" onClick={handleGenerateRetro} disabled={generateRetro.isPending} className="gap-2">
              {generateRetro.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {t("prog.genRetro")}
            </Button>
          </div>

          <div className="space-y-4">
            {retrospectives.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-border rounded-xl bg-muted/20">
                <p className="text-muted-foreground text-sm">{t("prog.retroEmpty")}</p>
              </div>
            ) : (
              retrospectives.map((retro) => (
                <Card key={retro.id} className="border-l-4 border-l-primary shadow-sm bg-card">
                  <CardHeader className="py-4">
                    <CardTitle className="text-base font-serif">{t("prog.weekOf")} {format(new Date(retro.weekStart), "MMMM d, yyyy")}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-relaxed text-foreground opacity-90 whitespace-pre-wrap">
                    {sanitizeCoachText(retro.content)}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
function StatCard({ title, value, icon }: { title: string, value: string | number, icon: React.ReactNode }) {
  return (
    <Card className="shadow-sm border-border bg-card">
      <CardContent className="p-4 flex flex-col justify-center h-full">
        <div className="flex items-center gap-2 mb-2 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wider">{title}</span>
        </div>
        <div className="text-2xl font-serif font-semibold text-foreground">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
function ProgressBar({ label, count, total, color }: { label: string, count: number, total: number, color: string }) {
  const percent = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 md:gap-4 text-sm">
      <div className="w-20 md:w-24 font-medium text-foreground text-xs md:text-sm">{label}</div>
      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.max(percent, 2)}%` }} />
      </div>
      <div className="w-10 md:w-12 text-right text-muted-foreground text-xs md:text-sm">{count}</div>
    </div>
  );
}

function Proof({ label, value, sub, up }: { label: string; value: string; sub?: string; up?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-serif font-semibold text-foreground capitalize">{value}</div>
      {sub && (
        <div className={`text-xs mt-0.5 ${up === undefined ? "text-muted-foreground" : up ? "text-primary" : "text-amber-600"}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

function verdictShort(verdict: string): string {
  switch (verdict) {
    case "ahead": return "Ahead of pace";
    case "on_track": return "On track";
    case "behind": return "Behind pace";
    case "no_exam_date": return "Progressing";
    default: return "Building";
  }
}

function verdictBadgeClass(verdict: string): string {
  switch (verdict) {
    case "ahead":
    case "on_track":
      return "bg-primary/10 text-primary";
    case "behind":
      return "bg-amber-500/15 text-amber-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}
