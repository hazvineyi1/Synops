import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { useLocation } from "wouter";

const TEACHER_FEATURES = [
  {
    title: "Lesson planner",
    body: "Differentiated lesson plans with starters, main tasks, exit tickets and common misconceptions, ready in under a minute.",
  },
  {
    title: "Worksheet generator",
    body: "Practice sheets with mixed question types and full answer keys, sized to your class and difficulty level.",
  },
  {
    title: "Parent update drafts",
    body: "Warm, professional emails to parents and carers, drafted from a few notes you provide.",
  },
  {
    title: "Quizzes and exit tickets",
    body: "Quick formative checks with multiple choice, short answer and true or false items, graded across difficulty.",
  },
];

export default function Landing() {
  const { teacher, loading } = useAuth();
  const [, setLoc] = useLocation();
  useEffect(() => {
    if (!loading && teacher) setLoc("/dashboard");
  }, [loading, teacher, setLoc]);
  const go = (path: string) => () => setLoc(path);

  return (
    <div className="min-h-screen bg-background">
      <header className="px-8 py-6 border-b bg-card flex items-center justify-between">
        <div>
          <div className="font-serif text-2xl text-primary leading-tight">Synops</div>
          <div className="text-xs tracking-wider uppercase text-muted-foreground">Teacher</div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={go("/login")}>Sign in</Button>
          <Button onClick={go("/signup")}>Create free account</Button>
        </div>
      </header>

      <section className="px-8 py-24 max-w-5xl mx-auto text-center">
        <h1 className="font-serif text-5xl md:text-6xl text-primary leading-tight mb-6">
          Your planning, drafting, and assessment partner.
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
          Built for teachers, lecturers, and trainers across primary, secondary, higher education, adult learning, and vocational training in the US, UK, Europe, Africa, and Asia. Generate lesson plans, worksheets, learner updates, and quizzes that respect your curriculum and your time.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Button size="lg" className="px-8" onClick={go("/signup")}>Start for free</Button>
          <Button size="lg" variant="outline" onClick={go("/login")}>Sign in</Button>
        </div>
        <div className="mt-4">
          <Button size="lg" variant="ghost" className="text-primary underline-offset-4 hover:underline" onClick={go("/samples/public")}>Browse free samples</Button>
        </div>
        <p className="text-xs text-muted-foreground mt-6">No credit card. No student data. English at launch.</p>
      </section>

      <section className="px-8 pb-24 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {TEACHER_FEATURES.map((f) => (
            <div key={f.title} className="bg-card border rounded-lg p-6">
              <h3 className="font-serif text-2xl text-primary mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="px-8 py-8 border-t text-center text-xs text-muted-foreground">
        Synops. A teacher tool. No student personal data is collected.
      </footer>
    </div>
  );
}
