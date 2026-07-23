import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { LANG_NAMES } from "../lib/caseEngine";
import { translateCached, type ContentType } from "../lib/translationCache";

/**
 * Generic on-demand content translation. The frontend sends the strings shown on a reading, a
 * slide lesson or an activity and gets them back in the chosen South-African language.
 *
 * Translations are served from the static cache (translated once, reused forever) and pass
 * through the terminology glossary. Each returned string carries a `reviewed` flag so the UI
 * can badge machine drafts as "pending native-speaker review"; legal content is only ever
 * returned once a reviewer has approved it. Falls back to the originals on any failure.
 */
const router = Router();

const CONTENT_TYPES = new Set<ContentType>(["general", "legal", "ui", "course", "case"]);

router.get("/translate/languages", requireAuth, (_req, res) => {
  res.json(Object.entries(LANG_NAMES).map(([code, name]) => ({ code, name })));
});

router.post("/translate", requireAuth, async (req, res) => {
  const texts = Array.isArray(req.body?.texts) ? req.body.texts.map((t: unknown) => String(t ?? "")) : [];
  const lang = String(req.body?.lang ?? "en");
  const contentType: ContentType = CONTENT_TYPES.has(req.body?.contentType) ? req.body.contentType : "general";
  if (texts.length === 0 || lang === "en" || !LANG_NAMES[lang]) {
    res.json({ texts, reviewed: texts.map(() => true) });
    return;
  }
  try {
    const out = await translateCached(texts, lang, contentType);
    res.json({ texts: out.map((o) => o.text), reviewed: out.map((o) => o.reviewed) });
  } catch {
    res.json({ texts, reviewed: texts.map(() => false) }); // never block the reader on a translation hiccup
  }
});

export default router;
