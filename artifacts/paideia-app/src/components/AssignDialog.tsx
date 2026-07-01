import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { api, ApiError } from "@/lib/api";
import type { ClassRow, Assignment } from "@/lib/types";
import { Link as LinkIcon, Users, Check, Copy } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  resourceKind: "worksheet" | "quiz";
  resourceId: string;
  resourceTitle: string;
}

export function AssignDialog({ open, onClose, resourceKind, resourceId, resourceTitle }: Props) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"share_link" | "accounts">("share_link");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Assignment | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setError(null);
    void api.get<{ classes: ClassRow[] }>("/classes").then((r) => {
      setClasses(r.classes);
      if (r.classes[0] && !classId) setClassId(r.classes[0].id);
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!classId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ assignment: Assignment }>("/assignments", {
        classId,
        resourceKind,
        resourceId,
        deliveryMode,
      });
      setCreated(res.assignment);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to assign");
    } finally {
      setBusy(false);
    }
  };

  const shareUrl = created ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/take/${created.shareCode}` : "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        {!created ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl text-primary">Assign to a class</DialogTitle>
              <DialogDescription>{resourceTitle}</DialogDescription>
            </DialogHeader>
            {classes.length === 0 ? (
              <div className="space-y-3 py-4">
                <p className="text-sm text-muted-foreground">You have not created a class list yet.</p>
                <Link href="/classes" className="text-primary text-sm underline">Create your first class</Link>
              </div>
            ) : (
              <div className="space-y-5 py-2">
                <div className="space-y-2">
                  <Label>Class</Label>
                  <Select value={classId} onValueChange={setClassId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name} ({c.yearGroup})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>How should students access this?</Label>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => setDeliveryMode("share_link")}
                      className={`text-left border rounded-md p-3 transition ${deliveryMode === "share_link" ? "border-primary bg-primary/5" : "hover:border-primary/40"}`}
                    >
                      <div className="flex items-center gap-2 font-medium"><LinkIcon className="h-4 w-4" />Share link</div>
                      <div className="text-xs text-muted-foreground mt-1">No login. Students open the link, pick their name from the class roster, and complete the work. Scores get attached to the student.</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryMode("accounts")}
                      className={`text-left border rounded-md p-3 transition ${deliveryMode === "accounts" ? "border-primary bg-primary/5" : "hover:border-primary/40"}`}
                    >
                      <div className="flex items-center gap-2 font-medium"><Users className="h-4 w-4" />Student accounts</div>
                      <div className="text-xs text-muted-foreground mt-1">Students log in to their own account and see this in their dashboard. Only students you have set up with a password can take it.</div>
                    </button>
                  </div>
                </div>
                {error && <div className="text-sm text-destructive">{error}</div>}
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              {classes.length > 0 && (
                <Button onClick={submit} disabled={busy || !classId}>{busy ? "Publishing..." : "Publish assignment"}</Button>
              )}
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl text-primary">Published</DialogTitle>
              <DialogDescription>{created.title}</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {created.deliveryMode === "share_link" ? (
                <>
                  <p className="text-sm">Share this link with students. They will pick their name and complete the work.</p>
                  <div className="flex items-center gap-2 bg-secondary border rounded-md p-3">
                    <code className="text-xs flex-1 truncate">{shareUrl}</code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    >
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm">Students in this class can now see this assignment when they sign in.</p>
              )}
              <Link href={`/classes/${created.classId}`} className="text-primary text-sm underline">View class and submissions</Link>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
