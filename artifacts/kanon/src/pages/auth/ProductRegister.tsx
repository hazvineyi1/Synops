import { useState, type FormEvent } from "react";
import { Link, Redirect } from "wouter";
import { useAuth, authErrorMessage } from "@/lib/auth-context";
import { usePageMeta } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/portal/AuthShell";
import type { RegisterInput } from "@workspace/kanon-api-client";
import type { Product } from "@/lib/products";

export default function ProductRegister({ product }: { product: Product }) {
  usePageMeta(
    `Create your ${product.name} account`,
    `Register for ${product.name}, the ${product.title} from Synops Consulting Group.`,
  );
  const { user, register, resendVerification } = useAuth();

  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Set once registration succeeds and a verification link has been sent. We
  // then swap the form for a "check your email" confirmation instead of logging
  // the user in, because the trial does not start until the address is confirmed.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  if (user) {
    return <Redirect to={`~/${user.productKey}`} />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await register({
        name,
        email,
        password,
        organization: organization.trim() || undefined,
        productKey: product.key as RegisterInput["productKey"],
      });
      if (res.verificationRequired) {
        setSentTo(res.email);
      }
      // When verification is disabled the context refreshed /me; the `if (user)`
      // redirect above takes over on the next render.
    } catch (err) {
      setError(authErrorMessage(err));
      setSubmitting(false);
    }
  }

  async function onResend() {
    if (!sentTo) return;
    setResendState("sending");
    try {
      await resendVerification(sentTo);
    } finally {
      setResendState("sent");
    }
  }

  if (sentTo) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={`Confirm your address to start your ${product.title} trial.`}
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
        <div className="space-y-5">
          <div
            className="rounded-md border bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <p>
              We sent a confirmation link to <span className="font-medium text-foreground">{sentTo}</span>.
              Open it to confirm your address and start your 14 day free trial. No credit card required.
            </p>
            <p className="mt-2">
              The link expires in 24 hours. If you do not see the email, check your spam folder.
            </p>
          </div>

          {resendState === "sent" ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              A new link is on its way if your address is still awaiting confirmation.
            </p>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onResend}
              disabled={resendState === "sending"}
            >
              {resendState === "sending" ? "Sending..." : "Resend confirmation email"}
            </Button>
          )}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Start your free ${product.title} trial`}
      subtitle={`Create your ${product.name} account and explore ${product.title} free for 14 days. No credit card required.`}
      eyebrow={`${product.name} \u00b7 ${product.vertical}`}
      panelLine={product.panelLine}
      accent={product.accent}
      footer={
        <p>
          Already have an account?{" "}
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
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="organization">
            Organization <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="organization"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            autoComplete="organization"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <Button
          type="submit"
          className="w-full text-white hover:opacity-90"
          style={{ backgroundColor: product.accent }}
          disabled={submitting}
        >
          {submitting ? "Creating your account..." : "Start free trial"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          We will email you a link to confirm your address before the trial begins.
        </p>
      </form>
    </AuthShell>
  );
}
