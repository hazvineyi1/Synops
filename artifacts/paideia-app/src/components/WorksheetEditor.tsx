import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import type { WorksheetContent } from "@/lib/types";

type Q = WorksheetContent["questions"][number];

function blankQuestion(num: number): Q {
  return { number: num, prompt: "", type: "short", options: null, answer: "", workingOrRubric: "" };
}

export function WorksheetEditor({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: WorksheetContent;
  saving: boolean;
  onSave: (next: WorksheetContent) => void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState<WorksheetContent>(() => ({
    ...initial,
    questions: initial.questions.map((q, i) => ({ ...q, number: i + 1 })),
  }));

  const update = (patch: Partial<WorksheetContent>) => setContent((c) => ({ ...c, ...patch }));
  const updateQ = (idx: number, patch: Partial<Q>) =>
    setContent((c) => ({
      ...c,
      questions: c.questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)),
    }));
  const removeQ = (idx: number) =>
    setContent((c) => ({
      ...c,
      questions: c.questions.filter((_, i) => i !== idx).map((q, i) => ({ ...q, number: i + 1 })),
    }));
  const moveQ = (idx: number, dir: -1 | 1) =>
    setContent((c) => {
      const arr = [...c.questions];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return c;
      [arr[idx], arr[j]] = [arr[j]!, arr[idx]!];
      return { ...c, questions: arr.map((q, i) => ({ ...q, number: i + 1 })) };
    });
  const addQ = () =>
    setContent((c) => ({ ...c, questions: [...c.questions, blankQuestion(c.questions.length + 1)] }));

  const handleSave = () => {
    if (!content.title.trim()) {
      alert("Title is required.");
      return;
    }
    if (content.questions.length === 0) {
      alert("Add at least one question.");
      return;
    }
    for (const [i, q] of content.questions.entries()) {
      if (!q.prompt.trim()) {
        alert(`Question ${i + 1} is missing a prompt.`);
        return;
      }
      if (q.type === "multiple_choice") {
        if (!q.options || q.options.filter((o) => o.trim()).length < 2) {
          alert(`Question ${i + 1} needs at least two options.`);
          return;
        }
        if (!q.answer.trim()) {
          alert(`Question ${i + 1} is multiple choice and needs an answer.`);
          return;
        }
      }
    }
    // Clean up options
    const cleaned: WorksheetContent = {
      ...content,
      questions: content.questions.map((q, i) => ({
        ...q,
        number: i + 1,
        options: q.type === "multiple_choice" ? (q.options ?? []).map((o) => o.trim()).filter(Boolean) : null,
      })),
    };
    onSave(cleaned);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="ws-title">Title</Label>
        <Input id="ws-title" value={content.title} onChange={(e) => update({ title: e.target.value })} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ws-instructions">Instructions for students</Label>
        <Textarea id="ws-instructions" rows={2} value={content.instructions ?? ""} onChange={(e) => update({ instructions: e.target.value })} />
      </div>

      <div>
        <h3 className="font-serif text-xl text-primary mb-3">Questions</h3>
        <div className="space-y-4">
          {content.questions.map((q, idx) => (
            <div key={idx} className="border rounded-lg p-4 bg-card space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-serif text-primary">Q{idx + 1}</span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => moveQ(idx, -1)} disabled={idx === 0} aria-label="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => moveQ(idx, 1)} disabled={idx === content.questions.length - 1} aria-label="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeQ(idx)} aria-label="Remove">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
                <div className="space-y-1">
                  <Label>Prompt</Label>
                  <Textarea rows={2} value={q.prompt} onChange={(e) => updateQ(idx, { prompt: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={q.type}
                    onValueChange={(v) => {
                      const next = v as Q["type"];
                      updateQ(idx, {
                        type: next,
                        options: next === "multiple_choice" ? q.options ?? ["", ""] : null,
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short answer</SelectItem>
                      <SelectItem value="long">Long answer</SelectItem>
                      <SelectItem value="multiple_choice">Multiple choice</SelectItem>
                      <SelectItem value="calculation">Calculation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {q.type === "multiple_choice" && (
                <div className="space-y-2">
                  <Label>Options</Label>
                  {(q.options ?? []).map((opt, oi) => (
                    <div key={oi} className="flex gap-2">
                      <Input
                        value={opt}
                        onChange={(e) => {
                          const opts = [...(q.options ?? [])];
                          opts[oi] = e.target.value;
                          updateQ(idx, { options: opts });
                        }}
                      />
                      <Button type="button" variant="ghost" size="sm" onClick={() => {
                        const opts = (q.options ?? []).filter((_, j) => j !== oi);
                        updateQ(idx, { options: opts });
                      }} aria-label="Remove option">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => updateQ(idx, { options: [...(q.options ?? []), ""] })}>
                    <Plus className="h-4 w-4 mr-1" />Add option
                  </Button>
                </div>
              )}

              <div className="space-y-1">
                <Label>Answer</Label>
                <Textarea rows={2} value={q.answer} onChange={(e) => updateQ(idx, { answer: e.target.value })} />
              </div>

              <div className="space-y-1">
                <Label>Working or rubric (optional)</Label>
                <Textarea rows={2} value={q.workingOrRubric ?? ""} onChange={(e) => updateQ(idx, { workingOrRubric: e.target.value })} />
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" className="mt-4" onClick={addQ}>
          <Plus className="h-4 w-4 mr-1" />Add question
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ws-notes">Teacher notes (not shown to students)</Label>
        <Textarea id="ws-notes" rows={3} value={content.teacherNotes ?? ""} onChange={(e) => update({ teacherNotes: e.target.value })} />
      </div>

      <div className="flex gap-2 justify-end sticky bottom-0 bg-background py-3 border-t">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </div>
  );
}
