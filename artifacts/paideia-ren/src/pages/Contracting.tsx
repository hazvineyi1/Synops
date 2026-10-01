import React from "react";
import { Link } from "wouter";
import { services } from "@/data/consulting";
import { PageHero, SectionHead } from "@/components/layout/PageHero";
import { CTASection } from "@/components/layout/CTASection";

// Public-sector buyer page. Only list identifiers the firm actually holds.
// UEI / CAGE are supplied on request rather than published.
const registrations = [
  { k: "Business type", v: "Small business · Women & Minority-owned" },
  { k: "Virginia SWaM", v: "Certified" },
  { k: "Virginia eVA", v: "Registered vendor" },
  { k: "SAM.gov", v: "Registered · UEI available on request" },
  { k: "Primary NAICS", v: "611430 Professional and Management Development Training" },
  { k: "Coverage", v: "Nationwide, remote and on-site" },
];

const nigp = [
  { code: "918-75", label: "Management consulting" },
  { code: "918-83", label: "Organizational development" },
  { code: "918-90", label: "Strategic planning" },
  { code: "918-88", label: "Quality assurance" },
  { code: "918-06", label: "Administrative consulting" },
  { code: "918-67", label: "Human services consulting" },
];

export default function Contracting() {
  return (
    <div className="min-h-screen pt-[88px]">
      <PageHero
        kicker="Public sector & contracting"
        title="A certified small business you can contract with directly"
        lead="Training, learning technology, AI enablement and program management for agencies, schools and public bodies. Available as a prime or as a teaming partner."
        primary={{ label: "Request our capability statement", href: "/contact?area=contracting" }}
      />

      <section className="py-20 lg:py-28 px-6 bg-white">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-14">
          <div className="lg:col-span-7">
            <SectionHead kicker="At a glance" title="Registrations & codes" />
            <dl className="border-t border-border">
              {registrations.map((r) => (
                <div key={r.k} className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-5 border-b border-border">
                  <dt className="text-[14px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{r.k}</dt>
                  <dd className="sm:col-span-2 text-[17px] text-foreground font-medium">{r.v}</dd>
                </div>
              ))}
            </dl>

            <h3 className="text-[13px] font-bold uppercase tracking-[0.16em] text-foreground mt-12 mb-5">NIGP commodity codes</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {nigp.map((n) => (
                <div key={n.code} className="flex items-baseline gap-4 bg-background border border-border px-5 py-4">
                  <span className="font-display text-[18px] font-semibold text-primary">{n.code}</span>
                  <span className="text-[15px] text-foreground">{n.label}</span>
                </div>
              ))}
            </div>
          </div>

          <aside className="lg:col-span-5">
            <div className="bg-primary-hero text-white p-8 lg:p-10 lg:sticky lg:top-[120px]">
              <h3 className="font-display text-[26px] font-semibold mb-6">Core competencies</h3>
              <ul className="space-y-5">
                {services.map((s) => (
                  <li key={s.slug}>
                    <div className="text-[16px] font-bold mb-1">{s.title}</div>
                    <div className="text-[14px] text-white/70 leading-relaxed">{s.short}</div>
                  </li>
                ))}
              </ul>
              <div className="mt-8 pt-6 border-t border-white/15 text-[14px] text-white/75 leading-relaxed">
                Past performance spans legal and justice-sector training, university courses, workforce
                programs in Southern Africa, and managed-care operations at one of the largest US health plans.{" "}
                <Link href="/work" className="text-white font-bold underline underline-offset-4">
                  See case studies
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <CTASection
        heading="Teaming or a direct buy?"
        subtext="Send us the solicitation or the scope. We respond to teaming requests within two business days."
        buttonLabel="Contact our contracting lead"
        href="/contact?area=contracting"
      />
    </div>
  );
}
