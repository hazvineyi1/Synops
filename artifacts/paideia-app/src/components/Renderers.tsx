import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { LessonPlanContent, WorksheetContent, ParentDraftContent, QuizContent } from "@/lib/types";

/**
 * The interactive answer control shown in "Student view". It mirrors exactly what a student
 * sees on the real take page (PublicTake): radios for multiple choice and true/false, a text
 * box for short answers, a textarea for long ones. Local state only: this is a live preview,
 * real submission and auto-grading happen once the resource is assigned to a class.
 */
function InteractiveAnswer({
  type,
  options,
  value,
  name,
  onChange,
}: {
  type: string;
  options?: string[] | null;
  value: string;
  name: string;
  onChange: (v: string) => void;
}) {
  if (type === "multiple_choice" && options && options.length > 0) {
    return (
      <div className="space-y-2 mt-1">
        {options.map((opt, i) => (
          <label key={i} className="flex items-center gap-2 cursor-pointer p-2 rounded border hover:bg-secondary/40">
            <input type="radio" name={name} value={opt} checked={value === opt} onChange={() => onChange(opt)} />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    );
  }
  if (type === "true_false") {
    return (
      <div className="flex gap-3 mt-1">
        {["True", "False"].map((v) => (
          <label key={v} className="flex items-center gap-2 cursor-pointer p-2 rounded border flex-1 justify-center hover:bg-secondary/40">
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
            {v}
          </label>
        ))}
      </div>
    );
  }
  if (type === "long") {
    return <Textarea className="mt-1" rows={4} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Your answer" />;
  }
  return <Input className="mt-1" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Your answer" />;
}

function PreviewHint() {
  return (
    <p className="mb-4 text-xs text-muted-foreground bg-secondary/40 border rounded px-3 py-2">
      Interactive preview. Students get this exact experience when you assign it to a class, and their answers are then auto-graded.
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h3 className="font-serif text-xl text-primary mb-3">{title}</h3>
      {children}
    </section>
  );
}

export function LessonPlanView({ c, studentView = false }: { c: LessonPlanContent; studentView?: boolean }) {
  return (
    <div>
      {c.summary && <p className="text-muted-foreground italic mb-8">{c.summary}</p>}

      <Section title={studentView ? "What we are learning" : "Learning objectives"}>
        <ul className="list-disc pl-5 space-y-1">{c.learningObjectives?.map((o, i) => <li key={i}>{o}</li>)}</ul>
      </Section>

      {c.successCriteria?.length > 0 && (
        <Section title={studentView ? "How I will know I have got it" : "Success criteria"}>
          <ul className="list-disc pl-5 space-y-1">{c.successCriteria.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </Section>
      )}

      <Section title={studentView ? "Warm up" : `Starter · ${c.starter?.durationMinutes ?? "?"} min`}>
        <p>{c.starter?.activity}</p>
      </Section>

      <Section title={studentView ? "Today's work" : `Main task · ${c.mainTask?.durationMinutes ?? "?"} min`}>
        <div className="space-y-4">
          <div className="bg-secondary/50 rounded-md p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Core</div>
            <p>{c.mainTask?.core}</p>
          </div>
          <div className="bg-secondary/50 rounded-md p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{studentView ? "If you need a hand" : "Support"}</div>
            <p>{c.mainTask?.support}</p>
          </div>
          <div className="bg-secondary/50 rounded-md p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{studentView ? "Ready for more" : "Stretch"}</div>
            <p>{c.mainTask?.stretch}</p>
          </div>
        </div>
      </Section>

      {!studentView && (
        <Section title={`Mini-plenary · ${c.miniPlenary?.durationMinutes ?? "?"} min`}>
          <p>{c.miniPlenary?.activity}</p>
        </Section>
      )}

      <Section title={studentView ? "Before you leave" : "Exit ticket"}>
        <p className="font-medium mb-2">{c.exitTicket?.prompt}</p>
        {!studentView && (
          <p className="text-sm text-muted-foreground"><span className="font-medium">Expected response: </span>{c.exitTicket?.expectedResponse}</p>
        )}
      </Section>

      {!studentView && c.commonMisconceptions?.length > 0 && (
        <Section title="Common misconceptions">
          <ul className="list-disc pl-5 space-y-1">{c.commonMisconceptions.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </Section>
      )}

      {!studentView && c.resourcesNeeded?.length > 0 && (
        <Section title="Resources needed">
          <ul className="list-disc pl-5 space-y-1">{c.resourcesNeeded.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </Section>
      )}

      {c.homeworkSuggestion && (
        <Section title={studentView ? "Homework" : "Homework suggestion"}>
          <p>{c.homeworkSuggestion}</p>
        </Section>
      )}
    </div>
  );
}

export function WorksheetView({ c, studentView = false }: { c: WorksheetContent; studentView?: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const set = (n: number, v: string) => setAnswers((a) => ({ ...a, [String(n)]: v }));
  return (
    <div>
      {studentView && <PreviewHint />}
      {c.instructions && (
        <div className="bg-secondary/50 border rounded-md p-4 mb-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Instructions</div>
          <p>{c.instructions}</p>
        </div>
      )}
      <ol className="space-y-6">
        {c.questions?.map((q) => (
          <li key={q.number} className="border-l-2 border-primary/30 pl-4">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-serif text-lg text-primary">Q{q.number}.</span>
              <span className="font-medium">{q.prompt}</span>
            </div>
            {studentView ? (
              <InteractiveAnswer
                type={q.type}
                options={q.options}
                name={`ws-${q.number}`}
                value={answers[String(q.number)] ?? ""}
                onChange={(v) => set(q.number, v)}
              />
            ) : (
              <>
                {q.type === "multiple_choice" && q.options && (
                  <ul className="ml-4 mb-2 space-y-1 text-sm">
                    {q.options.map((opt, i) => <li key={i}>· {opt}</li>)}
                  </ul>
                )}
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-primary">Show answer</summary>
                  <div className="mt-2 pl-3 border-l border-accent">
                    <p className="font-medium">Answer: {q.answer}</p>
                    {q.workingOrRubric && <p className="text-muted-foreground mt-1">{q.workingOrRubric}</p>}
                  </div>
                </details>
              </>
            )}
          </li>
        ))}
      </ol>
      {!studentView && c.teacherNotes && (
        <div className="mt-8 bg-secondary/50 border rounded-md p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Teacher notes</div>
          <p className="text-sm">{c.teacherNotes}</p>
        </div>
      )}
    </div>
  );
}

export function ParentDraftView({ c }: { c: ParentDraftContent }) {
  return (
    <div className="max-w-2xl mx-auto bg-white border rounded-lg p-8 print-page">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Subject</div>
      <p className="font-medium mb-6">{c.subject}</p>
      <p className="mb-4">{c.greeting}</p>
      {c.paragraphs?.map((p, i) => <p key={i} className="mb-4 leading-relaxed">{p}</p>)}
      <p className="mb-2">{c.closing}</p>
      <p>{c.signature}</p>
    </div>
  );
}

export function QuizView({ c, studentView = false }: { c: QuizContent; studentView?: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const set = (n: number, v: string) => setAnswers((a) => ({ ...a, [String(n)]: v }));
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{c.format}</div>
      {studentView && <PreviewHint />}
      {c.instructions && (
        <div className="bg-secondary/50 border rounded-md p-4 mb-6">
          <p>{c.instructions}</p>
        </div>
      )}
      <ol className="space-y-6">
        {c.items?.map((q) => (
          <li key={q.number} className="border-l-2 border-primary/30 pl-4">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-serif text-lg text-primary">{q.number}.</span>
              <span className="font-medium">{q.prompt}</span>
              {!studentView && (
                <span className="ml-auto text-xs uppercase tracking-wider text-muted-foreground">{q.difficulty}</span>
              )}
            </div>
            {studentView ? (
              <InteractiveAnswer
                type={q.type}
                options={q.options}
                name={`qz-${q.number}`}
                value={answers[String(q.number)] ?? ""}
                onChange={(v) => set(q.number, v)}
              />
            ) : (
              <>
                {q.type === "multiple_choice" && q.options && (
                  <ul className="ml-4 mb-2 space-y-1 text-sm">
                    {q.options.map((opt, i) => <li key={i}>· {opt}</li>)}
                  </ul>
                )}
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-primary">Show answer</summary>
                  <div className="mt-2 pl-3 border-l border-accent">
                    <p className="font-medium">Correct: {q.correctAnswer}</p>
                    <p className="text-muted-foreground mt-1 text-xs">Skill: {q.skillAssessed}</p>
                  </div>
                </details>
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
