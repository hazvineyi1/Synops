import React, { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KeyRound, ShieldCheck } from 'lucide-react';

/**
 * Full-screen blocking gate shown when the account has a temporary password (mustChangePassword). The
 * user must set their own password before reaching the app. On success we hard-reload so the session
 * refreshes with the flag cleared.
 */
export function ForcePasswordChange() {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) { setError('Use at least 8 characters.'); return; }
    if (pw !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      await apiFetch('/auth/force-set-password', { method: 'POST', body: JSON.stringify({ newPassword: pw }) });
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set your password. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><KeyRound className="h-5 w-5" /></div>
          <h1 className="text-lg font-serif font-semibold">Set your password</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          You signed in with a temporary password. Choose your own password to continue — you'll use it every time from now on.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">New password</span>
            <Input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Confirm new password</span>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter your password" />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Saving…' : 'Set password and continue'}</Button>
        </form>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Your password is stored securely and only you know it.
        </p>
      </div>
    </div>
  );
}

export default ForcePasswordChange;
