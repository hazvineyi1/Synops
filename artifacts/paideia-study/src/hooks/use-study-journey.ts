import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE = "/api";

export async function fetchApi(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Assessments
export function useStudyAssessments() {
  return useQuery({
    queryKey: ["study", "assessments"],
    queryFn: () => fetchApi("/study/assessments/"),
  });
}

export function useStudyAssessment(id?: string) {
  return useQuery({
    queryKey: ["study", "assessment", id],
    queryFn: () => fetchApi(`/study/assessments/${id}`),
    enabled: !!id,
  });
}

export function useGenerateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ materialId }: { materialId: string }) =>
      fetchApi("/study/assessments/generate", {
        method: "POST",
        body: JSON.stringify({ materialId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["study", "assessments"] });
    },
  });
}

export function useCompleteAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, answers }: { id: string; answers: Array<{ questionId: string; selectedOptionIndex: number; timeSpentSeconds: number }> }) =>
      fetchApi(`/study/assessments/${id}/complete`, {
        method: "POST",
        body: JSON.stringify({ answers }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["study", "assessments"] });
      qc.invalidateQueries({ queryKey: ["study", "paths"] });
      qc.invalidateQueries({ queryKey: ["study", "daily-session"] });
    },
  });
}

// Learning Paths
export function useStudyPaths() {
  return useQuery({
    queryKey: ["study", "paths"],
    queryFn: () => fetchApi("/study/paths/"),
  });
}

export function useStudyPath(id?: string) {
  return useQuery({
    queryKey: ["study", "path", id],
    queryFn: () => fetchApi(`/study/paths/${id}`),
    enabled: !!id,
  });
}

export function useDailySession() {
  return useQuery({
    queryKey: ["study", "daily-session"],
    queryFn: () => fetchApi("/study/paths/active/daily-session"),
  });
}

export function useCompletePathStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pathId, stepId, masteryScore, durationSeconds }: { pathId: string; stepId: string; masteryScore?: number; durationSeconds?: number }) =>
      fetchApi(`/study/paths/${pathId}/steps/${stepId}/complete`, {
        method: "POST",
        body: JSON.stringify({ masteryScore, durationSeconds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["study", "paths"] });
      qc.invalidateQueries({ queryKey: ["study", "path"] });
      qc.invalidateQueries({ queryKey: ["study", "daily-session"] });
      qc.invalidateQueries({ queryKey: ["study", "assessments"] });
    },
  });
}

// Learner Profile
export function useStudyProfile(enabled: boolean = true) {
  return useQuery({
    queryKey: ["study", "profile"],
    queryFn: () => fetchApi("/study/profile/"),
    enabled,
  });
}

export function useUpdateStudyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetchApi("/study/profile/", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["study", "profile"] });
    },
  });
}

// Strategy (generated after material upload, personalized by learning-style profile)
export function useMaterialStrategy(materialId?: string) {
  return useQuery({
    queryKey: ["study", "strategy", materialId],
    queryFn: () => fetchApi(`/study/strategy/${materialId}`),
    enabled: !!materialId,
  });
}

export function useGenerateStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ materialId }: { materialId: string }) =>
      fetchApi(`/study/strategy/${materialId}/generate`, { method: "POST" }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["study", "strategy", vars.materialId] });
    },
  });
}

export function useStartPathStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pathId, stepId }: { pathId: string; stepId: string }) =>
      fetchApi(`/study/paths/${pathId}/steps/${stepId}/start`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["study", "paths"] });
      qc.invalidateQueries({ queryKey: ["study", "path"] });
      qc.invalidateQueries({ queryKey: ["study", "daily-session"] });
    },
  });
}
