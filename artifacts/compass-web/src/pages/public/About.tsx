import { usePageMeta } from "@/lib/seo";
import { Card, CardContent } from "@/components/ui/card";

export default function About() {
  usePageMeta("About", "The firm and its principals: Bertha D. Musoni and Belinda H. Musoni.");
  return (
    <div className="mx-auto max-w-5xl px-4 py-24 space-y-16">
      <div className="space-y-6 max-w-3xl">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-primary">About Synops Consulting Group</h1>
        <p className="text-xl text-muted-foreground leading-relaxed">
          A complementary partnership spanning healthcare operations and education technology, serving organizations across the United States.
        </p>
        <div className="prose prose-lg dark:prose-invert">
          <p>
            We offer both strategic advisory and hands-on build capability. Our model is fully remote, allowing us to deploy exactly the right expertise to your challenges, regardless of geography. We don't just write reports. We implement workflows, build curricula, and architect the platforms necessary to sustain change.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <Card className="border-t-4 shadow-sm" style={{ borderTopColor: "hsl(var(--practice-health))" }}>
          <CardContent className="pt-6 space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Bertha D. Musoni</h2>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mt-1">Founder & Principal Consultant (Synops LLC)</p>
            </div>
            <div className="prose prose-sm dark:prose-invert">
              <p>
                20+ years in managed care, Medicaid program operations, provider network management, and organizational change. Bertha provides oversight of provider relationships up to $1B in annual spend and has led Joint Operation Committees and enterprise process redesign at one of the nation's largest MCOs.
              </p>
              <p>
                She has directed vendor and offshore teams of up to 300 agents, leading NCQA-aligned quality and health-risk-assessment programs.
              </p>
            </div>
            <div className="pt-4 border-t border-border mt-auto">
              <p className="text-sm font-medium text-primary">MPH • MBA • PMP • DBA(c) (Healthcare Management & Leadership)</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-t-4 shadow-sm" style={{ borderTopColor: "hsl(var(--practice-learning))" }}>
          <CardContent className="pt-6 space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Belinda H. Musoni</h2>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mt-1">Principal, Learning & AI</p>
            </div>
            <div className="prose prose-sm dark:prose-invert">
              <p>
                A learning scientist and instructional-design leader with 15+ years designing and quality-assuring education across legal, higher-ed, and K-12 domains. As Lead Instructional Designer & Senior QA Specialist she shipped 40+ courses and curricula.
              </p>
              <p>
                Belinda led an AI-integration initiative that trained designers in generative-AI evaluation and prompt engineering, and built custom GPT models. She administers major LMS platforms, applies learning analytics to lift engagement, and enforces Quality Matters, Section 508 and WCAG 2.1 AA standards.
              </p>
            </div>
            <div className="pt-4 border-t border-border mt-auto">
              <p className="text-sm font-medium text-primary">M.Ed (E-Learning & ID) • PhD(c) Machine Learning • Quality Matters</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-muted p-8 md:p-12 rounded-2xl">
        <h2 className="text-2xl font-bold mb-8 text-center">Our Core Values</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <h3 className="text-lg font-semibold mb-2">Rigor</h3>
            <p className="text-sm text-muted-foreground">Evidence-based approaches over trends, whether in clinical operations or educational design.</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Accountability</h3>
            <p className="text-sm text-muted-foreground">Disciplined project management that guarantees our 98% on-time delivery rate.</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Accessibility</h3>
            <p className="text-sm text-muted-foreground">Systems and content built to be usable by everyone, meeting or exceeding WCAG 2.1 AA standards.</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Measurable Outcomes</h3>
            <p className="text-sm text-muted-foreground">Clear KPIs from day one, tracking engagement lift, cost reduction, or compliance readiness.</p>
          </div>
        </div>
      </div>
    </div>
  );
}