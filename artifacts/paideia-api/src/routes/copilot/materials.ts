import { Router, type IRouter } from "express";
import multer from "multer";
import { db, materialsTable } from "@workspace/paideia-db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, requireActiveTeacher } from "../../middlewares/auth.js";
import { extractFromFile, extractFromUrl } from "../../lib/extract.js";
import { logEvent } from "../../lib/eventLog.js";
import { DEMO_TEACHER_EMAIL } from "../../lib/demoTeacherSeed.js";

const router: IRouter = Router();
router.use(requireAuth, requireActiveTeacher);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: MAX_FILE_SIZE } });

function isDemo(email: string): boolean {
  return email.toLowerCase() === DEMO_TEACHER_EMAIL;
}

function cleanTitle(raw: string): string {
  const c = raw.replace(/\s+/g, " ").trim();
  return (c.length > 200 ? c.slice(0, 200).trim() : c) || "Untitled material";
}

function serialise(m: typeof materialsTable.$inferSelect, includeText = false) {
  const base = {
    id: m.id,
    title: m.title,
    sourceType: m.sourceType,
    sourceMeta: m.sourceMeta,
    status: m.status,
    errorMessage: m.errorMessage,
    charCount: m.charCount,
    preview: (m.contentText ?? "").slice(0, 240),
    createdAt: m.createdAt.toISOString(),
  };
  return includeText ? { ...base, contentText: m.contentText } : base;
}

// List the teacher's materials (no full text, just a preview).
router.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(materialsTable)
    .where(eq(materialsTable.teacherId, req.teacher!.id))
    .orderBy(desc(materialsTable.createdAt));
  res.json({ materials: rows.map((m) => serialise(m)) });
});

// One material with its full extracted text.
router.get("/:id", async (req, res) => {
  const [m] = await db
    .select()
    .from(materialsTable)
    .where(and(eq(materialsTable.id, req.params.id), eq(materialsTable.teacherId, req.teacher!.id)))
    .limit(1);
  if (!m) { res.status(404).json({ error: "Material not found" }); return; }
  res.json({ material: serialise(m, true) });
});

// Upload a material: a pasted passage, a file (PDF, Word, txt, image, audio, video), or a URL.
// The demo shows this feature but does not allow it, so uploading is blocked for the demo account.
router.post("/", upload.single("file"), async (req, res) => {
  if (isDemo(req.teacher!.email)) {
    res.status(403).json({ error: "Uploading your own materials is available when you create a free account.", code: "demo_locked" });
    return;
  }
  const file = req.file as Express.Multer.File | undefined;
  const pasted = String(req.body?.text ?? "").trim();
  const url = String(req.body?.url ?? "").trim();
  const titleIn = String(req.body?.title ?? "").trim();

  try {
    let contentText = "";
    let sourceType: "paste" | "file" | "url" = "paste";
    let sourceMeta: string | null = null;
    let autoTitle = "";

    if (file) {
      sourceType = "file";
      sourceMeta = file.originalname;
      const extracted = await extractFromFile({ buffer: file.buffer, mimetype: file.mimetype, filename: file.originalname });
      contentText = extracted.text;
      autoTitle = file.originalname.replace(/\.[^.]+$/, "");
    } else if (url) {
      sourceType = "url";
      sourceMeta = url;
      const extracted = await extractFromUrl(url);
      contentText = extracted.text;
      autoTitle = extracted.title || url;
    } else if (pasted) {
      sourceType = "paste";
      contentText = pasted;
      autoTitle = pasted.slice(0, 60);
    } else {
      res.status(400).json({ error: "Provide a file, a URL, or some pasted text." });
      return;
    }

    if (!contentText.trim()) {
      res.status(422).json({ error: "We couldn't read any text from that. Try a different file, a URL, or paste the text directly." });
      return;
    }

    const [row] = await db.insert(materialsTable).values({
      teacherId: req.teacher!.id,
      title: cleanTitle(titleIn || autoTitle),
      sourceType,
      sourceMeta,
      contentText,
      status: "ready",
      charCount: contentText.length,
    }).returning();

    void logEvent(req, "material_uploaded", { sourceType, chars: contentText.length }, { surface: "app" });
    res.json({ material: serialise(row!, true) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not process that material.";
    res.status(422).json({ error: message });
  }
});

router.delete("/:id", async (req, res) => {
  await db.delete(materialsTable).where(and(eq(materialsTable.id, req.params.id), eq(materialsTable.teacherId, req.teacher!.id)));
  res.json({ ok: true });
});

export default router;
