"use strict";
// GRN01 Pillaging Case evidence review: lesson content, v1.1 working draft.
// Items marked draft_placeholder await storyboard v1.1 wording and PEJ approval.
// Answer keys, feedback and model answers live ONLY on the server (see publicContent()).
const CARDS = [
 {id:"C01", en:{name:"Context", avail:"Fictional background: border crossing on 1 July 2015, occupation and Directorate.", miss:"No military records or maps."}, uk:{name:"Контекст", avail:"Вигадане тло: перетин кордону 1 липня 2015 року, окупація і Дирекція.", miss:"Військових записів чи карт немає."}, status:"narrative"},
 {id:"C02", en:{name:"Demand and handover", avail:"Scenario narrative of the demand, the threat of nationalisation and the handover of keys.", miss:"No interview transcript."}, uk:{name:"Вимога і передача", avail:"Сценарний опис вимоги, погрози націоналізацією і передачі ключів.", miss:"Стенограми допиту немає."}, status:"narrative"},
 {id:"C03", en:{name:"Removal and purported payment", avail:"Grain taken the next week to an undisclosed location; 20 percent retained as payment.", miss:"No inventory or transport log."}, uk:{name:"Вивезення і нібито оплата", avail:"Зерно вивезли наступного тижня в невідоме місце; 20 відсотків залишено як оплату.", miss:"Інвентарного опису чи транспортного журналу немає."}, status:"narrative"},
 {id:"C04", en:{name:"Identity and witness material", avail:"Description of X's ID and of eyewitness testimony collected by the prosecution.", miss:"Neither the ID nor the testimony is supplied."}, uk:{name:"Ідентифікація і свідчення", avail:"Опис посвідчення X та свідчень очевидців, зібраних обвинуваченням.", miss:"Жодне з них не надано."}, status:"described"},
 {id:"C05", en:{name:"Satellite material", avail:"Description of movements from occupied farms to C's silos.", miss:"No imagery, acquisition metadata or analysis. No established link to A's specific grain."}, uk:{name:"Супутникові матеріали", avail:"Опис переміщень з окупованих ферм до силосів C.", miss:"Знімків, метаданих зйомки чи аналізу немає. Зв'язок із конкретним зерном А не встановлено."}, status:"described"},
 {id:"C06", en:{name:"Receipts", avail:"Description of receipts for requisitioned grain.", miss:"No contents, parties or specific receipt linked to A."}, uk:{name:"Квитанції", avail:"Опис квитанцій за реквізоване зерно.", miss:"Змісту, сторін чи конкретної квитанції, пов'язаної з А, немає."}, status:"described"}
];
const STATUS = {en:{narrative:"Scenario narrative",described:"Described, not supplied"},uk:{narrative:"Сценарний наратив",described:"Описано, не надано"}};
const NARR = {
 en:"Antilia's forces occupy Eastern Bilik. X arrives at Farmer A's farm with a group in military vehicles. A cannot make out specific insignia; the occupants have no official uniforms. X claims to be a spokesperson for the Provisional Directorate and demands A's harvested grain. A objects. X threatens nationalisation. A, frightened by that possibility, hands over the silo keys. The following week trucks take the grain to an undisclosed location. X orders that 20 percent remain as payment.",
 uk:"Збройні сили Антилії окупують Східний Білік. X прибуває на ферму Фермера А разом із групою на військових автомобілях. А не може розгледіти конкретних знаків розрізнення; особи в автомобілях не мають офіційної форми. X називає себе речником Тимчасової дирекції та вимагає зібране зерно А. А заперечує. X погрожує націоналізацією. А, наляканий такою можливістю, передає ключі від силосу. Наступного тижня вантажівки вивозять зерно в невідоме місце. X наказує залишити 20 відсотків як оплату."
};
const OUTCOMES = {
 en:["O1 Distinguish narrative, unseen evidence and inference.","O2 Explain what each source supports and where its support stops.","O3 Choose authorised handling and keep live information out of the Hub.","O4 Connect three propositions to evidence gaps and specific corroboration checks.","O5 Write a cautious, source-linked analytical summary."],
 uk:["O1 Розрізняти наратив, невидимі докази та висновок.","O2 Пояснювати, що підтверджує кожне джерело і де ця підтримка закінчується.","O3 Обирати дозволений порядок поводження та не вносити до Хабу оперативну інформацію.","O4 Пов'язувати три твердження з прогалинами в доказах і конкретними перевірками.","O5 Писати обережний аналітичний підсумок із посиланнями на джерела."]
};
const PROPS = [
 {id:"P1", en:"A handed over the silo keys under threat, not by consent."},
 {id:"P2", en:"A's grain was removed and taken to an identifiable destination."},
 {id:"P3", en:"X acted for the Provisional Directorate or for Antilia's forces."}
];
const UNITS = [
 {n:1, en:"Orientation and diagnostic", mins:5, screens:["S01","S02"]},
 {n:2, en:"Case opening", mins:5, screens:["S03","S03V"]},
 {n:3, en:"Source review", mins:12, screens:["S04A","S04B"]},
 {n:4, en:"Evidence and alternatives", mins:12, screens:["S05","S06A","S06B","S07"]},
 {n:5, en:"Safe handling", mins:6, screens:["S08"]},
 {n:6, en:"Evidence-gap brief", mins:15, screens:["S09A","S09B"]},
 {n:7, en:"Feedback and transfer", mins:5, screens:["S10A","S10B"]}
];
const STITLE = {S01:"Orientation",S02:"Opening diagnostic",S03:"The case opens",S03V:"Context recording",S04A:"Source status and the source desk",S04B:"Support and limits",S05:"Testing the route claims",S06A:"Worked reasoning: receipts",S06B:"Rewrite an overconfident claim",S07:"Corroboration plan",S08:"Safe handling",S09A:"Evidence-gap brief",S09B:"Preview and submit",S10A:"Final knowledge check",S10B:"Compare, self-review and transfer"};
const DIAG = [
 {id:"D01", q:"The file describes receipts for requisitioned grain (C06). You have not seen them. What can you say at this stage?",
  opts:[["a","The receipts show A was paid, so the transfer was a sale."],["b","Receipts are described as existing. Their contents, parties and any link to A are unknown until the documents are obtained."],["c","The receipts prove the taking was a lawful requisition."],["d","Undisclosed receipts should be disregarded entirely."]], key:"b",
  fb:"A description of receipts tells you a line of inquiry exists. It does not tell you what any receipt says, who issued it, or whether one concerns A."},
 {id:"D02", q:"The file describes satellite material showing movements from occupied farms to C's silos (C05). What can it establish about A's grain now?",
  opts:[["a","That A's grain went to C's silos."],["b","Nothing specific to A yet. It points to a line of inquiry that needs the imagery, its metadata, analysis and a link to A's farm."],["c","That pillage occurred."],["d","Nothing at all; satellite material is not useful in property crimes."]], key:"b",
  fb:"Unseen imagery described in general terms cannot be tied to A's specific grain. It can shape what you request next."}
];
const APPROACH = [["a","Begin drafting charges against X on the narrative as it stands."],["b","Separate what the narrative states from what evidence would need to show, then plan inquiries."],["c","Request the satellite imagery first and wait before doing anything else."]];
const APPROACH_FB = {a:"The narrative is a starting account, not evidence. Charging decisions come after you know what can be proved.",b:"This keeps the account, the evidence and your inferences apart, which is the method this lesson builds.",c:"Imagery may help later, but waiting on one source leaves the other propositions unexamined."};
const VC = [
 {id:"VC01", seg:"Segment 1 of 4", tr:"[Draft placeholder. The approved descriptive transcript for this segment will appear here once the recording master, speaker permission and Ukrainian captions are confirmed.] In this segment the speaker describes how investigators record a witness account in the witness's own words before adding their own assessment.",
  q:"A witness says: \"They came in army trucks, so they were soldiers.\" Which part is inference?", opts:[["a","That trucks arrived."],["b","That the people in the trucks were soldiers."],["c","That the witness saw something."]], key:"b", fb:"The trucks are the observation. \"Soldiers\" is the witness's conclusion drawn from them.", refl:"In one sentence, how would you record this account so the observation and the inference stay separate?"},
 {id:"VC02", seg:"Segment 2 of 4", tr:"[Draft placeholder.] The speaker explains why two reports that trace back to the same person are not independent corroboration.",
  q:"Two reports both describe the same removal. Both were written from one farmer's account. How much independent support do they give?", opts:[["a","Two independent sources."],["b","One source, recorded twice."],["c","None; they cancel out."]], key:"b", fb:"Independence depends on origin. Two records of one account remain one account.", refl:"Name one source that would be independent of the farmer's account."},
 {id:"VC03", seg:"Segment 3 of 4", tr:"[Draft placeholder.] The speaker discusses testing an interpretation against the most plausible alternative explanation.",
  q:"Which step best tests an interpretation?", opts:[["a","Collect more material that agrees with it."],["b","State the strongest alternative explanation and ask what evidence would separate the two."],["c","Ask a colleague whether it sounds right."]], key:"b", fb:"An alternative explanation tells you exactly which evidence would change your view.", refl:"What is one alternative explanation for a handover of keys?"},
 {id:"VC04", seg:"Segment 4 of 4", tr:"[Draft placeholder.] The speaker closes by applying the method to a new file: account, evidence, inference, then the next check.",
  q:"You open a new file. What comes first?", opts:[["a","A conclusion about responsibility."],["b","Sorting what is account, what is evidence you hold, and what you are inferring."],["c","A search for similar past cases."]], key:"b", fb:"Sorting first keeps every later step honest about what you actually have.", refl:"Which card in the Pillaging Case would you sort first, and why?"}
];
const SORT = [
 {id:"K1", s:"X told A he spoke for the Provisional Directorate.", key:"narrative"},
 {id:"K2", s:"Eyewitness testimony was collected by the prosecution.", key:"unseen"},
 {id:"K3", s:"X was acting on the Directorate's orders.", key:"inference"},
 {id:"K4", s:"The grain ended up in C's silos.", key:"inference"}
];
const SORTLBL = {narrative:"Scenario narrative",unseen:"Unseen evidence",inference:"Inference"};
const S06 = [
 "What C06 actually contains: a description that receipts for requisitioned grain exist. No receipt has been seen, and none is linked to A.",
 "Even a receipt linked to A would record a transfer. It would not show that A agreed freely. C02 describes a threat of nationalisation before the keys were handed over.",
 "C03 says 20 percent was retained \"as payment\". That is X's characterisation of the arrangement, reported in the narrative. It is not independent evidence of a sale.",
 "What could change the interpretation: the receipt contents and issuer, A's own account of consent, the value of grain retained against the value removed, and any evidence of the threat's context."
];
const OVERCLAIM = "Satellite imagery proves that X's group moved Farmer A's grain to C's silos, and the receipts show the Directorate paid for it.";
const MODEL_REWRITE = "The file describes satellite material showing movements from occupied farms to C's silos (C05), but the imagery, its metadata and any analysis are not available, and nothing yet links it to A's grain. Receipts for requisitioned grain are described (C06), but their contents, issuer and any connection to A are unknown, so they cannot show payment to A or consent.";
const HANDLE = {q:"A colleague messages you a photo of a real receipt from a farm in an occupied area and asks you to post it in the Hub discussion for this lesson. What do you do?",
 opts:[["a","Post it in the lesson discussion so others can analyse it."],["b","Do not upload it. Advise that it goes through the authorised case system and procedures, and keep Hub discussion to the fictional pack."],["c","Blur the names and post it."],["d","Save it to your personal drive for later."]], key:"b",
 fb:{a:"The Hub is a training service. Real case material belongs in authorised systems, not a discussion forum.",b:"Correct. Real material stays in authorised systems; the Hub stays fictional.",c:"Redaction does not make live case material appropriate for a training forum, and details can still identify people.",d:"Personal storage breaks custody and data rules. Route it through authorised procedures."}};
