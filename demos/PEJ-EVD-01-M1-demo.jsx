/*
 * =============================================================================
 * Synops Praxis · Justice-sector training module (DEMO)
 * =============================================================================
 * COURSE CODE:   PEJ-EVD-01
 * COURSE TITLE:  Evidence at the conflict-related crime scene
 * MODULE:        Module 1, Documenting the scene
 * VERSION:       0.1-demo (2026-08-13)
 * SME SIGN-OFF:  PENDING. No legal content in this build is settled. Article
 *                numbers marked "confirm" are placeholders for SME verification
 *                and must not be relied on operationally.
 *
 * PRIMARY LEARNERS:   Prosecutors and investigators in the four frontline
 *                     oblasts, working files under Criminal Code art. 438.
 *                     Experienced, formally educated, carrying live files.
 * SECONDARY LEARNERS: Investigating judges (via Bench view, not in this demo).
 *
 * THE PROFESSIONAL TASK (verb phrase):
 *   Document a conflict-related crime scene under field conditions so that the
 *   physical and digital evidence is admissible and the chain of custody is
 *   unbroken from the scene to the case file.
 *
 * OBJECTIVES (observable; condition / behaviour / criterion; competence level):
 *   O1 [Knows how]  Given a de-occupied site with a suspected explosive hazard,
 *                   sequence the first documentation actions so that no action
 *                   is taken on the hazard before EOD clearance (safety floor).
 *   O2 [Knows how]  Given the need to inspect under martial law, select the
 *                   components that constitute a lawful inspection and register
 *                   entry so that the record would survive a challenge to
 *                   admissibility.
 *   O3 [Shows how]  Given a cooperative witness at the scene, elicit an initial
 *                   account so that no fact enters the file through a leading
 *                   question.
 *   O4 [Shows how]  Given a colleague's seizure log, identify the single defect
 *                   in the chain of custody so that the exhibit's integrity is
 *                   preserved.
 *   O5 [Does]       On the participant's own material, produce a one-page
 *                   contemporaneous scene record and chain-of-custody memo in
 *                   which every tainted item is flagged, discharged by the
 *                   artifact (uploaded to the coach).
 *
 * DESIGN COMMITMENTS (Parts C-J of the master build prompt):
 *   - Task first, law second. Every lesson opens with a decision (C1).
 *   - Consequence, not correctness. A poor early move persists and costs the
 *     participant later; there is no "correct answer" button (C3).
 *   - Distractors are real field failures, never invented. Each lesson carries
 *     at least one option that is right in substance but wrong in timing or
 *     register (C4).
 *   - Conduct issues sit inside ordinary tasks and are never flagged (C5).
 *   - The station result is computed from decisions already taken. No bolt-on
 *     quiz (C6).
 *   - Every legal claim is tagged to an authority and shown as unsigned (C7).
 *   - Assessment: two equally weighted streams (Skills / Application of
 *     procedure or law), banded A-F per criterion, partly conjunctive on the
 *     non-negotiables (Part D).
 *   - Nothing here is reported to the participant's institution (Part D).
 *
 * AI BOUNDARIES (Part J, stated so they survive handover):
 *   - No real case material is ever sent to a model. Composites only, as an
 *     architectural boundary, not merely a policy. Names are initials.
 *   - The model never plays a survivor or victim. Counterpart lines are read
 *     from an authored ledger in this file.
 *   - The model never generates legal content. Every legal statement here is
 *     authored and tagged.
 *   - The one place a model is invoked (the Socratic probing question) is
 *     constrained to a published rubric, forbidden from introducing case facts,
 *     and degrades to an authored fallback question on any failure. The model
 *     answer in the checkpoint is AUTHORED, never generated.
 *   - Nothing a model produces affects a participant's standing.
 *
 * TECHNICAL (Part K): one self-contained .jsx, default export, no required
 * props, React hooks only, single <style> block with CSS custom properties, no
 * browser storage of any kind, serif for stage-setting / sans for interface.
 * =============================================================================
 */

import React, { useState, useMemo, useRef, useEffect } from "react";

/* ---------------------------------------------------------------------------
 * AUTHORED LEGAL / AUTHORITY LEDGER
 * Every provision referenced by a lesson is declared here once, with its
 * verification status, so an amendment is found by tag, not by re-reading the
 * module. Status is shown to the participant. "confirm" = not signed off.
 * ------------------------------------------------------------------------- */
const AUTHORITIES = {
  CPC_INSPECTION: {
    ref: "CPC of Ukraine, inspection & register entry",
    note: "Article numbers to be confirmed against current text.",
    status: "confirm",
  },
  CPC_615: {
    ref: "CPC of Ukraine, art. 615, regime under martial law",
    note: "Amended repeatedly during the full-scale invasion. Confirm current text.",
    status: "confirm",
  },
  CPC_225: {
    ref: "CPC of Ukraine, art. 225, preservation of evidence before the investigating judge",
    note: "Confirm, including known practice limitations.",
    status: "confirm",
  },
  BERKELEY: {
    ref: "Berkeley Protocol on Digital Open Source Investigations, seizure, isolation, hashing",
    note: "Stable.",
    status: "stable",
  },
  MINNESOTA: {
    ref: "Minnesota Protocol, examination of a body",
    note: "Confirm the corresponding domestic articles before use.",
    status: "confirm",
  },
  CUSTODY_PRACTICE: {
    ref: "Domestic evidential practice, contemporaneous record & chain of custody",
    note: "Practice layer. Must come from the SME; not settled here.",
    status: "practice",
  },
};

const REVIEW_TRIGGERS = [
  "Review on any amendment to CPC art. 225 or art. 615.",
  "Review on publication of a revised Berkeley Protocol.",
  "Review on any change to oblast scene-handling standing instructions.",
];

/* ---------------------------------------------------------------------------
 * ASSESSMENT MODEL (Part D)
 * Criteria carry a stream, whether they are non-negotiable (partly conjunctive),
 * and the published indicators shown to the participant. Bands A-F map 5..0.
 * ------------------------------------------------------------------------- */
const BAND_VALUE = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
const qualityToBand = (q) =>
  q === "sound" ? "B" : q === "partly" ? "C" : "E"; // not-sound -> E (fail band)

