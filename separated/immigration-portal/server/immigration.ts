import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { immigrationCasesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { anthropic, MODEL, checkRateLimit } from "../lib/anthropic";
import {
  IMMIGRATION_FORMS,
  IMMIGRATION_SCENARIOS,
  IMMIGRATION_DISCLAIMER,
  USCIS_FEE_CALCULATOR_URL,
} from "../lib/immigrationData";

const router = Router();

// GET /immigration/forms — curated forms & fees reference
router.get("/immigration/forms", requireAuth, (_req, res) => {
  res.json({
    forms: IMMIGRATION_FORMS,
    feeCalculatorUrl: USCIS_FEE_CALCULATOR_URL,
    disclaimer: IMMIGRATION_DISCLAIMER,
  });
});

// GET /immigration/scenarios — illustrative example scenarios
router.get("/immigration/scenarios", requireAuth, (_req, res) => {
  res.json({ scenarios: IMMIGRATION_SCENARIOS, disclaimer: IMMIGRATION_DISCLAIMER });
});

// --- Live USCIS updates -----------------------------------------------------
// Official USCIS "All News" RSS feed (news releases + alerts).
const USCIS_RSS_URL = "https://www.uscis.gov/news/rss-feed/59144";

// Curated authoritative places to check. Always shown, even if the feed is down.
const UPDATE_SOURCES = [
  { label: "USCIS Newsroom", url: "https://www.uscis.gov/newsroom", note: "Official hub for all USCIS news." },
  { label: "USCIS Alerts", url: "https://www.uscis.gov/newsroom/alerts", note: "Time-sensitive policy and operational alerts." },
  {
    label: "All News",
    url: "https://www.uscis.gov/newsroom/all-news",
    note: "Full archive of releases, searchable by topic and date.",
  },
  { label: "All Forms", url: "https://www.uscis.gov/forms/all-forms", note: "Current form editions and instructions." },
  { label: "Fee Calculator", url: USCIS_FEE_CALCULATOR_URL, note: "Verify current filing fees." },
  {
    label: "Federal Register (USCIS)",
    url: "https://www.federalregister.gov/agencies/u-s-citizenship-and-immigration-services",
    note: "Official rules, fee changes, and public comment notices.",
  },
];

let updatesCache: { at: number; items: any[] } | null = null;
const UPDATES_TTL_MS = 30 * 60 * 1000; // 30 minutes

function decodeFeedText(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRssItems(xml: string, limit = 12) {
  const items: { title: string; link: string; date: string; summary: string }[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/g) || [];
  for (const block of blocks) {
    const pick = (tag: string) => {
      const m = block.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">"));
      return m ? decodeFeedText(m[1]) : "";
    };
    const title = pick("title");
    const link = pick("link");
    if (!title || !link) continue;
    items.push({ title, link, date: pick("pubDate"), summary: pick("description").slice(0, 240) });
    if (items.length >= limit) break;
  }
  return items;
}

