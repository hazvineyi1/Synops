import { useState } from "react";
import { useStudyAuth } from "@/hooks/use-study-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Download, ShieldCheck, Trash2 } from "lucide-react";

/**
 * "Privacy - My data" for the Coach learner (POPIA data-subject controls).
 * Export downloads all of the learner's own data as JSON. Request deletion
 * creates a pending erasure request - never an immediate wipe; an admin reviews
 * and actions it.
 */
export default function StudyDataPrivacy() {
  const { user } = useStudyAuth();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [reason, setReason] = useState("");
  const [requested, setRequested] = useState(false);

  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch("/api/me/data-export", { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `synops-coach-data-${(user?.id ?? "me").slice(0, 8)}.json`;
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
      const res = await fetch("/api/me/deletion-request", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      if (res.status === 409) {
        toast({ title: "Request already in progress", description: "You already have a pending request." });
        setRequested(true);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setRequested(true);
      toast({ title: "Deletion request recorded", description: "An administrator will review and action it." });
    } catch {
      toast({ title: "Could not submit request", description: "Please try again shortly.", variant: "destructive" });
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold text-foreground">Privacy and my data</h1>
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
            A JSON file with your profile, study materials, practice and exams, tutor conversations,
            payments and consent history.
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
            reviews it before your data is erased.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {requested ? (
            <p className="text-sm text-foreground">
              Your deletion request has been recorded. We will action it in line with our
              data-subject request procedure.
            </p>
          ) : (
            <>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional: tell us why (helps us improve)."
                className="min-h-20 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
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
