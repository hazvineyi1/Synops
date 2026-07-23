import { useEffect, useState, useCallback } from "react";
import { Redirect } from "wouter";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Database, AlertTriangle, Clock } from "lucide-react";

interface Health {
  status: "operational" | "degraded" | "down";
  db: "up" | "down";
  dbLatencyMs: number | null;
  uptimeSeconds: number;
  requestsTotal: number;
  serverErrorsTotal: number;
  window: { requests: number; errors: number; errorRatePct: number };
}

const TONE: Record<string, string> = {
  operational: "text-green-600",
  degraded: "text-amber-600",
  down: "text-red-600",
};

function uptime(s: number): string {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
}

/** Admin status dashboard (super admin). Polls /api/platform/health. */
export default function AdminHealth() {
  const { user } = useSession();
  const [h, setH] = useState<Health | null>(null);

  const load = useCallback(async () => {
    try { setH(await apiFetch<Health>("/platform/health")); } catch { /* transient */ }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  if (user && user.role !== "super_admin") return <Redirect to="/dashboard" />;

  const Stat = ({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone?: string }) => (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Icon className="h-4 w-4" /> {label}</CardTitle></CardHeader>
      <CardContent><p className={`text-2xl font-bold ${tone ?? "text-foreground"}`}>{value}</p></CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="font-serif text-3xl font-bold text-foreground">System health</h1>
        <p className="mt-1 text-sm text-muted-foreground">Live self-monitoring. Refreshes every 10 seconds.</p>
      </div>
      {!h ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className={`text-lg font-semibold ${TONE[h.status]}`}>
              {h.status === "operational" ? "Operational" : h.status === "degraded" ? "Degraded" : "Down"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat icon={Database} label="Database" value={h.db === "up" ? "Up" : "Down"} tone={h.db === "up" ? "text-green-600" : "text-red-600"} />
            <Stat icon={Activity} label="DB latency" value={h.dbLatencyMs !== null ? `${h.dbLatencyMs} ms` : "n/a"} />
            <Stat icon={Clock} label="Uptime" value={uptime(h.uptimeSeconds)} />
            <Stat icon={AlertTriangle} label="Error rate (1m)" value={`${h.window.errorRatePct}%`} tone={h.window.errorRatePct >= 5 ? "text-amber-600" : "text-foreground"} />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Traffic</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div><p className="text-muted-foreground">Requests (total)</p><p className="font-semibold">{h.requestsTotal.toLocaleString()}</p></div>
              <div><p className="text-muted-foreground">5xx (total)</p><p className="font-semibold">{h.serverErrorsTotal.toLocaleString()}</p></div>
              <div><p className="text-muted-foreground">Requests (1m)</p><p className="font-semibold">{h.window.requests.toLocaleString()}</p></div>
              <div><p className="text-muted-foreground">Errors (1m)</p><p className="font-semibold">{h.window.errors.toLocaleString()}</p></div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
