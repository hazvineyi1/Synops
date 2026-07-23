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
      { h: "What's missing", p: "The whole causal chain: codon changes, wrong amino acid, folding changes, active site changes, substrate no longer binds. Examiners award the chain, not the conclusion." },
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
  const chipOn = accent === "accent" ? "bg-accent text-white border-accent" : "bg-primary text-white border-primary";

  // Cap to 3 rows so the sample stays a tidy, fixed-height panel that balances
  // the left column instead of towering over it.
  const rows = current.output.slice(0, 3);

  return (
    <div className="bg-muted/40 border-t lg:border-t-0 lg:border-l border-border p-6 flex flex-col">
      <div className="flex items-center gap-1.5 mb-3.5">
        <span className="w-2 h-2 rounded-full bg-border" />
        <span className="w-2 h-2 rounded-full bg-border" />
        <span className="w-2 h-2 rounded-full bg-border" />
        <span className="ml-2 text-[11.5px] font-medium text-muted-foreground">Live sample output</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3.5">
        {samples.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setActive(i)}
            className={`text-[12px] font-bold px-2.5 py-1.5 rounded-md border transition-colors ${
              i === active ? chipOn : "bg-white text-muted-foreground border-border hover:bg-muted/70"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">You ask</div>
      <div className="bg-white border border-border rounded-[8px] px-3.5 py-2.5 text-[14px] text-foreground italic mb-4">
        "{current.prompt}"
      </div>

      <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">It produces</div>
      <div className="space-y-2.5 flex-1">
        {rows.map((row, i) => (
          <div key={i} className="border-l-2 border-border pl-3">
            <div className="text-[12.5px] font-bold text-primary mb-0.5">{row.h}</div>
            <p className="text-[13.5px] text-muted-foreground leading-snug">{row.p}</p>
          </div>
        ))}
      </div>

      <p className="mt-3.5 pt-3 border-t border-border text-[12px] text-muted-foreground">
        Illustrative. The live product runs this against your own curriculum and learners.
      </p>
    </div>
  );
}

/* ------------------------------------------------------ Product explorer */

/**
 * Product explorer: a compact TAB SWITCHER (one product at a time).
 *
 * Replaces the old expand/collapse accordion, which stacked four tall panels and
 * read as lopsided (short pitch column vs a towering sample). Now: squared tabs
 * pick a product, and a single balanced two-column card shows its pitch on the
 * left and a compact, fixed sample on the right. Deep-linkable via
 * #teacher / #coach / #builder / #praxis so a "See it in action" link lands on
 * the right product.
 */
function ProductExplorer() {
  const [active, setActive] = useState<string>(PRODUCTS[0]!.slug);

  useEffect(() => {
    const applyHash = () => {
      const slug = window.location.hash.replace("#", "").toLowerCase();
      if (!PRODUCTS.some((p) => p.slug === slug)) return;
      setActive(slug);
      window.requestAnimationFrame(() => {
        document.getElementById("explore")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const p = PRODUCTS.find((x) => x.slug === active) ?? PRODUCTS[0]!;

  return (
    <section id="explore" className="py-16 px-6 bg-white border-b border-border scroll-mt-20">
      <div className="max-w-[1120px] mx-auto">
        {/* Squared tabs */}
        <div className="flex flex-wrap justify-center gap-2.5 mb-8">
          {PRODUCTS.map((x) => {
            const on = x.slug === active;
            return (
              <button
                key={x.slug}
                type="button"
                onClick={() => {
                  setActive(x.slug);
                  window.history.replaceState(null, "", `#${x.slug}`);
                }}
                className={`flex items-center gap-2.5 border rounded-lg px-4 py-2.5 font-bold text-[14.5px] transition-colors ${
                  on ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-border hover:bg-muted/40"
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-[6px] flex items-center justify-center font-extrabold text-[13px] ${
                    on ? "bg-white text-primary" : "bg-primary text-white"
                  }`}
                >
                  {x.letter}
                </span>
                {x.name}
              </button>
            );
          })}
        </div>

        {/* Balanced two-column panel */}
        <div className="border border-border rounded-2xl overflow-hidden bg-white shadow-[0_24px_50px_-34px_rgba(19,60,67,0.35)]">
          <div className="grid grid-cols-1 lg:grid-cols-[0.92fr_1.08fr] items-stretch">
            <div className="p-8 lg:p-9 flex flex-col">
              <p className="text-[12px] font-bold uppercase tracking-wider text-accent mb-3">{p.tagline}</p>
              <div className="flex items-center gap-2 mb-2.5">
                <h3 className="text-[26px] font-bold text-foreground tracking-tight">{p.name}</h3>
                {p.tag && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                    {p.tag}
                  </span>
                )}
              </div>
              <p className="text-[16.5px] text-muted-foreground leading-relaxed mb-6 max-w-md">{p.lead}</p>

              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 mb-7">
                {p.bullets.map((t) => (
                  <li key={t} className="flex gap-2 text-[14px] text-foreground font-semibold leading-snug">
                    <span className="text-accent font-extrabold mt-px shrink-0">&rarr;</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-3 mt-auto">
                <span className="inline-block text-[12.5px] font-semibold text-muted-foreground bg-muted/60 border border-border rounded-md px-3.5 py-1.5">
                  {p.scaleTitle}
                </span>
                {/* Live products (Praxis) link straight to the app; the rest route to the interest form. */}
                <a
                  href={p.href ?? "#register-interest"}
                  {...(p.href ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="inline-block bg-accent text-white px-6 py-2.5 text-[14px] font-bold rounded-[6px] hover:bg-accent/90 transition-colors"
                >
                  {p.href ? p.cta ?? "Open" : "Request access"} &rarr;
                </a>
              </div>
            </div>

            <Sampler samples={p.samples} accent={p.accent} />
          </div>
        </div>
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
    lead: "An AI co-pilot that drafts the lesson plans, worksheets, quizzes and parent notes that eat a teacher's evenings, grounded in your curriculum.",
    bulletsTitle: "Why departments adopt it",
    bullets: [
      "Cuts planning and admin time",
      "Consistent quality across a department",
      "Aligned to your curriculum, not a template",
      "Differentiation built into every plan",
    ],
    scaleTitle: "Scales from one classroom to a trust",
    scale: "Scales from one classroom to a trust.",
    samples: TEACHER_SAMPLES,
    accent: "accent" as const,
  },
  {
    slug: "coach",
    short: "For the people who learn.",
    letter: "C",
    name: "Synops Coach",
    tagline: "A tutor that refuses to just give the answer",
    lead: "An AI study coach with adaptive plans, honest exam marking, and a Socratic tutor that leads students to the answer instead of handing it over.",
    bulletsTitle: "Why institutions fund it",
    bullets: [
      "Makes 1:1 tutoring finally scale",
      "Socratic by design, no spoon-feeding",
      "Study plans built on spaced retrieval",
      "Honest marking to real mark schemes",
    ],
    scaleTitle: "Scales to a whole cohort",
    scale: "Scales to a whole cohort.",
    samples: COACH_SAMPLES,
    accent: "primary" as const,
  },
  {
    slug: "builder",
    short: "For the teams who design the curriculum.",
    letter: "B",
    name: "Curriculum Builder",
    tagline: "Good design and audit-ready evidence, from one workflow",
    lead: "A curriculum design platform that takes teams from intake to handoff, and produces accreditation evidence as a by-product of designing the course properly.",
    bulletsTitle: "Why institutions buy it",
    bullets: [
      "Accreditation evidence as a by-product",
      "Automated pedagogical + accessibility QA",
      "Regional + specialist standards library",
      "Replaces per-hour accreditation consultants",
    ],
    scaleTitle: "Scales from one program to an institution",
    scale: "Scales from one program to an institution.",
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
    lead: "A full LMS where enrolled learners take courses, complete interactive activities, and earn verifiable credentials, with coaches grading and admins running it all.",
    bulletsTitle: "Why organisations run it",
    bullets: [
      "Enrolment-gated learner access",
      "Interactive activities, auto-graded",
      "Built-in support desk",
      "Super-admin console + audit trails",
    ],
    scaleTitle: "Scales from one cohort to a workforce",
    scale: "Scales from one cohort to a workforce.",
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
          <p className="text-[21px] text-white/80 leading-relaxed max-w-2xl mb-10">
            Four platforms so good pedagogy can scale without being diluted, running today with real
            institutions. Open one below to see it in action.
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
              Onboarded by invitation. Tell us who you are and what you want to solve, and we will arrange a
              walkthrough and a pilot.
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
