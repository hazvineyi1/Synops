import React from "react";
import { Link } from "wouter";
import { Logo } from "./Logo";
import { services } from "@/data/consulting";

export function Footer() {
  return (
    // Footer: Services + Firm + Platforms (accelerators, private beta).
    <footer className="bg-background pt-24 pb-12 border-t border-border">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-20">
          <div className="md:col-span-4 pr-8">
            <Link href="/" className="mb-6 inline-flex">
              <Logo wordmarkClassName="text-foreground" />
            </Link>
            <p className="text-[15px] text-muted-foreground leading-relaxed max-w-sm mb-6">
              Learning, AI and operations consulting. We design it, build it, and stay until it runs.
            </p>
            <a href="mailto:info@synops-consulting.com" className="text-[15px] font-bold text-primary hover:text-accent transition-colors">
              info@synops-consulting.com
            </a>
          </div>

          <div className="md:col-span-3 flex flex-col gap-4">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-foreground mb-2">Services</h3>
            {services.map((s) => (
              <Link key={s.slug} href={`/services#${s.slug}`} className="text-[15px] text-muted-foreground hover:text-accent transition-colors">
                {s.title}
              </Link>
            ))}
          </div>

          <div className="md:col-span-2 flex flex-col gap-4">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-foreground mb-2">Firm</h3>
            <Link href="/industries" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Industries</Link>
            <Link href="/work" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Our work</Link>
            <Link href="/approach" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Approach</Link>
            <Link href="/about" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">About</Link>
            <Link href="/insights" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Insights</Link>
            <Link href="/contracting" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Public sector</Link>
            <Link href="/contact" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Contact</Link>
          </div>

          {/* Platforms: private beta. Link to the /products showcase, NOT to the apps. */}
          <div className="md:col-span-3 flex flex-col gap-4">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-foreground mb-2">Our platforms</h3>
            <Link href="/products#praxis" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Synops Praxis LMS</Link>
            <Link href="/products#builder" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Curriculum Builder</Link>
            <Link href="/products#coach" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Synops Coach</Link>
            <Link href="/products#teacher" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Synops Teacher</Link>
            <Link href="/demo" className="text-[15px] text-muted-foreground hover:text-accent transition-colors mt-2">Try a demo</Link>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-border gap-6">
          <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-[14px] text-muted-foreground">
            <span>© Synops Consulting LLC</span>
            <span className="hidden md:inline text-border">|</span>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <span className="hidden md:inline text-border">|</span>
            <a href="/app/portal" className="hover:text-foreground transition-colors">Admin sign in</a>
          </div>
          <span className="text-[13px] text-muted-foreground">SWaM Certified · SAM.gov · Virginia eVA</span>
        </div>
      </div>
    </footer>
  );
}
