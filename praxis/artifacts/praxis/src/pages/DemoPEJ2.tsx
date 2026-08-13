/*
 * =============================================================================
 * Synops Praxis · Justice-sector training module (DEMO, in-platform port)
 * =============================================================================
 * COURSE CODE:   PEJ-EVD-01   MODULE 2 — Getting the account
 * VERSION:       0.1-demo      SME SIGN-OFF: PENDING
 *
 * THE PROFESSIONAL TASK (verb phrase):
 *   Conduct the initial account of a witness so that consent is informed and
 *   continuous, the account is non-suggestive and in the witness's own words,
 *   only proportionate detail is taken, a disclosure of ill-treatment is handled
 *   without harm, and the testimony is preserved before the witness is displaced.
 *
 * OBJECTIVES (observable; condition / behaviour / criterion; competence level):
 *   O1 [Knows how] Given a witness ready to speak, establish the conditions of
 *      informed consent before any account is taken, so consent is recorded as
 *      informed and revocable.
 *   O2 [Shows how] Given a cooperative witness, open the account so no fact
 *      enters through a leading question.
 *   O3 [Shows how] Given a running account, choose follow-up questions so no
 *      detail beyond the file's need is taken.
 *   O4 [Shows how] Given a mid-interview disclosure of ill-treatment, respond so
 *      consent is renewed and no harm is caused (Istanbul Protocol / do no harm).
 *   O5 [Knows how] Given imminent displacement, choose the mechanism that
 *      preserves the testimony so it survives the witness leaving.
 *   O6 [Does] Produce an interview record + consent log + referral + preservation
 *      request in which every consent/proportionality issue is flagged.
 *
 * DESIGN COMMITMENTS: task-first (C1); observable objectives (C2); consequence
 * not correctness — a leading question or a pressed disclosure persists into the
 * artifact (C3); distractors are real field failures, each lesson carries one
 * option right in substance but wrong in timing/register (C4); conduct sits
 * inside ordinary tasks, unflagged (C5); the station is computed from decisions
 * already taken (C6); every legal claim is tagged and shown unsigned (C7).
 *
 * AI BOUNDARIES (Part J): the model never plays Mr H. — every witness line is
 * authored below. No real case material leaves the browser. The single Socratic
 * probing-question call is constrained and degrades to an authored fallback; the
 * model answer is AUTHORED. Nothing here affects institutional standing.
 * =============================================================================
 */

import React, { useState, useRef, useEffect } from "react";

function exitStation() {
  if (typeof window !== "undefined") {
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/dashboard";
  }
}

/* ---------------------------------------------------------------------------
 * TYPES
 * ------------------------------------------------------------------------- */
type Quality = "sound" | "partly" | "not";
type Band = "A" | "B" | "C" | "D" | "E" | "F";
type CritKey = "P_CONSENT" | "S_OPEN" | "S_PROP" | "S_DISC" | "P_PRESERVE" | "P_REFERRAL";

interface World {
  consentInformed: boolean;
  consentTrap: boolean;
  referralOffered: boolean;
  account: "clean" | "narrowed" | "led" | "overreach" | null;
  propOverreach: boolean;
  disclosure: "handled" | "redirected" | "pressed" | null;
  reconsented: boolean;
  preserve: "art225" | "written" | "wrong" | null;
}
type Effect = Partial<World>;
const EMPTY_WORLD: World = {
  consentInformed: false, consentTrap: false, referralOffered: false,
  account: null, propOverreach: false, disclosure: null, reconsented: false, preserve: null,
};

interface Move { id: string; label: string; quality: Quality; crit?: CritKey | null; band: Band; effect: Effect; response: string; feedback: string; }

/* ---------------------------------------------------------------------------
 * AUTHORED AUTHORITY LEDGER (Part C7)
 * ------------------------------------------------------------------------- */
const AUTHORITIES: Record<string, { ref: string; note: string; status: "stable" | "confirm" | "practice" }> = {
  MURAD: { ref: "Murad Code — informed consent, proportionality, do no harm", note: "Stable.", status: "stable" },
  INTERVIEW: { ref: "Investigative interviewing evidence base — open before closed", note: "Stable, general.", status: "stable" },
  ISTANBUL: { ref: "Istanbul Protocol — where ill-treatment is disclosed", note: "Stable.", status: "stable" },
  CPC_225: { ref: "CPC of Ukraine, art. 225 — preservation of testimony before the investigating judge", note: "Confirm current text, including known practice limitations.", status: "confirm" },
  RECORD: { ref: "Domestic evidential practice — record in the witness's words, exclude inference", note: "Practice layer. Must come from the SME.", status: "practice" },
  REFERRAL: { ref: "Local referral / support pathways", note: "Sourced locally; changes often. Verify before each deployment.", status: "practice" },
};
const REVIEW_TRIGGERS = [
  "Review on any amendment to CPC art. 225.",
  "Review on publication of a revised Murad Code or Istanbul Protocol.",
  "Review on any change to local referral pathways (verify each deployment).",
];

/* ---------------------------------------------------------------------------
 * ASSESSMENT MODEL (Part D)
 * ------------------------------------------------------------------------- */
const BAND_VALUE: Record<Band, number> = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
interface Criterion { label: string; stream: "Skills" | "Application of procedure or law"; nonNegotiable: boolean; indicators: { competent: string; not: string }; }
const CRITERIA: Record<CritKey, Criterion> = {
  P_CONSENT: { label: "Informed, revocable consent constituted before the account", stream: "Application of procedure or law", nonNegotiable: true,
    indicators: { competent: "Explains use and the right to stop; private space and interpreter set; no covert recording or promised outcome.", not: "Records covertly, promises an outcome, or opens the account before consent is established." } },
  S_OPEN: { label: "Non-suggestive opening of the account", stream: "Skills", nonNegotiable: false,
    indicators: { competent: "Opens wide; lets the witness narrate in their own words before any closed question.", not: "Leads the witness, or funnels into closed questions before the account exists." } },
  S_PROP: { label: "Proportionality — only detail the file needs", stream: "Skills", nonNegotiable: false,
    indicators: { competent: "Asks what bears on reliability and linkage; leaves graphic and personal detail the file does not need.", not: "Takes graphic or personal detail beyond the file's need." } },
  S_DISC: { label: "Disclosure of ill-treatment handled without harm; consent renewed", stream: "Skills", nonNegotiable: true,
    indicators: { competent: "Acknowledges, checks he wants to continue, defers detail to the specialist pathway, offers support.", not: "Presses for detail, gives a false assurance, or ignores the disclosure." } },
  P_PRESERVE: { label: "Testimony preserved before displacement by the correct mechanism", stream: "Application of procedure or law", nonNegotiable: true,
    indicators: { competent: "Lodges the art. 225 request before the witness relocates.", not: "Relies on a re-interview or a recording that will not survive the witness leaving." } },
  P_REFERRAL: { label: "Support / referral pathway offered", stream: "Application of procedure or law", nonNegotiable: false,
    indicators: { competent: "The referral pathway is to hand and offered.", not: "No support pathway offered." } },
};

/* ---------------------------------------------------------------------------
 * LESSON DATA (authored beats)
 * ------------------------------------------------------------------------- */
// L1 — consent & setup: component selection
interface L2Component { id: string; label: string; correct: boolean; trap?: boolean; note: string; }
const L1_COMPONENTS: L2Component[] = [
  { id: "explain_use", label: "Explain plainly what the account is for, who may see it, and that he can stop or withdraw at any time", correct: true, note: "The heart of informed, continuous consent (Murad Code). Without it, the account is neither informed nor freely given." },
  { id: "interpreter_private", label: "Confirm a private space and a trained interpreter he is comfortable with", correct: true, note: "Conditions for a safe, accurate account." },
  { id: "referral_ready", label: "Have the support / referral pathway to hand before you start", correct: true, note: "Do no harm — you do not open this conversation without knowing where to send him." },
  { id: "record_covert", label: "Begin recording quietly without mentioning it, so he speaks naturally", correct: false, trap: true, note: "TRAP. Covert recording destroys informed consent. It feels like it protects the account; it taints it and breaches the Murad Code." },
  { id: "promise_outcome", label: "Reassure him that his account will lead to a prosecution and justice", correct: false, trap: true, note: "TRAP. A promised outcome you cannot guarantee is a false assurance (do no harm). Never trade a conviction for an account." },
  { id: "full_history", label: "Take his full personal and family history first, to build rapport", correct: false, trap: false, note: "Overreach. Rapport does not require detail the file will never use. Proportionality starts before the first question." },
];

