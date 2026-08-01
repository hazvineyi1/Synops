import { Router } from "express";
import { db } from "@workspace/db";
import { moduleReadingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { GAME_TEMPLATES, templateByKey, BAND_LABEL, type Band } from "../lib/gameTemplates";
import { generateGameContent, RIGOR_LEVELS, type Rigor } from "../lib/gameGenerator";

/**
 * Game Studio — turn lesson content into a playable game with AI. The admin picks a game type, subject,
 * grade band and rigor, and either pastes content or pulls a module's reading; the model returns the
 * game CONTENT (grounded in that content), which we render with the template's own build(). The result
 * is a DRAFT the admin previews and edits before saving as a normal activity via POST /activities.
 */
const router = Router();
const requireAuthor = requireRole("coach", "org_admin", "partner_admin", "super_admin");

// Catalogue of buildable game types + the bands/rigor the studio offers (drives the UI dropdowns).
router.get("/game-templates", requireAuth, (_req, res) => {
  res.json({
    templates: GAME_TEMPLATES.map((t) => ({ key: t.key, name: t.name, blurb: t.blurb, bands: t.bands })),
    bands: Object.entries(BAND_LABEL).map(([key, label]) => ({ key, label })),
    rigor: RIGOR_LEVELS,
  });
});

// Generate a game draft from content (pasted, or pulled from a module's reading).
router.post("/games/generate", requireAuth, requireAuthor, async (req, res) => {
  const b = req.body ?? {};
  const templateKey = String(b.templateKey ?? "");
  const tpl = templateByKey(templateKey);
  if (!tpl) { res.status(400).json({ error: "Unknown game type." }); return; }

  let content = String(b.content ?? "").trim();
  const moduleId = String(b.moduleId ?? "").trim();
  if (!content && moduleId) {
    const rows = await db.select().from(moduleReadingsTable).where(eq(moduleReadingsTable.moduleId, moduleId));
    content = rows.map((r) => r.content).filter(Boolean).join("\n\n");
  }

  try {
    const { content: gameContent, title } = await generateGameContent({
      templateKey, subject: String(b.subject ?? ""), band: (b.band as Band) || "35",
      rigor: (b.rigor as Rigor) || "intermediate", content, topic: String(b.topic ?? ""),
    });
    res.json({ templateKey: tpl.key, band: b.band ?? "35", subject: b.subject ?? "", rigor: b.rigor ?? "intermediate", title, content: gameContent, html: tpl.build(gameContent) });
  } catch (e) {
    res.status(422).json({ error: e instanceof Error ? e.message : "Generation failed." });
  }
});

// Re-render the HTML from edited content JSON (the admin tweaked a question, etc.).
router.post("/games/render", requireAuth, requireAuthor, (req, res) => {
  const tpl = templateByKey(String(req.body?.templateKey ?? ""));
  if (!tpl) { res.status(400).json({ error: "Unknown game type." }); return; }
  const content = req.body?.content;
  if (!tpl.validate(content)) { res.status(400).json({ error: "That game content isn't in the right shape yet." }); return; }
  res.json({ html: tpl.build(content) });
});

export default router;
