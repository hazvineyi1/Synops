import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { uploadObject, storageEnabled } from "../lib/supabaseStorage";
import { anthropic } from "@workspace/integrations-anthropic-ai";

/**
 * Learner Portfolio — a personal, CROSS-COURSE collection the learner carries with them. It is owned
 * by the user (not a course), holds a cover + about + a gallery of items (images, presentations,
 * documents, links, notes) they upload, and picks from a few aesthetic templates. Self-creating
 * tables so no migration is needed.
 */
const router = Router();

let ensured = false;
async function ensureTables() {
  if (ensured) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS portfolios (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      title text,
      tagline text,
      template text DEFAULT 'classic',
      about_html text,
      cover_image_url text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS portfolios_user_uidx ON portfolios (user_id)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS portfolio_items (
      id text PRIMARY KEY,
      portfolio_id text NOT NULL,
      user_id text NOT NULL,
      kind text NOT NULL,
      title text,
      description_html text,
      file_url text,
      link_url text,
      thumbnail_url text,
      course_id text,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS portfolio_items_pf_idx ON portfolio_items (portfolio_id, sort_order, created_at)`);
  ensured = true;
}
const rowsOf = (res: any): any[] => (Array.isArray(res) ? res : (res?.rows ?? []));

const pf = (r: any) => r && ({
  id: r.id, title: r.title ?? "My Portfolio", tagline: r.tagline ?? null,
  template: r.template ?? "classic", aboutHtml: r.about_html ?? null, coverImageUrl: r.cover_image_url ?? null,
});
const item = (r: any) => ({
  id: r.id, kind: r.kind, title: r.title ?? null, descriptionHtml: r.description_html ?? null,
  fileUrl: r.file_url ?? null, linkUrl: r.link_url ?? null, thumbnailUrl: r.thumbnail_url ?? null,
  courseId: r.course_id ?? null, order: r.sort_order ?? 0, createdAt: r.created_at,
});

async function getOrCreate(userId: string) {
  const found = rowsOf(await db.execute(sql`SELECT * FROM portfolios WHERE user_id = ${userId} LIMIT 1`));
  if (found[0]) return found[0];
  const id = randomUUID();
  await db.execute(sql`INSERT INTO portfolios (id, user_id, title, template) VALUES (${id}, ${userId}, ${"My Portfolio"}, ${"classic"}) ON CONFLICT (user_id) DO NOTHING`);
  const again = rowsOf(await db.execute(sql`SELECT * FROM portfolios WHERE user_id = ${userId} LIMIT 1`));
  return again[0];
}

// GET /portfolio -- the caller's portfolio + its items (creates a default one on first visit).
router.get("/portfolio", requireAuth, async (req, res) => {
  await ensureTables();
  const p = await getOrCreate(req.userId!);
  const items = rowsOf(await db.execute(sql`SELECT * FROM portfolio_items WHERE portfolio_id = ${p.id} ORDER BY sort_order ASC, created_at ASC`));
  res.json({ portfolio: pf(p), items: items.map(item) });
});

// PATCH /portfolio -- cover, title, tagline, template, about.
router.patch("/portfolio", requireAuth, async (req, res) => {
  await ensureTables();
  const p = await getOrCreate(req.userId!);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const title = b.title !== undefined ? String(b.title).slice(0, 160) : undefined;
  const tagline = b.tagline !== undefined ? String(b.tagline).slice(0, 240) : undefined;
  const template = b.template !== undefined ? String(b.template).slice(0, 40) : undefined;
  const aboutHtml = b.aboutHtml !== undefined ? String(b.aboutHtml).slice(0, 20000) : undefined;
  const coverImageUrl = b.coverImageUrl !== undefined ? String(b.coverImageUrl).slice(0, 2000) : undefined;
  await db.execute(sql`
    UPDATE portfolios SET
      title = COALESCE(${title ?? null}, title),
      tagline = ${tagline === undefined ? sql`tagline` : (tagline || null)},
      template = COALESCE(${template ?? null}, template),
      about_html = ${aboutHtml === undefined ? sql`about_html` : (aboutHtml || null)},
      cover_image_url = ${coverImageUrl === undefined ? sql`cover_image_url` : (coverImageUrl || null)},
      updated_at = now()
    WHERE id = ${p.id}`);
  const again = rowsOf(await db.execute(sql`SELECT * FROM portfolios WHERE id = ${p.id} LIMIT 1`));
  res.json({ portfolio: pf(again[0]) });
});

// POST /portfolio/items -- add an item (image | file | link | note).
router.post("/portfolio/items", requireAuth, async (req, res) => {
  await ensureTables();
  const p = await getOrCreate(req.userId!);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const kind = String(b.kind ?? "").trim();
  if (!["image", "file", "link", "note"].includes(kind)) { res.status(400).json({ error: "Unknown item kind." }); return; }
  const id = randomUUID();
  const maxRows = rowsOf(await db.execute(sql`SELECT COALESCE(MAX(sort_order), -1) AS m FROM portfolio_items WHERE portfolio_id = ${p.id}`));
  const nextOrder = Number(maxRows[0]?.m ?? -1) + 1;
  await db.execute(sql`
    INSERT INTO portfolio_items (id, portfolio_id, user_id, kind, title, description_html, file_url, link_url, thumbnail_url, course_id, sort_order)
    VALUES (${id}, ${p.id}, ${req.userId}, ${kind},
      ${b.title ? String(b.title).slice(0, 200) : null},
      ${b.descriptionHtml ? String(b.descriptionHtml).slice(0, 8000) : null},
      ${b.fileUrl ? String(b.fileUrl).slice(0, 2000) : null},
      ${b.linkUrl ? String(b.linkUrl).slice(0, 2000) : null},
      ${b.thumbnailUrl ? String(b.thumbnailUrl).slice(0, 2000) : null},
      ${b.courseId ? String(b.courseId) : null},
      ${nextOrder})`);
  const row = rowsOf(await db.execute(sql`SELECT * FROM portfolio_items WHERE id = ${id} LIMIT 1`));
  res.status(201).json({ item: item(row[0]) });
});

// PATCH /portfolio/items/:id -- edit title/description/link (own items only).
router.patch("/portfolio/items/:id", requireAuth, async (req, res) => {
  await ensureTables();
  const owned = rowsOf(await db.execute(sql`SELECT id FROM portfolio_items WHERE id = ${req.params.id} AND user_id = ${req.userId} LIMIT 1`));
  if (!owned[0]) { res.status(404).json({ error: "Not found" }); return; }
  const b = (req.body ?? {}) as Record<string, unknown>;
  const title = b.title !== undefined ? String(b.title).slice(0, 200) : undefined;
  const descriptionHtml = b.descriptionHtml !== undefined ? String(b.descriptionHtml).slice(0, 8000) : undefined;
  const linkUrl = b.linkUrl !== undefined ? String(b.linkUrl).slice(0, 2000) : undefined;
  await db.execute(sql`
    UPDATE portfolio_items SET
      title = ${title === undefined ? sql`title` : (title || null)},
      description_html = ${descriptionHtml === undefined ? sql`description_html` : (descriptionHtml || null)},
      link_url = ${linkUrl === undefined ? sql`link_url` : (linkUrl || null)}
    WHERE id = ${req.params.id}`);
  const row = rowsOf(await db.execute(sql`SELECT * FROM portfolio_items WHERE id = ${req.params.id} LIMIT 1`));
  res.json({ item: item(row[0]) });
});

// DELETE /portfolio/items/:id
router.delete("/portfolio/items/:id", requireAuth, async (req, res) => {
  await ensureTables();
  await db.execute(sql`DELETE FROM portfolio_items WHERE id = ${req.params.id} AND user_id = ${req.userId}`);
  res.status(204).send();
});

// POST /portfolio/upload -- store an uploaded file (image/presentation/document) and return its URL.
const EXT_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  pdf: "application/pdf", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
router.post("/portfolio/upload", requireAuth, async (req, res) => {
  if (!storageEnabled()) { res.status(503).json({ error: "File uploads are not configured on this server." }); return; }
  const { filename, dataBase64 } = (req.body ?? {}) as { filename?: string; dataBase64?: string };
  if (!filename || !dataBase64) { res.status(400).json({ error: "A file is required." }); return; }
  const buf = Buffer.from(dataBase64, "base64");
  if (buf.length > 25 * 1024 * 1024) { res.status(400).json({ error: "That file is too large (25MB maximum)." }); return; }
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const mime = EXT_MIME[ext] ?? "application/octet-stream";
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  try {
    const up = await uploadObject(`portfolios/${req.userId}/${Date.now()}-${safe}`, buf, mime);
    res.json({ url: up.url, filename, isImage: mime.startsWith("image/") });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("portfolio upload failed:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Upload failed. Please try again." });
  }
});

// POST /portfolio/generate -- suggest an About intro, tagline and template from what's in the portfolio.
router.post("/portfolio/generate", requireAuth, async (req, res) => {
  await ensureTables();
  const p = await getOrCreate(req.userId!);
  const items = rowsOf(await db.execute(sql`SELECT kind, title, description_html FROM portfolio_items WHERE portfolio_id = ${p.id} ORDER BY sort_order ASC`));
  const inventory = items.map((r: any) => `- ${r.kind}: ${String(r.title ?? "").replace(/<[^>]+>/g, " ").trim()}`).join("\n").slice(0, 4000);
  const extra = String((req.body as { context?: string } | undefined)?.context ?? "").slice(0, 4000);
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 700,
      messages: [{ role: "user", content: `You are helping a learner write the intro for their personal learning PORTFOLIO that they carry across courses. Based on what is in it, write a warm, confident first-person "About" (2 short paragraphs), a one-line tagline, and pick one template from: classic, bold, minimal, warm. Reply ONLY as JSON: { "aboutHtml": "<p>…</p><p>…</p>", "tagline": "…", "template": "classic|bold|minimal|warm" }.\n\nPORTFOLIO ITEMS:\n${inventory || "(empty so far)"}\n\n${extra ? `LEARNER CONTEXT:\n${extra}` : ""}` }],
    }, { timeout: 60000, maxRetries: 1 });
    const t = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = (() => { try { return JSON.parse(t); } catch { const m = t.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; } })();
    const template = ["classic", "bold", "minimal", "warm"].includes(parsed.template) ? parsed.template : "classic";
    res.json({ aboutHtml: String(parsed.aboutHtml ?? "").slice(0, 20000), tagline: String(parsed.tagline ?? "").slice(0, 240), template });
  } catch {
    res.status(502).json({ error: "Could not generate a portfolio intro right now." });
  }
});

export default router;
