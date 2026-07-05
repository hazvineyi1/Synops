// US-focused Coach landing. Shown when a visitor arrives from the marketing site
// (synops-consulting.com) — the US-facing Synops Consulting brand. Direct visitors get
// the default StudyLanding instead. This page is standalone and safe to edit: the
// copy lives in plain JSX below, and the US_EXAMS list drives the exam chips.
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStudyAuth } from "@/hooks/use-study-auth";
import { useStudyProfile } from "@/hooks/use-study-journey";
import {
  Brain, Sparkles, Zap, Network, Compass, Target, BarChart3,
  FileText, Image, Link2, Mic, Globe, Star, GraduationCap, ShieldCheck,
} from "lucide-react";

// Edit this list to change the exam chips shown to US visitors.
const US_EXAMS = [
  "SAT", "ACT", "AP Exams", "GRE", "GMAT", "LSAT",
  "MCAT", "USMLE", "NCLEX", "CPA", "Bar Exam", "College Coursework",
];

function FeatureCard({ icon: Icon, title, description }: { icon: typeof Brain; title: string; description: string }) {
  return (
    <div className="group p-6 rounded-2xl border bg-card hover:shadow-lg transition-all duration-300">
      <Icon className="h-8 w-8 text-primary mb-3" />
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function ContentTypeCard({ icon: Icon, label }: { icon: typeof FileText; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 p-4 rounded-xl border bg-card hover:border-primary/30 transition-colors cursor-pointer">
      <Icon className="h-6 w-6 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default function StudyLandingUS() {
  const [, setLoc] = useLocation();
  const { user, loading: authLoading } = useStudyAuth();
  const { data: profile, isLoading: profileLoading } = useStudyProfile(!!user && !authLoading);

  const willRedirect = !authLoading && !!user && !!profile?.diagnosticComplete;
  useEffect(() => {
    if (willRedirect) setLoc("/coach");
  }, [willRedirect, setLoc]);

  if (authLoading || (user && (profileLoading || willRedirect))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="px-6 py-4 flex items-center justify-between border-b sticky top-0 bg-background/95 backdrop-blur-sm z-50">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/10 p-1.5 rounded-lg"><Brain className="h-5 w-5 text-primary" /></div>
          <div>
            <span className="font-bold text-sm tracking-tight">Synops</span>
            <span className="font-light text-sm text-muted-foreground ml-0.5">Coach</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setLoc("/login?next=/admin")}>Admin</Button>
          <Button variant="ghost" size="sm" onClick={() => setLoc("/login")}>Sign In</Button>
          <Button size="sm" onClick={() => setLoc("/signup")}>Get Started</Button>
        </div>
      </header>

      <main>
        {/* Hero — US framing */}
        <section className="text-center px-6 py-24 max-w-3xl mx-auto relative overflow-hidden">
          <div className="absolute top-[20%] left-[10%] w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-[10%] right-[10%] w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />

          <Badge variant="secondary" className="mb-6 gap-1.5 px-3 py-1 text-xs">
            <GraduationCap className="h-3 w-3" />
            Built for U.S. students &amp; professionals
          </Badge>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Ace the exams that
            <br />
            <span className="bg-gradient-to-r from-primary via-purple-500 to-amber-500 bg-clip-text text-transparent">
              shape your future
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-xl mx-auto leading-relaxed">
            An AI study coach for the SAT, MCAT, bar, CPA, NCLEX, and your college
            coursework. Upload your materials and it builds a personalized plan that
            adapts to how you learn — so you study less and score higher.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button size="lg" className="gap-2" onClick={() => setLoc("/signup")}>
              <Zap className="h-4 w-4" /> Start Free
            </Button>
            <Button variant="outline" size="lg" onClick={() => setLoc("/login")}>Sign In</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            No credit card required. Free plan included. Your data stays private.
          </p>

          {/* Exam chips */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-10">
            {US_EXAMS.map((e) => (
              <span key={e} className="text-xs px-3 py-1 rounded-full border bg-card text-muted-foreground">{e}</span>
            ))}
          </div>
        </section>

        {/* Content ingestion */}
        <section className="py-20 px-6 bg-muted/30">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <Badge variant="outline" className="mb-4">Any Material</Badge>
              <h2 className="text-3xl font-bold mb-3">Turn your prep materials into a plan</h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                Drop in your textbooks, class notes, practice tests, lecture recordings, or
                review-course PDFs — the AI organizes it into connected, exam-ready knowledge.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 max-w-3xl mx-auto">
              <ContentTypeCard icon={FileText} label="PDF & Docs" />
              <ContentTypeCard icon={Image} label="Images" />
              <ContentTypeCard icon={Link2} label="Web URLs" />
              <ContentTypeCard icon={Mic} label="Audio & Video" />
              <ContentTypeCard icon={Globe} label="Pasted Text" />
            </div>
          </div>
        </section>

        {/* Adaptive features */}
        <section className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <Badge variant="outline" className="mb-4">Adaptive Intelligence</Badge>
              <h2 className="text-3xl font-bold mb-3">Studies you, so it can teach you</h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                The coach learns your strengths, gaps, and pace, then builds a daily plan
                that targets exactly what will move your score.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <FeatureCard icon={Brain} title="Cognitive Profiling" description="Analyzes your accuracy and timing to build a learning fingerprint unique to you." />
              <FeatureCard icon={Network} title="Knowledge Graph" description="Maps every concept and its prerequisites so you never build on a shaky foundation." />
              <FeatureCard icon={Compass} title="Adaptive Study Plans" description="A fresh daily plan driven by your gaps, forgetting curves, and test date." />
              <FeatureCard icon={Zap} title="Spaced Repetition" description="Reviews timed to the moment right before you'd forget — proven to boost retention." />
              <FeatureCard icon={Target} title="Realistic Practice" description="Question difficulty adapts in real time, with full-length mock exams to build stamina." />
              <FeatureCard icon={BarChart3} title="Score Insights" description="Weekly briefs predict your readiness and tell you exactly what to do next." />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-6 bg-muted/30">
          <div className="max-w-2xl mx-auto text-center">
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
              <ShieldCheck className="h-4 w-4 text-primary" /> Private by design · Cancel anytime
            </div>
            <h2 className="text-3xl font-bold mb-3">Start studying smarter today</h2>
            <p className="text-muted-foreground mb-6">
              Join students and professionals across the U.S. who traded cramming for a
              plan that actually sticks.
            </p>
            <Button size="lg" className="gap-2" onClick={() => setLoc("/signup")}>
              <Sparkles className="h-4 w-4" /> Create Free Account
            </Button>
            <p className="text-xs text-muted-foreground mt-3">
              Free plan includes unlimited materials, flashcards, and practice. Premium adds
              mock exams, deep analytics, and 1:1 Synops Coach sessions.
            </p>
          </div>
        </section>
      </main>

      <footer className="py-8 px-6 border-t">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <span className="font-semibold">Synops Coach</span>
          </div>
          <div className="flex items-center gap-2">
            {[Star, Star, Star, Star, Star].map((S, i) => <S key={i} className="h-3 w-3 text-amber-500 fill-amber-500" />)}
            <span>Trusted by U.S. learners</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
