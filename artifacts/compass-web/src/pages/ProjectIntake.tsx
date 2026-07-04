import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, Link } from "wouter";
import {
  useGetProject, getGetProjectQueryKey,
  useGetProjectGateStatus, getGetProjectGateStatusQueryKey,
  useAdvanceProjectStage,
  useListCourses, getListCoursesQueryKey, useCreateCourse, useUpdateCourse,
  useListObjectives, getListObjectivesQueryKey, useCreateObjective, useDeleteObjective,
  useGetIntakeProgress, getGetIntakeProgressQueryKey, useUpdateIntakeProgress,
  useCreateLedgerEntry,
} from "@workspace/compass-api-client";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Check, ChevronDown, Square,
  UploadCloud,
  AlertTriangle, Building2,
  CheckCircle2, Trash2, ArrowRight, Loader2, Target,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { ProjectWorkspace } from "@/components/engine/ProjectWorkspace";
import { DeliveryTimeline } from "@/components/engine/DeliveryTimeline";
import { DesignApproachCard } from "@/components/engine/DesignApproachCard";
import { ProjectStartTab } from "@/components/engine/ProjectStartTab";
import { IntakeMeetTab } from "@/components/engine/IntakeMeetTab";

// Data Definitions
const INVENTORY = [
  { id: 1, asset: "Lecture-deck.pptx (58 slides)", decision: "Rebuild", rights: "Own", a11y: "low-contrast + alt text", a11yWarn: true },
  { id: 2, asset: "4 lecture recordings (~72 min)", decision: "Reuse", rights: "Own", a11y: "needs captions + transcript", a11yWarn: true },
  { id: 3, asset: "Syllabus_F23.pdf (prior)", decision: "Refresh", rights: "Own", a11y: "untagged structure", a11yWarn: true },
  { id: 4, asset: "Alberts textbook (5th ed.)", decision: "Reuse", rights: "Licensed", a11y: "compliant", a11yWarn: false },
  { id: 5, asset: "6 article PDFs (reading list)", decision: "Reuse", rights: "Permissions", a11y: "2 untagged", a11yWarn: true },
  { id: 6, asset: "Prior Canvas build (F23)", decision: "Refresh", rights: "Own", a11y: "mixed", a11yWarn: true },
  { id: 7, asset: "12 diagrams/images (figures)", decision: "Refresh", rights: "Own", a11y: "alt text needed", a11yWarn: true },
];

const A11Y_CRITERIA = [
  { id: "1.1.1", level: "A", name: "Non-text content", status: "pass" },
  { id: "1.2.1", level: "A", name: "Audio-only & transcripts", status: "warn" },
  { id: "1.2.2", level: "A", name: "Captions (prerecorded)", status: "warn" },
  { id: "1.3.1", level: "A", name: "Info & relationships", status: "warn" },
  { id: "1.4.3", level: "AA", name: "Contrast", status: "warn" },
  { id: "2.1.1", level: "A", name: "Keyboard accessible", status: "pass" },
  { id: "2.4.6", level: "AA", name: "Headings & labels", status: "pass" },
  { id: "3.1.5", level: "AAA", name: "Reading level", status: "monitor" },
  { id: "4.1.2", level: "A", name: "Name, role, value", status: "pass" },
];

