import { useState } from "react";
import { Link, useLocation } from "wouter";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useCatalog } from "@/hooks/use-catalog";
import type { Teacher } from "@/lib/types";
import { InlineSpinner } from "@/components/Loading";

export default function Signup() {
  const [, setLoc] = useLocation();
  const { setTeacher } = useAuth();
  const { regions } = useCatalog();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [regionId, setRegionId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ teacher: Teacher }>("/auth/signup", {
        email,
        password,
        name,
        region: regionId,
      });
      setTeacher(res.teacher);
      setLoc("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Free. No card needed. 10 AI generations per month.">
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <div className="space-y-2">
          <Label>Region</Label>
          <Select value={regionId} onValueChange={setRegionId}>
            <SelectTrigger><SelectValue placeholder="Select your region" /></SelectTrigger>
            <SelectContent>
              {regions.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <Button type="submit" className="w-full" disabled={!name || !email || !password || !regionId || busy}>
          {busy ? <InlineSpinner /> : "Start for free"}
        </Button>
        <p className="text-sm text-center text-muted-foreground">
          Already have an account? <Link href="/login" className="text-primary underline">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
