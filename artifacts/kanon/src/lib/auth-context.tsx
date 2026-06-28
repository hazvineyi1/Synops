import { createContext, useContext, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
  useLogin,
  useRegister,
  useVerifyEmail,
  useResendVerification,
  useLogout,
  useStartImpersonation,
  useStopImpersonation,
  type AuthUser,
  type Impersonator,
  type LoginInput,
  type RegisterInput,
  type RegisterResponse,
} from "@workspace/kanon-api-client";

interface AuthContextValue {
  user: AuthUser | null;
  /** Set when the session is an impersonation: the real super administrator. */
  impersonator: Impersonator | null;
  isLoading: boolean;
  login: (body: LoginInput) => Promise<AuthUser>;
  /**
   * Self-serve registration. By default this creates an unverified account and
   * sends a verification link WITHOUT establishing a session, so it resolves to
   * a RegisterResponse (not an AuthUser). Only when the server kill-switch
   * disables verification does it sign the user in; in that case the cached
   * current-user is refreshed so the post-auth redirect can fire.
   */
  register: (body: RegisterInput) => Promise<RegisterResponse>;
  /** Confirm an email with its token; on success the session is established. */
  verifyEmail: (token: string) => Promise<AuthUser>;
  /** Re-send a verification link to an address (enumeration-safe on the server). */
  resendVerification: (email: string) => Promise<RegisterResponse>;
  logout: () => Promise<void>;
  startImpersonating: (userId: number) => Promise<void>;
  stopImpersonating: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const meQueryKey = getGetCurrentUserQueryKey();

  const { data, isLoading } = useGetCurrentUser({
    query: {
      queryKey: meQueryKey,
      retry: false,
      staleTime: 60_000,
    },
  });

  const loginMut = useLogin();
  const registerMut = useRegister();
  const verifyEmailMut = useVerifyEmail();
  const resendVerificationMut = useResendVerification();
  const logoutMut = useLogout();
  const startImpersonationMut = useStartImpersonation();
  const stopImpersonationMut = useStopImpersonation();

  const login = async (body: LoginInput) => {
    const user = await loginMut.mutateAsync({ data: body });
    queryClient.setQueryData(meQueryKey, user);
    return user;
  };

  const register = async (body: RegisterInput) => {
    const res = await registerMut.mutateAsync({ data: body });
    // Verification required: no session was created, so there is nothing to
    // cache. The caller shows a "check your email" state. When verification is
    // disabled the server already signed the user in, so refresh /me to let the
    // state-driven redirect take over.
    if (!res.verificationRequired) {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
    }
    return res;
  };

  const verifyEmail = async (token: string) => {
    const user = await verifyEmailMut.mutateAsync({ data: { token } });
    queryClient.setQueryData(meQueryKey, user);
    return user;
  };

  const resendVerification = async (email: string) => {
    return resendVerificationMut.mutateAsync({ data: { email } });
  };

  const logout = async () => {
    await logoutMut.mutateAsync();
    queryClient.setQueryData(meQueryKey, null);
    await queryClient.invalidateQueries();
  };

  // Impersonation swaps the server session to the target user. The acting
  // identity changes entirely, so drop every cached query and refetch (including
  // /me, which now carries the impersonator). Stopping restores the real session.
  const startImpersonating = async (userId: number) => {
    await startImpersonationMut.mutateAsync({ data: { userId } });
    await queryClient.invalidateQueries();
  };

  const stopImpersonating = async () => {
    await stopImpersonationMut.mutateAsync();
    await queryClient.invalidateQueries();
  };

  return (
    <AuthContext.Provider
      value={{
        user: data ?? null,
        impersonator: data?.impersonator ?? null,
        isLoading,
        login,
        register,
        verifyEmail,
        resendVerification,
        logout,
        startImpersonating,
        stopImpersonating,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export function authErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === "object") {
      // Prefer a human-readable `message` (for example the plan-tier upgrade
      // prompts), then fall back to the short `error` code/string.
      const m = (data as { message?: unknown }).message;
      if (typeof m === "string" && m.length > 0) return m;
      const e = (data as { error?: unknown }).error;
      if (typeof e === "string") return e;
    }
  }
  return "Something went wrong. Please try again.";
}

/**
 * Pull the machine-readable `code` an API error may carry (for example
 * `email_unverified` from login, or `invalid_token` from verification) so the UI
 * can branch on it. Returns null when no code is present.
 */
export function authErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const c = (data as { code?: unknown }).code;
      if (typeof c === "string" && c.length > 0) return c;
    }
  }
  return null;
}
