import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetProjectGateStatus,
  useAdvanceProjectStage,
  useUpdateProject,
  getGetProjectQueryKey,
  getGetProjectGateStatusQueryKey,
  type Project,
} from "@workspace/kanon-api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Building2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  Clock,
  CalendarClock,
  Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { ProjectWorkspace } from "@/components/engine/ProjectWorkspace";
import { getStage, STAGE_COUNT } from "@/lib/stages";

const LMS_OPTIONS = [
  { value: "canvas", label: "Canvas (Instructure)" },
  { value: "blackboard", label: "Blackboard Learn" },
  { value: "moodle", label: "Moodle" },
  { value: "d2l", label: "D2L Brightspace" },
  { value: "schoology", label: "Schoology" },
  { value: "sakai", label: "Sakai" },
  { value: "google_classroom", label: "Google Classroom" },
  { value: "microsoft_teams", label: "Microsoft Teams (Education)" },
  { value: "other", label: "Other / Not yet determined" },
];

/** Editable "Project details" sidebar card. Reads values from the loaded
 * project and patches them via PATCH /projects/:id. courseType/courseCode/
 * revampNotes are sent as extra body fields (the server reads them directly). */
function ProjectDetailsCard({ project }: { project: Project }) {
  const p = project as Project & {
    courseType?: string;
    courseCode?: string | null;
    revampNotes?: string | null;
  };
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateProject = useUpdateProject();
  const [open, setOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [courseType, setCourseType] = useState("new_build");
  const [courseCode, setCourseCode] = useState("");
  const [tier, setTier] = useState("");
  const [modality, setModality] = useState("");
  const [lms, setLms] = useState("");
  const [revampNotes, setRevampNotes] = useState("");
  const [description, setDescription] = useState("");

  function openDialog() {
    setTitle(p.title ?? "");
    setCourseType(p.courseType === "revamp" ? "revamp" : "new_build");
    setCourseCode(p.courseCode ?? "");
    setTier(p.tier ?? "");
    setModality(p.modality ?? "");
    setLms(p.lms ?? "");
    setRevampNotes(p.revampNotes ?? "");
    setDescription(p.description ?? "");
    setOpen(true);
  }

  function handleSave() {
    const data = {
      title: title.trim(),
      tier: tier || undefined,
      modality: modality || undefined,
      lms: lms || undefined,
      description: description.trim() || undefined,
      courseType,
      courseCode: courseCode.trim() || null,
      revampNotes: courseType === "revamp" ? revampNotes.trim() || null : null,
    } as Record<string, unknown>;

    updateProject.mutate(
      { id: project.id, data: data as never },
      {
        onSuccess: () => {
          toast({ title: "Project details updated" });
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
          setOpen(false);
        },
        onError: () => toast({ title: "Could not update project", variant: "destructive" }),
      },
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Project details</CardTitle>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={openDialog}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <span className="mb-1 block text-xs uppercase text-muted-foreground">Course type</span>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
              p.courseType === "revamp"
                ? "bg-amber-100 text-amber-800"
                : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {p.courseType === "revamp" ? "Revamp" : "New build"}
          </span>
        </div>
        {p.courseCode && (
          <div>
            <span className="mb-1 block text-xs uppercase text-muted-foreground">Course code</span>
            <span className="font-medium">{p.courseCode}</span>
          </div>
        )}
        <div>
          <span className="mb-1 block text-xs uppercase text-muted-foreground">Tier</span>
          <span className="font-medium">{p.tier || "Unspecified"}</span>
        </div>
        <div>
          <span className="mb-1 block text-xs uppercase text-muted-foreground">Modality</span>
          <span className="font-medium capitalize">
            {p.modality?.replace("_", " ") || "Unspecified"}
          </span>
        </div>
        <div>
          <span className="mb-1 block text-xs uppercase text-muted-foreground">LMS</span>
          <span className="font-medium capitalize">{p.lms?.replace(/_/g, " ") || "Not specified"}</span>
        </div>
        {p.courseType === "revamp" && p.revampNotes && (
          <div>
            <span className="mb-1 block text-xs uppercase text-muted-foreground">Revamp details</span>
            <p className="whitespace-pre-wrap">{p.revampNotes}</p>
          </div>
        )}
        {p.description && (
          <div>
            <span className="mb-1 block text-xs uppercase text-muted-foreground">Description</span>
            <p className="whitespace-pre-wrap">{p.description}</p>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit project details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ep-title">Course title</Label>
              <Input id="ep-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Course type</Label>
                <Select value={courseType} onValueChange={setCourseType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new_build">New build</SelectItem>
                    <SelectItem value="revamp">Revamp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ep-code">Course code</Label>
                <Input
                  id="ep-code"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  placeholder="e.g. NUR 201"
                />
              </div>
            </div>
            {courseType === "revamp" && (
              <div className="space-y-1.5">
                <Label htmlFor="ep-revamp">Revamp details</Label>
                <Textarea
                  id="ep-revamp"
                  value={revampNotes}
                  onChange={(e) => setRevampNotes(e.target.value)}
                  placeholder="What exists today and what needs to change."
                  rows={3}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tier</Label>
                <Select value={tier} onValueChange={setTier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Tier 1 - Full Custom</SelectItem>
                    <SelectItem value="2">Tier 2 - Template-Based</SelectItem>
                    <SelectItem value="3">Tier 3 - Light Touch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Modality</Label>
                <Select value={modality} onValueChange={setModality}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select modality" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online Asynchronous</SelectItem>
                    <SelectItem value="online_sync">Online Synchronous</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="in_person">In Person</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>LMS</Label>
              <Select value={lms} onValueChange={setLms}>
                <SelectTrigger>
                  <SelectValue placeholder="Select LMS" />
                </SelectTrigger>
                <SelectContent>
                  {LMS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-desc">Description</Label>
              <Textarea
                id="ep-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!title.trim() || updateProject.isPending}>
              {updateProject.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function statusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "gate_blocked") return "destructive";
  if (status === "complete") return "default";
  return "secondary";
}

export default function ProjectDetail() {
  const params = useParams();
  const projectId = parseInt(params.id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: gateStatus } = useGetProjectGateStatus(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectGateStatusQueryKey(projectId) },
  });

  const advanceStage = useAdvanceProjectStage();

  const handleAdvance = () => {
    advanceStage.mutate(
      { id: projectId, data: { notes: "Advanced from UI" } },
      {
        onSuccess: () => {
          toast({ title: "Project advanced to the next stage" });
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetProjectGateStatusQueryKey(projectId) });
        },
        onError: () => {
          toast({ title: "Could not advance the project", variant: "destructive" });
        },
      }
    );
  };

  return (
    <ProjectWorkspace
      subtitle="Project overview and what is needed to move forward."
      meta={({ project }) => (
        <>
          <Link
            href={`/clients/${project.clientId}`}
            className="flex items-center gap-1 text-primary hover:underline"
          >
            <Building2 className="h-4 w-4" aria-hidden="true" />
            {project.clientName}
          </Link>
          {project.targetDeliveryDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" aria-hidden="true" />
              Due {format(new Date(project.targetDeliveryDate), "MMM d, yyyy")}
            </span>
          )}
          <Badge variant={statusVariant(project.status)} className="uppercase">
            {project.status.replace("_", " ")}
          </Badge>
        </>
      )}
    >
      {({ project }) => {
        const currentStage = getStage(project.stage);
        const nextStage = getStage(project.stage + 1);
        const hasNext = project.stage < STAGE_COUNT - 1;

        return (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardDescription className="uppercase tracking-wide">
                    Current stage {project.stage + 1} of {STAGE_COUNT}
                  </CardDescription>
                  <CardTitle className="text-xl">{currentStage?.title ?? "Stage"}</CardTitle>
                  {currentStage?.blurb && <CardDescription>{currentStage.blurb}</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-6">
                  {currentStage && (
                    <Button asChild size="lg" className="w-full sm:w-auto">
                      <Link href={`/projects/${project.id}/${currentStage.slug}`}>
                        Continue in {currentStage.title} workspace
                        <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  )}

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      What is needed to advance{nextStage ? ` to ${nextStage.title}` : ""}
                    </h3>
                    {gateStatus && gateStatus.requirements.length > 0 ? (
                      <ul className="space-y-2">
                        {gateStatus.requirements.map((req, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-3 rounded-md border bg-card p-3"
                          >
                            {req.met ? (
                              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                            ) : req.blocking ? (
                              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                            ) : (
                              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-muted-foreground" aria-hidden="true" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{req.label}</p>
                              {req.detail && <p className="mt-1 text-xs text-muted-foreground">{req.detail}</p>}
                            </div>
                            <span className="ml-auto shrink-0 text-xs font-medium">
                              {req.met ? (
                                <span className="text-primary">Done</span>
                              ) : req.blocking ? (
                                <Badge variant="destructive">Blocking</Badge>
                              ) : (
                                <span className="text-muted-foreground">Optional</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No requirements loaded for this stage.</p>
                    )}
                  </div>

                  {hasNext && (
                    <div className="flex justify-end border-t pt-4">
                      <Button
                        onClick={handleAdvance}
                        disabled={!gateStatus?.canAdvance || advanceStage.isPending}
                        variant={gateStatus?.canAdvance ? "default" : "secondary"}
                      >
                        Advance to {nextStage?.title ?? "next stage"}
                        <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <aside className="space-y-6">
              <ProjectDetailsCard project={project} />

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Agendas</CardTitle>
                  <CardDescription>
                    Weekly agendas, action items, correspondence, and calendar.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/projects/${project.id}/meetings`}>
                      <CalendarClock className="mr-2 h-4 w-4" aria-hidden="true" />
                      Open agendas
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Time tracking</CardTitle>
                  <CardDescription>Log hours worked on this project.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/projects/${project.id}/time`}>
                      <Clock className="mr-2 h-4 w-4" aria-hidden="true" />
                      Open time tracker
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </aside>
          </div>
        );
      }}
    </ProjectWorkspace>
  );
}
