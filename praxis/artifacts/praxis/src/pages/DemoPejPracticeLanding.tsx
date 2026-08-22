/*
 * Public demo landing for the PEJ Justice Practice class: a practice-credentials programme for
 * prosecutors and investigators, drawn from the PEJ-EVD-01 objectives. One-click, credential-less
 * sign-in as a fresh demo investigator, then straight into "My Credentials". Reuses the whole practice
 * engine with the coach "Mira". DEMO ONLY: everyone is a composite and every legal point is SME pending.
 */
import { useState } from "react";
import { useSession } from "@/context/SessionContext";

export default function DemoPejPracticeLanding() {
  const { demoSignIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const enter = async () => {
    if (!name.trim()) { setError("Add your first name first, so Mira can greet you properly."); return; }
    setBusy(true);
    setError(null);
    try {
      await demoSignIn("student", "pej-practice", undefined, name.trim());
      window.location.href = "/practice";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the demo. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "#e8ecf4" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "56px 24px 72px" }}>
        <p style={{ fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: "#93a2c4", margin: 0 }}>
          Synops · Justice-sector practice demo
        </p>
        <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 34, lineHeight: 1.15, margin: "10px 0 12px", color: "#ffffff" }}>
          PEJ Justice Practice
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.65, color: "#c4cde0", maxWidth: 640, margin: 0 }}>
          A practice-first programme for prosecutors and investigators, drawn from the work of documenting a
          conflict-related crime scene: safety-first sequencing, a lawful inspection that survives challenge,
          eliciting an account without leading, protecting the chain of custody, and the contemporaneous scene
          record. You earn credentials by taking something real from your own casework, reconstructed as a
          composite, and reflecting on it with Mira, a coach who asks rather than tells. Nothing is graded; an
          experienced reviewer recognises your work or refers it back with developmental feedback. You enter as
          an investigator just starting out, so you begin at the beginning: a short welcome, a clear goal, and
          your first credential to choose.
        </p>

        <div style={{ marginTop: 28, maxWidth: 420 }}>
          <label htmlFor="demo-name" style={{ fontSize: 13, fontWeight: 600, color: "#e8ecf4", display: "block", marginBottom: 6 }}>First, what should we call you?</label>
          <input
            id="demo-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") enter(); }}
            placeholder="Your first name"
            style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 15, border: "1px solid #33456B", borderRadius: 8, background: "#111c33", color: "#ffffff" }}
          />
          <button
            onClick={enter}
            disabled={busy}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8, marginTop: 14,
              background: "#A6813C", color: "#0f172a", border: "none", borderRadius: 8,
              padding: "14px 22px", fontSize: 15, fontWeight: 700,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Preparing your workspace…" : name.trim() ? `Begin, ${name.trim().split(" ")[0]} →` : "Begin the demo →"}
          </button>
          {error && <p style={{ fontSize: 13, color: "#f2a4a4", marginTop: 10 }}>{error}</p>}
        </div>

        <div style={{ fontSize: 13.5, color: "#b7c1d8", marginTop: 32, lineHeight: 1.7, maxWidth: 620, background: "#13203a", border: "1px solid #33456B", borderRadius: 10, padding: "16px 18px" }}>
          <p style={{ margin: 0 }}>
            A word on privacy and scope. This is a demo, so there is no account and no password, and we use your
            first name only to make the walkthrough feel personal. Everyone in it is a composite, and it is built
            so that no real case material is ever entered. Every legal point here is illustrative and SME sign-off
            pending, not operational guidance.
          </p>
        </div>
      </div>
    </div>
  );
}
