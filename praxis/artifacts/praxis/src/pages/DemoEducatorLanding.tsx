/*
 * Public demo landing for the Educator Professional Development practice class ("Thoughtful AI in
 * teaching"). One-click, credential-less sign-in as a fresh demo educator (Sam Rivera), then straight
 * into "My Credentials". Reuses the whole practice engine; everyone is a composite.
 */
import { useState } from "react";
import { useSession } from "@/context/SessionContext";

export default function DemoEducatorLanding() {
  const { demoSignIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const enter = async () => {
    if (!name.trim()) { setError("Pop your first name in first, so Eve can greet you properly."); return; }
    setBusy(true);
    setError(null);
    try {
      await demoSignIn("student", "educator-pd", undefined, name.trim());
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
          refers it back with developmental feedback. You enter as a teacher just starting out, so you begin where every
          educator does: a short welcome, a clear goal, and your first credential to choose.
        </p>

        <div style={{ marginTop: 28, maxWidth: 420 }}>
          <label htmlFor="demo-name" style={{ fontSize: 13, fontWeight: 600, color: "#1b1f3b", display: "block", marginBottom: 6 }}>First, what should we call you?</label>
          <input
            id="demo-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") enter(); }}
            placeholder="Your first name"
            style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 15, border: "1px solid #cdd0e0", borderRadius: 10, background: "#fff" }}
          />
          <button
            onClick={enter}
            disabled={busy}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8, marginTop: 14,
              background: "#3B4CB8", color: "#fff", border: "none", borderRadius: 10,
              padding: "14px 22px", fontSize: 15, fontWeight: 600,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Getting things ready…" : name.trim() ? `Start, ${name.trim().split(" ")[0]} →` : "Start the demo →"}
          </button>
          {error && <p style={{ fontSize: 13, color: "#b42318", marginTop: 10 }}>{error}</p>}
        </div>

        <div style={{ fontSize: 13.5, color: "#4b5162", marginTop: 32, lineHeight: 1.7, maxWidth: 600, background: "#eeeefb", border: "1px solid #dcdcf3", borderRadius: 12, padding: "16px 18px" }}>
          <p style={{ margin: 0 }}>
            A quick, honest word on privacy. This is a demo, so there is no account and no password. We use your first
            name only to make the walkthrough feel personal.
          </p>
        </div>
      </div>
    </div>
  );
}
