import React from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Quote } from "lucide-react";
import { services, sectors, caseStudies, engagementModels, credentials } from "@/data/consulting";
import { SectionHead, CredentialStrip } from "@/components/layout/PageHero";

// Consulting-first home: who we help, the four service lines, proof from real
// engagements, how we engage, and the platforms we bring as accelerators.
export default function Home() {
  const featured = caseStudies.slice(0, 3);

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-primary-hero pt-36 pb-24 lg:pt-48 lg:pb-32 px-6">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-end">
          <motion.div
            className="lg:col-span-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="block text-[13px] font-bold uppercase tracking-[0.18em] text-accent mb-7">
              Learning · AI · Operations consulting
            </span>
            <h1 className="font-display text-white text-[44px] sm:text-[56px] lg:text-[72px] font-semibold leading-[1.04] tracking-tight mb-8">
              We design it, build it, and stay until it runs.
            </h1>
            <p className="text-[19px] lg:text-[22px] text-white/85 leading-relaxed max-w-2xl mb-10">
              Synops helps organizations train their people, modernize how learning is delivered, and put AI to
              work in day-to-day operations. The strategy is included. So is the build.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/contact"
                className="bg-accent hover:bg-accent/90 text-white px-8 py-4 font-bold text-[16px] text-center transition-colors rounded-[6px]"
              >
                Book a consultation
              </Link>
              <Link
                href="/work"
                className="border border-white/30 hover:bg-white/10 text-white px-8 py-4 font-bold text-[16px] text-center transition-colors rounded-[6px]"
              >
                See our work
              </Link>
            </div>
          </motion.div>

          <motion.div
            className="lg:col-span-4 border-l border-white/15 pl-8 space-y-7"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {[
              { v: "15+", l: "years in instructional design and EdTech" },
              { v: "20+", l: "years running regulated operations" },
              { v: "98%", l: "on-time delivery across engagements" },
            ].map((s) => (
              <div key={s.v}>
                <div className="font-display text-[40px] font-semibold text-white leading-none mb-1">{s.v}</div>
                <div className="text-[14px] text-white/65 leading-snug">{s.l}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Credentials */}
      <section className="bg-white border-b border-border py-8 px-6">
        <div className="max-w-[1200px] mx-auto">
          <CredentialStrip items={credentials} />
        </div>
      </section>

      {/* What clients bring us */}
      <section className="py-24 lg:py-28 px-6 bg-background">
        <div className="max-w-[1200px] mx-auto">
          <SectionHead
            kicker="Where we help"
            title="What clients usually bring us"
            lead="Most engagements start with one of these. If yours sounds familiar, we have probably solved a version of it."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border border border-border">
            {[
              { q: "Our training does not change how people work.", s: "learning" },
              { q: "Our LMS is underused, outdated, or the wrong fit.", s: "platforms" },
              { q: "We know AI could save us hours. We do not know where to start.", s: "ai" },
              { q: "The program is slipping and nobody owns the whole picture.", s: "operations" },
            ].map((item) => {
              const svc = services.find((x) => x.slug === item.s)!;
              return (
                <Link
                  key={item.q}
                  href={`/services#${svc.slug}`}
                  className="group bg-white p-8 lg:p-10 flex flex-col hover:bg-background transition-colors"
                >
                  <p className="font-display text-[22px] lg:text-[24px] text-foreground leading-snug mb-6">
                    "{item.q}"
                  </p>
                  <span className="mt-auto text-[14px] font-bold text-accent flex items-center gap-2">
                    {svc.title}
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-24 lg:py-28 px-6 bg-white border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <SectionHead
            kicker="Services"
            title="Four service lines, one way of working"
            lead="Learning and AI are where we lead. Operations and program management are why the work holds up."
          />
          <div className="border-t border-border">
            {services.map((s) => (
              <Link
                key={s.slug}
                href={`/services#${s.slug}`}
                className="group grid grid-cols-12 gap-4 lg:gap-8 py-8 lg:py-10 border-b border-border items-baseline"
              >
                <span className="col-span-2 lg:col-span-1 font-display text-[20px] text-accent font-semibold">{s.num}</span>
                <h3 className="col-span-10 lg:col-span-4 font-display text-[26px] lg:text-[30px] font-semibold text-primary leading-tight group-hover:text-accent transition-colors">
                  {s.title}
                </h3>
                <p className="col-span-12 lg:col-span-6 lg:col-start-6 text-[17px] text-muted-foreground leading-relaxed">
                  {s.short}
                </p>
                <ArrowRight
                  size={22}
                  className="hidden lg:block col-span-1 justify-self-end text-primary group-hover:text-accent group-hover:translate-x-1 transition-all"
                />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Selected work */}
      <section className="py-24 lg:py-28 px-6 bg-primary-hero text-white">
        <div className="max-w-[1200px] mx-auto">
          <SectionHead
            kicker="Selected work"
            title="Recent engagements"
            lead="Real problems, what we built, and what changed. Client names are withheld unless they have agreed to be named."
            light
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {featured.map((c) => (
              <Link
                key={c.slug}
                href={`/work#${c.slug}`}
                className="group flex flex-col bg-white/[0.04] border border-white/10 p-8 hover:bg-white/[0.08] transition-colors"
              >
                <span className="text-[12px] font-bold text-accent uppercase tracking-[0.16em] mb-4">{c.sector}</span>
                <h3 className="font-display text-[23px] font-semibold leading-snug mb-4">{c.title}</h3>
                <p className="text-[15px] text-white/70 leading-relaxed flex-1 mb-6">{c.client}. {c.result}</p>
                <span className="text-[14px] font-bold flex items-center gap-2">
                  Read the case <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-10">
            <Link href="/work" className="text-[16px] font-bold text-white/85 hover:text-white inline-flex items-center gap-2">
              All case studies <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* Sectors */}
      <section className="py-24 lg:py-28 px-6 bg-white">
        <div className="max-w-[1200px] mx-auto">
          <SectionHead
            kicker="Industries"
            title="Sectors where we have done the work"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-10">
            {sectors.map((s) => (
              <Link key={s.slug} href={`/industries#${s.slug}`} className="group border-t-2 border-primary pt-5">
                <h3 className="text-[19px] font-bold text-foreground mb-2 group-hover:text-accent transition-colors">{s.title}</h3>
                <p className="text-[15px] text-muted-foreground leading-relaxed">{s.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How we engage */}
      <section className="py-24 lg:py-28 px-6 bg-background border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <SectionHead
            kicker="How we engage"
            title="Start small, or hand us the whole thing"
            lead="Every engagement has a fixed scope, a named lead, and a clear handover."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {engagementModels.map((m) => (
              <div key={m.title} className="bg-white border border-border p-7 flex flex-col">
                <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-accent mb-3">{m.duration}</span>
                <h3 className="text-[20px] font-bold text-foreground mb-3">{m.title}</h3>
                <p className="text-[15px] text-muted-foreground leading-relaxed">{m.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-10">
            <Link href="/approach" className="text-primary font-bold text-[16px] inline-flex items-center gap-2 hover:text-accent transition-colors">
              Our approach <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* Platforms as accelerators */}
      <section className="py-24 lg:py-28 px-6 bg-white border-t border-border">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5">
            <SectionHead
              kicker="Accelerators"
              title="We bring our own platforms"
              lead="We have built and run our own learning platforms, so clients do not start from a blank page. We use them where they fit and work in your existing systems where they do not."
            />
            <Link
              href="/products"
              className="text-primary font-bold text-[16px] inline-flex items-center gap-2 hover:text-accent transition-colors"
            >
              Explore the platforms <ArrowRight size={18} />
            </Link>
          </div>
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-px bg-border border border-border self-start">
            {[
              { n: "Synops Praxis", d: "White-label LMS with partner hubs, credentials, and an AI coach." },
              { n: "Curriculum Builder", d: "Design, QA and accreditation alignment in one workflow." },
              { n: "Synops Coach", d: "Adaptive study and a Socratic tutor that will not hand over answers." },
              { n: "Synops Teacher", d: "An AI co-pilot for lesson plans, quizzes and parent updates." },
            ].map((p) => (
              <div key={p.n} className="bg-white p-7">
                <h3 className="text-[17px] font-bold text-foreground mb-2">{p.n}</h3>
                <p className="text-[15px] text-muted-foreground leading-relaxed">{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Conviction */}
      <section className="py-24 lg:py-28 px-6 bg-background border-t border-border">
        <div className="max-w-[860px] mx-auto text-center">
          <Quote className="text-accent mx-auto mb-8" size={36} />
          <blockquote className="font-display text-[26px] lg:text-[34px] font-medium text-foreground leading-[1.35] tracking-tight mb-8">
            "We do not hand over a slide deck and wish you luck. We build the workflow, ship the course, stand up the
            platform, and stay until your team can run it without us."
          </blockquote>
          <div className="text-[15px] mb-8">
            <span className="font-bold text-foreground">The Synops Principals</span>
          </div>
          <Link href="/about" className="text-primary font-bold text-[16px] inline-flex items-center gap-2 hover:text-accent transition-colors">
            About the firm <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 bg-primary-hero">
        <div className="max-w-[900px] mx-auto text-center">
          <h2 className="font-display text-white text-[36px] lg:text-[48px] font-semibold tracking-tight leading-[1.1] mb-6">
            Tell us what is not working.
          </h2>
          <p className="text-[18px] text-white/75 leading-relaxed mb-10 max-w-2xl mx-auto">
            A 30-minute conversation with a principal. No sales script, and you leave with at least one useful idea.
          </p>
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
