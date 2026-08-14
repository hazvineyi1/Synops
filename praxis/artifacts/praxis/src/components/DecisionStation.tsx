/*
 * =============================================================================
 * DecisionStation, native, spec-driven runtime for justice-sector "stations"
 * =============================================================================
 * A Decision Station is a task-first rehearsal: a sequence of lessons, each
 * opening with a decision under realistic constraints, where poor decisions
 * produce consequences that persist, and the station result is COMPUTED from
 * the decisions taken (never a bolt-on quiz).
 *
 * This is the platform-native replacement for the bespoke DemoPEJ pages: an
 * instructional designer authors a StationSpec (stored as interactive_activities.spec),
 * and this component renders it. It is rendered by branching on
 * activity.kind === "decision_station" at the call sites (ModuleViewer inline,
 * ActivityPlay full-screen), the sandboxed HTML ActivityPlayer is untouched.
 *
 * Interaction types supported (build-prompt Part E):
 *   routing, routing decision per item (all items at once)
 *   branching, branching decision beat (live interaction; consequence persists)
 *   select, field/component selection (build a compliant product)
 *   chainAudit, discriminate one defect inside competent work
 *   matching, choose between mutually exclusive mechanisms
 *   socratic, Socratic checkpoint (authored model answer; AI probe optional)
 *   artifact, the Does artifact, assembled from prior decisions
 * A computed station-result step is appended automatically.
 *
 * AI boundary: the only model call is the Socratic probing question, constrained
 * and degrading to an authored fallback. The model answer is authored in the spec.
 * =============================================================================
 */

import React, { useState, useRef, useEffect } from "react";

/* ----------------------------------------------------------------- spec types */
export type Quality = "sound" | "partly" | "not";
export type Band = "A" | "B" | "C" | "D" | "E" | "F";
export type Stream = "Skills" | "Application of procedure or law";

export interface Authority { ref: string; note: string; status: "stable" | "confirm" | "practice"; }
export interface Indicators { competent: string; not: string; }
export interface Criterion { key: string; label: string; stream: Stream; nonNegotiable: boolean; indicators: Indicators; }

export interface Consequence { [k: string]: string | boolean | number; }

export interface OptionBase {
  quality: Quality; crit?: string | null; band: Band;
  effect?: Consequence; response: string; feedback: string;
}
export interface RoutingOption extends OptionBase { key: string; label: string; }
export interface RoutingItem { id: string; label: string; options: RoutingOption[]; }
export interface RoutingLesson {
  type: "routing"; n: string; title: string; typeLabel: string; intro: string;
  items: RoutingItem[]; authorities?: string[]; carryBreachKey?: string; carryOk?: string; carryBreach?: string;
  /** Optional aggregate scoring across all items (one criterion computed from the set of choices),
   *  instead of per-option `crit`. Any chosen option whose effect sets `overreachEffectKey` fails to E. */
  aggregate?: { crit: string; overreachEffectKey?: string };
}

export interface Move extends OptionBase { id: string; label: string; }
export interface BranchingLesson {
  type: "branching"; n: string; title: string; typeLabel: string; stage: string; constraint: string;
  theory: string; authorities?: string[]; moves: Move[]; ariaLabel?: string;
}

export interface SelectComponent { id: string; label: string; correct: boolean; trap?: boolean; note: string; }
export interface SelectLesson {
  type: "select"; n: string; title: string; typeLabel: string; intro: string; submitLabel: string;
  components: SelectComponent[]; authorities?: string[];
  scoring: {
    crit: string; requireIds: string[]; passEffect?: Consequence; trapEffectKey?: string;
    referralCrit?: string; referralId?: string;
    /** Optional 3-state world field set from the outcome (for the artifact), e.g. consent. */
    stateKey?: string; stateOnPass?: string; stateOnTrap?: string; stateOnPartial?: string;
  };
  carry: string;
}

export interface ChainStep { id: number; text: string; defect: boolean; why?: string; }
export interface ChainLesson {
  type: "chainAudit"; n: string; title: string; typeLabel: string; stage: string; constraint: string;
  steps: ChainStep[]; authorities?: string[]; crit: string; secondCrit?: string;
  decoyId?: number; decoyNote?: string; effectKey?: string; carryGood: string; carryBad: string; commitLabel: string;
}

export interface MatchOption extends OptionBase { id: string; label: string; }
export interface MatchingLesson {
  type: "matching"; n: string; title: string; typeLabel: string; stage: string; constraint: string;
  options: MatchOption[]; authorities?: string[]; crit: string; carryGood: string; carryBad: string; commitLabel: string;
}

export interface SocraticLesson {
  type: "socratic"; n?: string; title?: string; typeLabel?: string; prompt: string;
  authoredProbe: string; modelReasoning: string; note: string;
}

export interface ArtifactLine {
  from: string;
  cases: Record<string, { txt: string; flag: boolean }>;
  default?: { txt: string; flag: boolean };
}
export interface ArtifactLesson {
  type: "artifact"; n: string; title: string; typeLabel: string; intro: string;
  docTitle: string; docSub: string; lines: ArtifactLine[]; ackLabel: string; ackCrit?: string;
}

export type Lesson = RoutingLesson | BranchingLesson | SelectLesson | ChainLesson | MatchingLesson | SocraticLesson | ArtifactLesson;

export interface AlignmentRow { o: string; tested: string; success: string; why: string; }
export interface StationSpec {
  meta: { code: string; module: string; title: string; version: string; smeStatus: string; task: string; };
  warning?: { title: string; body: string[]; startLabel: string };
  authorities: Record<string, Authority>;
  reviewTriggers?: string[];
  criteria: Criterion[];
  lessons: Lesson[];
  alignment?: AlignmentRow[];
  jobAid?: { heading: string; items: string[]; footer: string };
  nonNegotiableNote?: string;
}

/* ----------------------------------------------------------------- constants */
const BAND_VALUE: Record<Band, number> = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
type World = Record<string, string | boolean | number>;
type Rec = Record<string, Band>;

