import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { LessonPlan } from "@/lib/types";
import { LessonPlanView } from "@/components/Renderers";
import { Printer, Trash2, ClipboardList, HelpCircle, Share2, Eye, EyeOff } from "lucide-react";
import { Link } from "wouter";
import { ShareResourceDialog } from "@/components/ShareResourceDialog";

export default function PlanView() {
  const [, params] = useRoute<{ id: string }>("/plans/:id");
  const [, setLoc] = useLocation();
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [studentView, setStudentView] = useState(false);

  useEffect(() => {
    if (!params?.id) return;
    void api.get<{ plan: LessonPlan }>(`/plans/${params.id}`)
      .then((r) => setPlan(r.plan))
      .finally(() => setLoading(false));
  }, [params?.id]);

  const onDelete = async () => {
    if (!plan) return;
    if (!confirm("Delete this lesson plan?")) return;
    await api.del(`/plans/${plan.id}`);
    setLoc("/dashboard");
  };

  if (loading) return <AppShell><p className="text-muted-foreground">Loading.</p></AppShell>;
  if (!plan) return <AppShell><p>Plan not found.</p></AppShell>;

  return (
    <AppShell>
      <header className="mb-8 flex items-start justify-between gap-4 no-print">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Lesson plan · {plan.subject} · {plan.yearGroup} · {plan.durationMinutes} min{studentView ? " · student view" : ""}
          </div>
          <h1 className="font-serif text-4xl text-primary">{plan.title}</h1>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant={studentView ? "default" : "outline"} size="sm" aria-pressed={studentView} aria-label={studentView ? "Currently in student view, switch to teacher view" : "Currently in teacher view, switch to student view"} onClick={() => setStudentView((v) => !v)}>
            {studentView ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            {studentView ? "Teacher view" : "Student view"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}><Share2 className="h-4 w-4 mr-1" />Share</Button>
          <Button variant="ghost" size="sm" onClick={onDelete}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>
        </div>
      </header>
      <ShareResourceDialog open={shareOpen} onOpenChange={setShareOpen} resourceType="plan" resourceId={plan.id} resourceTitle={plan.title} />
      <div className="bg-card border rounded-lg p-8 print-page">
        <LessonPlanView c={plan.content} studentView={studentView} />
      </div>
      <section className="mt-8 bg-secondary/40 border rounded-lg p-6 no-print">
        <h2 className="font-serif text-xl text-primary mb-1">Carry this into your next resource</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Subject, year group, and topic are pre-filled so you can keep working in one flow.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/worksheets/new?${buildQuery(plan)}`}>
            <Button variant="outline"><ClipboardList className="h-4 w-4 mr-2" />Make a matching worksheet</Button>
          </Link>
          <Link href={`/quizzes/new?${buildQuery(plan)}`}>
            <Button variant="outline"><HelpCircle className="h-4 w-4 mr-2" />Make an exit ticket or quiz</Button>
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

function buildQuery(plan: { subject: string; yearGroup: string; topic: string; id: string; title: string }) {
  const p = new URLSearchParams({
    subject: plan.subject,
    yearGroup: plan.yearGroup,
    topic: plan.topic,
    fromPlanId: plan.id,
    fromPlanTitle: plan.title,
  });
  return p.toString();
}
