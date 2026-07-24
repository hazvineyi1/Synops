import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startRegistration } from '@simplewebauthn/browser';
import QRCode from 'qrcode';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldCheck, KeyRound, Smartphone, Mail, LifeBuoy, Fingerprint, Copy, Check, Star, Trash2, Lock } from 'lucide-react';

/**
 * Account security: multi-factor authentication management. A user may enrol several methods -
 * authenticator app, passkey, email code, text message, recovery email - and any one verified
 * method satisfies the sign-in challenge. Backup codes are shown exactly once. SMS only appears
 * when the platform has an SMS provider configured.
 */

type FactorType = 'totp' | 'passkey' | 'email_otp' | 'sms_otp' | 'email_recovery';
interface Factor { id: string; type: FactorType; label: string; verified: boolean; preferred: boolean; hint?: string; lastUsedAt: string | null }
interface FactorsResp { factors: Factor[]; backupCodesRemaining: number; smsAvailable: boolean; emailAvailable: boolean; mfaRequired: boolean }

const TYPE_META: Record<FactorType, { label: string; icon: React.ElementType }> = {
  totp: { label: 'Authenticator app', icon: KeyRound },
  passkey: { label: 'Passkey', icon: Fingerprint },
  email_otp: { label: 'Email code', icon: Mail },
  sms_otp: { label: 'Text message', icon: Smartphone },
  email_recovery: { label: 'Recovery email', icon: LifeBuoy },
};

