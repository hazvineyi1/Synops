/*
 * Public demo landing for the Zambian Clinician Leadership course ("Leading with Purpose").
 *
 * One-click, credential-less sign-in as an enrolled demo learner, then a deep-link straight into the
 * first module: the full content experience (readings, video, decision station, Mutale coach,
 * discussion, reflection, assessment, workshop). Mirrors the PEJ landing.
 */
import { useState } from "react";
import { useSession } from "@/context/SessionContext";
import { apiFetch } from "@/lib/api";

export default function DemoMRBLanding() {
  const { demoSignIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enterCourse = async () => {
    setBusy(true);
    setError(null);
    try {
      await demoSignIn("student", "zambian-leadership");
      let dest = "/dashboard";
      try {
        const r = await apiFetch<{ courseId: string; moduleId: string | null }>("/auth/demo-course?tenant=zambian-leadership");
        if (r.courseId && r.moduleId) dest = `/courses/${r.courseId}/modules/${r.moduleId}`;
        else if (r.courseId) dest = `/courses/${r.courseId}`;
      } catch {
        /* fall back to the dashboard if the resolver is unavailable */
      }
      window.location.href = dest;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the demo. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f6f4ef", color: "#1c2430" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "56px 24px 72px" }}>
        <p style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6b7280", margin: 0 }}>
          Synops Praxis · Interactive demo
        </p>
        <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 34, lineHeight: 1.15, margin: "10px 0 12px" }}>
          Leading with Purpose
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "#374151", maxWidth: 640, margin: 0 }}>
          A values-driven leadership programme for Zambian clinicians, prepared for the Manchester Review Board
          practice-credentials portfolio. Enter the full course as a learner, with readings, an interactive decision
          station, and Mutale, a leadership thinking-partner who coaches by asking, not telling. Two decision-first
          modules; results resolve to pass or resubmit with developmental feedback, not a percentage. Everyone and every
          facility is a composite.
        </p>

        <div style={{ marginTop: 28 }}>
          <button
            onClick={enterCourse}
            disabled={busy}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#1c2430", color: "#fff", border: "none", borderRadius: 12,
              padding: "14px 22px", fontSize: 15, fontWeight: 600,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Starting the demo…" : "Enter the full course →"}
          </button>
          <p style={{ fontSize: 12.5, color: "#6b7280", marginTop: 10 }}>
            No sign-up. You enter as a demo learner enrolled in the course; nothing you do is recorded against a real account.
          </p>
          {error && <p style={{ fontSize: 13, color: "#b42318", marginTop: 8 }}>{error}</p>}
        </div>

        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 40, lineHeight: 1.6 }}>
          Demo build v0.1 · policy and regulatory references are illustrative placeholders, pending subject-matter-expert
          and Zambian health-law sign-off. Rubrics are first drafts for tutor-trio and academic-board review.
        </p>
      </div>
    </div>
  );
}
