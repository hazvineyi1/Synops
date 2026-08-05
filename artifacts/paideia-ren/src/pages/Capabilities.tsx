import React from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { CTASection } from "@/components/layout/CTASection";

// Capability pillars. Skills-led, name-free positioning (roles + credentials only).
const pillars = [
  {
    title: "Project & Program Management",
    promise: "Stand up the PMO, govern the delivery, manage the change.",
    skills: [
      "PMO stand-up & delivery governance",
      "Change management & stakeholder engagement",
      "Vendor & third-party management",
      "Agile / Scrum delivery (PSM)",
      "Roadmapping, risk & dependency management",
      "Smartsheet, Asana, Jira",
      "98% on-time delivery track record",
    ],
    accent: true,
  },
  {
    title: "Operations & Process Improvement",
    promise: "Redesign the workflow, fix the root cause, hold the quality line.",
    skills: [
      "Workflow & process redesign",
      "Root-cause analysis",
      "SOP development & documentation",
      "Quality assurance & compliance",
      "Vendor & offshore operations management",
      "Organizational change & workforce transition",
      "Managed-care / Medicaid program operations",
    ],
    accent: false,
  },
  {
    title: "Data, Analytics & Automation",
    promise: "Turn scattered data into dashboards and manual work into pipelines.",
    skills: [
      "BI dashboards & reporting",
      "KPI & metric design",
      "ETL & systems integration",
      "Workflow automation",
      "SQL, Power BI, OBIEE, Tableau",
      "Dell Boomi integration",
      "Excel financial modeling",
    ],
    accent: false,
  },
  {
    title: "AI Adoption & Product Build",
    promise: "Ship working AI, responsibly, from strategy to production.",
    skills: [
      "AI adoption strategy",
      "Multi-agent systems & custom GPTs",
      "Rapid AI-assisted builds",
      "Responsible & secure deployment",
      "Evaluation, QA & guardrails",
      "Prompt engineering & model tuning",
    ],
    accent: true,
  },
  {
    title: "Learning & Workforce Enablement",
    promise: "Design the learning, train the people, prove the outcomes.",
    skills: [
      "Instructional design & curriculum development",
      "LMS administration (Canvas, D2L, Blackboard, Moodle)",
      "Training & faculty enablement",
      "Competency frameworks & assessment",
      "Simulations & interactive activities",
      "Accessibility (WCAG 2.1 / 508 / UDL / Quality Matters)",
    ],
    accent: false,
  },
];

const lenses = [
  {
    title: "Public Sector & Program Delivery",
    body: "SWaM-certified, eVA & SAM registered. Management, operations, organizational-development and QA consulting, backed by deep managed-care and Medicaid program experience as past performance.",
  },
  {
    title: "Learning & EdTech",
    body: "AI learning products, course and curriculum development, LMS administration, and delivery across higher-ed and K-12.",
  },
  {
    title: "Finance & Data Operations",
    body: "Accounting and tax modernization, BI and reporting, revenue-cycle and back-office operations, and systems integration.",
  },
];

const trust = [
  "SWaM Certified (Women/Minority-Owned)",
  "eVA & SAM Registered",
  "PMP",
  "Professional Scrum Master",
  "CompTIA CySA+",
  "Dell Boomi",
  "Quality Matters",
  "WCAG 2.1 / Section 508",
];

const leadership = [
  {
    role: "Founder, Operations & Programs",
    creds: "MPH • MBA • PMP • DBA candidate",
    note: "More than 20 years in managed-care and Medicaid program operations, provider-network management, and organizational change.",
  },
  {
    role: "Co-Founder, Learning Experience & AI Product",
    creds: "M.Ed • Ph.D. Machine Learning (in progress)",
    note: "Learning science, instructional design, and AI product development.",
  },
];

