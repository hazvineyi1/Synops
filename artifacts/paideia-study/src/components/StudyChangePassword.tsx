import { useState } from "react";

/**
 * First-login password gate. Shown by <Protected> whenever the signed-in learner is still on the
 * shared default password (server flag `mustChangePassword`). Blocks all app content until they set
 * their own password. On success we hard-reload so the auth provider refetches /me and the flag clears.
 */
export function StudyChangePassword() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) { setError("Your new password must be at least 8 characters."); return; }
    if (pw === "Password123") { setError("Please choose a password different from the default one."); return; }
    if (pw !== confirm) { setError("The two passwords do not match."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/study/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: pw }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Could not update your password.");
      }
      // Full reload so the auth provider refetches /me (mustChangePassword now false) and the app opens.
      window.location.href = `${base}/coach`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your password.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">Choose your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You signed in with a temporary password. For your security, please set your own before you start using Synops Coach.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="new-pw" className="block text-sm font-medium text-foreground mb-1">New password</label>
            <input
              id="new-pw"
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="confirm-pw" className="block text-sm font-medium text-foreground mb-1">Confirm new password</label>
            <input
              id="confirm-pw"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter your new password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Set password and continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default StudyChangePassword;
