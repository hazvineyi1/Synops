import { apiFetch } from "@/lib/api";

/** Client for the unified gradebook routes. */

export type SourceType = "assignment" | "case" | "activity" | "manual";
export type ItemType = "formative" | "summative";

export interface GradebookColumn {
  key: string;
  itemId: string | null;
  sourceType: SourceType;
  sourceId: string | null;
  title: string;
  category: string;
  itemType: ItemType;
  gradeType?: "points" | "pass_fail" | "completion";
  pointsPossible: number;
  dueDate: string | null;
  includeInGrade: boolean;
  editable: boolean;
  position: number;
}

export interface CellValue {
  fraction: number | null;
  earned: number | null;
  note: string | null;
  auto?: boolean;
}

export interface Trend {
  dir: "up" | "down" | "flat" | "none";
  label: string;
}

export interface AlertSummary {
  status: "on_track" | "at_risk" | "off_track";
  reasons: string[];
  reasonLabels?: string[];
}

export interface LetterBand { label: string; min: number }
export interface GradebookSettings {
  weightingEnabled: boolean;
  summativeWeight: number;
  formativeWeight: number;
  categoryWeights: Record<string, number>;
  lettersEnabled: boolean;
  letterBands: LetterBand[];
}

export interface MatrixLearner {
  userId: string;
  user: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
  overallPercent: number | null;
  band: "good" | "warn" | "low" | "none";
  letterGrade?: string | null;
  trend: Trend;
  alert: AlertSummary;
  cells: Record<string, CellValue>;
}

export interface GradebookMatrix {
  columns: GradebookColumn[];
  learners: MatrixLearner[];
  classAverage: number | null;
  settings: GradebookSettings;
}

export interface StudyPlanItem {
  kind: "case" | "activity" | "review";
  refType: "case" | "activity" | "module" | null;
  refId: string | null;
  title: string;
  why: string;
  category: string | null;
  done: boolean;
}

export interface StudyPlan {
  id: string;
  rationale: string;
  items: StudyPlanItem[];
  createdAt: string;
  // Magic-link URL into the AI study coach (The Coach app) for this pushed remedial plan, if any.
  coachUrl?: string | null;
}

export interface MeGradebook {
  columns: GradebookColumn[];
  overallPercent: number | null;
  band: "good" | "warn" | "low" | "none";
  letterGrade?: string | null;
  trend: Trend;
  cells: Record<string, CellValue>;
  alert: AlertSummary;
  plan: StudyPlan | null;
  settings?: GradebookSettings;
}

export interface LearnerDetail extends MeGradebook {
  user: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
}

export interface MineCourse {
  courseId: string;
  courseTitle: string;
  overallPercent: number | null;
  band: "good" | "warn" | "low" | "none";
  alertStatus: "on_track" | "at_risk" | "off_track";
  planId: string | null;
}

export interface SourceInclusion {
  id: string;
  courseId: string;
  courseTitle: string;
  category: string;
  itemType: ItemType;
  pointsPossible: number;
  includeInGrade: boolean;
}

export interface ItemInput {
  sourceType: SourceType;
  sourceId?: string | null;
  title?: string;
  category?: string;
  itemType?: ItemType;
  pointsPossible?: number;
  dueDate?: string | null;
  includeInGrade?: boolean;
  position?: number;
}

export const gradebookApi = {
  matrix: (courseId: string, groupId?: string | null) =>
    apiFetch<GradebookMatrix>(`/courses/${courseId}/gradebook${groupId ? `?groupId=${groupId}` : ""}`),
  me: (courseId: string) => apiFetch<MeGradebook>(`/courses/${courseId}/gradebook/me`),
  settings: (courseId: string) => apiFetch<GradebookSettings>(`/courses/${courseId}/gradebook/settings`),
  saveSettings: (courseId: string, body: GradebookSettings) =>
    apiFetch<GradebookSettings>(`/courses/${courseId}/gradebook/settings`, { method: "PUT", body: JSON.stringify(body) }),
  learner: (courseId: string, userId: string) =>
    apiFetch<LearnerDetail>(`/courses/${courseId}/gradebook/learner/${userId}`),
  mine: () => apiFetch<{ courses: MineCourse[] }>(`/gradebook/mine`),

  createItem: (courseId: string, body: ItemInput) =>
    apiFetch<GradebookColumn & { id: string }>(`/courses/${courseId}/gradebook-items`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateItem: (id: string, body: Partial<ItemInput>) =>
    apiFetch(`/gradebook-items/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteItem: (id: string) => apiFetch(`/gradebook-items/${id}`, { method: "DELETE" }),

  source: (sourceType: SourceType, sourceId: string) =>
    apiFetch<SourceInclusion[]>(`/gradebook/source/${sourceType}/${sourceId}`),
  manageableCourses: () => apiFetch<{ id: string; title: string }[]>(`/gradebook/manageable-courses`),

  writeCell: (
    courseId: string,
    body: { userId: string; sourceType: SourceType; sourceId?: string | null; itemId?: string | null; score?: number | null; note?: string | null },
  ) => apiFetch(`/courses/${courseId}/gradebook/cell`, { method: "PATCH", body: JSON.stringify(body) }),

  scan: (courseId: string) =>
    apiFetch<{ evaluated: number; offTrack: number; alerted: number }>(`/courses/${courseId}/gradebook/scan`, { method: "POST" }),

  // Register every course deliverable (activities, cases, workshops, completion) as a gradebook column.
  sync: (courseId: string) =>
    apiFetch<{ ok: boolean; created: { activities: number; cases: number; workshops: number; completion: number } }>(`/courses/${courseId}/gradebook/sync`, { method: "POST" }),

  testEmail: () =>
    apiFetch<{ configured: boolean; sent: boolean; to?: string; message?: string }>(`/gradebook/test-email`, { method: "POST" }),

  markPlanItem: (planId: string, index: number, done: boolean) =>
    apiFetch<{ id: string; items: StudyPlanItem[]; status: string }>(`/study-plans/${planId}/items/${index}`, {
      method: "PATCH",
      body: JSON.stringify({ done }),
    }),
};
