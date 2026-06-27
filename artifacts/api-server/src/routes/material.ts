import { Router } from "express";
import { createHash } from "node:crypto";
import multer from "multer";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import {
  conceptsTable,
  dailyPlansTable,
  profilesTable,
  coachMessagesTable,
} from "@workspace/db";
import { eq, and, asc, desc, lte } from "drizzle-orm";
import { createMessage, MODEL, checkRateLimit } from "../lib/anthropic";
import { FREE_CONCEPT_LIMIT } from "../lib/billing";
import {
  extractMaterial,
  htmlToReadableText,
  HttpError,
  MAX_FILE_BYTES,
  type ExtractionInput,
} from "../lib/extractText";

const router = Router();

// In-memory upload handling. The hard size cap is enforced here; per-format
// limits (e.g. image/scanned-PDF ceilings) live in extractMaterial.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

const EXTRACTION_SYSTEM = `You are a study material processor. Break the provided material into atomic, teachable study concepts. Return a JSON array on a single line:
CONCEPTS: [{"title":"short name","content":"2 to 4 sentences: what it means, when it applies, and the key distinction or common confusion to watch for"}]

What makes a good concept set:
- Atomic: one idea per concept (a single definition, rule, doctrine, framework, process, or mechanism). Split compound topics apart.
- Non-overlapping: do not emit two concepts that are really the same idea worded differently. Merge near-duplicates.
- Testable: each must be something the learner could be asked to explain, apply, or distinguish.
- Self-contained: the content must teach the idea on its own, without the source document.
- Faithful: only extract what is actually in the material. Do not invent concepts to hit a number.

How many: scale to the material. Roughly one concept per substantial idea, generally 3 to 12, and up to 15 for long, dense material. Short material may yield only a few. Never pad.

Titles: 2 to 6 words, specific (prefer "Promissory Estoppel" over "Estoppel Rule").

Output rules:
- Return ONLY the single CONCEPTS: line containing valid JSON, nothing before or after.
- In titles and content, do NOT use markdown (no #, no asterisks) and do NOT use em dashes (use a regular hyphen, comma, or period). Plain sentences only.`;

type ConceptData = { title: string; content: string };

// Normalize a concept title for duplicate detection: lowercase, drop punctuation
// and a few filler words, collapse whitespace. So "The Rule Against Perpetuities"
// and "rule against perpetuities" collapse to the same key.
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|of|and|to|in|on|for)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Extraction is a pure function of the material text, so identical content is
// cached (spec: "cache concept extraction by content hash"). This skips a repeat
// API call when the same notes/URL/file are ingested again. In-memory, bounded,
// cleared on restart. Only the text path is cached; image/PDF blocks are not.
const EXTRACTION_CACHE = new Map<string, ConceptData[]>();
const EXTRACTION_CACHE_MAX = 500;

function cacheExtraction(key: string, data: ConceptData[]) {
  if (EXTRACTION_CACHE.size >= EXTRACTION_CACHE_MAX) {
    // Simple bound: drop the oldest entry (insertion order).
    const oldest = EXTRACTION_CACHE.keys().next().value;
    if (oldest !== undefined) EXTRACTION_CACHE.delete(oldest);
  }
  EXTRACTION_CACHE.set(key, data);
}

// Shared concept extraction. Accepts plain text or Anthropic content blocks
// (images / scanned PDFs), so paste, URL, and file upload all funnel through here.
export async function runExtraction(input: ExtractionInput, userId?: string, isPro = false): Promise<ConceptData[]> {
  const cacheKey =
    input.mode === "text" ? createHash("sha256").update(input.text).digest("hex") : null;
  if (cacheKey) {
    const hit = EXTRACTION_CACHE.get(cacheKey);
    if (hit) return hit; // cache hit: no API call, no rate-limit consumption
  }

  // Rate-limit only the real API call (after a cache miss), so re-ingesting
  // identical material does not eat into the learner's daily budget.
  if (userId && !checkRateLimit(userId, isPro)) {
    throw new HttpError(429, "Daily AI call limit reached. Please try again tomorrow.");
  }

  const userContent =
    input.mode === "text"
      ? `Extract concepts from:\n\n${input.text.slice(0, 20000)}`
      : input.blocks;

  const response = await createMessage({
    model: MODEL,
    max_tokens: 4000,
    system: EXTRACTION_SYSTEM,
    messages: [{ role: "user", content: userContent as any }],
  }, { label: "extract", userId });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const match = text.match(/CONCEPTS:\s*(\[[\s\S]+\])/);
  if (!match) throw new HttpError(500, "Failed to extract concepts from material");

  let data: ConceptData[];
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new HttpError(500, "Failed to parse extracted concepts");
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new HttpError(422, "No concepts could be extracted from this material.");
  }

  // Keep only well-formed entries and cap the count to bound cost downstream.
  const cleaned = data
    .filter((c) => c && typeof c.title === "string" && typeof c.content === "string" && c.title.trim())
    .slice(0, 15);
  if (cleaned.length === 0) {
    throw new HttpError(422, "No concepts could be extracted from this material.");
  }

  if (cacheKey) cacheExtraction(cacheKey, cleaned);
  return cleaned;
}

