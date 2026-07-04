import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Target,
  XCircle,
} from "lucide-react";

type ItemState = "pending" | "checking" | "done";
type Result = "pass" | "fail";

interface Check {
  label: string;
  result: Result;
  detail: string;
  finding?: string;
  remediation?: string;
}

interface QaItem {
  id: string;
  kind: string;
  title: string;
  standard: Check;
  compliance: Check;
}

const COURSE_TITLE = "Foundations of Data Literacy";
const COURSE_META = "Grades 9 to 10, 6 curriculum items";

// A curated sample so the walkthrough tells a clear story: most items pass, but
// the check surfaces one standards gap and one accessibility gap to resolve.
const ITEMS: QaItem[] = [
  {
    id: "lesson-1",
    kind: "Lesson",
    title: "Reading data visualizations",
    standard: {
      label: "Standards alignment",
      result: "pass",
      detail: "Mapped to CCSS.ELA-LITERACY.RST.9-10.7",
    },
    compliance: {
      label: "Compliance",
      result: "pass",
      detail: "WCAG 2.1 AA: charts include text alternatives",
    },
  },
  {
    id: "objective-1",
    kind: "Objective",
    title: "Interpret measures of central tendency",
    standard: {
      label: "Standards alignment",
      result: "pass",
      detail: "Mapped to CCSS.MATH.CONTENT.HSS.ID.A.2",
    },
    compliance: {
      label: "Compliance",
      result: "pass",
      detail: "Each objective has a graded assessment",
    },
  },
  {
    id: "assessment-1",
    kind: "Assessment",
    title: "Unit 1 quiz",
    standard: {
      label: "Standards alignment",
      result: "pass",
      detail: "Items trace to objectives 1 through 3",
    },
    compliance: {
      label: "Compliance",
      result: "fail",
      detail: "WCAG 2.1 AA: image alternatives",
      finding: "Two quiz items use images with no text alternative.",
      remediation: "Add descriptive alt text, or provide an equivalent text-only item.",
    },
  },
  {
    id: "lesson-2",
    kind: "Lesson",
    title: "Recognizing bias in data collection",
    standard: {
      label: "Standards alignment",
      result: "fail",
      detail: "Framework mapping",
      finding: "No framework standard is mapped to this lesson.",
      remediation:
        "Map the lesson to a standard, or tag it as enrichment so it is excluded from coverage.",
    },
    compliance: {
      label: "Compliance",
      result: "pass",
      detail: "Reading level is within the target band",
    },
  },
  {
    id: "objective-2",
    kind: "Objective",
    title: "Build a simple data dashboard",
    standard: {
      label: "Standards alignment",
      result: "pass",
      detail: "Mapped to ISTE 1.5 Computational Thinker",
    },
    compliance: {
      label: "Compliance",
      result: "pass",
      detail: "Prerequisite chain is defined",
    },
  },
  {
    id: "resource-1",
    kind: "Resource",
    title: "Open dataset library",
    standard: {
      label: "Standards alignment",
      result: "pass",
      detail: "Supports objectives 2 and 5",
    },
    compliance: {
      label: "Compliance",
      result: "pass",
      detail: "License and attribution are recorded",
    },
  },
];

function statusText(state: ItemState, result: Result): string {
  if (state === "pending") return "Pending";
  if (state === "checking") return "Checking";
  return result === "pass" ? "Pass" : "Fail";
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-all duration-500 motion-reduce:transition-none"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function CheckLine({ state, check }: { state: ItemState; check: Check }) {
  const done = state === "done";
  const text = statusText(state, check.result);

  let icon = <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  let statusClass = "text-muted-foreground";
  if (state === "checking") {
    icon = (
      <Loader2
        className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none"
        aria-hidden="true"
      />
    );
    statusClass = "text-primary";
  } else if (done && check.result === "pass") {
    icon = <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />;
    statusClass = "text-green-700 dark:text-green-400";
  } else if (done && check.result === "fail") {
    icon = <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />;
    statusClass = "text-red-700 dark:text-red-400";
  }

  let detail = "Awaiting check";
  if (state === "checking") detail = "Checking...";
  else if (done) detail = check.result === "pass" ? check.detail : (check.finding ?? check.detail);

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-xs">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block font-medium">{check.label}</span>
        <span className="block truncate text-muted-foreground">{detail}</span>
      </span>
      <span className={`ml-auto shrink-0 font-semibold ${statusClass}`}>{text}</span>
    </div>
  );
}

