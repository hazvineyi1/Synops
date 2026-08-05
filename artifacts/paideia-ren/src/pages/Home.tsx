import React from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, Quote } from "lucide-react";
import { articles } from "@/data/insights";

export default function Home() {
  // Trimmed home: hero, stats, practices, outcomes, platforms teaser, founder quote, one CTA.
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-primary-hero pt-32 pb-24 lg:pt-48 lg:pb-32 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-block px-3 py-1 bg-accent/20 border border-accent/40 text-white text-sm font-bold tracking-wide uppercase mb-6 rounded-[4px]">
                Operations · Delivery · AI
              </div>
              <h1 className="text-white text-5xl lg:text-[64px] font-bold leading-[1.1] tracking-tight mb-6">
                Operations, delivery, and AI. Built, not just advised.
              </h1>
              <p className="text-[20px] lg:text-[24px] text-white/90 leading-relaxed mb-6 font-medium">
                Synops designs, builds, and runs the systems that make organizations work: programs, data, learning, and AI.
              </p>
              <p className="text-[18px] text-white/80 leading-relaxed mb-10 max-w-2xl">
                Certified project leadership, real operational depth, and production results, not slideware. Live platforms and delivered engagements prove we build what we recommend.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/contact"
                  className="bg-accent hover:bg-accent/90 text-white px-8 py-4 font-bold text-[16px] text-center transition-colors rounded-[6px]"
                >
                  Book a consultation
                </Link>
                <Link
                  href="/capabilities"
                  className="bg-white/10 hover:bg-white/20 border border-white/30 text-white px-8 py-4 font-bold text-[16px] text-center transition-colors rounded-[6px]"
                >
                  See our capabilities
                </Link>
              </div>
              <p className="text-[14px] text-white/60 mt-6">
                Tell us the system that isn't working. No sales script.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Band */}
      <section className="bg-primary border-b border-primary/20 py-12 px-6">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 divide-y md:divide-y-0 md:divide-x divide-white/20">
          <div className="md:px-8 first:pl-0 flex flex-col pt-6 md:pt-0">
            <span className="text-[40px] font-bold text-white mb-2 tracking-tight">4</span>
            <span className="text-[15px] text-white/80 font-medium leading-relaxed">AI platforms live with real institutions</span>
          </div>
          <div className="md:px-8 flex flex-col pt-6 md:pt-0">
            <span className="text-[40px] font-bold text-white mb-2 tracking-tight">40+</span>
            <span className="text-[15px] text-white/80 font-medium leading-relaxed">Courses & curricula shipped to WCAG 2.1 AA</span>
          </div>
          <div className="md:px-8 flex flex-col pt-6 md:pt-0">
            <span className="text-[40px] font-bold text-white mb-2 tracking-tight">98%</span>
            <span className="text-[15px] text-white/80 font-medium leading-relaxed">On-time delivery across projects</span>
          </div>
        </div>
      </section>

      {/* Trusted by / engagement context */}
      <section className="bg-white py-14 px-6 border-b border-border">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-center text-[13px] font-bold uppercase tracking-widest text-muted-foreground mb-8">
            Built for regulated, outcomes-driven organizations
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-[16px] font-semibold text-primary/70">
            <span>Public Sector</span>
            <span className="text-border">•</span>
            <span>Universities & K-12</span>
            <span className="text-border">•</span>
            <span>EdTech Teams</span>
            <span className="text-border">•</span>
            <span>Finance & Data Operations</span>
            <span className="text-border">•</span>
            <span>Health Plans</span>
          </div>
        </div>
      </section>

      {/* Capability pillars */}
      <section className="py-24 lg:py-32 px-6 bg-white">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-3xl mb-16">
            <h2 className="text-4xl lg:text-[48px] font-bold text-primary tracking-tight mb-6">
              We build and run the systems, not just advise
            </h2>
            <p className="text-[20px] text-muted-foreground leading-relaxed">
              Five capabilities, unified by one operating method: disciplined program management and AI-enabled automation, applied across programs, data, learning, and delivery. Two decades of running complex, regulated operations is why the work holds up.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "Project & Program Management", desc: "Stand up the PMO, govern the delivery, manage the change." },
              { title: "Operations & Process Improvement", desc: "Redesign the workflow, fix the root cause, hold the quality line." },
              { title: "Data, Analytics & Automation", desc: "Turn scattered data into dashboards and manual work into pipelines." },
              { title: "AI Adoption & Product Build", desc: "Ship working AI, responsibly, from strategy to production." },
              { title: "Learning & Workforce Enablement", desc: "Design the learning, train the people, prove the outcomes." },
            ].map((p) => (
              <Link
                key={p.title}
                href="/capabilities"
                className="group border border-border bg-background p-8 flex flex-col rounded-none hover:border-accent/40 transition-colors"
              >
                <h3 className="text-[20px] font-bold text-foreground mb-3 leading-snug">{p.title}</h3>
                <p className="text-[15px] text-muted-foreground leading-relaxed flex-1 mb-6">{p.desc}</p>
                <span className="text-accent font-bold text-[14px] flex items-center gap-2">
                  Explore <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </span>
              </Link>
            ))}
            <div className="border-2 border-accent/30 bg-primary-hero text-white p-8 flex flex-col rounded-none justify-between">
              <div>
                <h3 className="text-[20px] font-bold mb-3 leading-snug">Certified & set-aside eligible</h3>
                <p className="text-[15px] text-white/80 leading-relaxed">
                  SWaM Certified · eVA & SAM Registered · PMP · Professional Scrum Master · Quality Matters · WCAG 2.1 / 508.
                </p>
              </div>
              <Link href="/capabilities" className="text-white font-bold text-[14px] flex items-center gap-2 mt-6 group">
                See all capabilities <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Selected outcomes */}
      <section className="py-24 lg:py-32 px-6 bg-primary-hero text-white">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-3xl mb-16">
            <span className="block text-[13px] font-bold text-accent uppercase tracking-widest mb-5">Selected outcomes</span>
            <h2 className="text-4xl lg:text-[48px] font-bold tracking-tight mb-6">
              Results, not just recommendations
            </h2>
            <p className="text-[20px] text-white/80 leading-relaxed">
              We measure engagements by what changes after we leave. A sample of the work, with the thinking behind it.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {articles.filter((a) => a.outcome).map((a) => (
              <Link
                key={a.slug}
                href={`/insights/${a.slug}`}
                className="group flex flex-col bg-white/5 border border-white/10 p-10 hover:bg-white/10 transition-colors"
              >
                <span className="text-[13px] font-bold text-accent uppercase tracking-widest mb-6">{a.category}</span>
                <div className="flex items-baseline gap-3 mb-6">
                  <span className="text-[56px] font-bold text-white leading-none tracking-tight">{a.outcome!.metric}</span>
                  <span className="text-[15px] text-white/70 max-w-[180px] leading-snug">{a.outcome!.label}</span>
                </div>
                <p className="text-[17px] text-white/80 leading-relaxed flex-1 mb-8">{a.summary}</p>
                <span className="text-white font-bold text-[15px] flex items-center gap-2">
                  Read the approach <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Founder conviction */}
      <section className="py-24 lg:py-32 px-6 bg-white border-t border-border">
        <div className="max-w-[860px] mx-auto text-center">
          <Quote className="text-accent mx-auto mb-8" size={40} />
          <blockquote className="text-[26px] lg:text-[32px] font-medium text-foreground leading-[1.4] tracking-tight mb-8">
            "We don't hand over a slide deck and wish you luck. We build the workflow, ship the course, stand up the platform, and stay until your team can run it without us."
          </blockquote>
          <div className="text-[15px] mb-8">
            <span className="font-bold text-foreground">The Synops Principals</span>
            <span className="text-muted-foreground"> · Operations, Learning & AI</span>
          </div>
          <Link href="/about" className="text-primary font-bold text-[16px] inline-flex items-center gap-2 hover:text-accent transition-colors group">
            About the firm <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      {/* Products Teaser. Products are in private beta: we market them and show what
          they do, but there are deliberately NO links into /app/ or /study/. Both
          CTAs route to /products, where access is gated behind the interest form. */}
      <section className="py-24 lg:py-32 px-6 bg-primary text-white">
        <div className="max-w-[1200px] mx-auto">
          <div className="mb-16">
            <div className="inline-block text-[12px] font-bold uppercase tracking-wider bg-accent/20 border border-accent/40 px-4 py-1.5 rounded-full mb-6">
              The platforms · private beta
            </div>
            <h2 className="text-4xl lg:text-[48px] font-bold tracking-tight mb-6">
              One connected learning stack
            </h2>
            <p className="text-[20px] text-white/80 max-w-2xl leading-relaxed">
              Four platforms that work together: one for the people who teach, one for the people who
              learn, one for the teams who design the curriculum itself, and one that delivers it all to
              enrolled learners. Running today with real institutions, opening to new partners deliberately.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white/5 border border-white/10 p-10 flex flex-col rounded-none hover:bg-white/10 transition-colors">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-[6px] bg-accent flex items-center justify-center">
                  <span className="font-bold text-white text-lg">T</span>
                </div>
                <h3 className="text-2xl font-bold">Synops Teacher</h3>
              </div>
              <p className="text-[16px] text-white/70 mb-4 leading-relaxed">
                An AI co-pilot for teachers. Lesson plans, worksheets, quizzes, mark schemes and parent
                updates, drafted against your curriculum in minutes, not evenings.
              </p>
              <p className="text-[15px] text-white/50 mb-8 flex-1 leading-relaxed">
                Scales from a single department pilot to a whole trust.
              </p>
              <Link
                href="/products#teacher"
                className="bg-white text-primary px-6 py-3 font-bold rounded-[6px] text-center hover:bg-white/90 transition-colors"
              >
                See it in action
              </Link>
            </div>

            <div className="bg-white/5 border border-white/10 p-10 flex flex-col rounded-none hover:bg-white/10 transition-colors">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-[6px] bg-primary-hero border border-white/20 flex items-center justify-center">
                  <span className="font-bold text-white text-lg">C</span>
                </div>
                <h3 className="text-2xl font-bold">Synops Coach</h3>
              </div>
              <p className="text-[16px] text-white/70 mb-4 leading-relaxed">
                An AI study coach for learners. Adaptive study plans, exam practice with honest marking,
                and a Socratic tutor that refuses to simply hand over the answer.
              </p>
              <p className="text-[15px] text-white/50 mb-8 flex-1 leading-relaxed">
                The first thing that makes one-to-one tutoring scale to a whole cohort.
              </p>
              <Link
                href="/products#coach"
                className="bg-white text-primary px-6 py-3 font-bold rounded-[6px] text-center hover:bg-white/90 transition-colors"
              >
                See it in action
              </Link>
            </div>

            <div className="bg-white/5 border border-white/10 p-10 flex flex-col rounded-none hover:bg-white/10 transition-colors">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-[6px] bg-primary-hero border border-white/20 flex items-center justify-center">
                  <span className="font-bold text-white text-lg">B</span>
                </div>
                <h3 className="text-2xl font-bold">Curriculum Builder</h3>
              </div>
              <p className="text-[16px] text-white/70 mb-4 leading-relaxed">
                A curriculum design platform. Intake through design, quality assurance and handoff,
                with objectives, assessments and activities held in a live alignment map.
              </p>
              <p className="text-[15px] text-white/50 mb-8 flex-1 leading-relaxed">
                Accreditation evidence as a by-product of designing the course properly.
              </p>
              <Link
                href="/products#builder"
                className="bg-white text-primary px-6 py-3 font-bold rounded-[6px] text-center hover:bg-white/90 transition-colors"
              >
                See it in action
              </Link>
            </div>

            <div className="bg-white/5 border border-white/10 p-10 flex flex-col rounded-none hover:bg-white/10 transition-colors">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-[6px] bg-accent flex items-center justify-center">
                  <span className="font-bold text-white text-lg">P</span>
                </div>
                <h3 className="text-2xl font-bold">Synops Praxis</h3>
              </div>
              <p className="text-[16px] text-white/70 mb-4 leading-relaxed">
                The learning platform. Enrolled learners take courses, complete interactive activities and
                hand them in, earn credentials, and get help from a built-in support desk.
              </p>
              <p className="text-[15px] text-white/50 mb-8 flex-1 leading-relaxed">
                Live and enrolment-gated, scaling from one cohort to a whole workforce.
              </p>
              <Link
                href="/products#praxis"
                className="bg-white text-primary px-6 py-3 font-bold rounded-[6px] text-center hover:bg-white/90 transition-colors"
              >
                See it in action
              </Link>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link href="/products" className="text-[16px] font-bold text-white/80 hover:text-white underline underline-offset-4">
              Try the sampler and register your interest →
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Strip */}
      <section className="py-24 px-6 bg-background border-t border-border">
        <div className="max-w-[1200px] mx-auto text-center">
          <h2 className="text-4xl font-bold text-primary mb-8 tracking-tight">Ready to begin?</h2>
          <Link
            href="/contact"
            className="inline-block bg-accent hover:bg-accent/90 text-white px-10 py-5 font-bold text-[18px] transition-colors rounded-[6px]"
          >
            Book a consultation
          </Link>
        </div>
      </section>
    </div>
  );
}