// GET /immigration/updates — live USCIS headlines + curated authoritative links
router.get("/immigration/updates", requireAuth, async (_req, res) => {
  const now = Date.now();
  if (updatesCache && now - updatesCache.at < UPDATES_TTL_MS) {
    res.json({ items: updatesCache.items, sources: UPDATE_SOURCES, disclaimer: IMMIGRATION_DISCLAIMER });
    return;
  }

  let items: any[] = [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(USCIS_RSS_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TheCoachImmigration/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (r.ok) {
      items = parseRssItems(await r.text());
    }
  } catch (err) {
    console.error("[immigration] updates fetch error:", err);
  }

  // Only cache successful, non-empty results so a transient failure doesn't stick.
  if (items.length > 0) {
    updatesCache = { at: now, items };
  }

  res.json({ items, sources: UPDATE_SOURCES, disclaimer: IMMIGRATION_DISCLAIMER });
});

// POST /immigration/advise — situation intake + structured informational guidance
router.post("/immigration/advise", requireAuth, async (req, res) => {
  const userId = (req as any).userId;

  if (!checkRateLimit(userId, false)) {
    res.status(429).json({ error: "Daily AI call limit reached. Please try again tomorrow." });
    return;
  }

  const { situation, name, language } = req.body as {
    situation?: string;
    name?: string;
    language?: string;
  };
  if (!situation || situation.trim().length < 10) {
    res.status(400).json({ error: "Please describe your situation in a little more detail." });
    return;
  }

  const firstName =
    typeof name === "string" && name.trim()
      ? name.trim().slice(0, 60).replace(/[^\p{L}\p{N}'\- ]/gu, "")
      : "";

  // Only allow a known set of output languages (defends against prompt injection via this field).
  const ALLOWED_LANGUAGES = ["English", "Spanish", "Chinese", "Tagalog", "Vietnamese"];
  const outputLanguage =
    typeof language === "string" && ALLOWED_LANGUAGES.includes(language) ? language : "English";

  const formsContext = IMMIGRATION_FORMS.map(
    (f) => `${f.code} - ${f.name}: ${f.purpose} Approx fee: ${f.approxFee}.`,
  ).join("\n");

  const system = `You are a warm, plain-spoken informational US immigration assistant inside a help app. You are NOT a lawyer and you must NOT give legal advice or guarantee outcomes.

${
    firstName
      ? `The person you are helping is named ${firstName}. Address them by their first name once, naturally, in the summary (not in every field).`
      : `You do not know the person's name, so do not invent one.`
  }

Read the person's situation and return a STRUCTURED, personalized overview: which common USCIS form(s) typically apply, rough costs, the general steps, what to watch out for, a few relatable examples of people in similar situations, and a few follow-up questions that would sharpen the guidance.

Respond with ONLY a single JSON object, no other text before or after, in exactly this shape:
{
  "summary": "2-4 sentences, warm and personalized to THEIR specific facts (status, relationship, goal, timing). Reflect back what you heard so it feels understood, then name the likely path.",
  "forms": [{"code": "I-765", "why": "short reason this form may apply to them", "fee": "approx fee text"}],
  "steps": ["general step 1", "general step 2"],
  "watchOut": ["a common pitfall or caution", "another"],
  "relatableExamples": [{"situation": "a 1-2 sentence ANONYMIZED, COMPOSITE example of someone in a broadly similar position (different enough to be clearly not them)", "takeaway": "the one practical lesson their story illustrates"}],
  "followUpQuestions": ["a specific question whose answer would change the forms, cost, eligibility, or risk above", "another"],
  "attorneyNote": "one sentence on when to consult a licensed immigration attorney or a DOJ-accredited representative"
}

Rules:
- Only use forms from the reference list below. If the situation needs something outside it or is complex (removal/deportation, criminal history, prior denials, fraud concerns, hard deadlines), keep "forms" minimal and explain in "summary" and "attorneyNote" that they should get professional help.
- Never promise approval, eligibility, or specific timelines. Use cautious language like "often" or "may".
- relatableExamples: give 2 or 3. They MUST be original, composite, anonymized illustrations representative of situations people commonly discuss in online immigration communities and forums. NEVER quote, copy, or reproduce any real person's post or words, and never use real names. Make each one clearly distinct from this person's exact facts.
- followUpQuestions: give 2 to 4. Each must be the kind of detail that genuinely changes the answer (for example, how they last entered the US, whether a card is conditional, exact dates, prior filings or denials). Phrase them plainly and kindly, addressed to "you".
- In the fee strings or a step, remind them to verify current fees at ${USCIS_FEE_CALCULATOR_URL}.
- Use plain text in every string value: no markdown symbols (no #, *, no asterisks) and no em dashes. Keep each field concise.
${
    outputLanguage === "English"
      ? ""
      : `- LANGUAGE: Write every string value in ${outputLanguage}, using natural, clear, everyday wording that a non-native English speaker can follow. Keep USCIS form codes (such as I-130, N-400) and official form names in English, but translate everything else. Translate the field values only; keep the JSON keys exactly as shown above in English.`
  }

Reference forms:
${formsContext}`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      // Non-English output is more verbose; give it extra room so the JSON isn't truncated.
      max_tokens: outputLanguage === "English" ? 1800 : 2800,
      system,
      messages: [{ role: "user", content: situation.slice(0, 4000) }],
    });

    let text = response.content[0]?.type === "text" ? response.content[0].text : "";
    // Strip markdown code fences the model sometimes adds despite instructions.
    text = text.replace(/```(?:json)?/gi, "").trim();

    let guidance: any = null;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        guidance = JSON.parse(match[0]);
      } catch {
        guidance = null;
      }
    }

    // Fallback: if the model didn't return parseable JSON, show its text as a summary.
    if (!guidance || typeof guidance !== "object") {
      guidance = { summary: text.trim() };
    }

    guidance.summary = typeof guidance.summary === "string" ? guidance.summary : "";
    guidance.forms = Array.isArray(guidance.forms) ? guidance.forms : [];
    guidance.steps = Array.isArray(guidance.steps) ? guidance.steps : [];
    guidance.watchOut = Array.isArray(guidance.watchOut) ? guidance.watchOut : [];
    guidance.relatableExamples = Array.isArray(guidance.relatableExamples)
      ? guidance.relatableExamples
          .filter((e: any) => e && (typeof e.situation === "string" || typeof e.takeaway === "string"))
          .map((e: any) => ({
            situation: typeof e.situation === "string" ? e.situation : "",
            takeaway: typeof e.takeaway === "string" ? e.takeaway : "",
          }))
      : [];
    guidance.followUpQuestions = Array.isArray(guidance.followUpQuestions)
      ? guidance.followUpQuestions.filter((q: any) => typeof q === "string" && q.trim())
      : [];
    guidance.attorneyNote = typeof guidance.attorneyNote === "string" ? guidance.attorneyNote : "";

    if (!guidance.summary && guidance.forms.length === 0 && guidance.steps.length === 0) {
      res.status(500).json({ error: "Could not generate guidance. Please try again." });
      return;
    }

    res.json({ guidance, disclaimer: IMMIGRATION_DISCLAIMER });
  } catch (err) {
    console.error("[immigration] advise error:", err);
    res.status(500).json({ error: "Something went wrong generating guidance. Please try again." });
  }
});

// GET /immigration/cases — the user's saved cases
router.get("/immigration/cases", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const rows = await db
    .select()
    .from(immigrationCasesTable)
    .where(eq(immigrationCasesTable.userId, userId))
    .orderBy(desc(immigrationCasesTable.id));
  res.json(rows);
});

// POST /immigration/cases — save a case (guidance is stored as a JSON string)
router.post("/immigration/cases", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const { title, situation, guidance } = req.body as {
    title?: string;
    situation?: string;
    guidance?: string;
  };

  if (!situation || !situation.trim()) {
    res.status(400).json({ error: "Nothing to save yet." });
    return;
  }

  const [saved] = await db
    .insert(immigrationCasesTable)
    .values({
      userId,
      title: (title?.trim() || "My case").slice(0, 200),
      situation: situation.slice(0, 8000),
      guidance: (guidance ?? "").slice(0, 16000),
    })
    .returning();

  res.json(saved);
});

// DELETE /immigration/cases/:id
router.delete("/immigration/cases/:id", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const id = Number(req.params.id);
  await db
    .delete(immigrationCasesTable)
    .where(and(eq(immigrationCasesTable.userId, userId), eq(immigrationCasesTable.id, id)));
  res.status(204).send();
});

export default router;