const QUIZ = [
 {id:"Q1", q:"Which statement is narrative rather than evidence?", opts:[["a","A's description of the demand, as told in the scenario."],["b","An inventory of grain removed."],["c","Acquisition metadata for satellite imagery."]], key:"a", fb:"The scenario account is the starting narrative. The other two would be evidence if obtained."},
 {id:"Q2", q:"The lesson has six source cards. How many independent sources do they represent?", opts:[["a","Six."],["b","All six derive from one fictional scenario, so their independence is not established."],["c","Three."]], key:"b", fb:"Card IDs organise the file. They do not create independent sources."},
 {id:"Q3", q:"C03 says grain went to an undisclosed location. C05 describes movements to C's silos. What is the link between them?", opts:[["a","The same route."],["b","Unresolved; it needs evidence tying A's grain to C's silos."],["c","Contradictory, so one card is false."]], key:"b", fb:"Two routes are described. Nothing in the file connects them yet."},
 {id:"Q4", q:"Can the described receipts alone establish that A sold the grain voluntarily?", opts:[["a","Yes, a receipt shows a sale."],["b","No. Their contents are unknown, and a receipt would not show consent given the threat described."],["c","Yes, if there are several receipts."]], key:"b", fb:"A receipt records a transfer, not free agreement."},
 {id:"Q5", q:"You hold a real witness statement relevant to a live case. Where should it go?", opts:[["a","Into the Hub lesson notes, for practice."],["b","Only into the authorised case system under procedure; never into the Hub."],["c","Into the community forum with names removed."]], key:"b", fb:"The Hub holds fictional learning material only. This item is required to pass.", safe:true}
];
const RUBRIC = [
 {id:"R1", en:"Source use", d:["Cards missing or misused","Cards cited but status blurred","Each claim tied to the right card with its status"], protect:true},
 {id:"R2", en:"Limits and alternatives", d:["No limits stated","Some limits, alternatives thin","Limits and a plausible alternative for each row"]},
 {id:"R3", en:"Gap and next step", d:["No specific next step","Next steps generic","Specific material sought, with purpose"]},
 {id:"R4", en:"Proportionate reasoning", d:["Overclaims guilt or proof","Mostly cautious, some overreach","Conclusions no stronger than the cards allow"], protect:true},
 {id:"R5", en:"Safe handling", d:["Unsafe handling","Handling mentioned, incomplete","Correct handling condition in each row"], safeDim:true}
];
const MODEL_BRIEF = [
 {p:"P1", cards:["C02"], sup:"C02 narrates a demand, a threat of nationalisation and A handing over the keys while frightened. This supports that the handover followed a threat. It is scenario narrative only; there is no interview record.", alt:"A may have agreed for other reasons, or the threat's nature may be disputed. A's own recorded account is missing.", next:"Obtain a recorded interview with A covering the demand, the threat and whether any choice was offered; this tests consent directly.", hand:"Fictional pack only. Real statements stay in the authorised case system."},
 {p:"P2", cards:["C03","C05"], sup:"C03 describes removal to an undisclosed location. C05 describes movements from occupied farms to C's silos. Together they suggest a line of inquiry, not a destination for A's grain.", alt:"A's grain may have gone elsewhere; C05 may concern other farms.", next:"Request the imagery, acquisition metadata and analysis, plus any transport or inventory record, to test whether A's grain can be traced.", hand:"Do not request or share live imagery through the Hub."},
 {p:"P3", cards:["C04","C01"], sup:"C04 describes X's ID and eyewitness testimony; C01 gives the Directorate background. X's claimed role is his own statement in the narrative.", alt:"X may have acted independently or overstated his role.", next:"Obtain the ID document and witness statements, and any Directorate records naming X, to separate identity from claimed authority.", hand:"Identity material about real people never enters the Hub."}
];
const MODEL_SUMMARY = "On the fictional file as it stands, the narrative (C02) supports that A handed over the silo keys after X threatened nationalisation, but no recorded interview with A is available. Removal of the grain is described (C03), yet its destination is undisclosed; the satellite material (C05) describes movements from occupied farms to C's silos without imagery, metadata or any link to A's grain. Receipts are described (C06) but unseen, so they cannot show payment to A or consent. X's identity and his claimed Directorate role rest on described but unsupplied material (C04) and his own statement. The priority checks are A's recorded account, the imagery with metadata and analysis, transport or inventory records, and the ID and witness statements. These would test consent, trace the grain and separate X's identity from his claimed authority.";
const TRANSFER = [["t1","Before drafting, sort every item into account, evidence held, or inference."],["t2","For each claim, name the card and state where its support stops."],["t3","Write the strongest alternative explanation before the next step."],["t4","Check handling conditions before sharing any excerpt."]];
const ROUTES={
 inv:{id:"inv", name:"Investigation", uk:"Розслідування", color:"var(--r-inv)", roles:["Police investigator","Police analyst","SSU investigator"], who:"Police investigators and analysts, SSU investigators", status:"pilot",
  task:"A corroboration plan: what to seek next, why, and what would change the picture", emphasis:"Tracing the grain, identifying X, finding independent sources", reviewer:"Investigation reviewer, same five-part rubric",
  product:"Corroboration brief", nextLabel:"Next inquiry and purpose", sumPrompt:"Summarise what the file supports, what it does not, and the inquiries you would run first."},
 pro:{id:"pro", name:"Prosecution", uk:"Обвинувачення", color:"var(--r-pro)", roles:["Prosecutor","Prosecution support","Other approved justice actor"], who:"Prosecutors and prosecution support", status:"pilot",
  task:"An evidence-gap brief: what each proposition rests on and what it would need before charging", emphasis:"Consent versus threat, requisition versus pillage, claims no stronger than the cards", reviewer:"Prosecution reviewer, five-part rubric",
  product:"Evidence-gap brief", nextLabel:"What it would need before charging", sumPrompt:"Summarise what each proposition rests on and what it would need before a charging decision."},
 jud:{id:"jud", name:"Judiciary", uk:"Судочинство", color:"var(--r-jud)", roles:["Judge","Judicial staff"], who:"Judges and judicial staff", status:"planned",
  task:"A bench note on weight, gaps and what the parties would need to show", emphasis:"Neutrality, fair trial, reliability of unseen material", reviewer:"Separately designed and reviewed before it opens",
  product:"Bench note", nextLabel:"What the parties would need to show", sumPrompt:""}
};
const LESSON = { id:"GRN01", title:"Pillaging Case evidence review", course:"Course 3: Law of occupation and pillage", version:"1.1-draft", rubricVersion:"0.9-draft", quizKeyVersion:"0.9-draft" };
const ORDER = []; UNITS.forEach(u => ORDER.push(...u.screens));
const ROUTE_KEY = "b"; // S05 route claim: not established
const ROUTE_FB = { right:"Right. C03 and C05 describe different routes. Nothing yet ties A's grain to C's silos.", wrong:"Look again. C03 gives no destination and C05 concerns occupied farms generally. The claim is not established, and nothing contradicts it either." };
function strip(o, keys){ const c = JSON.parse(JSON.stringify(o)); (Array.isArray(c)?c:[c]).forEach(x=>keys.forEach(k=>delete x[k])); return c; }
function publicContent(){
  return { lesson:LESSON, order:ORDER, cards:CARDS, status:STATUS, narrative:NARR, outcomes:OUTCOMES, props:PROPS, units:UNITS, titles:STITLE,
    diag: strip(DIAG,["key","fb"]), approach:APPROACH, approachFb:APPROACH_FB, vc: strip(VC,["key","fb"]), sort: strip(SORT,["key"]), sortLabels:SORTLBL,
    worked:S06, overclaim:OVERCLAIM, modelRewrite:MODEL_REWRITE, handle:{q:HANDLE.q, opts:HANDLE.opts}, quiz: strip(QUIZ,["key","fb"]),
    rubric:RUBRIC, transfer:TRANSFER, routes:ROUTES,
    routeClaim:{q:"Claim: \"A's grain was taken to C's silos.\" On the file as it stands, this claim is:", opts:[["a","Supported"],["b","Not established"],["c","Contradicted"]]} };
}
module.exports = { LESSON, ORDER, CARDS, NARR, PROPS, UNITS, STITLE, DIAG, VC, SORT, HANDLE, QUIZ, RUBRIC, MODEL_BRIEF, MODEL_SUMMARY, ROUTES, ROUTE_KEY, ROUTE_FB, publicContent };