export function AccountSecurity() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['mfa-factors'], queryFn: () => apiFetch<FactorsResp>('/auth/mfa/factors') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['mfa-factors'] });

  const [err, setErr] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  // The in-progress "add a method" flow.
  const [flow, setFlow] = useState<null | { kind: FactorType; step: 'collect' | 'verify'; qr?: string; secret?: string; sentTo?: string; email?: string; phone?: string }>(null);
  const [code, setCode] = useState('');
  const [collectValue, setCollectValue] = useState('');

  const factors = data?.factors ?? [];
  const verified = factors.filter((f) => f.verified);
  const showBackupOnce = (codes?: string[]) => { if (codes?.length) setBackupCodes(codes); };
  const fail = (e: any, fallback: string) => setErr(e?.message ?? fallback);

  // ── TOTP ─────────────────────────────────────────────────────────────────────
  const startTotp = useMutation({
    mutationFn: () => apiFetch<{ secret: string; otpauthUrl: string }>('/auth/mfa/totp/setup', { method: 'POST', body: '{}' }),
    onSuccess: async (d) => {
      const qr = await QRCode.toDataURL(d.otpauthUrl).catch(() => '');
      setFlow({ kind: 'totp', step: 'verify', qr, secret: d.secret }); setErr(null); setCode('');
    },
    onError: (e) => fail(e, 'Could not start setup.'),
  });
  const verifyTotp = useMutation({
    mutationFn: () => apiFetch<{ backupCodes?: string[] }>('/auth/mfa/totp/verify', { method: 'POST', body: JSON.stringify({ code: code.trim() }) }),
    onSuccess: (d) => { setFlow(null); setCode(''); showBackupOnce(d.backupCodes); refresh(); },
    onError: (e) => fail(e, 'That code did not match.'),
  });

  // ── Passkey ──────────────────────────────────────────────────────────────────
  const addPasskey = useMutation({
    mutationFn: async () => {
      const options = await apiFetch<any>('/auth/mfa/passkey/register/options', { method: 'POST', body: '{}' });
      const response = await startRegistration({ optionsJSON: options });
      const label = window.prompt('Name this passkey (e.g. iPhone, YubiKey)', 'Passkey') || 'Passkey';
      return apiFetch<{ backupCodes?: string[] }>('/auth/mfa/passkey/register/verify', { method: 'POST', body: JSON.stringify({ response, label }) });
    },
    onSuccess: (d) => { showBackupOnce(d.backupCodes); refresh(); setErr(null); },
    onError: (e) => fail(e, 'Could not add that passkey.'),
  });

  // ── OTP-based (email / sms / recovery) ─────────────────────────────────────────
  const sendOtp = useMutation({
    mutationFn: (args: { kind: FactorType; value: string }) => {
      const path = args.kind === 'email_otp' ? '/auth/mfa/email/setup' : args.kind === 'sms_otp' ? '/auth/mfa/sms/setup' : '/auth/mfa/recovery/setup';
      const body = args.kind === 'sms_otp' ? { phone: args.value } : { email: args.value };
      return apiFetch<{ sentTo: string }>(path, { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: (d, args) => { setFlow({ kind: args.kind, step: 'verify', sentTo: d.sentTo }); setErr(null); setCode(''); },
    onError: (e) => fail(e, 'Could not send a code.'),
  });
  const verifyOtp = useMutation({
    mutationFn: (kind: FactorType) => {
      const path = kind === 'email_otp' ? '/auth/mfa/email/verify' : kind === 'sms_otp' ? '/auth/mfa/sms/verify' : '/auth/mfa/recovery/verify';
      return apiFetch<{ backupCodes?: string[] }>(path, { method: 'POST', body: JSON.stringify({ code: code.trim() }) });
    },
    onSuccess: (d) => { setFlow(null); setCode(''); showBackupOnce(d.backupCodes); refresh(); },
    onError: (e) => fail(e, 'That code is not valid or has expired.'),
  });

  // ── Manage ─────────────────────────────────────────────────────────────────────
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/auth/mfa/factors/${id}`, { method: 'DELETE' }),
    onSuccess: () => { refresh(); setErr(null); },
    onError: (e) => fail(e, 'Could not remove that method.'),
  });
  const setPreferred = useMutation({
    mutationFn: (id: string) => apiFetch('/auth/mfa/preferred', { method: 'POST', body: JSON.stringify({ factorId: id }) }),
    onSuccess: () => refresh(),
  });
  const regenerate = useMutation({
    mutationFn: () => apiFetch<{ backupCodes: string[] }>('/auth/mfa/backup/regenerate', { method: 'POST', body: '{}' }),
    onSuccess: (d) => { setBackupCodes(d.backupCodes); refresh(); },
  });

  const beginCollect = (kind: FactorType, prefill = '') => { setFlow({ kind, step: 'collect' }); setCollectValue(prefill); setErr(null); };

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Security" icon={Lock} subtitle="Add one or more ways to confirm it is you when you sign in." />

      {data?.mfaRequired && verified.length === 0 && (
        <Card className="p-4 border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 text-sm">
          Two-factor authentication is required for your role. Add at least one method below to finish securing your account.
        </Card>
      )}
      {err && <Card className="p-3 border-red-300 bg-red-50/60 dark:bg-red-950/20 text-sm text-red-700 dark:text-red-300">{err}</Card>}

      {/* One-time backup codes reveal */}
      {backupCodes && (
        <Card className="p-5 border-emerald-300">
          <h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Save your backup codes</h3>
          <p className="text-sm text-muted-foreground mt-1">Each code works once if you lose access to your other methods. Store them somewhere safe - they are shown only now.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
            {backupCodes.map((c) => <div key={c} className="rounded bg-muted px-2 py-1">{c}</div>)}
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(backupCodes.join('\n')).catch(() => {})}><Copy className="mr-1 h-3.5 w-3.5" /> Copy</Button>
            <Button size="sm" onClick={() => setBackupCodes(null)}>Done</Button>
          </div>
        </Card>
      )}

      {/* Enrolled methods */}
      <Card className="p-5">
        <h2 className="font-semibold">Your sign-in methods</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground mt-3">Loading...</p>
        ) : verified.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">No methods yet. Add one below.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {verified.map((f) => {
              const Meta = TYPE_META[f.type]; const Icon = Meta.icon;
              return (
                <li key={f.id} className="flex items-center gap-3 py-3">
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{f.label || Meta.label} {f.preferred && <span className="ml-1 text-xs text-amber-600">· default</span>}</p>
                    {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                  </div>
                  {!f.preferred && <button title="Make default" onClick={() => setPreferred.mutate(f.id)} className="text-muted-foreground hover:text-amber-600"><Star className="h-4 w-4" /></button>}
                  <button title="Remove" onClick={() => remove.mutate(f.id)} className="text-muted-foreground hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Add a method */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">Add a method</h2>

        {/* Active flow */}
        {flow?.step === 'verify' && flow.kind === 'totp' && (
          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-sm font-medium">Scan this in your authenticator app, or enter the key by hand.</p>
            {flow.qr && <img src={flow.qr} alt="Authenticator QR code" className="h-40 w-40 rounded bg-white p-2" />}
            <p className="font-mono text-xs break-all rounded bg-muted px-2 py-1">{flow.secret?.replace(/(.{4})/g, '$1 ').trim()}</p>
            <div className="flex gap-2">
              <Input placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} className="w-40" />
              <Button size="sm" disabled={verifyTotp.isPending} onClick={() => verifyTotp.mutate()}>Verify</Button>
              <Button size="sm" variant="ghost" onClick={() => { setFlow(null); setCode(''); }}>Cancel</Button>
            </div>
          </div>
        )}

        {flow?.step === 'collect' && (flow.kind === 'email_otp' || flow.kind === 'sms_otp' || flow.kind === 'email_recovery') && (
          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-sm font-medium">{flow.kind === 'sms_otp' ? 'Enter your phone number (international format, e.g. +27821234567)' : 'Enter the email address to use'}</p>
            <div className="flex gap-2">
              <Input placeholder={flow.kind === 'sms_otp' ? '+27821234567' : 'you@example.com'} value={collectValue} onChange={(e) => setCollectValue(e.target.value)} className="flex-1" />
              <Button size="sm" disabled={sendOtp.isPending || !collectValue.trim()} onClick={() => sendOtp.mutate({ kind: flow.kind, value: collectValue.trim() })}>Send code</Button>
              <Button size="sm" variant="ghost" onClick={() => setFlow(null)}>Cancel</Button>
            </div>
          </div>
        )}

        {flow?.step === 'verify' && flow.kind !== 'totp' && (
          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-sm font-medium">Enter the code we sent to {flow.sentTo}.</p>
            <div className="flex gap-2">
              <Input placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} className="w-40" />
              <Button size="sm" disabled={verifyOtp.isPending} onClick={() => verifyOtp.mutate(flow.kind)}>Verify</Button>
              <Button size="sm" variant="ghost" onClick={() => { setFlow(null); setCode(''); }}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Add buttons */}
        {!flow && (
          <div className="grid gap-2 sm:grid-cols-2">
            <AddButton icon={KeyRound} label="Authenticator app" desc="Google Authenticator, 1Password, etc." onClick={() => startTotp.mutate()} />
            <AddButton icon={Fingerprint} label="Passkey" desc="Face ID, fingerprint, or a security key" onClick={() => addPasskey.mutate()} />
            {data?.emailAvailable && <AddButton icon={Mail} label="Email code" desc="A code sent to your email" onClick={() => beginCollect('email_otp', '')} />}
            {data?.smsAvailable && <AddButton icon={Smartphone} label="Text message" desc="A code sent by SMS" onClick={() => beginCollect('sms_otp')} />}
            {data?.emailAvailable && <AddButton icon={LifeBuoy} label="Recovery email" desc="Regain access if you are locked out" onClick={() => beginCollect('email_recovery')} />}
          </div>
        )}
      </Card>

      {/* Backup codes */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Backup codes</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{data?.backupCodesRemaining ?? 0} unused code{(data?.backupCodesRemaining ?? 0) === 1 ? '' : 's'} remaining.</p>
          </div>
          <Button size="sm" variant="outline" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>Regenerate</Button>
        </div>
      </Card>
    </div>
  );
}

function AddButton({ icon: Icon, label, desc, onClick }: { icon: React.ElementType; label: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-start gap-3 rounded-lg border border-border p-3 text-left hover:bg-muted/50">
      <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </button>
  );
}

export default AccountSecurity;
