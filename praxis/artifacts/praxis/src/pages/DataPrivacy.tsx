import { useState } from "react";
import { API, apiFetch } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Download, ShieldCheck, Trash2 } from "lucide-react";

/**
 * "Privacy - My data" (POPIA data-subject controls for the signed-in user).
 * Export downloads all of the user's own data as JSON. Request deletion creates
 * a pending erasure request - never an immediate wipe; an administrator reviews
 * it, and requests from partner-organisation members are routed to the partner.
 */
export function DataPrivacy() {
  const { user } = useSession();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [reason, setReason] = useState("");
  const [requested, setRequested] = useState(false);

  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch(`${API}/me/data-export`, { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `synops-praxis-data-${(user?.id ?? "me").slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", description: "Please try again shortly.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  async function requestDeletion() {
    setRequesting(true);
    try {
      const r = await apiFetch<{ message: string; routeToPartner: boolean }>("/me/deletion-request", {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      setRequested(true);
      toast({ title: "Deletion request recorded", description: r.message });
    } catch (e) {
      const msg = e instanceof Error && e.message.includes("409") ? "You already have a request in progress." : "Please try again shortly.";
      toast({ title: "Could not submit request", description: msg, variant: "destructive" });
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="font-serif text-3xl font-bold text-foreground">Privacy and my data</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        You control your personal information. Download a copy of everything we hold about you, or ask
        us to erase it.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Download className="h-4 w-4" /> Export my data
          </CardTitle>
          <CardDescription>
            A JSON file with your profile, enrolments, submissions, grades, coaching interactions and
            consent history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={exportData} disabled={exporting}>
            {exporting ? "Preparing..." : "Download my data"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trash2 className="h-4 w-4" /> Request deletion
          </CardTitle>
          <CardDescription>
            This does not delete your account immediately. We record your request and an administrator
            reviews it. If you belong to a partner organisation, your request is routed to them, as
            they are responsible for your data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {requested ? (
            <p className="text-sm text-foreground">
              Your deletion request has been recorded. We will action it in line with our data-subject
              request procedure.
            </p>
          ) : (
            <>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional: tell us why (helps us improve)."
                className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              />
              <Button variant="destructive" onClick={requestDeletion} disabled={requesting}>
                {requesting ? "Submitting..." : "Request deletion of my data"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default DataPrivacy;
