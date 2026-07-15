import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getAnonymousId, getUtm, track } from "@/lib/analytics";

/**
 * Products showcase.
 *
 * Synops Teacher and Synops Coach are presented as products with a preview, a
 * short explanation, sales/scalability positioning, and an interactive "sampler"
 * that demonstrates the output WITHOUT granting access. There are deliberately
 * NO links into /app/ or /study/. Access is gated behind the interest form
 * below, and the team follows up manually.
 */

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  organization: z.string().optional(),
  product: z.string().min(1, "Please select a product"),
  role: z.string().optional(),
  message: z.string().min(10, "Tell us a little about your needs"),
});

type FormValues = z.infer<typeof schema>;

/* ---------------------------------------------------------------- Samplers */

const TEACHER_SAMPLES = [
  {
    label: "Lesson plan",
    prompt: "Year 9 Biology, cell division, 50 minutes, mixed ability",
    output: [
      { h: "Learning objective", p: "Students explain the stages of mitosis and why cell division matters for growth and repair." },
      { h: "Starter (5 min)", p: "Show two images: a healing cut and a growing seedling. Ask: what do these have in common?" },
      { h: "Core (25 min)", p: "Model the four stages using a card sort. Pairs sequence the stages, then justify their order to another pair." },
      { h: "Assessment (10 min)", p: "Exit ticket: 3 questions rising from recall to application. Answers and mark scheme included." },
      { h: "Differentiation", p: "Support: pre-labelled diagrams. Stretch: predict what happens if a stage is skipped." },
    ],
  },
  {
    label: "Parent update",
    prompt: "Update for Amara's guardian: improving, needs homework consistency",
    output: [
      { h: "Subject", p: "Amara's progress in Biology this half-term" },
      { h: "Message", p: "Amara has made real progress in class this half-term. Her contributions during practical work are thoughtful, and she now explains her reasoning rather than just giving an answer." },
      { h: "Where to help", p: "Homework has been submitted late three times. A consistent slot at home would help her consolidate what she is clearly grasping in lessons." },
      { h: "Next step", p: "I will check in with her weekly and would welcome a short call if that would be useful." },
    ],
  },
  {
    label: "Quiz",
    prompt: "10-question retrieval quiz, cell division, with mark scheme",
    output: [
      { h: "Q1 (Recall)", p: "Name the stage where chromosomes line up at the centre of the cell. Answer: Metaphase [1 mark]" },
      { h: "Q4 (Understand)", p: "Explain why the DNA must be copied before the cell divides. Answer: so each daughter cell receives a complete set [2 marks]" },
      { h: "Q9 (Apply)", p: "A cell divides but one daughter cell has no nucleus. Suggest which stage failed and why. Answer: telophase/anaphase; chromosomes did not separate [3 marks]" },
      { h: "Mark scheme", p: "Full answers, common misconceptions and follow-up prompts generated alongside every question." },
    ],
  },
];

const COACH_SAMPLES = [
  {
    label: "Socratic tutor",
    prompt: "I don't understand why enzymes stop working when it gets too hot",
    output: [
      { h: "Coach", p: "Before I explain, what do you already know about what an enzyme is made of?" },
      { h: "You", p: "It's a protein I think" },
      { h: "Coach", p: "Exactly. And proteins are folded into a particular shape. What do you think heat does to a folded shape?" },
      { h: "You", p: "Unfolds it?" },
      { h: "Coach", p: "Right, and the enzyme's active site depends on that shape. So what happens to the substrate that used to fit?" },
      { h: "You", p: "It won't fit anymore... so the reaction stops" },
      { h: "Coach", p: "You just derived denaturation yourself. That's the answer, and now it's yours." },
    ],
  },
  {
    label: "Study plan",
    prompt: "Biology exam in 6 weeks, 5 hours a week, weakest on genetics",
    output: [
      { h: "Weeks 1-2", p: "Genetics first, while energy is highest. Three 45-min sessions per week: inheritance, then variation, then a mixed retrieval set." },
      { h: "Weeks 3-4", p: "Interleave genetics with your stronger topics so recall is tested under mixed conditions, the way the exam actually presents it." },
      { h: "Weeks 5-6", p: "Full past papers under timed conditions. Every wrong answer becomes a flashcard scheduled for spaced review." },
      { h: "Why this order", p: "Your weakest topic gets the most spacing and the most retrieval attempts, not simply the most hours." },
    ],
  },
  {
    label: "Exam practice",
    prompt: "Give me a 6-marker and mark my answer honestly",
    output: [
      { h: "Question", p: "Explain how a change in a single DNA base can lead to a non-functioning protein. [6 marks]" },
      { h: "Your answer", p: "The base changes so the protein is different and doesn't work." },
      { h: "Marked", p: "2 out of 6. You have the start and the end, but none of the middle." },
      { h: "What's missing", p: "The changed base alters a codon, a different amino acid is placed, the primary sequence changes, folding changes, the active site shape changes, and the substrate no longer binds. Examiners award the chain, not the conclusion." },
    ],
  },
];

