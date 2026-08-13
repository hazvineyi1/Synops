/*
 * Authored Decision Station specs for the Project Expedite Justice demo course.
 *
 * These are stored verbatim into interactive_activities.spec (jsonb) and rendered by the
 * frontend DecisionStationPlayer (components/DecisionStation.tsx). The shape here MUST match
 * the StationSpec types in that component. Kept as plain data (typed loosely) because the
 * api-server package cannot import the frontend types across packages.
 *
 * All legal content is tagged with a sign-off status and is UNVERIFIED (pending SME).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Spec = Record<string, any>;

/* ============================================================ MODULE 1 */
export const PEJ_M1_SPEC: Spec = {
  meta: {
    code: "PEJ-EVD-01", module: "Module 1", title: "Documenting the scene",
    version: "v0.1-demo", smeStatus: "SME sign-off PENDING",
    task: "document a conflict-related crime scene under field conditions so the physical and digital evidence is admissible and the chain of custody is unbroken.",
  },
  warning: {
    title: "Before you begin",
    body: [
      "This module composes a scene from the full-scale invasion of Ukraine that began in February 2022, recognising that the armed conflict began in 2014. The site is in a temporarily occupied territory now de-occupied. Everything you will read is a composite: people, units, enterprises and places are invented, and names are given as initials.",
      "Some material describes the aftermath of violence, including a reference to human remains. You may leave any scenario at any point without losing your progress. Nothing you do here is reported to your institution.",
    ],
    startLabel: "Start the module",
  },
  authorities: {
    CPC_INSPECTION: { ref: "CPC of Ukraine, inspection & register entry", note: "Article numbers to be confirmed against current text.", status: "confirm" },
    CPC_615: { ref: "CPC of Ukraine, art. 615, regime under martial law", note: "Amended repeatedly during the full-scale invasion. Confirm current text.", status: "confirm" },
    CPC_225: { ref: "CPC of Ukraine, art. 225, preservation of evidence before the investigating judge", note: "Confirm, including known practice limitations.", status: "confirm" },
    BERKELEY: { ref: "Berkeley Protocol on Digital Open Source Investigations, seizure, isolation, hashing", note: "Stable.", status: "stable" },
    MINNESOTA: { ref: "Minnesota Protocol, examination of a body", note: "Confirm the corresponding domestic articles before use.", status: "confirm" },
    CUSTODY_PRACTICE: { ref: "Domestic evidential practice, contemporaneous record & chain of custody", note: "Practice layer. Must come from the SME; not settled here.", status: "practice" },
  },
  reviewTriggers: [
    "Review on any amendment to CPC art. 225 or art. 615.",
    "Review on publication of a revised Berkeley Protocol.",
    "Review on any change to oblast scene-handling standing instructions.",
  ],
  nonNegotiableNote: "safety floor (X1), non-suggestive elicitation (S2), chain of custody unbroken (P2). Each is irreversible in a real file; failing one fails the station.",
  criteria: [
    { key: "X1", label: "Safety floor, no action on a suspected hazard before clearance", stream: "Application of procedure or law", nonNegotiable: true, indicators: { competent: "Treats the suspected item as live; documents from distance; waits for EOD.", not: "Approaches, moves, or photographs the item at close range before clearance." } },
    { key: "P1", label: "Lawful basis for the inspection under martial law", stream: "Application of procedure or law", nonNegotiable: false, indicators: { competent: "Constitutes the inspection with a register entry and the correct martial-law regime.", not: "Proceeds on an informal basis, or invokes a regime that does not fit the situation." } },
    { key: "S2", label: "Non-suggestive elicitation of the initial account", stream: "Skills", nonNegotiable: true, indicators: { competent: "Opens wide, records in the witness's words, takes only what the file needs.", not: "Leads the witness, or takes detail the file does not need." } },
    { key: "P2", label: "Chain of custody / register entry unbroken", stream: "Application of procedure or law", nonNegotiable: true, indicators: { competent: "Every transfer and reseal has a register entry; no gap.", not: "A reseal, move, or handover with no corresponding entry." } },
    { key: "P3", label: "Digital device isolated and its integrity fixed", stream: "Application of procedure or law", nonNegotiable: false, indicators: { competent: "Device isolated from the network; a hash is taken and recorded.", not: "Device left connected, examined in place, or seized without a hash." } },
    { key: "S3", label: "Discrimination of a defect inside competent work", stream: "Skills", nonNegotiable: false, indicators: { competent: "Finds the one step that breaks integrity, not merely the untidy step.", not: "Flags cosmetic issues and misses the integrity break." } },
  ],
  lessons: [
    {
      type: "routing", n: "Lesson 1", title: "You are the first qualified officer on the site", typeLabel: "Routing decision · every item at once",
      intro: "Dusk, a farmstead outside a recently de-occupied village. The grain store has been emptied, this is the substance of the file under Criminal Code art. 438. EOD has been called but has not arrived. Light is going. Decide what you do with each item below. You are choosing an action for each, including what not to touch, and you cannot revisit a decision once taken.",
      authorities: ["CPC_INSPECTION", "BERKELEY", "MINNESOTA"],
      carryBreachKey: "safetyBreach",
      carryOk: "Your sequencing is recorded and carries forward.",
      carryBreach: "A safety-floor breach has been recorded. It will fail the station regardless of everything else you do, that is what a non-negotiable means. Continue to see how the rest plays out.",
      items: [
        { id: "device", label: "A mobile phone on the kitchen table, screen lit, connected to a network", options: [
          { key: "isolate", label: "Isolate it now, flight mode, photograph in place, bag for hashing", quality: "sound", crit: "P3", band: "A", effect: { device: "hashed" }, response: "You put it into flight mode, photograph it in place, note the time, and bag it for a hash. Its integrity is fixed.", feedback: "A live, connected device is the one thing on a scene that degrades while you decide. It goes first." },
          { key: "later", label: "Note it and come back after the walk-through", quality: "partly", crit: "P3", band: "C", effect: { device: "later" }, response: "You leave it and come back after the walk-through. It has received two messages and dropped off the network in the meantime.", feedback: "Order the scene by decay rate, not by walking order." },
          { key: "examine", label: "Open it to see what is on it", quality: "not", crit: "P3", band: "E", effect: { device: "handled" }, response: "You open it to check what is on it. The last-accessed times are now yours, not the suspect's.", feedback: "Examining in place writes your fingerprints into the metadata." },
        ] },
        { id: "ordnance", label: "A metal object, fin-tailed, half-buried by the barn door", options: [
          { key: "leave", label: "Cordon wide, photograph from distance, note for EOD", quality: "sound", crit: "X1", band: "A", effect: { ordnance: "cordoned" }, response: "You mark a wide cordon, photograph from distance with a scale, and note it for EOD. You do not go near it.", feedback: "The safety floor is not a documentation choice. Suspected ordnance is live until EOD says otherwise." },
          { key: "photo_close", label: "Step in for a close scale photograph", quality: "not", crit: "X1", band: "F", effect: { ordnance: "breach", safetyBreach: true }, response: "You step in for a scale photograph.  This is the one move that ends the exercise in a real scene. It is recorded as a safety-floor breach.", feedback: "No image is worth standing over unexploded ordnance." },
          { key: "move", label: "Reposition it for a cleaner shot", quality: "not", crit: "X1", band: "F", effect: { ordnance: "breach", safetyBreach: true }, response: "You reposition it for a cleaner shot.  Recorded as a safety-floor breach.", feedback: "Never handle suspected ordnance. This is irreversible." },
        ] },
        { id: "grain", label: "The emptied grain store, the substance of the alleged offence (art. 438)", options: [
          { key: "document", label: "Photograph the emptied bays now, with scale", quality: "sound", crit: null, band: "B", effect: { scene: "documented" }, response: "You photograph the emptied bays with scale and orientation, and record the residue and the tyre tracks at the loading door.", feedback: "The crime base is the reason you are here; document it before it weathers." },
          { key: "wait", label: "Wait until the device and ordnance are handled", quality: "partly", crit: null, band: "C", effect: { scene: "waited" }, response: "You hold off until the device and the ordnance are dealt with. Light is failing and you photograph it in poorer conditions.", feedback: "Some items decay faster than the crime base; the store is not going anywhere, but the light is." },
        ] },
        { id: "body", label: "Human remains reported in the adjacent field", options: [
          { key: "specialist", label: "Secure, do not disturb, refer for medico-legal examination", quality: "sound", crit: null, band: "B", effect: { remains: "referred" }, response: "You secure the area, do not disturb it, and record it for the medico-legal examination under the proper procedure.", feedback: "Remains are a specialist examination, not a scene photograph. Secure and refer." },
          { key: "photograph", label: "Document it yourself in full detail", quality: "not", crit: null, band: "E", effect: { remains: "self" }, response: "You document it yourself in detail. You have now taken more than the file needs and pre-empted the examination.", feedback: "Taking more than the file requires is a failure here, not diligence." },
        ] },
      ],
    },
    {
      type: "select", n: "Lesson 2", title: "You must make the inspection lawful before it is anything else", typeLabel: "Component selection · build a compliant product",
      intro: "The store is in front of you and the light is going, but nothing you document is worth anything if the inspection itself does not hold. Select the components that constitute a lawful inspection here. Some options are designed to feel helpful. Choose only what belongs.",
      authorities: ["CPC_INSPECTION", "CPC_615", "CPC_225"],
      submitLabel: "Constitute the inspection",
      carry: "A component chosen wrongly (a trap) costs you more than one left out, because a wrong basis travels into everything you document next.",
      scoring: { crit: "P1", requireIds: ["register", "regime615", "judge225"] },
      components: [
        { id: "register", label: "Enter the inspection in the register at the point it begins", correct: true, note: "Required, the entry is what makes the inspection an act on the file rather than a visit." },
        { id: "regime615", label: "Apply the martial-law regime for investigative actions (art. 615)", correct: true, note: "Correct for a site in a zone under martial law; it is the regime that governs the timing and authorisation here." },
        { id: "judge225", label: "Plan preservation of perishable evidence before the investigating judge (art. 225)", correct: true, note: "Right to plan now; some of this evidence will not survive to a later hearing." },
        { id: "consent_owner", label: "Obtain the landowner's written consent as the legal basis for entry", correct: false, trap: true, note: "Consent of an owner is not the procedural basis for a crime-scene inspection here, and relying on it can undercut admissibility. It feels courteous and helpful; it is the wrong instrument." },
        { id: "backdate", label: "Prepare the protocol now and enter the start time as when you first radioed in", correct: false, trap: true, note: "Recording a time other than the actual time of the act is a contemporaneity failure that a defence will find. Never adjust the record to look tidier." },
        { id: "wait_warrant", label: "Halt all documentation until a separate written authorisation arrives tomorrow", correct: false, note: "Under the martial-law regime, perishable evidence documented now would be lost by tomorrow. This is over-caution, not rigour." },
      ],
    },
    {
      type: "branching", n: "Lesson 3", title: "How you open decides whether her account can be used", typeLabel: "Branching decision beat · live interaction",
      stage: "A farm worker, Ms K., stayed through the occupation and is standing at the loading door. She is willing to talk and clearly wants to help. Your interpreter is beside you. You have perhaps ten minutes before the light goes.",
      constraint: "Time is short and she is eager, the two conditions under which good interviewers lead a witness.",
      theory: "An account taken by a leading question is not weak evidence; in this file it is unusable evidence, and it stays in the file marked so. Open before closed; record her words, not your inference.",
      authorities: ["CUSTODY_PRACTICE", "CPC_225"], ariaLabel: "Your opening move with Ms K.",
      moves: [
        { id: "open", label: "\"Tell me what happened here, in your own words, from wherever you want to start.\"", quality: "sound", crit: "S2", band: "A", effect: { account: "clean" }, response: "She describes lorries at the store over three days and a man she calls 'the one who counted'. It is in her words, and it is usable.", feedback: "The widest possible opener costs you nothing and protects everything downstream." },
        { id: "preserve", label: "\"Before we speak, I can arrange to have your testimony preserved before an investigating judge under article 225. Shall we do that now?\"", quality: "partly", crit: "S2", band: "C", effect: { account: "delayed" }, response: "Right instrument, wrong moment. She does not know what article 225 is; she came to tell you something and now feels processed. She gives you less, and the light goes. Preservation is a real and important step, after the account, not as the opening move, and not in that register.", feedback: "The most dangerous wrong answer is the correct one delivered too early, in language the person cannot use. Right law, wrong timing." },
        { id: "lead", label: "\"You saw Russian soldiers loading the grain onto military lorries, didn't you?\"", quality: "not", crit: "S2", band: "F", effect: { account: "tainted" }, response: "She agrees, because you offered her the words and she wants to help. You now have a confirmation you put in her mouth. This fact is given to you, marked UNUSABLE, and it will appear flagged in the record you build in Lesson 6.", feedback: "A leading question does not just weaken an answer, it manufactures one. This is irreversible for this account." },
        { id: "detail", label: "\"Describe the soldiers, their faces, exactly what each one did to people here.\"", quality: "not", crit: "S2", band: "E", effect: { account: "overreach" }, response: "She becomes distressed recounting detail your file does not require. You have taken more than the case needs and harmed the person to do it.", feedback: "Proportionality is a skill criterion. Do not extract detail the file will never use." },
      ],
    },
    {
      type: "socratic", n: "Checkpoint", prompt: "Justify, in your own words, the decision you took with Ms K. at the loading door. What did it cost you, and what did it gain?",
      authoredProbe: "You have named what you gained, what did the moment cost the person in front of you, and did the file need that cost?",
      modelReasoning: "One competent answer, not the answer. The opening move here is almost never about evidence law in the first instance; it is about not spending the witness. A wide opener costs nothing and keeps every later option open, preservation under article 225, a fuller interview, a referral. A leading question or a premature procedural move both spend something you cannot get back: the first the usability of the account, the second the person's willingness. Where your own reasoning went further than this, for instance if you weighed her safety or displacement risk before anything else, keep yours.",
      note: "Your written answers here are read by your coach and are never scored by the platform.",
    },
    {
      type: "chainAudit", n: "Lesson 5", title: "Co-sign only if the chain holds", typeLabel: "Chain audit · one defect inside competent work",
      stage: "A colleague, Investigator D., hands you his completed seizure log for the phone and a ledger taken from the store, and asks you to co-sign it before it goes to the case file. You read it as competent work. Find the one step that breaks integrity, co-sign only if it holds.",
      constraint: "He is senior to you, the log looks professional, and he is waiting.",
      authorities: ["CUSTODY_PRACTICE", "BERKELEY"], crit: "S3", secondCrit: "P2", decoyId: 4, effectKey: "chain",
      commitLabel: "Commit, this is the step I will not co-sign",
      carryGood: "You found the break: an unrecorded reopening of the most important exhibit. Withheld from co-sign, it can be cured by a supplementary entry. Missed, it fails at trial.",
      carryBad: "You co-signed over the break. The unrecorded reopening at step 3 travels to the case file and surfaces as a chain-of-custody challenge, a non-negotiable failure.",
      decoyNote: "Step 4 references the original seal A-0447 after the reseal to A-0461, untidy, worth a note, but not the break. The integrity failure is the unrecorded reopening at step 3.",
      steps: [
        { id: 1, text: "09:12, Phone photographed in place, time recorded, placed in flight mode. Bagged, sealed, seal no. A-0447.", defect: false },
        { id: 2, text: "09:20, Ledger photographed, each page, with scale. Bagged, sealed, seal no. A-0448. Register entry made.", defect: false },
        { id: 3, text: "10:05, At the vehicle, phone bag reopened to confirm the model for the log, resealed under a new seal A-0461. (No register entry for the reopening.)", defect: true, why: "The reseal has no register entry. The bag was opened and closed with nothing recording who did it or why, that is the break in the chain, and it is the exhibit that matters most." },
        { id: 4, text: "10:40, Digital hash of the phone image taken and recorded against seal A-0447.", defect: false },
        { id: 5, text: "11:15, Exhibits logged into the register; custody transferred to the exhibits officer with signatures.", defect: false },
      ],
    },
    {
      type: "artifact", n: "Lesson 6", title: "Produce the record you would actually file", typeLabel: "Artifact · transfers to your live caseload",
      intro: "This is the one page that leaves the module. It is assembled from the decisions you took, nothing is added. Items you compromised are flagged; they are flagged for you, not hidden from you. In the live version you upload a redacted version to your coach. No case material is stored on the platform.",
      docTitle: "Contemporaneous scene record & chain-of-custody memo", docSub: "PEJ-EVD-01 · composite site · initials only · no real case data",
      ackLabel: "I have reviewed the flags and would file this record as it stands (in the live module this uploads to your coach).",
      lines: [
        { from: "device", cases: { hashed: { txt: "Exhibit 1 (mobile phone), isolated in flight mode, photographed in place, hashed and sealed.", flag: false }, handled: { txt: "Exhibit 1 (mobile phone), examined in place; last-access metadata compromised.", flag: true }, later: { txt: "Exhibit 1 (mobile phone), not secured before it changed state.", flag: true } }, default: { txt: "Exhibit 1 (mobile phone), not secured before it changed state.", flag: true } },
        { from: "ordnance", cases: { cordoned: { txt: "Suspected ordnance, cordoned and documented from distance; left for EOD.", flag: false }, breach: { txt: "Suspected ordnance, APPROACHED/HANDLED before EOD. Safety-floor breach recorded.", flag: true } }, default: { txt: "Suspected ordnance, handling not recorded.", flag: true } },
        { from: "scene", cases: { documented: { txt: "Crime base (emptied grain store), photographed with scale and orientation.", flag: false }, waited: { txt: "Crime base, documented late, in poorer light.", flag: true } }, default: { txt: "Crime base, documentation incomplete.", flag: true } },
        { from: "remains", cases: { referred: { txt: "Human remains, secured and referred for medico-legal examination.", flag: false }, self: { txt: "Human remains, handling not compliant with the specialist pathway.", flag: true } }, default: { txt: "Human remains, handling not compliant with the specialist pathway.", flag: true } },
        { from: "account", cases: { clean: { txt: "Initial account of Ms K.  taken by open question, recorded in her words. USABLE.", flag: false }, delayed: { txt: "Initial account of Ms K.  partial; opening spent on procedure before the account. Usable but thin.", flag: false }, tainted: { txt: "Initial account of Ms K.  obtained by a leading question. MARKED UNUSABLE.", flag: true }, overreach: { txt: "Initial account of Ms K.  includes detail beyond the file's need. Review for proportionality.", flag: true } }, default: { txt: "Initial account, not taken.", flag: true } },
        { from: "chain", cases: { caught: { txt: "Chain of custody, reopening of Exhibit 1 caught before co-sign; supplementary entry required.", flag: false }, missed: { txt: "Chain of custody, unrecorded reopening of Exhibit 1 NOT caught. Integrity challenge live.", flag: true } }, default: { txt: "Chain of custody, not reviewed.", flag: true } },
      ],
    },
  ],
  alignment: [
    { o: "O1 [Knows how] Given a de-occupied site with a suspected hazard, sequence first actions so no action is taken on the hazard before EOD clearance.", tested: "Lesson 1, routing decision per item, all items presented at once.", success: "Hazard item resolved as 'cordon & document from distance'; zero safety-floor breaches (binary).", why: "Routing-under-load presents everything at once, reproducing the real condition in which the safety error is actually made; a sequencing test with items shown one at a time would test recall, not triage." },
    { o: "O2 [Knows how] Given inspection under martial law, select the components that make it lawful so the record survives an admissibility challenge.", tested: "Lesson 2, component selection with helpful-feeling traps.", success: "All required components selected AND zero traps selected; a trap is weighted heavier than an omission.", why: "Component selection tests construction of a compliant product, not recognition of a definition; weighting the trap tests the specific failure (a plausible wrong basis) rather than mere completeness." },
    { o: "O3 [Shows how] Given a cooperative witness at the scene, elicit an initial account so no fact enters the file through a leading question.", tested: "Lesson 3, branching decision beat; consequence persists into the Lesson 6 artifact.", success: "Opening move is the wide opener (band A); any leading move marks the account UNUSABLE and flags it in the artifact (binary taint).", why: "A live branching beat is the only type that can make the account's usability depend on the participant's own words in the moment; a multiple-choice item could not carry the taint forward." },
    { o: "O4 [Shows how] Given a colleague's seizure log, identify the single defect so the exhibit's integrity is preserved.", tested: "Lesson 5, chain audit; all steps competent but one.", success: "The unrecorded reopening (step 3) identified before co-sign; identifying a cosmetic step instead scores C or below.", why: "A chain audit is the only type that tests discrimination of a defect inside otherwise-competent work; a knowledge question about the rules would test the rule, not the eye for the break." },
    { o: "O5 [Does] Produce a one-page contemporaneous record in which every tainted item is flagged.", tested: "Lesson 6, artifact assembled from prior decisions.", success: "Artifact filed with every compromised item carrying a visible flag; nothing added beyond the decisions taken.", why: "The Does objective can only be discharged by a produced artifact carrying the consequences of earlier choices; any other test measures intention, not performance." },
  ],
  jobAid: {
    heading: "Job aid, first hour at a conflict-related scene (one page, no theory)",
    items: [
      "<strong>Safety floor first.</strong> Suspected ordnance is live until EOD clears it. Cordon wide, photograph from distance, never handle or move it.",
      "<strong>Order by decay, not by walking route.</strong> A live connected device changes by the second, isolate (flight mode), photograph in place, seal for a hash, before it changes.",
      "<strong>Make the inspection lawful before it is anything else.</strong> Register entry at the point it begins; the martial-law regime (art. 615, confirm) governs; plan art. 225 preservation for perishable evidence. Owner's consent is not your basis.",
      "<strong>Open wide, then narrow.</strong> \"Tell me in your own words.\" Record the witness's words, not your inference. A leading question makes the account unusable. Take only what the file needs.",
      "<strong>Every reopening gets an entry.</strong> No reseal, move, or handover without a register line. The exhibit that matters most is the one to check twice.",
      "<strong>The record is contemporaneous.</strong> Real times, at the time. Never adjust the record to look tidier.",
    ],
    footer: "Authorities carry sign-off status. Confirm every \"confirm\"-tagged article against current text before operational use. Law last verified: pending SME · v0.1-demo.",
  },
};

