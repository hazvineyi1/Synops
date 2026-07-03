import type { ReactNode } from "react";
import { Link } from "wouter";
import { BookOpen, ArrowLeft, Mail } from "lucide-react";

// Coach help / FAQ. Plain answers to the questions learners actually ask, plus a
// support-contact section. Static page, no backend. Keep the support email in
// sync with the legal pages.
const CONTACT_EMAIL = "support@synops-consulting.com";

const FAQS: Array<{ q: string; a: ReactNode }> = [
  {
    q: "How do I get started?",
    a: (
      <>Upload something you're studying, and Coach turns it into concepts, practice
      questions, mock exams, and a tutor you can talk to. Start from{" "}
      <strong>Materials → Add material</strong>.</>
    ),
  },
  {
    q: "What can I upload?",
    a: <>PDFs, Word documents, or text you paste in. Coach reads it and pulls out the
      key concepts automatically. Clearer source material gives better results.</>,
  },
  {
    q: "Does Coach work offline?",
    a: <>Yes, partly. Once you've opened your materials, concepts, and flashcards,
      they stay readable with no connection. Generating new questions, exams, or
      tutor replies needs the internet, since that's where the AI runs.</>,
  },
  {
    q: "Can I install it like an app?",
    a: <>Yes. On Android or desktop Chrome, use "Add to Home screen" / "Install app"
      and Coach opens full-screen like a normal app.</>,
  },
  {
    q: "What does it cost, and how do I pay?",
    a: <>There's a free tier, plus paid plans for more. Paid plans are billed in your
      local currency by mobile money or card, and you can cancel any time from{" "}
      <strong>Upgrade</strong>. Your paid features last until the end of the period
      you've paid for.</>,
  },
  {
    q: "Can I download or delete my data?",
    a: (
      <>Yes. From your <strong>Profile → Privacy &amp; Data</strong> you can download a
      full copy of everything we hold, or permanently delete your account and all its
      data. See our <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>.</>
    ),
  },
  {
    q: "I'm under 18. Can I use Coach?",
    a: <>You can if you're 13 or older. If you're 13-17, a parent or guardian gives
      permission when you sign up.</>,
  },
];

export default function StudyHelp() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-4 py-3 flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur-sm z-40">
        <Link href="/" className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <span className="font-bold">Synops Coach</span>
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-10 leading-relaxed text-[15px] text-foreground/90">
        <Link href="/coach" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>

        <h1 className="text-3xl font-bold mb-2">Help &amp; FAQ</h1>
        <p className="text-sm text-muted-foreground mb-8">Answers to the questions we hear most.</p>

        <div className="space-y-7">
          {FAQS.map((f) => (
            <section key={f.q}>
              <h2 className="text-lg font-semibold mb-1.5">{f.q}</h2>
              <p>{f.a}</p>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-lg border bg-card p-5">
          <h2 className="text-lg font-semibold mb-1.5 flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> Still need help?
          </h2>
          <p className="text-sm text-muted-foreground mb-3">
            We usually reply within a day. Tell us what's happening and, if you can,
            what you were doing when it went wrong.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Synops%20Coach%20support`}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Mail className="h-4 w-4" /> Email support
          </a>
        </div>

        <div className="mt-8 pt-6 border-t text-sm text-muted-foreground">
          <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>
          {" · "}
          <Link href="/terms" className="text-primary underline">Terms of Service</Link>
        </div>
      </main>
    </div>
  );
}
