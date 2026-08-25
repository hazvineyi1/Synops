import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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
  /** True when an admin issued a temporary password: force a new one before the app unlocks. */
  mustChangePassword?: boolean;
}

interface SessionState {
  user: SessionUser | null;
  isSignedIn: boolean;
  /** True until the first /auth/me resolves. Routes must not redirect while true. */
  loading: boolean;
  refresh: () => Promise<void>;
  /**
   * Sign in. When the password is correct but a second factor is needed, returns
   * { mfaRequired: true } plus the enrolled methods so the UI can offer a picker. Pass the second
   * factor (method + code, or a passkey assertion) on the follow-up call.
   */
  signIn: (
    email: string,
    password: string,
    second?: { method?: string; code?: string; assertion?: unknown },
  ) => Promise<{ mfaRequired?: boolean; methods?: string[]; hasBackupCodes?: boolean; preferred?: string; hints?: Record<string, string> }>;
  /**
   * One-click demo sign-in (no credentials). role: "student" | "student_alt" | "admin"
   * ("student_alt" = a second learner persona, e.g. the K-12 accommodations learner). `tenant`
   * optionally names which demo tenant to enter (e.g. "synops-k12"), so several demos can share a host.
   */
  demoSignIn: (role: "student" | "student_alt" | "admin", tenant?: string, persona?: string, name?: string) => Promise<void>;
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
  // Latest user, readable from callbacks with empty deps (e.g. signOut) without going stale.
  const userRef = useRef<SessionUser | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);

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

  const signIn = useCallback(async (email: string, password: string, second?: { method?: string; code?: string; assertion?: unknown }) => {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password, ...(second ?? {}) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((body as { error?: string }).error ?? "Sign in failed.");
    }
    // Password was correct but this account has MFA on: no session yet. Return the enrolled methods
    // so the UI can show a picker (any one verified method satisfies the challenge).
    const b = body as { mfaRequired?: boolean; methods?: string[]; hasBackupCodes?: boolean; preferred?: string; hints?: Record<string, string> };
    if (b.mfaRequired) {
      return { mfaRequired: true, methods: b.methods, hasBackupCodes: b.hasBackupCodes, preferred: b.preferred, hints: b.hints };
    }
    setUser((body as { user: SessionUser }).user);
    setLoading(false);
    return {};
  }, []);

  const demoSignIn = useCallback(async (role: "student" | "student_alt" | "admin", tenant?: string, persona?: string, name?: string) => {
    // Remember that this visitor arrived from the marketing site, so the app can offer a
    // one-tap route back to Synops home from anywhere in the demo.
    try { window.localStorage.setItem("synops_from_marketing", "1"); } catch { /* ignore */ }
    const res = await fetch(`${API}/auth/demo-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      // persona selects a specific learner within the tenant (e.g. the K-12 landing's 7 students).
      // name (optional) personalises the demo and is recorded with the access notification.
      body: JSON.stringify({ role, ...(tenant ? { tenant } : {}), ...(persona ? { persona } : {}), ...(name ? { name } : {}) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((body as { error?: string }).error ?? "Could not start the demo.");
    }
    const b = body as { user: SessionUser; demoSessionId?: string };
    try { if (b.demoSessionId) window.sessionStorage.setItem("synops_demo_track", b.demoSessionId); } catch { /* ignore */ }
    setUser(b.user);
    setLoading(false);
  }, []);

  const stopImpersonating = useCallback(async () => {
    // Restores the admin's own session from the praxis_impersonator cookie (server-side),
    // then a FULL reload so every cached query resets to the restored admin identity. This
    // must NOT be signOut, that would revoke the session and drop the admin at /sign-in.
    await fetch(`${API}/platform/stop-impersonating`, { method: "POST", credentials: "include" }).catch(
      () => {},
    );
    window.location.href = "/dashboard";
  }, []);

  const signOut = useCallback(async () => {
    // Demo personas came in via a demo landing, so send them back to the RIGHT one rather than the
    // enrolment sign-in (a dead end for them). K-12 demo learners (…​.k12@synops-demo.test) return to
    // /k12; the other synops-demo personas return to /demo; real users go to /sign-in.
    const email = (userRef.current?.email ?? "").toLowerCase();
    const dest = email.includes(".k12@synops-demo.test") ? "/k12"
      : email.endsWith("@synops-demo.test") ? "/demo"
      : "/sign-in";
    await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" }).catch(
      () => {},
    );
    setUser(null);
    // Full reload, not a client-side route change: it drops every cached query and
    // every piece of component state belonging to the previous user. Leaking one
    // user's data into the next user's session is exactly the bug worth being
    // heavy-handed about.
    window.location.href = dest;
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
