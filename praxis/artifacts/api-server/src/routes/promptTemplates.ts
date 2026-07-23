import { Router } from "express";
import { db } from "@workspace/db";
import { promptTemplatesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { isSuperAdmin, canAdministerOrg } from "../lib/roles";
import { logAudit } from "../lib/audit";

/**
 * Per-org prompt templates (SA-3). Super admins manage any org's templates; a Facilitator
 * manages only their own org's.
 */
const router = Router();

function canManageOrgTemplates(user: { role: string; organisationId?: string | null }, orgId: string): boolean {
  if (isSuperAdmin(user.role)) return true;
  return canAdministerOrg(user.role) && !!user.organisationId && user.organisationId === orgId;
}

// GET /orgs/:orgId/prompt-templates
router.get("/orgs/:orgId/prompt-templates", requireAuth, async (req, res) => {
  if (!canManageOrgTemplates(req.dbUser!, req.params.orgId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db
    .select()
    .from(promptTemplatesTable)
    .where(eq(promptTemplatesTable.organisationId, req.params.orgId))
    .orderBy(desc(promptTemplatesTable.updatedAt));
  res.json(rows);
});

// GET /platform/prompt-templates/pending — the cross-org review queue (super admin).
router.get("/platform/prompt-templates/pending", requireAuth, async (req, res) => {
  if (!isSuperAdmin(req.dbUser!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db
    .select()
    .from(promptTemplatesTable)
    .where(eq(promptTemplatesTable.status, "draft"))
    .orderBy(desc(promptTemplatesTable.updatedAt));
  res.json(rows);
});

// POST /orgs/:orgId/prompt-templates
router.post("/orgs/:orgId/prompt-templates", requireAuth, async (req, res) => {
  if (!canManageOrgTemplates(req.dbUser!, req.params.orgId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { title, category, description, promptText } = req.body ?? {};
  if (!title || !promptText) { res.status(400).json({ error: "title and promptText are required" }); return; }
  const u = req.dbUser!;
  const [row] = await db
    .insert(promptTemplatesTable)
    .values({
      organisationId: req.params.orgId,
      createdBy: u.id,
      createdByName: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
      title,
      category: category || "Our templates",
      description: description || "",
      promptText,
    })
    .returning();
  await logAudit(req, "prompt_template.create", "prompt_template", row.id, { organisationId: req.params.orgId, title });
  res.status(201).json(row);
});

// PATCH /prompt-templates/:id
router.patch("/prompt-templates/:id", requireAuth, async (req, res) => {
  const existing = await db.query.promptTemplatesTable.findFirst({ where: eq(promptTemplatesTable.id, req.params.id) });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!canManageOrgTemplates(req.dbUser!, existing.organisationId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { title, category, description, promptText } = req.body ?? {};
  const updates: Partial<typeof promptTemplatesTable.$inferInsert> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (category !== undefined) updates.category = category;
  if (description !== undefined) updates.description = description;
  if (promptText !== undefined) updates.promptText = promptText;
  // Any change to the wording that shapes tutoring sends an approved template back to draft, so
  // edited text can never keep shaping live sessions without a fresh review.
  const contentChanged = title !== undefined || promptText !== undefined;
  if (contentChanged && existing.status === "approved") {
    updates.status = "draft";
    updates.reviewedBy = null;
    updates.reviewedAt = null;
  }
  const [row] = await db.update(promptTemplatesTable).set(updates).where(eq(promptTemplatesTable.id, req.params.id)).returning();
  res.json(row);
});

// POST /prompt-templates/:id/review { decision: approve|retire } — super-admin review gate.
router.post("/prompt-templates/:id/review", requireAuth, async (req, res) => {
  if (!isSuperAdmin(req.dbUser!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const decision = req.body?.decision;
  if (decision !== "approve" && decision !== "retire") {
    res.status(400).json({ error: "decision must be 'approve' or 'retire'" });
    return;
  }
  const existing = await db.query.promptTemplatesTable.findFirst({ where: eq(promptTemplatesTable.id, req.params.id) });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const status = decision === "approve" ? "approved" : "retired";
  const [row] = await db
    .update(promptTemplatesTable)
    .set({ status, reviewedBy: req.dbUser!.id, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(promptTemplatesTable.id, req.params.id))
    .returning();
  await logAudit(req, `prompt_template.${decision}`, "prompt_template", row.id, { organisationId: existing.organisationId, title: existing.title });
  res.json(row);
});

// DELETE /prompt-templates/:id
router.delete("/prompt-templates/:id", requireAuth, async (req, res) => {
  const existing = await db.query.promptTemplatesTable.findFirst({ where: eq(promptTemplatesTable.id, req.params.id) });
  if (!existing) { res.status(204).send(); return; }
  if (!canManageOrgTemplates(req.dbUser!, existing.organisationId)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(promptTemplatesTable).where(eq(promptTemplatesTable.id, req.params.id));
  await logAudit(req, "prompt_template.delete", "prompt_template", req.params.id, { organisationId: existing.organisationId });
  res.status(204).send();
});

export default router;
