import { API } from "@/lib/api";

/** Client for the support/helpdesk routes. */

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

export type TicketStatus = "open" | "pending" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

export interface Ticket {
  id: string;
  subject: string;
  body: string;
  requesterId: string;
  assigneeId: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  partnerId: string | null;
  organisationId: string | null;
  replyCount: number;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  requesterName?: string;
  requesterEmail?: string | null;
}

export interface TicketMessage {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  isStaffReply: boolean;
  isInternalNote: boolean;
  createdAt: string;
}

export interface SupportOverview {
  open: number;
  pending: number;
  resolved: number;
  closed: number;
  total: number;
}

export const supportApi = {
  overview: () => req<SupportOverview>("/support/overview"),
  list: (status?: TicketStatus) =>
    req<Ticket[]>(`/support/tickets${status ? `?status=${status}` : ""}`),
  get: (id: string) => req<{ ticket: Ticket; messages: TicketMessage[] }>(`/support/tickets/${id}`),
  create: (input: { subject: string; body: string; priority?: TicketPriority }) =>
    req<Ticket>("/support/tickets", { method: "POST", body: JSON.stringify(input) }),
  reply: (id: string, body: string, internalNote = false) =>
    req<{ ok: boolean; status: TicketStatus }>(`/support/tickets/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ body, internalNote }),
    }),
  update: (id: string, patch: { status?: TicketStatus; priority?: TicketPriority; assigneeId?: string | null }) =>
    req<Ticket>(`/support/tickets/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
};
