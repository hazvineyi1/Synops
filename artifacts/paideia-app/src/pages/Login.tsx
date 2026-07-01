import { useState } from "react";
import { Link, useLocation } from "wouter";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { Teacher } from "@/lib/types";
import { InlineSpinner } from "@/components/Loading";

export default function Login() {
  const [, setLoc] = useLocation();
  const { setTeacher } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ teacher: Teacher }>("/auth/login", { email, password });
      setTeacher(res.teacher);
      setLoc("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to Synops Teacher.">
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <InlineSpinner /> : "Sign in"}
        </Button>
        <p className="text-sm text-center text-muted-foreground">
          No account yet?{" "}
          <Link href="/signup" className="text-primary underline">Create one</Link>
        </p>
        <p className="text-xs text-center text-muted-foreground">
          Lost your password? Email info@synops-consulting.com for a one-time reset link.
        </p>
      </form>
    </AuthShell>
  );
}
