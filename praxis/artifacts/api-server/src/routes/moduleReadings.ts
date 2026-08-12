import { Router } from "express";
import { db } from "@workspace/db";
import { moduleReadingsTable, modulesTable, coursesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth, requireCoFacilitatorOrAbove } from "../middlewares/requireAuth";
import { canParticipateInCourse } from "../lib/scope";
import { extractFromBuffer, extractFromUrl } from "../lib/extractText";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router();

/**
 * Module readings.
 *
 * Staff attach a document (parsed to text -- we do not store binaries), a link, or pasted
 * text to a module; learners read it inside the module's Readings tab.
 *
 * SIZE NOTE: express.json is capped at 25mb and base64 inflates by ~33%, so a 15MB file is
 * the real ceiling -- anything larger 413s in Express before this handler ever runs.
 */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

// extractFromBuffer dispatches on EXTENSION, so an unknown extension silently yields
// garbage utf8. Gate the list explicitly rather than letting that through.
const ALLOWED_EXT = ["pdf", "docx", "txt", "md", "markdown", "csv", "tsv", "rtf", "html", "htm", "pptx", "xlsx", "xls"];
const extOf = (name: string) => (name.split(".").pop() ?? "").toLowerCase();

/** List/detail shape. `content` is omitted from lists to keep payloads small. */
function toRow(r: typeof moduleReadingsTable.$inferSelect) {
  return {
    id: r.id,
    moduleId: r.moduleId,
    title: r.title,
    kind: r.kind,
    sourceUrl: r.sourceUrl,
    filename: r.filename,
    chars: r.chars,
    hasContent: !!(r.content && r.content.length > 0),
    order: r.order,
    createdAt: r.createdAt.toISOString(),
  };
}

// POST /modules/:moduleId/web-suggestions -- use web search to find current, freely accessible
// videos and articles relevant to this module. Returns a short curated list the author can add to
// the module (a video becomes a video lesson; an article becomes a reading whose text is pulled in).
// Uses Anthropic's built-in web_search tool; if that is unavailable, returns a clear error.
router.post("/modules/:moduleId/web-suggestions", requireAuth, requireCoFacilitatorOrAbove, async (req, res) => {
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, req.params.moduleId) });
  if (!mod) { res.status(404).json({ error: "Module not found" }); return; }
  const topic = `${mod.title}. ${mod.description ?? ""} Objectives: ${(mod.objectives ?? []).join("; ")}`.slice(0, 1200);
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1800,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }] as any,
      messages: [{
        role: "user",
        content: `Find high-quality, current, freely accessible learning resources for this course module.\n\nModule topic: ${topic}\n\nUse web search to find up to 4 YouTube or Khan Academy VIDEOS and up to 4 ARTICLES (reputable, and accessible without a paywall where possible) that directly help teach this module.\n\nThen reply with ONLY a JSON object, no prose:\n{ "videos": [{"title":"...","url":"https://...","note":"one short line on why it fits"}], "articles": [{"title":"...","url":"https://...","note":"one short line on why it fits"}] }\nUse only real URLs you actually found via search.`,
      }],
    }, { timeout: 120000, maxRetries: 1 });
    const text = (message.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("");
    let parsed: any = {};
    try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; }
    const clean = (arr: any) => Array.isArray(arr)
      ? arr.map((x: any) => ({ title: String(x?.title ?? "").slice(0, 200), url: String(x?.url ?? ""), note: String(x?.note ?? "").slice(0, 200) }))
          .filter((x: any) => /^https?:\/\//.test(x.url)).slice(0, 6)
      : [];
    res.json({ videos: clean(parsed.videos), articles: clean(parsed.articles) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("web-suggestions failed:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Could not fetch web suggestions. Web search may not be enabled for this server." });
  }
});

