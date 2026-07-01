export default function Terms() {
  return (
    <div className="min-h-screen pt-20">
      <section className="py-[120px] max-w-[820px] mx-auto px-6">
        <p className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground mb-6">Terms of Service</p>
        <h1 className="font-serif text-5xl md:text-[64px] text-primary leading-[1.1] tracking-wide mb-10">
          Plain-language terms.
        </h1>
        <p className="text-[13px] text-muted-foreground mb-12">Last updated: May 2026</p>

        <div className="prose prose-lg max-w-none text-foreground/85 leading-[1.75] space-y-8">
          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">1. Who this is between</h2>
            <p>These terms are between you (the teacher, school administrator or visitor using the service) and Synops.</p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">2. What the service is</h2>
            <p>Synops Teacher helps teachers draft lesson plans, worksheets, quizzes and parent updates, and lets them manage classes and assignments. It is a tool that augments a teacher; it does not replace teacher judgement.</p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">3. Accounts</h2>
            <p>Teacher accounts are reviewed by the founder before they can create resources. You agree to give accurate sign-up information and to keep your password safe. If your password is lost, contact the founder to receive a one-time reset link.</p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">4. Acceptable use</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use the service for genuine classroom work.</li>
              <li>Do not upload content you do not have the right to use.</li>
              <li>Do not try to bypass authentication, scrape the service, or attack its infrastructure.</li>
              <li>Do not use the service to generate material that is unlawful, harmful to children, or in breach of your school's policies.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">5. Your content</h2>
            <p>You keep ownership of the lesson plans, worksheets, quizzes and other content you create. You grant us a limited licence to store and process that content as needed to run the service for you.</p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">6. AI-generated drafts</h2>
            <p>Drafts produced by the service are starting points. They may contain errors. A teacher must review every draft before using it in class or sending it to a parent. Synops is not liable for content used in class without that review.</p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">7. Availability</h2>
            <p>The service is currently in pilot. We aim for high availability but do not guarantee uptime, and we may pause features to fix problems or ship improvements.</p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">8. Ending an account</h2>
            <p>You can stop using the service at any time. We may suspend an account that breaks these terms or that puts students at risk; we will explain the reason where we can.</p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">9. Liability</h2>
            <p>The service is provided "as is" during pilot. To the extent the law allows, Synops is not liable for indirect or consequential losses. Nothing in these terms limits any liability that cannot be limited by law.</p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">10. Changes</h2>
            <p>We may update these terms. We will post the new version here with the updated date. Material changes will be flagged inside the app.</p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">11. Contact</h2>
            <p>Questions go to <a className="text-terracotta underline" href="mailto:info@synops-consulting.com">info@synops-consulting.com</a>.</p>
          </section>
        </div>
      </section>
    </div>
  );
}
