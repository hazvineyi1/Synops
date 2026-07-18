import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, AlertTriangle } from "lucide-react";

/**
 * Measurable-objective action verbs (Bloom's taxonomy, across all six levels). A well-
 * formed learning objective always begins with one of these -- "Explain...", "Analyse...",
 * "Design..." -- never a vague opener like "Understand" or "Know". We use this list to nudge
 * authors toward measurable objectives (a soft, non-blocking hint).
 */
const ACTION_VERBS = new Set([
  // Remember
  "define", "identify", "list", "name", "recall", "recognise", "recognize", "state", "label",
  "match", "select", "cite", "record", "repeat", "locate",
  // Understand
  "explain", "summarise", "summarize", "interpret", "classify", "compare", "contrast",
  "illustrate", "paraphrase", "discuss", "distinguish", "describe", "estimate", "predict",
  "translate", "report", "review",
  // Apply
  "apply", "demonstrate", "use", "implement", "solve", "calculate", "execute", "perform",
  "employ", "operate", "produce", "practise", "practice", "compute", "modify", "prepare",
  "schedule", "conduct",
  // Analyse
  "analyse", "analyze", "differentiate", "organise", "organize", "examine", "investigate",
  "categorise", "categorize", "deconstruct", "diagnose", "distinguish", "correlate", "outline",
  // Evaluate
  "evaluate", "assess", "critique", "judge", "justify", "defend", "recommend", "prioritise",
  "prioritize", "appraise", "argue", "rate", "measure", "test", "verify", "validate",
  // Create
  "create", "design", "develop", "construct", "formulate", "plan", "compose", "generate",
  "propose", "devise", "build", "assemble", "author", "write", "produce",
]);

function startsWithActionVerb(text: string): boolean {
  const first = text.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "");
  return !!first && ACTION_VERBS.has(first);
}

/**
 * A small controlled editor for a string[] list of learning objectives. Numbered rows,
 * inline delete, an "Add" button, and a soft hint when an objective does not begin with a
 * measurable action verb. The parent owns the value + persistence.
 */
export function ObjectivesEditor({
  value,
  onChange,
  placeholder = "Start with an action verb, e.g. Explain, Analyse, Demonstrate...",
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
      {value.map((it, i) => {
        const needsVerb = it.trim().length > 0 && !startsWithActionVerb(it);
        return (
          <div key={i}>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5 shrink-0 text-right tabular-nums">{i + 1}.</span>
              <Input
                value={it}
                onChange={(e) => update(i, e.target.value)}
                placeholder={placeholder}
                aria-invalid={needsVerb}
                className={needsVerb ? "border-amber-400 focus-visible:ring-amber-400" : undefined}
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
            {needsVerb && (
              <p className="flex items-center gap-1 text-[11px] text-amber-600 mt-1 ml-7">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Start with an action verb (e.g. Explain, Analyse, Demonstrate).
              </p>
            )}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1.5">
        <Plus className="h-4 w-4" /> {addLabel}
      </Button>
    </div>
  );
}
