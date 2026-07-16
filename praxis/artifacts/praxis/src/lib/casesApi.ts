import { API, apiFetch } from "@/lib/api";

/** Supported tutor dialogue languages. bcp47 is used to hint the browser speech voice. */
export const LANGUAGES: { code: string; name: string; bcp47: string }[] = [
  { code: "en", name: "English", bcp47: "en-ZA" },
  { code: "zu", name: "isiZulu", bcp47: "zu-ZA" },
  { code: "xh", name: "isiXhosa", bcp47: "xh-ZA" },
  { code: "af", name: "Afrikaans", bcp47: "af-ZA" },
  { code: "sn", name: "Shona", bcp47: "sn-ZW" },
];
export const bcp47 = (code?: string | null) => LANGUAGES.find((l) => l.code === code)?.bcp47 ?? "en-ZA";

/**
 * Client for the authored-case / scenario vehicle (/cases, /case-sessions, /case-embed).
 * Added after the orval client was generated, so hand-written like platformApi.
 */

export interface RubricLevel { label: string; points: number; description: string }
export interface RubricCriterion {
  name: string;
  maxPoints: number;
  unitStandardId?: string | null;
  levels: RubricLevel[];
}
export interface CaseRubric { criteria: RubricCriterion[]; totalPoints: number }
export interface CaseRubricScore { criterion: string; points: number; maxPoints: number; note: string }

export interface CaseRow {
  id: string;
  organisationId: string | null;
  moduleId: string | null;
  createdBy: string;
  createdByName: string | null;
  title: string;
  learningObjective: string | null;
  contextBlock: string;
  openingQuestion: string | null;
  focusAreas: string[];
  aiConstraints: string | null;
  guidingInstructions: string | null;
  aiPersona: string | null;
  tutorName: string | null;
  tutorAvatar: string | null;
  language: string;
  difficulty: "foundational" | "intermediate" | "advanced";
  bloomsLevel: string | null;
  promptLimit: number;
  socraticStyle: string;
  aiTone: string;
  isLibrary: boolean;
  status: "draft" | "published";
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CaseDetail extends CaseRow {
  rubric: CaseRubric | null;
  canManage: boolean;
}

export interface CaseMessage { role: "tutor" | "learner"; content: string; at?: string }

export interface CaseSessionRow {
  id: string;
  caseId: string;
  status: "in_progress" | "completed" | "abandoned";
  messages: CaseMessage[];
  promptCount: number;
  promptLimit: number;
  engagementScore: number | null;
  engagementNarrative: string | null;
  conceptsAddressed: string[];
  reasoningStrengths: string[];
  developmentAreas: string[];
  rubricScores: CaseRubricScore[];
  createdAt: string;
  completedAt: string | null;
  // Present on session start + fetch so the runtime can show the tutor.
  tutorName?: string | null;
  tutorAvatar?: string | null;
  caseTitle?: string | null;
  language?: string | null;
  contextBlock?: string | null;
  learningObjective?: string | null;
}

export interface EmbedLink {
  id: string;
  token: string;
  label: string | null;
  isActive: boolean;
  accessCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface TutorFigureRow {
  id: string;
  name: string;
  image: string;
  gender: "female" | "male" | null;
  organisationId: string | null;
  createdAt: string;
}

export interface UnitStandardRow {
  id: string;
  code: string;
  title: string;
  framework: string;
  nqfLevel: number | null;
  credits: number | null;
}

export type CaseInput = Partial<Omit<CaseRow, "id" | "createdAt" | "updatedAt" | "createdBy" | "createdByName">>;

export const casesApi = {
  list: (status?: string) => apiFetch<CaseRow[]>(`/cases${status ? `?status=${status}` : ""}`),
  get: (id: string) => apiFetch<CaseDetail>(`/cases/${id}`),
  create: (body: CaseInput) => apiFetch<CaseRow>(`/cases`, { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: CaseInput) => apiFetch<CaseRow>(`/cases/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (id: string) => apiFetch<void>(`/cases/${id}`, { method: "DELETE" }),
  fork: (id: string) => apiFetch<CaseRow>(`/cases/${id}/fork`, { method: "POST" }),

  getRubric: (id: string) => apiFetch<CaseRubric>(`/cases/${id}/rubric`),
  saveRubric: (id: string, body: CaseRubric) => apiFetch<CaseRubric>(`/cases/${id}/rubric`, { method: "PUT", body: JSON.stringify(body) }),
  generateRubric: (id: string) => apiFetch<CaseRubric>(`/cases/${id}/rubric/generate`, { method: "POST" }),

  embedLinks: (id: string) => apiFetch<EmbedLink[]>(`/cases/${id}/embed-links`),
  createEmbedLink: (id: string, body: { label?: string; expiresAt?: string | null }) => apiFetch<EmbedLink>(`/cases/${id}/embed-links`, { method: "POST", body: JSON.stringify(body) }),
  revokeEmbedLink: (id: string, linkId: string) => apiFetch<void>(`/cases/${id}/embed-links/${linkId}`, { method: "DELETE" }),

  startSession: (caseId: string, body?: { learnerName?: string; language?: string }) =>
    apiFetch<CaseSessionRow>(`/cases/${caseId}/sessions`, { method: "POST", body: JSON.stringify(body ?? {}) }),
  mySessions: () => apiFetch<CaseSessionRow[]>(`/case-sessions/my`),
  getSession: (id: string) => apiFetch<CaseSessionRow>(`/case-sessions/${id}`),
  // Switch a live session's language: re-translates the facts + every prior tutor turn.
  setSessionLanguage: (id: string, language: string) =>
    apiFetch<{ language: string; messages: CaseMessage[]; contextBlock: string | null; learningObjective: string | null }>(
      `/case-sessions/${id}/language`,
      { method: "POST", body: JSON.stringify({ language }) }
    ),
  completeSession: (id: string) => apiFetch<CaseSessionRow>(`/case-sessions/${id}/complete`, { method: "POST" }),
  caseSessions: (caseId: string) => apiFetch<CaseSessionRow[]>(`/cases/${caseId}/sessions`),

  unitStandards: () => apiFetch<UnitStandardRow[]>(`/compliance/unit-standards`),

  tutorFigures: () => apiFetch<TutorFigureRow[]>(`/tutor-figures`),
  createTutorFigure: (body: { name: string; image: string; gender?: string | null }) =>
    apiFetch<TutorFigureRow>(`/tutor-figures`, { method: "POST", body: JSON.stringify(body) }),
  deleteTutorFigure: (id: string) => apiFetch<void>(`/tutor-figures/${id}`, { method: "DELETE" }),
};

export type SSEDone = { promptCount?: number; promptLimit?: number; budgetReached?: boolean; error?: string };

/**
 * Stream a Socratic case turn. Works for both authenticated (/case-sessions/:id/message)
 * and public embed (/case-embed/:token/chat) endpoints — pass the full path and body.
 */
export async function streamCaseTurn(
  path: string,
  body: unknown,
  onToken: (t: string) => void,
  onDone: (meta: SSEDone) => void
) {
  let meta: SSEDone = {};
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
    if (!res.body) { onDone(meta); return; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.content) onToken(data.content);
          if (data.done) meta = { promptCount: data.promptCount, promptLimit: data.promptLimit, budgetReached: data.budgetReached, error: data.error };
        } catch { /* ignore partial */ }
      }
    }
  } catch (e) {
    meta = { error: e instanceof Error ? e.message : "Stream failed" };
  }
  onDone(meta);
}
