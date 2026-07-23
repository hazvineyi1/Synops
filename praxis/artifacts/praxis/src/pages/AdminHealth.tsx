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

interface Anomaly {
  id: string;
  kind: string;
  severity: "warning" | "critical";
  title: string;
  detail: string;
  firstSeenAt: string;
  lastSeenAt: string;
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
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);

  const load = useCallback(async () => {
    try { setH(await apiFetch<Health>("/platform/health")); } catch { /* transient */ }
    try { setAnomalies(await apiFetch<Anomaly[]>("/platform/ops/anomalies")); } catch { /* transient */ }
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4" /> Ops agent
                <span className="text-xs font-normal text-muted-foreground">flags anomalies automatically, every minute</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {anomalies.length === 0 ? (
                <p className="text-sm text-green-600">No anomalies. All signals nominal.</p>
              ) : (
                <ul className="space-y-2">
                  {anomalies.map((a) => (
                    <li key={a.id} className="flex items-start gap-2 rounded-md border border-border p-3">
                      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${a.severity === "critical" ? "bg-red-500" : "bg-amber-500"}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{a.title}
                          <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${a.severity === "critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{a.severity}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">{a.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
