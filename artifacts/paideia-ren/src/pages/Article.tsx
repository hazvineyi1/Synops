import React from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { getArticle } from "@/data/insights";
import { CTASection } from "@/components/layout/CTASection";

export default function Article() {
  const params = useParams();
  const article = getArticle(params.slug ?? "");

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [params.slug]);

  if (!article) {
    return (
      <div className="min-h-screen pt-[88px]">
        <section className="py-32 px-6 bg-white text-center">
          <div className="max-w-[600px] mx-auto">
            <h1 className="text-4xl font-bold text-primary tracking-tight mb-6">Article not found</h1>
            <p className="text-[18px] text-muted-foreground leading-relaxed mb-10">
              The piece you're looking for may have moved or no longer exists.
            </p>
            <Link
              href="/insights"
              className="inline-flex items-center gap-2 text-primary font-bold text-[16px] hover:text-accent transition-colors"
            >
              <ArrowLeft size={18} /> Back to Insights
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-[88px]">
      <section className="bg-primary-hero pt-20 pb-20 px-6 border-b border-primary/20">
        <div className="max-w-[760px] mx-auto">
          <Link
            href="/insights"
            className="inline-flex items-center gap-2 text-white/70 hover:text-white font-medium text-[15px] transition-colors mb-10"
          >
            <ArrowLeft size={18} /> Insights
          </Link>
          <span className="block text-[13px] font-bold text-accent uppercase tracking-widest mb-5">
            {article.category}
          </span>
          <h1 className="text-white text-4xl md:text-[52px] font-bold leading-[1.1] tracking-tight mb-8">
            {article.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-white/80">
            <span className="font-bold text-white">{article.author}</span>
            <span className="text-white/40">·</span>
            <span>{article.authorRole}</span>
            <span className="text-white/40">·</span>
            <span>{article.date}</span>
            <span className="text-white/40">·</span>
            <span>{article.readingTime}</span>
          </div>
          {article.outcome && (
            <div className="mt-10 inline-flex items-baseline gap-3 border-l-2 border-accent pl-5">
              <span className="text-[40px] font-bold text-white leading-none tracking-tight">{article.outcome.metric}</span>
              <span className="text-[15px] text-white/80 max-w-[260px] leading-snug">{article.outcome.label}</span>
            </div>
          )}
        </div>
      </section>

      <section className="py-20 px-6 bg-white">
        <div className="max-w-[760px] mx-auto">
          <p className="text-[22px] text-foreground font-medium leading-relaxed mb-12 pb-12 border-b border-border">
            {article.summary}
          </p>
          {article.sections.map((section, i) => (
            <div key={i}>
              {section.heading && (
                <h2 className="text-2xl md:text-3xl font-bold text-primary tracking-tight mt-12 mb-6">
                  {section.heading}
                </h2>
              )}
              {section.paragraphs.map((paragraph, j) => (
                <p key={j} className="text-[18px] text-muted-foreground leading-relaxed mb-6">
                  {paragraph}
                </p>
              ))}
            </div>
          ))}
        </div>
      </section>

      <CTASection
        heading="Bring this to your organization"
        subtext="Tell us what you're working on and our principals will follow up with a perspective tailored to you."
        buttonLabel="Get in touch"
        href="/contact"
      />
    </div>
  );
}
