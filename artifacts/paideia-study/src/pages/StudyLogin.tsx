import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStudyAuth } from "@/hooks/use-study-auth";
import { BookOpen } from "lucide-react";

export default function StudyLogin() {
  const [, setLoc] = useLocation();
  const { login } = useStudyAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      // Honor a ?next= destination (used by the "Admin" entry point -> /admin),
      // but only internal paths to avoid open redirects.
      const next = new URLSearchParams(window.location.search).get("next");
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
      setLoc(safeNext ?? "/coach");
    } catch (err: any) {
      setError(err?.data?.error || "Invalid email or password");
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
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Don&apos;t have an account?{" "}
            <button
              className="text-primary underline"
              onClick={() => setLoc("/signup")}
            >
              Create one
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
