/**
 * Public privacy policy for Synops Praxis. Linked from the marketing footer
 * (Home.tsx) and routed at /privacy. Describes the data the LMS actually holds
 * (accounts, enrolments, gradebook, credentials) for its partner organisations.
 */
export function Privacy() {
  return (
    <div className="min-h-screen bg-background pt-20 font-sans">
      <section className="py-20 max-w-[820px] mx-auto px-6">
        <p className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground mb-6">
          Privacy Policy
        </p>
        <h1 className="font-serif text-4xl md:text-5xl text-primary leading-[1.1] tracking-wide mb-10">
          How we handle data.
        </h1>
        <p className="text-[13px] text-muted-foreground mb-12">Last updated: July 2026</p>

        <div className="max-w-none text-foreground/85 leading-[1.75] space-y-8">
          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">Who we are</h2>
            <p>
              Synops ("we") operates Synops Praxis, a learning-management platform used by
              partner organisations to deliver courses to their learners. This policy
              explains what data we collect, why, and what you can ask us to do with it.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">What we collect</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account data:</strong> name, email, role (learner, coach, organisation admin, instructional designer, funder) and the partner organisation you belong to.</li>
              <li><strong>Learning data:</strong> enrolments, course progress, checkpoint and assignment responses, grades, mastery scores and credentials you earn.</li>
              <li><strong>Content you create:</strong> courses, modules, activities, cases and messages produced by staff and learners on the platform.</li>
              <li><strong>Support and access requests:</strong> details submitted through the request-access and support forms.</li>
              <li><strong>Server logs:</strong> short-lived technical logs needed to keep the service running and diagnose errors.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">What we do not collect</h2>
            <p>
              We do not run advertising trackers, we do not sell data, and we do not build
              behavioural profiles for anyone but the learner's own progress. Learner records
              exist to run the courses their organisation has enrolled them in.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">Why we use it</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To run the Praxis service for your organisation.</li>
              <li>To deliver tutoring and grading, by sending the relevant prompt context to a language-model provider on your behalf for a single request.</li>
              <li>To produce the gradebooks, credentials and funder reports the platform provides.</li>
              <li>To respond to access and support requests.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">Who sees it</h2>
            <p>
              Staff of your partner organisation with a role that grants access (coaches,
              organisation admins), Synops staff with a need to know, our infrastructure
              providers (hosting, database, file storage), and our language-model providers,
              which receive only the prompt content for a single request and do not retain it
              for training. Data is isolated per organisation.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">How long we keep it</h2>
            <p>
              Account and learning data is kept while the account is active and for as long as
              the partner organisation requires it for its records. Support requests are kept
              for up to 24 months. Technical logs are short-lived.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">Your rights</h2>
            <p>
              You can ask us to export, correct or delete your data. Write to{" "}
              <a className="text-primary underline" href="mailto:info@synops-consulting.com">info@synops-consulting.com</a>{" "}
              and we will respond within 30 days. We honour GDPR and equivalent requests, and
              we support the data-protection obligations of the organisations we serve.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">Contact</h2>
            <p>
              Questions about this policy go to{" "}
              <a className="text-primary underline" href="mailto:info@synops-consulting.com">info@synops-consulting.com</a>.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}

export default Privacy;
