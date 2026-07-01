import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { useStudentAuth } from "@/hooks/use-student-auth";
import type { Student } from "@/lib/types";

export default function StudentLogin() {
  const { setStudent } = useStudentAuth();
  const [, setLoc] = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ student: Student }>("/student/login", { identifier, password });
      setStudent(r.student);
      setLoc("/student");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="font-serif text-3xl text-primary">Synops</div>
          <p className="text-sm text-muted-foreground mt-1">Student sign-in</p>
        </div>
        <form onSubmit={submit} className="bg-card border rounded-lg p-6 space-y-4">
          <div className="space-y-2">
            <Label>Email or join code</Label>
            <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Signing in..." : "Sign in"}</Button>
        </form>
        <p className="text-center mt-6 text-sm text-muted-foreground">
          Teacher? <Link href="/login" className="text-primary underline">Sign in here</Link>
        </p>
      </div>
    </div>
  );
}