const CRITERIA = {
  X1: {
    label: "Safety floor, no action on a suspected hazard before clearance",
    stream: "Application of procedure or law",
    nonNegotiable: true,
    indicators: {
      competent: "Treats the suspected item as live; documents from distance; waits for EOD.",
      not: "Approaches, moves, or photographs the item at close range before clearance.",
    },
  },
  P1: {
    label: "Lawful basis for the inspection under martial law",
    stream: "Application of procedure or law",
    nonNegotiable: false,
    indicators: {
      competent: "Constitutes the inspection with a register entry and the correct martial-law regime.",
      not: "Proceeds on an informal basis, or invokes a regime that does not fit the situation.",
    },
  },
  S2: {
    label: "Non-suggestive elicitation of the initial account",
    stream: "Skills",
    nonNegotiable: true,
    indicators: {
      competent: "Opens wide, records in the witness's words, takes only what the file needs.",
      not: "Leads the witness, or takes detail the file does not need.",
    },
  },
  P2: {
    label: "Chain of custody / register entry unbroken",
    stream: "Application of procedure or law",
    nonNegotiable: true,
    indicators: {
      competent: "Every transfer and reseal has a register entry; no gap.",
      not: "A reseal, move, or handover with no corresponding entry.",
    },
  },
  P3: {
    label: "Digital device isolated and its integrity fixed",
    stream: "Application of procedure or law",
    nonNegotiable: false,
    indicators: {
      competent: "Device isolated from the network; a hash is taken and recorded.",
      not: "Device left connected, examined in place, or seized without a hash.",
    },
  },
  S3: {
    label: "Discrimination of a defect inside competent work",
    stream: "Skills",
    nonNegotiable: false,
    indicators: {
      competent: "Finds the one step that breaks integrity, not merely the untidy step.",
      not: "Flags cosmetic issues and misses the integrity break.",
    },
  },
};

/* ---------------------------------------------------------------------------
 * LESSON DATA (authored beats, content model from the kit, section 5)
 * Each interactive lesson declares its interaction type so the module can prove
 * it uses at least four different types and never the same type twice in a row.
 * ------------------------------------------------------------------------- */

// L1, Routing decision per item (all presented at once, to reproduce the real
// cognitive condition of load). Objective O1. Non-negotiable X1 lives here.
const L1_ITEMS = [
  {
    id: "device",
    label: "A mobile phone on the kitchen table, screen lit, connected to a network",
    // The sound-but-not-obvious move: isolate first, because integrity decays by the second.
    best: "isolate",
    options: {
      isolate: { quality: "sound", crit: "P3", band: "A", effect: { deviceHashed: true },
        response: "You put it into flight mode, photograph it in place, note the time, and bag it for a hash. Its integrity is fixed.",
        feedback: "A live, connected device is the one thing on a scene that degrades while you decide. It goes first." },
      later: { quality: "partly", crit: "P3", band: "C",
        response: "You leave it and come back after the walk-through. It has received two messages and dropped off the network in the meantime.",
        feedback: "Order the scene by decay rate, not by walking order." },
      examine: { quality: "not", crit: "P3", band: "E", effect: { deviceHandled: true },
        response: "You open it to check what is on it. The last-accessed times are now yours, not the suspect's.",
        feedback: "Examining in place writes your fingerprints into the metadata." },
    },
  },
  {
    id: "ordnance",
    label: "A metal object, fin-tailed, half-buried by the barn door",
    best: "leave",
    options: {
      leave: { quality: "sound", crit: "X1", band: "A", effect: {},
        response: "You mark a wide cordon, photograph from distance with a scale, and note it for EOD. You do not go near it.",
        feedback: "The safety floor is not a documentation choice. Suspected ordnance is live until EOD says otherwise." },
      photo_close: { quality: "not", crit: "X1", band: "F", effect: { safetyBreach: true },
        response: "You step in for a scale photograph.  This is the one move that ends the exercise in a real scene. It is recorded as a safety-floor breach.",
        feedback: "No image is worth standing over unexploded ordnance." },
      move: { quality: "not", crit: "X1", band: "F", effect: { safetyBreach: true },
        response: "You reposition it for a cleaner shot.  Recorded as a safety-floor breach.",
        feedback: "Never handle suspected ordnance. This is irreversible." },
    },
  },
  {
    id: "grain",
    label: "The emptied grain store, the substance of the alleged offence (art. 438)",
    best: "document",
    options: {
      document: { quality: "sound", crit: null, band: "B", effect: { sceneDocumented: true },
        response: "You photograph the emptied bays with scale and orientation, and record the residue and the tyre tracks at the loading door.",
        feedback: "The crime base is the reason you are here; document it before it weathers." },
      wait: { quality: "partly", crit: null, band: "C",
        response: "You hold off until the device and the ordnance are dealt with. Light is failing and you photograph it in poorer conditions.",
        feedback: "Some items decay faster than the crime base; the store is not going anywhere, but the light is." },
    },
  },
  {
    id: "body",
    label: "Human remains reported in the adjacent field",
    best: "specialist",
    options: {
      specialist: { quality: "sound", crit: null, band: "B", effect: { remainsReferred: true },
        response: "You secure the area, do not disturb it, and record it for the medico-legal examination under the proper procedure.",
        feedback: "Remains are a specialist examination, not a scene photograph. Secure and refer." },
      photograph: { quality: "not", crit: null, band: "E", effect: {},
        response: "You document it yourself in detail. You have now taken more than the file needs and pre-empted the examination.",
        feedback: "Taking more than the file requires is a failure here, not diligence." },
    },
  },
];

// L3, Branching decision beats (live interaction). Objective O3. Hidden fact
// ledger; a leading question taints and the taint PERSISTS. Non-negotiable S2.
const L3 = {
  stage:
    "A farm worker, Ms K., stayed through the occupation and is standing at the loading door. She is willing to talk and clearly wants to help. Your interpreter is beside you. You have perhaps ten minutes before the light goes.",
  constraint: "Time is short and she is eager, the two conditions under which good interviewers lead a witness.",
  theory:
    "An account taken by a leading question is not weak evidence; in this file it is unusable evidence, and it stays in the file marked so. Open before closed; record her words, not your inference.",
  authorities: ["CUSTODY_PRACTICE", "CPC_225"],
  moves: [
    {
      id: "open",
      label: '"Tell me what happened here, in your own words, from wherever you want to start."',
      quality: "sound", crit: "S2", band: "A",
      effect: { account: "clean" },
      response:
        "She describes lorries at the store over three days and a man she calls 'the one who counted'. It is in her words, and it is usable.",
      feedback: "The widest possible opener costs you nothing and protects everything downstream.",
    },
    {
      id: "preserve",
      // Correct in substance, WRONG IN TIMING/REGISTER (the C4 teaching option).
      label:
        '"Before we speak, I can arrange to have your testimony preserved before an investigating judge under article 225. Shall we do that now?"',
      quality: "partly", crit: "S2", band: "C",
      effect: { account: "delayed" },
      response:
        "Right instrument, wrong moment. She does not know what article 225 is; she came to tell you something and now feels processed. She gives you less, and the light goes. Preservation is a real and important step, after the account, not as the opening move, and not in that register.",
      feedback:
        "The most dangerous wrong answer is the correct one delivered too early, in language the person cannot use. Right law, wrong timing.",
    },
    {
      id: "lead",
      label: '"You saw Russian soldiers loading the grain onto military lorries, didn\'t you?"',
      quality: "not", crit: "S2", band: "F",
      effect: { account: "tainted" },
      response:
        "She agrees, because you offered her the words and she wants to help. You now have a confirmation you put in her mouth. This fact is given to you, marked UNUSABLE, and it will appear flagged in the record you build in Lesson 6.",
      feedback:
        "A leading question does not just weaken an answer, it manufactures one. This is irreversible for this account.",
    },
    {
      id: "detail",
      // Tempting shortcut under time pressure: chase vivid detail the file does not need.
      label: '"Describe the soldiers, their faces, exactly what each one did to people here."',
      quality: "not", crit: "S2", band: "E",
      effect: { account: "overreach" },
      response:
        "She becomes distressed recounting detail your file does not require. You have taken more than the case needs and harmed the person to do it.",
      feedback: "Proportionality is a skill criterion. Do not extract detail the file will never use.",
    },
  ],
};

