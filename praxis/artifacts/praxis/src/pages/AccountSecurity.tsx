import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ShieldOff, KeyRound, Copy, Check, AlertTriangle, Lock } from 'lucide-react';

interface MfaStatus { enabled: boolean; backupCodesRemaining: number }

/**
 * Account security: opt-in TOTP two-factor auth. Enrolment is manual-key (every authenticator app
 * supports "enter a setup key"), which keeps this dependency-free; a QR is a later nicety. The
 * secret and codes stay in this component - the backup codes are shown exactly once after enabling.
 */
export function AccountSecurity() {
  const qc = useQueryClient();
  const { data: status, isLoading } = useQuery({
    queryKey: ['mfa-status'],
    queryFn: () => apiFetch<MfaStatus>('/auth/mfa/status'),
  });
  const enabled = !!status?.enabled;

  const [phase, setPhase] = useState<'idle' | 'setup' | 'backup'>('idle');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disableCode, setDisableCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const setupM = useMutation({
    mutationFn: () => apiFetch<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup', { method: 'POST', body: '{}' }),
    onSuccess: (d) => { setSecret(d.secret); setPhase('setup'); setErr(null); },
    onError: (e: any) => setErr(e?.message ?? 'Could not start setup.'),
  });
  const enableM = useMutation({
    mutationFn: () => apiFetch<{ enabled: boolean; backupCodes: string[] }>('/auth/mfa/enable', { method: 'POST', body: JSON.stringify({ code: code.trim() }) }),
    onSuccess: (d) => { setBackupCodes(d.backupCodes ?? []); setPhase('backup'); setCode(''); setErr(null); qc.invalidateQueries({ queryKey: ['mfa-status'] }); },
    onError: (e: any) => setErr(e?.message ?? 'That code did not match.'),
  });
  const disableM = useMutation({
    mutationFn: () => apiFetch('/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ code: disableCode.trim() }) }),
    onSuccess: () => { setDisableCode(''); setErr(null); setPhase('idle'); qc.invalidateQueries({ queryKey: ['mfa-status'] }); },
    onError: (e: any) => setErr(e?.message ?? 'Enter a current code to turn two-factor off.'),
  });

  const grouped = secret.replace(/(.{4})/g, '$1 ').trim();
  const copySecret = () => { navigator.clipboard?.writeText(secret).catch(() => {}); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Security" icon={Lock} subtitle="Protect your account with a second sign-in step." />

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2 ${enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
            {enabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold">Two-factor authentication (2FA)</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              An authenticator app generates a 6-digit code you enter after your password. It means a stolen password alone can't get into your account.
            </p>

            {isLoading && <p className="text-sm text-muted-foreground mt-4">Loading…</p>}

            {/* ENABLED */}
            {!isLoading && enabled && phase !== 'backup' && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2.5 py-1 text-xs font-medium">
                    <Check className="h-3.5 w-3.5" /> On
                  </span>
                  <span className="text-muted-foreground">{status?.backupCodesRemaining ?? 0} backup codes remaining</span>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <label className="block text-sm font-medium mb-1.5">Turn off two-factor</label>
                  <p className="text-xs text-muted-foreground mb-2">Enter a current authenticator or backup code to confirm it's you.</p>
                  <div className="flex gap-2">
                    <input value={disableCode} onChange={(e) => setDisableCode(e.target.value)} placeholder="123456"
                      inputMode="numeric" autoComplete="one-time-code"
                      className="w-40 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono tracking-widest outline-none focus:ring-2 focus:ring-primary/30" />
                    <Button variant="outline" disabled={disableM.isPending || !disableCode.trim()} onClick={() => disableM.mutate()}>
                      {disableM.isPending ? 'Turning off…' : 'Turn off'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* IDLE (not enabled) */}
            {!isLoading && !enabled && phase === 'idle' && (
              <div className="mt-4">
                <Button onClick={() => setupM.mutate()} disabled={setupM.isPending} className="gap-2">
                  <ShieldCheck className="h-4 w-4" /> {setupM.isPending ? 'Starting…' : 'Enable two-factor'}
                </Button>
              </div>
            )}

            {/* SETUP */}
            {phase === 'setup' && (
              <div className="mt-4 space-y-4">
                <ol className="text-sm space-y-2 list-decimal ml-4">
                  <li>Open your authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password…).</li>
                  <li>Choose <strong>Add account</strong> → <strong>Enter a setup key</strong> (manual entry).</li>
                  <li>Paste the key below. Account name: your email. Type: time-based.</li>
                </ol>
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Setup key</div>
                  <div className="flex items-center justify-between gap-3">
                    <code className="font-mono text-sm break-all">{grouped}</code>
                    <Button size="sm" variant="ghost" className="gap-1.5 shrink-0" onClick={copySecret}>
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Enter the 6-digit code from the app</label>
                  <div className="flex gap-2">
                    <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456"
                      inputMode="numeric" autoComplete="one-time-code" autoFocus
                      className="w-40 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono tracking-widest outline-none focus:ring-2 focus:ring-primary/30" />
                    <Button disabled={enableM.isPending || code.trim().length < 6} onClick={() => enableM.mutate()} className="gap-2">
                      <KeyRound className="h-4 w-4" /> {enableM.isPending ? 'Verifying…' : 'Confirm'}
                    </Button>
                    <Button variant="ghost" onClick={() => { setPhase('idle'); setCode(''); setErr(null); }}>Cancel</Button>
                  </div>
                </div>
              </div>
            )}

            {/* BACKUP CODES (shown once) */}
            {phase === 'backup' && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                  <Check className="h-4 w-4" /> Two-factor is now on.
                </div>
                <div className="rounded-lg border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                    <AlertTriangle className="h-4 w-4" /> Save your backup codes now
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">Each code works once if you lose your authenticator. They will not be shown again.</p>
                  <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                    {backupCodes.map((c) => <div key={c} className="rounded bg-background border border-border px-2 py-1 text-center">{c}</div>)}
                  </div>
                  <Button size="sm" variant="outline" className="mt-3 gap-1.5"
                    onClick={() => { navigator.clipboard?.writeText(backupCodes.join('\n')).catch(() => {}); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy all'}
                  </Button>
                </div>
                <Button onClick={() => { setPhase('idle'); setBackupCodes([]); }}>Done</Button>
              </div>
            )}

            {err && (
              <div role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">{err}</div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

export default AccountSecurity;
