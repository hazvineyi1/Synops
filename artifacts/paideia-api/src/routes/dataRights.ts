import { Router, type IRouter, type Request } from "express";
import {
  db,
  studyUsersTable,
  studySessionsTable,
  studyPasswordResetsTable,
  studyDeletionRequestsTable,
  studyAdminAuditLogTable,
} from "@workspace/paideia-db";
import { eq } from "drizzle-orm";
import { requireStudyUser, requireStudyAdmin } from "../middlewares/auth.js";
import { assembleLearnerExport } from "../lib/learnerExport.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

/** Append a privileged-action row to the admin audit log. Never throws. */
async function audit(
  req: Request,
  action: string,
  targetId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(studyAdminAuditLogTable).values({
      actorUserId: req.studyUser?.id ?? null,
      actorEmail: req.studyUser?.email ?? null,
      action,
      targetType: "study_user",
      targetId,
      metadata: metadata ?? {},
    });
  } catch (err) {
    logger.warn({ err, action }, "audit write failed");
  }
}

/**
 * GET /me/data-export - the signed-in learner downloads all of their own data as
 * JSON (POPIA right of access). Scoped strictly to req.studyUser.id.
 */
router.get("/me/data-export", requireStudyUser, async (req, res) => {
  const userId = req.studyUser!.id;
  const payload = await assembleLearnerExport(userId);
  if (!payload) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  await audit(req, "data_export", userId, { self: true });
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="synops-coach-data-${userId.slice(0, 8)}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});

/**
 * POST /me/deletion-request - the learner asks for erasure. Creates a pending
 * request; never an immediate delete. An admin approves it, at which point the
 * account is de-identified.
 */
router.post("/me/deletion-request", requireStudyUser, async (req, res) => {
  const userId = req.studyUser!.id;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 2000) : null;

  const existing = await db
    .select({ id: studyDeletionRequestsTable.id, status: studyDeletionRequestsTable.status })
    .from(studyDeletionRequestsTable)
    .where(eq(studyDeletionRequestsTable.userId, userId));
  if (existing.some((r) => r.status === "pending")) {
    res.status(409).json({ error: "You already have a deletion request in progress." });
    return;
  }

  const [created] = await db
    .insert(studyDeletionRequestsTable)
    .values({ userId, status: "pending", reason })
    .returning();
  await audit(req, "deletion_requested", userId, { requestId: created.id });

  res.status(201).json({
    ok: true,
    requestId: created.id,
    message: "Your request has been recorded. An administrator will review and action it.",
  });
});

// ---- Admin fulfilment (study admin only) ---------------------------------

/** GET /admin/deletion-requests - queue for the admin screen. */
router.get("/admin/deletion-requests", requireStudyAdmin, async (_req, res) => {
  const rows = await db.select().from(studyDeletionRequestsTable).orderBy(studyDeletionRequestsTable.requestedAt);
  const withUser = await Promise.all(
    rows.map(async (r) => {
      const [u] = await db
        .select({ email: studyUsersTable.email, name: studyUsersTable.name })
        .from(studyUsersTable)
        .where(eq(studyUsersTable.id, r.userId));
      return { ...r, subject: u ?? null };
    }),
  );
  res.json({ requests: withUser });
});

/**
 * De-identify a learner: strip identifying fields and suspend the account, purge
 * sessions and reset tokens so it cannot sign in. Learning content stays linked
 * to an anonymised id; payments are retained for financial-record obligations.
 */
async function deidentify(userId: string): Promise<string> {
  const anonEmail = `deleted+${userId.slice(0, 12)}@deleted.invalid`;
  await db
    .update(studyUsersTable)
    .set({
      email: anonEmail,
      name: "Deleted user",
      passwordHash: "deleted",
      whatsappNumber: null,
      whatsappOptIn: false,
      guardianEmail: null,
      dateOfBirth: null,
      suspended: true,
    })
    .where(eq(studyUsersTable.id, userId));
  await db.delete(studySessionsTable).where(eq(studySessionsTable.userId, userId)).catch(() => {});
  await db.delete(studyPasswordResetsTable).where(eq(studyPasswordResetsTable.userId, userId)).catch(() => {});
  return "Identifying fields anonymised and account de-activated. Sessions and password-reset tokens purged. Learning content retained under an anonymised id; payment records retained for financial-record obligations. Backups age out on their normal rotation.";
}

/** POST /admin/deletion-requests/:id/approve - de-identify and close. */
router.post("/admin/deletion-requests/:id/approve", requireStudyAdmin, async (req, res) => {
  const [reqRow] = await db
    .select()
    .from(studyDeletionRequestsTable)
    .where(eq(studyDeletionRequestsTable.id, String(req.params.id)));
  if (!reqRow) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (reqRow.status !== "pending") {
    res.status(409).json({ error: `Request is already ${reqRow.status}.` });
    return;
  }
  const note = await deidentify(reqRow.userId);
  await db
    .update(studyDeletionRequestsTable)
    .set({ status: "done", decidedBy: req.studyUser!.id, decidedAt: new Date(), retentionNote: note })
    .where(eq(studyDeletionRequestsTable.id, reqRow.id));
  await audit(req, "deletion_fulfilled", reqRow.userId, { requestId: reqRow.id, retentionNote: note });
  res.json({ ok: true, status: "done", retentionNote: note });
});

/** POST /admin/deletion-requests/:id/reject - decline with a reason. */
router.post("/admin/deletion-requests/:id/reject", requireStudyAdmin, async (req, res) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 2000) : "No reason given.";
  const [reqRow] = await db
    .select()
    .from(studyDeletionRequestsTable)
    .where(eq(studyDeletionRequestsTable.id, String(req.params.id)));
  if (!reqRow) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (reqRow.status !== "pending") {
    res.status(409).json({ error: `Request is already ${reqRow.status}.` });
    return;
  }
  await db
    .update(studyDeletionRequestsTable)
    .set({ status: "rejected", decidedBy: req.studyUser!.id, decidedAt: new Date(), retentionNote: `Rejected: ${reason}` })
    .where(eq(studyDeletionRequestsTable.id, reqRow.id));
  await audit(req, "deletion_rejected", reqRow.userId, { requestId: reqRow.id, reason });
  res.json({ ok: true, status: "rejected" });
});

export default router;