export async function saveConcepts(userId: string, data: ConceptData[], source: string, isPro = false) {
  const today = new Date().toISOString().slice(0, 10);

  // Dedup against the learner's existing library (and within this batch) so
  // re-ingesting overlapping material does not pile up duplicate concepts.
  const existing = await db
    .select({ title: conceptsTable.title })
    .from(conceptsTable)
    .where(eq(conceptsTable.userId, userId));
  const seen = new Set(existing.map((c) => normalizeTitle(c.title)));
  const fresh: ConceptData[] = [];
  for (const c of data) {
    const key = normalizeTitle(c.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    fresh.push(c);
  }
  const skipped = data.length - fresh.length;

  // Free tier is capped at FREE_CONCEPT_LIMIT total concepts; Pro is unlimited.
  let capped = false;
  if (!isPro) {
    const remaining = Math.max(0, FREE_CONCEPT_LIMIT - existing.length);
    if (fresh.length > remaining) {
      fresh.splice(remaining);
      capped = true;
    }
  }

  const inserted =
    fresh.length > 0
      ? await db
          .insert(conceptsTable)
          .values(
            fresh.map((c) => ({
              userId,
              title: c.title,
              content: c.content,
              source,
              mastery: 0,
              dueDate: today,
              ef: 2.5,
              interval: 1,
              reps: 0,
            })),
          )
          .returning()
      : [];

  const trickiest = fresh[0]?.title ?? data[0]?.title ?? "the first concept";

  // Build or refresh today's plan so the learner gets a concrete first plan the
  // moment they add material — that is what makes onboarding land. We only create
  // a plan when today has none (or an empty placeholder); an existing real plan
  // for today is left as-is and simply re-surfaced.
  const plan = await ensureTodayPlan(userId, today);

  const planHasConcepts =
    !!plan && Array.isArray(plan.conceptIds) && (plan.conceptIds as number[]).length > 0;

  const coachMessageText =
    inserted.length === 0
      ? capped
        ? `You have reached the free plan's ${FREE_CONCEPT_LIMIT}-concept limit, so I could not add more. Upgrade to Pro for unlimited concepts.`
        : `I went through that material, but every concept in it was already in your library, so there is nothing new to add. ` +
          (planHasConcepts ? "Your plan below is ready when you are." : "Send me fresh material when you have it.")
      : `Got it. I pulled ${inserted.length} new concept${inserted.length === 1 ? "" : "s"} from that material` +
        (skipped > 0 ? ` (skipped ${skipped} you already had)` : "") +
        (capped ? `, stopping at your free ${FREE_CONCEPT_LIMIT}-concept limit` : "") +
        `. The trickiest looks like "${trickiest}". ` +
        (planHasConcepts
          ? "I have set up your first plan below. Want to start there, or build up to it?"
          : "Want to start there, or would you like to build up to it?");

  const richBlocks = planHasConcepts
    ? {
        plan_card: {
          goalText: plan!.goalText,
          conceptIds: plan!.conceptIds,
          estimatedMinutes: plan!.estimatedMinutes,
          planId: plan!.id,
        },
        quick_replies: ["Let's go", `Start with ${trickiest}`],
      }
    : { quick_replies: ["Let's go", `Start with ${trickiest}`] };

  // Report back inside the conversation so the coach leads from here (the spec's
  // "Got it, I pulled N concepts..." moment), carrying the plan card with it.
  const [savedMessage] = await db
    .insert(coachMessagesTable)
    .values({ userId, role: "coach", content: coachMessageText, richBlocks })
    .returning();

  return { concepts: inserted, coachMessage: savedMessage.content };
}

// Returns today's daily plan, creating (or filling an empty placeholder) one from
// the learner's currently-due concepts when needed. Weakest concepts come first.
async function ensureTodayPlan(userId: string, today: string) {
  const existing = await db
    .select()
    .from(dailyPlansTable)
    .where(and(eq(dailyPlansTable.userId, userId), eq(dailyPlansTable.date, today)))
    .limit(1);

  const existingPlan = existing[0];
  const existingHasConcepts =
    !!existingPlan &&
    Array.isArray(existingPlan.conceptIds) &&
    (existingPlan.conceptIds as number[]).length > 0;

  if (existingHasConcepts) return existingPlan;

  const dueConcepts = await db
    .select()
    .from(conceptsTable)
    .where(and(eq(conceptsTable.userId, userId), lte(conceptsTable.dueDate, today)))
    .orderBy(conceptsTable.mastery)
    .limit(5);

  if (dueConcepts.length === 0) return existingPlan ?? null;

  const profiles = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1);
  const hoursPerWeek = profiles[0]?.hoursPerWeek ?? 8;
  const minutesPerDay = Math.round((hoursPerWeek * 60) / 7) || 30;

  const conceptIds = dueConcepts.map((c) => c.id);
  const titles = dueConcepts.slice(0, 3).map((c) => c.title);
  const goalText = `Start with ${titles.join(", ")}`;
  const estimatedMinutes = Math.max(15, Math.min(minutesPerDay, conceptIds.length * 10));

  if (existingPlan) {
    const [updated] = await db
      .update(dailyPlansTable)
      .set({ goalText, conceptIds, estimatedMinutes, status: "proposed" })
      .where(and(eq(dailyPlansTable.userId, userId), eq(dailyPlansTable.id, existingPlan.id)))
      .returning();
    return updated;
  }

  const [createdPlan] = await db
    .insert(dailyPlansTable)
    .values({
      userId,
      date: today,
      goalText,
      conceptIds,
      estimatedMinutes,
      status: "proposed",
      completedConceptIds: [],
    })
    .returning();
  return createdPlan;
}

