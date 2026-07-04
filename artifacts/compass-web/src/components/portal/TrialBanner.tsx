import { Link } from "wouter";
import { Clock, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { canManageSchool } from "@/lib/roles";
import { Button } from "@/components/ui/button";

/**
 * Persistent trial status strip shown above every workspace page. It is purely
 * advisory: the server enforces read-only independently. It surfaces two states,
 * both derived from the current user's trial summary:
 *  - read-only (trial ended): a prominent prompt to upgrade;
 *  - trialing: a quiet countdown of the days remaining.
 * Members who cannot manage billing see the status without an upgrade button.
 */
export function TrialBanner() {
  const { user } = useAuth();
  if (!user) return null;

  const canUpgrade = canManageSchool(user.role);
  const days = user.trialDaysRemaining;

  if (user.readOnly) {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm md:px-6"
      >
        <Lock className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <p className="text-destructive">
          <span className="font-medium">Your free trial has ended.</span>{" "}
          <span className="text-foreground/80">
            You can still view everything, but creating and editing are paused
            {canUpgrade ? ". Contact us to continue." : "."}
          </span>
        </p>
        {canUpgrade && (
          <Button asChild size="sm" variant="destructive" className="ml-auto">
            <Link href="~/contact">Contact us</Link>
          </Button>
        )}
      </div>
    );
  }

  // Countdown only applies while an active trial clock is running.
  if (typeof days !== "number") return null;

  const daysLabel =
    days <= 0 ? "Your free trial ends today." : `${days} day${days === 1 ? "" : "s"} left in your free trial.`;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/50 px-4 py-2.5 text-sm md:px-6"
    >
      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{daysLabel}</span> No credit card required.
      </p>
    </div>
  );
}