/* ----------------------------------------------------------------- helpers */
function StatusTag({ status }: { status: Authority["status"] }) {
  const map = { stable: { t: "verified · stable", c: "ok" }, confirm: { t: "SIGN-OFF PENDING · confirm", c: "warn" }, practice: { t: "practice layer · SME", c: "warn" } } as const;
  const m = map[status] || map.confirm;
  return <span className={`ds-tag ds-tag-${m.c}`}>{m.t}</span>;
}
function Authorities({ keys, dict }: { keys?: string[]; dict: Record<string, Authority> }) {
  if (!keys || !keys.length) return null;
  return (
    <div className="ds-auth" aria-label="Source authorities for this lesson">
      <span className="ds-auth-h">Authorities</span>
      <ul>{keys.map((k) => { const a = dict[k]; if (!a) return null; return (<li key={k}><span className="ds-auth-ref">{a.ref}</span> <StatusTag status={a.status} /><span className="ds-auth-note">, {a.note}</span></li>); })}</ul>
    </div>
  );
}
function QGlyph({ q }: { q: Quality }) { return <span className={"ds-glyph ds-q-" + q} aria-hidden="true">{q === "sound" ? "●" : q === "partly" ? "◐" : "▲"}</span>; }
const qword = (q: Quality) => (q === "sound" ? "Sound" : q === "partly" ? "Partly sound" : "Not sound");
function SceneHead({ n, title, type, children }: { n: string; title: string; type: string; children: React.ReactNode }) {
  return (<div className="ds-scene-head"><div className="ds-scene-tags"><span className="ds-scene-n">{n}</span><span className="ds-scene-type">{type}</span></div><h2 className="ds-scene-title">{title}</h2><p className="ds-serif ds-scene-body">{children}</p></div>);
}

/* ----------------------------------------------------------------- lessons */
function RoutingView({ l, dict, apply, score, onDone }: { l: RoutingLesson; dict: Record<string, Authority>; apply: (e?: Consequence) => void; score: (c: string | null | undefined, b: Band) => void; onDone: () => void; }) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [breach, setBreach] = useState(false);
  const decideAll = l.items.every((it) => choices[it.id]);
  const commit = (itemId: string, key: string) => {
    if (choices[itemId]) return;
    const opt = l.items.find((x) => x.id === itemId)!.options.find((o) => o.key === key)!;
    setChoices((c) => ({ ...c, [itemId]: key }));
    apply(opt.effect);
    if (opt.crit) score(opt.crit, opt.band);
    if (l.carryBreachKey && opt.effect && opt.effect[l.carryBreachKey]) setBreach(true);
  };
  const finish = () => {
    if (l.aggregate) {
      const chosen = l.items.map((it) => it.options.find((o) => o.key === choices[it.id])!);
      const overreach = l.aggregate.overreachEffectKey
        ? chosen.some((o) => o.effect && o.effect[l.aggregate!.overreachEffectKey!])
        : false;
      let band: Band = "A";
      if (overreach) band = "E";
      else { const mv = chosen.reduce((a, o) => a + BAND_VALUE[o.band], 0) / chosen.length; band = mv >= 4.5 ? "A" : mv >= 3.5 ? "B" : "C"; }
      score(l.aggregate.crit, band);
    }
    onDone();
  };
  return (
    <section className="ds-card">
      <SceneHead n={l.n} title={l.title} type={l.typeLabel}>{l.intro}</SceneHead>
      <div className="ds-items">
        {l.items.map((it) => {
          const chosen = choices[it.id];
          const opt = chosen ? it.options.find((o) => o.key === chosen)! : null;
          return (
            <div key={it.id} className={"ds-item " + (chosen ? "ds-resolved" : "")}>
              <div className="ds-item-label">{it.label}</div>
              {!chosen && <div className="ds-opts" role="group" aria-label={"Action for: " + it.label}>{it.options.map((o) => (<button key={o.key} className="ds-opt" onClick={() => commit(it.id, o.key)}>{o.label}</button>))}</div>}
              {chosen && opt && (<div className={"ds-outcome ds-q-" + opt.quality}><div className="ds-outcome-h"><QGlyph q={opt.quality} /> {qword(opt.quality)}</div><p className="ds-serif">{opt.response}</p><p className="ds-fb"><strong>Rule:</strong> {opt.feedback}</p></div>)}
            </div>
          );
        })}
      </div>
      <Authorities keys={l.authorities} dict={dict} />
      {decideAll && (<div className="ds-row"><p className="ds-carry">{breach ? (l.carryBreach || "") : (l.carryOk || "")}</p><button className="ds-btn" onClick={finish}>Continue →</button></div>)}
    </section>
  );
}

function BranchingView({ l, dict, apply, score, onDone }: { l: BranchingLesson; dict: Record<string, Authority>; apply: (e?: Consequence) => void; score: (c: string | null | undefined, b: Band) => void; onDone: () => void; }) {
  const [chosen, setChosen] = useState<Move | null>(null);
  const commit = (m: Move) => { if (chosen) return; setChosen(m); apply(m.effect); if (m.crit) score(m.crit, m.band); };
  return (
    <section className="ds-card">
      <SceneHead n={l.n} title={l.title} type={l.typeLabel}>{l.stage}</SceneHead>
      <p className="ds-constraint"><strong>What is scarce:</strong> {l.constraint}</p>
      {!chosen ? (<div className="ds-moves" role="group" aria-label={l.ariaLabel || "Your move"}>{l.moves.map((m) => (<button key={m.id} className="ds-move" onClick={() => commit(m)}>{m.label}</button>))}</div>)
        : (<div className={"ds-outcome ds-q-" + chosen.quality}><div className="ds-outcome-h"><QGlyph q={chosen.quality} /> {qword(chosen.quality)}</div><p className="ds-serif">{chosen.response}</p><p className="ds-fb"><strong>Rule:</strong> {chosen.feedback}</p><p className="ds-theory"><strong>Why:</strong> {l.theory}</p></div>)}
      <Authorities keys={l.authorities} dict={dict} />
      {chosen && (<div className="ds-row"><button className="ds-btn" onClick={onDone}>Continue →</button></div>)}
    </section>
  );
}

