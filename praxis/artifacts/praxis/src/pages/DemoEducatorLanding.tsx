/*
 * Public demo landing for the Educator Professional Development practice class ("Thoughtful AI in
 * teaching"). One-click, credential-less sign-in as the demo educator (Maria Alvarez), then straight
 * into "My Credentials". Reuses the whole practice engine; everyone is a composite.
 */
import { useState } from "react";
import { useSession } from "@/context/SessionContext";

export default function DemoEducatorLanding() {
  const { demoSignIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = async () => {
    setBusy(true);
    setError(null);
    try {
      await demoSignIn("student", "educator-pd");
      window.location.href = "/practice";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the demo. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5fb", color: "#1b1f3b" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "56px 24px 72px" }}>
        <p style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6b7280", margin: 0 }}>
          Synops · Professional development demo
        </p>
        <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 34, lineHeight: 1.15, margin: "10px 0 12px" }}>
          Thoughtful AI in teaching
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "#374151", maxWidth: 640, margin: 0 }}>
          A practice-first professional development class for educators, built on adult learning theory: it starts from
          your own classroom, respects your judgement, and is coached, not tested. You earn credentials by doing real
          teaching and reflecting on it, from AI-assisted lesson design to assessment integrity, with Mutale, a
          thinking-partner who asks rather than tells. Nothing is graded; an experienced reviewer recognises your work or
          refers it back with developmental feedback. Enter as Maria, a demo teacher part-way through her portfolio.
        </p>

        <div style={{ marginTop: 28 }}>
          <button
            onClick={enter}
            disabled={busy}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#3B4CB8", color: "#fff", border: "none", borderRadius: 12,
              padding: "14px 22px", fontSize: 15, fontWeight: 600,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Starting the demo…" : "Enter the practice class →"}
          </button>
          <p style={{ fontSize: 12.5, color: "#6b7280", marginTop: 10 }}>
            No sign-up. You enter as a demo educator; nothing you do is recorded against a real account.
          </p>
          {error && <p style={{ fontSize: 13, color: "#b42318", marginTop: 8 }}>{error}</p>}
        </div>

        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 40, lineHeight: 1.6 }}>
          Demo build · credentials and personas are composites, illustrating a professional development programme for an
          educator audience.
        </p>
      </div>
    </div>
  );
}
