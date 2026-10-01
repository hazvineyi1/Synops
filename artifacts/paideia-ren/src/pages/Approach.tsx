import React from "react";
import { method, engagementModels } from "@/data/consulting";
import { PageHero, SectionHead } from "@/components/layout/PageHero";
import { CTASection } from "@/components/layout/CTASection";

const principles = [
  {
    t: "Practice before content",
    b: "We design around the decisions people make on the job. Content is there to serve practice, not the other way round.",
  },
  {
    t: "Evidence over trend",
    b: "Learning science, process data and your regulatory reality decide the design. Not the tool of the month.",
  },
  {
    t: "AI with guardrails",
    b: "AI drafts, sorts and coaches. People decide. Every AI feature we ship has a human checkpoint and an audit trail.",
  },
  {
    t: "Built for real constraints",
    b: "Expensive data, busy experts, small teams, strict privacy law. We design for the conditions you actually have.",
  },
  {
    t: "You own what we build",
    b: "Clear terms on software, content, data and knowledge from day one, written down before the work starts.",
  },
  {
    t: "Accessible by default",
    b: "WCAG 2.1 AA and Section 508 are the floor, not a final-week checklist.",
  },
];

const faqs = [
  {
    q: "Do we have to use your platforms?",
    a: "No. We work in Canvas, D2L, Blackboard, Moodle, Microsoft 365, Google Workspace and whatever else you run. Our own platforms are an option when they are genuinely the better fit.",
  },
  {
    q: "How do you price engagements?",
    a: "Diagnostic sprints and builds are fixed-fee against a written scope. Embedded and managed-platform work is a monthly fee. You see the number before anything starts.",
  },
  {
    q: "Do you work outside the US?",
    a: "Yes. We have active work in the UK and Southern Africa and design for local data law, funding rules and bandwidth.",
  },
  {
    q: "Can you work as a subcontractor on a public bid?",
    a: "Yes. We are a SWaM-certified small business registered on SAM.gov and Virginia eVA, and we welcome teaming requests from primes.",
  },
];

export default function Approach() {
  return (
    <div className="min-h-screen pt-[88px]">
      <PageHero
        kicker="Approach"
        title="Senior people, short cycles, a clean handover"
        lead="You work directly with the principals who scope the engagement. We show working output early and often, and we leave you able to run it."
        primary={{ label: "Book a consultation", href: "/contact" }}
      />

      {/* Method */}
      <section className="py-20 lg:py-28 px-6 bg-white">
        <div className="max-w-[1200px] mx-auto">
          <SectionHead kicker="Method" title="Five stages, every engagement" />
          <ol className="grid grid-cols-1 md:grid-cols-5 gap-px bg-border border border-border">
            {method.map((m, i) => (
              <li key={m.step} className="bg-white p-7 flex flex-col">
                <span className="font-display text-[34px] font-semibold text-accent leading-none mb-5">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="text-[19px] font-bold text-foreground mb-3">{m.step}</h3>
                <p className="text-[15px] text-muted-foreground leading-relaxed">{m.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Engagement models */}
      <section className="py-20 lg:py-28 px-6 bg-background border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <SectionHead
            kicker="Ways to work with us"
            title="Engagement models"
            lead="Pick the one that matches your budget and your appetite for change. Many clients start with a diagnostic and move into a build."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {engagementModels.map((m) => (
              <div key={m.title} className="bg-white border border-border p-8 lg:p-10">
                <div className="flex items-baseline justify-between gap-4 mb-4">
                  <h3 className="font-display text-[26px] font-semibold text-primary">{m.title}</h3>
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-accent whitespace-nowrap">{m.duration}</span>
                </div>
                <p className="text-[16px] text-muted-foreground leading-relaxed mb-6">{m.body}</p>
                <div className="flex flex-wrap gap-2">
                  {m.outputs.map((o) => (
                    <span key={o} className="text-[13px] font-semibold text-primary bg-primary/[0.07] px-3 py-1.5 rounded-[4px]">
                      {o}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="py-20 lg:py-28 px-6 bg-primary-hero text-white">
        <div className="max-w-[1200px] mx-auto">
          <SectionHead kicker="Principles" title="What you can hold us to" light />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12">
            {principles.map((p) => (
              <div key={p.t} className="border-t border-white/20 pt-5">
                <h3 className="text-[19px] font-bold mb-3">{p.t}</h3>
                <p className="text-[15px] text-white/70 leading-relaxed">{p.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 lg:py-28 px-6 bg-white">
        <div className="max-w-[900px] mx-auto">
          <SectionHead kicker="Questions" title="Before you ask" />
          <div className="border-t border-border">
            {faqs.map((f) => (
              <details key={f.q} className="group border-b border-border py-6">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-6 text-[18px] font-bold text-foreground">
                  {f.q}
                  <span className="text-accent text-[24px] leading-none group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="text-[16px] text-muted-foreground leading-relaxed mt-4 pr-10">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        heading="Start with a conversation"
        subtext="Thirty minutes with a principal to talk through your situation. If a diagnostic sprint makes sense, we will send a written scope within a week."
        buttonLabel="Book a consultation"
        href="/contact"
      />
    </div>
  );
}
