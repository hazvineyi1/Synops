import React from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { sectors, caseStudies } from "@/data/consulting";
import { PageHero } from "@/components/layout/PageHero";
import { CTASection } from "@/components/layout/CTASection";

// Maps a sector card to the case-study sector labels it should surface.
const sectorCaseMap: Record<string, string[]> = {
  justice: ["Justice & Legal Education"],
  education: ["Higher Education & Credentialing"],
  workforce: ["Workforce & Skills Development"],
  "public-sector": [],
  health: ["Health & Human Services"],
  nonprofit: ["Justice & Legal Education"],
};

export default function Industries() {
  return (
    <div className="min-h-screen pt-[88px]">
      <PageHero
        kicker="Industries"
        title="Regulated, mission-driven, and high-stakes"
        lead="We work where getting it wrong is costly: justice systems, credentialing, public programs, health, and workforce development across the US, the UK and Southern Africa."
        primary={{ label: "Book a consultation", href: "/contact" }}
      />

      <section className="py-20 lg:py-28 px-6 bg-white">
        <div className="max-w-[1200px] mx-auto space-y-0 border-t border-border">
          {sectors.map((s) => {
            const cases = caseStudies.filter((c) => (sectorCaseMap[s.slug] ?? []).includes(c.sector));
            return (
              <div
                key={s.slug}
                id={s.slug}
                className="scroll-mt-[110px] grid grid-cols-1 lg:grid-cols-12 gap-8 py-14 border-b border-border"
              >
                <div className="lg:col-span-5">
                  <h2 className="font-display text-[30px] lg:text-[36px] font-semibold text-primary tracking-tight leading-[1.15] mb-4">
                    {s.title}
                  </h2>
                  <p className="text-[17px] text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
                <div className="lg:col-span-4">
                  <h3 className="text-[13px] font-bold uppercase tracking-[0.16em] text-foreground mb-4">Typical work</h3>
                  <ul className="space-y-3">
                    {s.examples.map((e) => (
                      <li key={e} className="text-[16px] text-foreground leading-relaxed border-l-2 border-accent/50 pl-4">
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="lg:col-span-3">
                  {s.slug === "public-sector" ? (
                    <Link
                      href="/contracting"
                      className="group block bg-primary-hero text-white p-6 hover:bg-primary transition-colors"
                    >
                      <span className="block text-[12px] font-bold uppercase tracking-[0.14em] text-accent mb-2">For buyers</span>
                      <span className="text-[17px] font-bold inline-flex items-center gap-2">
                        Contracting details <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                      </span>
                    </Link>
                  ) : cases.length > 0 ? (
                    <div className="bg-background border border-border p-6">
                      <span className="block text-[12px] font-bold uppercase tracking-[0.14em] text-accent mb-3">Case study</span>
                      {cases.slice(0, 2).map((c) => (
                        <Link
                          key={c.slug}
                          href={`/work#${c.slug}`}
                          className="block text-[15px] font-semibold text-primary hover:text-accent leading-snug mb-3 last:mb-0"
                        >
                          {c.title}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <CTASection
        heading="Working in a sector not listed here?"
        subtext="The methods travel. If your people need to learn, your platform needs to work, or your operation needs AI, we should talk."
        buttonLabel="Get in touch"
        href="/contact"
      />
    </div>
  );
}
