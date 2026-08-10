import { Link } from "wouter";

/**
 * Try Synops live: a small hub that launches each product's interactive demo.
 *
 * The "Launch demo" actions are plain <a href> anchors on purpose. Praxis, Coach
 * and Teacher live at different base paths / subdomains, so these cross app
 * boundaries and must NOT use wouter's <Link> (which only routes within this SPA).
 * Copy is deliberately tight and truthful: no invented features or metrics.
 */

type Demo = {
  letter: string;
  name: string;
  category: string;
  description: string;
  href: string;
  // External subdomains open in a new tab; same-origin app paths navigate in place.
  external: boolean;
};

const DEMOS: Demo[] = [
  {
    letter: "P",
    name: "Synops Praxis",
    category: "Workforce & skills",
    description:
      "A learning platform for funded enterprise and skills programmes, courses, coaching and credentials.",
    href: "https://praxis.synops-consulting.com/demo",
    external: true,
  },
  {
    letter: "P",
    name: "Synops Praxis",
    category: "6th grade (K-12)",
    description:
      "A fully gamified middle-school experience, XP, badges, quests and game shows.",
    href: "https://praxis.synops-consulting.com/k12",
    external: true,
  },
  {
    letter: "C",
    name: "Synops Coach",
    category: "AI study coach",
    description:
      "A personalised study coach with a daily learning path, flashcards and a Socratic tutor.",
    href: "/study/demo",
    external: false,
  },
  {
    letter: "T",
    name: "Synops Teacher",
    category: "Teacher copilot",
    description:
      "Plan lessons, build worksheets and quizzes, and see AI-graded class insight.",
    href: "/app/demo",
    external: false,
  },
];

export default function TryDemo() {
  return (
    <div className="min-h-screen pt-[88px] bg-background">
      {/* Hero */}
      <section className="py-24 px-6 bg-primary text-white">
        <div className="max-w-[1000px] mx-auto">
          <div className="inline-block text-[12px] font-bold uppercase tracking-wider bg-white/10 border border-white/20 px-4 py-1.5 rounded-full mb-8">
            Working demos. No sign-up.
          </div>
          <h1 className="text-5xl lg:text-[64px] font-bold leading-[1.1] tracking-tight mb-8">
            Try Synops live
          </h1>
          <p className="text-[21px] text-white/80 leading-relaxed max-w-2xl">
            Four products, running today with real institutions. Launch any of them below and click
            straight into the live experience, no account required.
          </p>
        </div>
      </section>

      {/* Demo cards */}
      <section className="py-16 px-6 bg-white border-b border-border">
        <div className="max-w-[1120px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          {DEMOS.map((d) => (
            <div
              key={`${d.name}-${d.category}`}
              className="flex flex-col border border-border rounded-2xl bg-white p-7 shadow-[0_24px_50px_-34px_rgba(19,60,67,0.35)]"
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="w-9 h-9 rounded-[8px] bg-primary text-white flex items-center justify-center font-extrabold text-[16px] shrink-0">
                  {d.letter}
                </span>
                <div>
                  <h2 className="text-[20px] font-bold text-foreground tracking-tight leading-tight">
                    {d.name}
                  </h2>
                  <p className="text-[12.5px] font-bold uppercase tracking-wider text-accent">
                    {d.category}
                  </p>
                </div>
              </div>

              <p className="text-[15.5px] text-muted-foreground leading-relaxed mb-5 flex-1">
                {d.description}
              </p>

              <span className="inline-flex items-center gap-1.5 self-start text-[11.5px] font-bold uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1 mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                Live product, no sign-up
              </span>

              <a
                href={d.href}
                {...(d.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="inline-block self-start bg-accent text-white px-6 py-2.5 text-[14px] font-bold rounded-[6px] hover:bg-accent/90 transition-colors"
              >
                Launch demo &rarr;
              </a>
            </div>
          ))}
        </div>

        <p className="max-w-[1120px] mx-auto mt-10 text-center text-[14px] text-muted-foreground leading-relaxed">
          Want a guided walkthrough, or access for your team?{" "}
          <Link href="/products" className="text-primary font-bold hover:underline">
            See the products
          </Link>{" "}
          or{" "}
          <Link href="/contact" className="text-primary font-bold hover:underline">
            book a consultation
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
