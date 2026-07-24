import React, { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { startAuthentication } from "@simplewebauthn/browser";
import { useSession } from "@/context/SessionContext";
import { usePublicBrandByHost } from "@/context/ThemeProvider";
import { apiFetch, API } from "@/lib/api";

const METHOD_LABELS: Record<string, string> = {
  totp: "Authenticator app",
  passkey: "Passkey (Face ID / fingerprint / key)",
  email_otp: "Email code",
  sms_otp: "Text message",
  email_recovery: "Recovery email",
  backup: "Backup code",
};
// Methods that need a code delivered before the user can type it.
const OTP_METHODS = new Set(["email_otp", "sms_otp", "email_recovery"]);

/** Pick a readable text colour (dark or white) for a given hex background. */
function textOn(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16) || 0, g = parseInt(full.slice(2, 4), 16) || 0, b = parseInt(full.slice(4, 6), 16) || 0;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#111111" : "#ffffff";
}

interface PBrand { displayName?: string | null; primaryColor?: string | null; secondaryColor?: string | null; accentColor?: string | null; logoUrl?: string | null }

export function SignInPage() {
  const { signIn, demoSignIn } = useSession();
  const { data: hostBrand } = usePublicBrandByHost();
  const search = useSearch();
  const slug = new URLSearchParams(search).get("p");
  const [pBrand, setPBrand] = useState<PBrand | null>(null);
  useEffect(() => { if (slug) apiFetch<{ brand: PBrand | null }>(`/p/${slug}`).then((d) => setPBrand(d.brand)).catch(() => {}); }, [slug]);

  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState<"student" | "admin" | null>(null);
  // Second-factor step: revealed only when the server says this account has MFA on.
  const [mfaRequired, setMfaRequired] = useState(false);
  const [code, setCode] = useState("");
  const [methods, setMethods] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string>("");
  const [hints, setHints] = useState<Record<string, string>>({});
  const [hasBackup, setHasBackup] = useState(false);
  const [otpSent, setOtpSent] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);

  // All methods the user can choose between (verified factors + backup codes, if any).
  const pickable = [...methods, ...(hasBackup ? ["backup"] : [])];

  // Demo buttons are only offered on the Enza site, where the demo accounts live.
  const showDemo = typeof window !== "undefined" && window.location.hostname === "enza.synops-consulting.com";

  const onDemo = async (role: "student" | "admin") => {
    setError(null);
    setDemoBusy(role);
    try {
      await demoSignIn(role);
      // Full reload so every cached query starts fresh for the demo identity.
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the demo.");
      setDemoBusy(null);
    }
  };

  const brand: PBrand = (pBrand ?? (hostBrand as PBrand | undefined)) ?? {};
  const brandName = brand.displayName || "Synops Praxis";
  const brandLogo = brand.logoUrl || null;
  const primary = brand.primaryColor || "#0b1220";
  const accent = brand.secondaryColor || brand.accentColor || brand.primaryColor || "#4f46e5";
  const accentText = textOn(accent);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // First step: email + password. On MFA, capture the enrolled methods and show the challenge.
      if (!mfaRequired) {
        const result = await signIn(email, password);
        if (result.mfaRequired) {
          const ms = result.methods ?? [];
          setMethods(ms);
          setHints(result.hints ?? {});
          setHasBackup(!!result.hasBackupCodes);
          setChosen(result.preferred && (ms.includes(result.preferred) || result.preferred === "backup") ? result.preferred : ms[0] ?? (result.hasBackupCodes ? "backup" : ""));
          setMfaRequired(true);
          setBusy(false);
          return;
        }
        setLocation("/dashboard");
        return;
      }

      // Second step: submit the chosen factor (code-based methods here; passkey has its own button).
      const method = chosen === "totp" ? "" : chosen; // totp uses the default code path
      const result = await signIn(email, password, { method, code: code.trim() });
      if (result.mfaRequired) { setBusy(false); return; }
      setLocation("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
      setBusy(false);
    }
  };

  /** Send an OTP for the chosen delivery method (email / SMS / recovery) before the user types it. */
  const sendOtp = async () => {
    setError(null); setMfaBusy(true);
    try {
      const res = await fetch(`${API}/auth/mfa/challenge`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ email, password, method: chosen }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not send a code.");
      setOtpSent(body.sentTo ?? "your device");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code.");
    } finally { setMfaBusy(false); }
  };

  /** Complete a passkey challenge: fetch options, run the authenticator, submit the assertion. */
  const usePasskey = async () => {
    setError(null); setMfaBusy(true);
    try {
      const res = await fetch(`${API}/auth/mfa/challenge`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ email, password, method: "passkey" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not start the passkey.");
      const assertion = await startAuthentication({ optionsJSON: body.options });
      const result = await signIn(email, password, { method: "passkey", assertion });
      if (!result.mfaRequired) setLocation("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey sign-in failed.");
    } finally { setMfaBusy(false); }
  };

  const chooseMethod = (m: string) => { setChosen(m); setShowPicker(false); setOtpSent(null); setCode(""); setError(null); };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4" style={{ background: `linear-gradient(160deg, ${primary} 0%, #05070d 100%)` }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          {brandLogo ? (
            <img src={brandLogo} alt={brandName} className="h-20 sm:h-24 max-w-[300px] object-contain bg-white rounded-xl p-3 shadow-lg" />
          ) : (
            <>
              <div className="h-12 w-12 rounded-lg flex items-center justify-center font-bold text-xl" style={{ backgroundColor: accent, color: accentText }}>
                {brandName.charAt(0).toUpperCase()}
              </div>
              <span className="text-xl font-semibold text-white tracking-tight">{brandName}</span>
            </>
          )}
        </div>

        <h1 className="text-2xl font-bold text-white mb-1">Sign in</h1>
        <p className="text-sm text-white/60 mb-6">
          Access is by enrolment. If your organisation has enrolled you, use the email they registered.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-white/80 mb-1.5">Email</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 focus:outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as any]: accent }} onFocus={(e) => (e.currentTarget.style.borderColor = accent)} onBlur={(e) => (e.currentTarget.style.borderColor = '')} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-white/80">Password</label>
              <Link href="/forgot-password" className="text-xs hover:opacity-80" style={{ color: accent }}>Forgot password?</Link>
            </div>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as any]: accent }} onFocus={(e) => (e.currentTarget.style.borderColor = accent)} onBlur={(e) => (e.currentTarget.style.borderColor = '')} />
          </div>

          {mfaRequired && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-white/80">
                {chosen ? `Verify with your ${METHOD_LABELS[chosen]?.toLowerCase() ?? "method"}` : "Choose how to verify"}
              </p>

              {/* Passkey: single action, no code to type. */}
              {chosen === "passkey" ? (
                <button type="button" onClick={usePasskey} disabled={mfaBusy}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 font-semibold text-white disabled:opacity-60">
                  {mfaBusy ? "Waiting for your device..." : "Use passkey"}
                </button>
              ) : OTP_METHODS.has(chosen) && !otpSent ? (
                <button type="button" onClick={sendOtp} disabled={mfaBusy}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 font-semibold text-white disabled:opacity-60">
                  {mfaBusy ? "Sending..." : `Send a code${hints[chosen] ? ` to ${hints[chosen]}` : ""}`}
                </button>
              ) : (
                <>
                  {otpSent && <p className="text-xs text-white/50">Code sent to {otpSent}.</p>}
                  <input id="mfacode" inputMode="numeric" autoComplete="one-time-code" autoFocus value={code}
                    onChange={(e) => setCode(e.target.value)} placeholder={chosen === "backup" ? "Backup code" : "6-digit code"}
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white tracking-widest font-mono placeholder:text-white/40 focus:outline-none focus:ring-2"
                    style={{ ['--tw-ring-color' as any]: accent }} onFocus={(e) => (e.currentTarget.style.borderColor = accent)} onBlur={(e) => (e.currentTarget.style.borderColor = '')} />
                </>
              )}

              {pickable.length > 1 && (
                <button type="button" onClick={() => setShowPicker((v) => !v)} className="text-xs text-white/60 hover:text-white/90">
                  Try another way
                </button>
              )}
              {showPicker && (
                <div className="rounded-lg border border-white/10 bg-white/5 p-1">
                  {pickable.map((m) => (
                    <button key={m} type="button" onClick={() => chooseMethod(m)}
                      className={`block w-full rounded px-2 py-1.5 text-left text-sm ${m === chosen ? "text-white" : "text-white/70"} hover:bg-white/10`}>
                      {METHOD_LABELS[m] ?? m}{hints[m] ? ` · ${hints[m]}` : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>
          )}

          {/* Hide the submit button on the passkey step (it has its own action). */}
          {!(mfaRequired && chosen === "passkey") && (
            <button type="submit" disabled={busy || (mfaRequired && OTP_METHODS.has(chosen) && !otpSent)}
              className="w-full rounded-lg px-4 py-2.5 font-semibold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: accent, color: accentText }}>
              {busy ? (mfaRequired ? "Verifying..." : "Signing in...") : (mfaRequired ? "Verify" : "Sign in")}
            </button>
          )}
        </form>

        {showDemo && (
          <div className="mt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs uppercase tracking-wide text-white/40">Or explore a live demo</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => onDemo("student")} disabled={demoBusy !== null}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60">
                {demoBusy === "student" ? "Opening..." : "Demo learner"}
              </button>
              <button type="button" onClick={() => onDemo("admin")} disabled={demoBusy !== null}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60">
                {demoBusy === "admin" ? "Opening..." : "Demo admin"}
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-white/40">
              One click, no password. A safe demo account for exploring the platform.
            </p>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-white/40">
          Not enrolled yet? Contact your organisation administrator.
        </p>
      </div>
    </div>
  );
}
