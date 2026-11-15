/*
 * Front door for the Manchester Review Board Practice Hub.
 *
 * MRB runs Practice Credentials, not courses: a candidate brings real leadership work, reflects on it,
 * names and tests the ideas that explain it, and submits evidence to an independent reviewer. The
 * framework underneath is MRB's Framework for Advanced Leadership Practice (v2.1), grounded in ubuntu.
 *
 * Visual language matched to themrb.org.uk: white header with the MRB wordmark and a green sign-in
 * link, a charcoal hero with Playfair Display headings, Inter text, white bordered cards on an
 * off-white page, charcoal primary buttons, MRB green for accents, and a charcoal footer.
 *
 * mode="demo" (praxis host, /demos/mrb): one click signs the visitor in as the composite demo candidate.
 * mode="hub" (the MRB hub's own address): the button opens sign-in for real candidates, tutors and
 * reviewers, and the demo wording is dropped.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useSession } from "@/context/SessionContext";

// MRB palette, sampled from themrb.org.uk.
const CHARCOAL = "#353535";
const CHARCOAL_HI = "#454545";
const SLATE = "#4F596B"; // logotype
const GREEN = "#3FB383"; // buttons and links
const GREEN_LOGO = "#4DC187"; // logotype
const PAGE = "#FAFAFA";
const PANEL = "#F5F5F5";
const BORDER = "#E5E5E5";
const INK = "#262626";
const MUTED = "#5F5F5F";
const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Inter', system-ui, sans-serif";
const MAX = 1120;

const STEPS = [
  { n: "1", title: "Bring something real", body: "Start from leadership you have actually done. An activity from the last six months counts; you do not have to invent something new." },
  { n: "2", title: "Reflect, with Mutale", body: "Mutale is a coach that asks rather than tells. It helps you notice what happened, for you and for the people around you." },
  { n: "3", title: "Name it, then test it", body: "Find the situation you are really facing, choose between several ideas that might explain it, and test your choice against what happened." },
  { n: "4", title: "Submit for review", body: "Your reflection and evidence go to an independent reviewer, who returns developmental feedback with every decision." },
];

const PEOPLE = [
  { who: "You, the candidate", what: "Choose your credentials, agree a learning plan, and do the thinking." },
  { who: "Your tutor", what: "Agrees your learning plan and coaches you. Never reviews your work." },
  { who: "Mutale", what: "An AI thinking partner that asks questions, offers ideas to test, and never decides for you." },
  { who: "An independent reviewer", what: "An academic or experienced practitioner who reviews your portfolio. MRB moderates decisions." },
];

const PRINCIPLES = [
  { k: "Practice", v: "Real work, not coursework" },
  { k: "Reflection", v: "Coached, never graded" },
  { k: "Independence", v: "Separate tutor and reviewer" },
  { k: "Recognition", v: "Verifiable credentials" },
];

/** MRB wordmark: "The Manchester Review Board." in its logotype colours. */
function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span aria-label="The Manchester Review Board" style={{ fontFamily: SANS, fontWeight: 700, fontSize: size, lineHeight: 0.95, letterSpacing: "-0.03em", color: SLATE, display: "inline-block" }}>
      The <span style={{ color: GREEN_LOGO }}>Manchester</span>
      <br />
      Review Board<span style={{ color: GREEN_LOGO }}>.</span>
    </span>
  );
}

function SectionHeading({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div style={{ textAlign: center ? "center" : "left", marginBottom: 24 }}>
      <h2 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 28, color: INK, margin: 0 }}>{children}</h2>
      {center && <div aria-hidden style={{ width: 36, height: 3, background: MUTED, opacity: 0.6, margin: "12px auto 0", borderRadius: 2 }} />}
    </div>
  );
}

