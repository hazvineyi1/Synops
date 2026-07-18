import { Router } from "express";
import { db } from "@workspace/db";
import { moduleReadingsTable, modulesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth, requireCoFacilitatorOrAbove } from "../middlewares/requireAuth";
import { canParticipateInCourse } from "../lib/scope";
import { extractFromBuffer, extractFromUrl } from "../lib/extractText";

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

// POST /modules/:moduleId/readings — staff attach a reading.
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

// GET /modules/:moduleId/readings — metadata list (no content).
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

// GET /readings/:id — full parsed text for the online reader.
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

// DELETE /readings/:id — staff remove a reading.
router.delete("/readings/:id", requireAuth, requireCoFacilitatorOrAbove, async (req, res) => {
  await db.delete(moduleReadingsTable).where(eq(moduleReadingsTable.id, req.params.id));
  res.status(204).send();
});

export default router;
