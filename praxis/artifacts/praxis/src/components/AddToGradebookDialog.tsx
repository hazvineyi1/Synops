import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { gradebookApi, type SourceType, type ItemType } from "@/lib/gradebookApi";
import { BookOpenCheck, Check, Trash2 } from "lucide-react";

const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * "Include in gradebook" — attaches a case or activity to a course's gradebook as a column,
 * categorised and tagged formative/summative. Shows where it's already included.
 */
export function AddToGradebookDialog({
  sourceType,
  sourceId,
  title,
  children,
}: {
  sourceType: Extract<SourceType, "case" | "activity">;
  sourceId: string;
  title: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [category, setCategory] = useState("");
  const [itemType, setItemType] = useState<ItemType>("summative");
  const [points, setPoints] = useState("");
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const courses = useQuery({
    queryKey: ["gb-manageable-courses"],
    queryFn: () => gradebookApi.manageableCourses(),
    enabled: open,
  });
  const inclusions = useQuery({
    queryKey: ["gb-source", sourceType, sourceId],
    queryFn: () => gradebookApi.source(sourceType, sourceId),
    enabled: open,
  });

  const add = useMutation({
    mutationFn: () =>
      gradebookApi.createItem(courseId, {
        sourceType,
        sourceId,
        title,
        category: category.trim() || undefined,
        itemType,
        pointsPossible: points ? Number(points) : undefined,
      }),
    onSuccess: () => {
      setError(null);
      setCategory("");
      setPoints("");
      inclusions.refetch();
      qc.invalidateQueries({ queryKey: ["gradebook"] });
    },
    onError: (e: any) => setError(e?.message ?? "Could not add to gradebook"),
  });

  const remove = useMutation({
    mutationFn: (itemId: string) => gradebookApi.deleteItem(itemId),
    onSuccess: () => {
      inclusions.refetch();
      qc.invalidateQueries({ queryKey: ["gradebook"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="outline" size="sm" className="gap-1.5">
            <BookOpenCheck className="h-4 w-4" /> Add to gradebook
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to gradebook</DialogTitle>
          <DialogDescription>
            Include “{title}” as a graded column in a course. Choose whether it counts toward mastery
            (summative) or is practice only (formative), and the learning target it belongs to.
          </DialogDescription>
        </DialogHeader>

        {inclusions.data && inclusions.data.length > 0 && (
          <div className="rounded-md border border-border p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Already in these gradebooks</p>
            {inclusions.data.map((inc) => (
              <div key={inc.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-green-600" />
                  {inc.courseTitle}
                  <Badge variant="secondary" className="text-[10px]">{inc.category}</Badge>
                  <span className="text-xs text-muted-foreground">{inc.itemType} · {inc.pointsPossible} pts</span>
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove.mutate(inc.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Course</Label>
            <select className={selectCls} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">Select a course…</option>
              {(courses.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Counts as</Label>
              <select className={selectCls} value={itemType} onChange={(e) => setItemType(e.target.value as ItemType)}>
                <option value="summative">Summative (counts)</option>
                <option value="formative">Formative (practice)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Points</Label>
              <Input type="number" min={1} placeholder="auto" value={points} onChange={(e) => setPoints(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Learning target / category</Label>
            <Input placeholder="e.g. Digital marketing fundamentals" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          <Button disabled={!courseId || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? "Adding…" : "Add column"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
