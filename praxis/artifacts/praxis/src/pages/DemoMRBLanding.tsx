/*
 * Public demo landing for the Manchester Review Board Practice Hub.
 *
 * MRB runs Practice Credentials, not courses: a candidate brings real leadership work, reflects on it,
 * names and tests the ideas that explain it, and submits evidence to an independent reviewer. The
 * framework underneath is MRB's Framework for Advanced Leadership Practice (v2.1), grounded in ubuntu.
 * One click signs the visitor in as the composite demo candidate and opens "My Credentials".
 */
import { useState } from "react";
import { useSession } from "@/context/SessionContext";

const INK = "#14212b";
const PETROL = "#1B4965";
const GOLD = "#C58B2C";
const MUTED = "#4b5563";
const SERIF = "Georgia, 'Times New Roman', serif";

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

export default function DemoMRBLanding() {
  const { demoSignIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = async () => {
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

  return (
    <div style={{ minHeight: "100vh", background: "#f6f4ef", color: INK }}>
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "56px 20px 72px" }}>
        <p style={{ fontSize: 12.5, letterSpacing: "0.14em", textTransform: "uppercase", color: PETROL, margin: 0, fontWeight: 600 }}>
          The Manchester Review Board · Practice Hub demo
        </p>
        <h1 style={{ fontFamily: SERIF, fontSize: 36, lineHeight: 1.12, margin: "10px 0 14px" }}>
          Advanced Leadership Practice
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: "#2b3440", maxWidth: 660, margin: 0 }}>
          Leadership is exercised through people, not over them. This demo shows how a leader turns real work into a
          recognised Practice Credential, assessed against MRB's Framework for Advanced Leadership Practice.
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.65, color: MUTED, maxWidth: 660, margin: "12px 0 0" }}>
          The framework is grounded in <em>ubuntu</em>: leadership as a responsibility that comes from our connection to
          others, carried out through relationships, obligations and citizenship, with the aim of communities and
          organisations flourishing together.
        </p>

        <div style={{ marginTop: 28 }}>
          <button
            onClick={enter}
            disabled={busy}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: PETROL, color: "#fff", border: "none", borderRadius: 10,
              padding: "14px 22px", fontSize: 15, fontWeight: 600,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Opening the Practice Hub…" : "Enter the Practice Hub →"}
          </button>
          <p style={{ fontSize: 13, color: MUTED, marginTop: 10, maxWidth: 620 }}>
            No sign-up. You enter as Chanda Mulenga, a composite candidate with credentials at different stages. Nothing
            you do is recorded against a real account.
          </p>
          {error && <p style={{ fontSize: 13, color: "#b42318", marginTop: 8 }}>{error}</p>}
        </div>

        <section style={{ marginTop: 44 }}>
          <h2 style={{ fontFamily: SERIF, fontSize: 22, margin: "0 0 14px" }}>How a credential works</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            {STEPS.map((s) => (
              <div key={s.n} style={{ background: "#fff", border: "1px solid #e4e0d6", borderTop: `3px solid ${GOLD}`, padding: "14px 14px 16px" }}>
                <div style={{ fontFamily: SERIF, fontSize: 20, color: PETROL }}>{s.n}</div>
                <div style={{ fontWeight: 600, fontSize: 14.5, margin: "4px 0 6px" }}>{s.title}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55, color: MUTED }}>{s.body}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontFamily: SERIF, fontSize: 22, margin: "0 0 12px" }}>Who is involved</h2>
          <div style={{ background: "#fff", border: "1px solid #e4e0d6" }}>
            {PEOPLE.map((p, i) => (
              <div key={p.who} style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", padding: "12px 16px", borderTop: i ? "1px solid #eee9de" : "none" }}>
                <div style={{ fontWeight: 600, fontSize: 14.5, minWidth: 190 }}>{p.who}</div>
                <div style={{ fontSize: 14, color: MUTED, flex: "1 1 280px", lineHeight: 1.5 }}>{p.what}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontFamily: SERIF, fontSize: 22, margin: "0 0 10px" }}>The framework</h2>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: MUTED, margin: 0, maxWidth: 680 }}>
            Twelve Core Competencies, from Responsible Accountability and Restorative Engagement to Ethical Judgement and
            Personal Growth and Self-Mastery. Each credential develops one competency as its main focus and often
            contributes to others. No one is expected to demonstrate all twelve: teams and organisations build the full
            range together, and the Hub shows that collective picture.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: MUTED, margin: "10px 0 0", maxWidth: 680 }}>
            Every decision comes with developmental feedback. Accepted credentials are issued as verifiable digital records.
          </p>
        </section>

        <p style={{ fontSize: 12.5, color: MUTED, marginTop: 44, lineHeight: 1.6, borderTop: "1px solid #e4e0d6", paddingTop: 14 }}>
          Demo build. People, organisations and examples are composites. Credential wording and examples are illustrative
          until approved by the MRB academic board. Framework for Advanced Leadership Practice v2.1, published by The
          Manchester Review Board.
        </p>
      </main>
    </div>
  );
}
