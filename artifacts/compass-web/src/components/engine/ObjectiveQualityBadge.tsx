import { detectVerb } from "@workspace/compass-curriculum-engine";
import { CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Instant, client-side measurability and Bloom feedback for a single learning
 * outcome. Runs the SAME pure curriculum engine the server uses (detectVerb), so
 * authors get immediate guidance while the persisted server evaluate stays the
 * authoritative source of truth. Colors meet WCAG 2.1 AA (dark text on tint).
 */
export function ObjectiveQualityBadge({ text, className }: { text: string; className?: string }) {
  const d = detectVerb(text);

  if (d.kind === "measurable") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-green-700/30 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800",
          className,
        )}
        title={`Measurable verb "${d.verb}" maps to Bloom level ${d.bloomLevel}.`}
      >
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Measurable: {d.bloomLevel}
      </span>
    );
  }

  if (d.kind === "vague") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-red-700/30 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800",
          className,
        )}
        title={d.suggestion ?? "Use an observable, measurable verb."}
      >
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Vague verb{d.verb ? `: "${d.verb}"` : ""}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-amber-700/30 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900",
        className,
      )}
      title={d.suggestion ?? "Lead with an observable action verb."}
    >
      <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      No action verb
    </span>
  );
}
