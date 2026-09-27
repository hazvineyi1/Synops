"use strict";
// Case guide: a Socratic tutor grounded ONLY in the six fictional GRN01 source cards.
// Works without AI: when no key is configured, the provider fails, or a reply fails the
// grounding checks, the learner gets an authored question, clearly labelled.
const C = require("./content/grn01");

const MODEL = process.env.AI_MODEL || "claude-sonnet-5";
const KEY = process.env.ANTHROPIC_API_KEY || "";
const VALID_CARDS = new Set(C.CARDS.map((c) => c.id));

function aiEnabled() { return !!KEY && process.env.AI_DISABLED !== "1"; }

function cardsBlock() {
  return C.CARDS.map((c) => `${c.id} ${c.en.name} [${c.status === "narrative" ? "scenario narrative" : "described, not supplied"}]: ${c.en.avail} Missing: ${c.en.miss}`).join("\n");
}
function systemPrompt(routeKey, screenId) {
  const r = C.ROUTES[routeKey === "jud" ? "pro" : routeKey] || C.ROUTES.pro;
  return [
    "You are the Case Guide inside the Digital Justice Hub, a training platform for Ukrainian justice professionals.",
    `The learner is on the ${r.name} route. Their task: ${r.task}.`,
    `They are on screen ${screenId || "unknown"} (${C.STITLE[screenId] || "lesson"}) of the lesson "Pillaging Case evidence review".`,
    "",
    "THE ONLY FACTS THAT EXIST are this fictional narrative and these six cards. All six derive from one fictional scenario, so they are not independent sources.",
    "Narrative: " + C.NARR.en,
    cardsBlock(),
    "",
    "Rules you must follow:",
    "1. Teach by questioning. End every reply with exactly one question for the learner.",
    "2. Keep replies under 90 words. Plain text only, no headings or lists.",
    "3. When you refer to the file, cite the card ID in square brackets, for example [C05]. Cite only C01 to C06.",
    "4. Never invent facts, documents, witnesses, dates, quantities, places or legal citations. If something is not in the cards, say it is not in the file.",
    "5. Keep three things apart: what the narrative says, what is described but unseen, and what is inference. Point out when the learner blurs them.",
    "6. Never state that anyone is guilty and never give a verdict. The product is an evidence-gap brief or corroboration plan, not a finding.",
    "7. Never write the learner's brief, summary or answers for them, and never reveal quiz answers.",
    "8. If the learner mentions real people, real places, real cases or real evidence, tell them the Hub is for fictional material only and ask them to remove it.",
    "9. If asked about law beyond the lesson, say a subject expert should confirm it and bring them back to the cards.",
    "10. Reply in the learner's language (Ukrainian or English).",
  ].join("\n");
}

const AUTHORED = {
  default: [
    "Pick one card. What does it actually contain, and what does it only describe?",
    "Which of your statements so far is narrative, which is unseen evidence, and which is your own inference?",
    "What is the strongest alternative explanation for what you just described, and what material would separate the two?",
  ],
  S03: ["Which part of the account in C02 would you need to see recorded before treating it as evidence?"],
  S04A: ["Six card IDs, one fictional origin. How does that change how much weight any two cards can give each other?"],
  S04B: ["For the card you are working on, where exactly does its support stop?"],
  S05: ["C03 gives no destination and C05 describes movement to C's silos. What single record would connect them, if anything could?"],
  S06A: ["If you had a receipt linked to A, would it show that A agreed freely? What else would you need?"],
  S06B: ["Which words in the overconfident claim go further than the cards allow?"],
  S07: ["For each proposition, what would change your interpretation if you found it?"],
  S08: ["Where must real material go, and why must it never enter the Hub?"],
  S09A: ["For this row, which card supports it, and what is still missing before the next reader can rely on it?"],
};
function authoredReply(screenId, n) {
  const list = AUTHORED[screenId] || AUTHORED.default;
  return list[n % list.length];
}

// Screens learner text before it leaves the platform. Pilot-level heuristic; not a guarantee.
function personalDataFlag(text) {
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) return "an email address";
  if (/(\+?\d[\d\s().-]{8,}\d)/.test(text)) return "a phone or ID number";
  return null;
}

function checkReply(text) {
  if (!text || text.length > 1200) return "length";
  const cites = text.match(/\[(C\d{2})\]/g) || [];
  for (const c of cites) if (!VALID_CARDS.has(c.slice(1, -1))) return "citation";
  if (/\b(is|was) guilty\b|\bguilty of\b/i.test(text)) return "verdict";
  return null;
}

async function reply({ routeKey, screenId, history, message, turnIndex }) {
  const pd = personalDataFlag(message);
  if (pd) {
    return { source: "blocked", text: `Your message looks like it contains ${pd}. The Hub is for fictional material only, so it was not sent to the guide. Please remove it and ask again.` };
  }
  if (!aiEnabled()) return { source: "authored", text: authoredReply(screenId, turnIndex) };
  const msgs = history.slice(-10).map((m) => ({ role: m.role === "learner" ? "user" : "assistant", content: m.content }));
  msgs.push({ role: "user", content: message });
  // Anthropic requires alternating roles starting with user.
  const clean = [];
  for (const m of msgs) { if (clean.length && clean[clean.length - 1].role === m.role) clean[clean.length - 1].content += "\n" + m.content; else clean.push({ ...m }); }
  while (clean.length && clean[0].role !== "user") clean.shift();
  try {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 350, system: systemPrompt(routeKey, screenId), messages: clean }),
    });
    clearTimeout(timer);
    if (!res.ok) { console.error("AI provider status", res.status); return { source: "authored", text: authoredReply(screenId, turnIndex), note: "The AI guide is unavailable right now, so this is an authored question." }; }
    const data = await res.json();
    let text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    text = text.replace(/[–—]/g, ", ");
    const bad = checkReply(text);
    if (bad) { console.warn("AI reply rejected:", bad); return { source: "authored", text: authoredReply(screenId, turnIndex), note: "The guide's reply did not pass the source check, so this is an authored question." }; }
    if (!/\?\s*$/.test(text)) text += " " + authoredReply(screenId, turnIndex);
    return { source: "ai", text };
  } catch (e) {
    console.error("AI error", e.message);
    return { source: "authored", text: authoredReply(screenId, turnIndex), note: "The AI guide is unavailable right now, so this is an authored question." };
  }
}
module.exports = { reply, aiEnabled, MODEL };
