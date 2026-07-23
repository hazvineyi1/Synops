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
              <div className="inline-block px-3 py-1 bg-accent/20 border border-accent/40 text-white text-sm font-bold tracking-wide uppercase mb-6 rounded-[4px]">
                Education Technology & AI
              </div>
              <h1 className="text-white text-5xl lg:text-[64px] font-bold leading-[1.1] tracking-tight mb-6">
                AI platforms that teach, coach, and certify.
              </h1>
              <p className="text-[20px] lg:text-[24px] text-white/90 leading-relaxed mb-6 font-medium">
                Synops builds the software behind modern learning, for the people who teach, the people who learn, and the teams who design and deliver the curriculum.
              </p>
              <p className="text-[18px] text-white/80 leading-relaxed mb-10 max-w-2xl">
                Our platforms are live with real institutions today, built on rigorous instructional design and a proven record of shipping, with more on the way.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/products"
                  className="bg-accent hover:bg-accent/90 text-white px-8 py-4 font-bold text-[16px] text-center transition-colors rounded-[6px]"
                >
                  Explore the platforms
                </Link>
                <Link
                  href="/contact"
                  className="bg-white/10 hover:bg-white/20 border border-white/30 text-white px-8 py-4 font-bold text-[16px] text-center transition-colors rounded-[6px]"
                >
                  Book a consultation
                </Link>
              </div>
              <p className="text-[14px] text-white/60 mt-6">
                See the products in action, or talk to us about a pilot. No sales script.
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
            Built for regulated, outcomes-driven education
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-[16px] font-semibold text-primary/70">
            <span>Universities</span>
            <span className="text-border">•</span>
            <span>K-12 Districts</span>
            <span className="text-border">•</span>
            <span>EdTech Teams</span>
            <span className="text-border">•</span>
            <span>Training Providers</span>
            <span className="text-border">•</span>
            <span>Health Plans</span>
          </div>
        </div>
      </section>

      {/* Practices */}
      <section className="py-24 lg:py-32 px-6 bg-white">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-3xl mb-16">
            <h2 className="text-4xl lg:text-[48px] font-bold text-primary tracking-tight mb-6">
              One company, built around learning
            </h2>
            <p className="text-[20px] text-muted-foreground leading-relaxed">
              We are an education technology and AI company, backed by two decades of experience running complex healthcare and operations. That experience is why our software is dependable, meets strict compliance requirements, and holds up in tightly regulated settings like schools and health systems.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="border-2 border-accent/30 bg-background p-10 flex flex-col h-full rounded-none">
              <span className="text-[12px] font-bold uppercase tracking-widest text-accent mb-4">Core practice</span>
              <h3 className="text-2xl font-bold text-foreground mb-4">Learning, EdTech & AI</h3>
              <p className="text-[16px] text-muted-foreground mb-8">
                Rigorous instructional design, adaptive systems, and AI-integrated learning, from the classroom to the platform.
              </p>
              <ul className="space-y-4 mb-10 flex-1">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-accent mt-0.5 shrink-0" size={20} />
                  <span className="text-[15px] text-foreground font-medium leading-relaxed">AI Platforms: Teacher, Coach, Curriculum Builder & Praxis</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-accent mt-0.5 shrink-0" size={20} />
                  <span className="text-[15px] text-foreground font-medium leading-relaxed">Instructional Design & Curriculum Development</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-accent mt-0.5 shrink-0" size={20} />
                  <span className="text-[15px] text-foreground font-medium leading-relaxed">Adaptive & Intelligent Tutoring Systems</span>
                </li>
              </ul>
              <Link href="/learning" className="text-accent font-bold text-[16px] flex items-center gap-2 hover:text-primary transition-colors group">
                Explore Learning & AI <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            <div className="border border-border bg-background p-10 flex flex-col h-full rounded-none">
              <span className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Operational backbone</span>
              <h3 className="text-2xl font-bold text-foreground mb-4">Healthcare & Operations</h3>
              <p className="text-[16px] text-muted-foreground mb-8">
                The compliance, managed-care, and change-management experience that grounds how we build and deliver.
              </p>
              <ul className="space-y-4 mb-10 flex-1">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-primary mt-0.5 shrink-0" size={20} />
                  <span className="text-[15px] text-foreground font-medium leading-relaxed">Provider Relations & Network Management</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-primary mt-0.5 shrink-0" size={20} />
                  <span className="text-[15px] text-foreground font-medium leading-relaxed">Managed Care Program Support</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-primary mt-0.5 shrink-0" size={20} />
                  <span className="text-[15px] text-foreground font-medium leading-relaxed">Organizational Change & Workforce Transition</span>
                </li>
              </ul>
              <Link href="/healthcare" className="text-primary font-bold text-[16px] flex items-center gap-2 hover:text-accent transition-colors group">
                Explore Healthcare & Operations <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
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
            <span className="font-bold text-foreground">Bertha D. Musoni</span>
            <span className="text-muted-foreground"> · Founder & Principal Consultant</span>
          </div>
          <Link href="/about" className="text-primary font-bold text-[16px] inline-flex items-center gap-2 hover:text-accent transition-colors group">
            Meet the team <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
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
