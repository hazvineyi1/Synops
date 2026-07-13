import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, MailCheck } from "lucide-react";

/**
 * "Forgot password" request screen.
 *
 * The API always answers with the same message whether or not the address is
 * registered (no account enumeration), so this screen shows a neutral confirmation
 * rather than "we found you". If the server reports that email delivery is not
 * configured, we say so plainly instead of leaving the user waiting for a mail that
 * can never arrive -- they need an admin-issued link instead.
 */
export default function StudyForgotPassword() {
  const [, setLoc] = useLocation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const r = await fetch("/api/study/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data?.error || "Something went wrong. Please try again.");
        return;
      }
      setEmailConfigured(data?.emailConfigured !== false);
      setSent(true);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

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
          <CardTitle>{sent ? "Check your email" : "Reset your password"}</CardTitle>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <MailCheck className="h-10 w-10 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                If that email has an account, we have sent a reset link. It expires in 1 hour and
                can only be used once.
              </p>

              {!emailConfigured && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
                  <p className="text-xs text-amber-900 leading-relaxed">
                    <strong>Email delivery is not set up on this server yet</strong>, so no message
                    will actually arrive. Contact your administrator and ask them to issue you a
                    reset link directly.
                  </p>
                </div>
              )}

              <Button variant="outline" className="w-full" onClick={() => setLoc("/login")}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Enter the email you signed up with and we will send you a link to set a new
                password.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Sending..." : "Send reset link"}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground mt-4">
                Remembered it?{" "}
                <button className="text-primary underline" onClick={() => setLoc("/login")}>
                  Sign in
                </button>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
