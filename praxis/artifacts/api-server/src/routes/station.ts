import { Router } from "express";
import { anthropic, isAiConfigured } from "@workspace/integrations-anthropic-ai";
import { requireAuth } from "../middlewares/requireAuth";
import { PEJ_COACH_PERSONA, PEJ_COACH_CONSTRAINTS } from "../lib/stationCoach";

/**
 * Socratic checkpoint probe for the interactive Decision Station.
 *
 * The station used to call the model directly from the browser, which cannot work (no key, CORS),
 * so it always fell back to one canned question that ignored the learner's answer. This routes the
 * probe through the server: it reads what the learner actually wrote and returns ONE probing
 * question grounded in their words, carrying the course's coach persona (the PEJ justice-sector
 * coach for that course) so the voice is consistent with the case coach and discussion moderator.
 *
 * Never throws to the client: on any problem it returns { probe: null } so the station keeps its
 * authored fallback question.
 */
const router = Router();
const MODEL = "claude-sonnet-4-6";

router.post("/station/probe", requireAuth, async (req, res) => {
  const answer = String(req.body?.answer ?? "").trim();
  const prompt = String(req.body?.prompt ?? "").trim();
  const code = String(req.body?.code ?? "");
  if (!answer || !isAiConfigured()) { res.json({ probe: null }); return; }

  const isPEJ = /PEJ-EVD|Project Expedite Justice/i.test(code);
  const lines: string[] = [];
  if (isPEJ) {
    lines.push(
      PEJ_COACH_PERSONA.trim(),
      "",
      "You are that coach, running a short Socratic checkpoint inside a training station. Bring that expertise and register.",
    );
  } else {
    lines.push("You are a Socratic coach for a qualified professional, running a checkpoint inside a training station.");
  }
  lines.push(
    "",
    "The learner has just written a justification for a high-stakes decision. Read what they ACTUALLY wrote and reply with EXACTLY ONE probing question that engages their specific words.",
    "",
    "RULES:",
    "1. One question only, under 30 words. No preamble, no praise, no moralising, no summary.",
    "2. Never say whether they were right; never give the answer or the underlying principle; introduce no new fact about the case.",
    "3. Build directly on what THEY said: name or echo the specific thing they raised, or press on the thing they left out.",
    "4. If they wrote almost nothing, said 'I don't know', or gave up, do NOT fire a generic question: offer ONE small, concrete foothold, a single narrow sub-question that helps them make a start.",
    "5. Plain, warm, direct. Never use em dashes or en dashes.",
  );
  if (isPEJ && PEJ_COACH_CONSTRAINTS) lines.push("", "STAY IN CONTEXT: " + PEJ_COACH_CONSTRAINTS.trim());
  if (prompt) lines.push("", "The checkpoint prompt they answered was: " + prompt);

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: lines.join("\n"),
      messages: [{ role: "user", content: "Their answer:\n\"" + answer + "\"\n\nWrite your single probing question." }],
    });
    const txt = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    res.json({ probe: txt || null });
  } catch {
    res.json({ probe: null });
  }
});

export default router;
