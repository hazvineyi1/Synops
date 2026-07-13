import React from "react";
import { Link } from "wouter";
import { CTASection } from "@/components/layout/CTASection";

export default function Learning() {
  return (
    <div className="min-h-screen pt-[88px]">
      <section className="bg-primary-hero pt-24 pb-24 px-6 border-b border-primary/20">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-3xl">
            <h1 className="text-white text-5xl md:text-[64px] font-bold leading-[1.1] tracking-tight mb-6">
              Learning, EdTech & AI
            </h1>
            <p className="text-[22px] text-white/80 leading-relaxed mb-8">
              Led by Belinda H. Musoni, we offer deep, end-to-end expertise across the learning lifecycle, from curriculum design to AI integration.
            </p>
            <Link 
              href="/contact?area=learning" 
              className="inline-block bg-accent hover:bg-accent/90 text-white px-8 py-4 font-bold text-[16px] transition-colors rounded-[6px]"
            >
              Discuss a learning project
            </Link>
          </div>
        </div>
      </section>

      <section className="py-24 px-6 bg-white">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-20">
            {[
              { title: "Instructional Design & Curriculum", desc: "Course and program design, storyboarding, assessment design, and standards/accreditation alignment across legal, higher-ed, and K-12 contexts. High-volume development (competency modules of 10,000 to 15,000 words) without losing rigor." },
              { title: "LMS Strategy & Administration", desc: "Selection, implementation, migration, and day-to-day administration across Canvas, Blackboard, Moodle, and Brightspace/D2L, plus authoring with Articulate Storyline 360, Rise 360, Adobe Captivate, Camtasia, and Vyond." },
              { title: "AI in Education & Content Evaluation", desc: "Generative-AI integration, prompt engineering, custom GPT/model development and evaluation, structured AI quality-review protocols, and AI-transparency practices." },
              { title: "Learning Analytics & Outcomes", desc: "Using interaction and performance data to find content gaps and drive iterative improvement (a documented ~20% lift in learner engagement), with Tableau, Power BI, and Python-based analysis." },
              { title: "Adaptive & Intelligent Tutoring", desc: "Applied machine learning, NLP, and probabilistic methods for multi-modal learning recognition and dynamic content adaptation (research-grounded doctoral specialization)." },
              { title: "Quality Assurance & Accessibility", desc: "Quality Matters review and Section 508 / WCAG 2.1 AA audits, plus SME validation workflows for technical accuracy." }
            ].map((item, i) => (
              <div key={i} className="border border-border p-8 bg-background">
                <h3 className="text-xl font-bold text-foreground mb-4">{item.title}</h3>
                <p className="text-[16px] text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          
          <div className="bg-primary text-white p-12">
            <h2 className="text-3xl font-bold mb-4">How we work</h2>
            <p className="text-[18px] text-white/80 leading-relaxed max-w-4xl">
              We deliver independent, asynchronous collaboration built for scale. With a 98% on-time rate across concurrent projects, we seamlessly integrate with 20+ subject-matter experts to produce high-quality, accessible learning experiences.
            </p>
          </div>
        </div>
      </section>

      <CTASection
        heading="Have a learning project in mind?"
        subtext="From curriculum design to AI integration, let's scope the right approach for your team."
        buttonLabel="Discuss a learning project"
        href="/contact?area=learning"
      />
    </div>
  );
}
