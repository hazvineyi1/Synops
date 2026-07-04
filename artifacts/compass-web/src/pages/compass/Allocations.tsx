import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAllocations,
  getListAllocationsQueryKey,
  useCreateAllocation,
  useRevokeAllocation,
  useListBuilders,
  useListProjects,
  useListCourses,
  getListCoursesQueryKey,
  useListClasses,
  getListClassesQueryKey,
  type Allocation,
  type CreateAllocationInputScopeType,
} from "@workspace/compass-api-client";
import { authErrorMessage } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { KeySquare, Plus, Undo2 } from "lucide-react";

const WHOLE = "__whole__";

function scopeBadgeVariant(type: string): "default" | "secondary" | "outline" {
  if (type === "project") return "default";
  if (type === "course") return "secondary";
  return "outline";
}

export default function Allocations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: allocations, isLoading } = useListAllocations();
  const { data: builders } = useListBuilders();
  const { data: projects } = useListProjects();
  const createAllocation = useCreateAllocation();
  const revokeAllocation = useRevokeAllocation();

  const [open, setOpen] = useState(false);
  const [builderId, setBuilderId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [courseId, setCourseId] = useState(WHOLE);
  const [classId, setClassId] = useState(WHOLE);
  const [notes, setNotes] = useState("");

  const numericProjectId = Number(projectId);
  const numericCourseId = courseId === WHOLE ? 0 : Number(courseId);

  const { data: courses } = useListCourses(numericProjectId, {
    query: {
      enabled: numericProjectId > 0,
      queryKey: getListCoursesQueryKey(numericProjectId),
    },
  });
  const { data: classes } = useListClasses(numericCourseId, {
    query: {
      enabled: numericCourseId > 0,
      queryKey: getListClassesQueryKey(numericCourseId),
    },
  });

  const activeBuilders = (builders ?? []).filter((b) => b.status === "active");

  function resetForm() {
    setBuilderId("");
    setProjectId("");
    setCourseId(WHOLE);
    setClassId(WHOLE);
    setNotes("");
  }

  function resolveScope(): { scopeType: CreateAllocationInputScopeType; scopeId: number } | null {
    if (classId !== WHOLE) return { scopeType: "class", scopeId: Number(classId) };
    if (courseId !== WHOLE) return { scopeType: "course", scopeId: Number(courseId) };
    if (projectId) return { scopeType: "project", scopeId: Number(projectId) };
    return null;
  }

  function onCreate() {
    if (!builderId) {
      toast({ title: "Choose a builder", variant: "destructive" });
      return;
    }
    const scope = resolveScope();
    if (!scope) {
      toast({ title: "Choose a project, course, or class", variant: "destructive" });
      return;
    }
    createAllocation.mutate(
      {
        data: {
          builderUserId: Number(builderId),
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAllocationsQueryKey() });
          setOpen(false);
          resetForm();
          toast({ title: "Access granted" });
        },
        onError: (err) =>
          toast({
            title: "Could not grant access",
            description: authErrorMessage(err),
            variant: "destructive",
          }),
      },
    );
  }

  function onRevoke(allocation: Allocation) {
    revokeAllocation.mutate(
      { id: allocation.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAllocationsQueryKey() });
          toast({ title: "Access revoked" });
        },
        onError: (err) =>
          toast({
            title: "Could not revoke access",
            description: authErrorMessage(err),
            variant: "destructive",
          }),
      },
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <KeySquare className="h-7 w-7" aria-hidden="true" /> Allocations
          </h1>
          <p className="mt-1 text-muted-foreground">
            Grant a builder access to a project, course, or class. Access flows
            down to everything beneath the scope, never above it.
          </p>
        </div>

        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Grant access
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Grant access</DialogTitle>
              <DialogDescription>
                Pick a builder and the deepest scope they should work in. Leave
                course or class as the whole level to grant the parent scope.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Builder</Label>
                <Select value={builderId} onValueChange={setBuilderId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a builder" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeBuilders.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No active builders
                      </SelectItem>
                    ) : (
                      activeBuilders.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name} ({b.email})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Project</Label>
                <Select
                  value={projectId}
                  onValueChange={(value) => {
                    setProjectId(value);
                    setCourseId(WHOLE);
                    setClassId(WHOLE);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects ?? []).map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {numericProjectId > 0 && (
                <div className="space-y-2">
                  <Label>Course</Label>
                  <Select
                    value={courseId}
                    onValueChange={(value) => {
                      setCourseId(value);
                      setClassId(WHOLE);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={WHOLE}>Whole project</SelectItem>
                      {(courses ?? []).map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {numericCourseId > 0 && (
                <div className="space-y-2">
                  <Label>Class</Label>
                  <Select value={classId} onValueChange={setClassId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={WHOLE}>Whole course</SelectItem>
                      {(classes ?? []).map((cls) => (
                        <SelectItem key={cls.id} value={String(cls.id)}>
                          {cls.name}
                          {cls.section ? ` (${cls.section})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="allocation-notes">Notes (optional)</Label>
                <Textarea
                  id="allocation-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why this access was granted"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={onCreate} disabled={createAllocation.isPending}>
                {createAllocation.isPending ? "Granting..." : "Grant access"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading allocations...</div>
      ) : !allocations || allocations.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No allocations yet. Grant a builder access to get started.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Builder</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    {a.builderName ?? `User ${a.builderUserId}`}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant={scopeBadgeVariant(a.scopeType)}>{a.scopeType}</Badge>
                      <span>{a.scopeTitle}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.projectTitle ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.status === "active" ? "secondary" : "outline"}>
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {a.notes ?? "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {a.status === "active" ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive">
                            <Undo2 className="mr-1 h-4 w-4" /> Revoke
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revoke this access?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {a.builderName ?? "The builder"} will lose access to
                              {" "}
                              {a.scopeTitle} and everything beneath it.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onRevoke(a)}>
                              Revoke
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : (
                      <span className="text-sm text-muted-foreground">Revoked</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
