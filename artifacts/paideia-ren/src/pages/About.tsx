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
            About Synops Advisory Group
          </motion.h1>
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.2 }}
            className="text-[20px] text-white/80 leading-relaxed max-w-3xl mx-auto space-y-6"
          >
            <p>
              A complementary partnership spanning healthcare operations and education technology, serving organizations across the United States.
            </p>
            <p>
              We offer both strategic advisory and hands-on build capability. Our model is fully remote, allowing us to deploy exactly the right expertise to your challenges, regardless of geography. We don't just write reports. We implement workflows, build curricula, and architect the platforms necessary to sustain change.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-24 px-6 bg-white">
        <div className="max-w-[1200px] mx-auto space-y-16">
          {/* Bertha */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
            <div className="md:col-span-4">
              <h2 className="text-3xl font-bold text-foreground tracking-tight mb-2">Bertha D. Musoni</h2>
              <p className="text-primary font-semibold text-[16px] mb-4 uppercase tracking-wide">Founder & Principal Consultant</p>
              <div className="text-[13px] font-semibold text-muted-foreground tracking-widest uppercase flex flex-wrap gap-x-3 gap-y-2">
                <span>MPH</span><span>·</span><span>MBA</span><span>·</span><span>PMP</span><span>·</span><span>DBA(c)</span>
              </div>
            </div>
            <div className="md:col-span-8 text-[18px] text-muted-foreground leading-relaxed">
              <p>
                20+ years in managed care, Medicaid program operations, provider network management, and organizational change. Bertha provides oversight of provider relationships up to $1B in annual spend and has led Joint Operation Committees and enterprise process redesign at one of the nation's largest MCOs. She has directed vendor and offshore teams of up to 300 agents, leading NCQA-aligned quality and health-risk-assessment programs.
              </p>
            </div>
          </div>

          <div className="h-px w-full bg-border"></div>

          {/* Belinda */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
            <div className="md:col-span-4">
              <h2 className="text-3xl font-bold text-foreground tracking-tight mb-2">Belinda H. Musoni</h2>
              <p className="text-primary font-semibold text-[16px] mb-4 uppercase tracking-wide">Principal, Learning & AI</p>
              <div className="text-[13px] font-semibold text-muted-foreground tracking-widest uppercase flex flex-wrap gap-x-3 gap-y-2">
                <span>M.Ed</span><span>·</span><span>PhD(c) Machine Learning</span><span>·</span><span>Quality Matters</span>
              </div>
            </div>
            <div className="md:col-span-8 text-[18px] text-muted-foreground leading-relaxed">
              <p>
                A learning scientist and instructional-design leader with 15+ years designing and quality-assuring education across legal, higher-ed, and K-12 domains. As Lead Instructional Designer & Senior QA Specialist she shipped 40+ courses and curricula. Belinda led an AI-integration initiative that trained designers in generative-AI evaluation and prompt engineering, and built custom GPT models. She administers major LMS platforms, applies learning analytics to lift engagement, and enforces Quality Matters, Section 508 and WCAG 2.1 AA standards.
              </p>
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
              <p className="text-[16px] text-muted-foreground leading-relaxed">Evidence-based approaches over trends, whether in clinical operations or educational design.</p>
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
        subtext="Bring us your hardest operational or learning challenge. We advise, then we build."
        buttonLabel="Book a consultation"
        href="/contact"
      />
    </div>
  );
}
