import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

/**
 * 2FA enrolment gate for admin roles. Rendered in place of the app when the
 * signed-in user's role requires two-factor auth but they have not enabled it.
 * It never locks them out: the Security page (where enrolment happens) stays
 * reachable, and the rest of the console is blocked until 2FA is on. After
 * enrolling, mfaSetupRequired clears on the next /auth/me and the app renders.
 */
export function MfaGate() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <h1 className="font-serif text-2xl font-bold text-foreground">Two-factor authentication required</h1>
        </div>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          Your role has access to other people's data and account controls, so two-factor
          authentication is required before you can continue. Set it up now with an authenticator
          app - it takes about a minute. You will not be signed out.
        </p>
        <Button asChild className="w-full">
          <Link href="/security">Set up two-factor authentication</Link>
        </Button>
      </div>
    </div>
  );
}

export default MfaGate;
