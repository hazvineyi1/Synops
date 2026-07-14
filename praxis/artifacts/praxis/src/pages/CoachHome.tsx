import React from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import {
  useCoachPlan,
  useRegeneratePlan,
  useConceptMastery,
  useCoachProfile,
  startModuleSession,
  PERSONALITY_META,
  type CoachPlanItem,
} from "@/lib/coachApi";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Flame,
  Target,
  BrainCircuit,
  CheckCircle2,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const KIND_META: Record<
  CoachPlanItem["kind"],
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  review: { label: "Review", icon: RotateCcw, className: "text-amber-600 bg-amber-500/10 ring-amber-500/20" },
  weak: { label: "Shore up", icon: Target, className: "text-rose-600 bg-rose-500/10 ring-rose-500/20" },
  new: { label: "New ground", icon: Sparkles, className: "text-sky-600 bg-sky-500/10 ring-sky-500/20" },
};

export function CoachHome({ firstName }: { firstName?: string | null }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: plan, isLoading: planLoading } = useCoachPlan();
  const { data: mastery } = useConceptMastery();
  const { data: profile } = useCoachProfile();
  const regenerate = useRegeneratePlan();
  const [startingId, setStartingId] = React.useState<string | null>(null);

  const personality = profile?.coachPersonality ?? "socratic_mentor";
  const meta = PERSONALITY_META[personality];

  const dueCount = mastery?.filter((m) => m.due).length ?? 0;
  const masteredCount = mastery?.filter((m) => m.mastery >= 0.8).length ?? 0;
  const streak = computeStreak(
    (mastery ?? []).map((m) => m.lastReviewedAt).filter(Boolean) as string[]
  );

  const handleStart = async (moduleId: string) => {
    try {
      setStartingId(moduleId);
      const session = await startModuleSession(moduleId);
      setLocation(`/learn/${session.id}`);
    } catch (e) {
      toast({ title: "Could not start", description: (e as Error).message, variant: "destructive" });
      setStartingId(null);
    }
  };

  const items = plan?.items ?? [];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="space-y-8">
      {/* Coach greeting — the coach leads, no blank dashboard */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={cn(
          "relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br p-6 sm:p-8",
          meta.accent
        )}
      >
        <div className="flex items-start gap-4">
          <CoachOrb />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {meta.label}
              </span>
              <button
                onClick={() => setLocation("/coach-settings")}
                className="text-muted-foreground/60 hover:text-foreground transition-colors"
                aria-label="Coach settings"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight mb-3">
              {greeting()}{firstName ? `, ${firstName}` : ""}.
            </h1>
            {planLoading ? (
              <div className="space-y-2">
                <div className="h-4 w-3/4 bg-foreground/10 rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-foreground/10 rounded animate-pulse" />
              </div>
            ) : (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-[15px] sm:text-base leading-relaxed text-foreground/80 max-w-2xl"
              >
                {plan?.rationale}
              </motion.p>
            )}
          </div>
        </div>
      </motion.section>

      {/* Progress rail */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatPill icon={Flame} label="Day streak" value={streak} tone="text-orange-500" />
        <StatPill icon={RotateCcw} label="Due to review" value={dueCount} tone="text-amber-500" />
        <StatPill icon={BrainCircuit} label="Mastered" value={masteredCount} tone="text-emerald-500" />
      </div>

      {/* Today's path — the spine */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-serif font-semibold">Today's path</h2>
            {items.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {doneCount} of {items.length} done
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
            className="text-muted-foreground"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", regenerate.isPending && "animate-spin")} />
            Rethink
          </Button>
        </div>

        {planLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyPath />
        ) : (
          <div className="space-y-3">
            {items.map((item, idx) => {
              const km = KIND_META[item.kind];
              const Icon = km.icon;
              return (
                <motion.button
                  key={item.moduleId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * idx, duration: 0.35 }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleStart(item.moduleId)}
                  disabled={!!startingId}
                  className={cn(
                    "group w-full text-left rounded-2xl border border-border bg-card p-4 sm:p-5 flex items-center gap-4 transition-shadow hover:shadow-md disabled:opacity-60",
                    item.done && "opacity-60"
                  )}
                >
                  <div
                    className={cn(
                      "h-11 w-11 shrink-0 rounded-xl flex items-center justify-center ring-1",
                      km.className
                    )}
                  >
                    {item.done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[11px] font-semibold uppercase tracking-wider", km.className.split(" ")[0])}>
                        {km.label}
                      </span>
                    </div>
                    <h3 className="font-semibold text-foreground truncate">{item.moduleTitle}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-1">{item.reason}</p>
                  </div>
                  <div className="shrink-0 text-muted-foreground group-hover:text-primary transition-colors">
                    {startingId === item.moduleId ? (
                      <RefreshCw className="h-5 w-5 animate-spin" />
                    ) : (
                      <ArrowRight className="h-5 w-5" />
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function CoachOrb() {
  return (
    <div className="relative h-12 w-12 shrink-0">
      <motion.div
        className="absolute inset-0 rounded-full bg-primary/20"
        animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-lg">
        <Sparkles className="h-6 w-6" />
      </div>
    </div>
  );
}

function StatPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-1">
      <Icon className={cn("h-5 w-5", tone)} />
      <span className="text-2xl font-serif font-bold leading-none mt-1">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function EmptyPath() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-4">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <h3 className="font-serif font-semibold text-lg mb-1">You're all caught up</h3>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
        Nothing is due today. Rest counts. Explore a new course from the catalogue, or check back tomorrow.
      </p>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function computeStreak(dates: string[]): number {
  if (!dates?.length) return 0;
  const days = new Set(dates.map((d) => new Date(d).toISOString().slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  // allow today or yesterday to seed the streak
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(cursor.toISOString().slice(0, 10))) return 0;
  }
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