// L2 — opening: branching beat
const L2_OPEN = {
  stage: "Mr H., a displaced farmer, is sitting across from you at a reception centre. Consent is done; the interpreter is ready. He looks at you, waiting. Your first move sets whether his account can be used.",
  constraint: "He is willing and a little anxious — he wants to give you what you need, which is exactly when a witness will take your words instead of finding his own.",
  theory: "Open before closed. The account must exist in his words before you structure it; a fact you supply is a fact you cannot later rely on.",
  authorities: ["INTERVIEW", "RECORD", "MURAD"],
  moves: [
    { id: "open", label: '"Take me to that morning. Start wherever feels right, and tell me what you saw, in your own words."', quality: "sound" as Quality, crit: "S_OPEN" as CritKey, band: "A" as Band, effect: { account: "clean" } as Effect,
      response: "He begins with the sound of engines before dawn and works forward at his own pace. It is his account, in his words, and it is usable.", feedback: "The widest opener costs nothing and protects everything you build on it." },
    { id: "funnel", label: '"Let\'s get the facts down first — what time did the vehicles arrive, how many, and what colour were they?"', quality: "partly" as Quality, crit: "S_OPEN" as CritKey, band: "C" as Band, effect: { account: "narrowed" } as Effect,
      response: "Structured questioning is right — later. As the opener it forecloses his narrative; he answers your three questions and stops, and you never hear the two things you did not know to ask. Right technique, wrong moment.", feedback: "Closed questions have their place after the free account, not instead of it. Right in substance, wrong in timing." },
    { id: "lead", label: '"They forced you off your land at gunpoint, didn\'t they?"', quality: "not" as Quality, crit: "S_OPEN" as CritKey, band: "F" as Band, effect: { account: "led" } as Effect,
      response: "He agrees — you offered him the words and he is trying to help. The core of his account is now something you put in his mouth, and it is marked unusable. It will appear flagged in the record you build in Lesson 7.", feedback: "A leading question manufactures the answer. This is irreversible for that fact." },
    { id: "detail", label: '"Describe exactly what they did to your neighbours — everything you saw, in as much detail as you can."', quality: "not" as Quality, crit: "S_OPEN" as CritKey, band: "E" as Band, effect: { account: "overreach" } as Effect,
      response: "He relives detail your file does not require and is visibly distressed. You have harmed him to collect what you will never use.", feedback: "Proportionality is not only about time; opening on graphic detail is a harm, not thoroughness." },
  ] as Move[],
};

// L3 — proportionality: routing decision per item (Ask / Don't ask), all at once
interface L3Item { id: string; label: string; best: "ask" | "skip"; options: { ask: { quality: Quality; band: Band; response: string; feedback: string; overreach?: boolean }; skip: { quality: Quality; band: Band; response: string; feedback: string } }; }
const L3_ITEMS: L3Item[] = [
  { id: "location", label: "Where exactly was he standing when he saw the vehicles?", best: "ask",
    options: {
      ask: { quality: "sound", band: "A", response: "Asked. It bears directly on what he could and could not have seen — reliability.", feedback: "Ask what tests the account's reliability." },
      skip: { quality: "partly", band: "C", response: "Skipped. You lose a cheap, important reliability anchor.", feedback: "Vantage point is core, not optional." },
    } },
  { id: "markings", label: "Any markings, letters or insignia on the vehicles?", best: "ask",
    options: {
      ask: { quality: "sound", band: "A", response: "Asked. Markings go to linkage — whose vehicles, under whose control.", feedback: "Ask what bears on linkage." },
      skip: { quality: "partly", band: "C", response: "Skipped. You may have lost the one detail that ties the act to a unit.", feedback: "Linkage detail is worth asking for." },
    } },
  { id: "injuries", label: "Ask him to describe, in detail, the injuries to the bodies he mentioned.", best: "skip",
    options: {
      ask: { quality: "not", band: "E", response: "Asked. He describes what your file does not need and carries the image out of the room with him. This is taken from him for nothing.", feedback: "Graphic detail the file will not use is a harm, not evidence.", overreach: true },
      skip: { quality: "sound", band: "A", response: "Left. If a medico-legal examination is needed it is done by the right specialist, not extracted here.", feedback: "Leaving detail the file does not need is a skill, not a gap." },
    } },
  { id: "family", label: "Ask how his children reacted and how he is coping now.", best: "skip",
    options: {
      ask: { quality: "not", band: "E", response: "Asked. It opens distress the file has no use for and no plan to hold.", feedback: "Do not open wounds you did not come to treat and cannot close.", overreach: true },
      skip: { quality: "sound", band: "A", response: "Left. Care for him belongs in the referral, not in the evidential record.", feedback: "Compassion is the referral's job, not the interview's questions." },
    } },
  { id: "timeanchor", label: "Roughly what time was this, and how does he know?", best: "ask",
    options: {
      ask: { quality: "sound", band: "A", response: "Asked. Time plus how he knows it anchors the sequence without leading.", feedback: "Anchor time to something he can source." },
      skip: { quality: "partly", band: "C", response: "Skipped. The sequence is harder to stand up later.", feedback: "A sourced time is worth one question." },
    } },
];

// L4 — disclosure: branching beat
const L4_DISC = {
  stage: "Partway through, Mr H. says quietly that when they held him for two days, he was beaten. He had not mentioned it before. This is not what you came for, and he has just handed you something heavy.",
  constraint: "He is mid-account, he trusts you enough to have said it, and the clock and the file are both pulling you elsewhere.",
  theory: "Consent is continuous, not a form signed once. A disclosure of ill-treatment changes what he is consenting to; it is acknowledged and routed, never mined on the spot.",
  authorities: ["ISTANBUL", "MURAD", "RECORD"],
  moves: [
    { id: "handle", label: 'Pause, acknowledge it, check he wants to continue, remind him he can stop, note it for the specialist pathway (Istanbul Protocol) — do not take the detail now.', quality: "sound" as Quality, crit: "S_DISC" as CritKey, band: "A" as Band, effect: { disclosure: "handled", reconsented: true } as Effect,
      response: "He exhales. He stays in control of what happens next, the disclosure is safely routed to where it can be handled properly, and your account continues on his terms.", feedback: "Acknowledge, re-consent, route. You are not the right place for that examination and you do not need to be." },
    { id: "press", label: '"That\'s important — tell me exactly what they did, while it\'s fresh. Describe the beating in detail."', quality: "not" as Quality, crit: "S_DISC" as CritKey, band: "F" as Band, effect: { disclosure: "pressed", reconsented: false } as Effect,
      response: "You mine the detail. He gives it and leaves the room worse than he entered, and the account he did consent to is now tangled with one he did not. This is recorded as harm.", feedback: "Never convert a disclosure into an interrogation. The harm is irreversible." },
    { id: "redirect", label: '"I understand. Let\'s keep to the vehicles and the grain for now."', quality: "partly" as Quality, crit: "S_DISC" as CritKey, band: "C" as Band, effect: { disclosure: "redirected", reconsented: false } as Effect,
      response: "Proportionality says do not chase the detail — and you are half right. But steering straight past it, without acknowledging what he just trusted you with, tells him the hardest thing he said did not matter. Right instinct on scope, wrong in register.", feedback: "Not taking the detail is correct. Not acknowledging the person is not. Right substance, wrong register." },
    { id: "assure", label: '"I promise you the men who did this will be punished for it."', quality: "not" as Quality, crit: "S_DISC" as CritKey, band: "E" as Band, effect: { disclosure: "pressed", reconsented: false } as Effect,
      response: "A promise you cannot keep, offered to comfort. If it does not come true he learns his account bought nothing, and your credibility with the next witness goes with it.", feedback: "Never trade an outcome you do not control for a moment's comfort (do no harm)." },
  ] as Move[],
};

