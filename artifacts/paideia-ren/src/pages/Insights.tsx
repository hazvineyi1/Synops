import React from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { CTASection } from "@/components/layout/CTASection";
import { articles } from "@/data/insights";

// Lead with EdTech + AI: order the feed so the learning/AI and platform pieces
// come first, with the healthcare/operations perspective as the supporting one.
const CATEGORY_ORDER: Record<string, number> = {
  "Learning, EdTech & AI": 0,
  "Platforms & SaaS": 1,
  "Healthcare & Operations": 2,
};
const sortedArticles = [...articles].sort(
  (a, b) => (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9),
);

export default function Insights() {
  return (
    <div className="min-h-screen pt-[88px]">
      <section className="bg-background pt-24 pb-20 px-6 border-b border-border">
        <div className="max-w-[1200px] mx-auto">
          <span className="block text-[13px] font-bold uppercase tracking-widest text-accent mb-5">Education Technology &amp; AI</span>
          <h1 className="text-5xl md:text-[64px] font-bold text-primary leading-[1.1] tracking-tight mb-6">
            Insights
          </h1>
          <p className="text-[22px] text-muted-foreground leading-relaxed max-w-3xl">
            Perspectives on education technology and AI, learning science, and the operational rigor that makes our platforms hold up in the real world.
          </p>
        </div>
      </section>

      <section className="py-24 px-6 bg-white">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          {sortedArticles.map((post) => (
            <Link
              key={post.slug}
              href={`/insights/${post.slug}`}
              className="flex flex-col border border-border bg-background p-8 group hover:border-primary transition-colors"
            >
              <span className="text-[13px] font-bold text-accent uppercase tracking-widest mb-4">{post.category}</span>
              <h2 className="text-2xl font-bold text-foreground mb-4 leading-[1.3] group-hover:text-primary transition-colors">{post.title}</h2>
              <p className="text-[16px] text-muted-foreground leading-relaxed flex-1 mb-8">{post.summary}</p>
              <div className="flex items-center justify-between border-t border-border pt-6 mt-auto">
                <div className="flex flex-col">
                  <span className="text-[14px] font-bold text-foreground">{post.author}</span>
                  <span className="text-[13px] text-muted-foreground">{post.date}</span>
                </div>
                <div className="w-8 h-8 rounded-[4px] bg-secondary flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                  <ArrowRight size={16} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <CTASection
        heading="Want to go deeper?"
        subtext="Tell us what you're working on and our principals will follow up with a perspective tailored to you."
        buttonLabel="Get in touch"
        href="/contact"
      />
    </div>
  );
}