function SelectView({ l, dict, apply, score, onDone }: { l: SelectLesson; dict: Record<string, Authority>; apply: (e?: Consequence) => void; score: (c: string | null | undefined, b: Band) => void; onDone: () => void; }) {
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const toggle = (id: string) => { if (!submitted) setPicked((p) => ({ ...p, [id]: !p[id] })); };
  const submit = () => {
    setSubmitted(true);
    const trap = l.components.some((c) => c.trap && picked[c.id]);
    const gotAll = l.scoring.requireIds.every((id) => picked[id]);
    const gotCount = l.scoring.requireIds.filter((id) => picked[id]).length;
    let band: Band = "A";
    if (trap || gotCount === 0) band = "E";
    else if (!gotAll) band = gotCount >= Math.max(1, l.scoring.requireIds.length - 1) ? "C" : "E";
    score(l.scoring.crit, band);
    const eff: Consequence = {};
    if (l.scoring.trapEffectKey) eff[l.scoring.trapEffectKey] = trap;
    if (!trap && gotAll && l.scoring.passEffect) Object.assign(eff, l.scoring.passEffect);
    if (l.scoring.stateKey) eff[l.scoring.stateKey] = trap ? (l.scoring.stateOnTrap ?? "") : gotAll ? (l.scoring.stateOnPass ?? "") : (l.scoring.stateOnPartial ?? "");
    if (l.scoring.referralId) eff["referralOffered"] = !!picked[l.scoring.referralId];
    apply(eff);
    if (l.scoring.referralCrit && l.scoring.referralId) score(l.scoring.referralCrit, picked[l.scoring.referralId] ? "A" : "E");
  };
  return (
    <section className="ds-card">
      <SceneHead n={l.n} title={l.title} type={l.typeLabel}>{l.intro}</SceneHead>
      <div className="ds-checks">
        {l.components.map((c) => (
          <label key={c.id} className={"ds-check " + (submitted ? (c.correct ? "ds-good" : (picked[c.id] ? "ds-bad" : "ds-muted")) : "")}>
            <input type="checkbox" checked={!!picked[c.id]} onChange={() => toggle(c.id)} disabled={submitted} />
            <span className="ds-check-box" aria-hidden="true">{picked[c.id] ? "✓" : ""}</span>
            <span className="ds-check-label">{c.label}{submitted && (<span className="ds-check-note">, {c.correct ? "Belongs. " : (c.trap ? "Trap. " : "Not required. ")}{c.note}</span>)}</span>
          </label>
        ))}
      </div>
      <Authorities keys={l.authorities} dict={dict} />
      {!submitted ? (<div className="ds-row"><button className="ds-btn" onClick={submit} disabled={Object.values(picked).every((v) => !v)}>{l.submitLabel}</button></div>)
        : (<div className="ds-row"><p className="ds-carry">{l.carry}</p><button className="ds-btn" onClick={onDone}>Continue →</button></div>)}
    </section>
  );
}

function ChainView({ l, dict, apply, score, onDone }: { l: ChainLesson; dict: Record<string, Authority>; apply: (e?: Consequence) => void; score: (c: string | null | undefined, b: Band) => void; onDone: () => void; }) {
  const [pick, setPick] = useState<number | null>(null);
  const [committed, setCommitted] = useState(false);
  const commit = () => {
    if (pick == null) return;
    setCommitted(true);
    const step = l.steps.find((s) => s.id === pick)!;
    const band: Band = step.defect ? "A" : (pick === l.decoyId ? "C" : "E");
    if (l.effectKey) apply({ [l.effectKey]: step.defect ? "caught" : "missed" });
    score(l.crit, band);
    if (l.secondCrit) score(l.secondCrit, step.defect ? "A" : "E");
  };
  const chosen = committed ? l.steps.find((s) => s.id === pick) : null;
  return (
    <section className="ds-card">
      <SceneHead n={l.n} title={l.title} type={l.typeLabel}>{l.stage}</SceneHead>
      <p className="ds-constraint"><strong>What is scarce:</strong> {l.constraint}</p>
      <ol className="ds-chain" role="radiogroup" aria-label="Select the step that breaks integrity">
        {l.steps.map((s) => (
          <li key={s.id}>
            <label className={"ds-chain-step " + (committed ? (s.defect ? "ds-is-defect" : (pick === s.id ? "ds-wrong" : "")) : (pick === s.id ? "ds-sel" : ""))}>
              <input type="radio" name={"chain-" + l.n} disabled={committed} checked={pick === s.id} onChange={() => setPick(s.id)} />
              <span className="ds-chain-text">{s.text}</span>
              {committed && s.defect && <span className="ds-chain-note"> ← the break. {s.why}</span>}
              {committed && !s.defect && s.id === l.decoyId && <span className="ds-chain-note ds-muted"> {l.decoyNote}</span>}
            </label>
          </li>
        ))}
      </ol>
      <Authorities keys={l.authorities} dict={dict} />
      {!committed ? (<div className="ds-row"><button className="ds-btn" onClick={commit} disabled={pick == null}>{l.commitLabel}</button></div>)
        : (<div className="ds-row"><p className="ds-carry">{chosen && chosen.defect ? l.carryGood : l.carryBad}</p><button className="ds-btn" onClick={onDone}>Continue →</button></div>)}
    </section>
  );
}

