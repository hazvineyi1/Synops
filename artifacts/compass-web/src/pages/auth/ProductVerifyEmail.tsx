import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Redirect, useSearch } from "wouter";
import { useAuth, authErrorMessage } from "@/lib/auth-context";
import { usePageMeta } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/portal/AuthShell";
import type { Product } from "@/lib/products";

type Status = "verifying" | "error" | "missing";

export default function ProductVerifyEmail({ product }: { product: Product }) {
  usePageMeta(
    `Confirm your ${product.name} email`,
    `Confirm your email address to start your ${product.title} free trial.`,
  );
  const { user, verifyEmail, resendVerification } = useAuth();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";

  const [status, setStatus] = useState<Status>(token ? "verifying" : "missing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [resendEmail, setResendEmail] = useState("");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [resendError, setResendError] = useState<string | null>(null);

  // Run the verification POST exactly once for a given token. A GET on the link
  // must never mutate, so the confirmation happens here as a POST on load.
  const attempted = useRef(false);
  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    verifyEmail(token).catch((err) => {
      setErrorMessage(authErrorMessage(err));
      setStatus("error");
    });
  }, [token, verifyEmail]);

  // On success the auth context populates `user`; redirect into the workspace.
  if (user) {
    return <Redirect to={`~/${user.productKey}`} />;
  }

  async function onResend(e: FormEvent) {
    e.preventDefault();
    setResendError(null);
    setResendState("sending");
    try {
      await resendVerification(resendEmail.trim());
      setResendState("sent");
    } catch (err) {
      setResendError(authErrorMessage(err));
      setResendState("idle");
    }
  }

  return (
    <AuthShell
      title={`Confirm your ${product.name} email`}
      subtitle={`We are activating your ${product.title} trial.`}
      eyebrow={`${product.name} \u00b7 ${product.vertical}`}
      panelLine={product.panelLine}
      accent={product.accent}
      footer={
        <p>
          Already confirmed?{" "}
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
      {status === "verifying" && (
        <div className="space-y-2 text-sm text-muted-foreground" aria-live="polite">
          <p>Confirming your email and starting your 14 day trial...</p>
        </div>
      )}

      {(status === "error" || status === "missing") && (
        <div className="space-y-5">
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {status === "missing"
              ? "This confirmation link is missing its token. Request a new link below."
              : (errorMessage ??
                "This confirmation link is invalid or has expired. Request a new link below.")}
          </div>

          {resendState === "sent" ? (
            <div
              className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
              aria-live="polite"
            >
              If that address has an account awaiting confirmation, a new link is on its way.
              Check your inbox and spam folder.
            </div>
          ) : (
            <form onSubmit={onResend} className="space-y-3" noValidate>
              <div className="space-y-2">
                <Label htmlFor="resend-email">Send a new confirmation link</Label>
                <Input
                  id="resend-email"
                  type="email"
                  required
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </div>
              {resendError && (
                <p role="alert" className="text-sm text-destructive">
                  {resendError}
                </p>
              )}
              <Button
                type="submit"
                className="w-full text-white hover:opacity-90"
                style={{ backgroundColor: product.accent }}
                disabled={resendState === "sending"}
              >
                {resendState === "sending" ? "Sending..." : "Send new link"}
              </Button>
            </form>
          )}
        </div>
      )}
    </AuthShell>
  );
}
