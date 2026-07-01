import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";

export function ShareResourceDialog({
  open,
  onOpenChange,
  resourceType,
  resourceId,
  resourceTitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  resourceType: "plan" | "worksheet" | "quiz" | "parent-draft";
  resourceId: string;
  resourceTitle?: string;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function reset() {
    setEmail(""); setMessage(""); setError(null); setDone(null); setBusy(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setDone(null);
    try {
      const res = await api.post<{ recipientExists: boolean }>("/resource-shares", {
        resourceType,
        resourceId,
        toEmail: email,
        message: message || undefined,
      });
      setDone(res.recipientExists
        ? "Sent. They'll see it in their Shared inbox next time they sign in."
        : "Sent. The recipient doesn't have an account yet - they'll see it as soon as they sign up with this email and get approved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not share");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share with another teacher</DialogTitle>
          <DialogDescription>
            {resourceTitle ? `Share "${resourceTitle}".` : "Share this resource."} The recipient gets a copy in their library to use and adapt.
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="text-sm text-primary py-2">{done}</div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="share-email">Teacher email</Label>
              <Input id="share-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@school.edu" required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="share-message">Note (optional)</Label>
              <Textarea id="share-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="A short note for context." />
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Sending..." : "Share"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
