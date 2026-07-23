import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  enrolmentsTable,
  submissionsTable,
  assignmentSubmissionsTable,
  gradebookEntriesTable,
  coachMessagesTable,
  consentEventsTable,
  deletionRequestsTable,
  auditEventsTable,
  authSessionsTable,
  passwordResetsTable,
  loginEventsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";

const router = Router();

/** Run a read and swallow errors (a renamed/absent column must never break the whole export). */
async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: `${label}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * GET /me/data-export - the signed-in user downloads all of their own personal
 * information as JSON (POPIA right of access). Scoped strictly to req.userId, so
 * a user can only ever export their own record. Secrets (password/mfa hashes)
 * are never included.
 */
router.get("/me/data-export", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const u = req.dbUser!;

  const profile = {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    avatarUrl: u.avatarUrl,
    role: u.role,
    status: u.status,
    partnerId: u.partnerId,
    organisationId: u.organisationId,
    phone: u.phone,
    whatsappOptIn: u.whatsappOptIn,
    learningStyle: u.learningStyle,
    accommodations: u.accommodations,
    consentVersion: u.consentVersion,
    consentedAt: u.consentedAt,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };

  const [enrolments, submissions, assignmentSubmissions, grades, coaching, consentHistory, deletionRequests, auditActions] =
    await Promise.all([
      safe("enrolments", () => db.select().from(enrolmentsTable).where(eq(enrolmentsTable.userId, userId))),
      safe("submissions", () => db.select().from(submissionsTable).where(eq(submissionsTable.userId, userId))),
      safe("assignmentSubmissions", () =>
        db.select().from(assignmentSubmissionsTable).where(eq(assignmentSubmissionsTable.userId, userId)),
      ),
      safe("grades", () => db.select().from(gradebookEntriesTable).where(eq(gradebookEntriesTable.userId, userId))),
      safe("coaching", () => db.select().from(coachMessagesTable).where(eq(coachMessagesTable.fromUserId, userId))),
      safe("consentHistory", () => db.select().from(consentEventsTable).where(eq(consentEventsTable.userId, userId))),
      safe("deletionRequests", () =>
        db.select().from(deletionRequestsTable).where(eq(deletionRequestsTable.userId, userId)),
      ),
      // Audit summary: the user's own recorded actions (not others' actions on them).
      safe("auditActions", async () => {
        const rows = await db.select().from(auditEventsTable).where(eq(auditEventsTable.actorId, userId));
        return rows.map((r) => ({ action: r.action, resourceType: r.resourceType, createdAt: r.createdAt }));
      }),
    ]);

  await logAudit(req, "data_export", "user", userId, { self: true });

  const payload = {
    exportedAt: new Date().toISOString(),
    app: "praxis",
    subject: profile,
    enrolments,
    submissions,
    assignmentSubmissions,
    grades,
    coachingInteractions: coaching,
    consentHistory,
    deletionRequests,
    auditSummary: auditActions,
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="synops-praxis-data-${userId.slice(0, 8)}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});

/**
 * POST /me/deletion-request - the signed-in user asks for erasure. Creates a
 * pending request; it is NEVER an immediate delete. If the user belongs to a
 * partner organisation, the request is flagged to route to the partner (the
 * responsible party) rather than being actioned by the platform.
 */
router.post("/me/deletion-request", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const u = req.dbUser!;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 2000) : null;

  // One open request at a time.
  const existing = await db
    .select({ id: deletionRequestsTable.id, status: deletionRequestsTable.status })
    .from(deletionRequestsTable)
    .where(eq(deletionRequestsTable.userId, userId));
  const open = existing.find((r) => r.status === "pending" || r.status === "routed");
  if (open) {
    res.status(409).json({ error: "You already have a deletion request in progress.", requestId: open.id });
    return;
  }

  const routeToPartner = !!u.partnerId;
  const [created] = await db
    .insert(deletionRequestsTable)
    .values({ userId, app: "praxis", status: "pending", reason, routeToPartner, partnerId: u.partnerId ?? null })
    .returning();

  await logAudit(req, "deletion_requested", "user", userId, { requestId: created.id, routeToPartner });

  res.status(201).json({
    ok: true,
    requestId: created.id,
    routeToPartner,
    message: routeToPartner
      ? "Your request has been recorded and will be routed to your organisation, which is responsible for your data."
      : "Your request has been recorded. An administrator will review and action it.",
  });
});

// ---- Admin fulfilment (super admin only) ---------------------------------

/** GET /admin/deletion-requests - queue for the admin fulfilment screen. */
router.get("/admin/deletion-requests", requireAuth, requireSuperAdmin, async (_req, res) => {
  const rows = await db.select().from(deletionRequestsTable).orderBy(deletionRequestsTable.requestedAt);
  // Attach a light label per requester so the admin sees who it is.
  const withUser = await Promise.all(
    rows.map(async (r) => {
      const [u] = await db
        .select({ email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, r.userId));
      return { ...r, subject: u ?? null };
    }),
  );
  res.json({ requests: withUser });
});

/**
 * De-identify a user: strip identifying profile fields, purge auth artifacts and
 * sessions (so the account can no longer sign in), and set deletedAt. Academic
 * records (enrolments, grades, submissions) are retained under records-retention
 * obligations but now point at an anonymised profile. Returns the retention note.
 */
async function deidentifyUser(userId: string): Promise<string> {
  const anonEmail = `deleted+${userId.slice(0, 12)}@deleted.invalid`;
  await db
    .update(usersTable)
    .set({
      email: anonEmail,
      firstName: "Deleted",
      lastName: "User",
      avatarUrl: null,
      phone: null,
      whatsappOptIn: false,
      passwordHash: null,
      clerkId: null,
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: [],
      status: "suspended",
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId));
  // Purge auth artifacts (security hygiene + they hold no academic value).
  await db.delete(authSessionsTable).where(eq(authSessionsTable.userId, userId)).catch(() => {});
  await db.delete(passwordResetsTable).where(eq(passwordResetsTable.userId, userId)).catch(() => {});
  await db.delete(loginEventsTable).where(eq(loginEventsTable.userId, userId)).catch(() => {});
  return "Identifying profile fields anonymised and account de-activated. Auth sessions, password-reset tokens and login events purged. Academic records (enrolments, grades, submissions) retained under records-retention obligations, now linked only to an anonymised profile. Object-storage backups age out on their normal rotation.";
}

/**
 * POST /admin/deletion-requests/:id/approve - super admin actions a request.
 * A partner-org learner's request is marked "routed" (the partner is the
 * responsible party); everyone else's runs the de-identify routine.
 */
router.post("/admin/deletion-requests/:id/approve", requireAuth, requireSuperAdmin, async (req, res) => {
  const [reqRow] = await db.select().from(deletionRequestsTable).where(eq(deletionRequestsTable.id, req.params.id));
  if (!reqRow) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (reqRow.status !== "pending") {
    res.status(409).json({ error: `Request is already ${reqRow.status}.` });
    return;
  }

  if (reqRow.routeToPartner) {
    const note = `Routed to partner ${reqRow.partnerId ?? "(unknown)"} as the responsible party. No data deleted by the platform.`;
    await db
      .update(deletionRequestsTable)
      .set({ status: "routed", decidedBy: req.userId!, decidedAt: new Date(), retentionNote: note })
      .where(eq(deletionRequestsTable.id, reqRow.id));
    await logAudit(req, "deletion_routed", "user", reqRow.userId, { requestId: reqRow.id, partnerId: reqRow.partnerId });
    res.json({ ok: true, status: "routed", retentionNote: note });
    return;
  }

  const note = await deidentifyUser(reqRow.userId);
  await db
    .update(deletionRequestsTable)
    .set({ status: "done", decidedBy: req.userId!, decidedAt: new Date(), retentionNote: note })
    .where(eq(deletionRequestsTable.id, reqRow.id));
  await logAudit(req, "deletion_fulfilled", "user", reqRow.userId, { requestId: reqRow.id, retentionNote: note });
  res.json({ ok: true, status: "done", retentionNote: note });
});

/** POST /admin/deletion-requests/:id/reject - decline with a reason. */
router.post("/admin/deletion-requests/:id/reject", requireAuth, requireSuperAdmin, async (req, res) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 2000) : "No reason given.";
  const [reqRow] = await db.select().from(deletionRequestsTable).where(eq(deletionRequestsTable.id, req.params.id));
  if (!reqRow) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (reqRow.status !== "pending") {
    res.status(409).json({ error: `Request is already ${reqRow.status}.` });
    return;
  }
  await db
    .update(deletionRequestsTable)
    .set({ status: "rejected", decidedBy: req.userId!, decidedAt: new Date(), retentionNote: `Rejected: ${reason}` })
    .where(eq(deletionRequestsTable.id, reqRow.id));
  await logAudit(req, "deletion_rejected", "user", reqRow.userId, { requestId: reqRow.id, reason });
  res.json({ ok: true, status: "rejected" });
});

export default router;
