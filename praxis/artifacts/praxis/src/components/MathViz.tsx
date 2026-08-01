import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Shared visual math manipulatives used by both the solo Math Coach page and live multiplayer.
 * Keeping them here avoids duplicating the number line, bar model and balance scale.
 */
export interface MathProblem {
  prompt: string; answer: string; kind: "number" | "text"; min?: number; max?: number; hint?: string;
  visual?: "numberline" | "bar" | "balance";
  bars?: { label: string; units: number }[];
  eq?: { a: number; b: number; c: number };
}

/** Lenient answer check — mirrors the server's checkMathAnswer. */
export function check(student: string, correct: string): boolean {
  const norm = (s: string) => String(s ?? "").toLowerCase().replace(/\s+/g, "").replace(/^[a-z]=/, "").replace(/[.,;]$/, "");
  const a = norm(student), b = norm(correct);
  if (!a) return false;
  if (a === b) return true;
  const na = Number(a.replace(/[^0-9.\-/]/g, "")), nb = Number(b.replace(/[^0-9.\-/]/g, ""));
  return Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 1e-9;
}

/** A draggable number line: click or drag the dot to the value, snapping to whole numbers. */
export function NumberLine({ min, max, value, onChange }: { min: number; max: number; value: number | null; onChange: (v: number) => void }) {
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

/** Tape / bar model for ratios and part-whole. */
export function BarModel({ bars, onPick }: { bars: { label: string; units: number }[]; onPick: (total: number) => void }) {
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

/** Balance scale for a linear equation a·x + b = c. */
export function BalanceScale({ eq, onSolved }: { eq: { a: number; b: number; c: number }; onSolved: (x: number) => void }) {
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