function MatchingView({ l, dict, apply, score, onDone }: { l: MatchingLesson; dict: Record<string, Authority>; apply: (e?: Consequence) => void; score: (c: string | null | undefined, b: Band) => void; onDone: () => void; }) {
  const [pick, setPick] = useState<string | null>(null);
  const [committed, setCommitted] = useState(false);
  const commit = () => {
    if (!pick) return;
    setCommitted(true);
    const opt = l.options.find((o) => o.id === pick)!;
    apply(opt.effect);
    score(l.crit, opt.band);
  };
  const chosen = committed ? l.options.find((o) => o.id === pick) : null;
  return (
    <section className="ds-card">
      <SceneHead n={l.n} title={l.title} type={l.typeLabel}>{l.stage}</SceneHead>
      <p className="ds-constraint"><strong>What is scarce:</strong> {l.constraint}</p>
      <ol className="ds-chain" role="radiogroup" aria-label="Choose the mechanism">
        {l.options.map((o) => (
          <li key={o.id}>
            <label className={"ds-chain-step " + (committed ? (o.quality === "sound" ? "ds-is-good" : (pick === o.id ? "ds-wrong" : "")) : (pick === o.id ? "ds-sel" : ""))}>
              <input type="radio" name={"match-" + l.n} disabled={committed} checked={pick === o.id} onChange={() => setPick(o.id)} />
              <span className="ds-chain-text">{o.label}</span>
              {committed && (pick === o.id || o.quality === "sound") && <span className={"ds-chain-note " + (o.quality === "sound" ? "ds-good-note" : "")}> {o.response}</span>}
            </label>
          </li>
        ))}
      </ol>
      <Authorities keys={l.authorities} dict={dict} />
      {!committed ? (<div className="ds-row"><button className="ds-btn" onClick={commit} disabled={!pick}>{l.commitLabel}</button></div>)
        : (<div className="ds-row"><p className="ds-carry">{chosen && chosen.quality === "sound" ? l.carryGood : l.carryBad}</p><button className="ds-btn" onClick={onDone}>Continue →</button></div>)}
    </section>
  );
}

function SocraticView({ l, onDone }: { l: SocraticLesson; onDone: () => void; }) {
  const [a1, setA1] = useState("");
  const [phase, setPhase] = useState(0);
  const [probe, setProbe] = useState(l.authoredProbe);
  const [a2, setA2] = useState("");
  const [loading, setLoading] = useState(false);
  const askProbe = async () => {
    setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "content-type": "application/json", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: "You are a Socratic coach for a qualified professional. Read their written justification and return EXACTLY ONE probing question. Constraints: never say whether they were right; never contain the answer or the principle; introduce no new fact about the case; no praise; no moralising; one sentence; under 30 words; press on the least-examined part of what they wrote.\n\nTheir justification:\n" + a1 }] }),
      });
      const data = await res.json();
      const txt = data && data.content && data.content[0] && data.content[0].text;
      if (txt && String(txt).trim()) setProbe(String(txt).trim());
    } catch { /* authored fallback */ } finally { setLoading(false); setPhase(1); }
  };
  return (
    <section className="ds-card">
      <SceneHead n={l.n || "Checkpoint"} title={l.title || "Defend the decision you just took"} type={l.typeLabel || "Socratic checkpoint · read by your coach, never scored"}>This is placed immediately after your highest-stakes decision. There is no grade here.</SceneHead>
      <label className="ds-q-label" htmlFor="ds-soc1">{l.prompt}</label>
      <textarea id="ds-soc1" className="ds-ta" rows={4} value={a1} onChange={(e) => setA1(e.target.value)} disabled={phase > 0} placeholder="Write in your own words…" />
      {phase === 0 && (<div className="ds-row"><button className="ds-btn" onClick={askProbe} disabled={a1.trim().length < 8 || loading}>{loading ? "…" : "Submit"}</button></div>)}
      {phase >= 1 && (
        <div className="ds-probe">
          <div className="ds-probe-h">One question back</div>
          <p className="ds-serif">{probe}</p>
          {phase === 1 && (<><textarea className="ds-ta" rows={3} value={a2} onChange={(e) => setA2(e.target.value)} placeholder="Answer again…" /><div className="ds-row"><button className="ds-btn" onClick={() => setPhase(3)} disabled={a2.trim().length < 4}>Submit</button></div></>)}
        </div>
      )}
      {phase === 3 && (<div className="ds-model"><div className="ds-model-h">One competent answer, not the answer</div><p className="ds-serif">{l.modelReasoning}</p><p className="ds-fb">Where your reasoning is better than this, keep yours.</p><p className="ds-a11y-note">{l.note}</p><div className="ds-row"><button className="ds-btn" onClick={onDone}>Continue →</button></div></div>)}
    </section>
  );
}

function ArtifactView({ l, world, score, onDone }: { l: ArtifactLesson; world: World; score: (c: string | null | undefined, b: Band) => void; onDone: () => void; }) {
  const [ack, setAck] = useState(false);
  const lines = l.lines.map((ln) => {
    const v = world[ln.from];
    const key = v === undefined || v === null ? "null" : String(v);
    return ln.cases[key] || ln.default || { txt: "", flag: false };
  });
  return (
    <section className="ds-card">
      <SceneHead n={l.n} title={l.title} type={l.typeLabel}>{l.intro}</SceneHead>
      <div className="ds-artifact" aria-label="Artifact assembled from your decisions">
        <div className="ds-artifact-h"><div>{l.docTitle}</div><div className="ds-artifact-sub">{l.docSub}</div></div>
        <ul className="ds-artifact-list">{lines.map((ln, idx) => (<li key={idx} className={ln.flag ? "ds-flagged" : ""}>{ln.flag && <span className="ds-flag" aria-label="flagged">⚑ flagged</span>}{ln.txt}</li>))}</ul>
      </div>
      <label className="ds-check ds-standalone">
        <input type="checkbox" checked={ack} onChange={() => { setAck(!ack); if (!ack && l.ackCrit) score(l.ackCrit, "A"); }} />
        <span className="ds-check-box" aria-hidden="true">{ack ? "✓" : ""}</span>
        <span className="ds-check-label">{l.ackLabel}</span>
      </label>
      <div className="ds-row"><button className="ds-btn" onClick={onDone} disabled={!ack}>See my station result →</button></div>
    </section>
  );
}

