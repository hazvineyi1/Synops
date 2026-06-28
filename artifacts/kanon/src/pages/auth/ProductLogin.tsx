import { useState, type FormEvent } from "react";
import { Link, Redirect } from "wouter";
import { useAuth, authErrorMessage, authErrorCode } from "@/lib/auth-context";
import { useBranding } from "@/lib/branding-context";
import { usePageMeta } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/portal/AuthShell";
import type { Product } from "@/lib/products";

export default function ProductLogin({ product }: { product: Product }) {
  usePageMeta(
    `Sign in to ${product.name}`,
    `Sign in to ${product.name}, the ${product.title} from Synops Advisory Group.`,
  );
  const { user, login, resendVerification } = useAuth();
  const { isBranded, organization } = useBranding();

  // When the host resolves to a white-label org, its accent and logo theme the
  // sign-in screen. The host is cosmetic only; it never grants access.
  const branded = isBranded ? organization : null;
  const accent = branded?.accentColor ?? product.accent;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Set when login is refused because the address is not yet confirmed. We then
  // offer to re-send the confirmation link instead of showing a dead-end error.
  const [unverified, setUnverified] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  // Drive the post-auth redirect from auth state, not an imperative navigate,
  // which would race the auth-context re-render and bounce back to login. Land
  // users on the product they belong to.
  if (user) {
    return <Redirect to={`~/${user.productKey}`} />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setUnverified(false);
    setSubmitting(true);
    try {
      await login({ email, password });
    } catch (err) {
      if (authErrorCode(err) === "email_unverified") {
        setUnverified(true);
      } else {
        setError(authErrorMessage(err));
      }
      setSubmitting(false);
    }
  }

  async function onResend() {
    setResendState("sending");
    try {
      await resendVerification(email.trim());
    } finally {
      setResendState("sent");
    }
  }

  return (
    <AuthShell
      title={`Sign in to ${product.name}`}
      subtitle={product.title}
      eyebrow={`${product.name} (KAH-non) \u00b7 ${product.vertical}`}
      panelLine={product.panelLine}
      accent={accent}
      logoUrl={branded?.logoUrl ?? undefined}
      brandName={branded?.name}
      footer={
        product.hasRegister ? (
          <p>
            Need an account?{" "}
            <Link
              href={`/${product.key}/register`}
              className="font-medium hover:underline"
              style={{ color: accent }}
            >
              Create one
            </Link>
          </p>
        ) : (
          <p>Access to {product.name} is provisioned by your engagement team.</p>
        )
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {branded && (
          <div
            className="rounded-md border-l-4 bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
            style={{ borderLeftColor: accent }}
          >
            Provided for {branded.name} via Synops Advisory Group.
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        {unverified && (
          <div
            role="alert"
            className="space-y-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
          >
            <p>
              Please confirm your email before signing in. Open the link we sent when you registered.
            </p>
            {resendState === "sent" ? (
              <p aria-live="polite">A new confirmation link is on its way if your account is awaiting confirmation.</p>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onResend}
                disabled={resendState === "sending" || email.trim().length === 0}
              >
                {resendState === "sending" ? "Sending..." : "Resend confirmation email"}
              </Button>
            )}
          </div>
        )}
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
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          className="w-full text-white hover:opacity-90"
          style={{ backgroundColor: accent }}
          disabled={submitting}
        >
          {submitting ? "Signing in..." : "Sign in"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          <Link
            href={`/${product.key}/reset-password`}
            className="font-medium hover:underline"
            style={{ color: accent }}
          >
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
