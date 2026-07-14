import React, { useState } from "react";
import { Link } from "wouter";
import { API } from "@/lib/api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await fetch(`${API}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    // Always show the same confirmation, even on a network error or an unknown address.
    // Anything else turns this form into an account-enumeration oracle.
    setSent(true);
    setBusy(false);
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-1">Reset your password</h1>

        {sent ? (
          <>
            <p className="text-sm text-slate-400 mb-6">
              If that email has an account, a reset link is on its way. It expires in one hour.
            </p>
            <Link
              href="/sign-in"
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-400 mb-6">
              Enter your email and we will send you a link to set a new password.
            </p>
            <form onSubmit={onSubmit} className="space-y-4">
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@organisation.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {busy ? "Sending..." : "Send reset link"}
              </button>
            </form>
            <Link
              href="/sign-in"
              className="mt-6 inline-block text-sm text-slate-500 hover:text-slate-300"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
