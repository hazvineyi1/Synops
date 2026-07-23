/**
 * Public terms of service for Synops Praxis. Linked from the marketing footer
 * (Home.tsx) and routed at /terms.
 */
export function Terms() {
  return (
    <div className="min-h-screen bg-background pt-20 font-sans">
      <section className="py-20 max-w-[820px] mx-auto px-6">
        <p className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground mb-6">
          Terms of Service
        </p>
        <h1 className="font-serif text-4xl md:text-5xl text-primary leading-[1.1] tracking-wide mb-10">
          Plain-language terms.
        </h1>
        <p className="text-[13px] text-muted-foreground mb-12">Last updated: July 2026</p>

        <div className="max-w-none text-foreground/85 leading-[1.75] space-y-8">
          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">1. Who this is between</h2>
            <p>
              These terms are between you (a learner, member of staff, or visitor using the
              service) and Synops, and are subject to any separate agreement between Synops and
              the partner organisation that granted your access.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">2. What the service is</h2>
            <p>
              Synops Praxis is a learning-management platform for delivering courses, tutoring,
              assessment and credentials to learners within partner organisations. It augments
              teaching and administration; it does not replace human judgement on grading or
              compliance decisions.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">3. Accounts</h2>
            <p>
              Accounts are provisioned by your organisation or by Synops. You agree to provide
              accurate information and to keep your credentials safe. If you lose your password,
              an administrator can issue a one-time reset link.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">4. Acceptable use</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use the service for genuine learning and course-delivery work.</li>
              <li>Do not upload content you do not have the right to use.</li>
              <li>Do not attempt to bypass authentication, access another organisation's data, scrape the service, or attack its infrastructure.</li>
              <li>Do not use the service to generate unlawful or harmful material, or anything in breach of your organisation's policies.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">5. Your content</h2>
            <p>
              You and your organisation keep ownership of the courses, submissions and other
              content you create. You grant us a limited licence to store and process that
              content as needed to run the service for you.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">6. Availability</h2>
            <p>
              We work to keep the service available and backed up, but it is provided "as is"
              without a warranty of uninterrupted operation. Planned maintenance is communicated
              through your organisation where practical.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">7. Changes and contact</h2>
            <p>
              We may update these terms; material changes are communicated through the platform
              or your organisation. Questions go to{" "}
              <a className="text-primary underline" href="mailto:info@synops-consulting.com">info@synops-consulting.com</a>.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}

export default Terms;
