import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  Plus,
  RefreshCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useSaveCurriculumDemoSession } from "@workspace/compass-api-client";
import { DemoLeadCapture } from "@/components/public/DemoLeadCapture";
import { STAGES } from "@/lib/stages";
import {
  buildExampleCourse,
  buildTemplateCourse,
  COURSE_TEMPLATES,
  detectVerb,
  evaluateCourse,
  nextDemoId,
  renderQaReportMarkdown,
  DEMO_STANDARDS,
  DEMO_STANDARD_MAP,
  RULE_CATEGORY_LABELS,
  type AssessmentType,
  type CourseTemplateId,
  type DemoAssessment,
  type DemoCourse,
  type DemoObjective,
  type QaFinding,
  type Severity,
} from "@/lib/curriculumRules";

const GRADE_BANDS = [
  "Grades K to 2",
  "Grades 3 to 5",
  "Grades 6 to 8",
  "Grades 9 to 10",
  "Grades 11 to 12",
  "Postsecondary / higher ed",
  "Prelicensure BSN",
  "Workforce / corporate L&D",
  "Continuing education",
];

const STANDARD_FRAMEWORKS = Array.from(
  new Set(DEMO_STANDARDS.map((s) => s.framework)),
);

function scoreColor(score: number): string {
  if (score >= 85) return "text-green-700 dark:text-green-400";
  if (score >= 60) return "text-amber-700 dark:text-amber-400";
  return "text-red-700 dark:text-red-400";
}

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "pass")
    return <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />;
  if (severity === "warn")
    return <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />;
  return <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />;
}

function MeasurabilityBadge({ text }: { text: string }) {
  const d = detectVerb(text);
  if (!text.trim()) return null;
  if (d.kind === "measurable") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Measurable: {d.bloomLevel}
      </span>
    );
  }
  if (d.kind === "vague") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-400">
        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Not measurable: "{d.verb}"
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      No action verb detected
    </span>
  );
}

