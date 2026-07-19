import { Router } from "express";
import { db } from "@workspace/db";
import { partnerAnnouncementsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { isSuperAdmin } from "../lib/roles";
import { logAudit } from "../lib/audit";

/**
 * Partner Communications backend — the persistent sent-history for partner broadcast announcements.
 * Super admin manages any partner; a partner_admin manages their own. Self-creates the table.
 * Records the announcement; actual in-app/email delivery is a later messaging step.
 */
const router = Router();

function canManage(user: { role: string; partnerId?: string | null }, partnerId: string) {
  return isSuperAdmin(user.role) || user.partnerId === partnerId;
}
const CHANNELS = ["in-app", "email", "both"];

async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS partner_announcements (
      id text PRIMARY KEY,
      partner_id text NOT NULL,
      subject text NOT NULL,
      body text NOT NULL,
      audience_label text NOT NULL DEFAULT 'All organisations',
      channel text NOT NULL DEFAULT 'both',
      recipients integer NOT NULL DEFAULT 0,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
}

// GET /partners/:partnerId/announcements
router.get("/partners/:partnerId/announcements", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  if (!canManage(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const rows = await db.select().from(partnerAnnouncementsTable)
      .where(eq(partnerAnnouncementsTable.partnerId, partnerId)).orderBy(desc(partnerAnnouncementsTable.createdAt));
    res.json(rows);
  } catch {
    res.json([]);
  }
});

// POST /partners/:partnerId/announcements — record a broadcast.
router.post("/partners/:partnerId/announcements", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  const user = req.dbUser!;
  if (!canManage(user, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const b = req.body ?? {};
  if (!b.subject || !String(b.subject).trim() || !b.body || !String(b.body).trim()) {
    res.status(400).json({ error: "Subject and message are required." });
    return;
  }
  await ensureTable();
  const channel = CHANNELS.includes(String(b.channel)) ? String(b.channel) : "both";
  const [row] = await db.insert(partnerAnnouncementsTable).values({
    partnerId,
    subject: String(b.subject).trim(),
    body: String(b.body).trim(),
    audienceLabel: b.audienceLabel ? String(b.audienceLabel) : "All organisations",
    channel,
    recipients: Number.isFinite(+b.recipients) ? Math.max(0, Math.trunc(+b.recipients)) : 0,
    createdBy: user.id,
  }).returning();
  await logAudit(req, "announcement.send", "partner_announcement", row.id, { subject: row.subject, recipients: row.recipients });
  res.status(201).json(row);
});

// DELETE /partners/:partnerId/announcements/:id
router.delete("/partners/:partnerId/announcements/:id", requireAuth, async (req, res) => {
  const { partnerId, id } = req.params;
  if (!canManage(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(partnerAnnouncementsTable).where(and(eq(partnerAnnouncementsTable.id, id), eq(partnerAnnouncementsTable.partnerId, partnerId)));
  res.status(204).send();
});

export default router;
