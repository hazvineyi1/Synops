import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

function Endpoint({ method, path, desc }: { method: string; path: string; desc: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-2 border-b border-border/50">
      <span className="text-xs font-semibold text-primary w-14 shrink-0">{method}</span>
      <code className="font-mono text-sm text-foreground">{path}</code>
      <span className="text-sm text-muted-foreground">{desc}</span>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-lg font-medium text-foreground mb-2">{heading}</h2>
      <div className="space-y-2 text-[0.95rem] leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

export default function Developers() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground font-sans">
      <header className="py-4 md:py-6 px-4 md:px-12 border-b border-border/40 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 text-primary no-underline">
          <ArrowLeft className="w-4 h-4" />
          <img src="/logo.svg" alt="Arete" className="w-6 h-6 rounded" />
          <span className="font-serif font-semibold text-lg tracking-tight">Arete</span>
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 md:px-6 py-10 space-y-8">
        <div>
          <h1 className="font-serif text-3xl text-primary font-medium mb-1">Developer API</h1>
          <p className="text-sm text-muted-foreground">
            Build on the Coach: ingest material, read progress, and receive events. Create keys in Settings → Developer API.
          </p>
        </div>

        <Section heading="Authentication">
          <p>Pass your secret key as a bearer token. Every call acts as the key's owner account.</p>
          <pre className="bg-muted/40 border border-border rounded-md p-3 text-xs overflow-x-auto font-mono">
{`curl https://YOUR_HOST/api/v1/me \\
  -H "Authorization: Bearer coach_sk_..."`}
          </pre>
        </Section>

        <Section heading="Endpoints">
          <div>
            <Endpoint method="GET" path="/api/v1/me" desc="The account the key belongs to, and its tier." />
            <Endpoint method="GET" path="/api/v1/concepts" desc="The learner's concept library with mastery." />
            <Endpoint method="GET" path="/api/v1/progress" desc="Readiness, mastered count, accuracy." />
            <Endpoint method="GET" path="/api/v1/plan/today" desc="Today's study plan, if one exists." />
            <Endpoint method="POST" path="/api/v1/material" desc="Body { text }. Extracts and stores concepts." />
          </div>
          <p className="text-xs text-muted-foreground">
            Calls are rate-limited per account (Free 50/day, Pro 500/day) and honor the same plan limits as the app.
          </p>
        </Section>

        <Section heading="Webhooks">
          <p>
            Subscribe a URL in Settings → Developer API. We POST a JSON body for each event with an{" "}
            <code className="font-mono text-sm">X-Coach-Signature</code> header.
          </p>
          <p>Events:</p>
          <ul className="list-none pl-0 space-y-1">
            <li>
              <code className="font-mono text-sm">checkpoint.graded</code> — a checkpoint was graded (conceptId, score, confidenceBefore).
            </li>
            <li>
              <code className="font-mono text-sm">plan.completed</code> — a daily plan was marked completed.
            </li>
          </ul>
          <p>
            Verify the signature like Stripe: the header is{" "}
            <code className="font-mono text-sm">t=TIMESTAMP,v1=SIGNATURE</code>, where SIGNATURE is{" "}
            <code className="font-mono text-sm">HMAC_SHA256(secret, `${"{t}"}.${"{rawBody}"}`)</code>.
          </p>
        </Section>

        <div className="pt-4 border-t border-border text-sm">
          <Link href="/settings" className="text-primary underline">Manage your keys and webhooks</Link>
        </div>
      </main>
    </div>
  );
}
