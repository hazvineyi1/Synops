import { Router } from "express";
import { db } from "@workspace/db";
import { delegatedAdminsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { isSuperAdmin, isFacilitator } from "../lib/roles";
import { logAudit } from "../lib/audit";

/**
 * Delegated organisation admins register (partner-scoped). Super admin manages any partner; a
 * partner_admin manages their own. Self-creates the table. Persists the delegation; enforcement of
 * the granted powers in delivery routes is a separate authz step.
 */
const router = Router();
function canManage(user: { role: string; partnerId?: string | null }, partnerId: string) {
  return isSuperAdmin(user.role) || (isFacilitator(user.role) && user.partnerId === partnerId);
}
async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS delegated_admins (
      id text PRIMARY KEY,
      partner_id text NOT NULL,
      org_id text,
      org_name text,
      name text NOT NULL,
      email text NOT NULL,
      powers jsonb NOT NULL DEFAULT '[]'::jsonb,
      status text NOT NULL DEFAULT 'invited',
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
}
const cleanPowers = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((p): p is string => typeof p === "string" && p.length > 0) : [];

router.get("/partners/:partnerId/delegated-admins", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  if (!canManage(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const rows = await db.select().from(delegatedAdminsTable)
      .where(eq(delegatedAdminsTable.partnerId, partnerId)).orderBy(desc(delegatedAdminsTable.createdAt));
    res.json(rows);
  } catch {
    res.json([]);
  }
});

router.post("/partners/:partnerId/delegated-admins", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  const user = req.dbUser!;
  if (!canManage(user, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const b = req.body ?? {};
  if (!b.name || !String(b.name).trim() || !b.email || !String(b.email).trim()) {
    res.status(400).json({ error: "Name and email are required." });
    return;
  }
  await ensureTable();
  const [row] = await db.insert(delegatedAdminsTable).values({
    partnerId,
    orgId: b.orgId ? String(b.orgId) : null,
    orgName: b.orgName ? String(b.orgName) : null,
    name: String(b.name).trim(),
    email: String(b.email).trim(),
    powers: cleanPowers(b.powers),
    status: b.status ? String(b.status) : "invited",
    createdBy: user.id,
  }).returning();
  await logAudit(req, "delegated_admin.create", "delegated_admin", row.id, { email: row.email, org: row.orgName });
  res.status(201).json(row);
});

router.patch("/partners/:partnerId/delegated-admins/:id", requireAuth, async (req, res) => {
  const { partnerId, id } = req.params;
  if (!canManage(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const b = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (b.status !== undefined) patch.status = String(b.status);
  if (b.powers !== undefined) patch.powers = cleanPowers(b.powers);
  if (b.orgName !== undefined) patch.orgName = b.orgName ? String(b.orgName) : null;
  const [row] = await db.update(delegatedAdminsTable).set(patch)
    .where(and(eq(delegatedAdminsTable.id, id), eq(delegatedAdminsTable.partnerId, partnerId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/partners/:partnerId/delegated-admins/:id", requireAuth, async (req, res) => {
  const { partnerId, id } = req.params;
  if (!canManage(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(delegatedAdminsTable).where(and(eq(delegatedAdminsTable.id, id), eq(delegatedAdminsTable.partnerId, partnerId)));
  await logAudit(req, "delegated_admin.revoke", "delegated_admin", id);
  res.status(204).send();
});

export default router;
