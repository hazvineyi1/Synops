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
import type { LessonPlan } from "@/lib/types";
import { Sparkles } from "lucide-react";
import { ClassProfileSelector } from "@/components/ClassProfileSelector";

export default function PlanNew() {
  const { teacher } = useAuth();
  const { regions } = useCatalog();
  const [, setLoc] = useLocation();
  const region = regions.find((r) => r.id === teacher?.region);
  const prefill = usePrefill();

  const [subject, setSubject] = useState("");
  const [yearGroup, setYearGroup] = useState("");
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState(50);
  const [priorKnowledge, setPriorKnowledge] = useState("");
  const [groupContext, setGroupContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ plan: LessonPlan }>("/plans", {
        region: teacher?.region,
        subject,
        yearGroup,
        topic,
        durationMinutes: duration,
        priorKnowledge: priorKnowledge || undefined,
        groupContext: groupContext || undefined,
        studentId: prefill.studentId,
      });
      setLoc(`/plans/${res.plan.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Generation failed");
      setBusy(false);
    }
  };

  if (busy) return <AppShell><GeneratingSpinner label="Planning your lesson" /></AppShell>;

  return (
    <AppShell>
      <WorkflowForm title="New lesson plan" subtitle="A single, focused lesson with three tiers of differentiation.">
        {prefill.studentId && (
          <div className="mb-5 flex items-start gap-3 bg-accent/10 border border-accent/40 rounded-md p-4 text-sm">
            <Sparkles className="h-4 w-4 text-accent mt-0.5 shrink-0" />
            <div>
              Personalising for <span className="font-medium">{prefill.studentName ?? "this student"}</span>. The plan will use their grade history to target weak skills and build on strengths.
            </div>
          </div>
        )}
        <form onSubmit={submit} className="space-y-5">
          <ClassProfileSelector onSelect={(p) => {
            setSubject(p.subject);
            setYearGroup(p.yearGroup);
            if (p.notes) setGroupContext(p.notes);
          }} />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger><SelectValue placeholder="Pick a subject" /></SelectTrigger>
                <SelectContent>
                  {region?.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year group</Label>
              <Select value={yearGroup} onValueChange={setYearGroup}>
                <SelectTrigger><SelectValue placeholder="Pick a year group" /></SelectTrigger>
                <SelectContent>
                  {region?.yearGroups.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="topic">Topic</Label>
            <Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Introduction to photosynthesis" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duration">Lesson duration (minutes)</Label>
            <Input id="duration" type="number" min={15} max={180} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prior">Prior knowledge (optional)</Label>
            <Textarea id="prior" value={priorKnowledge} onChange={(e) => setPriorKnowledge(e.target.value)} placeholder="What students have already covered." rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group">About this class (optional)</Label>
            <Textarea id="group" value={groupContext} onChange={(e) => setGroupContext(e.target.value)} placeholder="Class size, EAL learners, particular needs, anything else useful." rows={2} />
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <Button type="submit" disabled={!subject || !yearGroup || !topic} className="w-full">Generate lesson plan</Button>
        </form>
      </WorkflowForm>
    </AppShell>
  );
}
