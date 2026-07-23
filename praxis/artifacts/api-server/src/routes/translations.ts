import { Router } from "express";
import { and, desc, eq, count, type SQL } from "drizzle-orm";
import { db, contentTranslationsTable } from "@workspace/db";
import { requireAuth, requireSuperAdmin } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { LANG_NAMES, languageName } from "../lib/caseEngine";
import { glossaryFor } from "../lib/localizationGlossary";

/**
 * Native-speaker translation review workflow. The static cache fills with machine drafts as
 * learners read content in isiZulu / isiXhosa / Afrikaans; a reviewer works the queue here,
 * approving (optionally editing) or rejecting each draft. Approved translations become the
 * canonical rendering; rejected ones are withheld until re-translated. Restricted to super
 * admins (the reviewer role) and every decision is audited.
 */
const router = Router();

const VALID_STATUS = new Set(["machine", "approved", "rejected"]);

// GET /platform/translations — review queue. Filter by lang + status, newest first, paginated.
router.get("/platform/translations", requireAuth, requireSuperAdmin, async (req, res) => {
  const lang = typeof req.query.lang === "string" && LANG_NAMES[req.query.lang] ? req.query.lang : null;
  const status = typeof req.query.status === "string" && VALID_STATUS.has(req.query.status) ? req.query.status : "machine";
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const conds: SQL[] = [eq(contentTranslationsTable.status, status)];
  if (lang) conds.push(eq(contentTranslationsTable.lang, lang));
  const where = and(...conds);

  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db.select().from(contentTranslationsTable).where(where).orderBy(desc(contentTranslationsTable.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(contentTranslationsTable).where(where),
  ]);

  res.setHeader("X-Total-Count", String(total));
  res.json(rows.map((r) => ({
    id: r.id,
    lang: r.lang,
    languageName: languageName(r.lang),
    sourceText: r.sourceText,
    translatedText: r.translatedText,
    status: r.status,
    contentType: r.contentType,
    reviewedBy: r.reviewedBy,
    reviewedAt: r.reviewedAt,
    createdAt: r.createdAt,
  })));
});

// GET /platform/translations/summary — counts per language + status, to drive the review dashboard.
router.get("/platform/translations/summary", requireAuth, requireSuperAdmin, async (_req, res) => {
  const rows = await db
    .select({ lang: contentTranslationsTable.lang, status: contentTranslationsTable.status, n: count() })
    .from(contentTranslationsTable)
    .groupBy(contentTranslationsTable.lang, contentTranslationsTable.status);
  res.json(rows.map((r) => ({ lang: r.lang, languageName: languageName(r.lang), status: r.status, count: r.n })));
});

// GET /platform/translations/glossary/:lang — reviewer reference for the terminology glossary.
router.get("/platform/translations/glossary/:lang", requireAuth, requireSuperAdmin, (req, res) => {
  const g = glossaryFor(req.params.lang);
  if (!g) { res.status(404).json({ error: "No glossary for this language." }); return; }
  res.json(g);
});

// POST /platform/translations/:id/review — approve (optionally with an edited translation) or reject.
router.post("/platform/translations/:id/review", requireAuth, requireSuperAdmin, async (req, res) => {
  const decision = req.body?.decision;
  if (decision !== "approve" && decision !== "reject") {
    res.status(400).json({ error: "decision must be 'approve' or 'reject'" });
    return;
  }
  const row = await db.query.contentTranslationsTable.findFirst({ where: eq(contentTranslationsTable.id, req.params.id) });
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const edited = typeof req.body?.translatedText === "string" ? req.body.translatedText.trim() : null;
  const status = decision === "approve" ? "approved" : "rejected";

  await db
    .update(contentTranslationsTable)
    .set({
      status,
      // An approver may correct the draft in place; a rejection keeps the text for reference.
      translatedText: decision === "approve" && edited ? edited : row.translatedText,
      reviewedBy: req.userId ?? null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(contentTranslationsTable.id, row.id));

  await logAudit(req, `translation.${decision}`, "content_translation", row.id, {
    lang: row.lang,
    contentType: row.contentType,
    edited: decision === "approve" && !!edited,
  });

  res.json({ id: row.id, status });
});

export default router;
