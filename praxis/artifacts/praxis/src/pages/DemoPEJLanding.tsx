/*
 * Public demo landing for the Project Expedite Justice course (2 modules).
 *
 * Primary action: one-click, credential-less sign-in as an Executive Learning demo learner who is
 * enrolled in the full published course, then a deep-link straight into it (all tabs: overview,
 * video, readings, activities, case studies, discussion, reflection, assessment, workshop).
 * Secondary: the two self-contained interactive stations, for a quick preview without the full shell.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useSession } from "@/context/SessionContext";
import { apiFetch } from "@/lib/api";

const STATIONS = [
  { href: "/demos/pej-evd-01", code: "Module 1", title: "Documenting the scene" },
  { href: "/demos/pej-evd-02", code: "Module 2", title: "Getting the account" },
];

export default function DemoPEJLanding() {
  const [, navigate] = useLocation();
  const { demoSignIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enterCourse = async () => {
    setBusy(true);
    setError(null);
    try {
      await demoSignIn("student", "executive-learning");
      let courseId: string | null = null;
      try {
        const r = await apiFetch<{ courseId: string }>("/auth/demo-course?tenant=executive-learning");
        courseId = r.courseId;
      } catch {
        /* fall back to the dashboard if the resolver is unavailable */
      }
      // Full reload so the app boots cleanly under the demo identity.
      window.location.href = courseId ? `/courses/${courseId}` : "/dashboard";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the demo. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f6f4ef", color: "#122a45" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "56px 24px 72px" }}>
        <p style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6b7280", margin: 0 }}>
          Synops Praxis · Interactive demo
        </p>
        <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 34, lineHeight: 1.15, margin: "10px 0 12px" }}>
          Evidence at the conflict-related crime scene
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "#374151", maxWidth: 640, margin: 0 }}>
          A two-module training experience for justice-sector professionals, built with Project Expedite Justice. Enter
          the full course as a learner, with readings, video, the interactive stations, a case coach, and discussion.
          Every person, place and file is a composite; nothing here is a real case.
        </p>

        <div style={{ marginTop: 28 }}>
          <button
            onClick={enterCourse}
            disabled={busy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#122a45",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "14px 22px",
              fontSize: 15,
              fontWeight: 600,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Starting the demo…" : "Enter the full course →"}
          </button>
          <p style={{ fontSize: 12.5, color: "#6b7280", marginTop: 10 }}>
            No sign-up. You enter as a demo learner enrolled in the course; nothing you do is recorded against a real account.
          </p>
          {error && <p style={{ fontSize: 13, color: "#b42318", marginTop: 8 }}>{error}</p>}
        </div>

        <div style={{ marginTop: 36, borderTop: "1px solid #e3ddd2", paddingTop: 22 }}>
          <p style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", margin: "0 0 12px" }}>
            Or preview an interactive station on its own
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {STATIONS.map((m) => (
              <button
                key={m.href}
                onClick={() => navigate(m.href)}
                style={{
                  textAlign: "left",
                  background: "#ffffff",
                  border: "1px solid #e3ddd2",
                  borderRadius: 14,
                  padding: "14px 18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span>
                  <span style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6b7280" }}>{m.code}</span>
                  <span style={{ display: "block", fontFamily: "Georgia, serif", fontSize: 17, marginTop: 2 }}>{m.title}</span>
                </span>
                <span style={{ color: "#122a45", fontWeight: 600, fontSize: 14 }}>Preview →</span>
              </button>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 28, lineHeight: 1.6 }}>
          Demo build v0.1 · legal content is illustrative and pending subject-matter-expert sign-off.
        </p>
      </div>
    </div>
  );
}
