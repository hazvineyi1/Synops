import { Link } from "wouter";
import { BookOpen, ArrowLeft } from "lucide-react";

// Coach-specific terms of service. Plain language, versioned, matched to what
// Coach actually offers (learner accounts incl. minors, subscriptions via mobile
// money/card, AI-generated study aids). NOTE: have legal counsel review, and set
// the governing-law jurisdiction, before a public launch.
const LAST_UPDATED = "2 July 2026";
const CONTACT_EMAIL = "info@synops-consulting.com";

export default function StudyTerms() {
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

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-7">
          <section>
            <h2 className="text-lg font-semibold mb-2">1. Agreement</h2>
            <p>
              These terms are an agreement between you and Synops. By creating an
              account or using Synops Coach ("Coach"), you agree to them. If you do
              not agree, please do not use Coach.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">2. What Coach is</h2>
            <p>
              Coach is an AI study tool that turns your material into concepts,
              practice, mock exams, and tutoring. It supports your learning; it does
              not replace your own judgement, your teachers, or professional advice.
              AI-generated content can be incomplete or wrong, so please verify
              anything important before relying on it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">3. Who can use it</h2>
            <p>
              You must be at least 13 years old. If you are 13-17, you may use Coach
              only with a parent or guardian's permission, and you must provide their
              email at sign-up. You agree to give accurate information and to keep your
              password secure; you are responsible for activity on your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">4. Subscriptions and payments</h2>
            <p>
              Coach offers a free tier and paid plans. Prices are shown before you
              pay. Paid plans are billed through our payment providers by mobile money
              or card in your local currency. Card plans may renew automatically until
              you cancel; mobile-money plans renew manually. You can cancel at any
              time, and your paid features continue until the end of the period you
              have paid for. Except where the law requires otherwise, payments are
              non-refundable. If a renewal payment fails, we may downgrade your account
              to the free tier.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">5. Acceptable use</h2>
            <p>
              Use Coach for genuine, lawful study. Do not upload content you do not
              have the right to use, attempt to break, overload, or scrape the
              service, or use it to harm others. We may suspend accounts that break
              these rules.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">6. Your content</h2>
            <p>
              You keep ownership of the material you upload. You grant us the limited
              permission needed to store and process it to provide the service,
              including sending relevant parts to our AI provider to generate your
              study aids. You are responsible for what you upload.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">7. Ending your use</h2>
            <p>
              You can delete your account and all its data at any time from your
              profile. We may suspend or end access if you seriously or repeatedly
              breach these terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">8. Disclaimers and liability</h2>
            <p>
              Coach is provided "as is". To the fullest extent permitted by law, we
              are not liable for indirect or consequential losses, or for decisions
              you make based on AI-generated study content. Nothing in these terms
              limits rights that cannot be limited by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">9. Changes</h2>
            <p>
              We may update these terms; we will change the date above and, for
              material changes, notify you in the app. Continued use means you accept
              the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">10. Governing law</h2>
            <p>
              These Terms are governed by the laws of the Commonwealth of Virginia,
              United States, without regard to its conflict-of-law rules. Any dispute
              arising from these Terms or your use of Coach will be brought exclusively
              in the state or federal courts located in Virginia, and you consent to
              their jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">11. Contact</h2>
            <p>
              Questions about these terms? Email{" "}
              <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t text-sm text-muted-foreground">
          See also our <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>.
        </div>
      </main>
    </div>
  );
}