/* ----------------------------------------------------------------- result */
function ResultView({ spec, record, onRestart, onSubmit }: { spec: StationSpec; record: Rec; onRestart: () => void; onSubmit?: (r: { payload: unknown; score: number }) => void; }) {
  const rows = spec.criteria.map((c) => { const band = (record[c.key] || "F") as Band; return { ...c, band, value: BAND_VALUE[band] }; });
  const failedNN = rows.filter((r) => r.nonNegotiable && r.value < 3);
  const skills = rows.filter((r) => r.stream === "Skills");
  const proc = rows.filter((r) => r.stream === "Application of procedure or law");
  const mean = (arr: typeof rows) => (arr.length ? arr.reduce((a, r) => a + r.value, 0) / arr.length : 0);
  const pass = failedNN.length === 0 && mean(skills) >= 3 && mean(proc) >= 3;
  const overall = rows.length ? Math.round((rows.reduce((a, r) => a + r.value, 0) / (rows.length * 5)) * 100) : 0;
  const submitted = useRef(false);
  useEffect(() => {
    if (!submitted.current && onSubmit) { submitted.current = true; onSubmit({ payload: { record, pass, bands: rows.map((r) => ({ key: r.key, band: r.band })) }, score: pass ? Math.max(overall, 50) : Math.min(overall, 49) }); }
  }, [onSubmit, overall, pass, record, rows]);
  const streams: [string, typeof rows][] = [["Skills", skills], ["Application of procedure or law", proc]];
  return (
    <section className="ds-card">
      <SceneHead n="Station result" title="Computed from the decisions you took" type="No separate quiz · two streams, weighted equally">Each criterion is banded and reported on its own. Bands: A=5 … F=0; C is the marginal pass.</SceneHead>
      <div className={"ds-verdict " + (pass ? "ds-pass" : "ds-fail")}>{pass ? "STATION PASSED, every non-negotiable held and both streams reached the marginal pass." : (failedNN.length ? "STATION NOT PASSED, a non-negotiable failed. It does not compensate: it fails the station regardless of every other band." : "STATION NOT PASSED, a stream fell below the marginal pass.")}</div>
      {failedNN.length > 0 && <ul className="ds-nn-list">{failedNN.map((r) => <li key={r.key}><strong>Non-negotiable failed:</strong> {r.label}</li>)}</ul>}
      {streams.map(([name, arr]) => (
        <div key={name} className="ds-stream">
          <h3>{name} <span className="ds-stream-mean">mean {mean(arr).toFixed(1)}/5</span></h3>
          <table className="ds-bands">
            <thead><tr><th>Criterion</th><th>Band</th><th>Indicator you met / missed</th></tr></thead>
            <tbody>{arr.map((r) => (<tr key={r.key} className={r.value < 3 ? "ds-low" : ""}><td>{r.label}{r.nonNegotiable && <span className="ds-nn"> · non-negotiable</span>}</td><td><span className={"ds-band ds-b-" + r.band}>{r.band}</span></td><td className="ds-ind">{r.value >= 3 ? r.indicators.competent : r.indicators.not}</td></tr>))}</tbody>
          </table>
        </div>
      ))}
      <p className="ds-a11y-note">Nothing on this page is reported to your institution.</p>
      {spec.jobAid && (
        <div className="ds-jobaid">
          <div className="ds-jobaid-h">{spec.jobAid.heading}</div>
          <ol>{spec.jobAid.items.map((it, i) => <li key={i} dangerouslySetInnerHTML={{ __html: it }} />)}</ol>
          <div className="ds-jobaid-f">{spec.jobAid.footer}</div>
        </div>
      )}
      <div className="ds-row"><button className="ds-btn ds-ghost" onClick={onRestart}>Run the station again</button></div>
    </section>
  );
}

