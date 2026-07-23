import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { API } from "@/lib/api";

/**
 * The single source of truth for "who is signed in".
 *
 * This replaces Clerk. Clerk was a hosted identity provider: it owned the user record,
 * so the platform console could never truly control accounts (no master password reset,
 * no impersonation, no suspension, no login trail without paying for their audit tier).
 * Auth now lives in our own database behind an opaque session cookie, which is what
 * makes the super-admin console possible at all.
 *
 * The cookie is httpOnly, so JavaScript cannot read it. The only way to learn who you
 * are is to ask the server -- hence the /auth/me call on mount.
 */

export interface SessionUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  partnerId: string | null;
  organisationId: string | null;
  /** True when a super_admin is viewing the app AS this user. */
  impersonating: boolean;
  /** POPIA: the privacy-policy version the user last accepted (null = never). */
  consentVersion?: string | null;
  /** The current privacy-policy version the server expects. */
  privacyPolicyVersion?: string;
  /** True when the user must accept the current privacy policy before continuing. */
  consentRequired?: boolean;
  /** True when 2FA is on for this account. */
  mfaEnabled?: boolean;
  /** True when the user's role requires 2FA but they have not enabled it yet. */
  mfaSetupRequired?: boolean;
}

interface SessionState {
  user: SessionUser | null;
  isSignedIn: boolean;
  /** True until the first /auth/me resolves. Routes must not redirect while true. */
  loading: boolean;
  refresh: () => Promise<void>;
  /** Returns { mfaRequired: true } when the password was correct but a 2FA code is needed. */
  signIn: (email: string, password: string, code?: string) => Promise<{ mfaRequired?: boolean }>;
  /** One-click demo sign-in (no credentials). role: "student" | "admin". */
  demoSignIn: (role: "student" | "admin") => Promise<void>;
  /** End a server-side impersonation and restore the admin's OWN session (not a sign-out). */
  stopImpersonating: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  user: null,
  isSignedIn: false,
  loading: true,
  refresh: async () => {},
  signIn: async () => ({}),
  demoSignIn: async () => {},
  stopImpersonating: async () => {},
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/auth/me`, { credentials: "include" });
      // 401 is the ordinary "not signed in" answer, not an error worth surfacing.
      if (!res.ok) {
        setUser(null);
        return;
      }
      const { user: me } = (await res.json()) as { user: SessionUser };
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string, code?: string) => {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(code ? { email, password, code } : { email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((body as { error?: string }).error ?? "Sign in failed.");
    }
    // Password was correct but this account has 2FA on: no session yet, prompt for a code.
    if ((body as { mfaRequired?: boolean }).mfaRequired) {
      return { mfaRequired: true };
    }
    setUser((body as { user: SessionUser }).user);
    setLoading(false);
    return {};
  }, []);

  const demoSignIn = useCallback(async (role: "student" | "admin") => {
    const res = await fetch(`${API}/auth/demo-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((body as { error?: string }).error ?? "Could not start the demo.");
    }
    setUser((body as { user: SessionUser }).user);
    setLoading(false);
  }, []);

  const stopImpersonating = useCallback(async () => {
    // Restores the admin's own session from the praxis_impersonator cookie (server-side),
    // then a FULL reload so every cached query resets to the restored admin identity. This
    // must NOT be signOut — that would revoke the session and drop the admin at /sign-in.
    await fetch(`${API}/platform/stop-impersonating`, { method: "POST", credentials: "include" }).catch(
      () => {},
    );
    window.location.href = "/dashboard";
  }, []);

  const signOut = useCallback(async () => {
    await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" }).catch(
      () => {},
    );
    setUser(null);
    // Full reload, not a client-side route change: it drops every cached query and
    // every piece of component state belonging to the previous user. Leaking one
    // user's data into the next user's session is exactly the bug worth being
    // heavy-handed about.
    window.location.href = "/sign-in";
  }, []);

  return (
    <SessionContext.Provider
      value={{ user, isSignedIn: !!user, loading, refresh, signIn, demoSignIn, stopImpersonating, signOut }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