// L5 — Socratic checkpoint
const L5 = {
  prompt: "You have just handled Mr H.'s disclosure that he was beaten in detention. Justify what you did and did not do, and why.",
  authoredProbe: "You have described what you did for the file — what did your response do for the man, and how would he know he was still in control of this?",
  modelReasoning: "One competent answer, not the answer. The disclosure is not a windfall to be worked; it is a moment where the person has to be kept in control of his own account. The task is to acknowledge it plainly so he knows it landed, to renew consent because what he is agreeing to has just changed, to route the detail to the pathway built to hold it, and to offer support — without extracting anything the file did not come for. The failure that looks like diligence is pressing for detail; the failure that looks like discipline is steering past it as if it were noise. Where your reasoning weighed his safety or his control more finely than this, keep yours.",
  note: "Your written answers here are read by your coach and are never scored by the platform.",
};

// L6 — preservation before displacement: matching between mutually exclusive mechanisms
interface L6Option { id: string; label: string; quality: Quality; band: Band; preserve: World["preserve"]; response: string; }
const L6 = {
  stage: "At the end, Mr H. tells you he is being relocated tomorrow to an oblast in the west. You may not see him again, and his account is not yet preserved in any form that will survive his leaving.",
  constraint: "You have this evening. Choose the mechanism — they are mutually exclusive in practice, and the wrong one does not delay the material, it loses it.",
  authorities: ["CPC_225"],
  options: [
    { id: "art225", label: "Apply this evening to have his testimony taken and preserved before the investigating judge (art. 225), before he leaves.", quality: "sound" as Quality, band: "A" as Band, preserve: "art225" as World["preserve"],
      response: "Lodged. His testimony is preserved in a form that survives his displacement and can be relied on if he cannot return." },
    { id: "written", label: "Have him sign a written statement now and place it in the file.", quality: "partly" as Quality, band: "C" as Band, preserve: "written" as World["preserve"],
      response: "Better than nothing, but a signed statement is not preservation before the investigating judge; its evidential weight if he never returns is far weaker, and you had the time to do it properly." },
    { id: "reinterview", label: "Plan to re-interview him by phone once he has relocated and settled.", quality: "not" as Quality, band: "E" as Band, preserve: "wrong" as World["preserve"],
      response: "The number changes, the line does not connect, the moment passes. This does not delay the testimony — it loses it." },
    { id: "recording", label: "Rely on your interview recording as the preserved record.", quality: "not" as Quality, band: "E" as Band, preserve: "wrong" as World["preserve"],
      response: "An interview recording is not a preservation mechanism before the court. If he is gone, you are left with something that may never be admitted." },
  ] as L6Option[],
};

/* ---------------------------------------------------------------------------
 * PRESENTATION HELPERS
 * ------------------------------------------------------------------------- */
function StatusTag({ status }: { status: "stable" | "confirm" | "practice" }) {
  const map = { stable: { t: "verified · stable", c: "ok" }, confirm: { t: "SIGN-OFF PENDING · confirm", c: "warn" }, practice: { t: "practice layer · SME", c: "warn" } } as const;
  const m = map[status] || map.confirm;
  return <span className={`tag tag-${m.c}`}>{m.t}</span>;
}
function AuthorityLine({ keys }: { keys?: string[] }) {
  if (!keys || !keys.length) return null;
  return (
    <div className="authorities" aria-label="Source authorities for this lesson">
      <span className="authorities-h">Authorities</span>
      <ul>{keys.map((k) => { const a = AUTHORITIES[k]; if (!a) return null; return (<li key={k}><span className="auth-ref">{a.ref}</span> <StatusTag status={a.status} /><span className="auth-note"> — {a.note}</span></li>); })}</ul>
    </div>
  );
}
function QGlyph({ q }: { q: Quality }) { const g = q === "sound" ? "●" : q === "partly" ? "◐" : "▲"; return <span className={"qglyph q-" + q} aria-hidden="true">{g}</span>; }
function qualityWord(q: Quality) { return q === "sound" ? "Sound" : q === "partly" ? "Partly sound" : "Not sound"; }
function SceneHead({ n, title, type, children }: { n: string; title: string; type: string; children: React.ReactNode }) {
  return (<div className="scene-head"><div className="scene-tags"><span className="scene-n">{n}</span><span className="scene-type">{type}</span></div><h2 className="scene-title">{title}</h2><p className="serif scene-body">{children}</p></div>);
}

/* ===========================================================================
 * MAIN PAGE
 * ========================================================================= */
const LESSONS = ["warning", "L1", "L2", "L3", "L4", "L5", "L6", "artifact", "result"] as const;
type StepId = (typeof LESSONS)[number];
const RAIL_LABELS: Record<StepId, string> = {
  warning: "Start here", L1: "1 · Consent", L2: "2 · Opening", L3: "3 · Proportionality",
  L4: "4 · Disclosure", L5: "5 · Checkpoint", L6: "6 · Preservation", artifact: "7 · Artifact", result: "Station result",
};