export default function Capabilities() {
  return (
    <div className="min-h-screen pt-[88px]">
      {/* Hero */}
      <section className="bg-primary-hero pt-24 pb-24 px-6 border-b border-primary/20">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="block text-[13px] font-bold uppercase tracking-widest text-accent mb-5">
                Capabilities
              </span>
              <h1 className="text-white text-5xl lg:text-[64px] font-bold leading-[1.1] tracking-tight mb-6">
                Operations, delivery, and AI. Built, not just advised.
              </h1>
              <p className="text-[20px] lg:text-[22px] text-white/85 leading-relaxed mb-10 max-w-2xl">
                Synops designs, builds, and runs the systems that make organizations work: programs, data, learning, and AI. Certified project leadership, real operational depth, and production results.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/contact"
                  className="bg-accent hover:bg-accent/90 text-white px-8 py-4 font-bold text-[16px] text-center transition-colors rounded-[6px]"
                >
                  Book a consultation
                </Link>
                <Link
                  href="/products"
                  className="bg-white/10 hover:bg-white/20 border border-white/30 text-white px-8 py-4 font-bold text-[16px] text-center transition-colors rounded-[6px]"
                >
                  See what we build
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="bg-primary py-8 px-6 border-b border-primary/20">
        <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[14px] font-semibold text-white/85">
          {trust.map((t, i) => (
            <React.Fragment key={t}>
              {i > 0 && <span className="text-white/30">•</span>}
              <span>{t}</span>
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* Capability pillars */}
      <section className="py-24 lg:py-32 px-6 bg-white">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-3xl mb-16">
            <h2 className="text-4xl lg:text-[48px] font-bold text-primary tracking-tight mb-6">
              Five capabilities, one operating method
            </h2>
            <p className="text-[20px] text-muted-foreground leading-relaxed">
              We build and run the systems, not just advise. Every engagement runs on the same spine of disciplined program management and AI-enabled automation, applied across whatever the domain demands.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {pillars.map((p) => (
              <div
                key={p.title}
                className={`bg-background p-10 flex flex-col h-full rounded-none ${
                  p.accent ? "border-2 border-accent/30" : "border border-border"
                }`}
              >
                <h3 className="text-2xl font-bold text-foreground mb-3">{p.title}</h3>
                <p className="text-[16px] text-muted-foreground mb-8 leading-relaxed">
                  {p.promise}
                </p>
                <ul className="space-y-4">
                  {p.skills.map((s) => (
                    <li key={s} className="flex items-start gap-3">
                      <CheckCircle2
                        className={`${p.accent ? "text-accent" : "text-primary"} mt-0.5 shrink-0`}
                        size={20}
                      />
                      <span className="text-[15px] text-foreground font-medium leading-relaxed">
                        {s}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Practice lenses: how it shows up */}
      <section className="py-24 lg:py-32 px-6 bg-primary-hero text-white">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-3xl mb-16">
            <span className="block text-[13px] font-bold text-accent uppercase tracking-widest mb-5">
              How it shows up
            </span>
            <h2 className="text-4xl lg:text-[48px] font-bold tracking-tight mb-6">
              Depth where it counts
            </h2>
            <p className="text-[20px] text-white/80 leading-relaxed">
              The same capabilities, proven in the sectors where we have the deepest past performance.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {lenses.map((l) => (
              <div key={l.title} className="bg-white/5 border border-white/10 p-10 flex flex-col">
                <h3 className="text-xl font-bold text-white mb-4">{l.title}</h3>
                <p className="text-[16px] text-white/75 leading-relaxed">{l.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Leadership: founder and co-founder, plus the folded-in delivery package */}
      <section className="py-24 lg:py-32 px-6 bg-white border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-3xl mb-16">
            <h2 className="text-4xl lg:text-[48px] font-bold text-primary tracking-tight mb-6">
              Leadership
            </h2>
            <p className="text-[20px] text-muted-foreground leading-relaxed">
              Synops is led by its founder and co-founder. Our delivery package also covers data and business intelligence, finance and accounting operations, systems integration, and cybersecurity, brought in as each engagement requires.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {leadership.map((m) => (
              <div key={m.role} className="bg-background border border-border p-10 flex flex-col rounded-none">
                <h3 className="text-[20px] font-bold text-foreground mb-4 leading-snug">{m.role}</h3>
                <p className="text-[14px] font-semibold text-primary tracking-wide mb-3">{m.creds}</p>
                <p className="text-[15px] text-muted-foreground leading-relaxed">{m.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        heading="Bring us the system that isn't working"
        subtext="Programs, data, learning, or AI: we build and run it, not just advise. Tell us what needs to work, and we'll show you how we'd deliver it."
        buttonLabel="Book a consultation"
        href="/contact"
      />
    </div>
  );
}
