import { useEffect, useState } from "react";
import { API } from "@/lib/api";
import { AlertTriangle } from "lucide-react";

/**
 * Shows a banner when the API is in read-only maintenance mode. Polls the cheap,
 * rate-limit-exempt /version endpoint (which reports `maintenance`) so the whole
 * app surfaces the state without threading it through every request.
 */
export function MaintenanceBanner() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        const res = await fetch(`${API}/version`, { credentials: "include" });
        if (!res.ok) return;
        const v = (await res.json()) as { maintenance?: boolean };
        if (alive) setOn(!!v.maintenance);
      } catch {
        /* ignore - transient */
      }
    }
    void check();
    const t = setInterval(check, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!on) return null;
  return (
    <div className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-amber-950">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      Synops is in scheduled maintenance and is temporarily read-only. Your data is safe; changes are
      paused for a short while.
    </div>
  );
}

export default MaintenanceBanner;
