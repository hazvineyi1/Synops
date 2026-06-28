import { usePageMeta } from "@/lib/seo";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Learning() {
  usePageMeta(
    "Learning, EdTech & AI Consulting",
    "Instructional design, LMS strategy, AI in education, learning analytics, and accessibility.",
  );

  const services = [
    {
      title: "Instructional Design & Curriculum",
      description: "Course and program design, storyboarding, assessment design, and standards/accreditation alignment across legal, higher-ed, and K-12 contexts. High-volume development (competency modules of 10,000–15,000 words) without losing rigor."
    },
    {
      title: "LMS Strategy & Administration",
      description: "Selection, implementation, migration, and day-to-day administration across Canvas, Blackboard, Moodle, and Brightspace/D2L, plus authoring with Articulate Storyline 360, Rise 360, Adobe Captivate, Camtasia, and Vyond."
    },
    {
      title: "AI in Education & Content Evaluation",
      description: "Generative-AI integration, prompt engineering, custom GPT/model development and evaluation, structured AI quality-review protocols, and AI-transparency practices."
    },
    {
      title: "Learning Analytics & Outcomes",
      description: "Using interaction and performance data to find content gaps and drive iterative improvement (a documented ~20% lift in learner engagement), with Tableau, Power BI, and Python-based analysis."
    },
    {
      title: "Adaptive & Intelligent Tutoring",
      description: "Applied machine learning, NLP, and probabilistic methods for multi-modal learning recognition and dynamic content adaptation (research-grounded doctoral specialization)."
    },
    {
      title: "Quality Assurance & Accessibility",
      description: "Quality Matters review and Section 508 / WCAG 2.1 AA audits, plus SME validation workflows for technical accuracy."
    }
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-24 space-y-16">
      <div className="space-y-6 max-w-3xl">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight" style={{ color: "hsl(var(--practice-learning))" }}>
          Learning, EdTech & AI
        </h1>
        <p className="text-xl text-muted-foreground leading-relaxed">
          Led by Belinda H. Musoni, we offer deep, end-to-end expertise across the learning lifecycle, from curriculum design to AI integration.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.map((s, i) => (
          <Card key={i} className="bg-card shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg leading-tight">{s.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{s.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="bg-muted p-8 md:p-12 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-8 border border-border">
        <div className="space-y-4 max-w-2xl">
          <h2 className="text-2xl font-bold">How we work</h2>
          <p className="text-muted-foreground text-lg">
            We deliver independent, asynchronous collaboration built for scale. With a <strong>98% on-time rate</strong> across concurrent projects, we seamlessly integrate with 20+ subject-matter experts to produce high-quality, accessible learning experiences.
          </p>
        </div>
        <div className="shrink-0">
          <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground" asChild>
            <Link href="/contact?area=learning">Discuss a learning project</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}