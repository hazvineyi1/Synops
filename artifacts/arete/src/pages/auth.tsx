import { SignIn, SignUp, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { useState } from "react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const TEST_EMAIL = "testuser@thecoach.dev";

function TestAccountButton() {
  const clerk = useClerk();
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      if (!clerk?.loaded || !clerk.client) {
        throw new Error("Auth not ready yet — please wait a moment and try again");
      }
      const resp = await fetch(`${basePath}/api/test-login`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok || !data.token) {
        throw new Error(data.error || "Failed to get test login token");
      }
      const signIn = clerk.client.signIn;
      const result = await signIn.create({
        strategy: "ticket",
        ticket: data.token,
      });
      if (result.status === "complete" && result.createdSessionId) {
        await clerk.setActive({ session: result.createdSessionId });
        setLocation("/");
      } else {
        setError("Unexpected sign-in status: " + result.status);
      }
    } catch (err: any) {
      setError(err?.errors?.[0]?.message ?? err?.message ?? "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 flex w-full max-w-sm flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="w-full rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/80 disabled:opacity-50"
      >
        {loading ? "Signing in…" : "Use test account"}
      </button>
      <p className="text-xs text-muted-foreground">
        Demo login: {TEST_EMAIL}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-12">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      {import.meta.env.DEV && <TestAccountButton />}
    </div>
  );
}

export function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-12">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      {import.meta.env.DEV && <TestAccountButton />}
    </div>
  );
}
