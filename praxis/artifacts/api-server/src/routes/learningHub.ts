import { Router } from "express";
import { db } from "@workspace/db";
import {
  learningContentTable,
  courseTemplatesTable,
  courseAssignmentsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/requireAuth";
import { uploadObject, deleteObject, storageEnabled } from "../lib/supabaseStorage";

const router = Router();

const actorName = (req: any) => {
  const u = req.dbUser;
  return [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.email || "Super Admin";
};

// ── Content library ──────────────────────────────────────────────────────────
router.get("/learning/content", requireAuth, async (_req, res) => {
  const rows = await db.select().from(learningContentTable).orderBy(desc(learningContentTable.createdAt));
  res.json(rows);
});

/** Add a link or metadata-only item (no file blob). */
router.post("/learning/content", requireAuth, requireSuperAdmin, async (req, res) => {
  const { title, kind, meta, url, tags, reviewed } = req.body ?? {};
  if (!title || !kind) { res.status(400).json({ error: "title and kind are required" }); return; }
  const [row] = await db.insert(learningContentTable).values({
    title, kind, meta: meta ?? null, url: url ?? null, storagePath: null,
    tags: Array.isArray(tags) ? tags.join(",") : (tags ?? null),
    reviewed: reviewed ?? kind !== "video", addedBy: actorName(req),
  }).returning();
  res.status(201).json(row);
});

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // express.json caps the base64 body at 25mb
const guessType = (name: string) => {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const map: Record<string, string> = {
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
    pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    zip: "application/zip", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return map[ext] ?? "application/octet-stream";
};
const kindFromType = (type: string) => type.startsWith("video/") ? "video" : type.startsWith("image/") ? "image" : type.includes("zip") ? "scorm" : "document";

/** Upload a file to Supabase Storage and record it in the library. */
router.post("/learning/content/upload", requireAuth, requireSuperAdmin, async (req, res) => {
  if (!storageEnabled()) {
    res.status(503).json({ error: "File storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server." });
    return;
  }
  const { filename, dataBase64, title, tags } = req.body ?? {};
  if (!filename || !dataBase64) { res.status(400).json({ error: "filename and dataBase64 are required" }); return; }
  const buf = Buffer.from(dataBase64, "base64");
  if (buf.length > MAX_UPLOAD_BYTES) { res.status(400).json({ error: "That file is too large (20MB maximum via upload; use a link for larger video)." }); return; }
  const contentType = guessType(filename);
  const kind = kindFromType(contentType);
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  const path = `content/${Date.now()}-${safe}`;
  try {
    const { url, storagePath } = await uploadObject(path, buf, contentType);
    const [row] = await db.insert(learningContentTable).values({
      title: title || filename, kind,
      meta: `${(buf.length / 1024 / 1024).toFixed(1)} MB`, url, storagePath,
      tags: Array.isArray(tags) ? tags.join(",") : (tags ?? null),
      reviewed: kind !== "video", addedBy: actorName(req),
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
});

router.patch("/learning/content/:id/review", requireAuth, requireSuperAdmin, async (req, res) => {
  const [row] = await db.update(learningContentTable).set({ reviewed: true }).where(eq(learningContentTable.id, req.params.id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/learning/content/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  const [row] = await db.select().from(learningContentTable).where(eq(learningContentTable.id, req.params.id)).limit(1);
  if (row?.storagePath) await deleteObject(row.storagePath);
  await db.delete(learningContentTable).where(eq(learningContentTable.id, req.params.id));
  res.status(204).send();
});

// ── Course templates ─────────────────────────────────────────────────────────
router.get("/learning/templates", requireAuth, async (_req, res) => {
  const rows = await db.select().from(courseTemplatesTable).orderBy(desc(courseTemplatesTable.createdAt));
  res.json(rows);
});

router.post("/learning/templates", requireAuth, requireSuperAdmin, async (req, res) => {
  const { title, level, modality, modules, hours, standard, description, kind } = req.body ?? {};
  if (!title) { res.status(400).json({ error: "title is required" }); return; }
  const [row] = await db.insert(courseTemplatesTable).values({
    title, level: level ?? "Foundational", modality: modality ?? "Online",
    modules: modules ?? 1, hours: hours ?? 1, standard: standard ?? null,
    description: description ?? null, kind: kind ?? "course",
  }).returning();
  res.status(201).json(row);
});

// ── Course -> partner assignments ──────────────────────────────────────────────
router.get("/learning/assignments", requireAuth, async (req, res) => {
  const partnerId = typeof req.query.partnerId === "string" ? req.query.partnerId : null;
  const rows = partnerId
    ? await db.select().from(courseAssignmentsTable).where(eq(courseAssignmentsTable.partnerId, partnerId))
    : await db.select().from(courseAssignmentsTable);
  res.json(rows);
});

/** Replace the exact set of partners a course is assigned to. */
router.put("/learning/assignments/:courseId", requireAuth, requireSuperAdmin, async (req, res) => {
  const courseId = req.params.courseId;
  const partnerIds: string[] = Array.isArray(req.body?.partnerIds) ? req.body.partnerIds : [];
  await db.delete(courseAssignmentsTable).where(eq(courseAssignmentsTable.courseId, courseId));
  if (partnerIds.length) {
    await db.insert(courseAssignmentsTable).values(
      partnerIds.map((partnerId) => ({ courseId, partnerId, assignedBy: actorName(req) })),
    ).onConflictDoNothing();
  }
  const rows = await db.select().from(courseAssignmentsTable).where(eq(courseAssignmentsTable.courseId, courseId));
  res.json(rows);
});

/** Toggle a single course/partner grant. */
router.post("/learning/assignments/toggle", requireAuth, requireSuperAdmin, async (req, res) => {
  const { courseId, partnerId } = req.body ?? {};
  if (!courseId || !partnerId) { res.status(400).json({ error: "courseId and partnerId are required" }); return; }
  const existing = await db.select().from(courseAssignmentsTable)
    .where(and(eq(courseAssignmentsTable.courseId, courseId), eq(courseAssignmentsTable.partnerId, partnerId))).limit(1);
  if (existing.length) {
    await db.delete(courseAssignmentsTable).where(and(eq(courseAssignmentsTable.courseId, courseId), eq(courseAssignmentsTable.partnerId, partnerId)));
    res.json({ assigned: false });
  } else {
    await db.insert(courseAssignmentsTable).values({ courseId, partnerId, assignedBy: actorName(req) }).onConflictDoNothing();
    res.json({ assigned: true });
  }
});

export default router;
