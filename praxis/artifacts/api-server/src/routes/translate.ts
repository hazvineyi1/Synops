import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { translateTexts, LANG_NAMES } from "../lib/caseEngine";

/**
 * Generic on-demand content translation. The frontend sends the strings shown on a reading, a slide
 * lesson or an activity and gets them back in the chosen South-African language, using the same AI
 * translator the case coach and discussions already use. Falls back to the originals on any failure.
 */
const router = Router();

router.get("/translate/languages", requireAuth, (_req, res) => {
  res.json(Object.entries(LANG_NAMES).map(([code, name]) => ({ code, name })));
});

router.post("/translate", requireAuth, async (req, res) => {
  const texts = Array.isArray(req.body?.texts) ? req.body.texts.map((t: unknown) => String(t ?? "")) : [];
  const lang = String(req.body?.lang ?? "en");
  if (texts.length === 0 || lang === "en" || !LANG_NAMES[lang]) { res.json({ texts }); return; }
  try {
    const out = await translateTexts(texts, lang);
    res.json({ texts: Array.isArray(out) && out.length === texts.length ? out : texts });
  } catch {
    res.json({ texts }); // never block the reader on a translation hiccup
  }
});

export default router;
