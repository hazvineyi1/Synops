/*
 * Authored Decision Station specs for the Zambian Clinician Leadership programme (Manchester Review
 * Board practice-credentials cohort).
 *
 * Stored verbatim into interactive_activities.spec (jsonb) and rendered by the frontend
 * DecisionStationPlayer (components/DecisionStation.tsx). The shape MUST match the StationSpec types
 * in that component. Kept as plain data (typed loosely) because the api-server package cannot import
 * the frontend types across packages.
 *
 * Design follows the same decision-first, consequence-persisting method as the PEJ pilot, with two
 * load-bearing differences from the brief: the streams are leadership streams (not Skills / procedure),
 * and the result is framed as pass or resubmit with developmental feedback, not a percentage. Every
 * policy or regulatory reference is UNVERIFIED, pending subject-matter-expert / Zambian health-law
 * sign-off. Everything is a composite: people and the facility are invented.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Spec = Record<string, any>;

/* ============================================================ MODULE 1 · The First 48 Hours */
export const MRB_M1_SPEC: Spec = {
  meta: {
    code: "MRB-CLP-01", module: "Module 1", title: "The first 48 hours",
    version: "v0.1-demo", smeStatus: "SME sign-off PENDING",
    task: "lead through a resource-scarcity crisis so no prioritisation is made before the facility's allocation criteria are applied, elicit a colleague's hesitant disclosure without leading, catch a favouritism defect before co-signing, and record every conflicted call honestly, including your own.",
  },
  warning: {
    title: "Before you begin",
    body: [
      "This module composes a resource-scarcity crisis at a district-level facility in Zambia: a critical medicine stockout, a patient surge, a well-connected family pressing for priority, a hesitant junior colleague, and a peer's triage decision to co-sign. Everyone and the facility are invented; names are given as initials.",
      "There are no timers here, and no percentage grade. Your decisions carry forward: a poor call early makes a later one harder, exactly as in a real 48 hours. You may leave any scenario at any point without losing your progress, and you can work through it in writing, by voice, or with a scribe. Nothing you do here is reported to your institution, and a human reviewer on the Review Board portal makes the final pass-or-resubmit decision.",
    ],
    startLabel: "Start the module",
  },
  authorities: {
    ALLOC_POLICY: { ref: "Facility resource-allocation / triage criteria (surfaced at the prioritisation decision)", note: "Placeholder standing policy. Must come from the facility and the SME.", status: "practice" },
    NON_LEADING: { ref: "Non-leading questioning technique (open before closed, no leading or dismissive prompts)", note: "General interviewing evidence base. Stable in principle.", status: "stable" },
    CO_SIGN: { ref: "Chain-of-accountability and co-signing responsibility", note: "Co-signature is an endorsement, not only a procedural check. Practice layer, confirm locally.", status: "confirm" },
    HPCZ: { ref: "Professional conduct and non-discrimination duties (illustrative, pending Zambian health-law confirmation)", note: "Article/section references to be confirmed against current text.", status: "confirm" },
  },
  reviewTriggers: [
    "Review on any change to the facility's allocation or triage policy.",
    "Review on any change to professional-conduct or non-discrimination guidance from the regulator.",
    "Review after the first tutor-trio pilot against real portfolios.",
  ],
  nonNegotiableNote: "no advantage on non-clinical grounds without flagging it (X1), the favouritism defect caught before co-signing (P2), and honest self-flagging in the record (S3). Each is irreversible later in the 48 hours; failing one fails the station regardless of every other band.",
  criteria: [
    { key: "X1", label: "No advantage granted on non-clinical grounds without flagging it", stream: "Ethical Decision Compliance", nonNegotiable: true, indicators: { competent: "Treats the connected family by the same criteria as everyone; if any advantage is unavoidable, names it in writing.", not: "Moves the family up on connection or a favour, and does not flag it." } },
    { key: "P1", label: "Allocation criteria applied before any prioritisation", stream: "Ethical Decision Compliance", nonNegotiable: false, indicators: { competent: "Checks the stated allocation policy before making any priority call.", not: "Prioritises from memory or under pressure before the criteria are applied." } },
    { key: "P2", label: "Favouritism defect caught before co-signing", stream: "Ethical Decision Compliance", nonNegotiable: true, indicators: { competent: "Finds the non-clinical-favouritism defect in the peer's triage log and declines to co-sign until it is fixed.", not: "Co-signs over a defect that granted advantage on non-clinical grounds." } },
    { key: "S1", label: "Own conflicts surfaced, not hidden", stream: "Values & Integrity", nonNegotiable: false, indicators: { competent: "Names the pressure and any conflict of interest openly rather than quietly absorbing it.", not: "Manages the pressure privately and leaves no trace of the conflict." } },
    { key: "S2", label: "Non-leading elicitation of the hesitant disclosure", stream: "Values & Integrity", nonNegotiable: false, indicators: { competent: "Opens wide, waits, and records the colleague's words; loses no fact to a leading or dismissive question.", not: "Leads or dismisses the colleague, who then shuts down or simply agrees." } },
    { key: "S3", label: "Honest self-flagging in the contemporaneous record", stream: "Values & Integrity", nonNegotiable: true, indicators: { competent: "Flags every ethically conflicted call, including the learner's own, in the record.", not: "Flags others' calls but not the learner's own conflicted decisions." } },
  ],
  lessons: [
    {
      type: "routing", n: "Case study 1", title: "You arrive to a stockout and a surge at once", typeLabel: "Routing decision · everything is happening at once",
      intro: "07:40. You are the Acting Clinical Lead. Overnight a critical medicine has run out and the patient load has surged. Three things are in front of you at the same moment: a well-connected family at the desk asking for their relative to be seen first, a queue building with no order to it, and the allocation policy in the drawer that nobody has opened yet. Decide what you do with each, now. You cannot revisit a decision once taken.",
      authorities: ["ALLOC_POLICY", "HPCZ"],
      carryBreachKey: "floorBreach",
      carryOk: "Your sequencing is recorded and carries forward.",
      carryBreach: "You have moved someone up on non-clinical grounds without flagging it. That is the ethical floor for this module: it will fail the station regardless of everything else, and it lowers staff trust, which you will feel when a colleague hesitates later. Continue to see how the rest plays out.",
      items: [
        { id: "family", label: "The well-connected family at the desk, asking for priority for their relative", options: [
          { key: "criteria", label: "Reassure them their relative will be assessed by the same criteria as everyone", quality: "sound", crit: "X1", band: "A", effect: { family: "held" }, response: "You explain, warmly and plainly, that everyone is being assessed against the same clinical criteria, and that you will apply them to their relative too. They are unhappy but they wait.", feedback: "Fairness under pressure is the whole test here. The same rule for the connected family as for everyone, said out loud." },
          { key: "priority", label: "Have their relative seen first to keep the peace", quality: "not", crit: "X1", band: "F", effect: { floorBreach: true, staffTrust: "low", family: "favoured" }, response: "You move their relative up. The desk relaxes, and two staff notice. Something quiet shifts in the room.", feedback: "Advantage granted on connection, not acuity, and not flagged. This is the floor breach the module is built around." },
          { key: "defer_flag", label: "Assess by criteria, and if any exception is unavoidable, write down exactly why", quality: "sound", crit: "S1", band: "A", effect: { family: "held" }, response: "You apply the criteria and note, in the record, the pressure you were under and that you did not act on it. Nothing is hidden.", feedback: "Surfacing your own conflict in writing is integrity made visible. It also protects you and the patient." },
        ] },
        { id: "queue", label: "The surging, disordered queue", options: [
          { key: "policy", label: "Apply the facility's triage/allocation criteria to order the queue", quality: "sound", crit: "P1", band: "A", effect: { queue: "triaged" }, response: "You open the policy, apply the triage criteria, and the queue gains an order everyone can see is not personal.", feedback: "The criteria exist so prioritisation is not improvised under load. Apply them before you prioritise." },
          { key: "firstcome", label: "See people strictly in the order they arrived", quality: "partly", crit: "P1", band: "C", effect: { queue: "fifo" }, response: "First-come-first-served feels fair, but a deteriorating patient near the back waits behind stable ones.", feedback: "Order is not the same as fairness. Clinical acuity, applied consistently, is." },
          { key: "loudest", label: "Deal with whoever is most agitated first to reduce the noise", quality: "not", crit: "P1", band: "E", effect: { queue: "loudest" }, response: "You attend to the loudest first. The room quietens for a moment and the criteria are now nobody's reference point.", feedback: "Managing volume is not triage. It rewards pressure and it is not defensible later." },
        ] },
        { id: "stock", label: "The critical-medicine stockout and the allocation policy", options: [
          { key: "check", label: "Check remaining stock against the written allocation policy before any priority call", quality: "sound", crit: "P1", band: "A", effect: { stock: "checked" }, response: "You confirm exactly what is left and read the allocation rule for scarcity before deciding anything.", feedback: "You cannot allocate fairly what you have not counted against a rule. This is the ground for Case study 2." },
          { key: "memory", label: "Allocate from your own sense of who needs it, to save time", quality: "partly", crit: "P1", band: "C", effect: { stock: "memory" }, response: "You go from memory. It is faster, and it leaves no shared criterion anyone can check.", feedback: "Speed here buys an allocation you cannot defend. The rule is the defence." },
          { key: "skip", label: "Deal with stock later once the people are moving", quality: "not", crit: "P1", band: "E", effect: { stock: "deferred" }, response: "You defer it. By the time you return, a prioritisation has already happened without any criteria.", feedback: "The scarce resource is exactly the thing the criteria exist for. It does not wait." },
        ] },
      ],
    },
    {
      type: "select", n: "Case study 2", title: "Allocate the last of the medicine", typeLabel: "Construct a defensible allocation · choose only what belongs",
      intro: "Three patients need the medicine and there is enough for one full course, or a partial split. Patient A is the most clinically acute. Patient B is the connected family's relative, stable. Patient C is moderately unwell. Select the components that make your allocation defensible and fair. Some options feel helpful or diplomatic; choose only what belongs in a decision you could stand behind at a review.",
      submitLabel: "Commit the allocation",
      authorities: ["ALLOC_POLICY", "HPCZ"],
      components: [
        { id: "acuity", label: "Allocate on clinical acuity, applying the stated criteria", correct: true, trap: false, note: "The criteria, applied. Patient A." },
        { id: "document", label: "Document the decision and the reason against the criteria", correct: true, trap: false, note: "A decision you can stand behind is a decision you wrote down." },
        { id: "connection", label: "Give weight to the family's standing to keep good relations", correct: false, trap: true, note: "Trap. Non-clinical weight is the floor breach, however diplomatic it feels." },
        { id: "split_undoc", label: "Split the course three ways to avoid choosing, without recording why", correct: false, trap: true, note: "Trap. An undocumented compromise reads as fair but becomes a defect a peer references later." },
        { id: "flag_conflict", label: "Note in the record that you were pressured on Patient B and did not act on it", correct: true, trap: false, note: "Surfacing your own conflict is integrity, and it protects the decision." },
      ],
      scoring: {
        crit: "X1", requireIds: ["acuity", "document"], trapEffectKey: "floorBreach",
        stateKey: "allocation", stateOnPass: "fair", stateOnTrap: "favoured", stateOnPartial: "compromise",
      },
      carry: "Your allocation and how you recorded it carry into the co-sign and the final record.",
    },
    {
      type: "socratic", n: "Checkpoint", title: "Defend the allocation you just made", typeLabel: "Socratic checkpoint · read by Mutale, never scored",
      prompt: "In your own words, justify the allocation you just made. What did it protect, and what did it cost, and who carried that cost?",
      authoredProbe: "You have named what your decision protected; who is the person most affected by what it cost, and did your criteria actually speak to them?",
      modelReasoning: "One competent answer, not the answer: I allocated on acuity because that is the only ground I can apply to the connected family and the stranger identically, and identical treatment is the whole point under pressure. The cost fell on Patient C, who was genuinely unwell and did not get the course; I owe that an explicit note in the record, not a silent rounding-off, because the person most affected by a scarcity decision is the one the criteria ranked second, and they deserve to be visible in it.",
      note: "Mutale reads this and asks one question back. It is never scored, and a human reviewer makes the final decision.",
    },
    {
      type: "branching", n: "Case study 3", title: "A colleague starts to tell you something, then stops", typeLabel: "Branching decision · elicit the account",
      stage: "A junior colleague, T., has twice begun to say something about how an earlier patient was handled and twice stopped. They are hovering by the door. Staff trust is already lower than it was this morning. You have two minutes before the next admission.",
      constraint: "Two minutes. A hesitant colleague. Whatever you say next either opens the account or closes it.",
      theory: "Open before closed. A leading or dismissive question either contaminates the account (the colleague agrees with your framing) or shuts it down entirely. What you need is their words, not confirmation of yours.",
      authorities: ["NON_LEADING"],
      ariaLabel: "Your next line to the colleague",
      moves: [
        { id: "open", label: "“You've started to say something twice. I've got two minutes and I'm listening, take your time.”", quality: "sound", crit: "S2", band: "A", effect: { account: "clean" }, response: "T. exhales and tells you, in their own words, that a prioritisation earlier didn't sit right with them. You have the account, uncontaminated.", feedback: "Open, unhurried, and about them. You get their words, which is the only version that is worth anything later." },
        { id: "leading", label: "“Is this about someone being pushed up the queue who shouldn't have been?”", quality: "not", crit: "S2", band: "E", effect: { account: "contaminated" }, response: "T. says 'yes, exactly,' relieved. But now you cannot tell what they saw from what you supplied. The account is contaminated.", feedback: "A leading question hands the witness your theory. Whatever comes back is partly yours, and a reviewer will treat it that way." },
        { id: "dismiss", label: "“Can it wait? We're drowning out here.”", quality: "not", crit: "S2", band: "F", effect: { account: "lost" }, response: "T. says 'it's nothing, sorry,' and goes back to the floor. Whatever it was, it is gone, and they will not start again.", feedback: "Dismissal under load is how disclosures die. The two minutes it saved cost you the fact." },
        { id: "reassure_closed", label: "“Write me a quick note on it when you get a chance.”", quality: "partly", crit: "S2", band: "C", effect: { account: "deferred" }, response: "T. nods and, in the rush, never writes it. The willingness was there in the moment and you moved it to later.", feedback: "Right instinct, wrong timing. A hesitant disclosure is elicited now, in the person's own words, or usually not at all." },
      ],
    },
    {
      type: "chainAudit", n: "Case study 4", title: "Co-sign a peer's triage decision", typeLabel: "Chain audit · one defect, before you endorse it",
      stage: "A peer, Dr M., asks you to co-sign their triage log from the surge. Co-signing is an endorsement, not a formality. The log is competent and well-kept but for one step. Find it before you sign.",
      constraint: "Your signature says the decision was sound. One step in it is not.",
      authorities: ["CO_SIGN", "HPCZ"],
      steps: [
        { id: 1, text: "Patients grouped by clinical acuity using the facility criteria.", defect: false },
        { id: 2, text: "Scarce medicine allocated to the highest-acuity patient first.", defect: false },
        { id: 3, text: "One patient moved above their acuity band; note reads 'family known to the DHO, expedited as a courtesy.'", defect: true, why: "A non-clinical reason (connection to the District Health Officer) has moved a patient up their band, and it is recorded as routine. Co-signing endorses advantage granted on non-clinical grounds, the module's floor. It must be corrected before you sign." },
        { id: 4, text: "Remaining patients re-queued by acuity, times recorded.", defect: false },
        { id: 5, text: "Handover documented and countersigned by the shift nurse.", defect: false },
      ],
      crit: "P2", effectKey: "coSignedDefect",
      carryGood: "You declined to co-sign until step 3 is corrected. The defect does not reach the final record unendorsed.",
      carryBad: "You co-signed over step 3. You have now endorsed advantage on non-clinical grounds, and it carries into the record and the assessment.",
      commitLabel: "Flag the defect",
    },
    {
      type: "artifact", n: "Case study 5", title: "Your one-page record of the last 48 hours", typeLabel: "Artifact · told as a story, flagging every conflicted call",
      intro: "Assemble the contemporaneous record you would hand to a junior colleague as a story of what happened and why. The system is watching for one thing above all: whether you flag your own conflicted calls, not only other people's. Tick the box only if the record honestly names your own.",
      docTitle: "Acting Clinical Lead · 48-hour decision record",
      docSub: "Composite. Nothing here is a real patient or facility.",
      lines: [
        { from: "family", cases: { held: { txt: "Connected family assessed on the same criteria as everyone; pressure noted and not acted on.", flag: false }, favoured: { txt: "Connected family's relative expedited on non-clinical grounds.", flag: true } }, default: { txt: "Family interaction recorded.", flag: false } },
        { from: "allocation", cases: { fair: { txt: "Medicine allocated on clinical acuity, documented against the criteria.", flag: false }, favoured: { txt: "Medicine allocation gave weight to standing; flagged as a fairness breach.", flag: true }, compromise: { txt: "Medicine split three ways without a recorded reason; flagged as an undocumented compromise.", flag: true } }, default: { txt: "Allocation recorded.", flag: false } },
        { from: "account", cases: { clean: { txt: "Colleague's disclosure elicited in their own words and preserved.", flag: false }, contaminated: { txt: "Colleague's disclosure taken through a leading question; flagged as contaminated.", flag: true }, lost: { txt: "Colleague's disclosure not elicited; flagged as a lost account.", flag: true } }, default: { txt: "Colleague interaction recorded.", flag: false } },
        { from: "coSignedDefect", cases: { "true": { txt: "Co-signed a peer's triage log containing a non-clinical expedite; flagged.", flag: true } }, default: { txt: "Peer triage log reviewed; non-clinical expedite returned for correction before co-signing.", flag: false } },
      ],
      ackLabel: "This record honestly flags my own conflicted calls, not only other people's.",
      ackCrit: "S3",
    },
  ],
  jobAid: {
    heading: "One page to your next hard shift",
    items: [
      "Apply the written allocation criteria <strong>before</strong> you prioritise, not after.",
      "The same rule for the connected family as for the stranger. If an exception is unavoidable, <strong>write down why</strong>.",
      "Open before closed. A hesitant colleague is heard <strong>now</strong>, in their own words, or usually not at all.",
      "A co-signature is an endorsement. Do not sign over a non-clinical expedite.",
      "Flag your <strong>own</strong> conflicted calls in the record, not only other people's.",
    ],
    footer: "Pass or resubmit is decided by a human reviewer on the Review Board portal. This page is yours to keep.",
  },
  alignment: [
    { o: "Given a resource-scarcity crisis, sequence first actions so no prioritisation is made before the allocation criteria are applied.", tested: "Routing decision across three concurrent pressures (Case study 1).", success: "Allocation policy applied before any priority call on all three items; no non-clinical advantage granted unflagged.", why: "Presenting the pressures at once reproduces the real cognitive load; a sequencing objective is only tested when the learner must order competing demands under it, not answer about them." },
    { o: "Identify the components that make a resource-prioritisation decision defensible and fair.", tested: "Component selection with traps (Case study 2).", success: "Selects acuity + documentation; selects neither the connection weight nor the undocumented split.", why: "Constructing the decision from its parts, with helpful-feeling traps weighted heavier than omissions, tests fairness itself rather than recall of a fairness definition." },
    { o: "Elicit a colleague's hesitant disclosure without leading or dismissing.", tested: "Branching dialogue (Case study 3).", success: "Chooses the open, unhurried invitation; the account is recorded clean, not contaminated or lost.", why: "Only a live interaction can distinguish an open elicitation from a leading one; a written question about questioning cannot." },
    { o: "Identify the single defect in a colleague's triage decision before co-signing it.", tested: "Chain audit of a competent log with one defect (Case study 4).", success: "Flags step 3 (non-clinical expedite) and declines to co-sign until corrected.", why: "Discriminating one defect inside otherwise sound work is exactly the co-signing skill; a list of triage rules would test something adjacent." },
    { o: "Produce a one-page record in which every ethically-conflicted call is flagged, including one's own.", tested: "Artifact assembled from the learner's own decisions (Case study 5), plus an honest-self-flag acknowledgement.", success: "Record flags the learner's own conflicted calls, not only others'; binary honest-self-flag met.", why: "The record is the Does-level artifact; assembling it from what the learner actually did, and checking self-flagging specifically, tests integrity as a performance, not a claim." },
  ],
};

