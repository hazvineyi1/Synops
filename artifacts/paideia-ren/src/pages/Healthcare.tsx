import React from "react";
import { Link } from "wouter";
import { CTASection } from "@/components/layout/CTASection";

export default function Healthcare() {
  return (
    <div className="min-h-screen pt-[88px]">
      <section className="bg-primary-hero pt-24 pb-24 px-6 border-b border-primary/20">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-3xl">
            <span className="block text-[13px] font-bold uppercase tracking-widest text-accent mb-5">The Operational Backbone</span>
            <h1 className="text-white text-5xl md:text-[64px] font-bold leading-[1.1] tracking-tight mb-6">
              Healthcare & Operations
            </h1>
            <p className="text-[22px] text-white/80 leading-relaxed mb-6">
              The compliance, managed-care, and change-management rigor that grounds how Synops builds and runs its learning platforms, and that holds up in tightly regulated settings.
            </p>
            <p className="text-[17px] text-white/70 leading-relaxed mb-8">
              Led by Bertha D. Musoni, with 20+ years in managed care, Medicaid operations, and provider-network management. That same discipline is also available as a standalone advisory engagement.
            </p>
            <Link 
              href="/contact?area=healthcare" 
              className="inline-block bg-accent hover:bg-accent/90 text-white px-8 py-4 font-bold text-[16px] transition-colors rounded-[6px]"
            >
              Request a consultation
            </Link>
          </div>
        </div>
      </section>

      <section className="py-24 px-6 bg-white">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-16">
          <div>
            <h2 className="text-3xl font-bold text-primary tracking-tight mb-8">Core Services</h2>
            <ul className="space-y-6">
              {[
                "Provider Relations & Network Management",
                "Managed Care Program Support",
                "Healthcare Operations",
                "Organizational Change & Workforce"
              ].map((service, i) => (
                <li key={i} className="flex items-center gap-4 text-[18px] text-foreground font-semibold border-b border-border pb-6 last:border-0">
                  <div className="w-2 h-2 bg-accent shrink-0"></div>
                  {service}
                </li>
              ))}
            </ul>
          </div>
          
          <div className="bg-background border border-border p-10">
            <h2 className="text-3xl font-bold text-primary tracking-tight mb-8">Why it matters</h2>
            <div className="space-y-8">
              <div>
                <h4 className="text-[18px] font-bold text-foreground mb-2">Root-Cause Analysis</h4>
                <p className="text-[16px] text-muted-foreground leading-relaxed">
                  We move beyond symptomatic fixes to address underlying systemic failures in claims and operations.
                </p>
              </div>
              <div>
                <h4 className="text-[18px] font-bold text-foreground mb-2">High-Dollar Claim Remediation</h4>
                <p className="text-[16px] text-muted-foreground leading-relaxed">
                  Protecting revenue integrity through rigorous dispute resolution frameworks and provider collaboration.
                </p>
              </div>
              <div>
                <h4 className="text-[18px] font-bold text-foreground mb-2">Large-Scale Oversight</h4>
                <p className="text-[16px] text-muted-foreground leading-relaxed">
                  Experience directing vendor and offshore teams of up to 300 agents ensures your operational partners are held to standard.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <CTASection
        heading="Ready to strengthen your operations?"
        subtext="Talk to Bertha about provider networks, managed-care programs, and high-dollar claim remediation."
        buttonLabel="Request a consultation"
        href="/contact?area=healthcare"
      />
    </div>
  );
}
