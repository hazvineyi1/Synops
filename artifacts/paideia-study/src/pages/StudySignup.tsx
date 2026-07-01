import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStudyAuth } from "@/hooks/use-study-auth";
import { BookOpen } from "lucide-react";

export default function StudySignup() {
  const [, setLoc] = useLocation();
  const { signup } = useStudyAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      await signup(email, password, name, ref);
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
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creating account..." : "Get Started"}
            </Button>
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
        </CardContent>
      </Card>
    </div>
  );
}
