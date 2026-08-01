import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Lightbulb, GraduationCap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { activitiesApi } from "@/lib/activitiesApi";
import { apiFetch } from "@/lib/api";

interface MathProblem {
  prompt: string; answer: string; kind: "number" | "text"; min?: number; max?: number; hint?: string;
  visual?: "numberline" | "bar" | "balance";
  bars?: { label: string; units: number }[];
  eq?: { a: number; b: number; c: number };
}
interface CoachMsg { text: string; kind: "hint" | "worked" }

/** Lenient client-side check — mirrors the server's checkMathAnswer. */
function check(student: string, correct: string): boolean {
  const norm = (s: string) => String(s ?? "").toLowerCase().replace(/\s+/g, "").replace(/^[a-z]=/, "").replace(/[.,;]$/, "");
  const a = norm(student), b = norm(correct);
  if (!a) return false;
  if (a === b) return true;
  const na = Number(a.replace(/[^0-9.\-/]/g, "")), nb = Number(b.replace(/[^0-9.\-/]/g, ""));
  return Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 1e-9;
}

/** A draggable number line: click or drag the dot to the value, snapping to whole numbers. */
function NumberLine({ min, max, value, onChange }: { min: number; max: number; value: number | null; onChange: (v: number) => void }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const W = 640, H = 90, padX = 26, y = 52;
  const span = Math.max(1, max - min);
  const step = span <= 20 ? 1 : span <= 60 ? 5 : Math.ceil(span / 12);
  const xOf = (v: number) => padX + ((v - min) / span) * (W - padX * 2);
  const valAt = (clientX: number) => {
    const svg = ref.current; if (!svg) return min;
    const r = svg.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.round(min + ratio * span);
  };
  const ticks: number[] = [];
  for (let v = min; v <= max; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  const [drag, setDrag] = useState(false);
  const set = (clientX: number) => onChange(valAt(clientX));
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full select-none touch-none" style={{ maxHeight: 110 }}
      onPointerDown={(e) => { setDrag(true); set(e.clientX); }}
      onPointerMove={(e) => { if (drag) set(e.clientX); }}
      onPointerUp={() => setDrag(false)} onPointerLeave={() => setDrag(false)}>
      <line x1={padX} y1={y} x2={W - padX} y2={y} stroke="#94a3b8" strokeWidth={4} strokeLinecap="round" />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={xOf(v)} y1={y - 8} x2={xOf(v)} y2={y + 8} stroke="#94a3b8" strokeWidth={2} />
          <text x={xOf(v)} y={y + 26} textAnchor="middle" fontSize={13} fill="#475569">{v}</text>
        </g>
      ))}
      {value != null && (
        <g style={{ cursor: "grab" }}>
          <circle cx={xOf(value)} cy={y} r={15} fill="#4F46E5" stroke="#fff" strokeWidth={3} />
          <text x={xOf(value)} y={y - 22} textAnchor="middle" fontSize={16} fontWeight={800} fill="#4F46E5">{value}</text>
        </g>
      )}
    </svg>
  );
}

/** Tape / bar model for ratios and part-whole. The learner steps the value of each unit; every bar
 *  shows its segments and running total, so they can make the KNOWN bar match the problem, then read
 *  the other bar. Tapping a bar's total uses it as the answer. */
function BarModel({ bars, onPick }: { bars: { label: string; units: number }[]; onPick: (total: number) => void }) {
  const [per, setPer] = useState(1);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <span className="font-semibold">Value of each unit:</span>
        <button className="w-7 h-7 rounded border font-bold" onClick={() => setPer((p) => Math.max(1, p - 1))}>−</button>
        <span className="font-bold text-indigo-700 w-8 text-center">{per}</span>
        <button className="w-7 h-7 rounded border font-bold" onClick={() => setPer((p) => Math.min(50, p + 1))}>+</button>
        <span className="text-xs text-muted-foreground">Make the bar you know match the problem, then read the other.</span>
      </div>
      {bars.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-16 text-sm font-semibold text-right shrink-0">{b.label}</span>
          <div className="flex gap-1 flex-1">
            {Array.from({ length: Math.max(1, Math.min(12, b.units)) }).map((_, j) => (
              <div key={j} className="flex-1 min-w-[26px] h-9 rounded bg-indigo-100 border border-indigo-300 flex items-center justify-center text-xs font-bold text-indigo-700">{per}</div>
            ))}
          </div>
          <button onClick={() => onPick(b.units * per)} className="w-16 text-sm font-black text-emerald-700 hover:underline shrink-0" title="Use as my answer">= {b.units * per}</button>
        </div>
      ))}
    </div>
  );
}

