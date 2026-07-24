import { useState } from "react";
import { Link, useLocation } from "wouter";
import { startAuthentication } from "@simplewebauthn/browser";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { Teacher } from "@/lib/types";
import { InlineSpinner } from "@/components/Loading";

const METHOD_LABELS: Record<string, string> = {
  totp: "Authenticator app",
  passkey: "Passkey (Face ID / fingerprint / key)",
  email_otp: "Email code",
  email_recovery: "Recovery email",
  backup: "Backup code",
};
const OTP_METHODS = new Set(["email_otp", "email_recovery"]);

interface LoginResult { teacher?: Teacher; mfaRequired?: boolean; methods?: string[]; hasBackupCodes?: boolean; preferred?: string; hints?: Record<string, string> }

export default function Login() {
  const [, setLoc] = useLocation();
  const { setTeacher } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // MFA challenge state.
  const [mfa, setMfa] = useState(false);
  const [methods, setMethods] = useState<string[]>([]);
  const [hasBackup, setHasBackup] = useState(false);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const pickable = [...methods, ...(hasBackup ? ["backup"] : [])];
  const done = (t: Teacher) => { setTeacher(t); setLoc("/dashboard"); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      if (!mfa) {
        const res = await api.post<LoginResult>("/auth/login", { email, password });
        if (res.mfaRequired) {
          const ms = res.methods ?? [];
          setMethods(ms); setHasBackup(!!res.hasBackupCodes); setHints(res.hints ?? {});
          setChosen(res.preferred && (ms.includes(res.preferred) || res.preferred === "backup") ? res.preferred : ms[0] ?? (res.hasBackupCodes ? "backup" : ""));
          setMfa(true); setBusy(false); return;
        }
        done(res.teacher!); return;
      }
      const method = chosen === "totp" ? "" : chosen;
      const res = await api.post<LoginResult>("/auth/login", { email, password, method, code: code.trim() });
      if (res.mfaRequired) { setBusy(false); return; }
      done(res.teacher!);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed");
      setBusy(false);
    }
  };

  const sendOtp = async () => {
    setError(null); setBusy(true);
    try {
      const res = await api.post<{ sentTo?: string }>("/auth/mfa/challenge", { email, password, method: chosen });
      setOtpSent(res.sentTo ?? "your email");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send a code.");
    } finally { setBusy(false); }
  };

  const usePasskey = async () => {
    setError(null); setBusy(true);
    try {
      const res = await api.post<{ options: any }>("/auth/mfa/challenge", { email, password, method: "passkey" });
      const assertion = await startAuthentication({ optionsJSON: res.options });
      const out = await api.post<LoginResult>("/auth/login", { email, password, method: "passkey", assertion });
      if (!out.mfaRequired) done(out.teacher!);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Passkey sign-in failed.");
    } finally { setBusy(false); }
  };

  const choose = (m: string) => { setChosen(m); setShowPicker(false); setOtpSent(null); setCode(""); setError(null); };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to Synops Teacher.">
      <form onSubmit={submit} className="space-y-5">
        {!mfa && (
          <>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </>
        )}

        {mfa && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{chosen ? `Verify with your ${METHOD_LABELS[chosen]?.toLowerCase() ?? "method"}` : "Choose how to verify"}</p>
            {chosen === "passkey" ? (
              <Button type="button" variant="outline" className="w-full" onClick={usePasskey} disabled={busy}>{busy ? "Waiting for your device..." : "Use passkey"}</Button>
            ) : OTP_METHODS.has(chosen) && !otpSent ? (
              <Button type="button" variant="outline" className="w-full" onClick={sendOtp} disabled={busy}>{busy ? "Sending..." : `Send a code${hints[chosen] ? ` to ${hints[chosen]}` : ""}`}</Button>
            ) : (
              <>
                {otpSent && <p className="text-xs text-muted-foreground">Code sent to {otpSent}.</p>}
                <Input inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder={chosen === "backup" ? "Backup code" : "6-digit code"} className="font-mono tracking-widest" />
              </>
            )}
            {pickable.length > 1 && <button type="button" onClick={() => setShowPicker((v) => !v)} className="text-xs text-muted-foreground underline">Try another way</button>}
            {showPicker && (
              <div className="rounded-md border border-border p-1">
                {pickable.map((m) => (
                  <button key={m} type="button" onClick={() => choose(m)} className={`block w-full rounded px-2 py-1.5 text-left text-sm ${m === chosen ? "font-medium" : "text-muted-foreground"} hover:bg-muted`}>
                    {METHOD_LABELS[m] ?? m}{hints[m] ? ` · ${hints[m]}` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <div className="text-sm text-destructive">{error}</div>}

        {!(mfa && chosen === "passkey") && (
          <Button type="submit" className="w-full" disabled={busy || (mfa && OTP_METHODS.has(chosen) && !otpSent)}>
            {busy ? <InlineSpinner /> : mfa ? "Verify" : "Sign in"}
          </Button>
        )}

        {!mfa && (
          <>
            <p className="text-sm text-center text-muted-foreground">
              No account yet? <Link href="/signup" className="text-primary underline">Create one</Link>
            </p>
            <p className="text-xs text-center text-muted-foreground">
              Lost your password? Email info@synops-consulting.com for a one-time reset link.
            </p>
          </>
        )}
      </form>
    </AuthShell>
  );
}
