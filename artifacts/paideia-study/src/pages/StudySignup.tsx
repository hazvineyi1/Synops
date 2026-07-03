import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStudyAuth } from "@/hooks/use-study-auth";
import { BookOpen } from "lucide-react";

// Whole years between a "YYYY-MM-DD" date of birth and today.
function ageFromDob(d: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const dt = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  const now = new Date();
  let a = now.getUTCFullYear() - dt.getUTCFullYear();
  const m = now.getUTCMonth() - dt.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dt.getUTCDate())) a -= 1;
  return a;
}

export default function StudySignup() {
  const [, setLoc] = useLocation();
  const { signup } = useStudyAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dob, setDob] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);
  const age = ageFromDob(dob);
  const tooYoung = age !== null && age < 13;
  const isMinor = age !== null && age >= 13 && age < 18;
  const blockSubmit =
    submitting || !dob || tooYoung || (isMinor && (!guardianEmail || !guardianConsent));

  // Capture an ambassador referral code from ?ref= and remember it, so the
  // attribution survives the user browsing other pages before signing up.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code) {
      try {
        localStorage.setItem("studyReferralCode", code);
      } catch {
        // localStorage may be unavailable; attribution is best-effort.
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      let ref: string | undefined;
      try {
        ref = localStorage.getItem("studyReferralCode") ?? undefined;
      } catch {
        ref = undefined;
      }
      await signup(email, password, name, {
        ref,
        dateOfBirth: dob,
        guardianEmail: isMinor ? guardianEmail.trim() : undefined,
        guardianConsent: isMinor ? guardianConsent : undefined,
      });
      try {
        localStorage.removeItem("studyReferralCode");
      } catch {
        // ignore
      }
      setLoc("/coach");
    } catch (err: any) {
      setError(err?.data?.error || "Signup failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg">Synops Coach</span>
          </div>
          <CardTitle>Create your account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div>
              <Label htmlFor="dob">Date of Birth</Label>
              <Input
                id="dob"
                type="date"
                value={dob}
                max={todayStr}
                onChange={(e) => setDob(e.target.value)}
                required
                className="mt-0.5"
              />
            </div>

            {tooYoung && (
              <p className="text-sm text-red-600">
                You must be at least 13 years old to use Synops Coach.
              </p>
            )}

            {isMinor && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-3">
                <p className="text-xs text-amber-800">
                  Because you are under 18, a parent or guardian must give permission.
                </p>
                <div>
                  <Label htmlFor="guardianEmail">Parent / Guardian Email</Label>
                  <Input
                    id="guardianEmail"
                    type="email"
                    value={guardianEmail}
                    onChange={(e) => setGuardianEmail(e.target.value)}
                    required
                    className="mt-0.5"
                  />
                </div>
                <label className="flex items-start gap-2 text-xs text-amber-900">
                  <input
                    type="checkbox"
                    checked={guardianConsent}
                    onChange={(e) => setGuardianConsent(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I confirm my parent or guardian has given permission for me to create
                    this account.
                  </span>
                </label>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={blockSubmit}>
              {submitting ? "Creating account..." : "Get Started"}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              By creating an account, you agree to our{" "}
              <button type="button" className="underline hover:text-foreground" onClick={() => setLoc("/terms")}>Terms</button>
              {" "}and{" "}
              <button type="button" className="underline hover:text-foreground" onClick={() => setLoc("/privacy")}>Privacy Policy</button>.
            </p>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{" "}
            <button
              className="text-primary underline"
              onClick={() => setLoc("/login")}
            >
              Sign in
            </button>
          </p>
          <p className="text-center text-xs text-muted-foreground mt-3">
            <button className="underline hover:text-foreground" onClick={() => setLoc("/help")}>Help &amp; FAQ</button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
