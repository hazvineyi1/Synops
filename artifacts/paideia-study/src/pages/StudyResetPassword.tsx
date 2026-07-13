import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, CheckCircle2 } from "lucide-react";

/**
 * "Set a new password" screen, reached from a one-time reset link
 * (/reset-password?token=...). The token is single-use and expires after an hour;
 * consuming it revokes every existing session for that account.
 */
export default function StudyResetPassword() {
  const [, setLoc] = useLocation();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const r = await fetch("/api/study/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data?.error || "Could not reset your password. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const missingToken = !token;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <button
            onClick={() => setLoc("/")}
            className="flex items-center justify-center gap-2 mb-2 mx-auto hover:opacity-80"
            title="Home"
          >
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg">Synops Coach</span>
          </button>
          <CardTitle>{done ? "Password updated" : "Set a new password"}</CardTitle>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <CheckCircle2 className="h-10 w-10 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Your password has been changed and you have been signed out everywhere else.
              </p>
              <Button className="w-full" onClick={() => setLoc("/login")}>
                Sign in
              </Button>
            </div>
          ) : missingToken ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                This page needs a reset link. Request one and we will email it to you.
              </p>
              <Button className="w-full" onClick={() => setLoc("/forgot-password")}>
                Request a reset link
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">At least 8 characters.</p>
              </div>
              <div>
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Updating..." : "Update password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
