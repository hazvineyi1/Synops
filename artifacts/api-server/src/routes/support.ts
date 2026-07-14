import { Router } from "express";
import { db } from "@workspace/db";
import {
  supportTicketsTable,
  supportTicketMessagesTable,
  usersTable,
  notificationsTable,
  auditEventsTable,
} from "@workspace/db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router = Router();

/**
 * Support / helpdesk.
 *
 * Staff = coach / org_admin / partner_admin / super_admin. They work a queue scoped to
 * their tenant (super_admin sees everything). A learner sees and posts to only their own
 * tickets, and never sees internal notes.
 */

const STAFF_ROLES = ["coach", "org_admin", "partner_admin", "super_admin"];
const requireStaff = requireRole(...STAFF_ROLES);

const isStaff = (role: string) => STAFF_ROLES.includes(role);
const VALID_STATUS = ["open", "pending", "resolved", "closed"];
const VALID_PRIORITY = ["low", "normal", "high", "urgent"];

async function audit(req: any, action: string, ticketId: string, metadata?: unknown) {
  await db
    .insert(auditEventsTable)
    .values({
      action,
      resourceType: "support_ticket",
      resourceId: ticketId,
      actorId: req.userId ?? null,
      actorRole: req.dbUser?.role ?? null,
      partnerId: req.dbUser?.partnerId ?? null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    })
    .catch(() => {});
}

async function notify(userId: string, actorId: string, title: string, body: string, link: string) {
  if (userId === actorId) return; // never notify yourself
  await db
    .insert(notificationsTable)
    .values({ userId, actorId, type: "system", title, body, link })
    .catch(() => {});
}

function ticketResponse(t: typeof supportTicketsTable.$inferSelect, extra?: Record<string, unknown>) {
  return {
    id: t.id,
    subject: t.subject,
    body: t.body,
    requesterId: t.requesterId,
    assigneeId: t.assigneeId,
    status: t.status,
    priority: t.priority,
    partnerId: t.partnerId,
    organisationId: t.organisationId,
    replyCount: t.replyCount,
    lastMessageAt: t.lastMessageAt.toISOString(),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    ...extra,
  };
}

/* ─────────────────────────── Tickets ─────────────────────────── */

/** POST /support/tickets — anyone signed in opens a ticket. */
router.post("/support/tickets", requireAuth, async (req, res) => {
  const subject = String(req.body?.subject ?? "").trim();
  const body = String(req.body?.body ?? "").trim();
  if (!subject) {
    res.status(400).json({ error: "A subject is required." });
    return;
  }
  const priority = VALID_PRIORITY.includes(req.body?.priority) ? req.body.priority : "normal";

  const [ticket] = await db
    .insert(supportTicketsTable)
    .values({
      subject,
      body,
      priority,
      requesterId: req.userId!,
      // Stamp tenant from the requester so their org/partner staff can see it.
      partnerId: req.dbUser!.partnerId ?? null,
      organisationId: req.dbUser!.organisationId ?? null,
    })
    .returning();

  await audit(req, "ticket.create", ticket.id, { subject });
  res.status(201).json(ticketResponse(ticket));
});

/** GET /support/tickets?status= — scoped list. */
router.get("/support/tickets", requireAuth, async (req, res) => {
  const role = req.dbUser!.role;
  const status = String(req.query.status ?? "");

  const filters = [];
  if (VALID_STATUS.includes(status)) filters.push(eq(supportTicketsTable.status, status as any));

  if (role === "super_admin") {
    // sees all
  } else if (isStaff(role)) {
    // Tenant staff see tickets stamped to their partner (or, lacking a partner, their org).
    if (req.dbUser!.partnerId) filters.push(eq(supportTicketsTable.partnerId, req.dbUser!.partnerId));
    else if (req.dbUser!.organisationId)
      filters.push(eq(supportTicketsTable.organisationId, req.dbUser!.organisationId));
  } else {
    filters.push(eq(supportTicketsTable.requesterId, req.userId!));
  }

  const rows = await db
    .select({
      ticket: supportTicketsTable,
      requesterFirst: usersTable.firstName,
      requesterLast: usersTable.lastName,
      requesterEmail: usersTable.email,
    })
    .from(supportTicketsTable)
    .leftJoin(usersTable, eq(supportTicketsTable.requesterId, usersTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(supportTicketsTable.lastMessageAt))
    .limit(200);

  res.json(
    rows.map((r) =>
      ticketResponse(r.ticket, {
        requesterName: [r.requesterFirst, r.requesterLast].filter(Boolean).join(" ") || r.requesterEmail || "Unknown",
        requesterEmail: r.requesterEmail,
      }),
    ),
  );
});

/** GET /support/tickets/:id — ticket + thread. Internal notes hidden from the requester. */
router.get("/support/tickets/:id", requireAuth, async (req, res) => {
  const [ticket] = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.id, req.params.id))
    .limit(1);
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  const staff = isStaff(req.dbUser!.role);
  if (!staff && ticket.requesterId !== req.userId) {
    res.status(403).json({ error: "Not your ticket" });
    return;
  }

  const messageRows = await db
    .select({
      message: supportTicketMessagesTable,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
    })
    .from(supportTicketMessagesTable)
    .leftJoin(usersTable, eq(supportTicketMessagesTable.authorId, usersTable.id))
    .where(eq(supportTicketMessagesTable.ticketId, ticket.id))
    .orderBy(asc(supportTicketMessagesTable.createdAt));

  const messages = messageRows
    // Requesters never see internal notes.
    .filter((r) => staff || !r.message.isInternalNote)
    .map((r) => ({
      id: r.message.id,
      authorId: r.message.authorId,
      authorName: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || "Unknown",
      body: r.message.body,
      isStaffReply: r.message.isStaffReply,
      isInternalNote: r.message.isInternalNote,
      createdAt: r.message.createdAt.toISOString(),
    }));

  res.json({ ticket: ticketResponse(ticket), messages });
});

