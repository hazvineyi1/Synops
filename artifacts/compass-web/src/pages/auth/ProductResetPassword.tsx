import { useState, type FormEvent } from "react";
import { Link, useSearch } from "wouter";
import { usePageMeta } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/portal/AuthShell";
import type { Product } from "@/lib/products";

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
}

// One page handles both halves of the flow. With no `?token=` it shows the
// "send me a reset link" form; with a token (from the emailed link) it shows the
// "set a new password" form.
export default function ProductResetPassword({ product }: { product: Product }) {
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";
  const mode: "request" | "reset" = token ? "reset" : "request";

  usePageMeta(
    `Reset your ${product.name} password`,
    `Reset the password for your ${product.name} account.`,
  );

  const [email, setEmail] = useState("");
  const [requested, setRequested] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await postJson("/api/auth/forgot-password", { email: email.trim() });
    } finally {
      // The endpoint is enumeration-safe and always succeeds, so show the same
      // confirmation regardless of the outcome.
      setRequested(true);
      setSubmitting(false);
    }
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await postJson("/api/auth/reset-password", { token, password });
      if (res.ok) {
        setDone(true);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "This reset link is invalid or has expired. Request a new one.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title={`Reset your ${product.name} password`}
      subtitle={product.title}
      eyebrow={`${product.name} · ${product.vertical}`}
      panelLine={product.panelLine}
      accent={product.accent}
      footer={
        <p>
          Remembered it?{" "}
          <Link
            href={`/${product.key}/login`}
            className="font-medium hover:underline"
            style={{ color: product.accent }}
          >
            Sign in
          </Link>
        </p>
      }
    >
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {mode === "request" ? (
        requested ? (
          <div
            className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
            aria-live="polite"
          >
            If an account exists for that email, we have sent a link to reset your password.
            Check your inbox and spam folder. The link expires in 1 hour.
          </div>
        ) : (
          <form onSubmit={onRequest} className="space-y-4" noValidate>
            <p className="text-sm text-muted-foreground">
              Enter your account email and we will send you a link to set a new password.
            </p>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              className="w-full text-white hover:opacity-90"
              style={{ backgroundColor: product.accent }}
              disabled={submitting}
            >
              {submitting ? "Sending..." : "Send reset link"}
            </Button>
          </form>
        )
      ) : done ? (
        <div className="space-y-4">
          <div
            className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
            aria-live="polite"
          >
            Your password has been reset. You can now sign in with your new password.
          </div>
          <Button
            asChild
            className="w-full text-white hover:opacity-90"
            style={{ backgroundColor: product.accent }}
          >
            <Link href={`/${product.key}/login`}>Go to sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onReset} className="space-y-4" noValidate>
          <p className="text-sm text-muted-foreground">Choose a new password for your account.</p>
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            className="w-full text-white hover:opacity-90"
            style={{ backgroundColor: product.accent }}
            disabled={submitting}
          >
            {submitting ? "Resetting..." : "Set new password"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
