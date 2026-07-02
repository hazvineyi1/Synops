import { Link } from "wouter";
import { BookOpen, ArrowLeft } from "lucide-react";

// Coach-specific privacy policy. Written to reflect what the Coach app actually
// does (learner accounts incl. minors, uploaded study material, AI processing,
// mobile-money/card payments, and the export/delete data rights). Plain language,
// versioned. NOTE: have legal counsel review before a public launch.
const LAST_UPDATED = "2 July 2026";
const CONTACT_EMAIL = "support@synops-consulting.com";

export default function StudyPrivacy() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-4 py-3 flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur-sm z-40">
        <Link href="/" className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <span className="font-bold">Synops Coach</span>
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-10 leading-relaxed text-[15px] text-foreground/90">
        <Link href="/signup" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-7">
          <section>
            <h2 className="text-lg font-semibold mb-2">Who we are</h2>
            <p>
              Synops ("we", "us") operates Synops Coach, an AI study app that helps
              learners study their own material through concepts, practice, mock
              exams, and a tutor. This policy explains what we collect, why, who we
              share it with, and the choices you have. Questions? Email us at{" "}
              <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">What we collect</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Account details:</strong> your name, email, and date of birth. Your password is stored only as a secure one-way hash.</li>
              <li><strong>Guardian details (under-18s):</strong> if you are 13-17, a parent or guardian's email and their consent.</li>
              <li><strong>Study material you upload</strong> and the learning data we create from it: concepts, flashcards, practice and exam results, tutor conversations, knowledge maps, and progress.</li>
              <li><strong>Subscription and payment information:</strong> your plan and billing country. Payments are handled by our payment providers; we do not store your card or mobile-money PIN.</li>
              <li><strong>Usage and technical data:</strong> activity needed to run the service and improve it, plus short-lived server logs and error reports.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">How we use your data</h2>
            <p>
              We use it to run Coach for you, generate your study aids, personalise
              your experience, process payments, provide support, keep the service
              safe and secure, improve it, and meet legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">How AI processing works</h2>
            <p>
              To generate concepts, questions, and tutoring, we send the relevant
              study material and your learning preferences (such as goals, interests,
              and level) to our AI provider. We do <strong>not</strong> send your
              name, email, or account ID, and we automatically strip contact details
              (emails, phone numbers) from any free-text you enter about yourself
              before it is sent. The AI provider processes this only to return your
              results.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Children and guardians</h2>
            <p>
              Coach is not intended for children under 13, and we do not knowingly
              create accounts for them. Learners aged 13-17 must provide a parent or
              guardian's email and confirm their guardian's permission at sign-up. A
              parent or guardian may contact us at any time to review, export, or
              delete their child's information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Who we share it with</h2>
            <p>
              We share data only with the providers needed to run the service: our AI
              provider (to generate study aids), our payment providers (Paynow,
              Flutterwave, and Stripe, to process subscriptions), and our hosting and
              error-monitoring providers. We do <strong>not</strong> sell your data or
              run advertising trackers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Your rights</h2>
            <p>
              You can <strong>download a full copy of your data</strong> and{" "}
              <strong>permanently delete your account and all its data</strong> at any
              time from your profile's "Privacy &amp; Data" section. You may also ask
              us to correct your information or withdraw consent by emailing{" "}
              <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Retention and security</h2>
            <p>
              We keep your data while your account is active and delete it when you
              delete your account; secure backups rotate on a short schedule.
              Passwords are hashed, data is encrypted in transit, and access is
              restricted. No online service can be perfectly secure, but we work to
              protect your information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Cookies and local storage</h2>
            <p>
              We use a single sign-in cookie to keep you logged in, and your browser's
              local storage for basic preferences. We do not use advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Changes to this policy</h2>
            <p>
              If we make material changes we will update the date above and, where
              appropriate, notify you in the app.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t text-sm text-muted-foreground">
          See also our <Link href="/terms" className="text-primary underline">Terms of Service</Link>.
        </div>
      </main>
    </div>
  );
}
