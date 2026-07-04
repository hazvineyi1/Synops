import { usePageMeta } from "@/lib/seo";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CurriculumBuilderDemo } from "@/components/public/CurriculumBuilderDemo";
import { Database, MonitorSmartphone, BrainCircuit, Lock } from "lucide-react";

export default function Platforms() {
  usePageMeta(
    "Platforms & SaaS",
    "Custom web apps, AI-powered learning tools, and a hands-on curriculum builder demo with real rules-based quality assurance.",
  );
  return (
    <div className="mx-auto max-w-5xl px-4 py-24 space-y-24">
      <div className="space-y-6 max-w-3xl text-center mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-primary">
          Beyond Advisory: We Build
        </h1>
        <p className="text-xl text-muted-foreground leading-relaxed">
          From adaptive learning platforms to secure operational dashboards, our technical arm translates strategic requirements into working software.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="space-y-1">
            <MonitorSmartphone className="w-8 h-8 text-primary mb-2" />
            <CardTitle>Custom Web Apps</CardTitle>
            <CardDescription>Tailored SaaS solutions for distinct operational needs.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <BrainCircuit className="w-8 h-8 text-primary mb-2" />
            <CardTitle>AI-Powered Learning</CardTitle>
            <CardDescription>Intelligent tutoring systems and specialized internal agents.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <Database className="w-8 h-8 text-primary mb-2" />
            <CardTitle>Operations Dashboards</CardTitle>
            <CardDescription>Real-time reporting and analytics for managed care oversight.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <Lock className="w-8 h-8 text-primary mb-2" />
            <CardTitle>Secure Data Workflows</CardTitle>
            <CardDescription>Engineered with privacy, compliance, and RBAC at the core.</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold">See It In Action</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            A look at what we build. Watch our Curriculum Builder platform carry a course design project through its full lifecycle, then build a course yourself and run a live quality check on it.
          </p>
        </div>

        {/* Curriculum Builder animation */}
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-semibold">Curriculum Builder</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Our curriculum design platform takes instructional teams from intake through design, quality assurance, and handoff. This walkthrough shows the projects dashboard, the standards alignment map, and a QA report where accessibility checks pass before delivery.
            </p>
          </div>
          <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden">
            <video
              className="block w-full h-auto"
              src={`${import.meta.env.BASE_URL}curriculum-builder-animation.mp4`}
              autoPlay
              muted
              loop
              playsInline
              controls
              preload="metadata"
              aria-label="Animated walkthrough of the Curriculum Builder platform, showing the projects dashboard, the standards alignment map, and a QA report with accessibility checks passing."
            />
          </div>
        </div>

        {/* Interactive curriculum builder demo */}
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-semibold">Try the Curriculum Builder</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Build a real course right here. Move from intake through backward design, then run the same rules-based quality check our team uses: measurable outcomes, standards alignment, assessment coverage, and accessibility. Fix what it flags and watch the QA score climb, then export the handoff report.
            </p>
          </div>
          <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden">
            <CurriculumBuilderDemo />
          </div>
        </div>

        <div className="text-center">
          <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90" asChild>
            <Link href="/contact?area=platforms">Request a tailored build</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}