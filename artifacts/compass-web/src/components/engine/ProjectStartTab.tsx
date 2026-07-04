import { useEffect, useState } from "react";
import {
  useCreateObjective,
  useDeleteObjective,
  useUpdateCourse,
  getListObjectivesQueryKey,
  getListCoursesQueryKey,
  getGetProjectGateStatusQueryKey,
  type Course,
  type Objective,
} from "@workspace/compass-api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ObjectiveQualityBadge } from "@/components/engine/ObjectiveQualityBadge";
import {
  GraduationCap,
  Layers,
  BookOpen,
  Plus,
  Trash2,
  User,
  Save,
} from "lucide-react";

interface ProjectStartTabProps {
  projectId: number;
  course: Course | null;
  objectives: Objective[];
}

const GOAL_LEVELS: {
  key: "university" | "program" | "course";
  label: string;
  hint: string;
  measurable: boolean;
  icon: typeof GraduationCap;
}[] = [
  {
    key: "university",
    label: "Institutional goals",
    hint: "Mission-level aims the institution holds across every program. Broad and aspirational, not directly measured.",
    measurable: false,
    icon: GraduationCap,
  },
  {
    key: "program",
    label: "Program goals",
    hint: "Program learning outcomes: what graduates of this program should be able to do.",
    measurable: false,
    icon: Layers,
  },
  {
    key: "course",
    label: "Course goals",
    hint: "Measurable outcomes a learner can demonstrate by the end of this course. Each one should map up to a program goal.",
    measurable: true,
    icon: BookOpen,
  },
];

// Sample observable action verbs (revised Bloom's taxonomy) to steer learners
// toward measurable course outcomes instead of vague aims like "understand."
const BLOOM_VERBS = ["define", "describe", "apply", "analyze", "evaluate", "design", "create"];

const MODALITY_OPTIONS = [
  "In person",
  "Online (asynchronous)",
  "Online (synchronous)",
  "Hybrid",
  "HyFlex",
];
const MODALITY_OTHER = "Other";