export default function ProjectIntake() {
  const params = useParams();
  const projectId = parseInt(params.id || "0", 10);

  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: project } = useGetProject(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) }
  });

  const { data: gateStatus } = useGetProjectGateStatus(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectGateStatusQueryKey(projectId) }
  });

  const { data: courses } = useListCourses(projectId, {
    query: { enabled: !!projectId, queryKey: getListCoursesQueryKey(projectId) }
  });

  const { data: objectives } = useListObjectives(projectId, {
    query: { enabled: !!projectId, queryKey: getListObjectivesQueryKey(projectId) }
  });

  const { data: intakeProgress } = useGetIntakeProgress(projectId, {
    query: { enabled: !!projectId, queryKey: getGetIntakeProgressQueryKey(projectId) }
  });

  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const createObjective = useCreateObjective();
  const deleteObjective = useDeleteObjective();
  const updateIntake = useUpdateIntakeProgress();
  const createLedger = useCreateLedgerEntry();
  const advanceStage = useAdvanceProjectStage();

  const course = courses?.[0] ?? null;
  const courseObjectives = (objectives ?? []).filter((o) => o.level === "course");

  const logLedger = (entryType: string, content: string) => {
    createLedger.mutate(
      { projectId, data: { entryType, content, authorName: "Intake" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/projects", projectId, "ledger"] });
        },
      }
    );
  };

  // State
  const [filterCat, setFilterCat] = useState('all');
  const [inventorySelections, setInventorySelections] = useState<Record<number, string>>(
    INVENTORY.reduce((acc, item) => ({ ...acc, [item.id]: item.decision }), {})
  );
  const [tab, setTab] = useState("meet");

  // Course record form
  const [courseForm, setCourseForm] = useState({ title: "", creditHours: "", termWeeks: "", moduleCount: "" });
  const [courseFormReady, setCourseFormReady] = useState(false);
  const [newObjective, setNewObjective] = useState("");

  // Persistence
  const hydratedRef = useRef(false);
  const lastSavedRef = useRef<string>("");

  // Reset hydration state when navigating between projects (component may be reused)
  const prevProjectIdRef = useRef(projectId);
  useEffect(() => {
    if (prevProjectIdRef.current !== projectId) {
      prevProjectIdRef.current = projectId;
      hydratedRef.current = false;
      lastSavedRef.current = "";
      setCourseFormReady(false);
    }
  }, [projectId]);

  // Hydrate course form once the course record loads
  useEffect(() => {
    if (course && !courseFormReady) {
      setCourseForm({
        title: course.title ?? "",
        creditHours: course.creditHours != null ? String(course.creditHours) : "",
        termWeeks: course.termWeeks != null ? String(course.termWeeks) : "",
        moduleCount: course.moduleCount != null ? String(course.moduleCount) : "",
      });
      setCourseFormReady(true);
    }
  }, [course, courseFormReady]);

  // Hydrate intake progress once
  useEffect(() => {
    if (!intakeProgress || hydratedRef.current) return;
    hydratedRef.current = true;

    if (intakeProgress.inventorySelections && typeof intakeProgress.inventorySelections === "object") {
      const parsedInv: Record<number, string> = {};
      for (const [k, v] of Object.entries(intakeProgress.inventorySelections)) parsedInv[Number(k)] = v;
      if (Object.keys(parsedInv).length > 0) setInventorySelections(parsedInv);
    }

    // Seed last-saved so the first autosave doesn't redundantly re-write loaded state
    lastSavedRef.current = JSON.stringify({
      inventorySelections: intakeProgress.inventorySelections,
    });
  }, [intakeProgress]);

  // Debounced autosave of intake progress
  useEffect(() => {
    if (!hydratedRef.current || !projectId) return;

    const invPayload: Record<string, string> = {};
    for (const [k, v] of Object.entries(inventorySelections)) invPayload[String(k)] = v;

    const snapshot = JSON.stringify({ inventorySelections: invPayload });
    if (snapshot === lastSavedRef.current) return;
    // Avoid overlapping in-flight saves; this effect re-runs when isPending settles.
    if (updateIntake.isPending) return;

    const handle = setTimeout(() => {
      updateIntake.mutate(
        {
          projectId,
          data: { inventorySelections: invPayload },
        },
        {
          // Only mark as saved once the server confirms; on failure we leave
          // lastSavedRef stale so the next change (or settle) retries.
          onSuccess: () => {
            lastSavedRef.current = snapshot;
          },
          onError: () => {
            toast({ title: "Couldn't save intake progress", description: "Your changes will retry automatically.", variant: "destructive" });
          },
        }
      );
    }, 800);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventorySelections, projectId, updateIntake.isPending]);

  const toNum = (v: string) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  };

  const handleSaveCourse = () => {
    const title = courseForm.title.trim() || project?.title || "Untitled course";
    const data = {
      title,
      creditHours: toNum(courseForm.creditHours),
      termWeeks: toNum(courseForm.termWeeks),
      moduleCount: toNum(courseForm.moduleCount),
    };
    if (course) {
      updateCourse.mutate(
        { id: course.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListCoursesQueryKey(projectId) });
            queryClient.invalidateQueries({ queryKey: getGetProjectGateStatusQueryKey(projectId) });
            toast({ title: "Course record updated" });
          },
          onError: () => toast({ title: "Failed to update course", variant: "destructive" }),
        }
      );
    } else {
      createCourse.mutate(
        { projectId, data },
        {
          onSuccess: () => {
            setCourseFormReady(true);
            queryClient.invalidateQueries({ queryKey: getListCoursesQueryKey(projectId) });
            queryClient.invalidateQueries({ queryKey: getGetProjectGateStatusQueryKey(projectId) });
            toast({ title: "Course record initialized" });
            logLedger("design_decision", `Course record initialized: ${title}`);
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
                  <ToastAction
                    altText="Contact us"
                    onClick={() => navigate("~/contact")}
                  >
                    Contact us
                  </ToastAction>
                ),
              });
              return;
            }
            toast({ title: "Failed to create course", variant: "destructive" });
          },
        }
      );
    }
  };

  const handleAddObjective = () => {
    const text = newObjective.trim();
    if (!text) return;
    createObjective.mutate(
      { projectId, data: { level: "course", text } },
      {
        onSuccess: () => {
          setNewObjective("");
          queryClient.invalidateQueries({ queryKey: getListObjectivesQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetProjectGateStatusQueryKey(projectId) });
          logLedger("design_decision", `Course outcome added: ${text}`);
        },
        onError: () => toast({ title: "Failed to add outcome", variant: "destructive" }),
      }
    );
  };

  const handleDeleteObjective = (id: number) => {
    deleteObjective.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListObjectivesQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetProjectGateStatusQueryKey(projectId) });
        },
        onError: () => toast({ title: "Failed to remove outcome", variant: "destructive" }),
      }
    );
  };

  const handleAdvance = () => {
    advanceStage.mutate(
      { id: projectId, data: { notes: "Intake completed" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetProjectGateStatusQueryKey(projectId) });
          logLedger("approval", "Intake stage completed, advanced to Backward Design");
          toast({ title: "Advanced to Backward Design" });
        },
        onError: () => {
          // Server enforces the gate too; refresh so the panel reflects reality.
          queryClient.invalidateQueries({ queryKey: getGetProjectGateStatusQueryKey(projectId) });
          toast({ title: "Cannot advance yet", description: "Resolve the gate requirements first.", variant: "destructive" });
        },
      }
    );
  };

  if (!project || intakeProgress === undefined) return <div className="p-8 font-sans">Loading...</div>;

  const stage0Requirements = gateStatus?.stage === 0 ? gateStatus.requirements : [];
  const canAdvance = gateStatus?.stage === 0 && gateStatus.canAdvance;

  return (
    <ProjectWorkspace
      stageId={0}
      subtitle="Course goals, source materials, and accessibility audit."
      meta={() => (
        <>
          <span className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4" aria-hidden="true" />
            {project.clientName || "Unknown client"}
          </span>
        </>
      )}
    >
      {() => (
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto sm:grid sm:w-auto sm:grid-cols-5">
            <TabsTrigger value="start" className="shrink-0">Start</TabsTrigger>
            <TabsTrigger value="meet" className="shrink-0">Meet</TabsTrigger>
            <TabsTrigger value="prepare" className="shrink-0">Prepare</TabsTrigger>
            <TabsTrigger value="wrap" className="shrink-0">Wrap</TabsTrigger>
            <TabsTrigger value="accessibility" className="shrink-0">Accessibility</TabsTrigger>
          </TabsList>

          {/* START: project-start essentials */}
          <TabsContent value="start" className="space-y-4">
            <ProjectStartTab
              projectId={projectId}
              course={course}
              objectives={objectives ?? []}
            />
          </TabsContent>

          {/* MEET: kickoff agenda */}
          <TabsContent value="meet">
            <IntakeMeetTab
              projectId={projectId}
              intakeProgress={intakeProgress}
            />
          </TabsContent>

          {/* PREPARE: gather and audit materials */}
          <TabsContent value="prepare" className="space-y-4">
            <DeliveryTimeline />

            <p className="max-w-[70ch] text-sm text-muted-foreground">
              Set the design approach, then gather the source materials and audit what already exists.
            </p>

            <DesignApproachCard projectId={projectId} selectedKey={project.designMethod ?? null} />

            <Card className="border-border shadow-sm">
              <CardHeader className="border-b border-border bg-card px-5 py-4">
                <CardTitle className="text-lg">Materials</CardTitle>
                <CardDescription className="m-0">
                  Source documents and media, type-detected and accessibility-flagged on arrival.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-5 border-b border-border p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileText className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Source documents</h3>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          Parse these to pre-fill the course details.
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className="shrink-0 border-primary/20 bg-primary/10 text-primary shadow-none hover:bg-primary/10"
                    >
                      2 detected
                    </Badge>
                  </div>

                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                    <li className="flex items-center gap-3 p-3">
                      <Badge variant="destructive" className="shrink-0 rounded px-1.5 text-[10px]">PDF</Badge>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">BIOL3050_Syllabus_F23.pdf</div>
                        <div className="truncate text-xs text-muted-foreground">Outcomes · 15-week schedule</div>
                      </div>
                      <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-green-600 sm:flex">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Ready
                      </span>
                    </li>
                    <li className="flex items-center gap-3 p-3">
                      <Badge className="shrink-0 rounded border-none bg-blue-500 px-1.5 text-[10px] hover:bg-blue-600">DOC</Badge>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">Course_Outline_v2.docx</div>
                        <div className="truncate text-xs text-muted-foreground">Topic sequence and weekly breakdown</div>
                      </div>
                      <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-green-600 sm:flex">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Ready
                      </span>
                    </li>
                  </ul>

                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <UploadCloud className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">Upload syllabus or outline</span>
                      <span className="block text-xs text-muted-foreground">Drop or browse: PDF, Word, text</span>
                    </span>
                  </button>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
                    <Button className="font-semibold shadow-sm">Parse and pre-fill</Button>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Parsed successfully
                    </span>
                  </div>
                </div>

                <Collapsible className="bg-muted/10">
                  <CollapsibleTrigger className="group flex w-full items-center justify-between gap-4 p-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <div>
                      <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                        All media and assets
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {INVENTORY.length} assets, {INVENTORY.filter((i) => i.a11yWarn).length} need accessibility remediation. Reuse, refresh, or rebuild.
                      </div>
                    </div>
                    <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-6 pb-6">
                  <div className="mb-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card p-6 text-center transition-colors hover:bg-muted/30">
                    <div className="text-sm font-semibold text-foreground">Upload media assets</div>
                    <div className="mt-1 text-xs text-muted-foreground">Drop or browse: PPT, MP4, images</div>
                  </div>

                  <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
                    {["All", "Slides", "Video", "PDF", "Doc", "Image"].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setFilterCat(cat.toLowerCase())}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          filterCat === cat.toLowerCase()
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-card text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="max-h-80 overflow-auto rounded-xl border bg-card">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 z-10 border-b border-border bg-muted">
                        <tr>
                          <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Asset</th>
                          <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Decision</th>
                          <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rights</th>
                          <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Accessibility</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {INVENTORY.map((item) => (
                          <tr key={item.id} className="hover:bg-muted/20">
                            <td className="px-3 py-2 font-medium text-foreground">{item.asset}</td>
                            <td className="px-3 py-2">
                              <div className="inline-flex rounded-md shadow-sm">
                                {["Reuse", "Refresh", "Rebuild"].map((opt) => (
                                  <button
                                    key={opt}
                                    onClick={() => setInventorySelections((prev) => ({ ...prev, [item.id]: opt }))}
                                    className={`border-y border-l px-2.5 py-1 text-xs font-medium transition-colors first:rounded-l-md first:border-l last:rounded-r-md last:border-r ${
                                      inventorySelections[item.id] === opt
                                        ? "relative z-10 border-primary bg-primary text-primary-foreground"
                                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{item.rights}</td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={`text-xs font-normal ${
                                  item.a11yWarn
                                    ? "border-purple-200 bg-purple-50 text-purple-800"
                                    : "border-green-200 bg-green-50 text-green-800"
                                }`}
                              >
                                {item.a11yWarn ? (
                                  <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                                ) : (
                                  <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                                )}
                                {item.a11y}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>

            {/* Progressive disclosure: design foundations */}
            <Collapsible>
              <Card className="border-border bg-muted/10 shadow-sm">
                <CollapsibleTrigger className="group flex w-full items-center justify-between px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div>
                    <div className="text-base font-semibold">Design foundations</div>
                    <div className="text-sm text-muted-foreground">What the build rests on</div>
                  </div>
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="border-t border-border p-6">
                    <ul className="space-y-3 text-sm text-muted-foreground">
                      <li><strong className="font-semibold text-foreground">Adult learning:</strong> Andragogy (Knowles) · Experiential learning (Kolb)</li>
                      <li><strong className="font-semibold text-foreground">Design process:</strong> Backward Design (UbD) · ADDIE / SAM</li>
                      <li><strong className="font-semibold text-foreground">Outcomes:</strong> Bloom's taxonomy · Constructive alignment (Biggs)</li>
                      <li><strong className="font-semibold text-foreground">Cognition:</strong> Cognitive Load (Sweller) · Multimedia learning (Mayer) · Retrieval and spaced practice</li>
                      <li><strong className="font-semibold text-foreground">Instruction:</strong> Gagne's Nine Events · Merrill's First Principles</li>
                      <li><strong className="font-semibold text-foreground">Access:</strong> Universal Design for Learning (CAST)</li>
                    </ul>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </TabsContent>

          {/* WRAP: commit outcomes and advance */}
          <TabsContent value="wrap" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="border-border shadow-sm">
                <CardHeader className="flex flex-row items-center gap-2 border-b border-border bg-card px-5 py-4">
                  <Target className="h-5 w-5 text-primary" aria-hidden="true" />
                  <div>
                    <CardTitle className="text-lg">Course outcomes</CardTitle>
                    <CardDescription className="m-0">Measurable learning objectives carried into Backward Design</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="mb-4 flex gap-2">
                    <Input
                      value={newObjective}
                      placeholder="e.g. Explain how cellular respiration produces ATP"
                      onChange={(e) => setNewObjective(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddObjective();
                      }}
                      className="h-10"
                    />
                    <Button onClick={handleAddObjective} disabled={!newObjective.trim() || createObjective.isPending} className="shrink-0 shadow-sm">
                      <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Add
                    </Button>
                  </div>

                  {courseObjectives.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm italic text-muted-foreground">
                      No course outcomes yet. Add at least one to pass the alignment gate.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {courseObjectives.map((obj, i) => (
                        <li key={obj.id} className="group flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                          <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">LO{i + 1}</span>
                          <span className="flex-1 text-sm leading-snug">{obj.text}</span>
                          <button onClick={() => handleDeleteObjective(obj.id)} className="shrink-0 text-muted-foreground/40 transition-colors hover:text-red-600" aria-label="Remove outcome">
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader className="border-b border-border bg-card px-5 py-4">
                  <CardTitle className="text-lg">Gate readiness</CardTitle>
                  <CardDescription className="m-0">Requirements to advance to Backward Design</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-6">
                  <div className="space-y-3">
                    {stage0Requirements.length === 0 ? (
                      <div className="text-sm italic text-muted-foreground">
                        {gateStatus && gateStatus.stage > 0
                          ? "This project has already advanced past Intake."
                          : "Loading gate status..."}
                      </div>
                    ) : (
                      stage0Requirements.map((r, i) => (
                        <div key={i} className="flex items-start gap-3 text-sm">
                          <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${r.met ? "bg-green-500 text-white" : "border border-border bg-muted text-muted-foreground"}`}>
                            {r.met ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Square className="h-3 w-3" aria-hidden="true" />}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{r.label}</div>
                            {!r.met && r.detail && <div className="mt-0.5 text-xs text-amber-700">{r.detail}</div>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {gateStatus && gateStatus.stage === 0 && (
                    <Button className="w-full font-semibold shadow-sm" onClick={handleAdvance} disabled={!canAdvance || advanceStage.isPending}>
                      {advanceStage.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                      Advance to Backward Design
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}

                  {gateStatus && gateStatus.stage > 0 && (
                    <Button asChild variant="outline" className="w-full font-semibold">
                      <Link href={`/projects/${projectId}/design`}>
                        Go to Backward Design
                        <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between border-b border-border bg-card px-5 py-4">
                <CardTitle className="text-lg">Course structure and pacing</CardTitle>
                {course ? (
                  <Badge variant="outline" className="border-green-200 bg-green-50 text-[10px] text-green-700">Saved</Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">Not initialized</Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Course title</label>
                  <Input value={courseForm.title} placeholder={project.title} onChange={(e) => setCourseForm((p) => ({ ...p, title: e.target.value }))} className="mt-1 h-9" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { key: "creditHours", label: "Credits" },
                    { key: "termWeeks", label: "Weeks" },
                    { key: "moduleCount", label: "Modules" },
                  ] as const).map((f) => (
                    <div key={f.key} className="rounded-lg border border-border bg-card p-3 text-center shadow-sm">
                      <Input
                        type="number"
                        min={0}
                        value={courseForm[f.key]}
                        onChange={(e) => setCourseForm((p) => ({ ...p, [f.key]: e.target.value }))}
                        className="h-9 border-0 px-0 text-center text-lg font-bold shadow-none focus-visible:ring-1"
                        placeholder="-"
                      />
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{f.label}</div>
                    </div>
                  ))}
                </div>

                {toNum(courseForm.termWeeks) ? (
                  <div className="grid grid-cols-5 gap-2">
                    {Array.from({ length: Math.min(toNum(courseForm.termWeeks) || 0, 30) }).map((_, i) => {
                      const wk = i + 1;
                      return (
                        <div key={i} className="flex flex-col items-center justify-center rounded-md border border-border bg-card p-2 text-xs shadow-sm">
                          <div className="text-[10px] font-semibold uppercase tracking-wider opacity-60">Wk {wk}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <Button className="w-full font-semibold shadow-sm" onClick={handleSaveCourse} disabled={createCourse.isPending || updateCourse.isPending}>
                  {(createCourse.isPending || updateCourse.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  {course ? "Save course record" : "Initialize course record"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ACCESSIBILITY: continuous audit */}
          <TabsContent value="accessibility" className="space-y-6">
            <Card className="overflow-hidden border-purple-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between border-b border-purple-100 bg-purple-50/30 px-5 py-4">
                <CardTitle className="text-lg text-purple-900">Accessibility tracker</CardTitle>
                <Badge className="border-none bg-purple-100 text-purple-800 shadow-none hover:bg-purple-100">WCAG 2.1 AA · transparent and auditable</Badge>
              </CardHeader>
              <CardContent className="p-6">
                <p className="mb-6 max-w-[70ch] text-sm text-muted-foreground">
                  Accessibility is audited at intake, built in by design, and verified at every gate, never bolted on at the end.
                </p>

                <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div className="rounded-xl border border-purple-100 bg-white p-4">
                    <div className="mb-1 text-3xl font-bold text-purple-900">80<span className="text-xl">%</span></div>
                    <div className="text-xs font-medium uppercase tracking-wider text-purple-600/80">Conformance</div>
                  </div>
                  <div className="rounded-xl border border-purple-100 bg-white p-4">
                    <div className="mb-1 text-3xl font-bold text-foreground">7</div>
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Sources audited</div>
                  </div>
                  <div className="rounded-xl border border-purple-100 bg-white p-4">
                    <div className="mb-1 text-3xl font-bold text-amber-600">5</div>
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Open issues</div>
                  </div>
                  <div className="rounded-xl border border-purple-100 bg-white p-4">
                    <div className="mb-1 text-3xl font-bold text-green-600">0</div>
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resolved</div>
                  </div>
                </div>

                <div className="mb-8">
                  <Progress value={80} className="h-2 bg-purple-100 [&>div]:bg-purple-600" />
                  <div className="mt-2 text-sm text-muted-foreground">Currently tracking 5 open issues across 7 incoming sources. Target: 0 critical issues at QA.</div>
                </div>

                <div className="mb-8 grid grid-cols-1 gap-8 md:grid-cols-2">
                  <div>
                    <h4 className="mb-4 text-sm font-semibold">WCAG 2.1 AA success criteria tracked</h4>
                    <div className="space-y-2">
                      {A11Y_CRITERIA.map((c) => (
                        <div key={c.id} className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{c.id}</span>
                            <span className="font-medium">{c.name}</span>
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">{c.level}</span>
                          </div>
                          {c.status === "pass" && <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Pass</Badge>}
                          {c.status === "warn" && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Partial</Badge>}
                          {c.status === "monitor" && <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Monitor</Badge>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="mb-4 text-sm font-semibold">Remediation queue</h4>
                    <div className="space-y-3">
                      <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/30 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Lecture recordings (4)</span>
                          <Badge variant="outline" className="border-amber-200 bg-white text-amber-800">High</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded border bg-white px-1 font-mono">1.2.2</span>
                          <span>Missing captions and transcripts</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs font-medium">
                          <span>Owner: ID Team</span>
                          <span>Target: Wk 5</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/30 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Lecture-deck.pptx</span>
                          <Badge variant="outline" className="border-amber-200 bg-white text-amber-800">Med</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded border bg-white px-1 font-mono">1.1.1</span>
                          <span className="rounded border bg-white px-1 font-mono">1.4.3</span>
                          <span>Missing alt text, low contrast</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs font-medium">
                          <span>Owner: Faculty</span>
                          <span>Target: Wk 2</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-8 border-t pt-8 md:grid-cols-2">
                  <div>
                    <h4 className="mb-4 text-sm font-semibold">How it is checked · method disclosure</h4>
                    <ul className="mb-6 space-y-3 text-sm text-muted-foreground">
                      <li><strong className="font-medium text-foreground">Automated:</strong> axe-core and IBM Equal Access (catches about 30% of issues)</li>
                      <li><strong className="font-medium text-foreground">Manual:</strong> Keyboard navigation, screen-reader spot checks, captions QA, reading level analysis</li>
                      <li><strong className="font-medium text-foreground">Standard:</strong> WCAG 2.1 AA (no exceptions)</li>
                    </ul>
                    <Button className="bg-purple-600 text-white shadow-sm hover:bg-purple-700">Generate conformance report (ACR)</Button>
                  </div>
                  <div>
                    <h4 className="mb-4 text-sm font-semibold">Audit trail · Evidence Ledger</h4>
                    <div className="h-32 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-4">
                      <div className="text-xs">
                        <span className="mr-2 font-mono text-muted-foreground">Today 09:41</span>
                        <span className="font-medium text-purple-700">Audit completed:</span>
                        <span className="ml-1 text-muted-foreground">7 incoming sources parsed. 5 issues flagged for remediation.</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </ProjectWorkspace>
  );
}
