import React from "react";
import { Link } from "wouter";
import { ArrowRight, Check } from "lucide-react";
import { services, caseStudies } from "@/data/consulting";
import { PageHero } from "@/components/layout/PageHero";
import { CTASection } from "@/components/layout/CTASection";

export default function Services() {
  return (
    <div className="min-h-screen pt-[88px]">
      <PageHero
        kicker="Services"
        title="Learning, AI and operations, delivered end to end"
        lead="Four service lines that share one discipline: understand the real work, design from evidence, build it properly, and hand it over in a state your team can run."
        primary={{ label: "Book a consultation", href: "/contact" }}
        secondary={{ label: "See our work", href: "/work" }}
      />

      {/* Jump nav */}
      <nav className="sticky top-[88px] z-30 bg-white/95 backdrop-blur border-b border-border px-6">
        <div className="max-w-[1200px] mx-auto flex gap-6 lg:gap-10 overflow-x-auto py-4 text-[14px] font-semibold">
          {services.map((s) => (
            <a key={s.slug} href={`#${s.slug}`} className="whitespace-nowrap text-muted-foreground hover:text-accent transition-colors">
              <span className="text-accent mr-1.5">{s.num}</span>
              {s.title}
            </a>
          ))}
        </div>
      </nav>

      {services.map((s, i) => {
        const related = caseStudies.filter((c) => c.service === s.title);
        return (
          <section
            key={s.slug}
            id={s.slug}
            className={`scroll-mt-[150px] py-20 lg:py-28 px-6 ${i % 2 === 0 ? "bg-white" : "bg-background"} border-b border-border`}
          >
            <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-5">
                <span className="font-display text-[22px] text-accent font-semibold">{s.num}</span>
                <h2 className="font-display text-[34px] lg:text-[42px] font-semibold text-primary tracking-tight leading-[1.1] mt-3 mb-6">
                  {s.title}
                </h2>
                <p className="text-[18px] text-foreground/85 leading-relaxed mb-8">{s.promise}</p>
                <p className="text-[13px] font-semibold text-muted-foreground leading-relaxed">{s.tools}</p>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-10">
                <div>
                  <h3 className="text-[13px] font-bold uppercase tracking-[0.16em] text-foreground mb-5">You might be facing</h3>
                  <ul className="space-y-4">
                    {s.problems.map((p) => (
                      <li key={p} className="text-[16px] text-muted-foreground leading-relaxed border-l-2 border-accent/50 pl-4">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-[13px] font-bold uppercase tracking-[0.16em] text-foreground mb-5">What we deliver</h3>
                  <ul className="space-y-3">
                    {s.deliverables.map((d) => (
                      <li key={d} className="flex items-start gap-3 text-[16px] text-foreground leading-relaxed">
                        <Check size={18} className="text-primary mt-1 shrink-0" />
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>

                {related.length > 0 && (
                  <div className="md:col-span-2 border-t border-border pt-6">
                    <h3 className="text-[13px] font-bold uppercase tracking-[0.16em] text-foreground mb-4">Related work</h3>
                    <div className="flex flex-col gap-3">
                      {related.map((c) => (
                        <Link
                          key={c.slug}
                          href={`/work#${c.slug}`}
                          className="group text-[16px] font-semibold text-primary hover:text-accent inline-flex items-center gap-2"
                        >
                          {c.title}
                          <ArrowRight size={16} className="shrink-0 group-hover:translate-x-1 transition-transform" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      })}

      <CTASection
        heading="Not sure which service fits?"
        subtext="Most problems cross more than one line. Tell us what is not working and we will scope the right mix."
        buttonLabel="Book a consultation"
        href="/contact"
      />
    </div>
  );
}