/* ============================================================ MODULE 2 */
export const PEJ_M2_SPEC: Spec = {
  meta: {
    code: "PEJ-EVD-01", module: "Module 2", title: "Getting the account",
    version: "v0.1-demo", smeStatus: "SME sign-off PENDING",
    task: "take a witness's account so consent is informed and continuous, the account is in his own words, only proportionate detail is taken, a disclosure is handled without harm, and the testimony is preserved before he is displaced.",
  },
  warning: {
    title: "Before you begin",
    body: [
      "This module composes an interview from the full-scale invasion of Ukraine that began in February 2022, recognising that the armed conflict began in 2014. Mr H. and everything he says are a composite: no real person, place or unit is used, and names are given as initials.",
      "The material includes a disclosure of ill-treatment. You may leave any scenario at any point without losing your progress. Nothing you do here is reported to your institution, and no model ever speaks in the witness's voice, every line he says is authored.",
    ],
    startLabel: "Start the module",
  },
  authorities: {
    MURAD: { ref: "Murad Code, informed consent, proportionality, do no harm", note: "Stable.", status: "stable" },
    INTERVIEW: { ref: "Investigative interviewing evidence base, open before closed", note: "Stable, general.", status: "stable" },
    ISTANBUL: { ref: "Istanbul Protocol, where ill-treatment is disclosed", note: "Stable.", status: "stable" },
    CPC_225: { ref: "CPC of Ukraine, art. 225, preservation of testimony before the investigating judge", note: "Confirm current text, including known practice limitations.", status: "confirm" },
    RECORD: { ref: "Domestic evidential practice, record in the witness's words, exclude inference", note: "Practice layer. Must come from the SME.", status: "practice" },
    REFERRAL: { ref: "Local referral / support pathways", note: "Sourced locally; changes often. Verify before each deployment.", status: "practice" },
  },
  reviewTriggers: [
    "Review on any amendment to CPC art. 225.",
    "Review on publication of a revised Murad Code or Istanbul Protocol.",
    "Review on any change to local referral pathways (verify each deployment).",
  ],
  nonNegotiableNote: "informed consent (P_CONSENT), disclosure handled without harm (S_DISC), testimony preserved before displacement (P_PRESERVE). Each is irreversible in a real file; failing one fails the station.",
  criteria: [
    { key: "P_CONSENT", label: "Informed, revocable consent constituted before the account", stream: "Application of procedure or law", nonNegotiable: true, indicators: { competent: "Explains use and the right to stop; private space and interpreter set; no covert recording or promised outcome.", not: "Records covertly, promises an outcome, or opens the account before consent is established." } },
    { key: "S_OPEN", label: "Non-suggestive opening of the account", stream: "Skills", nonNegotiable: false, indicators: { competent: "Opens wide; lets the witness narrate in their own words before any closed question.", not: "Leads the witness, or funnels into closed questions before the account exists." } },
    { key: "S_PROP", label: "Proportionality, only detail the file needs", stream: "Skills", nonNegotiable: false, indicators: { competent: "Asks what bears on reliability and linkage; leaves graphic and personal detail the file does not need.", not: "Takes graphic or personal detail beyond the file's need." } },
    { key: "S_DISC", label: "Disclosure of ill-treatment handled without harm; consent renewed", stream: "Skills", nonNegotiable: true, indicators: { competent: "Acknowledges, checks he wants to continue, defers detail to the specialist pathway, offers support.", not: "Presses for detail, gives a false assurance, or ignores the disclosure." } },
    { key: "P_PRESERVE", label: "Testimony preserved before displacement by the correct mechanism", stream: "Application of procedure or law", nonNegotiable: true, indicators: { competent: "Lodges the art. 225 request before the witness relocates.", not: "Relies on a re-interview or a recording that will not survive the witness leaving." } },
    { key: "P_REFERRAL", label: "Support / referral pathway offered", stream: "Application of procedure or law", nonNegotiable: false, indicators: { competent: "The referral pathway is to hand and offered.", not: "No support pathway offered." } },
  ],
  lessons: [
    {
      type: "select", n: "Lesson 1", title: "Before a single word of the account, decide what you establish", typeLabel: "Component selection · build informed consent",
      intro: "Mr H., a displaced farmer, is ready to talk now. It is tempting to let him start. Select what you put in place first. Some options feel like they protect the account; one or two of them destroy it.",
      authorities: ["MURAD", "REFERRAL", "RECORD"], submitLabel: "Establish consent",
      carry: "A consent trap taints everything the interview produces, a non-negotiable failure regardless of how well the rest goes.",
      scoring: { crit: "P_CONSENT", requireIds: ["explain_use", "interpreter_private"], trapEffectKey: "consentTrap", referralCrit: "P_REFERRAL", referralId: "referral_ready", stateKey: "consent", stateOnPass: "informed", stateOnTrap: "compromised", stateOnPartial: "incomplete" },
      components: [
        { id: "explain_use", label: "Explain plainly what the account is for, who may see it, and that he can stop or withdraw at any time", correct: true, note: "The heart of informed, continuous consent (Murad Code). Without it, the account is neither informed nor freely given." },
        { id: "interpreter_private", label: "Confirm a private space and a trained interpreter he is comfortable with", correct: true, note: "Conditions for a safe, accurate account." },
        { id: "referral_ready", label: "Have the support / referral pathway to hand before you start", correct: true, note: "Do no harm, you do not open this conversation without knowing where to send him." },
        { id: "record_covert", label: "Begin recording quietly without mentioning it, so he speaks naturally", correct: false, trap: true, note: "Covert recording destroys informed consent. It feels like it protects the account; it taints it and breaches the Murad Code." },
        { id: "promise_outcome", label: "Reassure him that his account will lead to a prosecution and justice", correct: false, trap: true, note: "A promised outcome you cannot guarantee is a false assurance (do no harm). Never trade a conviction for an account." },
        { id: "full_history", label: "Take his full personal and family history first, to build rapport", correct: false, note: "Rapport does not require detail the file will never use. Proportionality starts before the first question." },
      ],
    },
    {
      type: "branching", n: "Lesson 2", title: "How you open decides whether his account can be used", typeLabel: "Branching decision beat · live interaction",
      stage: "Mr H. is sitting across from you at a reception centre. Consent is done; the interpreter is ready. He looks at you, waiting. Your first move sets whether his account can be used.",
      constraint: "He is willing and a little anxious, he wants to give you what you need, which is exactly when a witness will take your words instead of finding his own.",
      theory: "Open before closed. The account must exist in his words before you structure it; a fact you supply is a fact you cannot later rely on.",
      authorities: ["INTERVIEW", "RECORD", "MURAD"], ariaLabel: "Your opening move with Mr H.",
      moves: [
        { id: "open", label: "\"Take me to that morning. Start wherever feels right, and tell me what you saw, in your own words.\"", quality: "sound", crit: "S_OPEN", band: "A", effect: { account: "clean" }, response: "He begins with the sound of engines before dawn and works forward at his own pace. It is his account, in his words, and it is usable.", feedback: "The widest opener costs nothing and protects everything you build on it." },
        { id: "funnel", label: "\"Let's get the facts down first, what time did the vehicles arrive, how many, and what colour were they?\"", quality: "partly", crit: "S_OPEN", band: "C", effect: { account: "narrowed" }, response: "Structured questioning is right, later. As the opener it forecloses his narrative; he answers your three questions and stops, and you never hear the two things you did not know to ask.", feedback: "Closed questions have their place after the free account, not instead of it. Right in substance, wrong in timing." },
        { id: "lead", label: "\"They forced you off your land at gunpoint, didn't they?\"", quality: "not", crit: "S_OPEN", band: "F", effect: { account: "led" }, response: "He agrees, you offered him the words and he is trying to help. The core of his account is now something you put in his mouth, and it is marked unusable. It will appear flagged in the record you build in Lesson 7.", feedback: "A leading question manufactures the answer. This is irreversible for that fact." },
        { id: "detail", label: "\"Describe exactly what they did to your neighbours, everything you saw, in as much detail as you can.\"", quality: "not", crit: "S_OPEN", band: "E", effect: { account: "overreach" }, response: "He relives detail your file does not require and is visibly distressed. You have harmed him to collect what you will never use.", feedback: "Proportionality is not only about time; opening on graphic detail is a harm, not thoroughness." },
      ],
    },
    {
      type: "routing", n: "Lesson 3", title: "His account is running, decide what you ask and what you leave", typeLabel: "Routing decision · every question at once",
      intro: "Below are questions you could ask next. They are shown together, the way they occur to you in the moment. For each, decide whether to ask it or leave it. Taking more than the file needs costs you here.",
      authorities: ["MURAD", "RECORD"],
      aggregate: { crit: "S_PROP", overreachEffectKey: "propOverreach" },
      carryOk: "Proportionality is a scored skill: the questions you chose not to ask count as much as the ones you did.",
      items: [
        { id: "location", label: "Where exactly was he standing when he saw the vehicles?", options: [
          { key: "ask", label: "Ask it", quality: "sound", band: "A", response: "Asked. It bears directly on what he could and could not have seen, reliability.", feedback: "Ask what tests the account's reliability." },
          { key: "skip", label: "Leave it", quality: "partly", band: "C", response: "Skipped. You lose a cheap, important reliability anchor.", feedback: "Vantage point is core, not optional." },
        ] },
        { id: "markings", label: "Any markings, letters or insignia on the vehicles?", options: [
          { key: "ask", label: "Ask it", quality: "sound", band: "A", response: "Asked. Markings go to linkage, whose vehicles, under whose control.", feedback: "Ask what bears on linkage." },
          { key: "skip", label: "Leave it", quality: "partly", band: "C", response: "Skipped. You may have lost the one detail that ties the act to a unit.", feedback: "Linkage detail is worth asking for." },
        ] },
        { id: "injuries", label: "Ask him to describe, in detail, the injuries to the bodies he mentioned.", options: [
          { key: "ask", label: "Ask it", quality: "not", band: "E", effect: { propOverreach: true }, response: "Asked. He describes what your file does not need and carries the image out of the room with him. This is taken from him for nothing.", feedback: "Graphic detail the file will not use is a harm, not evidence." },
          { key: "skip", label: "Leave it", quality: "sound", band: "A", response: "Left. If a medico-legal examination is needed it is done by the right specialist, not extracted here.", feedback: "Leaving detail the file does not need is a skill, not a gap." },
        ] },
        { id: "family", label: "Ask how his children reacted and how he is coping now.", options: [
          { key: "ask", label: "Ask it", quality: "not", band: "E", effect: { propOverreach: true }, response: "Asked. It opens distress the file has no use for and no plan to hold.", feedback: "Do not open wounds you did not come to treat and cannot close." },
          { key: "skip", label: "Leave it", quality: "sound", band: "A", response: "Left. Care for him belongs in the referral, not in the evidential record.", feedback: "Compassion is the referral's job, not the interview's questions." },
        ] },
        { id: "timeanchor", label: "Roughly what time was this, and how does he know?", options: [
          { key: "ask", label: "Ask it", quality: "sound", band: "A", response: "Asked. Time plus how he knows it anchors the sequence without leading.", feedback: "Anchor time to something he can source." },
          { key: "skip", label: "Leave it", quality: "partly", band: "C", response: "Skipped. The sequence is harder to stand up later.", feedback: "A sourced time is worth one question." },
        ] },
      ],
    },
    {
      type: "branching", n: "Lesson 4", title: "He has just told you something he did not come to say", typeLabel: "Branching decision beat · live interaction",
      stage: "Partway through, Mr H. says quietly that when they held him for two days, he was beaten. He had not mentioned it before. This is not what you came for, and he has just handed you something heavy.",
      constraint: "He is mid-account, he trusts you enough to have said it, and the clock and the file are both pulling you elsewhere.",
      theory: "Consent is continuous, not a form signed once. A disclosure of ill-treatment changes what he is consenting to; it is acknowledged and routed, never mined on the spot.",
      authorities: ["ISTANBUL", "MURAD", "RECORD"], ariaLabel: "Your response to the disclosure",
      moves: [
        { id: "handle", label: "Pause, acknowledge it, check he wants to continue, remind him he can stop, note it for the specialist pathway (Istanbul Protocol), do not take the detail now.", quality: "sound", crit: "S_DISC", band: "A", effect: { disclosure: "handled" }, response: "He exhales. He stays in control of what happens next, the disclosure is safely routed to where it can be handled properly, and your account continues on his terms.", feedback: "Acknowledge, re-consent, route. You are not the right place for that examination and you do not need to be." },
        { id: "press", label: "\"That's important, tell me exactly what they did, while it's fresh. Describe the beating in detail.\"", quality: "not", crit: "S_DISC", band: "F", effect: { disclosure: "pressed" }, response: "You mine the detail. He gives it and leaves the room worse than he entered, and the account he did consent to is now tangled with one he did not. This is recorded as harm.", feedback: "Never convert a disclosure into an interrogation. The harm is irreversible." },
        { id: "redirect", label: "\"I understand. Let's keep to the vehicles and the grain for now.\"", quality: "partly", crit: "S_DISC", band: "C", effect: { disclosure: "redirected" }, response: "Proportionality says do not chase the detail, and you are half right. But steering straight past it, without acknowledging what he just trusted you with, tells him the hardest thing he said did not matter. Right instinct on scope, wrong in register.", feedback: "Not taking the detail is correct. Not acknowledging the person is not. Right substance, wrong register." },
        { id: "assure", label: "\"I promise you the men who did this will be punished for it.\"", quality: "not", crit: "S_DISC", band: "E", effect: { disclosure: "pressed" }, response: "A promise you cannot keep, offered to comfort. If it does not come true he learns his account bought nothing, and your credibility with the next witness goes with it.", feedback: "Never trade an outcome you do not control for a moment's comfort (do no harm)." },
      ],
    },
    {
      type: "socratic", n: "Checkpoint", prompt: "You have just handled Mr H.'s disclosure that he was beaten in detention. Justify what you did and did not do, and why.",
      authoredProbe: "You have described what you did for the file, what did your response do for the man, and how would he know he was still in control of this?",
      modelReasoning: "One competent answer, not the answer. The disclosure is not a windfall to be worked; it is a moment where the person has to be kept in control of his own account. The task is to acknowledge it plainly so he knows it landed, to renew consent because what he is agreeing to has just changed, to route the detail to the pathway built to hold it, and to offer support, without extracting anything the file did not come for. The failure that looks like diligence is pressing for detail; the failure that looks like discipline is steering past it as if it were noise. Where your reasoning weighed his safety or his control more finely than this, keep yours.",
      note: "Your written answers here are read by your coach and are never scored by the platform.",
    },
    {
      type: "matching", n: "Lesson 6", title: "He leaves tomorrow, preserve the testimony or lose it", typeLabel: "Matching · mutually exclusive mechanisms",
      stage: "At the end, Mr H. tells you he is being relocated tomorrow to an oblast in the west. You may not see him again, and his account is not yet preserved in any form that will survive his leaving.",
      constraint: "You have this evening. Choose the mechanism, they are mutually exclusive in practice, and the wrong one does not delay the material, it loses it.",
      authorities: ["CPC_225"], crit: "P_PRESERVE", commitLabel: "Commit to this mechanism",
      carryGood: "The testimony is preserved before he leaves.",
      carryBad: "The mechanism you chose does not survive his displacement, the testimony is at risk of being lost, not merely delayed. This is a non-negotiable failure.",
      options: [
        { id: "art225", label: "Apply this evening to have his testimony taken and preserved before the investigating judge (art. 225), before he leaves.", quality: "sound", band: "A", effect: { preserve: "art225" }, response: "Lodged. His testimony is preserved in a form that survives his displacement and can be relied on if he cannot return." },
        { id: "written", label: "Have him sign a written statement now and place it in the file.", quality: "partly", band: "C", effect: { preserve: "written" }, response: "Better than nothing, but a signed statement is not preservation before the investigating judge; its evidential weight if he never returns is far weaker, and you had the time to do it properly." },
        { id: "reinterview", label: "Plan to re-interview him by phone once he has relocated and settled.", quality: "not", band: "E", effect: { preserve: "wrong" }, response: "The number changes, the line does not connect, the moment passes. This does not delay the testimony, it loses it." },
        { id: "recording", label: "Rely on your interview recording as the preserved record.", quality: "not", band: "E", effect: { preserve: "wrong" }, response: "An interview recording is not a preservation mechanism before the court. If he is gone, you are left with something that may never be admitted." },
      ],
    },
    {
      type: "artifact", n: "Lesson 7", title: "Produce the record you would actually file", typeLabel: "Artifact · transfers to your live caseload",
      intro: "The one page that leaves the module, assembled from your decisions, nothing added. Compromised items are flagged for you, not hidden from you. In the live module a redacted version uploads to your coach; no case material is stored on the platform.",
      docTitle: "Interview record & consent log", docSub: "PEJ-EVD-01 · composite witness · initials only · no real case data",
      ackLabel: "I have reviewed the flags and would file this record as it stands (in the live module this uploads to your coach).",
      lines: [
        { from: "consent", cases: { informed: { txt: "Consent, informed and revocable; use explained, right to stop recorded.", flag: false }, compromised: { txt: "Consent, compromised (covert recording or promised outcome). Account obtained under it is UNUSABLE.", flag: true }, incomplete: { txt: "Consent, incomplete; the account was opened before consent was fully established.", flag: true } }, default: { txt: "Consent, incomplete; the account was opened before consent was fully established.", flag: true } },
        { from: "account", cases: { clean: { txt: "Account, taken open, in his own words. USABLE.", flag: false }, narrowed: { txt: "Account, funnelled into closed questions early; narrower than it should be. Usable but thin.", flag: false }, led: { txt: "Account, core fact obtained by a leading question. MARKED UNUSABLE.", flag: true }, overreach: { txt: "Account, opened on graphic detail beyond the file's need. Review for proportionality and harm.", flag: true } }, default: { txt: "Account, not taken.", flag: true } },
        { from: "propOverreach", cases: { "true": { txt: "Proportionality, detail beyond the file's need was taken. Flag for review.", flag: true }, "false": { txt: "Proportionality, only file-relevant detail taken.", flag: false } }, default: { txt: "Proportionality, only file-relevant detail taken.", flag: false } },
        { from: "disclosure", cases: { handled: { txt: "Disclosure of ill-treatment, acknowledged, consent renewed, routed to the specialist pathway.", flag: false }, redirected: { txt: "Disclosure of ill-treatment, steered past without acknowledgement. Review: continuous consent / do-no-harm.", flag: true }, pressed: { txt: "Disclosure of ill-treatment, pressed for detail or met with a false assurance. Harm recorded.", flag: true } }, default: { txt: "Disclosure of ill-treatment, none recorded in this run.", flag: false } },
        { from: "referralOffered", cases: { "true": { txt: "Support, referral pathway offered.", flag: false }, "false": { txt: "Support, no referral pathway offered. Flag.", flag: true } }, default: { txt: "Support, no referral pathway offered. Flag.", flag: true } },
        { from: "preserve", cases: { art225: { txt: "Preservation, art. 225 request lodged before displacement.", flag: false }, written: { txt: "Preservation, signed statement only; weaker if he does not return. Review.", flag: true }, wrong: { txt: "Preservation, testimony NOT preserved before displacement. At risk of being lost.", flag: true } }, default: { txt: "Preservation, testimony NOT preserved before displacement. At risk of being lost.", flag: true } },
      ],
    },
  ],
  alignment: [
    { o: "O1 [Knows how] Establish informed, revocable consent before any account is taken.", tested: "Lesson 1, component selection with consent-destroying traps.", success: "'Explain use / right to stop' selected AND zero traps; missing the explain-use component or selecting any trap scores E.", why: "Consent is a constructed product, not a fact to recognise; selecting components (and rejecting traps that feel protective) tests the construction, which a definition question could not." },
    { o: "O2 [Shows how] Open the account so no fact enters through a leading question.", tested: "Lesson 2, branching decision beat; the opening persists into the Lesson 7 record.", success: "Wide opener (band A); any leading move marks the account UNUSABLE and flags it in the artifact (binary taint).", why: "Only a live branching beat can make usability depend on the participant's own words in the moment and carry the taint forward; a multiple-choice item cannot." },
    { o: "O3 [Shows how] Take only the detail the file needs.", tested: "Lesson 3, routing decision per item; all questions shown at once.", success: "Neither graphic-injury nor family-trauma question asked; asking either sets overreach and scores E.", why: "Presenting every question at once reproduces the real cognitive condition in which overreach happens; the questions not asked are scored as heavily as those asked, which is what proportionality is." },
    { o: "O4 [Shows how] Handle a disclosure of ill-treatment without harm; renew consent.", tested: "Lesson 4, branching decision beat.", success: "Acknowledge + renew consent + route to specialist (band A); pressing for detail or a false assurance scores F/E.", why: "The competence is a live interpersonal judgment under a duty of care; only a branching beat with authored consequences can test acknowledging-and-routing versus mining-the-detail." },
    { o: "O5 [Knows how] Choose the mechanism that preserves the testimony before displacement.", tested: "Lesson 6, matching between mutually exclusive mechanisms.", success: "art. 225 before the investigating judge chosen (band A); a re-interview or recording loses the material and scores E.", why: "The objective is choosing between mutually exclusive mechanisms where the wrong one loses the material; a matching/selection between them tests exactly that, not knowledge of what art. 225 says." },
    { o: "O6 [Does] Produce an interview record & consent log in which every consent/proportionality issue is flagged.", tested: "Lesson 7, artifact assembled from prior decisions.", success: "Artifact filed with every compromised item visibly flagged; nothing added beyond the decisions taken.", why: "A Does objective can only be discharged by a produced artifact that carries the consequences of earlier choices; any other test measures intention, not performance." },
  ],
  jobAid: {
    heading: "Job aid, taking a witness's account (one page, no theory)",
    items: [
      "<strong>Consent before the account.</strong> Explain the use, who sees it, and the right to stop at any time. Private space, trusted interpreter, referral to hand. Never record covertly. Never promise an outcome.",
      "<strong>Open before closed.</strong> \"Take me to that morning, in your own words.\" Let the free account exist before you structure it. A fact you supply is a fact you cannot rely on.",
      "<strong>Take only what the file needs.</strong> Ask what bears on reliability and linkage. Leave graphic and personal detail, that is the referral's job, not the interview's.",
      "<strong>A disclosure is not a windfall.</strong> Acknowledge it, renew consent, route the detail to the specialist pathway (Istanbul Protocol), offer support. Do not press. Do not steer past it as if unheard.",
      "<strong>Preserve before displacement.</strong> If the witness may leave, lodge the art. 225 request before they go. A plan to re-interview later loses the testimony, it does not delay it.",
      "<strong>Record in his words.</strong> His account, not your inference. Flag anything obtained under compromised consent.",
    ],
    footer: "Authorities carry sign-off status. Confirm every \"confirm\"-tagged article and verify local referral pathways before operational use. Law last verified: pending SME · v0.1-demo.",
  },
};

export const PEJ_STATIONS: Record<string, Spec> = {
  "pej-evd-01-m1": PEJ_M1_SPEC,
  "pej-evd-01-m2": PEJ_M2_SPEC,
};
