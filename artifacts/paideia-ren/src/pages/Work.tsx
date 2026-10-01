import React from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { caseStudies } from "@/data/consulting";
import { articles } from "@/data/insights";
import { PageHero } from "@/components/layout/PageHero";
import { CTASection } from "@/components/layout/CTASection";

export default function Work() {
  return (
    <div className="min-h-screen pt-[88px]">
      <PageHero
        kicker="Our work"
        title="What we built, and what changed"
        lead="A selection of recent engagements. Client names are withheld unless the client has agreed to be named; details are accurate."
        primary={{ label: "Discuss a project", href: "/contact" }}
      />

      <section className="py-20 lg:py-24 px-6 bg-white">
        <div className="max-w-[1200px] mx-auto">
          {caseStudies.map((c, i) => (
            <article
              key={c.slug}
              id={c.slug}
              className={`scroll-mt-[110px] grid grid-cols-1 lg:grid-cols-12 gap-10 py-14 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <header className="lg:col-span-5">
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-bold uppercase tracking-[0.14em] mb-4">
                  <span className="text-accent">{c.sector}</span>
                  <span className="text-border">/</span>
                  <span className="text-muted-foreground">{c.service}</span>
                </div>
                <h2 className="font-display text-[28px] lg:text-[34px] font-semibold text-primary tracking-tight leading-[1.15] mb-4">
                  {c.title}
                </h2>
                <p className="text-[15px] font-semibold text-foreground/70">{c.client}</p>
                {c.metric && (
                  <div className="mt-8 border-l-4 border-accent pl-5">
                    <div className="font-display text-[48px] font-semibold text-primary leading-none mb-2">{c.metric.value}</div>
                    <div className="text-[14px] text-muted-foreground max-w-[260px] leading-snug">{c.metric.label}</div>
                  </div>
                )}
              </header>

              <div className="lg:col-span-7 space-y-8">
                <div>
                  <h3 className="text-[13px] font-bold uppercase tracking-[0.16em] text-foreground mb-3">The challenge</h3>
                  <p className="text-[17px] text-muted-foreground leading-relaxed">{c.challenge}</p>
                </div>
                <div>
                  <h3 className="text-[13px] font-bold uppercase tracking-[0.16em] text-foreground mb-3">What we did</h3>
                  <ul className="space-y-3">
                    {c.approach.map((a) => (
                      <li key={a} className="text-[16px] text-foreground leading-relaxed border-l-2 border-primary/30 pl-4">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-background border border-border p-6">
                  <h3 className="text-[13px] font-bold uppercase tracking-[0.16em] text-accent mb-2">The result</h3>
                  <p className="text-[17px] text-foreground leading-relaxed">{c.result}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Long-form thinking */}
      <section className="py-20 lg:py-24 px-6 bg-background border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <span className="block text-[13px] font-bold uppercase tracking-[0.18em] text-accent mb-5">Insights</span>
          <h2 className="font-display text-[32px] lg:text-[40px] font-semibold text-primary tracking-tight mb-10">The thinking behind the work</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {articles.map((a) => (
              <Link
                key={a.slug}
                href={`/insights/${a.slug}`}
                className="group bg-white border border-border p-7 flex flex-col hover:border-primary transition-colors"
              >
                <span className="text-[12px] font-bold text-accent uppercase tracking-[0.14em] mb-3">{a.category}</span>
                <h3 className="text-[19px] font-bold text-foreground leading-snug mb-4 flex-1">{a.title}</h3>
                <span className="text-[14px] font-bold text-primary inline-flex items-center gap-2">
                  Read <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        heading="Have a similar problem?"
        subtext="Tell us about it. We will tell you honestly whether we are the right firm for it."
        buttonLabel="Book a consultation"
        href="/contact"
      />
    </div>
  );
}