/** POST /support/tickets/:id/messages — reply. Requester or staff. */
router.post("/support/tickets/:id/messages", requireAuth, async (req, res) => {
  const body = String(req.body?.body ?? "").trim();
  if (!body) {
    res.status(400).json({ error: "Message body is required." });
    return;
  }

  const [ticket] = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.id, req.params.id))
    .limit(1);
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const staff = isStaff(req.dbUser!.role);
  if (!staff && ticket.requesterId !== req.userId) {
    res.status(403).json({ error: "Not your ticket" });
    return;
  }

  // Internal notes are staff-only and never notify the requester.
  const internal = staff && Boolean(req.body?.internalNote);

  await db.insert(supportTicketMessagesTable).values({
    ticketId: ticket.id,
    authorId: req.userId!,
    body,
    isStaffReply: staff,
    isInternalNote: internal,
  });

  // Status transitions on reply:
  //  - staff public reply -> pending (waiting on requester)
  //  - requester reply on a resolved/closed ticket -> reopened
  let nextStatus = ticket.status;
  if (!internal) {
    if (staff && (ticket.status === "open")) nextStatus = "pending";
    else if (!staff && (ticket.status === "resolved" || ticket.status === "closed")) nextStatus = "open";
  }

  await db
    .update(supportTicketsTable)
    .set({
      replyCount: sql`${supportTicketsTable.replyCount} + 1`,
      lastMessageAt: new Date(),
      updatedAt: new Date(),
      status: nextStatus,
    })
    .where(eq(supportTicketsTable.id, ticket.id));

  if (!internal) {
    const link = `/support/${ticket.id}`;
    if (staff) {
      await notify(ticket.requesterId, req.userId!, "Support replied", `Re: ${ticket.subject}`, link);
    } else if (ticket.assigneeId) {
      await notify(ticket.assigneeId, req.userId!, "Ticket updated", `Re: ${ticket.subject}`, link);
    }
  }

  res.status(201).json({ ok: true, status: nextStatus });
});

/** PATCH /support/tickets/:id — staff set status / priority / assignee. */
router.patch("/support/tickets/:id", requireAuth, requireStaff, async (req, res) => {
  const [ticket] = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.id, req.params.id))
    .limit(1);
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (req.body?.status !== undefined) {
    if (!VALID_STATUS.includes(req.body.status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    patch.status = req.body.status;
  }
  if (req.body?.priority !== undefined) {
    if (!VALID_PRIORITY.includes(req.body.priority)) {
      res.status(400).json({ error: "Invalid priority" });
      return;
    }
    patch.priority = req.body.priority;
  }
  if (req.body?.assigneeId !== undefined) patch.assigneeId = req.body.assigneeId || null;

  const [updated] = await db
    .update(supportTicketsTable)
    .set(patch)
    .where(eq(supportTicketsTable.id, ticket.id))
    .returning();

  await audit(req, "ticket.update", ticket.id, patch);

  // Tell the requester when their ticket's status changes.
  if (patch.status && patch.status !== ticket.status) {
    await notify(
      ticket.requesterId,
      req.userId!,
      "Ticket " + String(patch.status),
      ticket.subject,
      `/support/${ticket.id}`,
    );
  }

  res.json(ticketResponse(updated));
});

/** GET /support/overview — status counts for the staff queue header. */
router.get("/support/overview", requireAuth, requireStaff, async (req, res) => {
  const role = req.dbUser!.role;
  const scope = [];
  if (role !== "super_admin") {
    if (req.dbUser!.partnerId) scope.push(eq(supportTicketsTable.partnerId, req.dbUser!.partnerId));
    else if (req.dbUser!.organisationId)
      scope.push(eq(supportTicketsTable.organisationId, req.dbUser!.organisationId));
  }

  const [row] = await db
    .select({
      open: sql<number>`count(*) filter (where ${supportTicketsTable.status} = 'open')::int`,
      pending: sql<number>`count(*) filter (where ${supportTicketsTable.status} = 'pending')::int`,
      resolved: sql<number>`count(*) filter (where ${supportTicketsTable.status} = 'resolved')::int`,
      closed: sql<number>`count(*) filter (where ${supportTicketsTable.status} = 'closed')::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(supportTicketsTable)
    .where(scope.length ? and(...scope) : undefined);

  res.json(row);
});

export default router;