const BUILDER_SAMPLES = [
  {
    label: "Alignment map",
    prompt: "Show me where PLO 3 is actually assessed across the program",
    output: [
      { h: "Coverage", p: "PLO 3 (clinical reasoning) is introduced in NUR 210, practiced in NUR 315, and assessed once, in NUR 420." },
      { h: "Gap flagged", p: "Assessed only once, at the end. An accreditor will ask how you know students are progressing before their final year." },
      { h: "Recommendation", p: "Add a graded formative assessment in NUR 315, mapped to the same performance indicator." },
      { h: "Evidence trail", p: "Every mapping links to the specific assessment and rubric criterion, ready to export." },
    ],
  },
  {
    label: "Quality checks",
    prompt: "Run QA on this course before it goes to handoff",
    output: [
      { h: "Measurable outcomes", p: "4 of 6 objectives use measurable verbs. Two flagged: 'understand' and 'be familiar with' cannot be assessed." },
      { h: "Assessment coverage", p: "Objective 5 has no assessment attached. Every claimed outcome needs evidence." },
      { h: "Cognitive spread", p: "82% of assessments sit at recall. No objective is assessed above 'apply'." },
      { h: "Accessibility", p: "3 documents fail contrast checks; 2 videos have no captions. Listed with the exact fixes." },
    ],
  },
  {
    label: "Standards alignment",
    prompt: "Map this course to our accreditor's standards",
    output: [
      { h: "Matched", p: "Course objectives mapped to the specific performance indicators, not just the standard headers." },
      { h: "Unsupported claim", p: "Standard 4.2 is claimed but the attached assessment's rubric never references it. Flagged before an auditor finds it." },
      { h: "Export", p: "A clean alignment matrix, formatted to the accreditor's template, generated in one click." },
      { h: "Why it matters", p: "The work that normally takes a team months of spreadsheets becomes a by-product of designing the course properly." },
    ],
  },
];

const PRAXIS_SAMPLES = [
  {
    label: "Interactive activity",
    prompt: "A learner opens an activity in their course and hands it in",
    output: [
      { h: "Runs in the browser", p: "The activity loads in a secure sandbox. The learner reads, interacts and completes it without leaving the course." },
      { h: "Hands in a result", p: "On submit, the activity reports the learner's answer and a score straight to the platform. No file uploads, no email." },
      { h: "Coach reviews it", p: "The submission appears in the coach's queue with the learner's name and result, ready to approve or return." },
      { h: "Counts toward progress", p: "Every hand-in is recorded against the learner, feeding progress tracking and verifiable credentials." },
    ],
  },
  {
    label: "Support desk",
    prompt: "A learner can't access a module and opens a support ticket",
    output: [
      { h: "Ticket opened", p: "The learner describes the issue and sets a priority. It routes to their organisation's support queue." },
      { h: "Staff reply", p: "A coach or admin replies in the thread and the learner is notified. Internal notes stay staff-only." },
      { h: "Tracked to resolution", p: "Status moves from open to pending to resolved, with a full history. Nothing gets lost in an inbox." },
    ],
  },
  {
    label: "Platform console",
    prompt: "An administrator manages accounts across the whole platform",
    output: [
      { h: "Every account", p: "Search any user, view their sessions and login history, change roles, suspend or reactivate." },
      { h: "Master resets", p: "Issue a one-time password reset link for a locked-out learner, without ever seeing their password." },
      { h: "Impersonate safely", p: "View the platform as any user to reproduce a problem, with an unmissable banner and a full audit trail." },
      { h: "Audit everything", p: "Every privileged action is logged, and login activity, including failures, is visible platform-wide." },
    ],
  },
];

