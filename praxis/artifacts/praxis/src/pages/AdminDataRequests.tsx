import { useEffect, useState, useCallback } from "react";
import { Redirect } from "wouter";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface DeletionRequest {
  id: string;
  userId: string;
  status: "pending" | "routed" | "done" | "rejected";
  reason: string | null;
  routeToPartner: boolean;
  partnerId: string | null;
  requestedAt: string;
  decidedAt: string | null;
  retentionNote: string | null;
  subject: { email: string; firstName: string | null; lastName: string | null; role: string } | null;
}

const STATUS_TONE: Record<DeletionRequest["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  routed: "bg-blue-100 text-blue-800",
  done: "bg-green-100 text-green-800",
  rejected: "bg-muted text-muted-foreground",
};

/**
 * Super-admin fulfilment screen for POPIA erasure requests. Approve runs the
 * de-identify routine (or routes a partner-org learner to the partner); reject
 * declines with a reason. Every action is logged server-side to the audit trail.
 */
export function AdminDataRequests() {
  const { user } = useSession();
  const { toast } = useToast();
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { requests } = await apiFetch<{ requests: DeletionRequest[] }>("/admin/deletion-requests");
      setRequests(requests);
    } catch {
      toast({ title: "Could not load requests", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Per-page role gate (matches PlatformConsole): only super_admin.
  if (user && user.role !== "super_admin") return <Redirect to="/dashboard" />;

  async function act(id: string, action: "approve" | "reject") {
    const reason = action === "reject" ? window.prompt("Reason for rejecting this request?") ?? "" : undefined;
    if (action === "reject" && !reason) return;
    setBusy(id);
    try {
      const r = await apiFetch<{ status: string; retentionNote?: string }>(
        `/admin/deletion-requests/${id}/${action}`,
        { method: "POST", body: JSON.stringify(reason ? { reason } : {}) },
      );
      toast({
        title: action === "approve" ? `Request ${r.status}` : "Request rejected",
        description: r.retentionNote,
      });
      await load();
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  const name = (r: DeletionRequest) =>
    r.subject ? `${r.subject.firstName ?? ""} ${r.subject.lastName ?? ""}`.trim() || r.subject.email : r.userId.slice(0, 8);

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-8">
      <div>
        <h1 className="font-serif text-3xl font-bold text-foreground">Data deletion requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          POPIA erasure requests. Approving de-identifies the person while retaining legally required
          records. Partner-organisation members are routed to their partner.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No deletion requests.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>
                    {name(r)}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      {r.subject?.email} · {r.subject?.role}
                    </span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[r.status]}`}>
                    {r.status}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  Requested {new Date(r.requestedAt).toLocaleString()}
                  {r.routeToPartner && (
                    <Badge variant="outline" className="ml-2">
                      partner-org: route to partner
                    </Badge>
                  )}
                </p>
                {r.reason && <p className="text-foreground">Reason: {r.reason}</p>}
                {r.retentionNote && (
                  <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">{r.retentionNote}</p>
                )}
                {r.status === "pending" && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => act(r.id, "approve")} disabled={busy === r.id}>
                      {r.routeToPartner ? "Route to partner" : "Approve and erase"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act(r.id, "reject")} disabled={busy === r.id}>
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminDataRequests;
