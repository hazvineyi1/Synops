import { useEffect, useState } from "react";
import { API } from "@/lib/api";

interface Status { status: "operational" | "degraded" | "down"; db: "up" | "down"; uptimeSeconds: number; maintenance: boolean }

const TONE: Record<string, { dot: string; label: string }> = {
  operational: { dot: "bg-green-500", label: "All systems operational" },
  degraded: { dot: "bg-amber-500", label: "Degraded performance" },
  down: { dot: "bg-red-500", label: "Service disruption" },
};

function uptime(s: number): string {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

/** Public, unauthenticated status page (route /status). Polls /api/status. */
export function PublicStatus() {
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch(`${API}/status`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as Status;
        if (alive) { setS(data); setErr(false); }
      } catch {
        if (alive) setErr(true);
      }
    };
    void check();
    const t = setInterval(check, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const overall = err || !s ? "down" : s.maintenance ? "degraded" : s.status;
  const tone = TONE[overall];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mb-4 flex items-center justify-center gap-3">
          <span className={`h-3 w-3 rounded-full ${tone.dot}`} />
          <h1 className="text-xl font-semibold text-foreground">
            {s?.maintenance ? "Scheduled maintenance" : tone.label}
          </h1>
        </div>
        {err || !s ? (
          <p className="text-sm text-muted-foreground">We could not reach the service. Retrying...</p>
        ) : (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Database</dt><dd className="font-medium text-foreground">{s.db === "up" ? "Reachable" : "Unreachable"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Uptime</dt><dd className="font-medium text-foreground">{uptime(s.uptimeSeconds)}</dd></div>
          </dl>
        )}
        <p className="mt-6 text-xs text-muted-foreground">Synops platform status. This page refreshes automatically.</p>
      </div>
    </div>
  );
}

export default PublicStatus;