export function ProjectStartTab({
  projectId,
  course,
  objectives,
}: ProjectStartTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createObjective = useCreateObjective();
  const deleteObjective = useDeleteObjective();
  const updateCourse = useUpdateCourse();

  const [drafts, setDrafts] = useState<Record<string, string>>({
    university: "",
    program: "",
    course: "",
  });

  const invalidateObjectives = () => {
    queryClient.invalidateQueries({ queryKey: getListObjectivesQueryKey(projectId) });
    queryClient.invalidateQueries({ queryKey: getGetProjectGateStatusQueryKey(projectId) });
  };

  const addGoal = (level: "university" | "program" | "course") => {
    const text = drafts[level].trim();
    if (!text) return;
    createObjective.mutate(
      { projectId, data: { level, text } },
      {
        onSuccess: () => {
          setDrafts((d) => ({ ...d, [level]: "" }));
          invalidateObjectives();
        },
        onError: () => toast({ title: "Failed to add goal", variant: "destructive" }),
      },
    );
  };

  const removeGoal = (id: number) => {
    deleteObjective.mutate(
      { id },
      {
        onSuccess: invalidateObjectives,
        onError: () => toast({ title: "Failed to remove goal", variant: "destructive" }),
      },
    );
  };

  // Course essentials form, seeded from the loaded course.
  const [overview, setOverview] = useState("");
  const [instructorName, setInstructorName] = useState("");
  const [instructorTitle, setInstructorTitle] = useState("");
  const [instructorEmail, setInstructorEmail] = useState("");
  const [modalityChoice, setModalityChoice] = useState("");
  const [modalityOther, setModalityOther] = useState("");
  const [essentialsReady, setEssentialsReady] = useState(false);

  useEffect(() => {
    if (!course || essentialsReady) return;
    setEssentialsReady(true);
    setOverview(course.courseDescription ?? "");
    setInstructorName(course.instructorName ?? "");
    setInstructorTitle(course.instructorTitle ?? "");
    setInstructorEmail(course.instructorEmail ?? "");
    const m = course.modality ?? "";
    if (m && !MODALITY_OPTIONS.includes(m)) {
      setModalityChoice(MODALITY_OTHER);
      setModalityOther(m);
    } else {
      setModalityChoice(m);
      setModalityOther("");
    }
  }, [course, essentialsReady]);

  const saveEssentials = () => {
    if (!course) return;
    const modality =
      modalityChoice === MODALITY_OTHER ? modalityOther.trim() : modalityChoice.trim();
    updateCourse.mutate(
      {
        id: course.id,
        data: {
          courseDescription: overview.trim(),
          instructorName: instructorName.trim(),
          instructorTitle: instructorTitle.trim(),
          instructorEmail: instructorEmail.trim(),
          modality,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCoursesQueryKey(projectId) });
          toast({ title: "Course essentials saved" });
        },
        onError: () => toast({ title: "Failed to save course essentials", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-6">
      <p className="max-w-[70ch] text-sm text-muted-foreground">
        Capture the essentials that anchor the engagement: the goal hierarchy from institution down
        to the course, the first course overview and instructor, and the delivery modality.
      </p>

      {/* Goal hierarchy */}
      <Card className="border-border shadow-sm">
        <CardHeader className="border-b border-border bg-card px-5 py-4">
          <CardTitle className="text-lg">Goal hierarchy</CardTitle>
          <CardDescription className="m-0">
            Constructive alignment starts here: institutional mission, then program outcomes, then
            measurable course outcomes that ladder up to them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          {GOAL_LEVELS.map((lvl) => {
            const items = objectives.filter((o) => o.level === lvl.key);
            const Icon = lvl.icon;
            const inputId = `goal-${lvl.key}`;
            return (
              <div key={lvl.key} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-foreground">{lvl.label}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{lvl.hint}</p>
                {lvl.measurable && (
                  <p className="text-xs text-muted-foreground">
                    Start each outcome with an observable action verb (for example:{" "}
                    {BLOOM_VERBS.join(", ")}). Avoid vague verbs like understand or know.
                  </p>
                )}
                {items.length > 0 ? (
                  <ul className="space-y-2">
                    {items.map((o) => (
                      <li
                        key={o.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3"
                      >
                        <div className="min-w-0">
                          <span className="text-sm text-foreground">{o.text}</span>
                          {lvl.measurable && (
                            <div className="mt-1.5">
                              <ObjectiveQualityBadge text={o.text} />
                            </div>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeGoal(o.id)}
                          aria-label={`Remove goal: ${o.text}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No goals added yet.</p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Label htmlFor={inputId} className="sr-only">
                    Add a {lvl.label.toLowerCase()} goal
                  </Label>
                  <Input
                    id={inputId}
                    value={drafts[lvl.key]}
                    onChange={(e) => setDrafts((d) => ({ ...d, [lvl.key]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addGoal(lvl.key);
                      }
                    }}
                    placeholder={`Add a ${lvl.label.toLowerCase().replace(/ goals$/, "")} goal`}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => addGoal(lvl.key)}
                    disabled={!drafts[lvl.key].trim() || createObjective.isPending}
                  >
                    <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                    Add
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Course essentials */}
      <Card className="border-border shadow-sm">
        <CardHeader className="border-b border-border bg-card px-5 py-4">
          <CardTitle className="text-lg">Course essentials</CardTitle>
          <CardDescription className="m-0">
            Overview, instructor, and delivery modality for the first course.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          {!course ? (
            <p className="text-sm text-muted-foreground">
              Add the first course record on the Prepare tab to edit its overview, instructor, and
              modality here.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="course-overview">Course overview</Label>
                <Textarea
                  id="course-overview"
                  value={overview}
                  onChange={(e) => setOverview(e.target.value)}
                  placeholder="A short description of what this course covers and who it is for."
                  rows={4}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-foreground">Instructor</h3>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="instructor-name">Name</Label>
                    <Input
                      id="instructor-name"
                      value={instructorName}
                      onChange={(e) => setInstructorName(e.target.value)}
                      placeholder="Full name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="instructor-title">Title</Label>
                    <Input
                      id="instructor-title"
                      value={instructorTitle}
                      onChange={(e) => setInstructorTitle(e.target.value)}
                      placeholder="For example, Associate Professor"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="instructor-email">Email</Label>
                    <Input
                      id="instructor-email"
                      type="email"
                      value={instructorEmail}
                      onChange={(e) => setInstructorEmail(e.target.value)}
                      placeholder="name@institution.edu"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="course-modality">Delivery modality</Label>
                  <Select value={modalityChoice} onValueChange={setModalityChoice}>
                    <SelectTrigger id="course-modality">
                      <SelectValue placeholder="Select a modality" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODALITY_OPTIONS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                      <SelectItem value={MODALITY_OTHER}>Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {modalityChoice === MODALITY_OTHER ? (
                  <div className="space-y-2">
                    <Label htmlFor="modality-other">Describe the modality</Label>
                    <Input
                      id="modality-other"
                      value={modalityOther}
                      onChange={(e) => setModalityOther(e.target.value)}
                      placeholder="For example, weekend intensive"
                    />
                  </div>
                ) : null}
              </div>

              <div>
                <Button onClick={saveEssentials} disabled={updateCourse.isPending}>
                  <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Save course essentials
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
