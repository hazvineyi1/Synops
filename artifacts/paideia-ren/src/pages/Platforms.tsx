import React from "react";
import { Link } from "wouter";

export default function Platforms() {
  return (
    <div className="min-h-screen pt-[88px]">
      <section className="bg-primary-hero pt-24 pb-24 px-6 border-b border-primary/20">
        <div className="max-w-[1200px] mx-auto text-center">
          <h1 className="text-white text-5xl md:text-[64px] font-bold leading-[1.1] tracking-tight mb-6">
            Beyond Advisory: We Build
          </h1>
          <p className="text-[22px] text-white/80 leading-relaxed mb-8 max-w-3xl mx-auto">
            From adaptive learning platforms to secure operational dashboards, our technical arm translates strategic requirements into working software.
          </p>
          <Link 
            href="/contact?area=platforms" 
            className="inline-block bg-accent hover:bg-accent/90 text-white px-8 py-4 font-bold text-[16px] transition-colors rounded-[6px]"
          >
            Request a tailored build
          </Link>
        </div>
      </section>

      {/* Our Products. Private beta: we show what they are and route to /products
          for the sampler + interest form. No direct links into /app/ or /study/. */}
      <section className="py-24 px-6 bg-white border-b border-border">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16">
            <div className="inline-block text-[12px] font-bold uppercase tracking-wider bg-muted border border-border text-muted-foreground px-4 py-1.5 rounded-full mb-6">
              Private beta, by invitation
            </div>
            <h2 className="text-4xl font-bold text-primary tracking-tight mb-4">Our Products</h2>
            <p className="text-[18px] text-muted-foreground">Purpose-built platforms reflecting our rigorous standards.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-background border border-border p-12 flex flex-col">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-[6px] bg-accent flex items-center justify-center text-white font-bold text-xl">T</div>
                <h3 className="text-3xl font-bold text-foreground tracking-tight">Synops Teacher</h3>
              </div>
              <p className="text-[18px] text-muted-foreground leading-relaxed mb-8 flex-1">
                An AI co-pilot for teachers. Lesson plans, worksheets, quizzes, mark schemes and parent
                communications, drafted against your curriculum. Scales from a single department pilot
                to a whole trust.
              </p>
              <Link href="/products#teacher" className="bg-primary text-white text-center font-bold px-6 py-3 rounded-[6px] hover:bg-primary/90 transition-colors">
                See it in action
              </Link>
            </div>

            <div className="bg-background border border-border p-12 flex flex-col">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-[6px] bg-primary flex items-center justify-center text-white font-bold text-xl">C</div>
                <h3 className="text-3xl font-bold text-foreground tracking-tight">Synops Coach</h3>
              </div>
              <p className="text-[18px] text-muted-foreground leading-relaxed mb-8 flex-1">
                An AI study coach for students. Adaptive study plans, exam practice with honest marking,
                and a Socratic tutor that leads learners to the answer. Scales one-to-one tutoring to a
                whole cohort.
              </p>
              <Link href="/products#coach" className="bg-accent text-white text-center font-bold px-6 py-3 rounded-[6px] hover:bg-accent/90 transition-colors">
                See it in action
              </Link>
            </div>

            <div className="bg-background border border-border p-12 flex flex-col">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-[6px] bg-accent flex items-center justify-center text-white font-bold text-xl">P</div>
                <h3 className="text-3xl font-bold text-foreground tracking-tight">Synops Praxis</h3>
              </div>
              <p className="text-[18px] text-muted-foreground leading-relaxed mb-8 flex-1">
                The learning platform. Enrolled learners take courses, complete interactive activities and
                hand them in, earn credentials, and get support, all under real access control. Scales from
                one cohort to a whole workforce.
              </p>
              <Link href="/products#praxis" className="bg-primary text-white text-center font-bold px-6 py-3 rounded-[6px] hover:bg-primary/90 transition-colors">
                See it in action
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Capability Tiles */}
      <section className="py-24 px-6 bg-background">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white border border-border p-8">
              <h4 className="text-[18px] font-bold text-primary mb-3">Custom Web Apps</h4>
              <p className="text-[15px] text-muted-foreground leading-relaxed">Tailored SaaS solutions for distinct operational needs.</p>
            </div>
            <div className="bg-white border border-border p-8">
              <h4 className="text-[18px] font-bold text-primary mb-3">AI-Powered Learning</h4>
              <p className="text-[15px] text-muted-foreground leading-relaxed">Intelligent tutoring systems and specialized internal agents.</p>
            </div>
            <div className="bg-white border border-border p-8">
              <h4 className="text-[18px] font-bold text-primary mb-3">Operations Dashboards</h4>
              <p className="text-[15px] text-muted-foreground leading-relaxed">Real-time reporting and analytics for managed care oversight.</p>
            </div>
            <div className="bg-white border border-border p-8">
              <h4 className="text-[18px] font-bold text-primary mb-3">Secure Data Workflows</h4>
              <p className="text-[15px] text-muted-foreground leading-relaxed">Engineered with privacy, compliance, and RBAC at the core.</p>
            </div>
          </div>
          
          {/* Curriculum Builder (Compass). Private beta, same treatment as Teacher and
              Coach: we show what it does, but there is NO direct /builder/ link and no
              free trial. Both CTAs route to /products, where access is gated behind the
              interest form. */}
          <div className="mt-16 bg-primary text-white p-12 flex flex-col md:flex-row gap-12 items-center">
            <div className="flex-1">
              <div className="inline-block text-[12px] font-bold uppercase tracking-wider bg-white/10 border border-white/20 px-4 py-1.5 rounded-full mb-6">
                Private beta, by invitation
              </div>
              <h2 className="text-3xl font-bold mb-4 tracking-tight">Curriculum Builder</h2>
              <p className="text-[18px] text-white/80 leading-relaxed mb-6">
                Our curriculum design platform takes instructional teams from intake through design, quality assurance, and handoff.
              </p>
              <div className="flex items-center gap-4 text-[14px] font-bold tracking-widest uppercase text-accent mb-8 flex-wrap">
                <span>Intake</span> <span>&rarr;</span>
                <span>Design</span> <span>&rarr;</span>
                <span>QA</span> <span>&rarr;</span>
                <span>Handoff</span>
              </div>
              <p className="text-[16px] text-white/70 leading-relaxed">
                Rules-based quality checks ensure measurable outcomes, standards alignment, assessment coverage, and accessibility.
              </p>
            </div>
            <div className="shrink-0 flex flex-col gap-3">
              <Link
                href="/products#builder"
                className="inline-block bg-accent text-primary px-8 py-4 font-bold text-[16px] text-center transition-colors hover:bg-accent/90 rounded-[6px]"
              >
                See it in action
              </Link>
              <Link
                href="/contact?area=platforms"
                className="inline-block bg-white text-primary px-8 py-4 font-bold text-[16px] text-center transition-colors hover:bg-white/90 rounded-[6px]"
              >
                Request a tailored build
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
