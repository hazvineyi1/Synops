import { Router } from "express";
import { db } from "@workspace/db";
import { accessRequestsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";

/**
 * Access requests (SA-2). A prospective facilitator / instructional designer submits the
 * public form; a super admin reviews it from the platform console.
 */
const router = Router();

const REQUESTABLE_ROLES = ["org_admin", "instructional_designer", "coach"];

// POST /access-requests — PUBLIC (no auth). Anyone may request platform access.
router.post("/access-requests", async (req, res) => {
  const { firstName, lastName, email, organisationName, requestedRole, message } = req.body ?? {};
  if (!firstName || !email) {
    res.status(400).json({ error: "First name and email are required." });
    return;
  }
  const role = REQUESTABLE_ROLES.includes(requestedRole) ? requestedRole : "org_admin";
  const [row] = await db
    .insert(accessRequestsTable)
    .values({
      firstName,
      lastName: lastName ?? null,
      email,
      organisationName: organisationName ?? null,
      requestedRole: role,
      message: message ?? null,
    })
    .returning();
  // Never echo internal fields to an unauthenticated caller.
  res.status(201).json({ id: row.id, status: row.status });
});

// GET /platform/access-requests?status=pending — super-admin queue.
router.get("/platform/access-requests", requireAuth, requireSuperAdmin, async (req, res) => {
  const status = req.query.status;
  const valid = status === "pending" || status === "approved" || status === "denied";
  const rows = await db
    .select()
    .from(accessRequestsTable)
    .where(valid ? eq(accessRequestsTable.status, status) : undefined)
    .orderBy(desc(accessRequestsTable.createdAt));
  res.json(rows);
});

// PATCH /platform/access-requests/:id — approve or deny. Audited.
router.patch("/platform/access-requests/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  const { status, note } = req.body ?? {};
  if (status !== "approved" && status !== "denied") {
    res.status(400).json({ error: "status must be 'approved' or 'denied'." });
    return;
  }
  const [row] = await db
    .update(accessRequestsTable)
    .set({ status, reviewerNote: note ?? null, reviewedById: req.userId!, reviewedAt: new Date() })
    .where(eq(accessRequestsTable.id, req.params.id))
    .returning();
  if (!row) { res.status(404).json({ error: "Access request not found" }); return; }
  await logAudit(req, `access_request.${status}`, "access_request", row.id, {
    email: row.email,
    requestedRole: row.requestedRole,
  });
  res.json(row);
});

export default router;
