import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

/**
 * A small controlled editor for a string[] list (learning objectives, outcomes, etc).
 * Mirrors the add/remove/edit pattern used in ActivityBuilder's OrderForm. Numbered
 * rows, inline delete, and an "Add" button. The parent owns the value + persistence.
 */
export function ObjectivesEditor({
  value,
  onChange,
  placeholder = "Learners will be able to...",
  addLabel = "Add objective",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  addLabel?: string;
}) {
  const update = (i: number, v: string) => onChange(value.map((x, idx) => (idx === i ? v : x)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, ""]);

  return (
    <div className="space-y-2">
      {value.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-5 shrink-0 text-right tabular-nums">{i + 1}.</span>
          <Input
            value={it}
            onChange={(e) => update(i, e.target.value)}
            placeholder={placeholder}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-rose-500 hover:text-rose-600"
            onClick={() => remove(i)}
            aria-label="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1.5">
        <Plus className="h-4 w-4" /> {addLabel}
      </Button>
    </div>
  );
}
