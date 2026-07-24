import { useState, useEffect, useCallback } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { KeyRound, Fingerprint, Mail, LifeBuoy, Trash2, Star, ShieldCheck } from "lucide-react";

/**
 * Coach multi-factor authentication management. A teacher may enrol an authenticator app, a passkey,
 * an email code, or a recovery email; any one verified method satisfies sign-in. Backup codes are
 * shown once. Mirrors the Praxis /security page.
 */

type FactorType = "totp" | "passkey" | "email_otp" | "email_recovery";
interface Factor { id: string; type: FactorType; label: string; verified: boolean; preferred: boolean; hint?: string }
interface FactorsResp { factors: Factor[]; backupCodesRemaining: number; emailAvailable: boolean; isAdmin: boolean }

const META: Record<FactorType, { label: string; icon: React.ElementType }> = {
  totp: { label: "Authenticator app", icon: KeyRound },
  passkey: { label: "Passkey", icon: Fingerprint },
  email_otp: { label: "Email code", icon: Mail },
  email_recovery: { label: "Recovery email", icon: LifeBuoy },
};

export default function MfaSettings() {
  const [data, setData] = useState<FactorsResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [flow, setFlow] = useState<null | { kind: FactorType; step: "collect" | "verify"; qr?: string; secret?: string; sentTo?: string }>(null);
  const [code, setCode] = useState("");
  const [collect, setCollect] = useState("");

  const load = useCallback(async () => {
    try { setData(await api.get<FactorsResp>("/auth/mfa/factors")); } catch { /* ignore */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const fail = (e: unknown, f: string) => setErr(e instanceof ApiError ? e.message : f);
  const showOnce = (codes?: string[]) => { if (codes?.length) setBackupCodes(codes); };
  const verified = (data?.factors ?? []).filter((f) => f.verified);

  const startTotp = async () => {
    setErr(null);
    try {
      const d = await api.post<{ secret: string; otpauthUrl: string }>("/auth/mfa/totp/setup", {});
      const qr = await QRCode.toDataURL(d.otpauthUrl).catch(() => "");
      setFlow({ kind: "totp", step: "verify", qr, secret: d.secret }); setCode("");
    } catch (e) { fail(e, "Could not start setup."); }
  };
  const verifyTotp = async () => {
    try { const d = await api.post<{ backupCodes?: string[] }>("/auth/mfa/totp/verify", { code: code.trim() }); setFlow(null); setCode(""); showOnce(d.backupCodes); void load(); }
    catch (e) { fail(e, "That code did not match."); }
  };
  const addPasskey = async () => {
    setErr(null);
    try {
      const options = await api.post<any>("/auth/mfa/passkey/register/options", {});
      const response = await startRegistration({ optionsJSON: options });
      const label = window.prompt("Name this passkey (e.g. iPhone, YubiKey)", "Passkey") || "Passkey";
      const d = await api.post<{ backupCodes?: string[] }>("/auth/mfa/passkey/register/verify", { response, label });
      showOnce(d.backupCodes); void load();
    } catch (e) { fail(e, "Could not add that passkey."); }
  };
  const sendOtp = async (kind: FactorType, value: string) => {
    setErr(null);
    try {
      const path = kind === "email_otp" ? "/auth/mfa/email/setup" : "/auth/mfa/recovery/setup";
      const d = await api.post<{ sentTo: string }>(path, { email: value });
      setFlow({ kind, step: "verify", sentTo: d.sentTo }); setCode("");
    } catch (e) { fail(e, "Could not send a code."); }
  };
  const verifyOtp = async (kind: FactorType) => {
    try {
      const path = kind === "email_otp" ? "/auth/mfa/email/verify" : "/auth/mfa/recovery/verify";
      const d = await api.post<{ backupCodes?: string[] }>(path, { code: code.trim() });
      setFlow(null); setCode(""); showOnce(d.backupCodes); void load();
    } catch (e) { fail(e, "That code is not valid or has expired."); }
  };
  const remove = async (id: string) => { try { await api.del(`/auth/mfa/factors/${id}`); void load(); } catch (e) { fail(e, "Could not remove that method."); } };
  const makeDefault = async (id: string) => { await api.post("/auth/mfa/preferred", { factorId: id }).catch(() => {}); void load(); };
  const regenerate = async () => { try { const d = await api.post<{ backupCodes: string[] }>("/auth/mfa/backup/regenerate", {}); setBackupCodes(d.backupCodes); void load(); } catch (e) { fail(e, "Could not regenerate."); } };

  return (
    <section className="mt-10 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Security</h2>
        <p className="text-sm text-muted-foreground">Add one or more ways to confirm it is you when you sign in.</p>
      </div>
      {err && <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{err}</div>}

      {backupCodes && (
        <div className="rounded-lg border border-primary/40 p-4">
          <p className="font-medium flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Save your backup codes</p>
          <p className="text-sm text-muted-foreground mt-1">Each works once if you lose your other methods. Shown only now.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">{backupCodes.map((c) => <div key={c} className="rounded bg-muted px-2 py-1">{c}</div>)}</div>
          <Button size="sm" className="mt-3" onClick={() => setBackupCodes(null)}>Done</Button>
        </div>
      )}

      {/* Enrolled methods */}
      <div className="rounded-lg border border-border p-4">
        <p className="font-medium">Your sign-in methods</p>
        {verified.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-2">No methods yet. Add one below.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {verified.map((f) => { const Icon = META[f.type].icon; return (
              <li key={f.id} className="flex items-center gap-3 py-2.5">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0"><p className="text-sm font-medium">{f.label || META[f.type].label}{f.preferred && <span className="ml-1 text-xs text-amber-600">· default</span>}</p>{f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}</div>
                {!f.preferred && <button title="Make default" onClick={() => makeDefault(f.id)} className="text-muted-foreground hover:text-amber-600"><Star className="h-4 w-4" /></button>}
                <button title="Remove" onClick={() => remove(f.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </li>
            ); })}
          </ul>
        )}
      </div>

      {/* Active flow */}
      {flow?.kind === "totp" && flow.step === "verify" && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-sm font-medium">Scan in your authenticator app, or enter the key.</p>
          {flow.qr && <img src={flow.qr} alt="QR code" className="h-40 w-40 rounded bg-white p-2" />}
          <p className="font-mono text-xs break-all rounded bg-muted px-2 py-1">{flow.secret?.replace(/(.{4})/g, "$1 ").trim()}</p>
          <div className="flex gap-2"><Input placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} className="w-40" /><Button size="sm" onClick={verifyTotp}>Verify</Button><Button size="sm" variant="ghost" onClick={() => setFlow(null)}>Cancel</Button></div>
        </div>
      )}
      {flow?.step === "collect" && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-sm font-medium">Enter the email address to use</p>
          <div className="flex gap-2"><Input placeholder="you@example.com" value={collect} onChange={(e) => setCollect(e.target.value)} className="flex-1" /><Button size="sm" onClick={() => sendOtp(flow.kind, collect.trim())} disabled={!collect.trim()}>Send code</Button><Button size="sm" variant="ghost" onClick={() => setFlow(null)}>Cancel</Button></div>
        </div>
      )}
      {flow?.step === "verify" && flow.kind !== "totp" && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-sm font-medium">Enter the code we sent to {flow.sentTo}.</p>
          <div className="flex gap-2"><Input placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} className="w-40" /><Button size="sm" onClick={() => verifyOtp(flow.kind)}>Verify</Button><Button size="sm" variant="ghost" onClick={() => setFlow(null)}>Cancel</Button></div>
        </div>
      )}

      {/* Add buttons */}
      {!flow && (
        <div className="grid gap-2 sm:grid-cols-2">
          <AddBtn icon={KeyRound} label="Authenticator app" desc="Google Authenticator, 1Password, etc." onClick={startTotp} />
          <AddBtn icon={Fingerprint} label="Passkey" desc="Face ID, fingerprint, or a security key" onClick={addPasskey} />
          {data?.emailAvailable && <AddBtn icon={Mail} label="Email code" desc="A code sent to your email" onClick={() => { setFlow({ kind: "email_otp", step: "collect" }); setCollect(""); }} />}
          {data?.emailAvailable && <AddBtn icon={LifeBuoy} label="Recovery email" desc="Regain access if locked out" onClick={() => { setFlow({ kind: "email_recovery", step: "collect" }); setCollect(""); }} />}
        </div>
      )}

      <div className="rounded-lg border border-border p-4 flex items-center justify-between">
        <div><p className="font-medium">Backup codes</p><p className="text-sm text-muted-foreground">{data?.backupCodesRemaining ?? 0} unused remaining.</p></div>
        <Button size="sm" variant="outline" onClick={regenerate}>Regenerate</Button>
      </div>
    </section>
  );
}

function AddBtn({ icon: Icon, label, desc, onClick }: { icon: React.ElementType; label: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-start gap-3 rounded-lg border border-border p-3 text-left hover:bg-muted/50">
      <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
      <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
    </button>
  );
}
