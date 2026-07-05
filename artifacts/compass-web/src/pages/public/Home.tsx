import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { usePageMeta } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InterestForm } from "@/components/public/InterestForm";

export default function Home() {
  usePageMeta("Synops Consulting Group", "Operations, learning, and technology consulting, from strategy to build.");

  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ProfessionalService",
      "name": "Synops Consulting Group",
      "description": "Operations, learning, and technology consulting, from strategy to build.",
      "areaServed": "US",
      "foundingLocation": "Virginia"
    });
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, []);

  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="bg-primary text-primary-foreground py-24 md:py-32 px-4 relative overflow-hidden">
        <div className="max-w-7xl mx-auto relative z-10 grid gap-8 md:grid-cols-2 items-center">
          <div className="space-y-6">
            <Badge variant="secondary" className="bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 border-none font-medium text-sm px-3 py-1">
              Nationwide Advisory & Build
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-balance">
              Synops Consulting Group
            </h1>
            <p className="text-xl text-primary-foreground/90 max-w-lg leading-relaxed">
              Operations, learning, and technology consulting, from strategy to build.
            </p>
            <p className="text-primary-foreground/80 max-w-xl">
              A single firm uniting healthcare operations leadership and learning/EdTech + AI, bound by disciplined project management and quality assurance.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90" asChild>
                <Link href="/contact">Book a consultation</Link>
              </Button>
              <Button size="lg" variant="outline" className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground hover:text-primary" asChild>
                <Link href="/healthcare">See our services</Link>
              </Button>
            </div>
          </div>
          <div className="hidden md:block">
            {/* Visual element placeholder for hero */}
            <div className="aspect-square rounded-full bg-gradient-to-tr from-accent/20 to-primary-foreground/10 p-8">
              <div className="w-full h-full rounded-full border border-primary-foreground/20 flex items-center justify-center">
                <div className="w-2/3 h-2/3 rounded-full border border-primary-foreground/30 flex items-center justify-center">
                  <div className="w-1/3 h-1/3 rounded-full bg-accent/40 blur-xl"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Outcomes Band */}
      <section className="bg-muted py-12 px-4 border-y border-border">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center divide-y sm:divide-y-0 sm:divide-x divide-border/50">
            <div className="px-4">
              <p className="text-3xl font-bold text-primary mb-2">$1B+</p>
              <p className="text-sm text-muted-foreground">Managed-care provider relationships oversight</p>
            </div>
            <div className="px-4">
              <p className="text-3xl font-bold text-primary mb-2">40+</p>
              <p className="text-sm text-muted-foreground">Courses & curricula developed</p>
            </div>
            <div className="px-4">
              <p className="text-3xl font-bold text-primary mb-2">98%</p>
              <p className="text-sm text-muted-foreground">On-time delivery across projects</p>
            </div>
          </div>
        </div>
      </section>

      {/* Two Practices */}
      <section className="py-24 px-4 bg-background">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-4">
            <h2 className="text-3xl font-bold">Two practices, one standard of rigor</h2>
            <p className="text-muted-foreground">
              Deep domain expertise in healthcare operations and educational technology, delivered with unyielding project management discipline.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Healthcare Card */}
            <Card className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 border-t-4" style={{borderTopColor: "hsl(var(--practice-health))"}}>
              <CardHeader className="pb-4">
                <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-lg" style={{backgroundColor: "hsl(var(--practice-health) / 0.1)", color: "hsl(var(--practice-health))"}}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 9.2a2 2 0 0 0-.28 1.48l.44 2.86a2 2 0 0 0 1.94 1.7h1.72a2 2 0 0 0 1.94-1.7l.44-2.86a2 2 0 0 0-.28-1.48L12 5Z"/></svg>
                </div>
                <CardTitle className="text-2xl">Healthcare & Operations</CardTitle>
                <CardDescription className="text-base pt-2">
                  Driving efficiency, compliance, and quality in managed care and provider networks.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ul className="space-y-3">
                  <li className="flex gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0" style={{color: "hsl(var(--practice-health))"}} />
                    <span>Provider Relations & Network Management</span>
                  </li>
                  <li className="flex gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0" style={{color: "hsl(var(--practice-health))"}} />
                    <span>Managed Care Program Support</span>
                  </li>
                  <li className="flex gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0" style={{color: "hsl(var(--practice-health))"}} />
                    <span>Organizational Change & Workforce Transition</span>
                  </li>
                </ul>
                <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors" asChild>
                  <Link href="/healthcare">Explore Healthcare <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </CardContent>
            </Card>

            {/* Learning Card */}
            <Card className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 border-t-4" style={{borderTopColor: "hsl(var(--practice-learning))"}}>
              <CardHeader className="pb-4">
                <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-lg" style={{backgroundColor: "hsl(var(--practice-learning) / 0.1)", color: "hsl(var(--practice-learning))"}}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="m8 7 3 3-3 3"/></svg>
                </div>
                <CardTitle className="text-2xl">Learning, EdTech & AI</CardTitle>
                <CardDescription className="text-base pt-2">
                  Building rigorous instructional design, adaptive systems, and AI-integrated learning.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ul className="space-y-3">
                  <li className="flex gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0" style={{color: "hsl(var(--practice-learning))"}} />
                    <span>Instructional Design & Curriculum Development</span>
                  </li>
                  <li className="flex gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0" style={{color: "hsl(var(--practice-learning))"}} />
                    <span>AI in Education & Content Evaluation</span>
                  </li>
                  <li className="flex gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0" style={{color: "hsl(var(--practice-learning))"}} />
                    <span>Adaptive & Intelligent Tutoring Systems</span>
                  </li>
                </ul>
                <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors" asChild>
                  <Link href="/learning">Explore Learning <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How We Work */}
      <section className="py-24 px-4 bg-muted/50 border-y border-border">
        <div className="max-w-7xl mx-auto space-y-16">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold">How we work</h2>
            <p className="mt-4 text-muted-foreground">A proven lifecycle applied to both operations redesign and technical implementations.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="space-y-4">
              <div className="text-5xl font-mono text-primary/20 font-bold">01</div>
              <h3 className="text-xl font-semibold">Assess</h3>
              <p className="text-muted-foreground text-sm">We analyze current state constraints, define measurable outcomes, and identify risks before committing resources.</p>
            </div>
            <div className="space-y-4">
              <div className="text-5xl font-mono text-primary/20 font-bold">02</div>
              <h3 className="text-xl font-semibold">Design</h3>
              <p className="text-muted-foreground text-sm">We structure the intervention, whether an organizational workflow, a curriculum, or a platform architecture.</p>
            </div>
            <div className="space-y-4">
              <div className="text-5xl font-mono text-primary/20 font-bold">03</div>
              <h3 className="text-xl font-semibold">Build</h3>
              <p className="text-muted-foreground text-sm">We execute the plan directly. We are practitioners, not just advisors. We build the courses and manage the implementations.</p>
            </div>
            <div className="space-y-4">
              <div className="text-5xl font-mono text-primary/20 font-bold">04</div>
              <h3 className="text-xl font-semibold">Sustain</h3>
              <p className="text-muted-foreground text-sm">We hand off robust documentation, conduct training, and ensure the organization can maintain the new standard.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Credentials Strip */}
      <section className="py-12 bg-primary text-primary-foreground overflow-hidden">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm font-medium tracking-wider uppercase opacity-80">
            <span>MPH</span> • 
            <span>MBA</span> • 
            <span>PMP</span> • 
            <span>DBA(c)</span> • 
            <span>M.Ed</span> • 
            <span>PhD(c) Machine Learning</span> • 
            <span>Quality Matters</span>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-4 bg-background">
        <div className="max-w-3xl mx-auto space-y-12">
          <div className="text-center">
            <h2 className="text-3xl font-bold">Common questions</h2>
          </div>
          <div className="space-y-6">
            <div className="space-y-2">
              <h4 className="text-lg font-semibold">Do you only work with clients in Virginia?</h4>
              <p className="text-muted-foreground">No. We serve clients nationwide across all U.S. time zones. While we have a physical presence in Virginia, our delivery model is fully remote.</p>
            </div>
            <div className="space-y-2">
              <h4 className="text-lg font-semibold">What is your typical engagement model?</h4>
              <p className="text-muted-foreground">We offer both strategic advisory (assessments, audits, planning) and hands-on execution (building courses, managing operations transitions, developing platforms). We structure engagements as distinct projects with clear deliverables and timelines.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Interest Form */}
      <section className="py-24 px-4 bg-muted border-t border-border">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Tell us what you need</h2>
            <p className="text-lg text-muted-foreground">
              Whether you are a school exploring our curriculum platform, a provider streamlining operations, or an organization building new technology, share a few details and our team will follow up.
            </p>
          </div>
          <InterestForm />
        </div>
      </section>

    </div>
  );
}