// L4, Chain audit (all-but-one step properly executed). Objective O4.
// Non-negotiable P2. Conduct sits inside the task, unflagged (C5).
const L4 = {
  stage:
    "A colleague, Investigator D., hands you his completed seizure log for the phone and a ledger taken from the store, and asks you to co-sign it before it goes to the case file. You read it as competent work. Find the one step that breaks integrity, co-sign only if it holds.",
  constraint: "He is senior to you, the log looks professional, and he is waiting.",
  theory:
    "In a chain audit the defect is never the untidy line. It is the single break that makes the exhibit unusable while everything around it looks correct.",
  authorities: ["CUSTODY_PRACTICE", "BERKELEY"],
  steps: [
    { id: 1, text: "09:12, Phone photographed in place, time recorded, placed in flight mode. Bagged, sealed, seal no. A-0447.", defect: false },
    { id: 2, text: "09:20, Ledger photographed, each page, with scale. Bagged, sealed, seal no. A-0448. Register entry made.", defect: false },
    { id: 3, text: "10:05, At the vehicle, phone bag reopened to confirm the model for the log, resealed under a new seal A-0461. (No register entry for the reopening.)", defect: true,
      why: "The reseal has no register entry. The bag was opened and closed with nothing recording who did it or why, that is the break in the chain, and it is the exhibit that matters most." },
    { id: 4, text: "10:40, Digital hash of the phone image taken and recorded against seal A-0447.", defect: false },
    { id: 5, text: "11:15, Exhibits logged into the register; custody transferred to the exhibits officer with signatures.", defect: false },
  ],
  // A distractor that is conduct-adjacent but not the integrity break:
  decoyId: 4,
  decoyNote:
    "Step 4 references the original seal A-0447 after the reseal to A-0461, untidy, worth a note, but not the break. The integrity failure is the unrecorded reopening at step 3.",
};

// L5, Socratic checkpoint (Part F). Placed immediately after the highest-stakes
// decision (L3 / L4). Model answer is AUTHORED. AI, if reached, supplies only the
// single probing question, constrained; falls back to an authored question.
const L5 = {
  prompt:
    "Justify, in your own words, the decision you took with Ms K. at the loading door. What did it cost you, and what did it gain?",
  authoredProbe:
    "You have named what you gained, what did the moment cost the person in front of you, and did the file need that cost?",
  // AUTHORED model reasoning, one competent answer, not the answer:
  modelReasoning:
    "One competent answer, not the answer. The opening move here is almost never about evidence law in the first instance; it is about not spending the witness. A wide opener costs nothing and keeps every later option open, preservation under article 225, a fuller interview, a referral. A leading question or a premature procedural move both spend something you cannot get back: the first the usability of the account, the second the person's willingness. Where your own reasoning went further than this, for instance if you weighed her safety or displacement risk before anything else, keep yours.",
  note:
    "Your written answers here are read by your coach and are never scored by the platform.",
};

/* ---------------------------------------------------------------------------
 * SMALL PRESENTATION HELPERS
 * ------------------------------------------------------------------------- */
function StatusTag({ status }) {
  const map = {
    stable: { t: "verified · stable", c: "ok" },
    confirm: { t: "SIGN-OFF PENDING · confirm", c: "warn" },
    practice: { t: "practice layer · SME", c: "warn" },
  };
  const m = map[status] || map.confirm;
  return <span className={`tag tag-${m.c}`}>{m.t}</span>;
}

