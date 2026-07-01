import { Router, type IRouter } from "express";
import multer from "multer";
import { db, studyMaterialsTable } from "@workspace/paideia-db";
import { requireStudyUser } from "../../middlewares/auth.js";
import { extractFromFile, extractFromUrl, researchTopic } from "../../lib/extract.js";
import { kickoffConceptExtraction } from "../../lib/concept-extraction.js";

const router: IRouter = Router();
router.use(requireStudyUser);

const MAX_FILES = 10;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB per file

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_FILES,
    fileSize: MAX_FILE_SIZE,
  },
});

function inferSourceType(kind: string): "paste" | "url" | "file" {
  if (kind === "url") return "url";
  return "file";
}

// Auto-derived titles can come from raw page labels or multi-line topic text;
// collapse whitespace and cap the length so material names stay tidy.
function cleanTitle(raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  return (cleaned.length > 200 ? cleaned.slice(0, 200).trim() : cleaned) || "Untitled material";
}

router.post("/", upload.array("files", MAX_FILES), async (req, res) => {
  try {
    const userId = req.studyUser!.id;
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const combine = String(req.body?.combine ?? "false") === "true";
    const title = String(req.body?.title ?? "").trim();
    const urls = String(req.body?.urls ?? "")
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter(Boolean);
    const topics = String(req.body?.topics ?? "")
      .split(/\n+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (files.length === 0 && urls.length === 0 && topics.length === 0) {
      res.status(400).json({ error: "Provide at least one file, URL, or topic." });
      return;
    }
    if (files.length + urls.length + topics.length > MAX_FILES) {
      res.status(400).json({ error: `Maximum ${MAX_FILES} items per upload.` });
      return;
    }

    // Extract each item in parallel
    const items: Array<{
      label: string;
      text: string;
      kind: string;
      sourceUrl?: string;
      error?: string;
    }> = [];

    // Process with a concurrency limit of 3 to avoid OOM on large batches.
    const tasks: Array<() => Promise<void>> = [
      ...files.map((f) => async () => {
        try {
          const result = await extractFromFile({
            buffer: f.buffer,
            mimetype: f.mimetype,
            filename: f.originalname,
          });
          items.push({
            label: f.originalname.replace(/\.[^/.]+$/, ""),
            text: result.text,
            kind: result.kind,
          });
        } catch (err) {
          items.push({
            label: f.originalname,
            text: "",
            kind: "file",
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          // Free the buffer eagerly
          (f as any).buffer = null;
        }
      }),
      ...urls.map((url) => async () => {
        try {
          const result = await extractFromUrl(url);
          items.push({ label: result.title || url, text: result.text, kind: result.kind, sourceUrl: url });
        } catch (err) {
          items.push({
            label: url,
            text: "",
            kind: "url",
            sourceUrl: url,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
      ...topics.map((topic) => async () => {
        try {
          const result = await researchTopic(topic);
          items.push({ label: topic, text: result.text, kind: result.kind });
        } catch (err) {
          items.push({
            label: topic,
            text: "",
            kind: "url",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    ];

    const CONCURRENCY = 3;
    const queue = tasks.slice();
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (next) await next();
      }
    });
    await Promise.all(workers);

    const usable = items.filter((i) => i.text && i.text.trim().length > 0);
    if (usable.length === 0) {
      res.status(422).json({
        error: "Could not extract any readable content from the provided items.",
        items,
      });
      return;
    }

    const createdMaterials: any[] = [];

    if (combine) {
      const combinedTitle = cleanTitle(title || (usable.length === 1 ? usable[0]!.label : `Study Pack (${usable.length} sources)`));
      const sections = usable
        .map((i, idx) => `## Source ${idx + 1}: ${i.label}\n\n${i.text}`)
        .join("\n\n---\n\n");
      const contentText = sections.slice(0, 50000);
      const firstKind = usable[0]!.kind;

      const [material] = await db
        .insert(studyMaterialsTable)
        .values({
          userId,
          title: combinedTitle,
          sourceType: inferSourceType(firstKind),
          sourceUrl: usable[0]?.sourceUrl ?? null,
          contentText,
        })
        .returning();

      kickoffConceptExtraction({
        userId,
        materialId: material!.id,
        title: combinedTitle,
        contentText,
      });
      createdMaterials.push({ ...material!, conceptCount: 0, flashcardCount: 0 });
    } else {
      for (const item of usable) {
        const itemTitle = cleanTitle(usable.length === 1 && title ? title : item.label);
        const [material] = await db
          .insert(studyMaterialsTable)
          .values({
            userId,
            title: itemTitle,
            sourceType: inferSourceType(item.kind),
            sourceUrl: item.sourceUrl ?? null,
            contentText: item.text.slice(0, 50000),
          })
          .returning();
        kickoffConceptExtraction({
          userId,
          materialId: material!.id,
          title: itemTitle,
          contentText: item.text,
        });
        createdMaterials.push({ ...material!, conceptCount: 0, flashcardCount: 0 });
      }
    }

    res.status(201).json({
      materials: createdMaterials,
      processed: items.map((i) => ({
        label: i.label,
        kind: i.kind,
        chars: i.text.length,
        error: i.error ?? null,
      })),
    });
  } catch (err: any) {
    if (err?.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "One of the files exceeds the 50 MB limit." });
      return;
    }
    if (err?.code === "LIMIT_FILE_COUNT") {
      res.status(400).json({ error: `Maximum ${MAX_FILES} files per upload.` });
      return;
    }
    req.log?.error({ err }, "Multi-upload failed");
    res.status(500).json({ error: err?.message || "Upload failed" });
  }
});

export default router;
