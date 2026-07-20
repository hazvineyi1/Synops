import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface CohortInfo {
  className: string;
  orgName: string | null;
  courses: { title: string }[];
  brand: { displayName?: string | null; primaryColor?: string | null; secondaryColor?: string | null; logoUrl?: string | null } | null;
}

/**
 * Public cohort self-enrolment landing page (reached from a WhatsApp link like /join/abc1234).
 * Shows the cohort and its courses under the partner's branding, then lets a new learner register
 * (name, email, password) and be enrolled in one step. On success they are already signed in.
 */
export function JoinCohort({ params }: { params: { code: string } }) {
  const { code } = params;
  const [info, setInfo] = useState<CohortInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<CohortInfo>(`/enrol/${code}`)
      .then(setInfo)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "This link is not valid."));
  }, [code]);

  const brandName = info?.brand?.displayName || "Synops Praxis";
  const brandLogo = info?.brand?.logoUrl || null;
  const primary = info?.brand?.primaryColor || "#111111";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Choose a password of at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      await apiFetch(`/enrol/${code}`, {
        method: "POST",
        body: JSON.stringify({ firstName, lastName, email, password }),
      });
      // The enrol endpoint sets the session cookie; a full reload lands us in the learner's home.
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete enrolment.");
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
          <h1 className="text-lg font-semibold text-slate-900">Link not valid</h1>
          <p className="mt-2 text-sm text-slate-500">{loadError}</p>
          <a href="/sign-in" className="mt-4 inline-block text-sm font-medium" style={{ color: primary }}>Go to sign in</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          {brandLogo ? (
            <img src={brandLogo} alt={brandName} className="h-10 max-w-[200px] object-contain bg-white rounded p-1" />
          ) : (
            <span className="text-xl font-semibold text-white">{brandName}</span>
          )}
        </div>

        <div className="rounded-xl bg-white p-6 shadow-xl">
          <div className="mb-4">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: primary }}>You have been invited to join</div>
            <h1 className="mt-1 text-xl font-bold text-slate-900">{info?.className ?? "Loading cohort…"}</h1>
            {info?.orgName && <p className="text-sm text-slate-500">{info.orgName}</p>}
          </div>

          {info && info.courses.length > 0 && (
            <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1.5 text-xs font-semibold text-slate-600">Your courses ({info.courses.length})</div>
              <ul className="space-y-1 text-sm text-slate-700">
                {info.courses.slice(0, 8).map((c, i) => (
                  <li key={i} className="flex gap-2"><span style={{ color: primary }}>•</span>{c.title}</li>
                ))}
                {info.courses.length > 8 && <li className="text-slate-400">and {info.courses.length - 8} more…</li>}
              </ul>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" />
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" />
            </div>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" />
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password (min 8 characters)" className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" />
            <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password" className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={busy || !info} className="h-10 w-full rounded-md text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: primary }}>
              {busy ? "Joining…" : "Join and start learning"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-400">
            Already have an account? <a href="/sign-in" className="font-medium" style={{ color: primary }}>Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
