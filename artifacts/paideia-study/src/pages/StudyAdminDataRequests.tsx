import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useStudyAuth } from "@/hooks/use-study-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface DeletionRequest {
  id: string;
  userId: string;
  status: "pending" | "done" | "rejected";
  reason: string | null;
  requestedAt: string;
  decidedAt: string | null;
  retentionNote: string | null;
  subject: { email: string; name: string } | null;
}

const TONE: Record<DeletionRequest["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  done: "bg-green-100 text-green-800",
  rejected: "bg-muted text-muted-foreground",
};

/**
 * Admin fulfilment screen for POPIA erasure requests (Coach). Approve
 * de-identifies the learner while retaining minimal financial records; reject
 * declines with a reason. Every action is logged to the admin audit trail.
 */
export default function StudyAdminDataRequests() {
  const { user } = useStudyAuth();
  const [, setLoc] = useLocation();
  const { toast } = useToast();
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (user && !user.isAdmin) setLoc("/dashboard");
  }, [user, setLoc]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/deletion-requests", { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { requests: DeletionRequest[] };
      setRequests(data.requests);
    } catch {
      toast({ title: "Could not load requests", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: "approve" | "reject") {
    const reason = action === "reject" ? window.prompt("Reason for rejecting this request?") ?? "" : undefined;
    if (action === "reject" && !reason) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/deletion-requests/${id}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reason ? { reason } : {}),
      });
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as { status: string; retentionNote?: string };
      toast({ title: `Request ${r.status}`, description: r.retentionNote });
      await load();
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Data deletion requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          POPIA erasure requests from learners. Approving de-identifies the learner while retaining
          minimal financial records.
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
                    {r.subject?.name || r.userId.slice(0, 8)}{" "}
                    <span className="text-sm font-normal text-muted-foreground">{r.subject?.email}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[r.status]}`}>{r.status}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">Requested {new Date(r.requestedAt).toLocaleString()}</p>
                {r.reason && <p className="text-foreground">Reason: {r.reason}</p>}
                {r.retentionNote && (
                  <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">{r.retentionNote}</p>
                )}
                {r.status === "pending" && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => act(r.id, "approve")} disabled={busy === r.id}>
                      Approve and erase
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