export default function DemoPEJ2() {
  const [contrast, setContrast] = useState(false);
  const [big, setBig] = useState(false);
  const [spacious, setSpacious] = useState(false);
  const [i, setI] = useState(0);
  const step = LESSONS[i];
  const topRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (topRef.current) topRef.current.focus(); }, [i]);

  const [world, setWorld] = useState<World>({ ...EMPTY_WORLD });
  const [record, setRecord] = useState<Partial<Record<CritKey, Band>>>({});
  const applyEffect = (eff: Effect) => setWorld((w) => ({ ...w, ...(eff || {}) }));
  const scoreCrit = (crit: CritKey | null | undefined, band: Band) => { if (crit) setRecord((r) => ({ ...r, [crit]: band })); };

  const [alignOpen, setAlignOpen] = useState(false);
  const go = (d: number) => setI((x) => Math.max(0, Math.min(LESSONS.length - 1, x + d)));
  const rootClass = ["pej", contrast ? "hc" : "", big ? "big" : "", spacious ? "sp" : ""].join(" ");

  return (
    <div className={rootClass}>
      <style>{CSS}</style>
      <header className="mod-head">
        <div className="mod-head-row">
          <div>
            <div className="mod-id"><button type="button" className="back-lnk" onClick={exitStation}>← Exit station</button><span className="mod-id-code">PEJ-EVD-01 · Module 2</span></div>
            <h1 className="mod-title">Getting the account</h1>
          </div>
          <div className="mod-meta">
            <span className="tag tag-warn">v0.1-demo · SME sign-off PENDING</span>
            <button className="lnk" onClick={() => setAlignOpen((v) => !v)} aria-expanded={alignOpen}>{alignOpen ? "Hide alignment" : "Alignment"}</button>
          </div>
        </div>
        <p className="mod-task"><strong>Task:</strong> take a witness's account so consent is informed and continuous, the account is in his own words, only proportionate detail is taken, a disclosure is handled without harm, and the testimony is preserved before he is displaced.</p>
        <div className="a11y" role="group" aria-label="Presentation controls">
          <button aria-pressed={big} onClick={() => setBig((v) => !v)} className={big ? "on" : ""}>Text size</button>
          <button aria-pressed={contrast} onClick={() => setContrast((v) => !v)} className={contrast ? "on" : ""}>High contrast</button>
          <button aria-pressed={spacious} onClick={() => setSpacious((v) => !v)} className={spacious ? "on" : ""}>Generous spacing</button>
          <span className="a11y-note">No timers. State is held while you move; you can leave any scenario without losing progress.</span>
        </div>
      </header>

      {alignOpen && <AlignmentPanel />}

      <nav className="rail" aria-label="Lesson progress">
        {LESSONS.map((l, idx) => (
          <button key={l} className={"rail-dot " + (idx === i ? "cur" : idx < i ? "done" : "")} aria-current={idx === i ? "step" : undefined} onClick={() => setI(idx)} title={RAIL_LABELS[l]}>
            <span className="rail-n">{idx === 0 ? "!" : idx}</span><span className="rail-l">{RAIL_LABELS[l]}</span>
          </button>
        ))}
      </nav>

      <main className="stage" tabIndex={-1} ref={topRef} aria-live="polite">
        {step === "warning" && <Warning onStart={() => go(1)} />}
        {step === "L1" && <LessonConsent world={world} apply={applyEffect} score={scoreCrit} onDone={() => go(1)} />}
        {step === "L2" && <LessonBranch beat={L2_OPEN} label="Your opening move with Mr H." apply={applyEffect} score={scoreCrit} onDone={() => go(1)} />}
        {step === "L3" && <LessonProportionality world={world} apply={applyEffect} score={scoreCrit} onDone={() => go(1)} />}
        {step === "L4" && <LessonBranch beat={L4_DISC} label="Your response to the disclosure" apply={applyEffect} score={scoreCrit} onDone={() => go(1)} />}
        {step === "L5" && <LessonSocratic onDone={() => go(1)} />}
        {step === "L6" && <LessonPreservation apply={applyEffect} score={scoreCrit} onDone={() => go(1)} />}
        {step === "artifact" && <LessonArtifact world={world} score={scoreCrit} onDone={() => go(1)} />}
        {step === "result" && <StationResult record={record} onRestart={() => { setI(0); setWorld({ ...EMPTY_WORLD }); setRecord({}); }} />}
      </main>

      <footer className="foot">
        <button className="btn ghost" onClick={() => go(-1)} disabled={i === 0}>← Back</button>
        <span className="foot-mid">{RAIL_LABELS[step]} · {i === 0 ? "start" : `${i} of ${LESSONS.length - 1}`}</span>
        <button className="btn" onClick={() => go(1)} disabled={i === LESSONS.length - 1}>Next →</button>
      </footer>
    </div>
  );
}

function Warning({ onStart }: { onStart: () => void }) {
  return (
    <section className="card lead">
      <h2>Before you begin</h2>
      <p className="serif">This module composes an interview from the full-scale invasion of Ukraine that began in February 2022, recognising that the armed conflict began in 2014. Mr H. and everything he says are a composite: no real person, place or unit is used, and names are given as initials.</p>
      <p>The material includes a disclosure of ill-treatment. You may leave any scenario at any point without losing your progress. Nothing you do here is reported to your institution, and no model ever speaks in the witness's voice — every line he says is authored.</p>
      <div className="row"><button className="btn big-btn" onClick={onStart}>Start the module</button></div>
    </section>
  );
}

/* ===========================================================================
 * L1 — CONSENT & SETUP (component selection)
 * ========================================================================= */
function LessonConsent({ world, apply, score, onDone }: { world: World; apply: (e: Effect) => void; score: (c: CritKey | null | undefined, b: Band) => void; onDone: () => void }) {
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const toggle = (id: string) => { if (!submitted) setPicked((p) => ({ ...p, [id]: !p[id] })); };
  const submit = () => {
    setSubmitted(true);
    const trapPicked = L1_COMPONENTS.some((c) => c.trap && picked[c.id]);
    const gotExplain = !!picked["explain_use"];
    const gotInterpreter = !!picked["interpreter_private"];
    let band: Band = "A";
    if (trapPicked || !gotExplain) band = "E";
    else if (!gotInterpreter) band = "C";
    score("P_CONSENT", band);
    apply({ consentInformed: gotExplain && gotInterpreter && !trapPicked, consentTrap: trapPicked, referralOffered: !!picked["referral_ready"] });
    score("P_REFERRAL", picked["referral_ready"] ? "A" : "E");
  };
  return (
    <section className="card">
      <SceneHead n="Lesson 1" title="Before a single word of the account, decide what you establish" type="Component selection · build informed consent">
        Mr H. is ready to talk now. It is tempting to let him start. Select what you put in place first. Some options feel like they protect the account; one or two of them destroy it.
      </SceneHead>
      <div className="checks">
        {L1_COMPONENTS.map((c) => (
          <label key={c.id} className={"check " + (submitted ? (c.correct ? "good" : (picked[c.id] ? "bad" : "muted")) : "")}>
            <input type="checkbox" checked={!!picked[c.id]} onChange={() => toggle(c.id)} disabled={submitted} />
            <span className="check-box" aria-hidden="true">{picked[c.id] ? "✓" : ""}</span>
            <span className="check-label">{c.label}{submitted && (<span className="check-note"> — {c.correct ? "Belongs. " : (c.trap ? "Trap. " : "Overreach. ")}{c.note}</span>)}</span>
          </label>
        ))}
      </div>
      <AuthorityLine keys={["MURAD", "REFERRAL", "RECORD"]} />
      {!submitted ? (
        <div className="row"><button className="btn" onClick={submit} disabled={Object.values(picked).every((v) => !v)}>Establish consent</button></div>
      ) : (
        <div className="row"><p className="carry">{world.consentTrap ? "A consent trap taints everything the interview produces — a non-negotiable failure regardless of how well the rest goes." : "Consent is recorded as informed and revocable, and carries forward."}</p><button className="btn" onClick={onDone}>Continue →</button></div>
      )}
    </section>
  );
}

/* ===========================================================================
 * SHARED BRANCHING BEAT (used by L2 opening and L4 disclosure)
 * ========================================================================= */
function LessonBranch({ beat, label, apply, score, onDone }: { beat: { stage: string; constraint: string; theory: string; authorities: string[]; moves: Move[] }; label: string; apply: (e: Effect) => void; score: (c: CritKey | null | undefined, b: Band) => void; onDone: () => void }) {
  const [chosen, setChosen] = useState<Move | null>(null);
  const commit = (m: Move) => { if (chosen) return; setChosen(m); apply(m.effect); if (m.crit) score(m.crit, m.band); };
  const isDisclosure = beat === L4_DISC;
  return (
    <section className="card">
      <SceneHead n={isDisclosure ? "Lesson 4" : "Lesson 2"} title={isDisclosure ? "He has just told you something he did not come to say" : "How you open decides whether his account can be used"} type="Branching decision beat · live interaction">{beat.stage}</SceneHead>
      <p className="constraint"><strong>What is scarce:</strong> {beat.constraint}</p>
      {!chosen ? (
        <div className="moves" role="group" aria-label={label}>{beat.moves.map((m) => (<button key={m.id} className="move" onClick={() => commit(m)}>{m.label}</button>))}</div>
      ) : (
        <div className={"outcome q-" + chosen.quality}>
          <div className="outcome-h"><QGlyph q={chosen.quality} /> {qualityWord(chosen.quality)}</div>
          <p className="serif">{chosen.response}</p>
          <p className="fb"><strong>Rule:</strong> {chosen.feedback}</p>
          <p className="theory"><strong>Why:</strong> {beat.theory}</p>
        </div>
      )}
      <AuthorityLine keys={beat.authorities} />
      {chosen && (<div className="row"><button className="btn" onClick={onDone}>Continue →</button></div>)}
    </section>
  );
}

/* ===========================================================================
 * L3 — PROPORTIONALITY (routing per item: Ask / Don't ask)
 * ========================================================================= */