/* ----------------------------------------------------------------- alignment */
function AlignmentPanel({ spec }: { spec: StationSpec }) {
  if (!spec.alignment) return null;
  return (
    <section className="ds-align">
      <h2>Alignment record</h2>
      <p className="ds-align-intro">Every lesson argues that its activity type tests <em>this</em> objective rather than something adjacent. Success is stated as a threshold or a binary, never as an adjective.</p>
      {spec.alignment.map((a, idx) => (
        <div key={idx} className="ds-align-row"><div className="ds-align-o">{a.o}</div><div className="ds-align-grid"><div><span className="ds-align-k">How it is tested</span>{a.tested}</div><div><span className="ds-align-k">What success is</span>{a.success}</div><div><span className="ds-align-k">Why this activity type</span>{a.why}</div></div></div>
      ))}
      {(spec.nonNegotiableNote || spec.reviewTriggers) && (
        <div className="ds-align-foot">
          {spec.nonNegotiableNote && <div><strong>Non-negotiables (partly conjunctive):</strong> {spec.nonNegotiableNote}</div>}
          {spec.reviewTriggers && <div className="ds-mt"><strong>Review triggers:</strong> {spec.reviewTriggers.join(" ")}</div>}
        </div>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- player */
export function DecisionStationPlayer({ spec, onSubmit }: { spec: StationSpec; onSubmit?: (r: { payload: unknown; score: number }) => void; disabled?: boolean; }) {
  const [contrast, setContrast] = useState(false);
  const [big, setBig] = useState(false);
  const [spacious, setSpacious] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [world, setWorld] = useState<World>({});
  const [record, setRecord] = useState<Rec>({});
  const topRef = useRef<HTMLDivElement | null>(null);

  // Build the step list: [warning?] + lessons + result
  const stepList: ("warning" | number | "result")[] = [
    ...(spec.warning ? (["warning"] as const) : []),
    ...spec.lessons.map((_, i) => i),
    "result" as const,
  ];
  const [si, setSi] = useState(0);
  const cur = stepList[si];
  useEffect(() => { if (topRef.current) topRef.current.focus(); }, [si]);

  const apply = (eff?: Consequence) => { if (eff) setWorld((w) => ({ ...w, ...eff })); };
  const score = (crit: string | null | undefined, band: Band) => { if (crit) setRecord((r) => ({ ...r, [crit]: band })); };
  const go = (d: number) => setSi((x) => Math.max(0, Math.min(stepList.length - 1, x + d)));
  const restart = () => { setSi(0); setWorld({}); setRecord({}); };

  const rootClass = ["ds", contrast ? "ds-hc" : "", big ? "ds-big" : "", spacious ? "ds-sp" : ""].join(" ");

  const renderLesson = (idx: number) => {
    const l = spec.lessons[idx];
    switch (l.type) {
      case "routing": return <RoutingView l={l} dict={spec.authorities} apply={apply} score={score} onDone={() => go(1)} />;
      case "branching": return <BranchingView l={l} dict={spec.authorities} apply={apply} score={score} onDone={() => go(1)} />;
      case "select": return <SelectView l={l} dict={spec.authorities} apply={apply} score={score} onDone={() => go(1)} />;
      case "chainAudit": return <ChainView l={l} dict={spec.authorities} apply={apply} score={score} onDone={() => go(1)} />;
      case "matching": return <MatchingView l={l} dict={spec.authorities} apply={apply} score={score} onDone={() => go(1)} />;
      case "socratic": return <SocraticView l={l} onDone={() => go(1)} />;
      case "artifact": return <ArtifactView l={l} world={world} score={score} onDone={() => go(1)} />;
      default: return null;
    }
  };

  return (
    <div className={rootClass}>
      <style>{CSS}</style>
      <header className="ds-head">
        <div className="ds-head-row">
          <div>
            <div className="ds-id"><span className="ds-id-code">{spec.meta.code} · {spec.meta.module}</span></div>
            <h1 className="ds-title">{spec.meta.title}</h1>
          </div>
          <div className="ds-meta">
            <span className="ds-tag ds-tag-warn">{spec.meta.version} · {spec.meta.smeStatus}</span>
            {spec.alignment && <button className="ds-lnk" onClick={() => setAlignOpen((v) => !v)} aria-expanded={alignOpen}>{alignOpen ? "Hide alignment" : "Alignment"}</button>}
          </div>
        </div>
        <p className="ds-task"><strong>Task:</strong> {spec.meta.task}</p>
        <div className="ds-a11y" role="group" aria-label="Presentation controls">
          <button aria-pressed={big} onClick={() => setBig((v) => !v)} className={big ? "ds-on" : ""}>Text size</button>
          <button aria-pressed={contrast} onClick={() => setContrast((v) => !v)} className={contrast ? "ds-on" : ""}>High contrast</button>
          <button aria-pressed={spacious} onClick={() => setSpacious((v) => !v)} className={spacious ? "ds-on" : ""}>Generous spacing</button>
          <span className="ds-a11y-note">No timers. You can leave any scenario without losing progress.</span>
        </div>
      </header>

      {alignOpen && <AlignmentPanel spec={spec} />}

      <nav className="ds-rail" aria-label="Lesson progress">
        {stepList.map((s, idx) => {
          const label = s === "warning" ? "Start" : s === "result" ? "Result" : (spec.lessons[s] as Lesson & { n?: string }).n || `Lesson ${s + 1}`;
          return (<button key={idx} className={"ds-rail-dot " + (idx === si ? "ds-cur" : idx < si ? "ds-done" : "")} aria-current={idx === si ? "step" : undefined} onClick={() => setSi(idx)} title={label}><span className="ds-rail-n">{s === "warning" ? "!" : idx}</span><span className="ds-rail-l">{label}</span></button>);
        })}
      </nav>

      <main className="ds-stage" tabIndex={-1} ref={topRef} aria-live="polite">
        {cur === "warning" && spec.warning && (
          <section className="ds-card ds-lead">
            <h2>{spec.warning.title}</h2>
            {spec.warning.body.map((p, i) => <p key={i} className={i === 0 ? "ds-serif" : ""}>{p}</p>)}
            <div className="ds-row"><button className="ds-btn ds-big-btn" onClick={() => go(1)}>{spec.warning.startLabel}</button></div>
          </section>
        )}
        {typeof cur === "number" && renderLesson(cur)}
        {cur === "result" && <ResultView spec={spec} record={record} onRestart={restart} onSubmit={onSubmit} />}
      </main>

      <footer className="ds-foot">
        <button className="ds-btn ds-ghost" onClick={() => go(-1)} disabled={si === 0}>← Back</button>
        <button className="ds-btn" onClick={() => go(1)} disabled={si === stepList.length - 1}>Next →</button>
      </footer>
    </div>
  );
}

export default DecisionStationPlayer;

/* ----------------------------------------------------------------- styles */
const CSS = `
.ds{ --ink:#1c2430; --paper:#f6f4ef; --card:#fff; --line:#d8d2c6; --accent:#2f5d63; --accent-2:#7a3b2e; --muted:#6b7280; --ok:#2f5d63; --warn:#7a3b2e;
  --serif: Georgia,'Iowan Old Style','Times New Roman',serif; --sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; --fs:16px; --sp:16px;
  color:var(--ink); background:var(--paper); font-family:var(--sans); font-size:var(--fs); line-height:1.5; margin:0 auto; padding:16px; width:100%; max-width:900px; border-radius:12px; }
.ds.ds-big{ --fs:19px; } .ds.ds-sp{ --sp:24px; line-height:1.7; }
.ds.ds-hc{ --paper:#fff; --ink:#000; --card:#fff; --line:#000; --accent:#003b46; --accent-2:#6a1b00; --muted:#333; }
.ds *{ box-sizing:border-box; } .ds-serif{ font-family:var(--serif); }
.ds button:focus-visible,.ds input:focus-visible,.ds textarea:focus-visible,.ds [tabindex]:focus-visible{ outline:3px solid var(--accent); outline-offset:2px; }
.ds-head{ border:1px solid var(--line); background:var(--card); border-radius:10px; padding:var(--sp); margin-bottom:12px; }
.ds-head-row{ display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-start; }
.ds-id{ font-size:.8em; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }
.ds-title{ font-family:var(--serif); font-size:1.6em; margin:.1em 0 0; }
.ds-meta{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.ds-task{ margin:.8em 0 0; }
.ds-tag{ display:inline-block; font-size:.72em; padding:3px 8px; border-radius:999px; border:1px solid var(--line); white-space:nowrap; }
.ds-tag-ok{ color:var(--ok); border-color:var(--ok); } .ds-tag-warn{ color:var(--warn); border-color:var(--warn); background:#faf3ef; }
.ds-lnk{ background:none; border:1px solid var(--line); border-radius:8px; padding:6px 10px; cursor:pointer; font:inherit; color:var(--accent); }
.ds-a11y{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:12px; padding-top:12px; border-top:1px solid var(--line); }
.ds-a11y button{ font:inherit; font-size:.82em; padding:5px 10px; border:1px solid var(--line); border-radius:8px; background:var(--card); cursor:pointer; }
.ds-a11y button.ds-on{ background:var(--accent); color:#fff; border-color:var(--accent); }
.ds-a11y-note{ font-size:.8em; color:var(--muted); }
.ds-rail{ display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
.ds-rail-dot{ display:flex; align-items:center; gap:6px; font:inherit; font-size:.8em; background:var(--card); border:1px solid var(--line); border-radius:999px; padding:5px 10px; cursor:pointer; color:var(--muted); }
.ds-rail-dot .ds-rail-n{ font-weight:700; width:1.4em; height:1.4em; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; border:1px solid var(--line); }
.ds-rail-dot.ds-cur{ color:var(--ink); border-color:var(--accent); } .ds-rail-dot.ds-cur .ds-rail-n{ background:var(--accent); color:#fff; border-color:var(--accent); }
.ds-rail-dot.ds-done .ds-rail-n{ background:#e6ede9; }
.ds-stage{ outline:none; }
.ds-card{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:var(--sp); }
.ds-scene-head{ margin-bottom:14px; }
.ds-scene-tags{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:6px; }
.ds-scene-n{ font-size:.72em; letter-spacing:.08em; text-transform:uppercase; color:#fff; background:var(--accent); padding:3px 8px; border-radius:6px; }
.ds-scene-type{ font-size:.75em; color:var(--muted); border:1px solid var(--line); border-radius:6px; padding:3px 8px; }
.ds-scene-title{ font-family:var(--serif); font-size:1.3em; margin:.1em 0 .3em; }
.ds-scene-body{ font-size:1.02em; }
.ds-constraint{ background:#faf3ef; border-left:3px solid var(--accent-2); padding:8px 12px; border-radius:0 8px 8px 0; }
.ds-theory{ background:#eef2ef; border-left:3px solid var(--accent); padding:8px 12px; border-radius:0 8px 8px 0; }
.ds-items{ display:flex; flex-direction:column; gap:12px; }
.ds-item{ border:1px solid var(--line); border-radius:10px; padding:12px; } .ds-item.ds-resolved{ background:#fbfaf7; }
.ds-item-label{ font-family:var(--serif); font-size:1.05em; margin-bottom:8px; }
.ds-opts,.ds-moves{ display:flex; flex-direction:column; gap:8px; }
.ds-opt,.ds-move{ text-align:left; font:inherit; background:var(--card); border:1px solid var(--line); border-radius:8px; padding:10px 12px; cursor:pointer; }
.ds-opt:hover,.ds-move:hover{ border-color:var(--accent); }
.ds-outcome{ border-radius:8px; padding:10px 12px; border:1px solid var(--line); }
.ds-outcome.ds-q-sound{ background:#eef4f1; border-color:var(--accent); } .ds-outcome.ds-q-partly{ background:#f7f3ea; border-color:#b98a3a; } .ds-outcome.ds-q-not{ background:#f7ece8; border-color:var(--accent-2); }
.ds-outcome-h{ font-weight:700; margin-bottom:4px; display:flex; align-items:center; gap:6px; }
.ds-glyph{ font-size:1.1em; } .ds-q-sound{ color:var(--accent); } .ds-q-partly{ color:#8a5a15; } .ds-q-not{ color:var(--accent-2); }
.ds-fb{ font-size:.92em; }
.ds-auth{ margin:14px 0 0; padding-top:10px; border-top:1px dashed var(--line); font-size:.86em; }
.ds-auth-h{ font-weight:700; text-transform:uppercase; letter-spacing:.06em; font-size:.82em; color:var(--muted); }
.ds-auth ul{ margin:6px 0 0; padding-left:16px; } .ds-auth li{ margin:4px 0; } .ds-auth-ref{ font-weight:600; } .ds-auth-note{ color:var(--muted); }
.ds-checks{ display:flex; flex-direction:column; gap:8px; }
.ds-check{ display:flex; gap:10px; align-items:flex-start; border:1px solid var(--line); border-radius:8px; padding:10px 12px; cursor:pointer; } .ds-check.ds-standalone{ margin-top:12px; }
.ds-check input{ position:absolute; opacity:0; width:1px; height:1px; }
.ds-check-box{ flex:0 0 auto; width:20px; height:20px; border:2px solid var(--accent); border-radius:5px; display:inline-flex; align-items:center; justify-content:center; font-weight:700; color:var(--accent); }
.ds-check.ds-good{ background:#eef4f1; border-color:var(--accent); } .ds-check.ds-bad{ background:#f7ece8; border-color:var(--accent-2); } .ds-check.ds-muted{ opacity:.7; }
.ds-check-note{ color:var(--muted); font-size:.9em; }
.ds-chain{ list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px; }
.ds-chain-step{ display:flex; gap:10px; align-items:flex-start; border:1px solid var(--line); border-radius:8px; padding:10px 12px; cursor:pointer; }
.ds-chain-step.ds-sel{ border-color:var(--accent); background:#eef4f1; } .ds-chain-step.ds-is-defect{ border-color:var(--accent-2); background:#f7ece8; } .ds-chain-step.ds-is-good{ border-color:var(--accent); background:#eef4f1; } .ds-chain-step.ds-wrong{ border-color:var(--accent-2); background:#f7ece8; }
.ds-chain-note{ display:block; margin-top:6px; font-size:.9em; color:var(--accent-2); } .ds-chain-note.ds-good-note{ color:var(--accent); } .ds-chain-note.ds-muted{ color:var(--muted); }
.ds-q-label{ display:block; font-weight:600; margin-bottom:6px; }
.ds-ta{ width:100%; font:inherit; padding:10px; border:1px solid var(--line); border-radius:8px; resize:vertical; background:var(--card); }
.ds-probe{ margin-top:14px; border-left:3px solid var(--accent); padding:8px 12px; background:#eef2ef; border-radius:0 8px 8px 0; }
.ds-probe-h,.ds-model-h{ font-weight:700; text-transform:uppercase; letter-spacing:.06em; font-size:.8em; color:var(--muted); margin-bottom:4px; }
.ds-model{ margin-top:14px; border:1px solid var(--accent); border-radius:8px; padding:12px; background:#eef4f1; }
.ds-artifact{ border:1px solid var(--ink); border-radius:8px; overflow:hidden; margin:6px 0 12px; }
.ds-artifact-h{ background:var(--ink); color:#fff; padding:10px 12px; } .ds-artifact-sub{ font-size:.78em; opacity:.85; }
.ds-artifact-list{ margin:0; padding:0; list-style:none; } .ds-artifact-list li{ padding:9px 12px; border-bottom:1px solid var(--line); font-size:.95em; } .ds-artifact-list li:last-child{ border-bottom:none; } .ds-artifact-list li.ds-flagged{ background:#f7ece8; }
.ds-flag{ color:var(--accent-2); font-weight:700; font-size:.82em; margin-right:8px; }
.ds-verdict{ font-weight:700; padding:12px 14px; border-radius:8px; margin-bottom:12px; } .ds-verdict.ds-pass{ background:#eef4f1; border:1px solid var(--accent); color:var(--accent); } .ds-verdict.ds-fail{ background:#f7ece8; border:1px solid var(--accent-2); color:var(--accent-2); }
.ds-nn-list{ margin:0 0 12px; padding-left:18px; color:var(--accent-2); }
.ds-stream{ margin:14px 0; } .ds-stream h3{ font-family:var(--serif); margin:0 0 6px; display:flex; justify-content:space-between; align-items:baseline; } .ds-stream-mean{ font-family:var(--sans); font-size:.7em; color:var(--muted); font-weight:400; }
.ds-bands{ width:100%; border-collapse:collapse; font-size:.9em; } .ds-bands th,.ds-bands td{ text-align:left; padding:8px; border-bottom:1px solid var(--line); vertical-align:top; } .ds-bands th{ font-size:.82em; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); } .ds-bands tr.ds-low td{ background:#faf3ef; }
.ds-nn{ color:var(--accent-2); font-size:.85em; }
.ds-band{ display:inline-flex; width:26px; height:26px; align-items:center; justify-content:center; border-radius:6px; font-weight:700; border:1px solid var(--line); } .ds-b-A,.ds-b-B{ background:#e6ede9; color:var(--accent); } .ds-b-C{ background:#f3ecdd; color:#8a5a15; } .ds-b-D,.ds-b-E,.ds-b-F{ background:#f3ddd6; color:var(--accent-2); }
.ds-ind{ color:var(--muted); }
.ds-jobaid{ margin-top:16px; border:2px dashed var(--accent); border-radius:10px; padding:14px; background:#fbfdfc; } .ds-jobaid-h{ font-family:var(--serif); font-weight:700; margin-bottom:8px; } .ds-jobaid ol{ margin:0; padding-left:20px; } .ds-jobaid li{ margin:6px 0; } .ds-jobaid-f{ margin-top:10px; font-size:.82em; color:var(--muted); }
.ds-align{ border:1px solid var(--accent); background:#fbfdfc; border-radius:10px; padding:var(--sp); margin-bottom:12px; } .ds-align h2{ font-family:var(--serif); margin:0 0 4px; } .ds-align-intro{ font-size:.92em; color:var(--muted); margin:0 0 12px; }
.ds-align-row{ border-top:1px solid var(--line); padding:10px 0; } .ds-align-o{ font-weight:600; margin-bottom:8px; } .ds-align-grid{ display:grid; grid-template-columns:1fr; gap:8px; } .ds-align-k{ display:block; font-size:.74em; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
.ds-align-foot{ border-top:1px solid var(--line); padding-top:10px; margin-top:6px; font-size:.9em; } .ds-mt{ margin-top:6px; }
.ds-row{ display:flex; gap:12px; align-items:center; justify-content:flex-end; flex-wrap:wrap; margin-top:14px; } .ds-carry{ margin:0; margin-right:auto; font-size:.92em; color:var(--muted); max-width:60ch; }
.ds-btn{ font:inherit; font-weight:600; background:var(--accent); color:#fff; border:1px solid var(--accent); border-radius:8px; padding:10px 16px; cursor:pointer; } .ds-btn:hover{ filter:brightness(1.06); } .ds-btn:disabled{ opacity:.45; cursor:not-allowed; } .ds-btn.ds-ghost{ background:var(--card); color:var(--accent); } .ds-btn.ds-big-btn{ padding:12px 22px; font-size:1.05em; }
.ds-foot{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:14px; padding:10px 4px; }
@media (max-width:520px){ .ds{ padding:10px; } .ds-title{ font-size:1.35em; } }
@media (min-width:640px){ .ds-align-grid{ grid-template-columns:1fr 1fr 1fr; } }
@media (prefers-reduced-motion: reduce){ .ds *{ transition:none !important; animation:none !important; } }
`;
