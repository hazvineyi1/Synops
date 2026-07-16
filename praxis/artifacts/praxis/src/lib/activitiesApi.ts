import { API } from "@/lib/api";

/** Client for the interactive-activities routes (postdate the generated client). */

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export interface Activity {
  id: string;
  organisationId: string | null;
  courseId: string | null;
  moduleId: string | null;
  title: string;
  instructions: string | null;
  html: string;
  source: "html" | "embed" | "ai";
  embedUrl: string | null;
  kind: string;
  bloomsLevel: string | null;
  difficulty: "foundational" | "intermediate" | "advanced" | null;
  isLibrary: boolean;
  tags: string[];
  maxScore: number | null;
  published: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedActivity {
  type: string;
  title: string;
  instructions: string;
  bloomsLevel: string;
  difficulty: string;
  rationale: string;
  spec: unknown;
}

export interface ActivityEmbedLink {
  id: string;
  token: string;
  label: string | null;
  isActive: boolean;
  accessCount: number;
  expiresAt: string | null;
  createdAt: string;
}

/* Distribution chain (same shape as cases). */
export type AssignTier = "partner" | "organisation" | "learner";
export interface AssignTarget { id: string; name: string; alreadyAssigned: boolean }
export interface AssignCohort { id: string; name: string; courseTitle: string | null; memberCount: number }
export interface AssignTargets { tier: AssignTier; targets: AssignTarget[]; groups: AssignCohort[] }
export interface ActivityAssignmentRow {
  id: string; activityId: string; tier: AssignTier;
  partnerId: string | null; organisationId: string | null; userId: string | null; groupId: string | null;
  status: "assigned" | "in_progress" | "completed" | "revoked";
  dueDate: string | null; assignedByName: string | null; assignedAt: string; completedAt: string | null;
  targetName?: string | null;
}
export interface MyActivityAssignment extends ActivityAssignmentRow {
  title: string | null; instructions: string | null; kind: string | null; bloomsLevel: string | null; difficulty: string | null; published: boolean;
}
export interface AssignBody { tier?: AssignTier; targetIds?: string[]; groupId?: string; dueDate?: string | null; partnerId?: string; organisationId?: string }

export interface ActivitySubmission {
  id: string;
  activityId: string;
  userId: string;
  payload: unknown;
  score: number | null;
  status: "submitted" | "reviewed" | "approved";
  feedback: string | null;
  reviewedBy: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  learnerName?: string;
  learnerEmail?: string | null;
}

export interface ActivityInput {
  title?: string;
  instructions?: string | null;
  html?: string;
  source?: "html" | "embed" | "ai";
  embedUrl?: string | null;
  kind?: string;
  bloomsLevel?: string | null;
  difficulty?: string | null;
  isLibrary?: boolean;
  tags?: string[];
  maxScore?: number;
  published?: boolean;
  moduleId?: string | null;
  courseId?: string | null;
}

export const activitiesApi = {
  list: (params: { moduleId?: string; courseId?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return req<Activity[]>(`/activities${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => req<Activity>(`/activities/${id}`),
  create: (input: ActivityInput) =>
    req<Activity>("/activities", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: ActivityInput) =>
    req<Activity>(`/activities/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id: string) => req<{ ok: boolean }>(`/activities/${id}`, { method: "DELETE" }),

  submit: (id: string, payload: unknown, score: number | null) =>
    req<ActivitySubmission>(`/activities/${id}/submit`, {
      method: "POST",
      body: JSON.stringify({ payload, score }),
    }),
  mySubmissions: (id: string) => req<ActivitySubmission[]>(`/activities/${id}/my-submissions`),
  submissions: (id: string) => req<ActivitySubmission[]>(`/activities/${id}/submissions`),
  review: (submissionId: string, input: { status: string; score?: number | null; feedback?: string }) =>
    req<ActivitySubmission>(`/activities/submissions/${submissionId}/review`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  // AI generation — returns a menu of spec-based drafts (not persisted).
  generate: (body: { content: string; count?: number; types?: string[]; targetBloom?: string | null; targetDifficulty?: string | null }) =>
    req<{ activities: GeneratedActivity[] }>(`/activities/generate`, { method: "POST", body: JSON.stringify(body) }),

  // Public embed links (publish-out).
  embedLinks: (id: string) => req<ActivityEmbedLink[]>(`/activities/${id}/embed-links`),
  createEmbedLink: (id: string, body: { label?: string; expiresAt?: string | null } = {}) =>
    req<ActivityEmbedLink>(`/activities/${id}/embed-links`, { method: "POST", body: JSON.stringify(body) }),
  revokeEmbedLink: (id: string, linkId: string) => req<void>(`/activities/${id}/embed-links/${linkId}`, { method: "DELETE" }),

  // Distribution chain.
  assignTargets: (id: string, tier?: AssignTier) => req<AssignTargets>(`/activities/${id}/assign/targets${tier ? `?tier=${tier}` : ""}`),
  assign: (id: string, body: AssignBody) => req<{ created: number; skipped: number; assignments: ActivityAssignmentRow[] }>(`/activities/${id}/assign`, { method: "POST", body: JSON.stringify(body) }),
  assignments: (id: string) => req<ActivityAssignmentRow[]>(`/activities/${id}/assignments`),
  revokeAssignment: (assignmentId: string) => req<void>(`/activity-assignments/${assignmentId}`, { method: "DELETE" }),
  myAssignments: () => req<MyActivityAssignment[]>(`/activity-assignments/my`),
};

/** Public embed runner payload (unauthenticated). */
export interface PublicActivity {
  id: string; title: string; instructions: string | null; html: string;
  source: "html" | "embed" | "ai"; embedUrl: string | null; kind: string;
  bloomsLevel: string | null; difficulty: string | null;
}
export const getPublicActivity = (token: string) => req<PublicActivity>(`/activity-embed/${token}`);