function LessonProportionality({ world, apply, score, onDone }: { world: World; apply: (e: Effect) => void; score: (c: CritKey | null | undefined, b: Band) => void; onDone: () => void }) {
  const [choices, setChoices] = useState<Record<string, "ask" | "skip">>({});
  const decideAll = L3_ITEMS.every((it) => choices[it.id]);
  const commit = (id: string, k: "ask" | "skip") => { if (choices[id]) return; setChoices((c) => ({ ...c, [id]: k })); };
  const finish = () => {
    let overreach = false; const bands: Band[] = [];
    for (const it of L3_ITEMS) { const opt = it.options[choices[it.id]]; bands.push(opt.band); if ((opt as { overreach?: boolean }).overreach) overreach = true; }
    // Proportionality band: any overreach fails to E; otherwise the mean of item bands, floored to a band.
    let band: Band = "A";
    if (overreach) band = "E";
    else { const mv = bands.reduce((a, b) => a + BAND_VALUE[b], 0) / bands.length; band = mv >= 4.5 ? "A" : mv >= 3.5 ? "B" : "C"; }
    apply({ propOverreach: overreach });
    score("S_PROP", band);
    onDone();
  };
  return (
    <section className="card">
      <SceneHead n="Lesson 3" title="His account is running — decide what you ask and what you leave" type="Routing decision · every question at once">
        Below are questions you could ask next. They are shown together, the way they occur to you in the moment. For each, decide whether to ask it or leave it. Taking more than the file needs costs you here.
      </SceneHead>
      <div className="items">
        {L3_ITEMS.map((it) => {
          const chosen = choices[it.id];
          const opt = chosen ? it.options[chosen] : null;
          return (
            <div key={it.id} className={"item " + (chosen ? "resolved" : "")}>
              <div className="item-label">{it.label}</div>
              {!chosen ? (
                <div className="opts" role="group" aria-label={"Decision for: " + it.label}>
                  <button className="opt" onClick={() => commit(it.id, "ask")}>Ask it</button>
                  <button className="opt" onClick={() => commit(it.id, "skip")}>Leave it</button>
                </div>
              ) : (
                <div className={"outcome q-" + opt!.quality}>
                  <div className="outcome-h"><QGlyph q={opt!.quality} /> {chosen === "ask" ? "Asked" : "Left"} · {qualityWord(opt!.quality)}</div>
                  <p className="serif">{opt!.response}</p>
                  <p className="fb"><strong>Rule:</strong> {opt!.feedback}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <AuthorityLine keys={["MURAD", "RECORD"]} />
      {decideAll && (<div className="row"><p className="carry">Proportionality is a scored skill: the questions you chose not to ask count as much as the ones you did.</p><button className="btn" onClick={finish}>Continue →</button></div>)}
    </section>
  );
}

/* ===========================================================================
 * L5 — SOCRATIC CHECKPOINT
 * ========================================================================= */
function LessonSocratic({ onDone }: { onDone: () => void }) {
  const [a1, setA1] = useState("");
  const [phase, setPhase] = useState(0);
  const [probe, setProbe] = useState(L5.authoredProbe);
  const [a2, setA2] = useState("");
  const [loading, setLoading] = useState(false);
  const askProbe = async () => {
    setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "content-type": "application/json", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: "You are a Socratic coach for a qualified prosecutor. Read their written justification and return EXACTLY ONE probing question. Constraints: never say whether they were right; never contain the answer or the principle; introduce no new fact about the case; no praise; no moralising; one sentence; under 30 words; press on the least-examined part of what they wrote.\n\nTheir justification:\n" + a1 }] }),
      });
      const data = await res.json();
      const txt = data && data.content && data.content[0] && data.content[0].text;
      if (txt && String(txt).trim()) setProbe(String(txt).trim());
    } catch { /* authored fallback already set */ } finally { setLoading(false); setPhase(1); }
  };
  return (
    <section className="card">
      <SceneHead n="Checkpoint" title="Defend the decision you just took" type="Socratic checkpoint · read by your coach, never scored">This is placed immediately after your highest-stakes decision. There is no grade here.</SceneHead>
      <label className="q-label" htmlFor="soc1">{L5.prompt}</label>
      <textarea id="soc1" className="ta" rows={4} value={a1} onChange={(e) => setA1(e.target.value)} disabled={phase > 0} placeholder="Write in your own words…" />
      {phase === 0 && (<div className="row"><button className="btn" onClick={askProbe} disabled={a1.trim().length < 8 || loading}>{loading ? "…" : "Submit"}</button></div>)}
      {phase >= 1 && (
        <div className="probe">
          <div className="probe-h">One question back</div>
          <p className="serif">{probe}</p>
          {phase === 1 && (<><textarea className="ta" rows={3} value={a2} onChange={(e) => setA2(e.target.value)} placeholder="Answer again…" /><div className="row"><button className="btn" onClick={() => setPhase(3)} disabled={a2.trim().length < 4}>Submit</button></div></>)}
        </div>
      )}
      {phase === 3 && (
        <div className="model">
          <div className="model-h">One competent answer — not the answer</div>
          <p className="serif">{L5.modelReasoning}</p>
          <p className="fb">Where your reasoning is better than this, keep yours.</p>
          <p className="a11y-note">{L5.note}</p>
          <div className="row"><button className="btn" onClick={onDone}>Continue →</button></div>
        </div>
      )}
    </section>
  );
}

/* ===========================================================================
 * L6 — PRESERVATION (matching between mutually exclusive mechanisms)
 * ========================================================================= */
