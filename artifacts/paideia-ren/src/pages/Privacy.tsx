export default function Privacy() {
  return (
    <div className="min-h-screen pt-20">
      <section className="py-[120px] max-w-[820px] mx-auto px-6">
        <p className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground mb-6">Privacy Policy</p>
        <h1 className="font-serif text-5xl md:text-[64px] text-primary leading-[1.1] tracking-wide mb-10">
          How we handle data.
        </h1>
        <p className="text-[13px] text-muted-foreground mb-12">Last updated: May 2026</p>

        <div className="prose prose-lg max-w-none text-foreground/85 leading-[1.75] space-y-8">
          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">Who we are</h2>
            <p>Synops ("we") builds Synops Teacher, a teaching assistant used by educators in pilot classrooms. This policy explains what data we collect, why, and what you can ask us to do with it.</p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">What we collect</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Teacher account data:</strong> name, email, school name, country, subjects and year groups you teach. You enter this when you sign up.</li>
              <li><strong>Resources you create:</strong> lesson plans, worksheets, quizzes, parent updates, classes and student rosters you add to the platform.</li>
              <li><strong>Pilot enquiries:</strong> school name, contact name and contact email submitted via the pilot request form.</li>
              <li><strong>Product analytics:</strong> anonymous page views and feature usage events so we can improve what is working and remove what is not.</li>
              <li><strong>Server logs:</strong> short-lived technical logs needed to keep the service running and diagnose errors.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">What we do not collect</h2>
            <p>We do not run advertising trackers. We do not sell data. We do not build behavioural profiles of children. Student records are kept only when a teacher chooses to add a class roster, and they are stored under the teacher's account.</p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">Why we use it</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To run the Synops Teacher service for you.</li>
              <li>To generate the lesson plans, worksheets and quizzes you ask for, by sending the relevant prompt context to a language-model provider on your behalf.</li>
              <li>To respond to pilot enquiries and support requests.</li>
              <li>To understand which features genuinely help teachers.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">Who sees it</h2>
            <p>Synops staff with a need to know. Our infrastructure providers (hosting and database). Our language-model providers, which receive only the prompt content for a single request and do not retain it for training.</p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">How long we keep it</h2>
            <p>Account and resource data is kept while your account is active. Pilot enquiries are kept for up to 24 months. Analytics events are aggregated and rolled up; raw events older than 12 months are discarded.</p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">Your rights</h2>
            <p>You can ask us to export, correct or delete your data at any time. Write to <a className="text-terracotta underline" href="mailto:info@synops-consulting.com">info@synops-consulting.com</a> and we will respond within 30 days. We honour FERPA, COPPA, GDPR and UK GDPR requests from schools.</p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-primary mb-3">Contact</h2>
            <p>Questions about this policy go to <a className="text-terracotta underline" href="mailto:info@synops-consulting.com">info@synops-consulting.com</a>.</p>
          </section>
        </div>
      </section>
    </div>
  );
}