function handleError(res: any, err: any) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("[material] processing error:", err);
  res.status(500).json({ error: "Something went wrong processing that material. Please try again." });
}

// GET /material
router.get("/material", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const sortBy = (req.query.sortBy as string) || "createdAt";
  const order = (req.query.order as string) || "desc";

  const allowed = ["mastery", "dueDate", "createdAt", "title"];
  const col = allowed.includes(sortBy) ? sortBy : "createdAt";

  const colMap: Record<string, any> = {
    mastery: conceptsTable.mastery,
    dueDate: conceptsTable.dueDate,
    createdAt: conceptsTable.createdAt,
    title: conceptsTable.title,
  };

  const rows = await db
    .select()
    .from(conceptsTable)
    .where(eq(conceptsTable.userId, userId))
    .orderBy(order === "asc" ? asc(colMap[col]) : desc(colMap[col]));

  res.json(rows);
});

// POST /material/ingest — paste text or URL
router.post("/material/ingest", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const { type, content, url } = req.body as { type: string; content?: string; url?: string };

  try {
    let rawText = "";
    const source = type;

    if (type === "paste" && content) {
      rawText = content;
    } else if (type === "url" && url) {
      try {
        const fetchRes = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; TheCoach/1.0)" },
          signal: AbortSignal.timeout(10000),
        });
        const html = await fetchRes.text();
        rawText = htmlToReadableText(html).slice(0, 50000);

        if (rawText.length < 200) {
          res.status(400).json({ error: "Could not extract enough text from URL. Try pasting the content directly." });
          return;
        }
      } catch {
        res.status(400).json({ error: "Failed to fetch URL. The page may be blocked or require login — try pasting the content directly." });
        return;
      }
    } else {
      res.status(400).json({ error: "Provide type=paste with content, or type=url with url" });
      return;
    }

    const isPro = !!(req as any).entitlement?.isPro;
    const data = await runExtraction({ mode: "text", text: rawText }, userId, isPro);
    const result = await saveConcepts(userId, data, source, isPro);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /material/upload — file upload (pdf, docx, pptx, text, images)
router.post("/material/upload", requireAuth, (req, res) => {
  upload.single("file")(req, res, async (uploadErr: any) => {
    const userId = (req as any).userId;

    if (uploadErr) {
      const msg =
        uploadErr.code === "LIMIT_FILE_SIZE"
          ? "File is too large. The maximum size is 100MB."
          : "Upload failed. Please try again.";
      res.status(400).json({ error: msg });
      return;
    }

    const file = (req as any).file as
      | { buffer: Buffer; mimetype: string; originalname: string }
      | undefined;

    if (!file) {
      res.status(400).json({ error: "No file was uploaded." });
      return;
    }

    try {
      const isPro = !!(req as any).entitlement?.isPro;
      const input = await extractMaterial(file.buffer, file.mimetype, file.originalname);
      const data = await runExtraction(input, userId, isPro);
      const result = await saveConcepts(userId, data, file.originalname, isPro);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });
});

// GET /material/:conceptId
router.get("/material/:conceptId", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const conceptId = Number(req.params.conceptId);
  const rows = await db
    .select()
    .from(conceptsTable)
    .where(and(eq(conceptsTable.userId, userId), eq(conceptsTable.id, conceptId)))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(rows[0]);
});

// DELETE /material/:conceptId
router.delete("/material/:conceptId", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const conceptId = Number(req.params.conceptId);
  await db
    .delete(conceptsTable)
    .where(and(eq(conceptsTable.userId, userId), eq(conceptsTable.id, conceptId)));
  res.status(204).send();
});

export default router;
