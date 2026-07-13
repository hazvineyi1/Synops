import { useState } from "react";
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
 * NO links into /app/ or /study/ — access is gated behind the interest form
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
    prompt: "Year 9 Biology — cell division, 50 minutes, mixed ability",
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
    prompt: "Update for Amara's guardian — improving, needs homework consistency",
    output: [
      { h: "Subject", p: "Amara's progress in Biology this half-term" },
      { h: "Message", p: "Amara has made real progress in class this half-term — her contributions during practical work are thoughtful and she now explains her reasoning rather than just giving an answer." },
      { h: "Where to help", p: "Homework has been submitted late three times. A consistent slot at home would help her consolidate what she is clearly grasping in lessons." },
      { h: "Next step", p: "I will check in with her weekly and would welcome a short call if that would be useful." },
    ],
  },
  {
    label: "Quiz",
    prompt: "10-question retrieval quiz, cell division, with mark scheme",
    output: [
      { h: "Q1 (Recall)", p: "Name the stage where chromosomes line up at the centre of the cell. — Metaphase [1 mark]" },
      { h: "Q4 (Understand)", p: "Explain why the DNA must be copied before the cell divides. — So each daughter cell receives a complete set [2 marks]" },
      { h: "Q9 (Apply)", p: "A cell divides but one daughter cell has no nucleus. Suggest which stage failed and why. — Telophase/anaphase; chromosomes did not separate [3 marks]" },
      { h: "Mark scheme", p: "Full answers, common misconceptions and follow-up prompts generated alongside every question." },
    ],
  },
];