/** Balance scale for a linear equation a·x + b = c. The learner keeps it balanced by doing the same
 *  to both sides (clear the constant, then divide) until one x is left — the right pan then shows x. */
function BalanceScale({ eq, onSolved }: { eq: { a: number; b: number; c: number }; onSolved: (x: number) => void }) {
  const [a, setA] = useState(eq.a);
  const [b, setB] = useState(eq.b);
  const [c, setC] = useState(eq.c);
  useEffect(() => { setA(eq.a); setB(eq.b); setC(eq.c); }, [eq.a, eq.b, eq.c]);
  const solved = a === 1 && b === 0;
  useEffect(() => { if (a === 1 && b === 0) onSolved(c); }, [a, b, c]); // eslint-disable-line
  const clearB = () => { setC(c - b); setB(0); };
  const divide = () => { if (a !== 0 && c % a === 0) { setC(c / a); setA(1); } };
  const eqText = `${a === 1 ? "" : a}x${b === 0 ? "" : b > 0 ? " + " + b : " − " + Math.abs(b)} = ${c}`;
  const cap = (n: number) => Math.min(Math.abs(n), 20);
  const Pan = ({ children }: { children: React.ReactNode }) => (
    <div className="flex-1 min-h-[68px] rounded-xl border-2 border-slate-300 bg-white/70 p-2 flex flex-wrap gap-1 items-center justify-center">{children}</div>
  );
  const tile = (key: string, label: string, cls: string) => <div key={key} className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold ${cls}`}>{label}</div>;
  return (
    <div className="space-y-2">
      <div className="text-center font-mono font-bold text-lg text-indigo-800">{eqText}</div>
      <div className="flex items-stretch gap-3">
        <Pan>
          {Array.from({ length: Math.max(0, a) }).map((_, i) => tile("x" + i, "x", "bg-indigo-500 text-white"))}
          {Array.from({ length: cap(b) }).map((_, i) => tile("b" + i, b < 0 ? "−1" : "1", b < 0 ? "bg-red-200 text-red-700" : "bg-amber-200 text-amber-800"))}
        </Pan>
        <div className="self-center text-2xl font-black text-slate-400">=</div>
        <Pan>
          {Array.from({ length: cap(c) }).map((_, i) => tile("c" + i, "1", "bg-emerald-200 text-emerald-800"))}
          {Math.abs(c) > 20 && <span className="text-xs font-bold text-emerald-800">= {c}</span>}
        </Pan>
      </div>
      <div className="flex gap-2 flex-wrap justify-center">
        {b !== 0 && <Button size="sm" variant="outline" onClick={clearB}>{b > 0 ? `Subtract ${b} from both sides` : `Add ${Math.abs(b)} to both sides`}</Button>}
        {b === 0 && a !== 1 && <Button size="sm" variant="outline" onClick={divide}>Divide both sides by {a}</Button>}
        {solved && <span className="text-emerald-700 font-bold self-center">x = {c} 🎉</span>}
      </div>
    </div>
  );
}

/** Interactive, coach-assisted math practice. Renders each problem with a visual (number line) plus a
 *  typed input, checks the answer, and — when the learner is stuck — asks the Socratic coach for a
 *  hint that never reveals the answer, escalating to a worked example. */
export function MathCoach({ params }: { params: { activityId: string } }) {
  const id = params.activityId;
  const [, setLocation] = useLocation();
  const { data: activity, isLoading, error } = useQuery({ queryKey: ["activity", id], queryFn: () => activitiesApi.get(id) });

  const problems: MathProblem[] = useMemo(() => {
    try { const j = JSON.parse((activity?.html as string) || "{}"); return Array.isArray(j.problems) ? j.problems : []; } catch { return []; }
  }, [activity]);
  const grade = useMemo(() => (activity?.tags ?? []).find((t) => /^grade|K–2|Grades/i.test(t)) || "a middle-school", [activity]);

  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [lineVal, setLineVal] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [solvedFlags, setSolvedFlags] = useState<boolean[]>([]);
  const [coach, setCoach] = useState<CoachMsg[]>([]);
  const [coachBusy, setCoachBusy] = useState(false);
  const [offerWorked, setOfferWorked] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [finished, setFinished] = useState(false);

  const p = problems[idx];
  const current = p?.kind === "number" && lineVal != null ? String(lineVal) : typed;

  const resetForNext = () => { setTyped(""); setLineVal(null); setAttempts(0); setCoach([]); setOfferWorked(false); setFeedback(null); };

  const nextProblem = (wasCorrect: boolean) => {
    const flags = solvedFlags.slice(); flags[idx] = wasCorrect; setSolvedFlags(flags);
    if (idx + 1 >= problems.length) {
      const correct = flags.filter(Boolean).length;
      const score = Math.round((correct / problems.length) * 100);
      activitiesApi.submit(id, { solved: flags }, score).catch(() => {});
      setFinished(true);
    } else { setIdx(idx + 1); resetForNext(); }
  };

  const submit = () => {
    if (!p || !current) { setFeedback({ ok: false, msg: "Enter an answer first." }); return; }
    if (check(current, p.answer)) {
      setFeedback({ ok: true, msg: "Correct! 🎉" });
      setTimeout(() => nextProblem(true), 900);
    } else {
      const n = attempts + 1; setAttempts(n);
      setFeedback({ ok: false, msg: n >= 3 ? "Not yet — want a worked example?" : "Not quite — try again, or ask the coach." });
      if (n >= 3) setOfferWorked(true);
    }
  };

  const askCoach = async () => {
    if (!p) return;
    setCoachBusy(true);
    try {
      const r = await apiFetch<{ hint: string; offerWorkedExample: boolean }>("/math-coach/hint", { method: "POST", body: JSON.stringify({ problem: p.prompt, answer: p.answer, studentAnswer: current || undefined, attempts: Math.max(1, attempts), grade }) });
      setCoach((c) => [...c, { text: r.hint, kind: "hint" }]);
      if (r.offerWorkedExample) setOfferWorked(true);
    } catch { setCoach((c) => [...c, { text: "Take it one step at a time — what could you do first?", kind: "hint" }]); }
    finally { setCoachBusy(false); }
  };

  const showWorked = async () => {
    if (!p) return;
    setCoachBusy(true); setOfferWorked(false);
    try {
      const r = await apiFetch<{ intro: string; steps: { heading: string; detail: string }[]; tryAgain: string }>("/math-coach/worked-example", { method: "POST", body: JSON.stringify({ problem: p.prompt, answer: p.answer, grade }) });
      const body = r.intro + "\n" + r.steps.map((s) => `• ${s.heading}: ${s.detail}`).join("\n") + "\n" + r.tryAgain;
      setCoach((c) => [...c, { text: body, kind: "worked" }]);
    } catch { setCoach((c) => [...c, { text: "Let's break it into small steps and try again together.", kind: "worked" }]); }
    finally { setCoachBusy(false); }
  };

  if (isLoading) return <div className="min-h-[100dvh] grid place-items-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (error || !activity || problems.length === 0) return (
    <div className="min-h-[100dvh] grid place-items-center p-6 text-center">
      <div><p className="text-red-600 mb-3">This math activity could not be loaded.</p><Button onClick={() => setLocation("/dashboard")}>Back</Button></div>
    </div>
  );

  const solvedCount = solvedFlags.filter(Boolean).length;

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-indigo-50 to-white">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => history.length > 1 ? history.back() : setLocation("/dashboard")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <span className="font-medium truncate">{activity.title}</span>
          <span className="ml-auto text-sm text-muted-foreground">{finished ? problems.length : idx + 1}/{problems.length}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {finished ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
            <h2 className="text-2xl font-bold mb-1">Nice work!</h2>
            <p className="text-muted-foreground">You solved <strong>{solvedCount}</strong> of {problems.length}. The coach is proud of you! 🎉</p>
            <Button className="mt-5" onClick={() => setLocation("/dashboard")}>Done <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-5 gap-4">
            <div className="md:col-span-3 space-y-4">
              <div className="rounded-2xl bg-white border shadow-sm p-5">
                <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">Problem {idx + 1}</div>
                <p className="text-xl font-semibold">{p.prompt}</p>

                {p.visual === "balance" && p.eq ? (
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground mb-1">Keep it balanced — do the same to both sides until one x is left, then read its value.</p>
                    <BalanceScale eq={p.eq} onSolved={(x) => { setTyped(String(x)); setLineVal(null); }} />
                  </div>
                ) : p.visual === "bar" && p.bars && p.bars.length ? (
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground mb-1">Use the bar model to reason it out, then tap a total or type your answer.</p>
                    <BarModel bars={p.bars} onPick={(v) => { setTyped(String(v)); setLineVal(null); }} />
                  </div>
                ) : p.kind === "number" && typeof p.min === "number" && typeof p.max === "number" ? (
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground mb-1">Drag the dot to your answer, or type it below.</p>
                    <NumberLine min={p.min} max={p.max} value={lineVal} onChange={(v) => { setLineVal(v); setTyped(String(v)); }} />
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <input value={typed} onChange={(e) => { setTyped(e.target.value); const n = Number(e.target.value); setLineVal(Number.isFinite(n) && e.target.value.trim() !== "" ? n : null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="Your answer" className="rounded-xl border-2 border-indigo-200 px-3 py-2 text-lg w-40 focus:border-indigo-500 outline-none" />
                  <Button onClick={submit}>Check</Button>
                  {feedback && <span className={`text-sm font-semibold ${feedback.ok ? "text-emerald-700" : "text-amber-700"}`}>{feedback.msg}</span>}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="gap-1.5 border-amber-400/50 text-amber-700" disabled={coachBusy} onClick={askCoach}>
                  {coachBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />} Ask the coach
                </Button>
                {offerWorked && (
                  <Button variant="outline" className="gap-1.5 border-indigo-400/50 text-indigo-700" disabled={coachBusy} onClick={showWorked}>
                    <GraduationCap className="h-4 w-4" /> Show a worked example
                  </Button>
                )}
                {attempts > 0 && !feedback?.ok && (
                  <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setTyped(""); setLineVal(null); setFeedback(null); }}><RefreshCw className="h-3.5 w-3.5" /> Clear</Button>
                )}
              </div>
            </div>

            <div className="md:col-span-2">
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 h-full">
                <div className="flex items-center gap-2 font-bold text-amber-800 mb-2"><Lightbulb className="h-4 w-4" /> Your coach</div>
                {coach.length === 0 ? (
                  <p className="text-sm text-amber-800/80">Stuck? Tap <b>Ask the coach</b>. I'll help you figure it out with questions — I won't just give you the answer. 😊</p>
                ) : (
                  <div className="space-y-2">
                    {coach.map((m, i) => (
                      <div key={i} className={`text-sm rounded-xl px-3 py-2 whitespace-pre-line ${m.kind === "worked" ? "bg-white border border-indigo-200" : "bg-white/70"}`}>{m.text}</div>
                    ))}
                    {coachBusy && <div className="text-xs text-amber-700 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> thinking…</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
