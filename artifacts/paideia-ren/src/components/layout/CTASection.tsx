import React from "react";
import { Link } from "wouter";

interface CTASectionProps {
  heading: string;
  subtext: string;
  buttonLabel: string;
  href: string;
}

export function CTASection({ heading, subtext, buttonLabel, href }: CTASectionProps) {
  return (
    <section className="bg-primary-hero py-24 px-6 border-t border-primary/20">
      <div className="max-w-[800px] mx-auto text-center">
        <h2 className="text-white text-4xl md:text-[44px] font-bold tracking-tight leading-[1.1] mb-6">
          {heading}
        </h2>
        <p className="text-[18px] text-white/80 leading-relaxed mb-10 max-w-2xl mx-auto">
          {subtext}
        </p>
        <Link
          href={href}
          className="inline-block bg-accent hover:bg-accent/90 text-white px-10 py-5 font-bold text-[18px] transition-colors rounded-[6px]"
        >
          {buttonLabel}
        </Link>
      </div>
    </section>
  );
}
