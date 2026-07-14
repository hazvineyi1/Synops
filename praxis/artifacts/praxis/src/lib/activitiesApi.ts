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
  courseId: string | null;
  moduleId: string | null;
  title: string;
  instructions: string | null;
  html: string;
  maxScore: number | null;
  published: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

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
};