/* ============================================================ MODULE 2 · The Overloaded Team and the Next 90 Days */
export const MRB_M2_SPEC: Spec = {
  meta: {
    code: "MRB-CLP-02", module: "Module 2", title: "The overloaded team and the next 90 days",
    version: "v0.1-demo", smeStatus: "SME sign-off PENDING",
    task: "lead a short-staffed team so no task is reassigned before the real constraint is heard, reallocate transparently, earn the trust a change idea depends on, catch an equity-excluding flaw before co-endorsing it, and produce a 90-day plan that flags its own equity gaps.",
  },
  warning: {
    title: "Before you begin",
    body: [
      "This module composes a staffing crisis on a short-staffed ward and the ninety days after it: a team member who cannot take on more, a reallocation to make, a change idea to pitch, a colleague's proposal to pressure-test, and a plan to write. Everyone is invented.",
      "No timers, no percentage grade. Your early choices change how much trust and buy-in you have later. You may leave any scenario at any point without losing progress, and you can respond in writing, by voice, or with a scribe. Nothing is reported to your institution; a human reviewer makes the final pass-or-resubmit decision.",
    ],
    startLabel: "Start the module",
  },
  authorities: {
    SERVANT: { ref: "Servant-leadership behaviours versus traits (ask and remove obstacles before commanding)", note: "Evidence base stable in principle; local application via the SME.", status: "stable" },
    REALLOC: { ref: "Transparent workload / resource-reallocation criteria", note: "Placeholder standing practice. Confirm the facility's actual criteria.", status: "practice" },
    EQUITY: { ref: "Equity-lens checklist for change initiatives (who benefits, who is left out)", note: "Social-value / equity lens. Adapt the catchment specifics locally.", status: "confirm" },
  },
  reviewTriggers: [
    "Review on any change to the facility's workload-reallocation practice.",
    "Review on any change to how catchment areas and outreach clinics are defined.",
    "Review after the first tutor-trio pilot against real portfolios.",
  ],
  nonNegotiableNote: "no change design that predictably worsens outcomes for the most vulnerable group, left unmitigated and unflagged (X2), the equity-excluding flaw caught before co-endorsing (C1), and the learner's own 90-day plan flagging its own equity gaps (C2). Each is irreversible for the people it affects; failing one fails the station.",
  criteria: [
    { key: "X2", label: "No change that worsens outcomes for the most vulnerable, unflagged", stream: "Change & Impact Design", nonNegotiable: true, indicators: { competent: "Where a design risks the poorest catchment, names the risk and a mitigation.", not: "Improves the average while quietly leaving the outreach clinics worse off." } },
    { key: "P1", label: "Real constraint heard before any task is reassigned", stream: "People-Centred Leadership", nonNegotiable: false, indicators: { competent: "Asks what is really going on and listens before deciding anything.", not: "Takes the task over or orders it managed before hearing the constraint." } },
    { key: "P2", label: "Transparent, legitimate reallocation criterion", stream: "People-Centred Leadership", nonNegotiable: false, indicators: { competent: "Reallocates on a stated capacity-and-fairness criterion the team can see.", not: "Reallocates by volunteers, favourites, or who complains least." } },
    { key: "P3", label: "Buy-in built on trust actually earned", stream: "People-Centred Leadership", nonNegotiable: false, indicators: { competent: "Pitches in a way that reflects the trust earned in the first decisions; rebuilds it first if low.", not: "Assumes buy-in the earlier decisions did not earn." } },
    { key: "C1", label: "Equity-excluding flaw caught before co-endorsing", stream: "Change & Impact Design", nonNegotiable: true, indicators: { competent: "Finds the step that excludes the poorest catchment and declines to endorse until mitigated.", not: "Co-endorses a change that improves the hospital average and ignores the outreach clinics." } },
    { key: "C2", label: "The learner's own 90-day plan flags its own equity gaps", stream: "Change & Impact Design", nonNegotiable: true, indicators: { competent: "Names who benefits and who was nearly left out, with a mitigation.", not: "Presents a clean plan with no equity gap acknowledged." } },
  ],
  lessons: [
    {
      type: "branching", n: "Case study 1", title: "“I can't take on anything else”", typeLabel: "Branching decision · what you do first sets everything after",
      stage: "Mid-crisis on a short-staffed ward, a team member, R., says quietly that she cannot take on anything more. The work still has to go somewhere. What you do in the next thirty seconds sets how much she, and the team watching, will trust you when you later need buy-in for a change of your own.",
      constraint: "The work has to move. She has just told you she is at her limit. The team is watching how you respond.",
      theory: "Servant leadership is a behaviour, not a trait: ask and remove the obstacle before you command. Taking the task back yourself looks kind but teaches the team you will absorb rather than lead; ordering her to manage it closes the conversation and the trust with it.",
      authorities: ["SERVANT"],
      ariaLabel: "Your response to R.",
      moves: [
        { id: "ask", label: "“Before we move anything, tell me what's actually going on for you right now.”", quality: "sound", crit: "P1", band: "A", effect: { trust: "high" }, response: "R. tells you she is covering a sick colleague's patients on top of her own and has not had a break since the start of the shift. Now you know the real constraint, and she knows you asked.", feedback: "Ask before you reassign. The constraint you cannot see is the one that undoes the reallocation you were about to make." },
        { id: "takeover", label: "“Leave it with me, I'll do it myself.”", quality: "partly", crit: "P1", band: "C", effect: { trust: "mid" }, response: "You absorb the task. R. is relieved for a moment, and the team learns that when things get hard, the lead does the work instead of fixing the system.", feedback: "Kind, and it hides the problem. Servant leadership removes the obstacle; it does not quietly carry it and call that leadership." },
        { id: "order", label: "“I hear you, but it has to be done, so please manage it.”", quality: "not", crit: "P1", band: "E", effect: { trust: "low" }, response: "R. says 'fine' and turns away. The task is assigned and the conversation, and something of her trust, is closed.", feedback: "Commanding over a stated limit ends the exchange and the information in it. You will feel the missing trust when you pitch your change." },
        { id: "reassure", label: "“You're doing great, don't worry, it'll settle down soon.”", quality: "not", crit: "P1", band: "D", effect: { trust: "low" }, response: "Encouragement with no action. R. still has the impossible load and now also the sense that it was not really heard.", feedback: "Reassurance without asking or removing the obstacle reads as not listening. Warmth is not the same as help." },
      ],
    },
    {
      type: "select", n: "Case study 2", title: "Reallocate the work", typeLabel: "Construct a transparent reallocation · choose only what belongs",
      intro: "The load from R.'s patients has to be shared across the team. Select the components that make the reallocation transparent and legitimate rather than arbitrary. Some options are the easy, popular move; choose only what a team member could look at and see was fair.",
      submitLabel: "Commit the reallocation",
      authorities: ["REALLOC"],
      components: [
        { id: "capacity", label: "Reallocate on each person's current capacity, stated openly", correct: true, trap: false, note: "A criterion the team can see and check." },
        { id: "explain", label: "Explain the criterion to the team before you apply it", correct: true, trap: false, note: "Transparency is the criterion being visible, not just fair in your head." },
        { id: "volunteers", label: "Ask for volunteers and give it to whoever offers", correct: false, trap: true, note: "Trap. Feels respectful; loads the willing and conscientious and calls it choice." },
        { id: "reliable", label: "Give it to the most reliable person because they'll cope", correct: false, trap: true, note: "Trap. Rewards competence with more work; arbitrary and quietly resented." },
        { id: "checkback", label: "Check the reallocation back against real capacity, not assumptions", correct: true, trap: false, note: "The criterion only holds if the capacity figures are real." },
      ],
      scoring: {
        crit: "P2", requireIds: ["capacity", "explain"],
        stateKey: "realloc", stateOnPass: "transparent", stateOnPartial: "arbitrary",
      },
      carry: "How you reallocated, and whether the team could see the criterion, carries into how your pitch lands.",
    },
    {
      type: "branching", n: "Case study 3", title: "Pitch your change idea", typeLabel: "Branching decision · buy-in rests on trust already earned",
      stage: "You have an idea to stop the overload recurring: a simple rota change. You want the team's buy-in. How it lands depends less on the idea and more on the trust you built in the last two decisions. The team is exactly as receptive as you earned them to be.",
      constraint: "The idea is fine. The room's trust in you is whatever your first two decisions made it.",
      theory: "A transformational vision is tested with people, not announced at them. If trust is low, the first move is not a better pitch; it is a specific step to rebuild the trust the idea depends on.",
      authorities: ["SERVANT"],
      ariaLabel: "How you pitch the change",
      moves: [
        { id: "cocreate", label: "“Here's a rough idea to fix the recurring overload. I want to build it with you, what am I missing?”", quality: "sound", crit: "P3", band: "A", effect: { buyin: "earned" }, response: "Because you asked R. earlier and reallocated in the open, the team engages and improves the idea. Buy-in is real because the trust behind it is.", feedback: "A vision tested with the team, on a foundation of trust actually earned, is how change survives contact with the ward." },
        { id: "announce", label: "“I've worked out a new rota. We start it Monday.”", quality: "partly", crit: "P3", band: "C", effect: { buyin: "thin" }, response: "You announce it fully formed. People comply, and the idea gets none of the improvement, and none of the ownership, that the team would have added.", feedback: "Top-down delivery of a good idea buys compliance, not buy-in. The difference shows the first time the rota is inconvenient." },
        { id: "assume", label: "“You trust me, so let's just do this my way for now.”", quality: "not", crit: "P3", band: "E", effect: { buyin: "none" }, response: "If your earlier decisions lowered trust, this lands badly: you are spending trust you did not earn, and the team knows it. Rebuilding it now needs its own step in your plan.", feedback: "Buy-in cannot be asserted. Where the trust is not there, the plan needs a real trust-rebuilding step before the change, not a claim." },
      ],
    },
    {
      type: "socratic", n: "Checkpoint", title: "Defend how you pitched it", typeLabel: "Socratic checkpoint · read by Mutale, never scored",
      prompt: "In your own words, why did you pitch the change the way you did, and how did the trust you built earlier, or didn't, shape what you could ask of the team?",
      authoredProbe: "You have described how you pitched it; if the trust wasn't fully there, what specific step would rebuild it before you ask the team to change anything?",
      modelReasoning: "One competent answer, not the answer: I brought a rough idea rather than a finished rota because the point was ownership, not applause, and because I had asked R. what was going on earlier, the team had reason to believe this was another honest ask rather than a decision already made. If I had ordered her earlier, no phrasing would fix the pitch; I would have had to name that openly, do one concrete thing that returned some control to the team, and let the change wait a week rather than spend trust I had not earned.",
      note: "Mutale reads this and asks one question back. It is never scored, and a human reviewer makes the final decision.",
    },
    {
      type: "chainAudit", n: "Case study 4", title: "Pressure-test a colleague's proposed change", typeLabel: "Chain audit · one equity-excluding flaw, before you endorse it",
      stage: "A colleague, Dr S., asks you to co-endorse their improvement proposal. It is thoughtful and would help the hospital overall. One step quietly leaves out the people who can least afford it. Find it before you sign your name to it.",
      constraint: "Your endorsement says this is a good change for everyone it touches. One step means it is not.",
      authorities: ["EQUITY"],
      steps: [
        { id: 1, text: "New triage-and-flow model designed to cut waiting times across the main hospital site.", defect: false },
        { id: 2, text: "Staff training and a phased rollout scheduled over the quarter.", defect: false },
        { id: 3, text: "Outreach clinics serving the poorest rural catchment excluded from the rollout to 'keep the pilot clean', with no plan to include them later.", defect: true, why: "The change improves the hospital average while predictably leaving the most vulnerable catchment worse off in relative terms, unmitigated and unflagged. This is the module's floor: co-endorsing it endorses that exclusion. It must carry a mitigation and a flag before you sign." },
        { id: 4, text: "Success measured by main-site waiting times and patient-satisfaction scores.", defect: false },
        { id: 5, text: "Quarterly review with the ward leads scheduled.", defect: false },
      ],
      crit: "C1", effectKey: "endorsedFlaw",
      carryGood: "You declined to co-endorse until the outreach clinics are included or the exclusion is explicitly mitigated and flagged.",
      carryBad: "You co-endorsed a change that leaves the poorest catchment behind, unflagged. That carries into your own plan and the assessment.",
      commitLabel: "Flag the flaw",
    },
    {
      type: "artifact", n: "Case study 5", title: "Your 90-day leadership plan", typeLabel: "Artifact · told as the story of who benefits, and who was nearly left out",
      intro: "Assemble the 90-day plan you would actually take to your ward. The system is watching for one thing above all: whether you name your own equity gap, not only the one you caught in someone else's proposal. Tick the box only if your plan honestly flags who your design might leave out, and what you will do about it.",
      docTitle: "90-day leadership action plan",
      docSub: "Composite. Nothing here is a real ward or catchment.",
      lines: [
        { from: "trust", cases: { high: { txt: "Team constraint heard first; trust high going into the change.", flag: false }, low: { txt: "Early decision lowered trust; plan includes a specific trust-rebuilding step.", flag: true } }, default: { txt: "Team engagement recorded.", flag: false } },
        { from: "realloc", cases: { transparent: { txt: "Workload reallocated on a stated capacity criterion, explained to the team.", flag: false }, arbitrary: { txt: "Reallocation was not fully transparent; flagged for correction.", flag: true } }, default: { txt: "Reallocation recorded.", flag: false } },
        { from: "buyin", cases: { earned: { txt: "Change co-created with the team; buy-in earned.", flag: false }, thin: { txt: "Change announced top-down; ownership thin, flagged.", flag: true }, none: { txt: "Buy-in assumed but not earned; trust-rebuild step required before rollout.", flag: true } }, default: { txt: "Pitch recorded.", flag: false } },
        { from: "endorsedFlaw", cases: { "true": { txt: "Co-endorsed a change excluding the outreach clinics; flagged for mitigation.", flag: true } }, default: { txt: "Colleague's proposal returned for an equity mitigation before endorsement.", flag: false } },
      ],
      ackLabel: "This plan names who it might leave out, and what I will do about it, not only the gap I caught in someone else's proposal.",
      ackCrit: "C2",
    },
  ],
  jobAid: {
    heading: "One page to your next 90 days",
    items: [
      "Ask what's really going on <strong>before</strong> you reassign a single task.",
      "Reallocate on a criterion the team can <strong>see</strong>, not on volunteers or favourites.",
      "You cannot assert buy-in. Where trust is thin, rebuild it before you ask for change.",
      "An endorsement is a promise it helps everyone it touches. Do not sign over an excluded catchment.",
      "Name who your own plan might leave out, and what you'll do about it.",
    ],
    footer: "Pass or resubmit is decided by a human reviewer on the Review Board portal. This page is yours to keep.",
  },
  alignment: [
    { o: "Given a staffing crisis, sequence first actions so no task is reassigned before the team member's real constraint is heard.", tested: "Branching response to a stated limit (Case study 1).", success: "Chooses to ask before reassigning; trust variable set high, not lowered by taking over or ordering.", why: "Only a live response distinguishes asking from commanding; the choice also sets the persisting trust the later pitch depends on, which a recall item could not do." },
    { o: "Identify what makes a task-reallocation decision transparent and legitimate rather than arbitrary.", tested: "Component selection with popular-feeling traps (Case study 2).", success: "Selects a stated capacity criterion + explaining it; selects neither volunteers nor the reliable-person shortcut.", why: "Transparency is tested by building the decision from visible parts, with the easy popular moves as weighted traps, not by defining transparency." },
    { o: "Pitch a change so buy-in rests on trust earned, not idea quality alone.", tested: "Branching pitch whose outcome is gated by the earlier trust variable (Case study 3).", success: "Pitch matches the trust actually earned; where low, includes a concrete rebuild step rather than assuming buy-in.", why: "Consequence carried from Case studies 1-2 is the only way to test that buy-in follows trust rather than eloquence." },
    { o: "Identify the single equity-excluding flaw in a colleague's proposed change before co-endorsing it.", tested: "Chain audit of a strong proposal with one exclusion (Case study 4).", success: "Flags step 3 (outreach clinics excluded) and declines to co-endorse until mitigated.", why: "Discriminating the one step that harms the most vulnerable inside otherwise good work is exactly the social-value review skill." },
    { o: "Produce a 90-day plan in which every equity gap, including one's own, is flagged.", tested: "Artifact assembled from the learner's decisions (Case study 5) plus an own-equity-gap acknowledgement.", success: "Plan names who it might leave out and a mitigation; binary own-equity-flag met.", why: "The plan is the Does-level artifact; checking that the learner flags their own gap, not only the one they caught, tests the equity lens as a habit rather than a one-off catch." },
  ],
};