function Stepper({
  current,
  onSelect,
}: {
  current: number;
  onSelect: (i: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Demo steps">
      {STAGES.map((stage, i) => {
        const active = i === current;
        const done = i < current;
        const Icon = stage.icon;
        return (
          <li key={stage.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={active ? "step" : undefined}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{stage.title}</span>
            </button>
            {i < STAGES.length - 1 && (
              <ArrowRight
                className="h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function CurriculumBuilderDemo() {
  const [course, setCourse] = useState<DemoCourse>(() => buildExampleCourse());
  const [step, setStep] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<CourseTemplateId | null>(
    "healthcare",
  );

  const report = useMemo(() => evaluateCourse(course), [course]);
  const markdown = useMemo(
    () => renderQaReportMarkdown(course, report),
    [course, report],
  );
  const reportHeadingRef = useRef<HTMLHeadingElement>(null);
  const logSession = useSaveCurriculumDemoSession();
  const loggedRef = useRef(false);

  function goTo(i: number) {
    setStep(i);
    setAnnounce(`Step ${i + 1} of ${STAGES.length}: ${STAGES[i].title}.`);
    if (STAGES[i].slug === "qa") {
      window.setTimeout(() => reportHeadingRef.current?.focus(), 60);
      // Count this run once, when the visitor first reaches QA. Best-effort:
      // a failed log never interrupts the demo.
      if (!loggedRef.current) {
        loggedRef.current = true;
        logSession.mutate({
          data: {
            courseTitle: course.title.trim() || undefined,
            gradeBand: course.gradeBand,
            objectiveCount: course.objectives.length,
            assessmentCount: course.assessments.length,
            qaScore: report.score,
            stageReached: "qa",
          },
        });
      }
    }
  }

  function patchCourse(partial: Partial<DemoCourse>) {
    setCourse((c) => ({ ...c, ...partial }));
  }

  function addObjective() {
    setCourse((c) => ({
      ...c,
      objectives: [
        ...c.objectives,
        { id: nextDemoId("obj"), text: "", standardId: null },
      ],
    }));
  }

  function updateObjective(id: string, partial: Partial<DemoObjective>) {
    setCourse((c) => ({
      ...c,
      objectives: c.objectives.map((o) =>
        o.id === id ? { ...o, ...partial } : o,
      ),
    }));
  }

  function removeObjective(id: string) {
    setCourse((c) => ({
      ...c,
      objectives: c.objectives.filter((o) => o.id !== id),
      assessments: c.assessments.map((a) => ({
        ...a,
        objectiveIds: a.objectiveIds.filter((oid) => oid !== id),
      })),
    }));
  }

  function addAssessment() {
    setCourse((c) => ({
      ...c,
      assessments: [
        ...c.assessments,
        {
          id: nextDemoId("asm"),
          title: "",
          type: "formative",
          objectiveIds: [],
        },
      ],
    }));
  }

  function updateAssessment(id: string, partial: Partial<DemoAssessment>) {
    setCourse((c) => ({
      ...c,
      assessments: c.assessments.map((a) =>
        a.id === id ? { ...a, ...partial } : a,
      ),
    }));
  }

  function removeAssessment(id: string) {
    setCourse((c) => ({
      ...c,
      assessments: c.assessments.filter((a) => a.id !== id),
    }));
  }

  function toggleLink(assessmentId: string, objectiveId: string) {
    setCourse((c) => ({
      ...c,
      assessments: c.assessments.map((a) => {
        if (a.id !== assessmentId) return a;
        const has = a.objectiveIds.includes(objectiveId);
        return {
          ...a,
          objectiveIds: has
            ? a.objectiveIds.filter((id) => id !== objectiveId)
            : [...a.objectiveIds, objectiveId],
        };
      }),
    }));
  }

  function loadTemplate(id: CourseTemplateId) {
    setCourse(buildTemplateCourse(id));
    setActiveTemplate(id);
    // A fresh course is a new run, so allow the next QA visit to be counted.
    loggedRef.current = false;
    const template = COURSE_TEMPLATES.find((t) => t.id === id);
    setAnnounce(`Loaded the ${template?.name ?? "example"} template.`);
  }

  function loadExample() {
    loadTemplate(activeTemplate ?? "healthcare");
  }

  function clearAll() {
    setCourse({
      title: "",
      gradeBand: GRADE_BANDS[3],
      termWeeks: null,
      objectives: [{ id: nextDemoId("obj"), text: "", standardId: null }],
      assessments: [],
    });
    setActiveTemplate(null);
    // A fresh course is a new run, so allow the next QA visit to be counted.
    loggedRef.current = false;
    setAnnounce("Cleared the course so you can start from scratch.");
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setAnnounce("Report copied to the clipboard.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setAnnounce("Copy is not available in this browser.");
    }
  }

  function downloadReport() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(course.title || "curriculum").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-qa-report.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setAnnounce("Report downloaded.");
  }

  const slug = STAGES[step].slug;

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-primary">
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Interactive demo
          </div>
          <h3 className="text-2xl font-semibold tracking-tight">
            Build a course, then run real QA on it
          </h3>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={loadExample}>
            <RefreshCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Example
          </Button>
          <Button variant="ghost" size="sm" onClick={clearAll}>
            Start blank
          </Button>
        </div>
      </div>

      <div className="py-5">
        <Stepper current={step} onSelect={goTo} />
      </div>

      {/* Intake */}
      {slug === "intake" && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            {STAGES[0].blurb} Start with the course basics. These fields shape the
            handoff report at the end.
          </p>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">
              Start from a sector template
            </legend>
            <p className="text-sm text-muted-foreground">
              Pick the example closest to your work. Each one loads a real course
              with a few deliberate gaps, so you can watch the QA engine catch and
              fix them.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {COURSE_TEMPLATES.map((t) => {
                const selected = activeTemplate === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => loadTemplate(t.id)}
                    aria-pressed={selected}
                    className={`flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {selected && (
                        <CheckCircle2
                          className="h-4 w-4 text-primary"
                          aria-hidden="true"
                        />
                      )}
                      {t.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.tagline}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="demo-title">Course title</Label>
              <Input
                id="demo-title"
                value={course.title}
                onChange={(e) => patchCourse({ title: e.target.value })}
                placeholder="e.g. Foundations of Data Literacy"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-grade">Audience or level</Label>
              <Select
                value={course.gradeBand}
                onValueChange={(v) => patchCourse({ gradeBand: v })}
              >
                <SelectTrigger id="demo-grade">
                  <SelectValue placeholder="Select an audience or level" />
                </SelectTrigger>
                <SelectContent>
                  {GRADE_BANDS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-weeks">Term length (weeks)</Label>
              <Input
                id="demo-weeks"
                type="number"
                min={1}
                max={52}
                value={course.termWeeks ?? ""}
                onChange={(e) =>
                  patchCourse({
                    termWeeks: e.target.value
                      ? Math.max(1, Math.min(52, parseInt(e.target.value, 10) || 0))
                      : null,
                  })
                }
                placeholder="e.g. 12"
              />
            </div>
          </div>
        </div>
      )}

      {/* Design */}
      {slug === "design" && (
        <div className="space-y-8">
          <p className="text-sm text-muted-foreground">
            {STAGES[1].blurb} Write each outcome as something a learner can do,
            map it to a standard, then add assessments that measure it. The badge
            on each outcome updates live as you type.
          </p>

          {/* Objectives */}
          <section className="space-y-3" aria-label="Learning outcomes">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Learning outcomes
              </h4>
              <Button variant="outline" size="sm" onClick={addObjective}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Add outcome
              </Button>
            </div>
            <ul className="space-y-3">
              {course.objectives.map((o, i) => (
                <li
                  key={o.id}
                  className="space-y-2 rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={`obj-${o.id}`} className="text-xs text-muted-foreground">
                      Outcome {i + 1}
                    </Label>
                    <div className="flex items-center gap-2">
                      <MeasurabilityBadge text={o.text} />
                      <button
                        type="button"
                        onClick={() => removeObjective(o.id)}
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Remove outcome ${i + 1}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <Textarea
                    id={`obj-${o.id}`}
                    value={o.text}
                    rows={2}
                    onChange={(e) => updateObjective(o.id, { text: e.target.value })}
                    placeholder="Students will be able to ..."
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor={`std-${o.id}`} className="text-xs text-muted-foreground">
                      Standard
                    </Label>
                    <Select
                      value={o.standardId ?? "none"}
                      onValueChange={(v) =>
                        updateObjective(o.id, { standardId: v === "none" ? null : v })
                      }
                    >
                      <SelectTrigger id={`std-${o.id}`}>
                        <SelectValue placeholder="Map to a standard" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not mapped</SelectItem>
                        {STANDARD_FRAMEWORKS.map((framework) => (
                          <SelectGroup key={framework}>
                            <SelectLabel>{framework}</SelectLabel>
                            {DEMO_STANDARDS.filter((s) => s.framework === framework).map(
                              (s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.code} - {s.label}
                                </SelectItem>
                              ),
                            )}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    {o.standardId && DEMO_STANDARD_MAP[o.standardId] && (
                      <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        <ClipboardCheck
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        {DEMO_STANDARD_MAP[o.standardId].framework}{" "}
                        {DEMO_STANDARD_MAP[o.standardId].code}
                      </span>
                    )}
                  </div>
                </li>
              ))}
              {course.objectives.length === 0 && (
                <li className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No outcomes yet. Add at least two to design a coherent course.
                </li>
              )}
            </ul>
          </section>

          {/* Assessments */}
          <section className="space-y-3" aria-label="Assessments">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Assessments
              </h4>
              <Button variant="outline" size="sm" onClick={addAssessment}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Add assessment
              </Button>
            </div>
            <ul className="space-y-3">
              {course.assessments.map((a, i) => (
                <li
                  key={a.id}
                  className="space-y-3 rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={`asm-${a.id}`} className="text-xs text-muted-foreground">
                      Assessment {i + 1}
                    </Label>
                    <button
                      type="button"
                      onClick={() => removeAssessment(a.id)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Remove assessment ${i + 1}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                    <Input
                      id={`asm-${a.id}`}
                      value={a.title}
                      onChange={(e) => updateAssessment(a.id, { title: e.target.value })}
                      placeholder="e.g. Unit 1 quiz"
                    />
                    <Select
                      value={a.type}
                      onValueChange={(v) =>
                        updateAssessment(a.id, { type: v as AssessmentType })
                      }
                    >
                      <SelectTrigger aria-label={`Assessment ${i + 1} type`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="formative">Formative</SelectItem>
                        <SelectItem value="summative">Summative</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <fieldset className="space-y-2">
                    <legend className="text-xs text-muted-foreground">
                      Outcomes this measures
                    </legend>
                    {course.objectives.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Add outcomes first, then link them here.
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {course.objectives.map((o, oi) => {
                          const cid = `link-${a.id}-${o.id}`;
                          return (
                            <label
                              key={o.id}
                              htmlFor={cid}
                              className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-xs"
                            >
                              <Checkbox
                                id={cid}
                                checked={a.objectiveIds.includes(o.id)}
                                onCheckedChange={() => toggleLink(a.id, o.id)}
                                className="mt-0.5"
                              />
                              <span className="min-w-0">
                                <span className="font-medium">Outcome {oi + 1}:</span>{" "}
                                <span className="text-muted-foreground">
                                  {o.text.trim() || "Untitled"}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </fieldset>
                </li>
              ))}
              {course.assessments.length === 0 && (
                <li className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No assessments yet. Add at least one and link it to your outcomes.
                </li>
              )}
            </ul>
          </section>
        </div>
      )}

      {/* QA */}
      {slug === "qa" && (
        <QaPanel report={report} headingRef={reportHeadingRef} onFix={() => goTo(1)} />
      )}

      {/* Handoff */}
      {slug === "handoff" && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            {STAGES[3].blurb} Here is the generated handoff report for{" "}
            <span className="font-medium text-foreground">
              {course.title || "your course"}
            </span>
            . Copy or download it, or have our team take it the rest of the way.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={copyReport} variant="outline">
              <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
              {copied ? "Copied" : "Copy report"}
            </Button>
            <Button onClick={downloadReport} variant="outline">
              <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Download .md
            </Button>
          </div>
          <div
            className="max-h-96 overflow-auto rounded-xl border border-border bg-muted/40 p-4"
            tabIndex={0}
            role="region"
            aria-label="Generated handoff report"
          >
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
              {markdown}
            </pre>
          </div>
          <DemoLeadCapture
            demo="curriculum"
            summary={`Course: ${course.title.trim() || "Untitled"}\nAudience or level: ${course.gradeBand}\nOutcomes: ${course.objectives.length}\nAssessments: ${course.assessments.length}\nQA score: ${report.score}%`}
            heading="Join the Curriculum Builder waitlist"
            description="Be first to build, QA, and ship standards-aligned curricula with our team. We save your place and send the course you just built to our specialists."
            benefits={[
              "Priority onboarding when Curriculum Builder opens to new teams",
              "A working session with our specialists on the course you just built",
              "Accreditation-ready QA across CCNE, ACEN, ATD, SHRM, and K-12 frameworks",
            ]}
            submitLabel="Join the waitlist"
            pendingLabel="Joining..."
            successTitle="You are on the waitlist."
            successBody="We saved your place and sent your course summary to our team. We will reach out at the address you provided."
            consentNote="We only use your details to follow up about Curriculum Builder."
          />
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
        <Button
          variant="ghost"
          onClick={() => goTo(Math.max(0, step - 1))}
          disabled={step === 0}
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Back
        </Button>
        {step < STAGES.length - 1 ? (
          <Button onClick={() => goTo(step + 1)}>
            {slug === "design" ? "Run QA" : `Continue to ${STAGES[step + 1].title}`}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              // Starting over begins a new run; count the next QA visit again.
              loggedRef.current = false;
              goTo(0);
            }}
          >
            <RefreshCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Start over
          </Button>
        )}
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}

function QaPanel({
  report,
  headingRef,
  onFix,
}: {
  report: ReturnType<typeof evaluateCourse>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onFix: () => void;
}) {
  const openFindings = report.findings.filter((f) => f.severity !== "pass");
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-4" aria-label="Quality assurance summary">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3
              ref={headingRef}
              tabIndex={-1}
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground outline-none"
            >
              Overall QA score
            </h3>
            <div
              className={`mt-1 font-mono text-4xl font-bold ${scoreColor(report.score)}`}
              aria-live="polite"
            >
              {report.score}%
            </div>
            <div className="mt-3">
              <Progress value={report.score} aria-label="Overall QA score" />
            </div>
            <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
              <span className="text-green-700 dark:text-green-400">
                {report.counts.pass} pass
              </span>
              <span className="text-amber-700 dark:text-amber-400">
                {report.counts.warn} advisory
              </span>
              <span className="text-red-700 dark:text-red-400">
                {report.counts.fail} to fix
              </span>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              By category
            </div>
            {report.categoryScores.map((c) => (
              <div key={c.category} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {RULE_CATEGORY_LABELS[c.category]}
                  </span>
                  <span className="font-mono">{c.score}%</span>
                </div>
                <Progress
                  value={c.score}
                  aria-label={`${RULE_CATEGORY_LABELS[c.category]} score`}
                />
              </div>
            ))}
          </div>

          {report.bloomDistribution.length > 0 && (
            <div className="space-y-2 rounded-xl border border-border bg-card p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cognitive range (Bloom)
              </div>
              <ul className="space-y-1 text-xs">
                {report.bloomDistribution.map((b) => (
                  <li key={b.level} className="flex justify-between">
                    <span className="text-muted-foreground">{b.level}</span>
                    <span className="font-mono">{b.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {openFindings.length === 0
                ? "All checks passed"
                : `${openFindings.length} item${openFindings.length === 1 ? "" : "s"} to review`}
            </h3>
            {openFindings.length > 0 && (
              <Button size="sm" variant="outline" onClick={onFix}>
                <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" /> Back to design
              </Button>
            )}
          </div>
          <ul className="space-y-2">
            {report.findings.map((f: QaFinding) => (
              <li
                key={f.id}
                className={`rounded-lg border p-3 text-sm ${
                  f.severity === "fail"
                    ? "border-red-500/30 bg-red-500/5"
                    : f.severity === "warn"
                      ? "border-amber-500/30 bg-amber-500/5"
                      : "border-border bg-card"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">
                    <SeverityIcon severity={f.severity} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {RULE_CATEGORY_LABELS[f.category]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {f.targetLabel}
                      </span>
                    </div>
                    <div className="mt-0.5">{f.message}</div>
                    {f.remediation && f.severity !== "pass" && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Fix: {f.remediation}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