// POST /modules/:moduleId/readings/generate -- write a COMPLETE reading for this module from its
// topic, overview, and objectives (not a stub), and attach it. This is the "full reading material
// pulled into the module" for authors who do not have a source document to upload.
router.post("/modules/:moduleId/readings/generate", requireAuth, requireCoFacilitatorOrAbove, async (req, res) => {
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, req.params.moduleId) });
  if (!mod) { res.status(404).json({ error: "Module not found" }); return; }
  const objectives = mod.objectives ?? [];
  const context = [
    `Module title: ${mod.title}`,
    mod.description ? `Overview: ${mod.description}` : "",
    objectives.length ? `Learning objectives:\n${objectives.map((o) => `- ${o}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  // If the course kept the uploaded source material, build the reading FROM that content (pulling the
  // parts that apply to this module), so the reading is the real material, not a generic write-up.
  const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, mod.courseId) });
  const source = ((course as { sourceMaterial?: string } | undefined)?.sourceMaterial ?? "").slice(0, 45000);
  const prompt = source
    ? `From the SOURCE MATERIAL below, produce the COMPLETE reading for this specific module. Include every part of the source that applies to this module's topic and objectives: the full explanations, definitions, criteria tables, processes, and examples. Preserve the detail, do not over-summarise or drop content. Organise it with clear markdown section headings (##), short paragraphs, and lists/tables where the source has them. End with a short "Key takeaways" list. No preamble. Start directly with the reading.\n\nMODULE:\n${context}\n\nSOURCE MATERIAL:\n${source}`
    : `Write a complete, self-contained reading that fully teaches this course module. 700 to 1200 words, accurate and practical, with markdown section headings (##), short paragraphs, lists where useful, key terms defined, a concrete example, and a short "Key takeaways" list. No preamble. Start directly with the reading.\n\nMODULE:\n${context}`;
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: source ? 6000 : 3500,
      messages: [{ role: "user", content: prompt }],
    }, { timeout: 150000, maxRetries: 2 });
    const content = message.content[0];
    const text = content && content.type === "text" ? content.text.trim() : "";
    if (text.length < 200) throw new Error("Empty reading");
    // Replace the architect's starter stub if one exists, so we do not leave two readings behind.
    const existing = await db.select().from(moduleReadingsTable).where(eq(moduleReadingsTable.moduleId, mod.id));
    const stub = existing.find((r) => (r.content ?? "").includes("starter reading generated from your material") || (r.chars ?? 0) < 400);
    let row;
    if (stub) {
      [row] = await db.update(moduleReadingsTable).set({ title: `${mod.title}: Reading`, content: text, chars: text.length }).where(eq(moduleReadingsTable.id, stub.id)).returning();
    } else {
      [row] = await db.insert(moduleReadingsTable).values({
        moduleId: mod.id, courseId: mod.courseId, title: `${mod.title}: Reading`,
        kind: "document", content: text, chars: text.length, createdBy: req.userId!,
      }).returning();
    }
    res.status(201).json(toRow(row));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("reading gen failed:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Could not generate a reading for this module. Please try again." });
  }
});