const COACH_SAMPLES = [
  {
    label: "Socratic tutor",
    prompt: "I don't understand why enzymes stop working when it gets too hot",
    output: [
      { h: "Coach", p: "Before I explain — what do you already know about what an enzyme is made of?" },
      { h: "You", p: "It's a protein I think" },
      { h: "Coach", p: "Exactly. And proteins are folded into a particular shape. What do you think heat does to a folded shape?" },
      { h: "You", p: "Unfolds it?" },
      { h: "Coach", p: "Right — and the enzyme's active site depends on that shape. So what happens to the substrate that used to fit?" },
      { h: "You", p: "It won't fit anymore… so the reaction stops" },
      { h: "Coach", p: "You just derived denaturation yourself. That's the answer, and now it's yours." },
    ],
  },
  {
    label: "Study plan",
    prompt: "Biology exam in 6 weeks, 5 hours a week, weakest on genetics",
    output: [
      { h: "Weeks 1–2", p: "Genetics first, while energy is highest. Three 45-min sessions/week: inheritance, then variation, then a mixed retrieval set." },
      { h: "Weeks 3–4", p: "Interleave genetics with your stronger topics so recall is tested under mixed conditions — the way the exam actually presents it." },
      { h: "Weeks 5–6", p: "Full past papers under timed conditions. Every wrong answer becomes a flashcard scheduled for spaced review." },
      { h: "Why this order", p: "Your weakest topic gets the most spacing and the most retrieval attempts — not just the most hours." },
    ],
  },
  {
    label: "Exam practice",
    prompt: "Give me a 6-marker and mark my answer honestly",
    output: [
      { h: "Question", p: "Explain how a change in a single DNA base can lead to a non-functioning protein. [6 marks]" },
      { h: "Your answer", p: "The base changes so the protein is different and doesn't work." },
      { h: "Marked", p: "2/6 — you have the start and the end, but none of the middle." },
      { h: "What's missing", p: "The changed base alters a codon → a different amino acid is placed → the primary sequence changes → folding changes → active site shape changes → substrate no longer binds. Examiners award the chain, not the conclusion." },
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
      {/* Fake app chrome — signals "this is the product" without being a link */}
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
            Private beta — by invitation
          </div>
          <h1 className="text-5xl lg:text-[64px] font-bold leading-[1.1] tracking-tight mb-8">
            We don't just advise. We ship.
          </h1>
          <p className="text-[21px] text-white/80 leading-relaxed max-w-3xl mb-10">
            Two platforms built from the same conviction: that good pedagogy should scale without being
            diluted. Both are running today with real institutions. Neither is open to the public yet —
            we onboard deliberately, so every partner gets the attention that makes a rollout succeed.
          </p>
          <a
            href="#register-interest"
            className="inline-block bg-white text-primary px-8 py-4 font-bold rounded-[6px] hover:bg-white/90 transition-colors"
          >
            Register your interest
          </a>
        </div>
      </section>

      {/* Synops Teacher */}
      <section className="py-24 px-6 bg-white border-b border-border">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-[6px] bg-accent flex items-center justify-center text-white font-bold text-xl">T</div>
                <h2 className="text-4xl font-bold text-primary tracking-tight">Synops Teacher</h2>
              </div>
              <p className="text-[15px] font-bold uppercase tracking-wider text-accent mb-6">
                Give every teacher back their evenings
              </p>
              <p className="text-[19px] text-muted-foreground leading-relaxed mb-6">
                An AI co-pilot for teachers. It drafts the lesson plans, worksheets, quizzes, mark schemes
                and parent communications that consume a teacher's unpaid hours — grounded in your
                curriculum, pitched at your year groups, and always editable.
              </p>
              <p className="text-[17px] text-muted-foreground leading-relaxed mb-8">
                It does not replace teacher judgement. It removes the blank page, so judgement is spent
                where it actually matters.
              </p>

              <h3 className="text-[13px] font-bold uppercase tracking-wider text-primary mb-4">Why departments adopt it</h3>
              <ul className="space-y-3 mb-8">
                {[
                  "Cuts planning and admin time materially — the hours teachers say they lose to paperwork.",
                  "Consistent quality across a department, not just from your strongest planners.",
                  "Every output is aligned to your curriculum and standards, not a generic template.",
                  "Built-in differentiation: support and stretch generated with every plan.",
                ].map((t) => (
                  <li key={t} className="flex gap-3 text-[16px] text-muted-foreground leading-relaxed">
                    <span className="text-accent font-bold mt-0.5">→</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>

              <div className="bg-muted/40 border border-border rounded-[8px] p-6">
                <h3 className="text-[13px] font-bold uppercase tracking-wider text-primary mb-3">Scales from one classroom to a trust</h3>
                <p className="text-[16px] text-muted-foreground leading-relaxed">
                  Start with a single department pilot. Expand to whole-school with shared resource
                  libraries, class and assignment management, and admin oversight of usage and quality.
                  Multi-school rollouts run on the same tenancy model our consulting clients already
                  operate — isolated data, per-institution branding, and central control.
                </p>
              </div>
            </div>

            <div className="lg:sticky lg:top-28">
              <Sampler samples={TEACHER_SAMPLES} accent="accent" />
            </div>
          </div>
        </div>
      </section>

      {/* Synops Coach */}
      <section className="py-24 px-6 bg-background border-b border-border">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <div className="lg:order-2">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-[6px] bg-primary flex items-center justify-center text-white font-bold text-xl">C</div>
                <h2 className="text-4xl font-bold text-primary tracking-tight">Synops Coach</h2>
              </div>
              <p className="text-[15px] font-bold uppercase tracking-wider text-accent mb-6">
                A tutor that refuses to just give the answer
              </p>
              <p className="text-[19px] text-muted-foreground leading-relaxed mb-6">
                An AI study coach for learners. Adaptive study plans, spaced retrieval, exam practice with
                honest marking, and a guided Socratic tutor that leads a student to the answer instead of
                handing it over.
              </p>
              <p className="text-[17px] text-muted-foreground leading-relaxed mb-8">
                Most AI tools make it easier for a student to avoid thinking. This one is engineered to
                make that impossible.
              </p>

              <h3 className="text-[13px] font-bold uppercase tracking-wider text-primary mb-4">Why institutions fund it</h3>
              <ul className="space-y-3 mb-8">
                {[
                  "One-to-one tutoring is the most effective intervention we know — and the least affordable. This is the first thing that scales it.",
                  "Socratic by design: students reach the answer themselves, so the understanding survives the exam.",
                  "Study plans built on spaced retrieval and interleaving, not on how long a student sits at a desk.",
                  "Honest marking against real mark schemes — students find out now, not in August.",
                ].map((t) => (
                  <li key={t} className="flex gap-3 text-[16px] text-muted-foreground leading-relaxed">
                    <span className="text-accent font-bold mt-0.5">→</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>

              <div className="bg-white border border-border rounded-[8px] p-6">
                <h3 className="text-[13px] font-bold uppercase tracking-wider text-primary mb-3">Scales to a whole cohort</h3>
                <p className="text-[16px] text-muted-foreground leading-relaxed">
                  Deploy to a single intervention group, a year cohort, or an entire student body. Seat-based
                  licensing keeps cost predictable as you grow, and the marginal cost of the next student is
                  a fraction of an hour of human tutoring. Institutional dashboards show who is engaging,
                  who is struggling, and where the cohort is weakest.
                </p>
              </div>
            </div>

            <div className="lg:order-1 lg:sticky lg:top-28">
              <Sampler samples={COACH_SAMPLES} accent="primary" />
            </div>
          </div>
        </div>
      </section>

      {/* Interest form */}
      <section id="register-interest" className="py-24 px-6 bg-white scroll-mt-24">
        <div className="max-w-[760px] mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl lg:text-[48px] font-bold text-primary tracking-tight mb-6">
              Request access
            </h2>
            <p className="text-[19px] text-muted-foreground leading-relaxed">
              Both products are in private beta and are not publicly available. Tell us who you are and
              what you are trying to solve, and our team will contact you to arrange a walkthrough and
              discuss a pilot.
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
                      <SelectItem value="Both">Both</SelectItem>
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
