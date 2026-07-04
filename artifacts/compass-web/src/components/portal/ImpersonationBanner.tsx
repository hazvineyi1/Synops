import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

/**
 * Persistent banner shown whenever the current session is an impersonation.
 * Mounted at the app root so it is visible on every surface the impersonated
 * user can reach, including non-Compass products. The Stop control restores the
 * real super administrator's session.
 */
export function ImpersonationBanner() {
  const { user, impersonator, stopImpersonating } = useAuth();
  const [stopping, setStopping] = useState(false);

  if (!user || !impersonator) return null;

  async function stop() {
    setStopping(true);
    try {
      await stopImpersonating();
    } finally {
      setStopping(false);
    }
  }

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-700 bg-amber-400 px-4 py-2 text-center text-sm text-amber-950"
    >
      <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-semibold">Impersonating {user.name}</span> ({user.email}).
        Actions are recorded against {impersonator.name}.
      </span>
      <button
        type="button"
        onClick={stop}
        disabled={stopping}
        className="rounded-md bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-900 disabled:opacity-60"
      >
        {stopping ? "Stopping..." : "Stop impersonating"}
      </button>
    </div>
  );
}
