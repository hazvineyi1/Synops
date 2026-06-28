import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCourses, getListCoursesQueryKey, useCreateCourse,
  useListObjectives, getListObjectivesQueryKey,
  useListActivities, getListActivitiesQueryKey,
  useListAssessments, getListAssessmentsQueryKey,
  useCreateActivity, useCreateAssessment,
  useUpdateActivity, useUpdateAssessment,
  useDeleteActivity, useDeleteAssessment,
  useUpdateProject, getGetProjectQueryKey, getListProjectsQueryKey,
  getGetProjectGateStatusQueryKey,
  type Activity, type Assessment, type Objective, type ProjectUpdateDesignMethod,
} from "@workspace/kanon-api-client";
import {
  Plus, Target, LayoutList, Map as MapIcon, Trash2, Pencil, BookOpen, Lightbulb, ArrowRight, Check, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { ProjectWorkspace } from "@/components/engine/ProjectWorkspace";
import { ObjectiveQualityBadge } from "@/components/engine/ObjectiveQualityBadge";
import { StandardsAlignmentCard } from "@/components/engine/StandardsAlignmentCard";
import {
  INSTRUCTIONAL_METHODS, getMethod,
  ACTIVITY_TYPE_OPTIONS, ASSESSMENT_TYPE_OPTIONS,
} from "@/lib/instructional-methods";

type Kind = "activity" | "assessment";

interface DialogState {
  kind: Kind;
  title: string;
  type: string;
  description: string;
  methodKey: string; // "" means none
  alignedIds: number[];
  editId?: number; // set when editing an existing item
}

function typeLabel(kind: Kind, value: string): string {
  const opts = kind === "activity" ? ACTIVITY_TYPE_OPTIONS : ASSESSMENT_TYPE_OPTIONS;
  return opts.find((o) => o.value === value)?.label ?? value;
}

export default function ProjectDesign() {
  return (
    <ProjectWorkspace stageId={1}>
      {({ project }) => (
        <DesignWorkspace
          projectId={project.id}
          projectTitle={project.title}
          designMethod={project.designMethod ?? null}
        />
      )}
    </ProjectWorkspace>
  );
}

function DesignWorkspace({
  projectId, projectTitle, designMethod,
}: {
  projectId: number;
  projectTitle: string;
  designMethod: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: courses } = useListCourses(projectId, {
    query: { enabled: !!projectId, queryKey: getListCoursesQueryKey(projectId) },
  });
  const course = courses?.[0] ?? null;
  const courseId = course?.id ?? 0;

  const { data: objectives } = useListObjectives(projectId, {
    query: { enabled: !!projectId, queryKey: getListObjectivesQueryKey(projectId) },
  });
  const courseObjectives = (objectives ?? []).filter((o) => o.level === "course" || o.level === "module");

  const { data: assessments } = useListAssessments(courseId, {
    query: { enabled: !!courseId, queryKey: getListAssessmentsQueryKey(courseId) },
  });
  const { data: activities } = useListActivities(courseId, {
    query: { enabled: !!courseId, queryKey: getListActivitiesQueryKey(courseId) },
  });

  const createActivity = useCreateActivity();
  const createAssessment = useCreateAssessment();
  const deleteActivity = useDeleteActivity();
  const deleteAssessment = useDeleteAssessment();
  const updateActivity = useUpdateActivity();
  const updateAssessment = useUpdateAssessment();
  const updateProject = useUpdateProject();

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [settingKey, setSettingKey] = useState<string | null>(null);
  const isSaving =
    createActivity.isPending || createAssessment.isPending ||
    updateActivity.isPending || updateAssessment.isPending;

  function setProjectMethod(key: string) {
    setSettingKey(key);
    updateProject.mutate(
      { id: projectId, data: { designMethod: key as ProjectUpdateDesignMethod } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast({ title: "Project method set", description: getMethod(key)?.name ?? key });
        },
        onError: () => toast({ title: "Could not set project method", variant: "destructive" }),
        onSettled: () => setSettingKey(null),
      },
    );
  }

  function openAdd(
    kind: Kind,
    prefill?: { title: string; type: string; description: string; methodKey: string },
  ) {
    setDialog({
      kind,
      title: prefill?.title ?? "",
      type: prefill?.type ?? (kind === "activity" ? "discussion" : "formative"),
      description: prefill?.description ?? "",
      methodKey: prefill?.methodKey ?? designMethod ?? "",
      alignedIds: [],
    });
  }

  function openEdit(kind: Kind, item: Activity | Assessment) {
    setDialog({
      kind,
      title: item.title,
      type: kind === "activity" ? (item as Activity).activityType : (item as Assessment).assessmentType,
      description: item.description ?? "",
      methodKey: "",
      alignedIds: item.alignedObjectiveIds ?? [],
      editId: item.id,
    });
  }

  function invalidateList(kind: Kind) {
    queryClient.invalidateQueries({
      queryKey: kind === "activity" ? getListActivitiesQueryKey(courseId) : getListAssessmentsQueryKey(courseId),
    });
  }

  function handleSubmit() {
    if (!dialog || !dialog.title.trim() || !courseId) return;
    const aligned = dialog.alignedIds;

    // Edit existing item via PATCH.
    if (dialog.editId != null) {
      const title = dialog.title.trim();
      const description = dialog.description.trim() || undefined;
      if (dialog.kind === "activity") {
        updateActivity.mutate(
          { id: dialog.editId, data: { title, activityType: dialog.type, description, alignedObjectiveIds: aligned } },
          {
            onSuccess: () => { invalidateList("activity"); toast({ title: "Activity updated", description: title }); setDialog(null); },
            onError: () => toast({ title: "Could not update activity", variant: "destructive" }),
          },
        );
      } else {
        updateAssessment.mutate(
          { id: dialog.editId, data: { title, assessmentType: dialog.type, description, alignedObjectiveIds: aligned } },
          {
            onSuccess: () => { invalidateList("assessment"); toast({ title: "Assessment updated", description: title }); setDialog(null); },
            onError: () => toast({ title: "Could not update assessment", variant: "destructive" }),
          },
        );
      }
      return;
    }

    if (dialog.kind === "activity") {
      createActivity.mutate(
        {
          courseId,
          data: {
            title: dialog.title.trim(),
            activityType: dialog.type,
            description: dialog.description.trim() || undefined,
            alignedObjectiveIds: aligned,
          },
        },
        {
          onSuccess: () => {
            invalidateList("activity");
            toast({ title: "Activity added", description: dialog.title.trim() });
            setDialog(null);
          },
          onError: () => toast({ title: "Could not add activity", variant: "destructive" }),
        },
      );
    } else {
      createAssessment.mutate(
        {
          courseId,
          data: {
            title: dialog.title.trim(),
            assessmentType: dialog.type,
            description: dialog.description.trim() || undefined,
            alignedObjectiveIds: aligned,
          },
        },
        {
          onSuccess: () => {
            invalidateList("assessment");
            toast({ title: "Assessment added", description: dialog.title.trim() });
            setDialog(null);
          },
          onError: () => toast({ title: "Could not add assessment", variant: "destructive" }),
        },
      );
    }
  }

  function handleDelete(kind: Kind, id: number) {
    if (kind === "activity") {
      deleteActivity.mutate({ id }, { onSuccess: () => invalidateList("activity") });
    } else {
      deleteAssessment.mutate({ id }, { onSuccess: () => invalidateList("assessment") });
    }
  }

  if (!course) {
    return <CourseQuickStart projectId={projectId} projectTitle={projectTitle} />;
  }

  const method = designMethod ? getMethod(designMethod) : undefined;

  return (
    <>
      <div className="mb-6">
        <DesignMethodBanner method={method} />
      </div>
      <Tabs defaultValue="assessments" className="w-full">
        <TabsList>
          <TabsTrigger value="assessments">
            <Target className="mr-2 h-4 w-4" aria-hidden="true" /> Assessments
          </TabsTrigger>
          <TabsTrigger value="activities">
            <LayoutList className="mr-2 h-4 w-4" aria-hidden="true" /> Activities
          </TabsTrigger>
          <TabsTrigger value="methods">
            <Lightbulb className="mr-2 h-4 w-4" aria-hidden="true" /> Methods
          </TabsTrigger>
          <TabsTrigger value="alignment">
            <MapIcon className="mr-2 h-4 w-4" aria-hidden="true" /> Alignment map
          </TabsTrigger>
        </TabsList>

        {/* ASSESSMENTS */}
        <TabsContent value="assessments" className="mt-6">
          <ItemList
            kind="assessment"
            title="Assessments"
            description="Determine acceptable evidence of mastery. Align every assessment to at least one objective."
            items={(assessments ?? []) as Assessment[]}
            objectives={courseObjectives}
            getType={(a) => (a as Assessment).assessmentType}
            onAdd={() => openAdd("assessment")}
            onEdit={(item) => openEdit("assessment", item)}
            onDelete={(id) => handleDelete("assessment", id)}
            emptyText="No assessments defined yet. Define how students will prove mastery, or start from a method in the Methods tab."
          />
        </TabsContent>

        {/* ACTIVITIES */}
        <TabsContent value="activities" className="mt-6">
          <ItemList
            kind="activity"
            title="Learning activities"
            description="Plan experiences that lead to mastery."
            items={(activities ?? []) as Activity[]}
            objectives={courseObjectives}
            getType={(a) => (a as Activity).activityType}
            onAdd={() => openAdd("activity")}
            onEdit={(item) => openEdit("activity", item)}
            onDelete={(id) => handleDelete("activity", id)}
            emptyText="No activities defined yet. Add one, or start from an instructional design method in the Methods tab."
          />
        </TabsContent>

        {/* METHODS LIBRARY */}
        <TabsContent value="methods" className="mt-6">
          <MethodLibrary
            onUse={openAdd}
            selectedKey={designMethod}
            onSetProjectMethod={setProjectMethod}
            settingKey={settingKey}
          />
        </TabsContent>

        {/* ALIGNMENT */}
        <TabsContent value="alignment" className="mt-6 space-y-6">
          <AlignmentMap
            objectives={courseObjectives}
            assessments={(assessments ?? []) as Assessment[]}
            activities={(activities ?? []) as Activity[]}
          />
          <StandardsAlignmentCard projectId={projectId} objectives={courseObjectives} />
        </TabsContent>
      </Tabs>

      {/* ADD DIALOG */}
      <Dialog open={dialog != null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {dialog && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.editId != null ? "Edit" : "Add"} {dialog.kind === "activity" ? "activity" : "assessment"}</DialogTitle>
                <DialogDescription>
                  Pick an instructional design method to start from a template, or build it from scratch.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="method">Instructional design method</Label>
                  <Select
                    value={dialog.methodKey || "none"}
                    onValueChange={(v) => setDialog({ ...dialog, methodKey: v === "none" ? "" : v })}
                  >
                    <SelectTrigger id="method">
                      <SelectValue placeholder="None (build from scratch)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (build from scratch)</SelectItem>
                      {INSTRUCTIONAL_METHODS.map((m) => (
                        <SelectItem key={m.key} value={m.key}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {dialog.methodKey && (
                  <MethodTemplatePicker
                    kind={dialog.kind}
                    methodKey={dialog.methodKey}
                    onPick={(t) => setDialog({ ...dialog, title: t.title, type: t.type, description: t.description })}
                  />
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={dialog.title}
                    onChange={(e) => setDialog({ ...dialog, title: e.target.value })}
                    placeholder={dialog.kind === "activity" ? "e.g. Worked-example demonstration" : "e.g. End-of-module mastery check"}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="type">Type</Label>
                  <Select value={dialog.type} onValueChange={(v) => setDialog({ ...dialog, type: v })}>
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dialog.kind === "assessment" ? (
                        <>
                          <SelectGroup>
                            <SelectLabel>Purpose</SelectLabel>
                            {ASSESSMENT_TYPE_OPTIONS.filter(
                              (o) => o.value === "formative" || o.value === "summative",
                            ).map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel>Format</SelectLabel>
                            {ASSESSMENT_TYPE_OPTIONS.filter(
                              (o) => o.value !== "formative" && o.value !== "summative",
                            ).map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectGroup>
                        </>
                      ) : (
                        ACTIVITY_TYPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {dialog.kind === "assessment" && (
                    <p className="text-xs text-muted-foreground">
                      Formative checks guide learning while it is in progress; summative tasks judge
                      mastery at the end. Quiz, assignment, project, exam, and discussion name the
                      format you will use.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={dialog.description}
                    onChange={(e) => setDialog({ ...dialog, description: e.target.value })}
                    className="min-h-[80px]"
                    placeholder="What learners do and why it matters."
                  />
                </div>

                {courseObjectives.length > 0 && (
                  <div className="space-y-2">
                    <Label>Aligned objectives</Label>
                    <div className="space-y-2 rounded-lg border p-3">
                      {courseObjectives.map((obj, i) => {
                        const checked = dialog.alignedIds.includes(obj.id);
                        return (
                          <div key={obj.id} className="flex items-start gap-2">
                            <Checkbox
                              id={`align-${obj.id}`}
                              checked={checked}
                              onCheckedChange={(c) =>
                                setDialog({
                                  ...dialog,
                                  alignedIds: c
                                    ? [...dialog.alignedIds, obj.id]
                                    : dialog.alignedIds.filter((id) => id !== obj.id),
                                })
                              }
                              className="mt-0.5"
                            />
                            <label htmlFor={`align-${obj.id}`} className="cursor-pointer text-sm leading-snug">
                              <span className="mr-1.5 rounded bg-muted px-1 py-0.5 font-mono text-xs text-muted-foreground">
                                LO{i + 1}
                              </span>
                              {obj.text}
                              <span className="ml-2 inline-block align-middle">
                                <ObjectiveQualityBadge text={obj.text} />
                              </span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={!dialog.title.trim() || isSaving}>
                  {isSaving ? (
                    <><Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> Saving</>
                  ) : dialog.editId != null ? (
                    <>Save changes</>
                  ) : (
                    <>Add {dialog.kind === "activity" ? "activity" : "assessment"}</>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CourseQuickStart({
  projectId, projectTitle,
}: {
  projectId: number;
  projectTitle: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const createCourse = useCreateCourse();
  const [title, setTitle] = useState(projectTitle);

  function handleCreate() {
    const name = title.trim() || projectTitle || "Untitled course";
    createCourse.mutate(
      { projectId, data: { title: name, creditHours: 3, termWeeks: 15, moduleCount: 1 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCoursesQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetProjectGateStatusQueryKey(projectId) });
          toast({ title: "Course record created", description: name });
        },
        onError: (error) => {
          if (error?.status === 402) {
            const body = error.data as { message?: string } | null;
            toast({
              title: "Course limit reached",
              description:
                body?.message ??
                "You have reached your active course limit. Contact us to add more.",
              variant: "destructive",
              action: (
                <ToastAction altText="Contact us" onClick={() => navigate("~/contact")}>
                  Contact us
                </ToastAction>
              ),
            });
            return;
          }
          toast({ title: "Could not create the course record", variant: "destructive" });
        },
      },
    );
  }

  return (
    <Card>
      <CardContent className="py-10">
        <div className="mx-auto max-w-md text-center">
          <BookOpen className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-lg font-semibold">Start the course record</h3>
          <p className="mx-auto mt-2 text-sm text-muted-foreground">
            Design works backward from the course outcomes. Name the course to begin building its
            assessments and activities. Credits, term length, and module count use sensible defaults
            you can refine in Intake anytime.
          </p>
          <div className="mt-5 space-y-3 text-left">
            <div className="space-y-1.5">
              <Label htmlFor="course-title">Course title</Label>
              <Input
                id="course-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Foundations of Anatomy"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && title.trim() && !createCourse.isPending) handleCreate();
                }}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleCreate}
              disabled={!title.trim() || createCourse.isPending}
            >
              {createCourse.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Creating</>
              ) : (
                <>Create course record and start designing</>
              )}
            </Button>
            <div className="text-center">
              <Button variant="link" asChild className="h-auto p-0 text-sm font-normal">
                <Link href={`/projects/${projectId}/intake`}>Open full setup in Intake instead</Link>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DesignMethodBanner({ method }: { method: ReturnType<typeof getMethod> }) {
  if (!method) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <div className="font-semibold">No design approach chosen yet</div>
            <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
              Choose an instructional design method in the Intake stage to guide this build, or set one
              from the Methods tab below. Until then, add items from scratch or pick a method per item.
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.04] p-4">
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">This build follows {method.name}</span>
            <Badge variant="outline" className="text-xs font-normal">{method.origin}</Badge>
          </div>
          <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
            {method.summary} New activities and assessments start from this method; change it from the
            Methods tab.
          </p>
          <ol className="mt-3 flex flex-wrap gap-1.5">
            {method.phases.map((p, i) => (
              <li
                key={i}
                className="flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs"
              >
                <span className="font-mono text-muted-foreground">{i + 1}</span>
                <span className="font-medium">{p.name}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function MethodTemplatePicker({
  kind, methodKey, onPick,
}: {
  kind: Kind;
  methodKey: string;
  onPick: (t: { title: string; type: string; description: string }) => void;
}) {
  const method = getMethod(methodKey);
  if (!method) return null;
  const templates = kind === "activity"
    ? method.activityTemplates.map((t) => ({ title: t.title, type: t.activityType, description: t.description }))
    : method.assessmentTemplates.map((t) => ({ title: t.title, type: t.assessmentType, description: t.description }));

  if (templates.length === 0) {
    return (
      <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        {method.name} has no {kind} templates. Use the fields below to build your own.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/[0.03] p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {method.name} templates
      </div>
      <div className="space-y-2">
        {templates.map((t, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(t)}
            className="flex w-full items-start gap-2 rounded-md border bg-card p-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <span className="block text-sm font-medium">{t.title}</span>
              <span className="block text-xs text-muted-foreground">{typeLabel(kind, t.type)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ItemList({
  kind, title, description, items, objectives, getType, onAdd, onEdit, onDelete, emptyText,
}: {
  kind: Kind;
  title: string;
  description: string;
  items: (Activity | Assessment)[];
  objectives: Objective[];
  getType: (item: Activity | Assessment) => string;
  onAdd: () => void;
  onEdit: (item: Activity | Assessment) => void;
  onDelete: (id: number) => void;
  emptyText: string;
}) {
  const objIndex = new Map(objectives.map((o, i) => [o.id, i + 1] as [number, number]));
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add {kind}
        </Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed py-12 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const aligned = item.alignedObjectiveIds ?? [];
              return (
                <li key={item.id} className="rounded-lg border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{item.title}</span>
                        <Badge variant="secondary" className="text-xs">{typeLabel(kind, getType(item))}</Badge>
                        <Badge variant="outline" className="text-xs capitalize">{item.status}</Badge>
                      </div>
                      {item.description && (
                        <p className="mt-1.5 text-sm text-muted-foreground">{item.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {aligned.length === 0 ? (
                          <span className="text-xs italic text-amber-700">Not aligned to any objective</span>
                        ) : (
                          aligned.map((id) => (
                            <span key={id} className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                              LO{objIndex.get(id) ?? "?"}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => onEdit(item)}
                        className="text-muted-foreground/50 transition-colors hover:text-primary"
                        aria-label={`Edit ${item.title}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => onDelete(item.id)}
                        className="text-muted-foreground/50 transition-colors hover:text-red-600"
                        aria-label={`Remove ${item.title}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function MethodLibrary({
  onUse, selectedKey, onSetProjectMethod, settingKey,
}: {
  onUse: (kind: Kind, prefill: { title: string; type: string; description: string; methodKey: string }) => void;
  selectedKey: string | null;
  onSetProjectMethod: (key: string) => void;
  settingKey: string | null;
}) {
  return (
    <div className="space-y-4">
      <p className="max-w-[70ch] text-sm text-muted-foreground">
        A library of instructional design methods. Browse the approach, then send any template straight into
        an assessment or activity. The same picker is available inside the Add dialogs.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {INSTRUCTIONAL_METHODS.map((m) => (
          <Card key={m.key} className="flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{m.name}</CardTitle>
                <div className="flex shrink-0 items-center gap-1.5">
                  {m.key === selectedKey && <Badge className="text-xs">Project method</Badge>}
                  <Badge variant="outline" className="text-xs font-normal">{m.origin}</Badge>
                </div>
              </div>
              <CardDescription>{m.tagline}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <p className="text-sm text-muted-foreground">{m.summary}</p>

              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phases</div>
                <ol className="space-y-1.5">
                  {m.phases.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                      <span>
                        <span className="font-medium">{p.name}.</span>{" "}
                        <span className="text-muted-foreground">{p.blurb}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-auto space-y-2 border-t pt-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" /> Best for
                </div>
                <p className="text-sm text-muted-foreground">{m.bestFor}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {m.assessmentTemplates.slice(0, 1).map((t, i) => (
                    <Button
                      key={`a${i}`}
                      size="sm"
                      variant="outline"
                      onClick={() => onUse("assessment", { title: t.title, type: t.assessmentType, description: t.description, methodKey: m.key })}
                    >
                      <Target className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Use as assessment
                    </Button>
                  ))}
                  {m.activityTemplates.slice(0, 1).map((t, i) => (
                    <Button
                      key={`act${i}`}
                      size="sm"
                      variant="outline"
                      onClick={() => onUse("activity", { title: t.title, type: t.activityType, description: t.description, methodKey: m.key })}
                    >
                      <LayoutList className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Use as activity
                    </Button>
                  ))}
                </div>
                <div className="pt-1">
                  {m.key === selectedKey ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" /> Current project method
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-auto px-2 py-1 text-xs"
                      onClick={() => onSetProjectMethod(m.key)}
                      disabled={settingKey === m.key}
                    >
                      {settingKey === m.key ? (
                        <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Setting</>
                      ) : (
                        <>Set as project method</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AlignmentMap({
  objectives, assessments, activities,
}: {
  objectives: Objective[];
  assessments: Assessment[];
  activities: Activity[];
}) {
  if (objectives.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-[260px] items-center justify-center p-8">
          <div className="max-w-md text-center">
            <MapIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-lg font-semibold">No objectives yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Add course outcomes in the Intake stage, then align assessments and activities to them here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const unalignedAssessments = assessments.filter((a) => (a.alignedObjectiveIds ?? []).length === 0);
  const unalignedActivities = activities.filter((a) => (a.alignedObjectiveIds ?? []).length === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Constructive alignment map</CardTitle>
        <CardDescription>
          Every objective should be served by at least one assessment and one activity.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Objective</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Assessments</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Activities</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {objectives.map((obj, i) => {
                const aa = assessments.filter((it) => (it.alignedObjectiveIds ?? []).includes(obj.id));
                const ac = activities.filter((it) => (it.alignedObjectiveIds ?? []).includes(obj.id));
                return (
                  <tr key={obj.id} className="align-top hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <span className="mr-1.5 rounded bg-muted px-1 py-0.5 font-mono text-xs text-muted-foreground">LO{i + 1}</span>
                      <span className="text-sm">{obj.text}</span>
                      <div className="mt-1.5">
                        <ObjectiveQualityBadge text={obj.text} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {aa.length === 0 ? (
                        <span className="text-xs italic text-amber-700">Gap: none</span>
                      ) : (
                        <ul className="space-y-1">
                          {aa.map((a) => <li key={a.id} className="text-sm">{a.title}</li>)}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {ac.length === 0 ? (
                        <span className="text-xs italic text-amber-700">Gap: none</span>
                      ) : (
                        <ul className="space-y-1">
                          {ac.map((a) => <li key={a.id} className="text-sm">{a.title}</li>)}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(unalignedAssessments.length > 0 || unalignedActivities.length > 0) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold">Unaligned items</div>
            <p className="mt-1 text-amber-800">
              These are not linked to any objective. Open each one and align it, or remove it.
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-amber-800">
              {unalignedAssessments.map((a) => <li key={`as${a.id}`}>{a.title} (assessment)</li>)}
              {unalignedActivities.map((a) => <li key={`ac${a.id}`}>{a.title} (activity)</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
