/*
 * Public demo landing for the Project Expedite Justice course (2 modules).
 *
 * Self-contained, no auth. This is the single clean link shared with reviewers/partners:
 * it introduces the course and links the two interactive module demos, each of which is a
 * standalone FocusRoute-style page rendered publicly.
 */
import { useLocation } from "wouter";

const MODULES = [
  {
    href: "/demos/pej-evd-01",
    code: "PEJ-EVD-01 · Module 1",
    title: "Documenting the scene",
    blurb:
      "You are the first qualified officer at a conflict-related crime scene under field conditions. Sequence the site, isolate digital evidence, and keep the chain of custody unbroken.",
    minutes: "35 min",
  },
  {
    href: "/demos/pej-evd-02",
    code: "PEJ-EVD-01 · Module 2",
    title: "Getting the account",
    blurb:
      "Take an initial account without leading the witness. Elicit trauma-informed, non-suggestive testimony that stands up as evidence.",
    minutes: "35 min",
  },
];

export default function DemoPEJLanding() {
  const [, navigate] = useLocation();
  return (
    <div style={{ minHeight: "100vh", background: "#f6f4ef", color: "#122a45" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "56px 24px 72px" }}>
        <p style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6b7280", margin: 0 }}>
          Synops Praxis · Interactive demo
        </p>
        <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 34, lineHeight: 1.15, margin: "10px 0 12px" }}>
          Evidence at the conflict-related crime scene
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "#374151", maxWidth: 640, margin: 0 }}>
          A two-module training experience for justice-sector professionals, built with Project Expedite Justice. Work
          through the decisions a first responder faces, with an on-hand coach and immediate, reasoned feedback. Every
          person, place and file is a composite; nothing here is a real case.
        </p>

        <div style={{ display: "grid", gap: 16, marginTop: 32 }}>
          {MODULES.map((m) => (
            <button
              key={m.href}
              onClick={() => navigate(m.href)}
              style={{
                textAlign: "left",
                background: "#ffffff",
                border: "1px solid #e3ddd2",
                borderRadius: 16,
                padding: 22,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(18,42,69,0.04)",
                transition: "border-color .15s, box-shadow .15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#c9a24b";
                e.currentTarget.style.boxShadow = "0 6px 18px rgba(18,42,69,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e3ddd2";
                e.currentTarget.style.boxShadow = "0 1px 2px rgba(18,42,69,0.04)";
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>{m.code}</span>
                <span style={{ fontSize: 12, color: "#6b7280" }}>{m.minutes}</span>
              </div>
              <h2 style={{ fontFamily: "Georgia, serif", fontSize: 22, margin: "6px 0 8px" }}>{m.title}</h2>
              <p style={{ fontSize: 15, lineHeight: 1.55, color: "#374151", margin: 0 }}>{m.blurb}</p>
              <span style={{ display: "inline-block", marginTop: 14, color: "#122a45", fontWeight: 600, fontSize: 14 }}>
                Start module →
              </span>
            </button>
          ))}
        </div>

        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 28, lineHeight: 1.6 }}>
          Demo build v0.1 · legal content is illustrative and pending subject-matter-expert sign-off. Nothing you do here
          is recorded against any account.
        </p>
      </div>
    </div>
  );
}
