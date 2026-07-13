import React from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, Quote } from "lucide-react";
import { articles } from "@/data/insights";

export default function Home() {
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
              <div className="inline-block px-3 py-1 bg-white/10 border border-white/20 text-white/90 text-sm font-bold tracking-wide uppercase mb-6 rounded-[4px]">
                Nationwide Advisory & Build
              </div>
              <h1 className="text-white text-5xl lg:text-[64px] font-bold leading-[1.1] tracking-tight mb-6">
                Synops Consulting Group
              </h1>
              <p className="text-[20px] lg:text-[24px] text-white/90 leading-relaxed mb-6 font-medium">
                Operations, learning, and technology consulting, from strategy to build.
              </p>
              <p className="text-[18px] text-white/80 leading-relaxed mb-10 max-w-2xl">
                A single firm uniting healthcare operations leadership and learning/EdTech + AI, bound by disciplined project management and quality assurance.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Link 
                  href="/contact" 
                  className="bg-accent hover:bg-accent/90 text-white px-8 py-4 font-bold text-[16px] text-center transition-colors rounded-[6px]"
                >
                  Book a consultation
                </Link>
                <Link 
                  href="/healthcare" 
                  className="bg-white/10 hover:bg-white/20 border border-white/30 text-white px-8 py-4 font-bold text-[16px] text-center transition-colors rounded-[6px]"
                >
                  See our services
                </Link>
              </div>
              <p className="text-[14px] text-white/60 mt-6">
                A 30-minute strategy call. No obligation, no sales script.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Band */}
      <section className="bg-primary border-b border-primary/20 py-12 px-6">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 divide-y md:divide-y-0 md:divide-x divide-white/20">
          <div className="md:px-8 first:pl-0 flex flex-col pt-6 md:pt-0">
            <span className="text-[40px] font-bold text-white mb-2 tracking-tight">$1B+</span>
            <span className="text-[15px] text-white/80 font-medium leading-relaxed">Managed-care provider relationships oversight</span>
          </div>
          <div className="md:px-8 flex flex-col pt-6 md:pt-0">
            <span className="text-[40px] font-bold text-white mb-2 tracking-tight">40+</span>
            <span className="text-[15px] text-white/80 font-medium leading-relaxed">Courses & curricula developed</span>
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
            Trusted across regulated, outcomes-driven sectors
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-[16px] font-semibold text-primary/70">
            <span>Managed-Care Organizations</span>
            <span className="text-border">•</span>
            <span>Health Plans</span>
            <span className="text-border">•</span>
            <span>Higher Education</span>
            <span className="text-border">•</span>
            <span>K-12 Districts</span>
            <span className="text-border">•</span>
            <span>EdTech Teams</span>
          </div>
        </div>
      </section>

      {/* Practices */}
      <section className="py-24 lg:py-32 px-6 bg-white">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-3xl mb-16">
            <h2 className="text-4xl lg:text-[48px] font-bold text-primary tracking-tight mb-6">
              Two practices, one standard of rigor
            </h2>
            <p className="text-[20px] text-muted-foreground leading-relaxed">
              Deep domain expertise in healthcare operations and educational technology, delivered with unyielding project management discipline.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="border border-border bg-background p-10 flex flex-col h-full rounded-none">
              <h3 className="text-2xl font-bold text-foreground mb-4">Healthcare & Operations</h3>
              <p className="text-[16px] text-muted-foreground mb-8">
                Driving efficiency, compliance, and quality in managed care and provider networks.
              </p>
              <ul className="space-y-4 mb-10 flex-1">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-accent mt-0.5 shrink-0" size={20} />
                  <span className="text-[15px] text-foreground font-medium leading-relaxed">Provider Relations & Network Management</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-accent mt-0.5 shrink-0" size={20} />
                  <span className="text-[15px] text-foreground font-medium leading-relaxed">Managed Care Program Support</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-accent mt-0.5 shrink-0" size={20} />
                  <span className="text-[15px] text-foreground font-medium leading-relaxed">Organizational Change & Workforce Transition</span>
                </li>
              </ul>
              <Link href="/healthcare" className="text-primary font-bold text-[16px] flex items-center gap-2 hover:text-accent transition-colors group">
                Explore Healthcare <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            <div className="border border-border bg-background p-10 flex flex-col h-full rounded-none">
              <h3 className="text-2xl font-bold text-foreground mb-4">Learning, EdTech & AI</h3>
              <p className="text-[16px] text-muted-foreground mb-8">
                Building rigorous instructional design, adaptive systems, and AI-integrated learning.
              </p>
              <ul className="space-y-4 mb-10 flex-1">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-accent mt-0.5 shrink-0" size={20} />
                  <span className="text-[15px] text-foreground font-medium leading-relaxed">Instructional Design & Curriculum Development</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-accent mt-0.5 shrink-0" size={20} />
                  <span className="text-[15px] text-foreground font-medium leading-relaxed">AI in Education & Content Evaluation</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-accent mt-0.5 shrink-0" size={20} />
                  <span className="text-[15px] text-foreground font-medium leading-relaxed">Adaptive & Intelligent Tutoring Systems</span>
                </li>
              </ul>
              <Link href="/learning" className="text-primary font-bold text-[16px] flex items-center gap-2 hover:text-accent transition-colors group">
                Explore Learning <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
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

      {/* How we work */}
      <section className="py-24 lg:py-32 px-6 bg-background border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <h2 className="text-4xl lg:text-[48px] font-bold text-primary tracking-tight mb-16">
            How we work
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { num: "01", title: "Assess", copy: "We analyze current state constraints, define measurable outcomes, and identify risks before committing resources." },
              { num: "02", title: "Design", copy: "We structure the intervention, whether an organizational workflow, a curriculum, or a platform architecture." },
              { num: "03", title: "Build", copy: "We execute the plan directly. We are practitioners, not just advisors. We build the courses and manage the implementations." },
              { num: "04", title: "Sustain", copy: "We hand off robust documentation, conduct training, and ensure the organization can maintain the new standard." }
            ].map((step, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-accent font-bold text-xl mb-4">{step.num}</span>
                <div className="h-px bg-border w-full mb-6 relative">
                  <div className="absolute top-0 left-0 h-full w-12 bg-primary"></div>
                </div>
                <h4 className="text-2xl font-bold text-foreground mb-4">{step.title}</h4>
                <p className="text-[16px] text-muted-foreground leading-relaxed">{step.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Principals */}
      <section className="py-24 lg:py-32 px-6 bg-white border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-3xl mb-16">
            <h2 className="text-4xl lg:text-[48px] font-bold text-primary tracking-tight mb-6">
              Led by the people doing the work
            </h2>
            <p className="text-[20px] text-muted-foreground leading-relaxed">
              Synops is a complementary partnership. You work directly with the principals, not a rotating bench of juniors.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            {[
              {
                initials: "BM",
                name: "Bertha D. Musoni",
                role: "Founder & Principal Consultant",
                creds: "MPH · MBA · PMP · DBA(c)",
                bio: "20+ years in managed care, Medicaid operations, and provider network management, with oversight of provider relationships up to $1B in annual spend.",
              },
              {
                initials: "BM",
                name: "Belinda H. Musoni",
                role: "Principal, Learning & AI",
                creds: "M.Ed · PhD(c) ML · Quality Matters",
                bio: "A learning scientist and instructional-design leader who has shipped 40+ courses to WCAG 2.1 AA, with deep work in AI evaluation and adaptive systems.",
              },
            ].map((p) => (
              <div key={p.name} className="flex gap-6 border border-border p-8 bg-background">
                <div className="shrink-0 w-16 h-16 rounded-[6px] bg-primary flex items-center justify-center">
                  <span className="text-white font-bold text-[20px] tracking-tight">{p.initials}</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground tracking-tight">{p.name}</h3>
                  <p className="text-primary font-semibold text-[14px] uppercase tracking-wide mb-1">{p.role}</p>
                  <p className="text-[12px] font-semibold text-muted-foreground tracking-widest uppercase mb-4">{p.creds}</p>
                  <p className="text-[15px] text-muted-foreground leading-relaxed">{p.bio}</p>
                </div>
              </div>
            ))}
          </div>
          <Link href="/about" className="text-primary font-bold text-[16px] inline-flex items-center gap-2 hover:text-accent transition-colors group">
            Read more about the firm <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      {/* Founder conviction */}
      <section className="py-24 lg:py-32 px-6 bg-background border-t border-border">
        <div className="max-w-[860px] mx-auto text-center">
          <Quote className="text-accent mx-auto mb-8" size={40} />
          <blockquote className="text-[26px] lg:text-[32px] font-medium text-foreground leading-[1.4] tracking-tight mb-8">
            "We don't hand over a slide deck and wish you luck. We build the workflow, ship the course, stand up the platform, and stay until your team can run it without us."
          </blockquote>
          <div className="text-[15px]">
            <span className="font-bold text-foreground">Bertha D. Musoni</span>
            <span className="text-muted-foreground"> · Founder & Principal Consultant</span>
          </div>
        </div>
      </section>

      {/* Products Teaser. Products are in private beta: we market them and show what
          they do, but there are deliberately NO links into /app/ or /study/. Both
          CTAs route to /products, where access is gated behind the interest form. */}
      <section className="py-24 lg:py-32 px-6 bg-primary text-white">
        <div className="max-w-[1200px] mx-auto">
          <div className="mb-16">
            <div className="inline-block text-[12px] font-bold uppercase tracking-wider bg-white/10 border border-white/20 px-4 py-1.5 rounded-full mb-6">
              Private beta, by invitation
            </div>
            <h2 className="text-4xl lg:text-[48px] font-bold tracking-tight mb-6">
              Beyond Advisory: We Build
            </h2>
            <p className="text-[20px] text-white/80 max-w-2xl leading-relaxed">
              We translate strategic requirements into working software. Two platforms: one for the
              people who teach, one for the people who learn. Running today with real institutions,
              opening to new partners deliberately.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
          </div>

          <div className="mt-10 text-center">
            <Link href="/products" className="text-[16px] font-bold text-white/80 hover:text-white underline underline-offset-4">
              Try the sampler and register your interest →
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 lg:py-32 px-6 bg-white border-b border-border">
        <div className="max-w-[800px] mx-auto">
          <h2 className="text-3xl lg:text-[40px] font-bold text-primary tracking-tight mb-12 text-center">
            Common questions
          </h2>
          <div className="space-y-8">
            <div className="border border-border p-8 rounded-none">
              <h4 className="text-xl font-bold text-foreground mb-4">Do you only work with clients in Virginia?</h4>
              <p className="text-[16px] text-muted-foreground leading-relaxed">
                No. We serve clients nationwide across all U.S. time zones. While we have a physical presence in Virginia, our delivery model is fully remote.
              </p>
            </div>
            <div className="border border-border p-8 rounded-none">
              <h4 className="text-xl font-bold text-foreground mb-4">What is your typical engagement model?</h4>
              <p className="text-[16px] text-muted-foreground leading-relaxed">
                We offer both strategic advisory (assessments, audits, planning) and hands-on execution (building courses, managing operations transitions, developing platforms). We structure engagements as distinct projects with clear deliverables and timelines.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Strip */}
      <section className="py-24 px-6 bg-background">
        <div className="max-w-[1200px] mx-auto text-center">
          <h2 className="text-4xl font-bold text-primary mb-8 tracking-tight">Ready to begin?</h2>
          <Link 
            href="/contact" 
            className="inline-block bg-accent hover:bg-accent/90 text-white px-10 py-5 font-bold text-[18px] transition-colors rounded-[6px]"
          >
            Book a consultation
          </Link>
          <div className="mt-12 text-[14px] text-muted-foreground font-semibold tracking-widest uppercase flex flex-wrap justify-center gap-x-6 gap-y-3">
            <span>MPH</span>
            <span>·</span>
            <span>MBA</span>
            <span>·</span>
            <span>PMP</span>
            <span>·</span>
            <span>DBA(c)</span>
            <span>·</span>
            <span>M.Ed</span>
            <span>·</span>
            <span>PhD(c) Machine Learning</span>
            <span>·</span>
            <span>Quality Matters</span>
          </div>
        </div>
      </section>
    </div>
  );
}
