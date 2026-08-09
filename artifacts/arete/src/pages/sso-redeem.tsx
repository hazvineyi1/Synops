import { useClerk } from "@clerk/react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

/**
 * Redeems a Clerk sign-in ticket handed off by the Synops SSO issuer. The backend /sso route
 * verified the admin and minted the ticket; here we complete the Clerk sign-in in the browser
 * and land the admin on the requested page (default /admin), already signed in.
 */
export function SsoRedeemPage() {
  const clerk = useClerk();
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clerk?.loaded || !clerk.client) return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const ticket = params.get("ticket");
        const nextRaw = params.get("next") || "/admin";
        const next = nextRaw.startsWith("/") ? nextRaw : "/admin";
        if (!ticket) {
          setError("Missing sign-in ticket.");
          return;
        }
        const signIn = clerk.client.signIn;
        const result = await signIn.create({ strategy: "ticket", ticket });
        if (cancelled) return;
        if (result.status === "complete" && result.createdSessionId) {
          await clerk.setActive({ session: result.createdSessionId });
          setLocation(next);
        } else {
          setError("Unexpected sign-in status: " + result.status);
        }
      } catch (err: unknown) {
        const e = err as { errors?: Array<{ message?: string }>; message?: string };
        setError(e?.errors?.[0]?.message ?? e?.message ?? "Single sign-on failed.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clerk?.loaded, clerk, setLocation]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="text-center">
        <p className="text-muted-foreground">{error ? error : "Signing you in…"}</p>
      </div>
    </div>
  );
}