function ItemStatusBadge({ state, failed }: { state: ItemState; failed: boolean }) {
  if (state === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <Circle className="h-3.5 w-3.5" aria-hidden="true" /> Pending
      </span>
    );
  }
  if (state === "checking") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
        <Loader2
          className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />{" "}
        Checking
      </span>
    );
  }
  if (failed) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-400">
        <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Needs fix
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Pass
    </span>
  );
}

export function QualityAssuranceDemo() {
  const [phase, setPhase] = useState<"intro" | "active">("intro");
  const [done, setDone] = useState(0);
  const [checking, setChecking] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [reduceMotion, setReduceMotion] = useState(false);

  const doneRef = useRef(0);
  const checkingRef = useRef(false);
  const autoRunRef = useRef(false);
  const reduceMotionRef = useRef(false);
  const timers = useRef<number[]>([]);
  const summaryRef = useRef<HTMLDivElement>(null);

  reduceMotionRef.current = reduceMotion;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t));
    },
    [],
  );

  const schedule = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };

  const runOne = () => {
    const i = doneRef.current;
    if (checkingRef.current || i >= ITEMS.length) return;
    const item = ITEMS[i];
    setChecking(true);
    checkingRef.current = true;
    setAnnounce(`Checking ${item.kind.toLowerCase()}: ${item.title}.`);

    const finalize = () => {
      doneRef.current = i + 1;
      checkingRef.current = false;
      setDone(i + 1);
      setChecking(false);
      setAnnounce(
        `${item.title}. Standards ${item.standard.result === "pass" ? "passed" : "failed"}. ` +
          `Compliance ${item.compliance.result === "pass" ? "passed" : "failed"}.`,
      );
      if (i + 1 >= ITEMS.length) {
        autoRunRef.current = false;
        schedule(() => summaryRef.current?.focus(), 60);
      } else if (autoRunRef.current) {
        schedule(runOne, reduceMotionRef.current ? 140 : 540);
      }
    };

    schedule(finalize, reduceMotionRef.current ? 0 : 480);
  };

  const handleBegin = () => setPhase("active");

  const handleStep = () => {
    autoRunRef.current = false;
    runOne();
  };

  const handleRunAll = () => {
    autoRunRef.current = true;
    runOne();
  };

  const handleReset = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
    autoRunRef.current = false;
    checkingRef.current = false;
    doneRef.current = 0;
    setChecking(false);
    setDone(0);
    setAnnounce("Checks reset. Ready to run again.");
  };

  if (phase === "intro") {
    return (
      <div className="p-6 md:p-8">
        <div className="space-y-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-primary">
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" /> Quality Assurance
          </div>
          <h3 className="text-2xl font-semibold tracking-tight">
            Standards and compliance, validated
          </h3>
          <p className="leading-relaxed text-muted-foreground">
            Run a sample course through our quality check. Each curriculum item is validated
            against its standards alignment and against compliance requirements, with statuses
            updating live and an overall QA score you can watch build.
          </p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
            <Target className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <div className="text-sm font-medium">Standards alignment</div>
              <div className="text-xs text-muted-foreground">
                Every item maps to a framework standard.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <div className="text-sm font-medium">Compliance</div>
              <div className="text-xs text-muted-foreground">
                Accessibility, assessment coverage, and licensing.
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6">
          <Button onClick={handleBegin} size="lg" className="w-full sm:w-auto">
            Run quality check <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }

  const allDone = done >= ITEMS.length && !checking;
  const checkedItems = ITEMS.slice(0, done);
  const standardsPassed = checkedItems.filter((i) => i.standard.result === "pass").length;
  const compliancePassed = checkedItems.filter((i) => i.compliance.result === "pass").length;
  const totalChecks = done * 2;
  const passedChecks = standardsPassed + compliancePassed;
  const qaScore = totalChecks ? Math.round((passedChecks / totalChecks) * 100) : 0;
  const standardsScore = done ? Math.round((standardsPassed / done) * 100) : 0;
  const complianceScore = done ? Math.round((compliancePassed / done) * 100) : 0;
  const issues = checkedItems.flatMap((i) => {
    const out: { item: QaItem; check: Check }[] = [];
    if (i.standard.result === "fail") out.push({ item: i, check: i.standard });
    if (i.compliance.result === "fail") out.push({ item: i, check: i.compliance });
    return out;
  });

  return (
    <div className="space-y-6 p-6 md:p-8">
      {allDone && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <div className="font-semibold">Quality check complete</div>
            <p className="text-sm text-muted-foreground">
              {ITEMS.length} items validated. Overall QA score {qaScore}%.{" "}
              {issues.length === 0
                ? "No issues found."
                : `${issues.length} ${issues.length === 1 ? "issue" : "issues"} to resolve, listed in the summary.`}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Curriculum items */}
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-3 border-b border-border pb-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sample course
              </div>
              <div className="text-base font-semibold">{COURSE_TITLE}</div>
            </div>
            <div className="text-right text-xs text-muted-foreground">{COURSE_META}</div>
          </div>

          <ul className="space-y-3">
            {ITEMS.map((item, i) => {
              const state: ItemState =
                i < done ? "done" : checking && i === done ? "checking" : "pending";
              const failed =
                state === "done" &&
                (item.standard.result === "fail" || item.compliance.result === "fail");
              const failedChecks =
                state === "done"
                  ? [item.standard, item.compliance].filter((c) => c.result === "fail")
                  : [];

              return (
                <li
                  key={item.id}
                  className={`rounded-lg border p-4 transition-colors motion-reduce:transition-none ${
                    state === "checking"
                      ? "border-primary/40 bg-primary/5"
                      : state === "done"
                        ? failed
                          ? "border-red-500/30 bg-red-500/5"
                          : "border-green-500/30 bg-green-500/5"
                        : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-secondary-foreground">
                        {item.kind}
                      </span>
                      <div className="text-sm font-medium">{item.title}</div>
                    </div>
                    <ItemStatusBadge state={state} failed={failed} />
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <CheckLine state={state} check={item.standard} />
                    <CheckLine state={state} check={item.compliance} />
                  </div>

                  {failedChecks.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {failedChecks.map((c) => (
                        <div
                          key={c.label}
                          className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300"
                        >
                          <div className="font-semibold">
                            {c.label}: {c.finding}
                          </div>
                          <div className="mt-1">Recommended fix: {c.remediation}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Live QA summary */}
        <aside
          className="space-y-4 lg:border-l lg:border-border lg:pl-6"
          aria-label="Live quality assurance summary"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            QA summary, live
          </h3>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-1 text-xs text-muted-foreground">Overall QA score</div>
            <div className="font-mono text-3xl font-bold text-primary">{qaScore}%</div>
            <div className="mt-3">
              <ProgressBar value={qaScore} label="Overall QA score" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Standards alignment</span>
                <span className="font-mono text-xs">
                  {done > 0 ? `${standardsPassed}/${done}` : "not run"}
                </span>
              </div>
              <ProgressBar value={standardsScore} label="Standards alignment score" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Compliance</span>
                <span className="font-mono text-xs">
                  {done > 0 ? `${compliancePassed}/${done}` : "not run"}
                </span>
              </div>
              <ProgressBar value={complianceScore} label="Compliance score" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-xs text-muted-foreground">Checked</div>
              <div className="font-mono text-xl font-semibold">
                {done}
                <span className="text-sm text-muted-foreground">/{ITEMS.length}</span>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-xs text-muted-foreground">Issues found</div>
              <div className="font-mono text-xl font-semibold">{issues.length}</div>
            </div>
          </div>

          {issues.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Issues to resolve</div>
              <ul className="space-y-1.5">
                {issues.map((iss) => (
                  <li
                    key={`${iss.item.id}-${iss.check.label}`}
                    className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs"
                  >
                    <XCircle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600"
                      aria-hidden="true"
                    />
                    <span>
                      <span className="font-medium">{iss.item.title}</span>{" "}
                      <span className="text-muted-foreground">({iss.check.label})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        {!allDone ? (
          <>
            <Button onClick={handleStep} disabled={checking || done >= ITEMS.length}>
              {checking ? "Checking..." : done > 0 ? "Check next item" : "Check first item"}
              {!checking && <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />}
            </Button>
            <Button
              onClick={handleRunAll}
              disabled={checking || done >= ITEMS.length}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Run all checks
            </Button>
            {done > 0 && (
              <Button onClick={handleReset} variant="ghost">
                Reset
              </Button>
            )}
          </>
        ) : (
          <Button onClick={handleReset} variant="outline">
            <RefreshCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Run again
          </Button>
        )}
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}
