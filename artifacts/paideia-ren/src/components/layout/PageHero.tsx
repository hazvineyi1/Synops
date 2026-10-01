import React from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";

interface PageHeroProps {
  kicker: string;
  title: string;
  lead: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
}

// Shared interior-page hero: dark teal band, editorial serif headline.
export function PageHero({ kicker, title, lead, primary, secondary }: PageHeroProps) {
  return (
    <section className="bg-primary-hero pt-20 pb-20 lg:pt-28 lg:pb-24 px-6">
      <div className="max-w-[1200px] mx-auto">
        <motion.div
          className="max-w-3xl"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="block text-[13px] font-bold uppercase tracking-[0.18em] text-accent mb-6">
            {kicker}
          </span>
          <h1 className="font-display text-white text-[40px] sm:text-5xl lg:text-[60px] font-semibold leading-[1.08] tracking-tight mb-6">
            {title}
          </h1>
          <p className="text-[19px] lg:text-[21px] text-white/80 leading-relaxed max-w-2xl">{lead}</p>
          {(primary || secondary) && (
            <div className="flex flex-col sm:flex-row gap-4 mt-10">
              {primary && (
                <Link
                  href={primary.href}
                  className="bg-accent hover:bg-accent/90 text-white px-8 py-4 font-bold text-[16px] text-center transition-colors rounded-[6px]"
                >
                  {primary.label}
                </Link>
              )}
              {secondary && (
                <Link
                  href={secondary.href}
                  className="border border-white/30 hover:bg-white/10 text-white px-8 py-4 font-bold text-[16px] text-center transition-colors rounded-[6px]"
                >
                  {secondary.label}
                </Link>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

export function SectionHead({
  kicker,
  title,
  lead,
  light = false,
}: {
  kicker?: string;
  title: string;
  lead?: string;
  light?: boolean;
}) {
  return (
    <div className="max-w-3xl mb-14">
      {kicker && (
        <span className="block text-[13px] font-bold uppercase tracking-[0.18em] text-accent mb-5">{kicker}</span>
      )}
      <h2
        className={`font-display text-[34px] lg:text-[44px] font-semibold tracking-tight leading-[1.12] mb-5 ${
          light ? "text-white" : "text-primary"
        }`}
      >
        {title}
      </h2>
      {lead && (
        <p className={`text-[18px] lg:text-[19px] leading-relaxed ${light ? "text-white/75" : "text-muted-foreground"}`}>
          {lead}
        </p>
      )}
    </div>
  );
}

export function CredentialStrip({ items, dark = false }: { items: string[]; dark?: boolean }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-[14px] font-semibold ${
        dark ? "text-white/80" : "text-primary/80"
      }`}
    >
      {items.map((t, i) => (
        <React.Fragment key={t}>
          {i > 0 && <span className={dark ? "text-white/25" : "text-border"}>•</span>}
          <span>{t}</span>
        </React.Fragment>
      ))}
    </div>
  );
}
