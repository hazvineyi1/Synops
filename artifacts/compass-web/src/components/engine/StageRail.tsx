import { Link } from "wouter";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGES, STAGE_COUNT, stageState, getStage } from "@/lib/stages";

interface StageRailProps {
  projectId: number;
  /** The stage the project has actually reached (drives done / current / upcoming). */
  currentStage: number;
  /** The stage whose workspace is open now (the "you are here" marker). */
  viewingStage?: number;
  /**
   * "full": labelled, interactive timeline shown on every project page.
   * "compact": slim progress strip for cards and lists (non-interactive).
   */
  variant?: "full" | "compact";
  className?: string;
}

/**
 * The visible backbone of the curriculum pipeline. Renders the four stages in
 * order with done / current / upcoming states. Every stage links to its
 * workspace so users can move between stages freely; the server still owns
 * real progression and authorization.
 * When viewingStage is set, that stage is marked as the current page so a builder
 * always knows where they are. Accessible: an ordered list, aria-current on the
 * active stage or page, and text (not color alone) conveys each stage's state.
 */
export function StageRail({ projectId, currentStage, viewingStage, variant = "full", className }: StageRailProps) {
  if (variant === "compact") {
    const current = getStage(currentStage);
    const doneCount = Math.min(currentStage, STAGE_COUNT);
    return (
      <div className={className}>
        <ol className="flex items-center gap-1" aria-label="Pipeline progress">
          {STAGES.map((stage) => {
            const state = stageState(stage.id, currentStage);
            return (
              <li key={stage.id} className="flex-1">
                <span className="sr-only">
                  {stage.title}: {state}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "block h-1.5 rounded-full",
                    state === "done" && "bg-primary",
                    state === "current" && "bg-accent",
                    state === "upcoming" && "bg-muted"
                  )}
                />
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">
          Stage {Math.min(currentStage + 1, STAGE_COUNT)} of {STAGE_COUNT}
          {current ? `: ${current.title}` : ""}
          <span className="text-muted-foreground/70"> ({doneCount} complete)</span>
        </p>
      </div>
    );
  }

  return (
    <ol
      className={cn("flex items-stretch gap-1.5", className)}
      aria-label="Curriculum pipeline stages"
    >
      {STAGES.map((stage) => {
        const state = stageState(stage.id, currentStage);
        const isViewing = viewingStage != null && stage.id === viewingStage;
        const stateLabel =
          state === "done" ? "Completed" : state === "current" ? "In progress" : "Upcoming";
        const ariaCurrent: "page" | "step" | undefined = isViewing
          ? "page"
          : viewingStage == null && state === "current"
            ? "step"
            : undefined;

        const base = cn(
          "flex h-full min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors",
          state === "current" && "border-primary/40 bg-primary/5",
          state === "done" && "border-transparent bg-muted/40 hover:bg-muted/60",
          state === "upcoming" && "border-dashed border-border bg-transparent hover:bg-muted/30",
          isViewing && "ring-2 ring-primary ring-offset-1 ring-offset-background"
        );

        return (
          <li key={stage.id} className="min-w-0 flex-1">
            <Link
              href={`/projects/${projectId}/${stage.slug}`}
              aria-current={ariaCurrent}
              aria-label={`${stage.title}: ${stateLabel}.${isViewing ? " Current page." : " Open workspace."}`}
              className={cn(
                base,
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  state === "current" && "bg-primary text-primary-foreground",
                  state === "done" && "bg-primary/15 text-primary",
                  state === "upcoming" && "bg-muted text-muted-foreground"
                )}
              >
                {state === "done" ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  stage.id + 1
                )}
              </span>
              <span className="min-w-0 leading-tight">
                <span
                  className={cn(
                    "block truncate text-xs font-semibold sm:text-sm",
                    isViewing
                      ? "text-primary"
                      : state === "upcoming"
                        ? "text-muted-foreground"
                        : "text-foreground"
                  )}
                >
                  {stage.title}
                </span>
                <span className="hidden truncate text-[10px] uppercase tracking-wide text-muted-foreground sm:block">
                  {isViewing ? "You are here" : stateLabel}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
