import React from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { CTASection } from "@/components/layout/CTASection";

export default function About() {
  return (
    <div className="min-h-screen pt-[88px]">
      <section className="bg-primary-hero pt-24 pb-24 px-6 text-center border-b border-primary/20">
        <div className="max-w-[800px] mx-auto">
          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="text-white text-5xl md:text-[64px] font-bold leading-[1.1] tracking-tight mb-8"
          >
            About Synops
          </motion.h1>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.2 }}
            className="text-[20px] text-white/80 leading-relaxed max-w-3xl mx-auto space-y-6"
          >
            <p>
              An operations, delivery, and AI consultancy. We design, build, and run the systems that make organizations work — programs, data, learning, and AI — for clients across the public sector, education, and finance.
            </p>
            <p>
              We don't hand over a slide deck and wish you luck. We build the workflow, ship the course, stand up the platform, and stay until your team can run it without us. Certified project leadership, real operational depth, production results.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-24 px-6 bg-white">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-3xl mb-16">
            <h2 className="text-4xl font-bold text-primary tracking-tight mb-6">Leadership & capabilities</h2>
            <p className="text-[20px] text-muted-foreground leading-relaxed">
              We read as an established capability, not three individuals. Our people are presented by role and credential — the same way our capability statement lists key personnel for public-sector solicitations.
            </p>
          </div>

          <div className="space-y-16">
            {/* Principal Consultant — Operations & Programs */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
              <div className="md:col-span-4">
                <h3 className="text-2xl font-bold text-foreground tracking-tight mb-2">Principal Consultant</h3>
                <p className="text-primary font-semibold text-[16px] mb-4 uppercase tracking-wide">Operations & Programs</p>
                <div className="text-[13px] font-semibold text-muted-foreground tracking-widest uppercase flex flex-wrap gap-x-3 gap-y-2">
                  <span>MPH</span><span>·</span><span>MBA</span><span>·</span><span>PMP</span><span>·</span><span>DBA(c)</span>
                </div>
                <a
                  href="https://www.linkedin.com/in/berthadmusoni/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-primary/70 hover:text-accent transition-colors"
                >
                  LinkedIn profile
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
              <div className="md:col-span-8 text-[18px] text-muted-foreground leading-relaxed">
                <p>
                  20+ years in managed care, Medicaid program operations, provider-network management, and organizational change. Oversight of provider relationships up to $1B in annual spend, leading Joint Operation Committees and enterprise process redesign at one of the nation's largest MCOs. Direction of vendor and offshore teams of up to 300 agents, running NCQA-aligned quality and health-risk-assessment programs.
                </p>
              </div>
            </div>

            <div className="h-px w-full bg-border"></div>

            {/* Principal — Learning Experience & AI Product */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
              <div className="md:col-span-4">
                <h3 className="text-2xl font-bold text-foreground tracking-tight mb-2">Principal</h3>
                <p className="text-primary font-semibold text-[16px] mb-4 uppercase tracking-wide">Learning Experience & AI Product</p>
                <div className="text-[13px] font-semibold text-muted-foreground tracking-widest uppercase flex flex-wrap gap-x-3 gap-y-2">
                  <span>M.Ed</span><span>·</span><span>Ph.D. Machine Learning (in progress)</span><span>·</span><span>Quality Matters</span>
                </div>
                <a
                  href="https://www.linkedin.com/in/belindamusoni/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-primary/70 hover:text-accent transition-colors"
                >
                  LinkedIn profile
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
              <div className="md:col-span-8 text-[18px] text-muted-foreground leading-relaxed">
                <p>
                  A learning scientist and instructional-design leader with 15+ years designing and quality-assuring education across legal, higher-ed, and K-12 domains. As lead instructional designer and senior QA specialist, shipped 40+ courses and curricula. Led an AI-integration initiative that trained designers in generative-AI evaluation and prompt engineering, and built custom GPT models. Administers major LMS platforms, applies learning analytics to lift engagement, and enforces Quality Matters, Section 508 and WCAG 2.1 AA standards.
                </p>
              </div>
            </div>

            <div className="h-px w-full bg-border"></div>

            {/* Consultant — Data, Analytics & Finance Operations */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
              <div className="md:col-span-4">
                <h3 className="text-2xl font-bold text-foreground tracking-tight mb-2">Consultant</h3>
                <p className="text-primary font-semibold text-[16px] mb-4 uppercase tracking-wide">Data, Analytics & Finance Operations</p>
                <div className="text-[13px] font-semibold text-muted-foreground tracking-widest uppercase flex flex-wrap gap-x-3 gap-y-2">
                  <span>Master of Accountancy</span><span>·</span><span>PSM I</span><span>·</span><span>CompTIA CySA+</span><span>·</span><span>Dell Boomi</span><span>·</span><span>QuickBooks ProAdvisor</span>
                </div>
                <a
                  href="https://www.linkedin.com/in/primo-makore/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-primary/70 hover:text-accent transition-colors"
                >
                  LinkedIn profile
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
              <div className="md:col-span-8 text-[18px] text-muted-foreground leading-relaxed">
                <p>
                  Enterprise data and BI, finance and tax operations, systems integration, Agile delivery, and cybersecurity. Builds dashboards and reporting, designs KPIs, integrates systems with Dell Boomi, and modernizes accounting and revenue-cycle workflows — with easy-to-prove ROI in close-cycle time and days-sales-outstanding. Engaged per project.
                </p>
              </div>
            </div>
          </div>

          {/* Trust strip */}
          <div className="mt-20 pt-10 border-t border-border">
            <p className="text-center text-[13px] font-bold uppercase tracking-widest text-muted-foreground mb-6">
              Credentials the firm holds
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[15px] font-semibold text-primary/80">
              {[
                "SWaM Certified (Women/Minority-Owned)",
                "eVA & SAM Registered",
                "PMP",
                "Professional Scrum Master",
                "Quality Matters",
                "WCAG 2.1 / Section 508",
              ].map((t, i) => (
                <React.Fragment key={t}>
                  {i > 0 && <span className="text-border">•</span>}
                  <span>{t}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 px-6 bg-background border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <h2 className="text-4xl font-bold text-primary tracking-tight mb-16">Core Values</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white border border-border p-10 rounded-none">
              <h3 className="text-2xl font-bold text-foreground mb-4">Rigor</h3>
              <p className="text-[16px] text-muted-foreground leading-relaxed">Evidence-based approaches over trends, in learning design and in operations.</p>
            </div>
            <div className="bg-white border border-border p-10 rounded-none">
              <h3 className="text-2xl font-bold text-foreground mb-4">Accountability</h3>
              <p className="text-[16px] text-muted-foreground leading-relaxed">Disciplined project management that guarantees our 98% on-time delivery rate.</p>
            </div>
            <div className="bg-white border border-border p-10 rounded-none">
              <h3 className="text-2xl font-bold text-foreground mb-4">Accessibility</h3>
              <p className="text-[16px] text-muted-foreground leading-relaxed">Systems and content built to be usable by everyone, meeting or exceeding WCAG 2.1 AA standards.</p>
            </div>
            <div className="bg-white border border-border p-10 rounded-none">
              <h3 className="text-2xl font-bold text-foreground mb-4">Measurable Outcomes</h3>
              <p className="text-[16px] text-muted-foreground leading-relaxed">Clear KPIs from day one, tracking engagement lift, cost reduction, or compliance readiness.</p>
            </div>
          </div>
        </div>
      </section>

      <CTASection
        heading="Let's build something that lasts"
        subtext="Bring us your hardest learning or operational challenge. We build, and we advise."
        buttonLabel="Book a consultation"
        href="/contact"
      />
    </div>
  );
}
