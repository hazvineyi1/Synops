import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

async function adminFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

async function adminPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}) as any);
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export const ADMIN_ROLES = ["user", "support", "content_editor", "moderator", "super_admin"] as const;

export interface AuditEntry {
  id: number;
  actor_user_id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_email: string | null;
  metadata: any;
  created_at: string;
}

export interface AdminOverview {
  total_users: number;
  new_users_today: number;
  new_users_7d: number;
  new_users_30d: number;
  assessments_complete: number;
  active_users_today: number;
  active_users_7d: number;
  active_users_30d: number;
  total_concepts: number;
  total_messages: number;
  total_user_messages: number;
  total_checkpoints: number;
  avg_checkpoint_grade: number;
  total_plans: number;
  completed_plans: number;
  total_retros: number;
  pro_users: number;
  trial_users: number;
  total_sessions: number;
  total_time_seconds: number;
  total_institutions: number;
  total_cohorts: number;
  total_referrals: number;
  active_api_keys: number;
  active_webhooks: number;
}

export interface UsageDay {
  day: string;
  messages: number;
  active_users: number;
  new_users: number;
  checkpoints: number;
}

export interface BreakdownItem {
  key: string | null;
  count: number;
}

export interface AdminBreakdown {
  personalities: BreakdownItem[];
  goals: BreakdownItem[];
  baselines: BreakdownItem[];
  countries: BreakdownItem[];
  devices: BreakdownItem[];
}

export interface AdminLogin {
  started_at: string;
  last_seen_at: string;
  seconds: number;
  ip_address: string | null;
  device: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  email: string;
  name: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
  assessment_complete: boolean;
  last_seen_at: string | null;
  referral_count: number;
  plan: string;
  goal: string | null;
  exam_name: string | null;
  coach_personality: string | null;
  exam_date: string | null;
  hours_per_week: number | null;
  concept_count: number;
  mastered_count: number;
  avg_mastery: number;
  message_count: number;
  checkpoint_count: number;
  avg_grade: number;
  completed_plans: number;
  session_count: number;
  total_time_seconds: number;
  last_active: string | null;
}

export interface AdminSession {
  started_at: string;
  last_seen_at: string;
  seconds: number;
  ip_address: string | null;
  device: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

export interface AdminUserDetail {
  user: Record<string, any>;
  banned?: boolean;
  sessions: AdminSession[];
  recentCheckpoints: {
    date: string;
    coach_grade: number | null;
    confidence_before: number | null;
    concept: string | null;
  }[];
}

export function useAdminUserDetail(id: string | null) {
  return useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => adminFetch<AdminUserDetail>(`/admin/users/${id}`),
    enabled: !!id,
  });
}

export function useIsAdmin() {
  return useQuery({
    queryKey: ["admin", "me"],
    queryFn: () => adminFetch<{ isAdmin: boolean; role?: string }>("/admin/me"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAdminOverview(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => adminFetch<AdminOverview>("/admin/overview"),
    enabled,
  });
}

export function useAdminUsage(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "usage"],
    queryFn: () => adminFetch<UsageDay[]>("/admin/usage"),
    enabled,
  });
}

export function useAdminLogins(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "logins"],
    queryFn: () => adminFetch<AdminLogin[]>("/admin/logins"),
    enabled,
  });
}

export function useAdminBreakdown(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "breakdown"],
    queryFn: () => adminFetch<AdminBreakdown>("/admin/breakdown"),
    enabled,
  });
}

export function useAdminUsers(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => adminFetch<AdminUser[]>("/admin/users"),
    enabled,
  });
}

export function useAuditLog(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () => adminFetch<{ entries: AuditEntry[] }>("/admin/audit"),
    enabled,
  });
}

export function useSetUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      adminPost<{ ok: boolean; role: string }>(`/admin/users/${id}/role`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });
}

export function useSuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, suspend }: { id: string; suspend: boolean }) =>
      adminPost<{ ok: boolean }>(`/admin/users/${id}/${suspend ? "suspend" : "reactivate"}`, {}),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["admin", "user", v.id] });
      qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });
}

export function useResetProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      adminPost<{ ok: boolean; deleted: Record<string, number> }>(`/admin/users/${id}/reset-progress`, {}),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["admin", "user", v.id] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });
}
