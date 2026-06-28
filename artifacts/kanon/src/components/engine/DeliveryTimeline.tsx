import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface Gate {
  wk: string;
  label: string;
  active?: boolean;
}

interface Goal {
  title: string;
  pct: number;
}

/**
 * A compact, always-visible summary of the engagement's targets and gated
 * schedule. It replaces a long collapsed card that previously sat at the bottom
 * of the Prepare tab, so a builder sees the goals and the delivery timeline
 * straight away without scrolling. Kept short on purpose: one header row, one
 * horizontal gate timeline, and a dense grid of goal chips.
 */
export function DeliveryTimeline() {
  const gates: Gate[] = [
    { wk: "Wk 0", label: "Intake", active: true },
    { wk: "Wk 1 to 3", label: "Backward design, alignment gate" },
    { wk: "Wk 4", label: "Prototype, faculty sign-off" },
    { wk: "Wk 5 to 14", label: "Production" },
    { wk: "Wk 15 to 16", label: "QA and accessibility" },
    { wk: "Wk 17", label: "Handoff" },
  ];

  const goals: Goal[] = [
    { title: "Aligned, measurable outcomes", pct: 0 },
    { title: "Accessibility conformance", pct: 80 },
    { title: "Faculty-approved prototype", pct: 0 },
    { title: "Evidence-based media", pct: 0 },
    { title: "On-time delivery", pct: 0 },
  ];

  const overall = Math.round(goals.reduce((sum, g) => sum + g.pct, 0) / goals.length);

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold leading-tight">Goals and delivery timeline</h2>
            <p className="text-sm text-muted-foreground">Engagement targets and the gated schedule</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Overall</span>
            <span className="font-mono font-semibold">{overall}%</span>
          </div>
        </div>

        <nav aria-label="Delivery timeline and gates">
          <ol className="flex gap-2 overflow-x-auto pb-1">
            {gates.map((gate, i) => (
              <li key={i} className="shrink-0">
                <div
                  aria-current={gate.active ? "step" : undefined}
                  className={`flex h-full min-w-[8.5rem] flex-col gap-0.5 rounded-lg border px-3 py-2 ${
                    gate.active
                      ? "border-primary bg-primary/5"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <span
                    className={`text-xs font-semibold ${
                      gate.active ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {gate.wk}
                    {gate.active ? " · Current" : ""}
                  </span>
                  <span
                    className={`text-[13px] leading-snug ${
                      gate.active ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {gate.label}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </nav>

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {goals.map((goal, i) => (
            <li key={i} className="rounded-lg border border-border bg-card/50 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold leading-tight text-foreground">{goal.title}</span>
                <span className="font-mono text-[11px] font-medium text-muted-foreground">{goal.pct}%</span>
              </div>
              <Progress
                value={goal.pct}
                aria-label={`${goal.title}: ${goal.pct} percent complete`}
                className="mt-2 h-1.5 [&>div]:bg-primary"
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