function Sampler({
  samples,
  accent,
}: {
  samples: typeof TEACHER_SAMPLES;
  accent: "accent" | "primary";
}) {
  const [active, setActive] = useState(0);
  const current = samples[active]!;
  const chipOn = accent === "accent" ? "bg-accent text-white" : "bg-primary text-white";

  return (
    <div className="bg-white border border-border rounded-[10px] overflow-hidden shadow-sm">
      {/* Fake app chrome that signals "this is the product" without being a link */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/40">
        <span className="w-2.5 h-2.5 rounded-full bg-border" />
        <span className="w-2.5 h-2.5 rounded-full bg-border" />
        <span className="w-2.5 h-2.5 rounded-full bg-border" />
        <span className="ml-3 text-[12px] font-medium text-muted-foreground">Live sample output</span>
      </div>

      <div className="p-6">
        <div className="flex flex-wrap gap-2 mb-5">
          {samples.map((s, i) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setActive(i)}
              className={`text-[13px] font-bold px-3.5 py-1.5 rounded-full transition-colors ${
                i === active ? chipOn : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mb-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">You ask</div>
          <div className="bg-muted/50 border border-border rounded-[6px] px-4 py-3 text-[15px] text-foreground italic">
            "{current.prompt}"
          </div>
        </div>

        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">It produces</div>
          <div className="space-y-3">
            {current.output.map((row, i) => (
              <div key={i} className="border-l-2 border-border pl-4">
                <div className="text-[13px] font-bold text-primary mb-0.5">{row.h}</div>
                <p className="text-[15px] text-muted-foreground leading-relaxed">{row.p}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 pt-4 border-t border-border text-[13px] text-muted-foreground">
          Illustrative output. The live product generates this against your curriculum, your standards and your learners.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ Product explorer */

/**
 * Compact product explorer.
 *
 * Replaces three tall stacked sections (which took three screens of scrolling
 * and read as clunky) with a single switcher: pick a product, see its pitch and
 * sampler in place. Deep-linkable via #teacher / #coach / #builder, so a
 * "See it in action" link from elsewhere on the site lands on the RIGHT product
 * instead of dumping the visitor at the top of the page on Synops Teacher.
 */
/** The expandable detail body for one product (text column + sampler). */
function ProductDetail({ p }: { p: Product }) {
  return (
    <div className="px-6 lg:px-8 py-8 border-t border-border grid grid-cols-1 lg:grid-cols-2 gap-10 xl:gap-14 items-start">
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-accent mb-4">{p.tagline}</p>
        <p className="text-[17px] text-muted-foreground leading-relaxed mb-7">{p.lead}</p>

        <h3 className="text-[12px] font-bold uppercase tracking-wider text-primary mb-3">{p.bulletsTitle}</h3>
        <ul className="space-y-2.5 mb-7">
          {p.bullets.map((t) => (
            <li key={t} className="flex gap-3 text-[15.5px] text-muted-foreground leading-relaxed">
              <span className="text-accent font-bold mt-0.5 shrink-0">&rarr;</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>

        <div className="border-t border-border pt-5">
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-primary mb-2">{p.scaleTitle}</h3>
          <p className="text-[15px] text-muted-foreground leading-relaxed">{p.scale}</p>
        </div>

        {/* Live products link straight to the app; the app gates access itself. */}
        {p.href && (
          <div className="border-t border-border mt-5 pt-5">
            <a
              href={p.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-accent text-white px-7 py-3.5 font-bold rounded-[6px] hover:bg-accent/90 transition-colors"
            >
              {p.cta ?? "Open"} &rarr;
            </a>
            <p className="mt-3 text-[13.5px] text-muted-foreground leading-relaxed">
              Access is by enrolment. Enrolled learners sign in above; if your organisation
              is not yet set up, register your interest below.
            </p>
          </div>
        )}
      </div>

      <Sampler samples={p.samples} accent={p.accent} />
    </div>
  );
}

function ProductExplorer() {
  // Accordion: any number of products can be open at once, and all can be collapsed.
  // Starts with the first product open so the page is not bare; every panel toggles.
  const [open, setOpen] = useState<string[]>([PRODUCTS[0]!.slug]);

  const toggle = (slug: string) =>
    setOpen((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));

  useEffect(() => {
    const applyHash = () => {
      const slug = window.location.hash.replace("#", "").toLowerCase();
      if (!PRODUCTS.some((p) => p.slug === slug)) return;
      // Open the linked product (leave others as they are) and land on it.
      setOpen((prev) => (prev.includes(slug) ? prev : [...prev, slug]));
      window.requestAnimationFrame(() => {
        document.getElementById(`product-${slug}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  return (
    <section id="explore" className="py-16 px-6 bg-white border-b border-border scroll-mt-20">
      <div className="max-w-[1200px] mx-auto space-y-4">
        <div className="flex items-center justify-end gap-4 mb-2">
          <button
            type="button"
            onClick={() => setOpen(PRODUCTS.map((p) => p.slug))}
            className="text-[13px] font-bold text-muted-foreground hover:text-accent transition-colors"
          >
            Expand all
          </button>
          <span className="text-border">|</span>
          <button
            type="button"
            onClick={() => setOpen([])}
            className="text-[13px] font-bold text-muted-foreground hover:text-accent transition-colors"
          >
            Collapse all
          </button>
        </div>

        {PRODUCTS.map((x) => {
          const isOpen = open.includes(x.slug);
          return (
            <div
              key={x.slug}
              id={`product-${x.slug}`}
              className="border border-border rounded-[10px] overflow-hidden bg-white scroll-mt-24"
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => {
                  toggle(x.slug);
                  window.history.replaceState(null, "", `#${x.slug}`);
                }}
                className={`w-full text-left px-6 py-5 flex items-center gap-4 transition-colors ${
                  isOpen ? "bg-primary text-white" : "bg-white hover:bg-muted/50"
                }`}
              >
                <div
                  className={`w-9 h-9 shrink-0 rounded-[5px] flex items-center justify-center font-bold text-[14px] ${
                    isOpen ? "bg-white text-primary" : "bg-primary text-white"
                  }`}
                >
                  {x.letter}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-[18px] ${isOpen ? "text-white" : "text-primary"}`}>{x.name}</span>
                    {x.tag && (
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          isOpen ? "bg-white/20 text-white" : "bg-accent/10 text-accent"
                        }`}
                      >
                        {x.tag}
                      </span>
                    )}
                  </div>
                  <div className={`text-[13.5px] leading-snug ${isOpen ? "text-white/70" : "text-muted-foreground"}`}>
                    {x.short}
                  </div>
                </div>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`w-5 h-5 shrink-0 transition-transform duration-200 ${
                    isOpen ? "rotate-180 text-white/80" : "text-muted-foreground"
                  }`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {isOpen && <ProductDetail p={x} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

type Product = {
  slug: string;
  short: string;
  letter: string;
  name: string;
  tagline: string;
  lead: string;
  bulletsTitle: string;
  bullets: string[];
  scaleTitle: string;
  scale: string;
  samples: typeof TEACHER_SAMPLES;
  accent: "accent" | "primary";
  // Live products (e.g. Praxis) render a direct action button; private-beta ones don't.
  href?: string;
  cta?: string;
  // Optional category chip shown next to the name (e.g. "LMS").
  tag?: string;
};

const PRODUCTS: Product[] = [
  {
    slug: "teacher",
    short: "For the people who teach.",
    letter: "T",
    name: "Synops Teacher",
    tagline: "Give every teacher back their evenings",
    lead: "An AI co-pilot for teachers. It drafts the lesson plans, worksheets, quizzes, mark schemes and parent communications that consume a teacher's unpaid hours, grounded in your curriculum and pitched at your year groups. It does not replace teacher judgement. It removes the blank page, so judgement is spent where it actually matters.",
    bulletsTitle: "Why departments adopt it",
    bullets: [
      "Cuts planning and admin time materially, recovering the hours teachers say they lose to paperwork.",
      "Consistent quality across a department, not just from your strongest planners.",
      "Every output is aligned to your curriculum and standards, not a generic template.",
      "Built-in differentiation: support and stretch generated with every plan.",
    ],
    scaleTitle: "Scales from one classroom to a trust",
    scale: "Start with a single department pilot. Expand to whole-school with shared resource libraries, class and assignment management, and admin oversight of usage and quality. Multi-school rollouts run on the same tenancy model our consulting clients already operate: isolated data, per-institution branding, and central control.",
    samples: TEACHER_SAMPLES,
    accent: "accent" as const,
  },
  {
    slug: "coach",
    short: "For the people who learn.",
    letter: "C",
    name: "Synops Coach",
    tagline: "A tutor that refuses to just give the answer",
    lead: "An AI study coach for learners. Adaptive study plans, spaced retrieval, exam practice with honest marking, and a guided Socratic tutor that leads a student to the answer instead of handing it over. Most AI tools make it easier for a student to avoid thinking. This one is engineered to make that impossible.",
    bulletsTitle: "Why institutions fund it",
    bullets: [
      "One-to-one tutoring is the most effective intervention we know, and the least affordable. This is the first thing that scales it.",
      "Socratic by design: students reach the answer themselves, so the understanding survives the exam.",
      "Study plans built on spaced retrieval and interleaving, not on how long a student sits at a desk.",
      "Honest marking against real mark schemes, so students find out now rather than in August.",
    ],
    scaleTitle: "Scales to a whole cohort",
    scale: "Deploy to a single intervention group, a year cohort, or an entire student body. Seat-based licensing keeps cost predictable as you grow, and the marginal cost of the next student is a fraction of an hour of human tutoring. Institutional dashboards show who is engaging, who is struggling, and where the cohort is weakest.",
    samples: COACH_SAMPLES,
    accent: "primary" as const,
  },
  {
    slug: "builder",
    short: "For the teams who design the curriculum.",
    letter: "B",
    name: "Curriculum Builder",
    tagline: "Good design and audit-ready evidence, from one workflow",
    lead: "A curriculum design platform that takes instructional teams from intake through design, quality assurance, and handoff. Backward design by default, with objectives, assessments and activities held in a live alignment map. Most curriculum tools track approvals. This one helps you build the course, and produces the accreditation evidence as a by-product of doing it properly.",
    bulletsTitle: "Why institutions buy it",
    bullets: [
      "Accreditation self-studies stop being a six-month scramble. The evidence is already there, mapped to the performance indicator.",
      "Rules-based QA catches unmeasurable objectives, unassessed outcomes and accessibility failures before handoff, not after a site visit.",
      "Standards library covering regional and specialist accreditors, plus your own institutional outcomes.",
      "Replaces specialist accreditation consultants billing by the hour.",
    ],
    scaleTitle: "Scales from one program to an institution",
    scale: "Start with a single program build. Expand to department, college and whole-institution curriculum mapping, with a live view of where every program outcome is introduced, practiced and assessed. Multi-tenant by design: isolated data, your branding, and central oversight across every course in development.",
    samples: BUILDER_SAMPLES,
    accent: "primary" as const,
  },
  {
    slug: "praxis",
    short: "For the institutions that deliver the learning.",
    letter: "P",
    name: "Synops Praxis",
    tag: "LMS",
    tagline: "The learning platform where it all comes together",
    lead: "A full learning management system for institutions and workforce training. Enrolled learners take courses, complete interactive activities and hand them in, earn verifiable credentials, and get help from a built-in support desk. Coaches review and grade; administrators run the whole platform. Praxis is where the curriculum you design and the coaching you provide actually reach learners, under one roof with real access control.",
    bulletsTitle: "Why organisations run it",
    bullets: [
      "Enrolment-based access: learners sign in only once their organisation has enrolled and approved them.",
      "Interactive HTML activities learners complete in-browser and hand in, sandboxed and gradable, with results recorded automatically.",
      "A built-in helpdesk so learner questions and issues are tracked to resolution, not lost in email.",
      "A super-admin console for impersonation, master password resets, login activity, audit trails and API keys.",
    ],
    scaleTitle: "Scales from one cohort to a workforce",
    scale: "Multi-tenant by design: each organisation gets isolated data, its own branding, and role-based access from learner to coach to org and partner admin. Roll out to a single training cohort or an entire workforce, with the platform console giving central oversight of every account, session and credential.",
    samples: PRAXIS_SAMPLES,
    accent: "accent" as const,
    // Praxis is live and enrolment-gated, so it links straight to sign-in rather than
    // sitting behind the interest funnel. The LMS itself gates access.
    href: "https://synops-production.up.railway.app/sign-in",
    cta: "Sign in",
  },
];

/* ------------------------------------------------------------------- Page */

export default function Products() {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", organization: "", product: "", role: "", message: "" },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const utm = getUtm();
      const res = await fetch("/api/copilot/pilot-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "product_interest",
          contactName: values.name,
          contactEmail: values.email,
          organization: values.organization || null,
          message: `[Product: ${values.product}]${values.role ? ` [Role: ${values.role}]` : ""} ${values.message}`,
          sourcePath: typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
          sourceReferrer: typeof document !== "undefined" ? document.referrer || null : null,
          sourceUtm: Object.keys(utm).length > 0 ? utm : null,
          anonymousId: getAnonymousId(),
        }),
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      track("product_interest_submitted", { product: values.product });

      toast({
        title: "Interest registered",
        description: "Thank you. Our team will contact you within 2 business days to arrange access.",
      });
      form.reset();
    } catch (err) {
      toast({
        title: "Could not send",
        description: (err as Error).message + ". Please try again or email info@synops-consulting.com.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen pt-[88px] bg-background">
      {/* Hero */}
      <section className="py-24 px-6 bg-primary text-white">
        <div className="max-w-[1000px] mx-auto">
          <div className="inline-block text-[12px] font-bold uppercase tracking-wider bg-white/10 border border-white/20 px-4 py-1.5 rounded-full mb-8">
            Private beta, by invitation
          </div>
          <h1 className="text-5xl lg:text-[64px] font-bold leading-[1.1] tracking-tight mb-8">
            We don't just advise. We ship.
          </h1>
          <p className="text-[21px] text-white/80 leading-relaxed max-w-3xl mb-10">
            Four platforms built from the same conviction: that good pedagogy should scale without being
            diluted. One for the people who teach, one for the people who learn, one for the teams who
            design the curriculum itself, and one that delivers it all to enrolled learners. All are
            running today with real institutions. We onboard deliberately, so every partner gets the
            attention that makes a rollout succeed.
          </p>
          <a
            href="#register-interest"
            className="inline-block bg-white text-primary px-8 py-4 font-bold rounded-[6px] hover:bg-white/90 transition-colors"
          >
            Register your interest
          </a>
        </div>
      </section>

      {/* One compact switcher instead of three tall stacked sections. */}
      <ProductExplorer />

      {/* Interest form */}
      <section id="register-interest" className="py-24 px-6 bg-white scroll-mt-24">
        <div className="max-w-[760px] mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl lg:text-[48px] font-bold text-primary tracking-tight mb-6">
              Request access
            </h2>
            <p className="text-[19px] text-muted-foreground leading-relaxed">
              Our platforms are onboarded by invitation, and access to Synops Praxis is by enrolment. Tell us
              who you are and what you are trying to solve, and our team will contact you to arrange a
              walkthrough and discuss a pilot.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl><Input placeholder="Your name" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" placeholder="you@institution.org" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField control={form.control} name="organization" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl><Input placeholder="School, trust or institution" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your role <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl><Input placeholder="e.g. Head of Department" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="product" render={({ field }) => (
                <FormItem>
                  <FormLabel>Which product?</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select a product" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Synops Teacher">Synops Teacher</SelectItem>
                      <SelectItem value="Synops Coach">Synops Coach</SelectItem>
                      <SelectItem value="Curriculum Builder">Curriculum Builder</SelectItem>
                      <SelectItem value="Synops Praxis">Synops Praxis (LMS)</SelectItem>
                      <SelectItem value="More than one">More than one</SelectItem>
                      <SelectItem value="Not sure yet">Not sure yet</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="message" render={({ field }) => (
                <FormItem>
                  <FormLabel>What are you trying to solve?</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={5}
                      placeholder="Tell us about your school or cohort, roughly how many staff or students, and what you're hoping to change."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <Button
                type="submit"
                disabled={submitting}
                size="lg"
                className="w-full bg-primary hover:bg-primary/90 text-white h-14 text-[16px] font-bold rounded-[6px]"
              >
                {submitting ? "Sending..." : "Register interest"}
              </Button>

              <p className="text-[14px] text-muted-foreground text-center leading-relaxed">
                We will contact you within 2 business days. You can also email{" "}
                <a href="mailto:info@synops-consulting.com" className="text-primary font-bold hover:underline">
                  info@synops-consulting.com
                </a>
                , or{" "}
                <Link href="/contact" className="text-primary font-bold hover:underline">
                  book a consultation
                </Link>
                .
              </p>
            </form>
          </Form>
        </div>
      </section>
    </div>
  );
}
