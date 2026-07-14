import { API } from "@/lib/api";

/**
 * Thin client for the super-admin platform console (/platform/*).
 *
 * These routes were added AFTER the orval client was generated, so they are not in
 * @workspace/api-client-react. Rather than regenerate the whole client for an
 * admin-only surface, we hand-write typed fetch wrappers here. credentials: "include"
 * carries the session cookie; every call is guarded server-side by requireSuperAdmin.
 */

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string; detail?: string }).error ?? `Request failed (${res.status})`);
  }
  // Some endpoints (204-ish) may return empty; guard the parse.
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/* ── Types (mirror the server response shapes) ── */

export interface PlatformOverview {
  users: { total: number; active: number; suspended: number; invited: number; noPassword: number };
  partners: number;
  organisations: number;
  enrolments: number;
  logins24h: number;
  failedLogins24h: number;
}

export interface PlatformUserRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  partnerId: string | null;
  organisationId: string | null;
  lastLoginAt: string | null;
  hasPassword: boolean;
  createdAt: string;
}

export interface AuthSession {
  id: string;
  token?: string;
  userId: string;
  impersonatorId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
}

export interface LoginEvent {
  id: string;
  userId: string | null;
  email: string | null;
  outcome: string;
  ipAddress: string | null;
  userAgent: string | null;
  impersonatorId: string | null;
  createdAt: string;
}

export interface Enrolment {
  id: string;
  userId: string;
  courseId?: string;
  status?: string;
  [k: string]: unknown;
}

export interface PlatformUserDetail {
  user: PlatformUserRow & { [k: string]: unknown };
  sessions: AuthSession[];
  logins: LoginEvent[];
  enrolments: Enrolment[];
}

export interface AuditEvent {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorId: string | null;
  actorRole: string | null;
  partnerId: string | null;
  metadata: string | null;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  partnerId: string | null;
  scopes: string[] | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export type Role = "super_admin" | "partner_admin" | "org_admin" | "coach" | "learner";

/* ── Calls ── */

export const platformApi = {
  overview: () => req<PlatformOverview>("/platform/overview"),

  listUsers: (q = "") =>
    req<PlatformUserRow[]>(`/platform/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),

  getUser: (id: string) => req<PlatformUserDetail>(`/platform/users/${id}`),

  impersonate: (id: string) =>
    req<{ ok: boolean; impersonating: { id: string; email: string } }>(
      `/platform/users/${id}/impersonate`,
      { method: "POST" },
    ),

  resetLink: (id: string) =>
    req<{ link: string; expiresAt: string; email: string }>(
      `/platform/users/${id}/reset-link`,
      { method: "POST" },
    ),

  suspend: (id: string) => req<{ ok: boolean }>(`/platform/users/${id}/suspend`, { method: "POST" }),
  reactivate: (id: string) => req<{ ok: boolean }>(`/platform/users/${id}/reactivate`, { method: "POST" }),
  revokeSessions: (id: string) =>
    req<{ ok: boolean }>(`/platform/users/${id}/revoke-sessions`, { method: "POST" }),

  setRole: (id: string, role: Role) =>
    req<{ ok: boolean }>(`/platform/users/${id}/role`, {
      method: "POST",
      body: JSON.stringify({ role }),
    }),

  loginActivity: (limit = 100) => req<LoginEvent[]>(`/platform/login-activity?limit=${limit}`),
  audit: (limit = 100) => req<AuditEvent[]>(`/platform/audit?limit=${limit}`),

  listApiKeys: () => req<ApiKey[]>("/platform/api-keys"),
  createApiKey: (name: string, partnerId?: string | null) =>
    req<{ id: string; name: string; prefix: string; key: string }>("/platform/api-keys", {
      method: "POST",
      body: JSON.stringify({ name, partnerId: partnerId ?? null }),
    }),
  revokeApiKey: (id: string) => req<{ ok: boolean }>(`/platform/api-keys/${id}`, { method: "DELETE" }),
};