// POST /modules/:moduleId/readings, staff attach a reading.
router.post("/modules/:moduleId/readings", requireAuth, requireCoFacilitatorOrAbove, async (req, res) => {
  const { moduleId } = req.params;
  const { url, filename, dataBase64, text, title: rawTitle } = (req.body ?? {}) as {
    url?: string; filename?: string; dataBase64?: string; text?: string; title?: string;
  };

  try {
    const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, moduleId) });
    if (!mod) { res.status(404).json({ error: "Module not found" }); return; }

    let content = "";
    let kind = "document";
    let sourceUrl: string | null = null;
    let fname: string | null = null;
    let title = (rawTitle ?? "").trim();

    if (dataBase64 && filename) {
      const ext = extOf(filename);
      if (!ALLOWED_EXT.includes(ext)) {
        res.status(400).json({ error: `Unsupported file type ".${ext}". Try PDF, Word, PowerPoint, Excel, or a text file.` });
        return;
      }
      const buf = Buffer.from(dataBase64, "base64");
      if (buf.length > MAX_UPLOAD_BYTES) {
        res.status(400).json({ error: "That file is too large (15MB maximum)." });
        return;
      }
      content = await extractFromBuffer(filename, buf);
      fname = filename;
      if (!title) title = filename.replace(/\.[^.]+$/, "");
    } else if (url) {
      kind = "link";
      sourceUrl = String(url).trim();
      // Best effort: a link must still open even when we cannot parse its text.
      try { content = await extractFromUrl(sourceUrl); } catch { content = ""; }
      if (!title) {
        try {
          title = new URL(sourceUrl.startsWith("http") ? sourceUrl : `https://${sourceUrl}`)
            .hostname.replace(/^www\./, "");
        } catch { title = "Link"; }
      }
    } else if (text) {
      content = String(text);
      if (!title) title = "Reading";
    } else {
      res.status(400).json({ error: "Provide a file, a link, or some text." });
      return;
    }

    // A parsed document with almost nothing in it is a failed parse, not a reading.
    if (kind !== "link" && content.trim().length < 40) {
      res.status(422).json({ error: "No readable text was found in that file." });
      return;
    }

    const [row] = await db
      .insert(moduleReadingsTable)
      .values({
        moduleId,
        courseId: mod.courseId,
        title: (title || "Reading").slice(0, 200),
        kind,
        sourceUrl,
        filename: fname,
        content: content || null,
        chars: content.length,
        createdBy: req.userId!,
      })
      .returning();

    res.status(201).json(toRow(row));
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "Could not add that reading." });
  }
});

// GET /modules/:moduleId/readings, metadata list (no content).
router.get("/modules/:moduleId/readings", requireAuth, async (req, res) => {
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, req.params.moduleId) });
  if (!mod) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canParticipateInCourse(req.dbUser!, mod.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rows = await db
    .select()
    .from(moduleReadingsTable)
    .where(eq(moduleReadingsTable.moduleId, req.params.moduleId))
    .orderBy(asc(moduleReadingsTable.order), asc(moduleReadingsTable.createdAt));
  res.json(rows.filter((r) => r.published).map(toRow));
});

// GET /readings/:id, full parsed text for the online reader.
router.get("/readings/:id", requireAuth, async (req, res) => {
  const row = await db.query.moduleReadingsTable.findFirst({
    where: eq(moduleReadingsTable.id, req.params.id),
  });
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  // Returns the full parsed text of the uploaded document -- the reading itself.
  if (row.courseId && !(await canParticipateInCourse(req.dbUser!, row.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json({ ...toRow(row), content: row.content ?? "" });
});

// PATCH /readings/:id, staff edit a reading's title and/or content (markdown). This is what makes
// the reading itself editable in place -- the author can fix, trim, or rewrite the parsed/generated
// text and learners see the update immediately.
router.patch("/readings/:id", requireAuth, requireCoFacilitatorOrAbove, async (req, res) => {
  const row = await db.query.moduleReadingsTable.findFirst({ where: eq(moduleReadingsTable.id, req.params.id) });
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const b = (req.body ?? {}) as { title?: string; content?: string };
  const patch: Record<string, unknown> = {};
  if (typeof b.title === "string") patch.title = b.title.trim().slice(0, 200) || row.title;
  if (typeof b.content === "string") { patch.content = b.content; patch.chars = b.content.length; }
  if (!Object.keys(patch).length) { res.status(400).json({ error: "Nothing to update." }); return; }
  const [updated] = await db.update(moduleReadingsTable).set(patch).where(eq(moduleReadingsTable.id, req.params.id)).returning();
  res.json({ ...toRow(updated), content: updated.content ?? "" });
});

// DELETE /readings/:id, staff remove a reading.
router.delete("/readings/:id", requireAuth, requireCoFacilitatorOrAbove, async (req, res) => {
  await db.delete(moduleReadingsTable).where(eq(moduleReadingsTable.id, req.params.id));
  res.status(204).send();
});

export default router;