function AuthorityLine({ keys }) {
  if (!keys || !keys.length) return null;
  return (
    <div className="authorities" aria-label="Source authorities for this lesson">
      <span className="authorities-h">Authorities</span>
      <ul>
        {keys.map((k) => {
          const a = AUTHORITIES[k];
          if (!a) return null;
          return (
            <li key={k}>
              <span className="auth-ref">{a.ref}</span> <StatusTag status={a.status} />
              <span className="auth-note">, {a.note}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ===========================================================================
 * MAIN COMPONENT
 * ========================================================================= */
export default function PEJ_EVD_01_M1() {
  // --- learner-controlled presentation (Part I) --------------------------
  const [contrast, setContrast] = useState(false);
  const [big, setBig] = useState(false);
  const [spacious, setSpacious] = useState(false);

  // --- navigation & content-warning gate ---------------------------------
  const LESSONS = [
    "warning", "L1", "L2", "L3", "L5", "L4", "artifact", "result",
  ];
  const [i, setI] = useState(0);
  const step = LESSONS[i];
  const topRef = useRef(null);
  useEffect(() => { if (topRef.current) topRef.current.focus(); }, [i]);

  // --- cross-lesson consequence state (persists between lessons, C3) ------
  const [world, setWorld] = useState({
    safetyBreach: false,
    deviceHashed: false,
    deviceHandled: false,
    sceneDocumented: false,
    remainsReferred: false,
    account: null, // clean | delayed | tainted | overreach
    chainDefectFound: null, // stepId chosen
  });
  // record of decisions -> criteria bands
  const [record, setRecord] = useState({}); // { critKey: band }

  const applyEffect = (eff) =>
    setWorld((w) => ({ ...w, ...(eff || {}) }));
  const scoreCrit = (crit, band) =>
    crit && setRecord((r) => ({ ...r, [crit]: band }));

  // --- alignment toggle ---------------------------------------------------
  const [alignOpen, setAlignOpen] = useState(false);

  const go = (d) => setI((x) => Math.max(0, Math.min(LESSONS.length - 1, x + d)));
  const jump = (name) => setI(LESSONS.indexOf(name));

  // ------------------------------------------------------------------ RENDER
  const rootClass = [
    "pej",
    contrast ? "hc" : "",
    big ? "big" : "",
    spacious ? "sp" : "",
  ].join(" ");

  return (
    <div className={rootClass}>
      <style>{CSS}</style>

      {/* ---------------- MODULE HEADER (id, version, SME, authorities) ---- */}
      <header className="mod-head">
        <div className="mod-head-row">
          <div>
            <div className="mod-id">PEJ-EVD-01 · Module 1</div>
            <h1 className="mod-title">Documenting the scene</h1>
          </div>
          <div className="mod-meta">
            <span className="tag tag-warn">v0.1-demo · SME sign-off PENDING</span>
            <button className="lnk" onClick={() => setAlignOpen((v) => !v)} aria-expanded={alignOpen}>
              {alignOpen ? "Hide alignment" : "Alignment"}
            </button>
          </div>
        </div>
        <p className="mod-task">
          <strong>Task:</strong> document a conflict-related crime scene under
          field conditions so the physical and digital evidence is admissible and
          the chain of custody is unbroken.
        </p>

        {/* learner-controlled presentation controls */}
        <div className="a11y" role="group" aria-label="Presentation controls">
          <button aria-pressed={big} onClick={() => setBig((v) => !v)} className={big ? "on" : ""}>Text size</button>
          <button aria-pressed={contrast} onClick={() => setContrast((v) => !v)} className={contrast ? "on" : ""}>High contrast</button>
          <button aria-pressed={spacious} onClick={() => setSpacious((v) => !v)} className={spacious ? "on" : ""}>Generous spacing</button>
          <span className="a11y-note">No timers. State is held while you move; you can leave any scenario without losing progress.</span>
        </div>
      </header>

      {/* ---------------- ALIGNMENT PANEL (Part G) ------------------------ */}
      {alignOpen && <AlignmentPanel />}

      {/* ---------------- PROGRESS RAIL ---------------------------------- */}
      <nav className="rail" aria-label="Lesson progress">
        {LESSONS.map((l, idx) => (
          <button
            key={l}
            className={"rail-dot " + (idx === i ? "cur" : idx < i ? "done" : "")}
            aria-current={idx === i ? "step" : undefined}
            onClick={() => setI(idx)}
            title={RAIL_LABELS[l]}
          >
            <span className="rail-n">{idx === 0 ? "!" : idx}</span>
            <span className="rail-l">{RAIL_LABELS[l]}</span>
          </button>
        ))}
      </nav>

      {/* ---------------- STAGE ------------------------------------------ */}
      <main className="stage" tabIndex={-1} ref={topRef} aria-live="polite">
        {step === "warning" && <Warning onStart={() => go(1)} />}
        {step === "L1" && (
          <LessonRouting world={world} apply={applyEffect} score={scoreCrit} onDone={() => go(1)} />
        )}
        {step === "L2" && (
          <LessonSelection score={scoreCrit} onDone={() => go(1)} />
        )}
        {step === "L3" && (
          <LessonBranch world={world} apply={applyEffect} score={scoreCrit} onDone={() => go(1)} />
        )}
        {step === "L5" && <LessonSocratic onDone={() => go(1)} />}
        {step === "L4" && (
          <LessonChainAudit world={world} apply={applyEffect} score={scoreCrit} onDone={() => go(1)} />
        )}
        {step === "artifact" && (
          <LessonArtifact world={world} score={scoreCrit} onDone={() => go(1)} />
        )}
        {step === "result" && <StationResult record={record} world={world} onRestart={() => { setI(0); setWorld({ safetyBreach:false, deviceHashed:false, deviceHandled:false, sceneDocumented:false, remainsReferred:false, account:null, chainDefectFound:null }); setRecord({}); }} />}
      </main>

      {/* ---------------- FOOTER NAV ------------------------------------- */}
      <footer className="foot">
        <button className="btn ghost" onClick={() => go(-1)} disabled={i === 0}>← Back</button>
        <span className="foot-mid">{RAIL_LABELS[step]} · {i === 0 ? "start" : `${i} of ${LESSONS.length - 1}`}</span>
        <button className="btn" onClick={() => go(1)} disabled={i === LESSONS.length - 1}>Next →</button>
      </footer>
    </div>
  );
}

const RAIL_LABELS = {
  warning: "Start here",
  L1: "1 · Arrival",
  L2: "2 · Lawful basis",
  L3: "3 · The account",
  L5: "4 · Checkpoint",
  L4: "5 · Chain audit",
  artifact: "6 · Artifact",
  result: "Station result",
};

/* ===========================================================================
 * CONTENT WARNING GATE (Part H)
 * ========================================================================= */
function Warning({ onStart }) {
  return (
    <section className="card lead">
      <h2>Before you begin</h2>
      <p className="serif">
        This module composes a scene from the full-scale invasion of Ukraine
        that began in February 2022, recognising that the armed conflict began
        in 2014. The site is in a temporarily occupied territory now
        de-occupied. Everything you will read is a composite: people, units,
        enterprises and places are invented, and names are given as initials.
      </p>
      <p>
        Some material describes the aftermath of violence, including a reference
        to human remains. You may leave any scenario at any point without losing
        your progress. Nothing you do here is reported to your institution.
      </p>
      <div className="row">
        <button className="btn big-btn" onClick={onStart}>Start the module</button>
      </div>
    </section>
  );
}

/* ===========================================================================
 * LESSON 1, ROUTING DECISION PER ITEM
 * ========================================================================= */
function LessonRouting({ world, apply, score, onDone }) {
  const [choices, setChoices] = useState({}); // itemId -> optionKey
  const decideAll = L1_ITEMS.every((it) => choices[it.id]);
  const commit = (itemId, key) => {
    if (choices[itemId]) return; // one decision per item; no take-backs
    const opt = L1_ITEMS.find((x) => x.id === itemId).options[key];
    setChoices((c) => ({ ...c, [itemId]: key }));
    apply(opt.effect);
    if (opt.crit) score(opt.crit, opt.band);
  };
  return (
    <section className="card">
      <SceneHead
        n="Lesson 1"
        title="You are the first qualified officer on the site"
        type="Routing decision · every item at once"
      >
        Dusk, a farmstead outside a recently de-occupied village. The grain store
        has been emptied, this is the substance of the file under Criminal Code
        art. 438. EOD has been called but has not arrived. Light is going. Decide
        what you do with each item below. You are choosing an <em>action</em> for
        each, including what not to touch, and you cannot revisit a decision once
        taken.
      </SceneHead>

      <div className="items">
        {L1_ITEMS.map((it) => {
          const chosen = choices[it.id];
          const opt = chosen ? it.options[chosen] : null;
          return (
            <div key={it.id} className={"item " + (chosen ? "resolved" : "")}>
              <div className="item-label">{it.label}</div>
              {!chosen && (
                <div className="opts" role="group" aria-label={"Action for: " + it.label}>
                  {Object.entries(it.options).map(([k, o]) => (
                    <button key={k} className="opt" onClick={() => commit(it.id, k)}>
                      {optionText(it.id, k)}
                    </button>
                  ))}
                </div>
              )}
              {chosen && (
                <div className={"outcome q-" + opt.quality}>
                  <div className="outcome-h">
                    <QGlyph q={opt.quality} /> {qualityWord(opt.quality)}
                  </div>
                  <p className="serif">{opt.response}</p>
                  <p className="fb"><strong>Rule:</strong> {opt.feedback}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AuthorityLine keys={["CPC_INSPECTION", "BERKELEY", "MINNESOTA"]} />

      {decideAll && (
        <div className="row">
          <p className="carry">
            {world.safetyBreach
              ? "A safety-floor breach has been recorded. It will fail the station regardless of everything else you do, that is what a non-negotiable means. Continue to see how the rest plays out."
              : "Your sequencing is recorded and carries forward."}
          </p>
          <button className="btn" onClick={onDone}>Continue →</button>
        </div>
      )}
    </section>
  );
}
function optionText(itemId, k) {
  const map = {
    device: { isolate: "Isolate it now, flight mode, photograph in place, bag for hashing", later: "Note it and come back after the walk-through", examine: "Open it to see what is on it" },
    ordnance: { leave: "Cordon wide, photograph from distance, note for EOD", photo_close: "Step in for a close scale photograph", move: "Reposition it for a cleaner shot" },
    grain: { document: "Photograph the emptied bays now, with scale", wait: "Wait until the device and ordnance are handled" },
    body: { specialist: "Secure, do not disturb, refer for medico-legal examination", photograph: "Document it yourself in full detail" },
  };
  return (map[itemId] || {})[k] || k;
}

/* ===========================================================================
 * LESSON 2, FIELD / COMPONENT SELECTION (constructing a compliant product)
 * Traps that feel helpful; a trap is weighted heavier than an omission.
 * ========================================================================= */
const L2_COMPONENTS = [
  { id: "register", label: "Enter the inspection in the register at the point it begins", correct: true, weight: 2,
    note: "Required, the entry is what makes the inspection an act on the file rather than a visit." },
  { id: "regime615", label: "Apply the martial-law regime for investigative actions (art. 615)", correct: true, weight: 2,
    note: "Correct for a site in a zone under martial law; it is the regime that governs the timing and authorisation here." },
  { id: "judge225", label: "Plan preservation of perishable evidence before the investigating judge (art. 225)", correct: true, weight: 1,
    note: "Right to plan now; some of this evidence will not survive to a later hearing." },
  { id: "consent_owner", label: "Obtain the landowner's written consent as the legal basis for entry", correct: false, trap: true, weight: 3,
    note: "TRAP. Consent of an owner is not the procedural basis for a crime-scene inspection here, and relying on it can undercut admissibility. It feels courteous and helpful; it is the wrong instrument." },
  { id: "backdate", label: "Prepare the protocol now and enter the start time as when you first radioed in", correct: false, trap: true, weight: 3,
    note: "TRAP. Recording a time other than the actual time of the act is a contemporaneity failure that a defence will find. Never adjust the record to look tidier." },
  { id: "wait_warrant", label: "Halt all documentation until a separate written authorisation arrives tomorrow", correct: false, trap: false, weight: 1,
    note: "Omission. Under the martial-law regime, perishable evidence documented now would be lost by tomorrow. This is over-caution, not rigour." },
];
function LessonSelection({ score, onDone }) {
  const [picked, setPicked] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const toggle = (id) => !submitted && setPicked((p) => ({ ...p, [id]: !p[id] }));
  const submit = () => {
    setSubmitted(true);
    // score P1: a trap selected is worse than an omission
    const trapPicked = L2_COMPONENTS.some((c) => c.trap && picked[c.id]);
    const requiredGot = L2_COMPONENTS.filter((c) => c.correct && picked[c.id]).length;
    const requiredTotal = L2_COMPONENTS.filter((c) => c.correct).length;
    let band = "A";
    if (trapPicked) band = "E";
    else if (requiredGot < requiredTotal) band = requiredGot >= 2 ? "C" : "E";
    score("P1", band);
  };
  return (
    <section className="card">
      <SceneHead n="Lesson 2" title="You must make the inspection lawful before it is anything else"
        type="Component selection · build a compliant product">
        The store is in front of you and the light is going, but nothing you
        document is worth anything if the inspection itself does not hold. Select
        the components that constitute a lawful inspection here. Some options are
        designed to feel helpful. Choose only what belongs.
      </SceneHead>

      <div className="checks">
        {L2_COMPONENTS.map((c) => (
          <label key={c.id} className={"check " + (submitted ? (c.correct ? "good" : (picked[c.id] ? "bad" : "muted")) : "")}>
            <input type="checkbox" checked={!!picked[c.id]} onChange={() => toggle(c.id)} disabled={submitted} />
            <span className="check-box" aria-hidden="true">{picked[c.id] ? "✓" : ""}</span>
            <span className="check-label">
              {c.label}
              {submitted && (
                <span className="check-note">, {c.correct ? "Belongs. " : (c.trap ? "Trap. " : "Omission. ")}{c.note}</span>
              )}
            </span>
          </label>
        ))}
      </div>

      <AuthorityLine keys={["CPC_INSPECTION", "CPC_615", "CPC_225"]} />

      {!submitted ? (
        <div className="row"><button className="btn" onClick={submit} disabled={Object.values(picked).every((v) => !v)}>Constitute the inspection</button></div>
      ) : (
        <div className="row">
          <p className="carry">A component chosen wrongly (a trap) costs you more than one left out, because a wrong basis travels into everything you document next.</p>
          <button className="btn" onClick={onDone}>Continue →</button>
        </div>
      )}
    </section>
  );
}

/* ===========================================================================
 * LESSON 3, BRANCHING DECISION BEAT (the account; taint persists)
 * ========================================================================= */
function LessonBranch({ world, apply, score, onDone }) {
  const [chosen, setChosen] = useState(null);
  const commit = (m) => {
    if (chosen) return;
    setChosen(m);
    apply(m.effect);
    if (m.crit) score(m.crit, m.band);
  };
  return (
    <section className="card">
      <SceneHead n="Lesson 3" title="How you open decides whether her account can be used"
        type="Branching decision beat · live interaction">
        {L3.stage}
      </SceneHead>
      <p className="constraint"><strong>What is scarce:</strong> {L3.constraint}</p>

      {!chosen ? (
        <div className="moves" role="group" aria-label="Your opening move with Ms K.">
          {L3.moves.map((m) => (
            <button key={m.id} className="move" onClick={() => commit(m)}>{m.label}</button>
          ))}
        </div>
      ) : (
        <div className={"outcome q-" + chosen.quality}>
          <div className="outcome-h"><QGlyph q={chosen.quality} /> {qualityWord(chosen.quality)}</div>
          <p className="serif">{chosen.response}</p>
          <p className="fb"><strong>Rule:</strong> {chosen.feedback}</p>
          {/* theory appears at the moment it decides something, after the move */}
          <p className="theory"><strong>Why:</strong> {L3.theory}</p>
        </div>
      )}

      <AuthorityLine keys={L3.authorities} />

      {chosen && (
        <div className="row">
          <button className="btn" onClick={onDone}>Continue →</button>
        </div>
      )}
    </section>
  );
}

/* ===========================================================================
 * LESSON 4 (shown as checkpoint step 4 in the rail), SOCRATIC CHECKPOINT
 * ========================================================================= */
function LessonSocratic({ onDone }) {
  const [a1, setA1] = useState("");
  const [phase, setPhase] = useState(0); // 0 write, 1 probe, 2 second answer, 3 model
  const [probe, setProbe] = useState(L5.authoredProbe);
  const [a2, setA2] = useState("");
  const [loading, setLoading] = useState(false);

  const askProbe = async () => {
    setLoading(true);
    // Part F / Part J: attempt a constrained probing question; fall back to the
    // authored one on any failure. No case facts are sent; the model receives
    // only the participant's own words and a strict rubric.
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content:
              "You are a Socratic coach for a qualified prosecutor. Read their written justification and return EXACTLY ONE probing question. Constraints: never say whether they were right; never contain the answer or the principle; introduce no new fact about the case; no praise; no moralising; one sentence; under 30 words; press on the least-examined part of what they wrote.\n\nTheir justification:\n" + a1,
          }],
        }),
      });
      const data = await res.json();
      const txt = data && data.content && data.content[0] && data.content[0].text;
      if (txt && txt.trim()) setProbe(txt.trim());
    } catch (e) {
      // authored fallback already set
    } finally {
      setLoading(false);
      setPhase(1);
    }
  };

  return (
    <section className="card">
      <SceneHead n="Checkpoint" title="Defend the decision you just took"
        type="Socratic checkpoint · read by your coach, never scored">
        This is placed immediately after your highest-stakes decision. There is
        no grade here.
      </SceneHead>

      <label className="q-label" htmlFor="soc1">{L5.prompt}</label>
      <textarea id="soc1" className="ta" rows={4} value={a1}
        onChange={(e) => setA1(e.target.value)} disabled={phase > 0}
        placeholder="Write in your own words…" />

      {phase === 0 && (
        <div className="row"><button className="btn" onClick={askProbe} disabled={a1.trim().length < 8 || loading}>{loading ? "…" : "Submit"}</button></div>
      )}

      {phase >= 1 && (
        <div className="probe">
          <div className="probe-h">One question back</div>
          <p className="serif">{probe}</p>
          {phase === 1 && (
            <>
              <textarea className="ta" rows={3} value={a2} onChange={(e) => setA2(e.target.value)} placeholder="Answer again…" />
              <div className="row"><button className="btn" onClick={() => setPhase(3)} disabled={a2.trim().length < 4}>Submit</button></div>
            </>
          )}
        </div>
      )}

      {phase === 3 && (
        <div className="model">
          <div className="model-h">One competent answer, not the answer</div>
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
 * LESSON 5 (rail step 5), CHAIN AUDIT
 * ========================================================================= */
function LessonChainAudit({ world, apply, score, onDone }) {
  const [pick, setPick] = useState(null);
  const [committed, setCommitted] = useState(false);
  const commit = () => {
    if (pick == null) return;
    setCommitted(true);
    const step = L4.steps.find((s) => s.id === pick);
    const band = step.defect ? "A" : (pick === L4.decoyId ? "C" : "E");
    apply({ chainDefectFound: pick });
    score("S3", band);
    score("P2", step.defect ? "A" : "E"); // P2 non-negotiable: miss the break -> fail
  };
  const chosenStep = committed ? L4.steps.find((s) => s.id === pick) : null;
  return (
    <section className="card">
      <SceneHead n="Lesson 5" title="Co-sign only if the chain holds"
        type="Chain audit · one defect inside competent work">
        {L4.stage}
      </SceneHead>
      <p className="constraint"><strong>What is scarce:</strong> {L4.constraint}</p>

      <ol className="chain" role="radiogroup" aria-label="Select the step that breaks integrity">
        {L4.steps.map((s) => (
          <li key={s.id}>
            <label className={"chain-step " + (committed ? (s.defect ? "is-defect" : (pick === s.id ? "wrong" : "")) : (pick === s.id ? "sel" : ""))}>
              <input type="radio" name="chain" disabled={committed} checked={pick === s.id} onChange={() => setPick(s.id)} />
              <span className="chain-text">{s.text}</span>
              {committed && s.defect && <span className="chain-note"> ← the break. {s.why}</span>}
              {committed && !s.defect && s.id === L4.decoyId && <span className="chain-note muted"> {L4.decoyNote}</span>}
            </label>
          </li>
        ))}
      </ol>

      <AuthorityLine keys={L4.authorities} />

      {!committed ? (
        <div className="row"><button className="btn" onClick={commit} disabled={pick == null}>Commit, this is the step I will not co-sign</button></div>
      ) : (
        <div className="row">
          <p className="carry">
            {chosenStep.defect
              ? "You found the break: an unrecorded reopening of the most important exhibit. Withheld from co-sign, it can be cured by a supplementary entry. Missed, it fails at trial."
              : "You co-signed over the break. The unrecorded reopening at step 3 travels to the case file and surfaces as a chain-of-custody challenge, a non-negotiable failure."}
          </p>
          <button className="btn" onClick={onDone}>Continue →</button>
        </div>
      )}
    </section>
  );
}

/* ===========================================================================
 * LESSON 6, ARTIFACT (Does). Built from decisions; tainted items flagged.
 * ========================================================================= */
function LessonArtifact({ world, score, onDone }) {
  const [ack, setAck] = useState(false);
  const accountLine = {
    clean: { txt: "Initial account of Ms K.  taken by open question, recorded in her words. USABLE.", flag: false },
    delayed: { txt: "Initial account of Ms K.  partial; opening spent on procedure before the account. Usable but thin.", flag: false },
    tainted: { txt: "Initial account of Ms K.  obtained by a leading question. MARKED UNUSABLE.", flag: true },
    overreach: { txt: "Initial account of Ms K.  includes detail beyond the file's need. Review for proportionality.", flag: true },
    null: { txt: "Initial account, not taken.", flag: true },
  }[world.account ?? "null"];

  const lines = [
    { txt: world.deviceHashed
        ? "Exhibit 1 (mobile phone), isolated in flight mode, photographed in place, hashed and sealed."
        : (world.deviceHandled ? "Exhibit 1 (mobile phone), examined in place; last-access metadata compromised." : "Exhibit 1 (mobile phone), not secured before it changed state."),
      flag: !world.deviceHashed },
    { txt: world.safetyBreach
        ? "Suspected ordnance, APPROACHED/HANDLED before EOD. Safety-floor breach recorded."
        : "Suspected ordnance, cordoned and documented from distance; left for EOD.",
      flag: world.safetyBreach },
    { txt: world.sceneDocumented
        ? "Crime base (emptied grain store), photographed with scale and orientation."
        : "Crime base, documentation incomplete.",
      flag: !world.sceneDocumented },
    { txt: world.remainsReferred
        ? "Human remains, secured and referred for medico-legal examination."
        : "Human remains, handling not compliant with the specialist pathway.",
      flag: !world.remainsReferred },
    accountLine,
    { txt: world.chainDefectFound === 3
        ? "Chain of custody, reopening of Exhibit 1 caught before co-sign; supplementary entry required."
        : "Chain of custody, unrecorded reopening of Exhibit 1 NOT caught. Integrity challenge live.",
      flag: world.chainDefectFound !== 3 },
  ];

  return (
    <section className="card">
      <SceneHead n="Lesson 6" title="Produce the record you would actually file"
        type="Artifact · transfers to your live caseload">
        This is the one page that leaves the module. It is assembled from the
        decisions you took, nothing is added. Items you compromised are flagged;
        they are flagged for you, not hidden from you. In the live version you
        upload a redacted version to your coach. No case material is stored on
        the platform.
      </SceneHead>

      <div className="artifact" aria-label="Contemporaneous scene record and chain-of-custody memo">
        <div className="artifact-h">
          <div>Contemporaneous scene record & chain-of-custody memo</div>
          <div className="artifact-sub">PEJ-EVD-01 · composite site · initials only · no real case data</div>
        </div>
        <ul className="artifact-list">
          {lines.map((l, idx) => (
            <li key={idx} className={l.flag ? "flagged" : ""}>
              {l.flag && <span className="flag" aria-label="flagged">⚑ flagged</span>}
              {l.txt}
            </li>
          ))}
        </ul>
      </div>

      <label className="check standalone">
        <input type="checkbox" checked={ack} onChange={() => { setAck(!ack); if (!ack) score("O5", "A"); }} />
        <span className="check-box" aria-hidden="true">{ack ? "✓" : ""}</span>
        <span className="check-label">I have reviewed the flags and would file this record as it stands (in the live module this uploads to your coach).</span>
      </label>

      <div className="row"><button className="btn" onClick={onDone} disabled={!ack}>See my station result →</button></div>
    </section>
  );
}

/* ===========================================================================
 * STATION RESULT, computed from decisions (Part D). + one-page job aid.
 * ========================================================================= */
function StationResult({ record, world, onRestart }) {
  const rows = Object.keys(CRITERIA).map((key) => {
    const band = record[key] || "F";
    return { key, ...CRITERIA[key], band, value: BAND_VALUE[band] };
  });
  const failedNN = rows.filter((r) => r.nonNegotiable && r.value < 3);
  const skills = rows.filter((r) => r.stream === "Skills");
  const proc = rows.filter((r) => r.stream === "Application of procedure or law");
  const mean = (arr) => arr.length ? (arr.reduce((a, r) => a + r.value, 0) / arr.length) : 0;
  const stationPass = failedNN.length === 0 && mean(skills) >= 3 && mean(proc) >= 3;

  return (
    <section className="card">
      <SceneHead n="Station result" title="Computed from the decisions you took"
        type="No separate quiz · two streams, weighted equally">
        Each criterion is banded on its own and reported on its own, a single
        overall number would hide the thing that decides your next step. Bands:
        A=5 … F=0; C is the marginal pass.
      </SceneHead>

      <div className={"verdict " + (stationPass ? "pass" : "fail")}>
        {stationPass
          ? "STATION PASSED, every non-negotiable held and both streams reached the marginal pass."
          : (failedNN.length
              ? "STATION NOT PASSED, a non-negotiable failed. It does not compensate: it fails the station regardless of every other band."
              : "STATION NOT PASSED, a stream fell below the marginal pass.")}
      </div>

      {failedNN.length > 0 && (
        <ul className="nn-list">
          {failedNN.map((r) => <li key={r.key}><strong>Non-negotiable failed:</strong> {r.label}</li>)}
        </ul>
      )}

      {[["Skills", skills], ["Application of procedure or law", proc]].map(([name, arr]) => (
        <div key={name} className="stream">
          <h3>{name} <span className="stream-mean">mean {mean(arr).toFixed(1)}/5</span></h3>
          <table className="bands">
            <thead><tr><th>Criterion</th><th>Band</th><th>Indicator you met / missed</th></tr></thead>
            <tbody>
              {arr.map((r) => (
                <tr key={r.key} className={r.value < 3 ? "low" : ""}>
                  <td>{r.label}{r.nonNegotiable && <span className="nn"> · non-negotiable</span>}</td>
                  <td className="band-cell"><span className={"band b-" + r.band}>{r.band}</span></td>
                  <td className="ind">{r.value >= 3 ? r.indicators.competent : r.indicators.not}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <p className="a11y-note">Nothing on this page is reported to your institution.</p>

      {/* One-page field job aid generated at the end of every module (Part I) */}
      <div className="jobaid">
        <div className="jobaid-h">Job aid, first hour at a conflict-related scene (one page, no theory)</div>
        <ol>
          <li><strong>Safety floor first.</strong> Suspected ordnance is live until EOD clears it. Cordon wide, photograph from distance, never handle or move it.</li>
          <li><strong>Order by decay, not by walking route.</strong> A live connected device changes by the second, isolate (flight mode), photograph in place, seal for a hash, before it changes.</li>
          <li><strong>Make the inspection lawful before it is anything else.</strong> Register entry at the point it begins; the martial-law regime (art. 615, confirm) governs; plan art. 225 preservation for perishable evidence. Owner's consent is not your basis.</li>
          <li><strong>Open wide, then narrow.</strong> "Tell me in your own words." Record the witness's words, not your inference. A leading question makes the account unusable. Take only what the file needs.</li>
          <li><strong>Every reopening gets an entry.</strong> No reseal, move, or handover without a register line. The exhibit that matters most is the one to check twice.</li>
          <li><strong>The record is contemporaneous.</strong> Real times, at the time. Never adjust the record to look tidier.</li>
        </ol>
        <div className="jobaid-f">Authorities carry sign-off status. Confirm every "confirm"-tagged article against current text before operational use. Law last verified: pending SME · v0.1-demo.</div>
      </div>

      <div className="row">
        <button className="btn ghost" onClick={onRestart}>Run the station again</button>
      </div>
    </section>
  );
}

/* ===========================================================================
 * ALIGNMENT PANEL (Part G), objective / how tested / success threshold / why
 * ========================================================================= */
const ALIGNMENT = [
  { o: "O1 [Knows how] Given a de-occupied site with a suspected hazard, sequence first actions so no action is taken on the hazard before EOD clearance.",
    tested: "Lesson 1, routing decision per item, all items presented at once.",
    success: "Hazard item resolved as 'cordon & document from distance'; zero safety-floor breaches (binary).",
    why: "Routing-under-load presents everything at once, reproducing the real condition in which the safety error is actually made; a sequencing test with items shown one at a time would test recall, not triage." },
  { o: "O2 [Knows how] Given inspection under martial law, select the components that make it lawful so the record survives an admissibility challenge.",
    tested: "Lesson 2, component selection with helpful-feeling traps.",
    success: "Both required components selected AND zero traps selected; a trap is weighted heavier than an omission.",
    why: "Component selection tests construction of a compliant product, not recognition of a definition; weighting the trap tests the specific failure (a plausible wrong basis) rather than mere completeness." },
  { o: "O3 [Shows how] Given a cooperative witness at the scene, elicit an initial account so no fact enters the file through a leading question.",
    tested: "Lesson 3, branching decision beat; consequence persists into the Lesson 6 artifact.",
    success: "Opening move is the wide opener (band A); any leading move marks the account UNUSABLE and flags it in the artifact (binary taint).",
    why: "A live branching beat is the only type that can make the account's usability depend on the participant's own words in the moment, which is exactly what the objective is about; a multiple-choice item could not carry the taint forward." },
  { o: "O4 [Shows how] Given a colleague's seizure log, identify the single defect so the exhibit's integrity is preserved.",
    tested: "Lesson 5, chain audit; all steps competent but one.",
    success: "The unrecorded reopening (step 3) identified before co-sign; identifying a cosmetic step instead scores C or below.",
    why: "A chain audit is the only type that tests discrimination of a defect inside otherwise-competent work; a knowledge question about chain-of-custody rules would test the rule, not the eye for the break." },
  { o: "O5 [Does] Produce a one-page contemporaneous record & chain-of-custody memo in which every tainted item is flagged.",
    tested: "Lesson 6, artifact assembled from prior decisions; uploaded to coach in the live module.",
    success: "Artifact filed with every compromised item carrying a visible flag; nothing added beyond the decisions taken.",
    why: "The Does objective can only be discharged by a produced artifact carrying the consequences of earlier choices; assessing it any other way would test intention rather than performance." },
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
        <div><strong>Non-negotiables (partly conjunctive):</strong> safety floor (X1), non-suggestive elicitation (S2), chain of custody unbroken (P2). Each is irreversible in a real file; failing one fails the station.</div>
        <div className="mt"><strong>Review triggers:</strong> {REVIEW_TRIGGERS.join(" ")}</div>
      </div>
    </section>
  );
}

/* ===========================================================================
 * SHARED PIECES
 * ========================================================================= */
function SceneHead({ n, title, type, children }) {
  return (
    <div className="scene-head">
      <div className="scene-tags">
        <span className="scene-n">{n}</span>
        <span className="scene-type">{type}</span>
      </div>
      <h2 className="scene-title">{title}</h2>
      <p className="serif scene-body">{children}</p>
    </div>
  );
}
function QGlyph({ q }) {
  // No information by colour alone, a glyph + word carry the state (Part I).
  const g = q === "sound" ? "●" : q === "partly" ? "◐" : "▲";
  return <span className={"qglyph q-" + q} aria-hidden="true">{g}</span>;
}
function qualityWord(q) {
  return q === "sound" ? "Sound" : q === "partly" ? "Partly sound" : "Not sound";
}

/* ===========================================================================
 * STYLE, single block, CSS custom properties, no utility framework.
 * Serif for stage-setting prose, sans for interface. 4-6 palette values.
 * ========================================================================= */
const CSS = `
.pej{
  --ink:#1c2430; --paper:#f6f4ef; --card:#ffffff; --line:#d8d2c6;
  --accent:#2f5d63; --accent-2:#7a3b2e; --muted:#6b7280;
  --ok:#2f5d63; --warn:#7a3b2e;
  --serif: Georgia, 'Iowan Old Style', 'Times New Roman', serif;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --fs:16px; --sp:16px;
  color:var(--ink); background:var(--paper); font-family:var(--sans);
  font-size:var(--fs); line-height:1.5; max-width:900px; margin:0 auto; padding:12px;
}
.pej.big{ --fs:19px; }
.pej.sp{ --sp:24px; line-height:1.7; }
.pej.hc{ --paper:#ffffff; --ink:#000000; --card:#ffffff; --line:#000000; --accent:#003b46; --accent-2:#6a1b00; --muted:#333; }
.pej *{ box-sizing:border-box; }
.serif{ font-family:var(--serif); }

/* focus visible at 3px, no traps */
.pej button:focus-visible, .pej input:focus-visible, .pej textarea:focus-visible, .pej [tabindex]:focus-visible{
  outline:3px solid var(--accent); outline-offset:2px;
}

.mod-head{ border:1px solid var(--line); background:var(--card); border-radius:10px; padding:var(--sp); margin-bottom:12px; }
.mod-head-row{ display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-start; }
.mod-id{ font-size:.8em; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
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
.card.lead{ text-align:left; }

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
.q-sound{ color:var(--accent); }
.q-partly{ color:#8a5a15; }
.q-not{ color:var(--accent-2); }
.fb{ font-size:.92em; }

.authorities{ margin:14px 0 0; padding-top:10px; border-top:1px dashed var(--line); font-size:.86em; }
.authorities-h{ font-weight:700; text-transform:uppercase; letter-spacing:.06em; font-size:.82em; color:var(--muted); }
.authorities ul{ margin:6px 0 0; padding-left:16px; }
.authorities li{ margin:4px 0; }
.auth-ref{ font-weight:600; }
.auth-note{ color:var(--muted); }

.checks{ display:flex; flex-direction:column; gap:8px; }
.check{ display:flex; gap:10px; align-items:flex-start; border:1px solid var(--line); border-radius:8px; padding:10px 12px; cursor:pointer; }
.check.standalone{ margin-top:12px; }
.check input{ position:absolute; opacity:0; width:1px; height:1px; }
.check-box{ flex:0 0 auto; width:20px; height:20px; border:2px solid var(--accent); border-radius:5px; display:inline-flex; align-items:center; justify-content:center; font-weight:700; color:var(--accent); }
.check.good{ background:#eef4f1; border-color:var(--accent); }
.check.bad{ background:#f7ece8; border-color:var(--accent-2); }
.check.muted{ opacity:.7; }
.check-note{ color:var(--muted); font-size:.9em; }

.chain{ list-style:none; counter-reset:c; padding:0; margin:0; display:flex; flex-direction:column; gap:8px; }
.chain-step{ display:flex; gap:10px; align-items:flex-start; border:1px solid var(--line); border-radius:8px; padding:10px 12px; cursor:pointer; }
.chain-step.sel{ border-color:var(--accent); background:#eef4f1; }
.chain-step.is-defect{ border-color:var(--accent-2); background:#f7ece8; }
.chain-step.wrong{ border-color:#b98a3a; background:#f7f3ea; }
.chain-note{ display:block; margin-top:6px; font-size:.9em; color:var(--accent-2); }
.chain-note.muted{ color:var(--muted); }

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

/* reflow to 320px, no horizontal scroll */
@media (max-width:520px){
  .pej{ padding:8px; }
  .mod-title{ font-size:1.4em; }
  .foot-mid{ display:none; }
}
@media (min-width:640px){
  .align-grid{ grid-template-columns:1fr 1fr 1fr; }
}
/* respect reduced motion (no motion is used, but declare intent) */
@media (prefers-reduced-motion: reduce){ .pej *{ transition:none !important; animation:none !important; } }
`;
