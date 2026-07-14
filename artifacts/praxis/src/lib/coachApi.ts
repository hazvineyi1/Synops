import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type PlanItemKind = "review" | "new" | "weak";

export interface CoachPlanItem {
  moduleId: string;
  moduleTitle: string;
  courseId: string | null;
  kind: PlanItemKind;
  reason: string;
  done: boolean;
}

export interface CoachPlan {
  id: string;
  userId: string;
  planDate: string;
  rationale: string;
  items: CoachPlanItem[];
  status: "active" | "completed";
}

export interface ConceptMastery {
  moduleId: string;
  moduleTitle: string;
  courseId: string | null;
  mastery: number;
  reps: number;
  lastGrade: number | null;
  dueDate: string | null;
  due: boolean;
  lastReviewedAt: string | null;
}

export type CoachPersonality =
  | "socratic_mentor"
  | "drill_sergeant"
  | "warm_encourager"
  | "strategic_analyst";

export interface CoachProfile {
  coachPersonality: CoachPersonality;
  learningStyle: string | null;
  accommodations: string[];
  phone: string | null;
  whatsappOptIn: boolean;
}

export function useCoachPlan() {
  return useQuery({
    queryKey: ["coach", "plan"],
    queryFn: () => apiFetch<CoachPlan>("/learn/plan"),
  });
}

export function useRegeneratePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<CoachPlan>("/learn/plan/regenerate", { method: "POST" }),
    onSuccess: (data) => qc.setQueryData(["coach", "plan"], data),
  });
}

export function useTogglePlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { moduleId: string; done: boolean }) =>
      apiFetch<CoachPlan>("/learn/plan/item", {
        method: "PATCH",
        body: JSON.stringify(vars),
      }),
    onSuccess: (data) => qc.setQueryData(["coach", "plan"], data),
  });
}

export function useConceptMastery() {
  return useQuery({
    queryKey: ["coach", "mastery"],
    queryFn: () => apiFetch<ConceptMastery[]>("/learn/mastery"),
  });
}

export function useCoachProfile() {
  return useQuery({
    queryKey: ["coach", "profile"],
    queryFn: () => apiFetch<CoachProfile>("/learn/profile"),
  });
}

export function useUpdateCoachProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<CoachProfile>) =>
      apiFetch<CoachProfile>("/learn/profile", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (data) => qc.setQueryData(["coach", "profile"], data),
  });
}

export function useWhatsappStatus() {
  return useQuery({
    queryKey: ["coach", "whatsapp-status"],
    queryFn: () => apiFetch<{ configured: boolean }>("/whatsapp/status"),
  });
}

export async function startModuleSession(moduleId: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/sessions", {
    method: "POST",
    body: JSON.stringify({ moduleId }),
  });
}

export const PERSONALITY_META: Record<
  CoachPersonality,
  { label: string; blurb: string; accent: string }
> = {
  socratic_mentor: {
    label: "Socratic Mentor",
    blurb: "Calm, curious, patient. Draws you out with genuine interest.",
    accent: "from-sky-500/15 to-transparent",
  },
  drill_sergeant: {
    label: "Drill Sergeant",
    blurb: "Direct, demanding, high-tempo. Holds a high bar and pushes hard.",
    accent: "from-red-500/15 to-transparent",
  },
  warm_encourager: {
    label: "Warm Encourager",
    blurb: "Supportive, affirming, human. Names your progress, then raises the next question.",
    accent: "from-amber-500/15 to-transparent",
  },
  strategic_analyst: {
    label: "Strategic Analyst",
    blurb: "Precise, structured, evidence-driven. Makes you defend each claim.",
    accent: "from-violet-500/15 to-transparent",
  },
};

export const VARK_OPTIONS = [
  { value: "visual", label: "Visual", hint: "Pictures, maps, diagrams" },
  { value: "auditory", label: "Auditory", hint: "Talking it through aloud" },
  { value: "kinesthetic", label: "Kinesthetic", hint: "Action and doing" },
  { value: "reading_writing", label: "Reading / Writing", hint: "Precise wording, lists" },
] as const;

export const ACCOMMODATION_OPTIONS = [
  { value: "scaffolded_questions", label: "Scaffolded questions" },
  { value: "simplified_language", label: "Simplified language" },
  { value: "concrete_examples", label: "Concrete examples" },
  { value: "positive_reinforcement", label: "Positive reinforcement" },
  { value: "chunked_content", label: "One idea at a time" },
  { value: "explicit_transitions", label: "Explicit transitions" },
  { value: "predictable_structure", label: "Predictable structure" },
  { value: "extended_processing", label: "Extra thinking time" },
  { value: "literal_language", label: "Literal language" },
] as const;
