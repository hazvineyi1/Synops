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
import { usePrefill } from "@/hooks/use-prefill";
import { GeneratingSpinner } from "@/components/Loading";
import { api, ApiError } from "@/lib/api";
import type { Quiz } from "@/lib/types";
import { FileText } from "lucide-react";
import { ClassProfileSelector } from "@/components/ClassProfileSelector";

const FORMATS = ["exit ticket", "starter quiz", "mid-unit check", "end-of-unit assessment"];

export default function QuizNew() {
  const { teacher } = useAuth();
  const { regions } = useCatalog();
  const [, setLoc] = useLocation();
  const region = regions.find((r) => r.id === teacher?.region);
  const prefill = usePrefill();

  const [subject, setSubject] = useState(prefill.subject ?? "");
  const [yearGroup, setYearGroup] = useState(prefill.yearGroup ?? "");
  const [topic, setTopic] = useState(prefill.topic ?? "");
  const [format, setFormat] = useState(FORMATS[0]);
  const [questionCount, setQuestionCount] = useState(5);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await api.post<{ quiz: Quiz }>("/quizzes", {
        region: teacher?.region, subject, yearGroup, topic, format, questionCount,
        notes: notes || undefined,
      });
      setLoc(`/quizzes/${res.quiz.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Generation failed");
      setBusy(false);
    }
  };

  if (busy) return <AppShell><GeneratingSpinner label="Building your quiz" /></AppShell>;

  return (
    <AppShell>
      <WorkflowForm title="New quiz or exit ticket" subtitle="Short formative check, mixed difficulty.">
        {prefill.fromPlanId && (
          <div className="mb-5 flex items-start gap-3 bg-secondary/60 border rounded-md p-4 text-sm">
            <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              Based on your lesson plan{prefill.fromPlanTitle ? <>: <span className="font-medium">{prefill.fromPlanTitle}</span></> : null}. Subject, year group, and topic are pre-filled.
            </div>
          </div>
        )}
        <form onSubmit={submit} className="space-y-5">
          <ClassProfileSelector onSelect={(p) => {
            setSubject(p.subject);
            setYearGroup(p.yearGroup);
            if (p.notes) setNotes(p.notes);
          }} />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger><SelectValue placeholder="Pick a subject" /></SelectTrigger>
                <SelectContent>{region?.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year group</Label>
              <Select value={yearGroup} onValueChange={setYearGroup}>
                <SelectTrigger><SelectValue placeholder="Pick a year group" /></SelectTrigger>
                <SelectContent>{region?.yearGroups.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="topic">Topic</Label>
            <Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FORMATS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="count">Number of items</Label>
              <Input id="count" type="number" min={3} max={20} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <Button type="submit" disabled={!subject || !yearGroup || !topic} className="w-full">Generate</Button>
        </form>
      </WorkflowForm>
    </AppShell>
  );
}
