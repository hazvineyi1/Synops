import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import type { QuizContent } from "@/lib/types";

type Item = QuizContent["items"][number];

function blankItem(num: number): Item {
  return { number: num, prompt: "", type: "short_answer", options: null, correctAnswer: "", difficulty: "medium", skillAssessed: "" };
}

export function QuizEditor({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: QuizContent;
  saving: boolean;
  onSave: (next: QuizContent) => void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState<QuizContent>(() => ({
    ...initial,
    items: initial.items.map((it, i) => ({ ...it, number: i + 1 })),
  }));

  const update = (patch: Partial<QuizContent>) => setContent((c) => ({ ...c, ...patch }));
  const updateIt = (idx: number, patch: Partial<Item>) =>
    setContent((c) => ({
      ...c,
      items: c.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  const removeIt = (idx: number) =>
    setContent((c) => ({
      ...c,
      items: c.items.filter((_, i) => i !== idx).map((it, i) => ({ ...it, number: i + 1 })),
    }));
  const moveIt = (idx: number, dir: -1 | 1) =>
    setContent((c) => {
      const arr = [...c.items];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return c;
      [arr[idx], arr[j]] = [arr[j]!, arr[idx]!];
      return { ...c, items: arr.map((it, i) => ({ ...it, number: i + 1 })) };
    });
  const addIt = () =>
    setContent((c) => ({ ...c, items: [...c.items, blankItem(c.items.length + 1)] }));

  const handleSave = () => {
    if (!content.title.trim()) { alert("Title is required."); return; }
    if (content.items.length === 0) { alert("Add at least one question."); return; }
    for (const [i, q] of content.items.entries()) {
      if (!q.prompt.trim()) { alert(`Question ${i + 1} is missing a prompt.`); return; }
      if (!q.correctAnswer.trim()) { alert(`Question ${i + 1} is missing the correct answer.`); return; }
      if (q.type === "multiple_choice" && (!q.options || q.options.filter((o) => o.trim()).length < 2)) {
        alert(`Question ${i + 1} needs at least two options.`); return;
      }
    }
    const cleaned: QuizContent = {
      ...content,
      items: content.items.map((it, i) => ({
        ...it,
        number: i + 1,
        options: it.type === "multiple_choice" ? (it.options ?? []).map((o) => o.trim()).filter(Boolean) : null,
      })),
    };
    onSave(cleaned);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
        <div className="space-y-2">
          <Label htmlFor="qz-title">Title</Label>
          <Input id="qz-title" value={content.title} onChange={(e) => update({ title: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qz-format">Format</Label>
          <Input id="qz-format" value={content.format} onChange={(e) => update({ format: e.target.value })} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="qz-instructions">Instructions for students</Label>
        <Textarea id="qz-instructions" rows={2} value={content.instructions ?? ""} onChange={(e) => update({ instructions: e.target.value })} />
      </div>

      <div>
        <h3 className="font-serif text-xl text-primary mb-3">Questions</h3>
        <div className="space-y-4">
          {content.items.map((q, idx) => (
            <div key={idx} className="border rounded-lg p-4 bg-card space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-serif text-primary">Q{idx + 1}</span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => moveIt(idx, -1)} disabled={idx === 0} aria-label="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => moveIt(idx, 1)} disabled={idx === content.items.length - 1} aria-label="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeIt(idx)} aria-label="Remove">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Prompt</Label>
                <Textarea rows={2} value={q.prompt} onChange={(e) => updateIt(idx, { prompt: e.target.value })} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={q.type}
                    onValueChange={(v) => {
                      const next = v as Item["type"];
                      updateIt(idx, {
                        type: next,
                        options: next === "multiple_choice" ? q.options ?? ["", ""] : null,
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short_answer">Short answer</SelectItem>
                      <SelectItem value="multiple_choice">Multiple choice</SelectItem>
                      <SelectItem value="true_false">True / false</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Difficulty</Label>
                  <Select value={q.difficulty} onValueChange={(v) => updateIt(idx, { difficulty: v as Item["difficulty"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Skill assessed</Label>
                  <Input value={q.skillAssessed ?? ""} onChange={(e) => updateIt(idx, { skillAssessed: e.target.value })} />
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
                          updateIt(idx, { options: opts });
                        }}
                      />
                      <Button type="button" variant="ghost" size="sm" onClick={() => {
                        const opts = (q.options ?? []).filter((_, j) => j !== oi);
                        updateIt(idx, { options: opts });
                      }} aria-label="Remove option">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => updateIt(idx, { options: [...(q.options ?? []), ""] })}>
                    <Plus className="h-4 w-4 mr-1" />Add option
                  </Button>
                </div>
              )}

              <div className="space-y-1">
                <Label>Correct answer</Label>
                {q.type === "true_false" ? (
                  <Select value={q.correctAnswer || "True"} onValueChange={(v) => updateIt(idx, { correctAnswer: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="True">True</SelectItem>
                      <SelectItem value="False">False</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={q.correctAnswer} onChange={(e) => updateIt(idx, { correctAnswer: e.target.value })} />
                )}
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" className="mt-4" onClick={addIt}>
          <Plus className="h-4 w-4 mr-1" />Add question
        </Button>
      </div>

      <div className="flex gap-2 justify-end sticky bottom-0 bg-background py-3 border-t">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </div>
  );
}
