import { Router } from "express";
import { db } from "@workspace/db";
import { partnerDocumentsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { isSuperAdmin } from "../lib/roles";
import { logAudit } from "../lib/audit";

/**
 * Partner Documents & Filing backend. A real, persistent filing register per partner. Super admin
 * manages any partner; a partner_admin manages their own. Self-creates the table. Stores metadata
 * (name, category, org, status, size) plus an optional fileUrl for durable storage when configured.
 */
const router = Router();

function canManage(user: { role: string; partnerId?: string | null }, partnerId: string) {
  return isSuperAdmin(user.role) || user.partnerId === partnerId;
}
const CATEGORIES = ["invoice", "contract", "funder", "compliance", "other"];
const STATUSES = ["filed", "pending", "action-required"];

async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS partner_documents (
      id text PRIMARY KEY,
      partner_id text NOT NULL,
      org_id text,
      org_name text,
      name text NOT NULL,
      category text NOT NULL DEFAULT 'other',
      status text NOT NULL DEFAULT 'pending',
      size text,
      file_url text,
      uploaded_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`ALTER TABLE partner_documents ADD COLUMN IF NOT EXISTS template_key text`);
}

// GET /partners/:partnerId/documents
router.get("/partners/:partnerId/documents", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  if (!canManage(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const rows = await db.select().from(partnerDocumentsTable)
      .where(eq(partnerDocumentsTable.partnerId, partnerId)).orderBy(desc(partnerDocumentsTable.createdAt));
    res.json(rows);
  } catch {
    res.json([]); // table not created yet
  }
});

// POST /partners/:partnerId/documents — file a document (metadata; optional fileUrl).
router.post("/partners/:partnerId/documents", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  const user = req.dbUser!;
  if (!canManage(user, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const b = req.body ?? {};
  if (!b.name || !String(b.name).trim()) { res.status(400).json({ error: "A document name is required." }); return; }
  await ensureTable();
  const category = CATEGORIES.includes(String(b.category)) ? String(b.category) : "other";
  const status = STATUSES.includes(String(b.status)) ? String(b.status) : "pending";
  const [row] = await db.insert(partnerDocumentsTable).values({
    partnerId,
    orgId: b.orgId ? String(b.orgId) : null,
    orgName: b.orgName ? String(b.orgName) : null,
    name: String(b.name).trim(),
    category, status,
    size: b.size ? String(b.size) : null,
    fileUrl: b.fileUrl ? String(b.fileUrl) : null,
    uploadedBy: user.id,
  }).returning();
  await logAudit(req, "document.file", "partner_document", row.id, { name: row.name, category });
  res.status(201).json(row);
});

// PATCH /partners/:partnerId/documents/:id — change status / rename.
router.patch("/partners/:partnerId/documents/:id", requireAuth, async (req, res) => {
  const { partnerId, id } = req.params;
  if (!canManage(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const b = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (b.status !== undefined && STATUSES.includes(String(b.status))) patch.status = String(b.status);
  if (b.name !== undefined) patch.name = String(b.name).trim();
  if (b.category !== undefined && CATEGORIES.includes(String(b.category))) patch.category = String(b.category);
  if (b.orgName !== undefined) patch.orgName = b.orgName ? String(b.orgName) : null;
  const [row] = await db.update(partnerDocumentsTable).set(patch)
    .where(and(eq(partnerDocumentsTable.id, id), eq(partnerDocumentsTable.partnerId, partnerId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// DELETE /partners/:partnerId/documents/:id
router.delete("/partners/:partnerId/documents/:id", requireAuth, async (req, res) => {
  const { partnerId, id } = req.params;
  if (!canManage(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(partnerDocumentsTable).where(and(eq(partnerDocumentsTable.id, id), eq(partnerDocumentsTable.partnerId, partnerId)));
  await logAudit(req, "document.delete", "partner_document", id);
  res.status(204).send();
});

export default router;
