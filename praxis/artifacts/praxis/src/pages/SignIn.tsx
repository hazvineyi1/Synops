import React, { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useSession } from "@/context/SessionContext";
import { usePublicBrandByHost } from "@/context/ThemeProvider";
import { apiFetch } from "@/lib/api";

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
  // Second-factor step: revealed only when the server says this account has 2FA on.
  const [mfaRequired, setMfaRequired] = useState(false);
  const [code, setCode] = useState("");

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
      const result = await signIn(email, password, mfaRequired ? code : undefined);
      if (result.mfaRequired) {
        // Correct password; now ask for the authenticator code and re-submit.
        setMfaRequired(true);
        setBusy(false);
        return;
      }
      setLocation("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
      setBusy(false);
    }
  };

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
            <div>
              <label htmlFor="mfacode" className="block text-sm font-medium text-white/80 mb-1.5">Authentication code</label>
              <input id="mfacode" inputMode="numeric" autoComplete="one-time-code" autoFocus required value={code}
                onChange={(e) => setCode(e.target.value)} placeholder="6-digit code"
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white tracking-widest font-mono placeholder:text-white/40 focus:outline-none focus:ring-2"
                style={{ ['--tw-ring-color' as any]: accent }} onFocus={(e) => (e.currentTarget.style.borderColor = accent)} onBlur={(e) => (e.currentTarget.style.borderColor = '')} />
              <p className="mt-1.5 text-xs text-white/50">Enter the code from your authenticator app, or a one-time backup code.</p>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>
          )}

          <button type="submit" disabled={busy}
            className="w-full rounded-lg px-4 py-2.5 font-semibold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: accent, color: accentText }}>
            {busy ? (mfaRequired ? "Verifying..." : "Signing in...") : (mfaRequired ? "Verify" : "Sign in")}
          </button>
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
