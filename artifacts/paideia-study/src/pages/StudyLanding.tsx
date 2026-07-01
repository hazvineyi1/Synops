import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStudyAuth } from "@/hooks/use-study-auth";
import { useStudyProfile } from "@/hooks/use-study-journey";
import {
  BookOpen, BrainCircuit, Zap, Award, TrendingUp,
  Layers, Sparkles, ArrowRight, Brain, Network, Target,
  Compass, BarChart3, FileText, Image, Link2, Mic, Globe,
  ChevronDown, Star
} from "lucide-react";

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

export default function StudyLanding() {
  const [, setLoc] = useLocation();
  const { user, loading: authLoading } = useStudyAuth();
  // Only query the profile once we know the user is authed, avoids the 401-and-retry noise
  // and means an unauthed visitor never triggers a profile fetch.
  const { data: profile, isLoading: profileLoading } = useStudyProfile(!!user && !authLoading);

  // "Conversation IS the home", authed users with a finished intake land on /coach,
  // not on the marketing page. Incomplete users still see the landing so they can sign in/up.
  const willRedirect = !authLoading && !!user && !!profile?.diagnosticComplete;
  useEffect(() => {
    if (willRedirect) setLoc("/coach");
  }, [willRedirect, setLoc]);

  // Render nothing while we resolve auth + profile for an authed user, so they never see
  // a flash of the marketing hero before bouncing to /coach.
  if (authLoading || (user && (profileLoading || willRedirect))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="px-6 py-4 flex items-center justify-between border-b sticky top-0 bg-background/95 backdrop-blur-sm z-50">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/10 p-1.5 rounded-lg">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight">Synops</span>
            <span className="font-light text-sm text-muted-foreground ml-0.5">Coach</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setLoc("/login")}>Sign In</Button>
          <Button size="sm" onClick={() => setLoc("/signup")}>Get Started</Button>
        </div>
      </header>

      <main>
        <section className="text-center px-6 py-24 max-w-3xl mx-auto relative overflow-hidden">
          <div className="absolute top-[20%] left-[10%] w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-[10%] right-[10%] w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />

          <Badge variant="secondary" className="mb-6 gap-1.5 px-3 py-1 text-xs">
            <Sparkles className="h-3 w-3" />
            AI-Powered Adaptive Learning
          </Badge>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Your Brain's
            <br />
            <span className="bg-gradient-to-r from-primary via-purple-500 to-amber-500 bg-clip-text text-transparent">
              Adaptive Companion
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-xl mx-auto leading-relaxed">
            Upload any material. AI builds your personal knowledge graph,
            adapts to your cognitive style, and guides you along the optimal
            learning path - every single day.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button size="lg" className="gap-2" onClick={() => setLoc("/signup")}>
              <Zap className="h-4 w-4" />
              Start Learning Free
            </Button>
            <Button variant="outline" size="lg" onClick={() => setLoc("/login")}>
              Sign In
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            No credit card. All content types supported. Your data stays private.
          </p>
        </section>

        {/* Content Ingestion */}
        <section className="py-20 px-6 bg-muted/30">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <Badge variant="outline" className="mb-4">Any Content</Badge>
              <h2 className="text-3xl font-bold mb-3">Ingest Everything You Learn From</h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                Paste notes, upload PDFs, drop images, share URLs, record audio -
                our AI processes it all into structured, connected knowledge.
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

        {/* Knowledge Graph Section */}
        <section className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <Badge variant="outline" className="mb-4">Knowledge Graph</Badge>
                <h2 className="text-3xl font-bold mb-3">See How Everything Connects</h2>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  As you add materials, AI extracts concepts and maps relationships
                  between them. See prerequisites, related topics, and extension concepts
                  - creating your personal knowledge web.
                </p>
                <ul className="space-y-3">
                  {[
                    "Auto-extracts concepts from any content",
                    "Maps prerequisite relationships",
                    "Tracks mastery per concept over time",
                    "Suggests connections you might have missed",
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-sm">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                        <Star className="h-3 w-3 text-primary" />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-card border rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Network className="h-5 w-5 text-primary" />
                  <span className="font-semibold text-sm">Your Knowledge Web</span>
                </div>
                <div className="relative h-64 bg-muted/30 rounded-xl overflow-hidden">
                  <svg className="w-full h-full" viewBox="0 0 400 250">
                    <circle cx="200" cy="125" r="25" fill="hsl(var(--primary))" opacity="0.15" />
                    <circle cx="200" cy="125" r="12" fill="hsl(var(--primary))" opacity="0.8" />
                    <text x="200" y="155" textAnchor="middle" className="text-[8px] fill-foreground font-medium">Cell Biology</text>
                    <circle cx="100" cy="80" r="18" fill="#f59e0b" opacity="0.15" />
                    <circle cx="100" cy="80" r="10" fill="#f59e0b" opacity="0.7" />
                    <text x="100" y="105" textAnchor="middle" className="text-[8px] fill-foreground">Organelles</text>
                    <circle cx="300" cy="80" r="18" fill="#10b981" opacity="0.15" />
                    <circle cx="300" cy="80" r="10" fill="#10b981" opacity="0.7" />
                    <text x="300" y="105" textAnchor="middle" className="text-[8px] fill-foreground">Mitosis</text>
                    <circle cx="80" cy="180" r="15" fill="#8b5cf6" opacity="0.15" />
                    <circle cx="80" cy="180" r="8" fill="#8b5cf6" opacity="0.7" />
                    <text x="80" y="200" textAnchor="middle" className="text-[8px] fill-foreground">Membrane</text>
                    <circle cx="320" cy="180" r="15" fill="#ec4899" opacity="0.15" />
                    <circle cx="320" cy="180" r="8" fill="#ec4899" opacity="0.7" />
                    <text x="320" y="200" textAnchor="middle" className="text-[8px] fill-foreground">DNA</text>
                    <circle cx="200" cy="40" r="14" fill="#06b6d4" opacity="0.15" />
                    <circle cx="200" cy="40" r="7" fill="#06b6d4" opacity="0.7" />
                    <text x="200" y="25" textAnchor="middle" className="text-[8px] fill-foreground">Genetics</text>
                    <line x1="188" y1="115" x2="112" y2="88" stroke="hsl(var(--muted-foreground))" strokeWidth="1" opacity="0.3" strokeDasharray="4 2" />
                    <line x1="212" y1="115" x2="288" y2="88" stroke="hsl(var(--muted-foreground))" strokeWidth="1" opacity="0.3" strokeDasharray="4 2" />
                    <line x1="190" y1="135" x2="90" y2="170" stroke="hsl(var(--muted-foreground))" strokeWidth="1" opacity="0.3" />
                    <line x1="210" y1="135" x2="310" y2="170" stroke="hsl(var(--muted-foreground))" strokeWidth="1" opacity="0.3" />
                    <line x1="200" y1="113" x2="200" y2="52" stroke="hsl(var(--muted-foreground))" strokeWidth="1" opacity="0.3" strokeDasharray="4 2" />
                  </svg>
                </div>
                <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                  <span>42 concepts mapped</span>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                    12 new this week
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Adaptive Features */}
        <section className="py-20 px-6 bg-muted/30">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <Badge variant="outline" className="mb-4">Adaptive Intelligence</Badge>
              <h2 className="text-3xl font-bold mb-3">Learns How You Learn</h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                Not everyone learns the same way. Our AI detects your cognitive style,
                attention patterns, and optimal pace - then personalizes everything.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <FeatureCard
                icon={Brain}
                title="Cognitive Profiling"
                description="AI analyzes your response times, accuracy patterns, and engagement to build your unique learning fingerprint."
              />
              <FeatureCard
                icon={Network}
                title="Knowledge Graph"
                description="Every concept you study becomes a node. AI maps prerequisites, related topics, and tracks mastery."
              />
              <FeatureCard
                icon={Compass}
                title="Adaptive Paths"
                description="Your daily study plan is dynamically generated based on gaps, forgetting curves, and energy levels."
              />
              <FeatureCard
                icon={Zap}
                title="Spaced Repetition"
                description="SM-2 algorithm optimized with your personal retention data. Reviews timed to when you'll almost forget."
              />
              <FeatureCard
                icon={Target}
                title="Confidence Calibration"
                description="Practice questions adapt difficulty in real-time. Track metacognition and reduce overconfidence."
              />
              <FeatureCard
                icon={BarChart3}
                title="Deep Analytics"
                description="Weekly AI-generated briefs show your progress, predict performance, and suggest optimal next steps."
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-6">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-3">Ready to Learn Smarter?</h2>
            <p className="text-muted-foreground mb-6">
              Join learners who've replaced cramming with adaptive,
              personalized study that actually sticks.
            </p>
            <Button size="lg" className="gap-2" onClick={() => setLoc("/signup")}>
              <Sparkles className="h-4 w-4" />
              Create Free Account
            </Button>
            <p className="text-xs text-muted-foreground mt-3">
              Free tier includes unlimited materials, flashcards, and practice. Premium unlocks
              advanced analytics, mock exams, and Synops Coach.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 px-6 border-t">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <span className="font-semibold">Synops Coach</span>
          </div>
          <p>Built for learners who want to understand, not just memorize.</p>
        </div>
      </footer>
    </div>
  );
}