function LessonPreservation({ apply, score, onDone }: { apply: (e: Effect) => void; score: (c: CritKey | null | undefined, b: Band) => void; onDone: () => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const [committed, setCommitted] = useState(false);
  const commit = () => {
    if (!pick) return;
    setCommitted(true);
    const opt = L6.options.find((o) => o.id === pick)!;
    apply({ preserve: opt.preserve });
    score("P_PRESERVE", opt.band);
  };
  const chosen = committed ? L6.options.find((o) => o.id === pick) : null;
  return (
    <section className="card">
      <SceneHead n="Lesson 6" title="He leaves tomorrow — preserve the testimony or lose it" type="Matching · mutually exclusive mechanisms">{L6.stage}</SceneHead>
      <p className="constraint"><strong>What is scarce:</strong> {L6.constraint}</p>
      <ol className="chain" role="radiogroup" aria-label="Choose the preservation mechanism">
        {L6.options.map((o) => (
          <li key={o.id}>
            <label className={"chain-step " + (committed ? (o.quality === "sound" ? "is-good" : (pick === o.id ? "wrong" : "")) : (pick === o.id ? "sel" : ""))}>
              <input type="radio" name="preserve" disabled={committed} checked={pick === o.id} onChange={() => setPick(o.id)} />
              <span className="chain-text">{o.label}</span>
              {committed && (pick === o.id || o.quality === "sound") && <span className={"chain-note " + (o.quality === "sound" ? "good-note" : "")}> {o.response}</span>}
            </label>
          </li>
        ))}
      </ol>
      <AuthorityLine keys={L6.authorities} />
      {!committed ? (
        <div className="row"><button className="btn" onClick={commit} disabled={!pick}>Commit to this mechanism</button></div>
      ) : (
        <div className="row"><p className="carry">{chosen && chosen.quality === "sound" ? "The testimony is preserved before he leaves." : "The mechanism you chose does not survive his displacement — the testimony is at risk of being lost, not merely delayed. This is a non-negotiable failure."}</p><button className="btn" onClick={onDone}>Continue →</button></div>
      )}
    </section>
  );
}

/* ===========================================================================
 * L7 — ARTIFACT (Does)
 * ========================================================================= */
function LessonArtifact({ world, score, onDone }: { world: World; score: (c: CritKey | null | undefined, b: Band) => void; onDone: () => void }) {
  const [ack, setAck] = useState(false);
  const consentLine = world.consentTrap
    ? { txt: "Consent — compromised (covert recording or promised outcome). Account obtained under it is UNUSABLE.", flag: true }
    : world.consentInformed ? { txt: "Consent — informed and revocable; use explained, right to stop recorded.", flag: false }
    : { txt: "Consent — incomplete; the account was opened before consent was fully established.", flag: true };
  const accountMap: Record<string, { txt: string; flag: boolean }> = {
    clean: { txt: "Account — taken open, in his own words. USABLE.", flag: false },
    narrowed: { txt: "Account — funnelled into closed questions early; narrower than it should be. Usable but thin.", flag: false },
    led: { txt: "Account — core fact obtained by a leading question. MARKED UNUSABLE.", flag: true },
    overreach: { txt: "Account — opened on graphic detail beyond the file's need. Review for proportionality and harm.", flag: true },
    null: { txt: "Account — not taken.", flag: true },
  };
  const disclosureMap: Record<string, { txt: string; flag: boolean }> = {
    handled: { txt: "Disclosure of ill-treatment — acknowledged, consent renewed, routed to the specialist pathway.", flag: false },
    redirected: { txt: "Disclosure of ill-treatment — steered past without acknowledgement. Review: continuous consent / do-no-harm.", flag: true },
    pressed: { txt: "Disclosure of ill-treatment — pressed for detail or met with a false assurance. Harm recorded.", flag: true },
    null: { txt: "Disclosure of ill-treatment — none recorded in this run.", flag: false },
  };
  const lines: { txt: string; flag: boolean }[] = [
    consentLine,
    accountMap[world.account ?? "null"],
    { txt: world.propOverreach ? "Proportionality — detail beyond the file's need was taken. Flag for review." : "Proportionality — only file-relevant detail taken.", flag: world.propOverreach },
    disclosureMap[world.disclosure ?? "null"],
    { txt: world.referralOffered ? "Support — referral pathway offered." : "Support — no referral pathway offered. Flag.", flag: !world.referralOffered },
    world.preserve === "art225" ? { txt: "Preservation — art. 225 request lodged before displacement.", flag: false }
      : world.preserve === "written" ? { txt: "Preservation — signed statement only; weaker if he does not return. Review.", flag: true }
      : { txt: "Preservation — testimony NOT preserved before displacement. At risk of being lost.", flag: true },
  ];
  return (
    <section className="card">
      <SceneHead n="Lesson 7" title="Produce the record you would actually file" type="Artifact · transfers to your live caseload">
        The one page that leaves the module, assembled from your decisions — nothing added. Compromised items are flagged for you, not hidden from you. In the live module a redacted version uploads to your coach; no case material is stored on the platform.
      </SceneHead>
      <div className="artifact" aria-label="Interview record and consent log">
        <div className="artifact-h"><div>Interview record & consent log</div><div className="artifact-sub">PEJ-EVD-01 · composite witness · initials only · no real case data</div></div>
        <ul className="artifact-list">{lines.map((l, idx) => (<li key={idx} className={l.flag ? "flagged" : ""}>{l.flag && <span className="flag" aria-label="flagged">⚑ flagged</span>}{l.txt}</li>))}</ul>
      </div>
      <label className="check standalone">
        <input type="checkbox" checked={ack} onChange={() => { setAck(!ack); if (!ack) score(null, "A"); }} />
        <span className="check-box" aria-hidden="true">{ack ? "✓" : ""}</span>
        <span className="check-label">I have reviewed the flags and would file this record as it stands (in the live module this uploads to your coach).</span>
      </label>
      <div className="row"><button className="btn" onClick={onDone} disabled={!ack}>See my station result →</button></div>
    </section>
  );
}

/* ===========================================================================
 * STATION RESULT
 * ========================================================================= */
function StationResult({ record, onRestart }: { record: Partial<Record<CritKey, Band>>; onRestart: () => void }) {
  const rows = (Object.keys(CRITERIA) as CritKey[]).map((key) => { const band = record[key] || "F"; return { key, ...CRITERIA[key], band, value: BAND_VALUE[band] }; });
  const failedNN = rows.filter((r) => r.nonNegotiable && r.value < 3);
  const skills = rows.filter((r) => r.stream === "Skills");
  const proc = rows.filter((r) => r.stream === "Application of procedure or law");
  const mean = (arr: typeof rows) => arr.length ? (arr.reduce((a, r) => a + r.value, 0) / arr.length) : 0;
  const stationPass = failedNN.length === 0 && mean(skills) >= 3 && mean(proc) >= 3;
  return (
    <section className="card">
      <SceneHead n="Station result" title="Computed from the decisions you took" type="No separate quiz · two streams, weighted equally">
        Each criterion is banded and reported on its own. Bands: A=5 … F=0; C is the marginal pass.
      </SceneHead>
      <div className={"verdict " + (stationPass ? "pass" : "fail")}>{stationPass ? "STATION PASSED — every non-negotiable held and both streams reached the marginal pass." : (failedNN.length ? "STATION NOT PASSED — a non-negotiable failed. It does not compensate: it fails the station regardless of every other band." : "STATION NOT PASSED — a stream fell below the marginal pass.")}</div>
      {failedNN.length > 0 && (<ul className="nn-list">{failedNN.map((r) => <li key={r.key}><strong>Non-negotiable failed:</strong> {r.label}</li>)}</ul>)}
      {([["Skills", skills], ["Application of procedure or law", proc]] as const).map(([name, arr]) => (
        <div key={name} className="stream">
          <h3>{name} <span className="stream-mean">mean {mean(arr).toFixed(1)}/5</span></h3>
          <table className="bands">
            <thead><tr><th>Criterion</th><th>Band</th><th>Indicator you met / missed</th></tr></thead>
            <tbody>{arr.map((r) => (<tr key={r.key} className={r.value < 3 ? "low" : ""}><td>{r.label}{r.nonNegotiable && <span className="nn"> · non-negotiable</span>}</td><td className="band-cell"><span className={"band b-" + r.band}>{r.band}</span></td><td className="ind">{r.value >= 3 ? r.indicators.competent : r.indicators.not}</td></tr>))}</tbody>
          </table>
        </div>
      ))}
      <p className="a11y-note">Nothing on this page is reported to your institution.</p>
      <div className="jobaid">
        <div className="jobaid-h">Job aid — taking a witness's account (one page, no theory)</div>
        <ol>
          <li><strong>Consent before the account.</strong> Explain the use, who sees it, and the right to stop at any time. Private space, trusted interpreter, referral to hand. Never record covertly. Never promise an outcome.</li>
          <li><strong>Open before closed.</strong> "Take me to that morning, in your own words." Let the free account exist before you structure it. A fact you supply is a fact you cannot rely on.</li>
          <li><strong>Take only what the file needs.</strong> Ask what bears on reliability and linkage. Leave graphic and personal detail — that is the referral's job, not the interview's.</li>
          <li><strong>A disclosure is not a windfall.</strong> Acknowledge it, renew consent, route the detail to the specialist pathway (Istanbul Protocol), offer support. Do not press. Do not steer past it as if unheard.</li>
          <li><strong>Preserve before displacement.</strong> If the witness may leave, lodge the art. 225 request before they go. A plan to re-interview later loses the testimony, it does not delay it.</li>
          <li><strong>Record in his words.</strong> His account, not your inference. Flag anything obtained under compromised consent.</li>
        </ol>
        <div className="jobaid-f">Authorities carry sign-off status. Confirm every "confirm"-tagged article and verify local referral pathways before operational use. Law last verified: pending SME · v0.1-demo.</div>
      </div>
      <div className="row"><button className="btn ghost" onClick={onRestart}>Run the station again</button></div>
    </section>
  );
}

/* ===========================================================================
 * ALIGNMENT PANEL (Part G)
 * ========================================================================= */
const ALIGNMENT = [
  { o: "O1 [Knows how] Establish informed, revocable consent before any account is taken.", tested: "Lesson 1 — component selection with consent-destroying traps.", success: "'Explain use / right to stop' selected AND zero traps; missing the explain-use component or selecting any trap scores E.", why: "Consent is a constructed product, not a fact to recognise; selecting components (and rejecting traps that feel protective) tests the construction, which a definition question could not." },
  { o: "O2 [Shows how] Open the account so no fact enters through a leading question.", tested: "Lesson 2 — branching decision beat; the opening persists into the Lesson 7 record.", success: "Wide opener (band A); any leading move marks the account UNUSABLE and flags it in the artifact (binary taint).", why: "Only a live branching beat can make usability depend on the participant's own words in the moment and carry the taint forward; a multiple-choice item cannot." },
  { o: "O3 [Shows how] Take only the detail the file needs.", tested: "Lesson 3 — routing decision per item; all questions shown at once.", success: "Neither graphic-injury nor family-trauma question asked; asking either sets overreach and scores E.", why: "Presenting every question at once reproduces the real cognitive condition in which overreach happens; the questions not asked are scored as heavily as those asked, which is what proportionality is." },
  { o: "O4 [Shows how] Handle a disclosure of ill-treatment without harm; renew consent.", tested: "Lesson 4 — branching decision beat.", success: "Acknowledge + renew consent + route to specialist (band A); pressing for detail or a false assurance scores F/E.", why: "The competence is a live interpersonal judgment under a duty of care; only a branching beat with authored consequences can test acknowledging-and-routing versus mining-the-detail." },
  { o: "O5 [Knows how] Choose the mechanism that preserves the testimony before displacement.", tested: "Lesson 6 — matching between mutually exclusive mechanisms.", success: "art. 225 before the investigating judge chosen (band A); a re-interview or recording loses the material and scores E.", why: "The objective is choosing between mutually exclusive mechanisms where the wrong one loses the material; a matching/selection between them tests exactly that, not knowledge of what art. 225 says." },
  { o: "O6 [Does] Produce an interview record & consent log in which every consent/proportionality issue is flagged.", tested: "Lesson 7 — artifact assembled from prior decisions.", success: "Artifact filed with every compromised item visibly flagged; nothing added beyond the decisions taken.", why: "A Does objective can only be discharged by a produced artifact that carries the consequences of earlier choices; any other test measures intention, not performance." },
];
function AlignmentPanel() {
  return (
    <section className="align">
      <h2>Alignment record</h2>
      <p className="align-intro">Every lesson argues that its activity type tests <em>this</em> objective rather than something adjacent. Success is stated as a threshold or a binary, never as an adjective.</p>
      {ALIGNMENT.map((a, idx) => (
        <div key={idx} className="align-row">
          <div className="align-o">{a.o}</div>
          <div className="align-grid">
            <div><span className="align-k">How it is tested</span>{a.tested}</div>
            <div><span className="align-k">What success is</span>{a.success}</div>
            <div><span className="align-k">Why this activity type</span>{a.why}</div>
          </div>
        </div>
      ))}
      <div className="align-foot">
        <div><strong>Non-negotiables (partly conjunctive):</strong> informed consent (P_CONSENT), disclosure handled without harm (S_DISC), testimony preserved before displacement (P_PRESERVE). Each is irreversible in a real file; failing one fails the station.</div>
        <div className="mt"><strong>Review triggers:</strong> {REVIEW_TRIGGERS.join(" ")}</div>
      </div>
    </section>
  );
}

/* ===========================================================================
 * STYLE — single block, CSS custom properties, no utility framework.
 * (Shared visual system with Module 1.)
 * ========================================================================= */
const CSS = `
.pej{
  --ink:#1c2430; --paper:#f6f4ef; --card:#ffffff; --line:#d8d2c6;
  --accent:#2f5d63; --accent-2:#7a3b2e; --muted:#6b7280; --ok:#2f5d63; --warn:#7a3b2e;
  --serif: Georgia, 'Iowan Old Style', 'Times New Roman', serif;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --fs:16px; --sp:16px;
  color:var(--ink); background:var(--paper); font-family:var(--sans);
  font-size:var(--fs); line-height:1.5; min-height:100dvh; margin:0 auto; padding:20px 16px; max-width:900px;
}
.pej.big{ --fs:19px; }
.pej.sp{ --sp:24px; line-height:1.7; }
.pej.hc{ --paper:#ffffff; --ink:#000000; --card:#ffffff; --line:#000000; --accent:#003b46; --accent-2:#6a1b00; --muted:#333; }
.pej *{ box-sizing:border-box; }
.serif{ font-family:var(--serif); }
.pej button:focus-visible, .pej input:focus-visible, .pej textarea:focus-visible, .pej [tabindex]:focus-visible{ outline:3px solid var(--accent); outline-offset:2px; }
.mod-head{ border:1px solid var(--line); background:var(--card); border-radius:10px; padding:var(--sp); margin-bottom:12px; }
.mod-head-row{ display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-start; }
.mod-id{ font-size:.8em; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.back-lnk{ color:var(--accent); background:none; font:inherit; cursor:pointer; text-decoration:none; border:1px solid var(--line); border-radius:6px; padding:2px 8px; text-transform:none; letter-spacing:0; }
.mod-title{ font-family:var(--serif); font-size:1.7em; margin:.1em 0 0; }
.mod-meta{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.mod-task{ margin:.8em 0 0; }
.tag{ display:inline-block; font-size:.72em; padding:3px 8px; border-radius:999px; border:1px solid var(--line); white-space:nowrap; }
.tag-ok{ color:var(--ok); border-color:var(--ok); }
.tag-warn{ color:var(--warn); border-color:var(--warn); background:#faf3ef; }
.lnk{ background:none; border:1px solid var(--line); border-radius:8px; padding:6px 10px; cursor:pointer; font:inherit; color:var(--accent); }
.a11y{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:12px; padding-top:12px; border-top:1px solid var(--line); }
.a11y button{ font:inherit; font-size:.82em; padding:5px 10px; border:1px solid var(--line); border-radius:8px; background:var(--card); cursor:pointer; }
.a11y button.on{ background:var(--accent); color:#fff; border-color:var(--accent); }
.a11y-note{ font-size:.8em; color:var(--muted); }
.rail{ display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
.rail-dot{ display:flex; align-items:center; gap:6px; font:inherit; font-size:.8em; background:var(--card); border:1px solid var(--line); border-radius:999px; padding:5px 10px; cursor:pointer; color:var(--muted); }
.rail-dot .rail-n{ font-weight:700; width:1.4em; height:1.4em; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; border:1px solid var(--line); }
.rail-dot.cur{ color:var(--ink); border-color:var(--accent); }
.rail-dot.cur .rail-n{ background:var(--accent); color:#fff; border-color:var(--accent); }
.rail-dot.done{ color:var(--ink); }
.rail-dot.done .rail-n{ background:#e6ede9; }
.stage{ outline:none; }
.card{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:var(--sp); }
.scene-head{ margin-bottom:14px; }
.scene-tags{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:6px; }
.scene-n{ font-size:.72em; letter-spacing:.08em; text-transform:uppercase; color:#fff; background:var(--accent); padding:3px 8px; border-radius:6px; }
.scene-type{ font-size:.75em; color:var(--muted); border:1px solid var(--line); border-radius:6px; padding:3px 8px; }
.scene-title{ font-family:var(--serif); font-size:1.35em; margin:.1em 0 .3em; }
.scene-body{ font-size:1.02em; }
.constraint{ background:#faf3ef; border-left:3px solid var(--accent-2); padding:8px 12px; border-radius:0 8px 8px 0; }
.theory{ background:#eef2ef; border-left:3px solid var(--accent); padding:8px 12px; border-radius:0 8px 8px 0; }
.items{ display:flex; flex-direction:column; gap:12px; }
.item{ border:1px solid var(--line); border-radius:10px; padding:12px; }
.item.resolved{ background:#fbfaf7; }
.item-label{ font-family:var(--serif); font-size:1.05em; margin-bottom:8px; }
.opts{ display:flex; flex-direction:column; gap:8px; }
.opt, .move{ text-align:left; font:inherit; background:var(--card); border:1px solid var(--line); border-radius:8px; padding:10px 12px; cursor:pointer; }
.opt:hover, .move:hover{ border-color:var(--accent); }
.moves{ display:flex; flex-direction:column; gap:8px; }
.outcome{ border-radius:8px; padding:10px 12px; border:1px solid var(--line); }
.outcome.q-sound{ background:#eef4f1; border-color:var(--accent); }
.outcome.q-partly{ background:#f7f3ea; border-color:#b98a3a; }
.outcome.q-not{ background:#f7ece8; border-color:var(--accent-2); }
.outcome-h{ font-weight:700; margin-bottom:4px; display:flex; align-items:center; gap:6px; }
.qglyph{ font-size:1.1em; }
.q-sound{ color:var(--accent); } .q-partly{ color:#8a5a15; } .q-not{ color:var(--accent-2); }
.fb{ font-size:.92em; }
.authorities{ margin:14px 0 0; padding-top:10px; border-top:1px dashed var(--line); font-size:.86em; }
.authorities-h{ font-weight:700; text-transform:uppercase; letter-spacing:.06em; font-size:.82em; color:var(--muted); }
.authorities ul{ margin:6px 0 0; padding-left:16px; }
.authorities li{ margin:4px 0; }
.auth-ref{ font-weight:600; } .auth-note{ color:var(--muted); }
.checks{ display:flex; flex-direction:column; gap:8px; }
.check{ display:flex; gap:10px; align-items:flex-start; border:1px solid var(--line); border-radius:8px; padding:10px 12px; cursor:pointer; }
.check.standalone{ margin-top:12px; }
.check input{ position:absolute; opacity:0; width:1px; height:1px; }
.check-box{ flex:0 0 auto; width:20px; height:20px; border:2px solid var(--accent); border-radius:5px; display:inline-flex; align-items:center; justify-content:center; font-weight:700; color:var(--accent); }
.check.good{ background:#eef4f1; border-color:var(--accent); }
.check.bad{ background:#f7ece8; border-color:var(--accent-2); }
.check.muted{ opacity:.7; }
.check-note{ color:var(--muted); font-size:.9em; }
.chain{ list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px; }
.chain-step{ display:flex; gap:10px; align-items:flex-start; border:1px solid var(--line); border-radius:8px; padding:10px 12px; cursor:pointer; }
.chain-step.sel{ border-color:var(--accent); background:#eef4f1; }
.chain-step.is-good{ border-color:var(--accent); background:#eef4f1; }
.chain-step.wrong{ border-color:var(--accent-2); background:#f7ece8; }
.chain-note{ display:block; margin-top:6px; font-size:.9em; color:var(--accent-2); }
.chain-note.good-note{ color:var(--accent); }
.q-label{ display:block; font-weight:600; margin-bottom:6px; }
.ta{ width:100%; font:inherit; padding:10px; border:1px solid var(--line); border-radius:8px; resize:vertical; background:var(--card); }
.probe{ margin-top:14px; border-left:3px solid var(--accent); padding:8px 12px; background:#eef2ef; border-radius:0 8px 8px 0; }
.probe-h, .model-h{ font-weight:700; text-transform:uppercase; letter-spacing:.06em; font-size:.8em; color:var(--muted); margin-bottom:4px; }
.model{ margin-top:14px; border:1px solid var(--accent); border-radius:8px; padding:12px; background:#eef4f1; }
.artifact{ border:1px solid var(--ink); border-radius:8px; overflow:hidden; margin:6px 0 12px; }
.artifact-h{ background:var(--ink); color:#fff; padding:10px 12px; }
.artifact-sub{ font-size:.78em; opacity:.85; }
.artifact-list{ margin:0; padding:0; list-style:none; }
.artifact-list li{ padding:9px 12px; border-bottom:1px solid var(--line); font-size:.95em; }
.artifact-list li:last-child{ border-bottom:none; }
.artifact-list li.flagged{ background:#f7ece8; }
.flag{ color:var(--accent-2); font-weight:700; font-size:.82em; margin-right:8px; }
.verdict{ font-weight:700; padding:12px 14px; border-radius:8px; margin-bottom:12px; }
.verdict.pass{ background:#eef4f1; border:1px solid var(--accent); color:var(--accent); }
.verdict.fail{ background:#f7ece8; border:1px solid var(--accent-2); color:var(--accent-2); }
.nn-list{ margin:0 0 12px; padding-left:18px; color:var(--accent-2); }
.stream{ margin:14px 0; }
.stream h3{ font-family:var(--serif); margin:0 0 6px; display:flex; justify-content:space-between; align-items:baseline; }
.stream-mean{ font-family:var(--sans); font-size:.7em; color:var(--muted); font-weight:400; }
.bands{ width:100%; border-collapse:collapse; font-size:.9em; }
.bands th, .bands td{ text-align:left; padding:8px; border-bottom:1px solid var(--line); vertical-align:top; }
.bands th{ font-size:.82em; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
.bands tr.low td{ background:#faf3ef; }
.nn{ color:var(--accent-2); font-size:.85em; }
.band{ display:inline-flex; width:26px; height:26px; align-items:center; justify-content:center; border-radius:6px; font-weight:700; border:1px solid var(--line); }
.b-A,.b-B{ background:#e6ede9; color:var(--accent); }
.b-C{ background:#f3ecdd; color:#8a5a15; }
.b-D,.b-E,.b-F{ background:#f3ddd6; color:var(--accent-2); }
.ind{ color:var(--muted); }
.jobaid{ margin-top:16px; border:2px dashed var(--accent); border-radius:10px; padding:14px; background:#fbfdfc; }
.jobaid-h{ font-family:var(--serif); font-weight:700; margin-bottom:8px; }
.jobaid ol{ margin:0; padding-left:20px; }
.jobaid li{ margin:6px 0; }
.jobaid-f{ margin-top:10px; font-size:.82em; color:var(--muted); }
.align{ border:1px solid var(--accent); background:#fbfdfc; border-radius:10px; padding:var(--sp); margin-bottom:12px; }
.align h2{ font-family:var(--serif); margin:0 0 4px; }
.align-intro{ font-size:.92em; color:var(--muted); margin:0 0 12px; }
.align-row{ border-top:1px solid var(--line); padding:10px 0; }
.align-o{ font-weight:600; margin-bottom:8px; }
.align-grid{ display:grid; grid-template-columns:1fr; gap:8px; }
.align-k{ display:block; font-size:.74em; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
.align-foot{ border-top:1px solid var(--line); padding-top:10px; margin-top:6px; font-size:.9em; }
.mt{ margin-top:6px; }
.row{ display:flex; gap:12px; align-items:center; justify-content:flex-end; flex-wrap:wrap; margin-top:14px; }
.carry{ margin:0; margin-right:auto; font-size:.92em; color:var(--muted); max-width:60ch; }
.btn{ font:inherit; font-weight:600; background:var(--accent); color:#fff; border:1px solid var(--accent); border-radius:8px; padding:10px 16px; cursor:pointer; }
.btn:hover{ filter:brightness(1.06); }
.btn:disabled{ opacity:.45; cursor:not-allowed; }
.btn.ghost{ background:var(--card); color:var(--accent); }
.btn.big-btn{ padding:12px 22px; font-size:1.05em; }
.foot{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:14px; padding:10px 4px; }
.foot-mid{ font-size:.85em; color:var(--muted); }
@media (max-width:520px){ .pej{ padding:10px; } .mod-title{ font-size:1.4em; } .foot-mid{ display:none; } }
@media (min-width:640px){ .align-grid{ grid-template-columns:1fr 1fr 1fr; } }
@media (prefers-reduced-motion: reduce){ .pej *{ transition:none !important; animation:none !important; } }
`;
