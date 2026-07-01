import { useState } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { WorkflowForm } from "@/components/WorkflowForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useCatalog } from "@/hooks/use-catalog";
import { GeneratingSpinner } from "@/components/Loading";
import { api, ApiError } from "@/lib/api";
import type { ParentDraft } from "@/lib/types";
import { ClassProfileSelector } from "@/components/ClassProfileSelector";

const TONES = ["warm and positive", "gently concerned", "factual and brief", "celebratory"];

export default function ParentDraftNew() {
  const { teacher } = useAuth();
  const { regions } = useCatalog();
  const [, setLoc] = useLocation();
  const region = regions.find((r) => r.id === teacher?.region);

  const [studentName, setStudentName] = useState("");
  const [yearGroup, setYearGroup] = useState("");
  const [tone, setTone] = useState(TONES[0]);
  const [keyPoints, setKeyPoints] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await api.post<{ draft: ParentDraft }>("/parent-drafts", {
        region: teacher?.region,
        studentName,
        yearGroup: yearGroup || undefined,
        tone,
        keyPoints,
      });
      setLoc(`/parent-drafts/${res.draft.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Generation failed");
      setBusy(false);
    }
  };

  if (busy) return <AppShell><GeneratingSpinner label="Drafting your message" /></AppShell>;

  return (
    <AppShell>
      <WorkflowForm title="New parent update" subtitle="A warm, professional draft you can copy, edit, and send. No student data is sent to AI beyond what you type here.">
        <form onSubmit={submit} className="space-y-5">
          <ClassProfileSelector onSelect={(p) => {
            setYearGroup(p.yearGroup);
          }} />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="student">Student first name</Label>
              <Input id="student" value={studentName} onChange={(e) => setStudentName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Year group (optional)</Label>
              <Select value={yearGroup} onValueChange={setYearGroup}>
                <SelectTrigger><SelectValue placeholder="Pick a year group" /></SelectTrigger>
                <SelectContent>{region?.yearGroups.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="points">What do you want the parent to know?</Label>
            <Textarea id="points" value={keyPoints} onChange={(e) => setKeyPoints(e.target.value)} rows={6} placeholder="Bullet points are fine. Be specific. The draft will only use what you write here." required />
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <Button type="submit" disabled={!studentName || !keyPoints} className="w-full">Draft the message</Button>
        </form>
      </WorkflowForm>
    </AppShell>
  );
}
