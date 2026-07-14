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
}

interface SessionState {
  user: SessionUser | null;
  isSignedIn: boolean;
  /** True until the first /auth/me resolves. Routes must not redirect while true. */
  loading: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  user: null,
  isSignedIn: false,
  loading: true,
  refresh: async () => {},
  signIn: async () => {},
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

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((body as { error?: string }).error ?? "Sign in failed.");
    }
    setUser((body as { user: SessionUser }).user);
    setLoading(false);
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
      value={{ user, isSignedIn: !!user, loading, refresh, signIn, signOut }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
