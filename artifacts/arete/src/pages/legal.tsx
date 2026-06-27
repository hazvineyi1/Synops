import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

// Plain, factual legal/trust pages grounded in what the app actually does.
// This is a starting template, not legal advice — have counsel review before a
// real production launch, and fill in the bracketed company/contact details.

function LegalLayout({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground font-sans">
      <header className="py-4 md:py-6 px-4 md:px-12 border-b border-border/40 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 text-primary no-underline">
          <ArrowLeft className="w-4 h-4" />
          <img src="/logo.svg" alt="Arete" className="w-6 h-6 rounded" />
          <span className="font-serif font-semibold text-lg tracking-tight">Arete</span>
        </Link>
      </header>
      <main className="max-w-2xl mx-auto px-4 md:px-6 py-10">
        <h1 className="font-serif text-3xl text-primary font-medium mb-1">{title}</h1>
        <p className="text-xs text-muted-foreground mb-8">Last updated: {updated}</p>
        <div className="space-y-6 text-[0.95rem] leading-relaxed text-foreground/90">{children}</div>
        <p className="mt-10 text-xs text-muted-foreground border-t border-border pt-4">
          This page is a plain-language summary, not legal advice. Bracketed items need to be completed and the
          whole document reviewed by counsel before a production launch.
        </p>
        <div className="mt-6 flex gap-4 text-sm">
          <Link href="/legal/privacy" className="text-primary underline">Privacy</Link>
          <Link href="/legal/terms" className="text-primary underline">Terms</Link>
          <Link href="/" className="text-primary underline">Home</Link>
        </div>
      </main>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-lg font-medium text-foreground mb-2">{heading}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updated="2026-06-12">
      <p>
        Arete is a study app. This policy explains what we collect, how we use it, and the control you have over
        your data.
      </p>
      <Section heading="What we collect">
        <p>
          - Account details from our auth provider (Clerk): your email address and name.
          <br />- Study material you provide: text you paste, links you share, and files you upload.
          <br />- Learning data the app generates as you use it: extracted concepts, daily plans, checkpoint answers and
          grades, confidence ratings, and progress.
          <br />- A small amount of technical data needed to operate the service (request logs, language preference).
        </p>
      </Section>
      <Section heading="How we use it">
        <p>
          We use your material and learning data only to run the coaching experience: extracting concepts, planning your
          study, teaching, grading your answers, and tracking progress.
        </p>
        <p>
          To do this, your study material and messages are sent to Anthropic's API (the model that powers the coach).
          Under Anthropic's commercial API terms, this content is not used to train their models. We do not sell your
          data or use it for advertising.
        </p>
      </Section>
      <Section heading="Where it is stored">
        <p>
          Your data is stored in our PostgreSQL database. Extraction results may be cached briefly, keyed by content, to
          avoid repeat processing.
        </p>
      </Section>
      <Section heading="Cookies">
        <p>
          We use a session cookie for authentication and a cookie to remember your chosen language. We do not use
          advertising cookies.
        </p>
      </Section>
      <Section heading="Your rights and controls">
        <p>
          You own your material. From Settings you can export everything we hold about you as a JSON file at any time,
          and you can permanently delete your account and all of its data. Deletion removes your data from our database
          and your authentication account.
        </p>
      </Section>
      <Section heading="Contact">
        <p>Questions about your data: [contact email]. Data controller: [company name and address].</p>
      </Section>
    </LegalLayout>
  );
}

export function Terms() {
  return (
    <LegalLayout title="Terms of Service" updated="2026-06-12">
      <p>By creating an account and using Arete, you agree to these terms.</p>
      <Section heading="What the service is">
        <p>
          Arete is an AI study aid. It helps you learn material you provide and prepare for exams. It is an
          educational tool, not professional, legal, medical, or financial advice, and it does not guarantee any exam
          result.
        </p>
      </Section>
      <Section heading="Your content">
        <p>
          You keep ownership of the material you upload. You are responsible for having the right to use any material
          you provide, and for not uploading content that is illegal or that you are not permitted to share.
        </p>
      </Section>
      <Section heading="Acceptable use">
        <p>
          Use the service for your own study. Do not abuse, overload, or attempt to disrupt it, and do not use it to
          generate harmful content. We apply per-account daily limits to keep the service available and to bound costs.
        </p>
      </Section>
      <Section heading="Exam content and copyright">
        <p>
          The coach generates practice questions in the format and style of exams. It does not reproduce proprietary,
          copyrighted exam questions, and you agree not to use the service to copy or distribute such questions.
        </p>
      </Section>
      <Section heading="Subscriptions and billing">
        <p>
          [If and when paid plans are offered: describe price, billing cycle, trial, renewal, cancellation, and refund
          terms here.] Until then, the service is provided as-is.
        </p>
      </Section>
      <Section heading="Disclaimers and liability">
        <p>
          The service is provided "as is" without warranties. To the extent permitted by law, [company name] is not
          liable for indirect or consequential damages arising from your use of the service.
        </p>
      </Section>
      <Section heading="Changes and contact">
        <p>
          We may update these terms; material changes will be reflected by the "last updated" date. Questions: [contact
          email].
        </p>
      </Section>
    </LegalLayout>
  );
}
