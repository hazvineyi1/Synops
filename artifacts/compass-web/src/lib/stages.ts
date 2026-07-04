import {
  BookOpen,
  PenTool,
  CheckSquare,
  FileOutput,
  type LucideIcon,
} from "lucide-react";

/**
 * Canonical definition of the Compass curriculum pipeline. This is the single
 * source of truth for the four gate-driven stages every project moves through,
 * in order. Pages and the StageRail read from here so stage titles, order, and
 * routes never drift apart.
 *
 * `slug` is the path segment appended to /projects/:id for that stage workspace.
 */
export interface StageDef {
  id: number;
  title: string;
  slug: string;
  blurb: string;
  icon: LucideIcon;
}

export const STAGES: StageDef[] = [
  {
    id: 0,
    title: "Intake",
    slug: "intake",
    blurb: "Kickoff, course goals, and an audit of existing materials.",
    icon: BookOpen,
  },
  {
    id: 1,
    title: "Design",
    slug: "design",
    blurb: "Backward design: outcomes, assessments, and an alignment map.",
    icon: PenTool,
  },
  {
    id: 2,
    title: "QA",
    slug: "qa",
    blurb: "Accessibility and quality review against WCAG 2.1 AA.",
    icon: CheckSquare,
  },
  {
    id: 3,
    title: "Handoff",
    slug: "handoff",
    blurb: "Package, document, and transfer the finished course.",
    icon: FileOutput,
  },
];

export const STAGE_COUNT = STAGES.length;

export function getStage(id: number): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}

export type StageState = "done" | "current" | "upcoming";

export function stageState(stageId: number, currentStage: number): StageState {
  if (stageId < currentStage) return "done";
  if (stageId === currentStage) return "current";
  return "upcoming";
}
