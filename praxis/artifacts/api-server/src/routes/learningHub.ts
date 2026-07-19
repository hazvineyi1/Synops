import { Router } from "express";
import { db } from "@workspace/db";
import {
  learningContentTable,
  courseTemplatesTable,
  courseAssignmentsTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/requireAuth";
import { uploadObject, deleteObject, storageEnabled } from "../lib/supabaseStorage";

const router = Router();

/**
 * One-time schema bootstrap for environments without psql/DB-console access. Runs the same additive,
 * idempotent DDL + seed as praxis/migration-learning-hub.sql, using the server's own connection.
 * Super-admin only; safe to call more than once (IF NOT EXISTS / ON CONFLICT DO NOTHING).
 */
const LEARNING_HUB_DDL = `
CREATE TABLE IF NOT EXISTS learning_content (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text, title text NOT NULL, kind text NOT NULL,
  meta text, url text, storage_path text, tags text, reviewed boolean NOT NULL DEFAULT false,
  added_by text NOT NULL, created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS course_templates (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text, title text NOT NULL, level text NOT NULL,
  modality text NOT NULL, modules integer NOT NULL DEFAULT 1, hours integer NOT NULL DEFAULT 1,
  standard text, description text, kind text NOT NULL DEFAULT 'course', created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS course_assignments (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text, course_id text NOT NULL, partner_id text NOT NULL,
  assigned_by text, assigned_at timestamp NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS course_assignments_course_partner_uq ON course_assignments (course_id, partner_id);
INSERT INTO course_templates (id, title, level, modality, modules, hours, standard, description, kind) VALUES
  ('tpl_cs','Customer Service Excellence','Foundational','Hybrid',6,24,'Services SETA US 252210','Frontline service skills, complaint handling and service recovery.','course'),
  ('tpl_ds','Digital Skills Foundations','Foundational','Online',8,32,'MICT SETA - NQF 3','Core computer, internet and productivity skills for the workplace.','course'),
  ('tpl_ll','Team Leadership','Intermediate','Hybrid',5,20,'Services SETA - NQF 5','Supervisory leadership, delegation and performance conversations.','course'),
  ('tpl_fl','Financial Literacy at Work','Foundational','Online',4,12,'BANKSETA - NQF 4','Budgeting, credit, and workplace financial decision-making.','course'),
  ('tpl_ohs','Occupational Health & Safety','Foundational','In-person',4,16,'OHS Act 85 of 1993','Workplace hazard identification, PPE and incident reporting.','course'),
  ('tpl_lesson_bloom','Lesson template: Bloom-aligned module','Intermediate','Online',1,2,'Bloom Taxonomy','Reusable module scaffold: objectives, formative check, application task.','lesson')
ON CONFLICT (id) DO NOTHING;
INSERT INTO course_assignments (id, course_id, partner_id, assigned_by) VALUES
  ('ca_seed_1','tpl_cs','partner_talentforge','Seed'),
  ('ca_seed_2','tpl_ds','partner_talentforge','Seed'),
  ('ca_seed_3','tpl_ohs','partner_skillbridge','Seed')
ON CONFLICT (course_id, partner_id) DO NOTHING;
INSERT INTO learning_content (id, title, kind, meta, url, tags, reviewed, added_by) VALUES
  ('ct_v1','Traditional vs Digital Marketing (source lecture)','video','04:22 - 148 MB',NULL,'marketing,lecture',true,'Instructional Design'),
  ('ct_v2','Customer Service Role-play Walkthrough','video','11:38 - 402 MB',NULL,'customer-service',false,'Instructional Design'),
  ('ct_d1','Financial Literacy Workbook','document','PDF - 2.1 MB',NULL,'finance,workbook',true,'Instructional Design'),
  ('ct_d2','OHS Compliance Checklist','document','DOCX - 340 KB',NULL,'safety,compliance',true,'Instructional Design'),
  ('ct_l1','SETA Unit Standard 114974 reference','link','saqa.org.za','https://www.saqa.org.za','seta,reference',true,'Instructional Design')
ON CONFLICT (id) DO NOTHING;
`;

router.post("/learning/_migrate", requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    await db.execute(sql.raw(LEARNING_HUB_DDL));
    const [t, c, a] = await Promise.all([
      db.select().from(courseTemplatesTable),
      db.select().from(learningContentTable),
      db.select().from(courseAssignmentsTable),
    ]);
    res.json({ ok: true, templates: t.length, content: c.length, assignments: a.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Migration failed" });
  }
});

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