export default function DemoMRBLanding({ mode = "demo" }: { mode?: "demo" | "hub" }) {
  const hub = mode === "hub";
  const { demoSignIn } = useSession();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = async () => {
    if (hub) { navigate("/sign-in"); return; }
    setBusy(true);
    setError(null);
    try {
      await demoSignIn("student", "zambian-leadership");
      window.location.href = "/practice";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the demo. Please try again.");
      setBusy(false);
    }
  };

  const ctaLabel = hub ? "Sign in to the Practice Hub" : busy ? "Opening the Practice Hub…" : "Enter the Practice Hub";

  return (
    <div style={{ minHeight: "100vh", background: PAGE, color: INK, fontFamily: SANS }}>
      {/* Slim top bar, as on themrb.org.uk */}
      <div style={{ background: `linear-gradient(90deg, ${CHARCOAL}, ${CHARCOAL_HI})`, color: "#e5e5e5", fontSize: 12.5, textAlign: "center", padding: "7px 16px" }}>
        {hub ? "Practice Credentials · Framework for Advanced Leadership Practice" : "Practice Hub demo · Framework for Advanced Leadership Practice"}
      </div>

      {/* Header: wordmark left, sign-in right */}
      <header style={{ background: "#fff", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: MAX, margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <Wordmark size={19} />
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <span style={{ fontSize: 14, color: MUTED }}>Practice Hub</span>
            <button
              onClick={enter}
              disabled={busy}
              style={{ background: "none", border: "none", padding: 0, fontFamily: SANS, fontSize: 14, fontWeight: 500, color: GREEN, cursor: busy ? "default" : "pointer" }}
            >
              {hub ? "Sign in" : "Enter demo"}
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* Charcoal hero */}
        <section style={{ background: `radial-gradient(ellipse at 70% 40%, ${CHARCOAL_HI} 0%, ${CHARCOAL} 70%)`, color: "#fff" }}>
          <div style={{ maxWidth: MAX, margin: "0 auto", padding: "64px 20px 60px" }}>
            <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 44, lineHeight: 1.1, margin: 0 }}>
              Advanced Leadership Practice
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: "#e5e5e5", maxWidth: 620, margin: "14px 0 0" }}>
              Leadership is exercised through people, not over them.{" "}
              {hub
                ? "This is where you turn your real work into a recognised Practice Credential, reviewed against MRB's Framework for Advanced Leadership Practice."
                : "This demo shows how a leader turns real work into a recognised Practice Credential, assessed against MRB's Framework for Advanced Leadership Practice."}
            </p>
            <div style={{ marginTop: 28, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
              <button
                onClick={enter}
                disabled={busy}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: GREEN, color: "#fff", border: "none", borderRadius: 6,
                  padding: "12px 20px", fontFamily: SANS, fontSize: 15, fontWeight: 600,
                  cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
                }}
              >
                {ctaLabel} <span aria-hidden>→</span>
              </button>
            </div>
            <p style={{ fontSize: 13, color: "#cfcfcf", marginTop: 12, maxWidth: 620 }}>
              {hub
                ? "Use the email address MRB invited you with. First time here? Choose Forgot password on the sign-in page to set yours."
                : "No sign-up. You enter as Chanda Mulenga, a composite candidate with credentials at different stages. Nothing you do is recorded against a real account."}
            </p>
            {error && <p style={{ fontSize: 13, color: "#fca5a5", marginTop: 8 }}>{error}</p>}
          </div>
        </section>

        {/* Intro, as MRB's pages open: a short centred paragraph on white */}
        <section style={{ background: "#fff", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px" }}>
            <p style={{ fontSize: 15.5, lineHeight: 1.7, color: MUTED, margin: 0 }}>
              The framework is grounded in <em>ubuntu</em>: leadership as a responsibility that comes from our connection to
              others, carried out through relationships, obligations and citizenship, with the aim of communities and
              organisations flourishing together.
            </p>
          </div>
        </section>

        {/* How a credential works: white cards with a numbered icon tile */}
        <section style={{ background: PAGE }}>
          <div style={{ maxWidth: MAX, margin: "0 auto", padding: "52px 20px" }}>
            <SectionHeading center>How a credential works</SectionHeading>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
              {STEPS.map((s) => (
                <div key={s.n} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, padding: 20, display: "flex", gap: 14 }}>
                  <div style={{ flex: "0 0 auto", width: 36, height: 36, borderRadius: 6, background: PANEL, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SERIF, fontSize: 18, color: INK }}>{s.n}</div>
                  <div>
                    <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 17, margin: "4px 0 6px" }}>{s.title}</div>
                    <div style={{ fontSize: 14, lineHeight: 1.55, color: MUTED }}>{s.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Who is involved + principles, laid out like MRB's "Our Learning Approach" */}
        <section style={{ background: "#fff" }}>
          <div style={{ maxWidth: MAX, margin: "0 auto", padding: "52px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 32 }}>
            <div>
              <SectionHeading>The framework</SectionHeading>
              <p style={{ fontSize: 15, lineHeight: 1.65, color: MUTED, margin: 0 }}>
                Twelve Core Competencies, from Responsible Accountability and Restorative Engagement to Ethical Judgement and
                Personal Growth and Self-Mastery. Each credential develops one competency as its main focus and often
                contributes to others. No one is expected to demonstrate all twelve: teams and organisations build the full
                range together.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 24 }}>
                {PRINCIPLES.map((p) => (
                  <div key={p.k} style={{ background: "#F0F0F0", borderRadius: 6, padding: "16px 12px", textAlign: "center" }}>
                    <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 20, color: INK }}>{p.k}</div>
                    <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>{p.v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, padding: 24, alignSelf: "start" }}>
              <h3 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 20, margin: "0 0 14px" }}>Who is involved</h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {PEOPLE.map((p) => (
                  <li key={p.who} style={{ display: "flex", gap: 10, padding: "8px 0", fontSize: 14, lineHeight: 1.5 }}>
                    <span aria-hidden style={{ flex: "0 0 auto", width: 6, height: 6, borderRadius: 3, background: MUTED, marginTop: 8 }} />
                    <span><strong style={{ color: INK, fontWeight: 600 }}>{p.who}.</strong> <span style={{ color: MUTED }}>{p.what}</span></span>
                  </li>
                ))}
              </ul>
              <button
                onClick={enter}
                disabled={busy}
                style={{ marginTop: 16, width: "100%", background: CHARCOAL, color: "#fff", border: "none", borderRadius: 6, padding: "11px 16px", fontFamily: SANS, fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer" }}
              >
                {ctaLabel} <span aria-hidden>→</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Charcoal footer */}
      <footer style={{ background: CHARCOAL, color: "#cfcfcf" }}>
        <div style={{ maxWidth: MAX, margin: "0 auto", padding: "32px 20px", fontSize: 13, lineHeight: 1.6 }}>
          <p style={{ margin: 0, maxWidth: 640 }}>
            {hub
              ? "Framework for Advanced Leadership Practice v2.1, published by The Manchester Review Board. Every decision comes with developmental feedback, and accepted credentials are issued as verifiable digital records."
              : "Demo build. People, organisations and examples are composites. Credential wording and examples are illustrative until approved by the MRB academic board. Framework for Advanced Leadership Practice v2.1, published by The Manchester Review Board."}
          </p>
          <div style={{ borderTop: "1px solid #4a4a4a", marginTop: 20, paddingTop: 14, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
            <span>© {new Date().getFullYear()} The Manchester Review Board</span>
            <span>Practice Hub run for MRB by Synops Consulting</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
