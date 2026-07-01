import { useState } from "react";
import { Link, useLocation } from "wouter";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { InlineSpinner } from "@/components/Loading";

export default function ResetPassword() {
  const [, setLoc] = useLocation();
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("This page needs a reset token. Use the link sent to you by the founder.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => setLoc("/login"), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset password");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password reset" subtitle="You can now sign in with your new password.">
        <div className="text-sm text-muted-foreground">Redirecting you to sign in.</div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle="Use a new password you haven't used before.">
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <Button type="submit" className="w-full" disabled={busy} data-track="reset_password_submit">
          {busy ? <InlineSpinner /> : "Reset password"}
        </Button>
        <p className="text-sm text-center text-muted-foreground">
          Remembered it? <Link href="/login" className="text-primary underline">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
