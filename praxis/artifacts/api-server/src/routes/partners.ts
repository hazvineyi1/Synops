import { Router } from "express";
import { db } from "@workspace/db";
import { partnersTable, usersTable, organisationsTable, auditEventsTable } from "@workspace/db";
import { eq, and, count, inArray, sql, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { isSuperAdmin, isFacilitator } from "../lib/roles";
import { validateBody } from "../lib/validate";

// Map an audit action onto the partner-audit category the UI colour-codes by.
function auditCategory(action: string): "financial" | "funder" | "account" | "impersonation" | "branding" {
  if (/^billing|invoice/i.test(action)) return "financial";
  if (/^funding|funder/i.test(action)) return "funder";
  if (/impersonat/i.test(action)) return "impersonation";
  if (/brand|theme/i.test(action)) return "branding";
  return "account";
}

const router = Router();

/**
 * Hard-delete a partner and EVERYTHING scoped to it: its organisations, all users under it, their
 * enrolments/progress/grades/coaching, its classes, org-scoped content, partner-owned courses, and
 * every partner-scoped record. The schema has no FK constraints (ids are joined in the app), so each
 * statement is independent and wrapped in try/catch - a table that does not exist is simply skipped.
 * Platform-owned courses (tenant_id 'platform', shared across partners) are NOT deleted; only the
 * partner's assignment to them is removed.
 */
async function deletePartnerCascade(pid: string): Promise<void> {
  const orgsSub = sql`(SELECT id FROM organisations WHERE partner_id = ${pid})`;
  const usersSub = sql`(SELECT id FROM users WHERE partner_id = ${pid} OR organisation_id IN ${orgsSub})`;
  const classSub = sql`(SELECT id FROM org_classes WHERE org_id IN ${orgsSub})`;
  const coursesSub = sql`(SELECT id FROM courses WHERE tenant_id = ${pid})`;
  const modulesSub = sql`(SELECT id FROM modules WHERE course_id IN ${coursesSub})`;

  const statements = [
    // Learner-scoped records.
    sql`DELETE FROM enrolments WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM beat_progress WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM assignment_submissions WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM submissions WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM activity_submissions WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM case_sessions WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM gradebook_entries WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM gradebook_cells WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM gradebook_alerts WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM coach_plans WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM attendance_records WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM notifications WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM auth_sessions WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM password_resets WHERE user_id IN ${usersSub}`,
    sql`DELETE FROM login_events WHERE user_id IN ${usersSub}`,
    // Classes.
    sql`DELETE FROM org_class_learners WHERE class_id IN ${classSub}`,
    sql`DELETE FROM org_class_courses WHERE class_id IN ${classSub}`,
    sql`DELETE FROM org_class_staff WHERE class_id IN ${classSub}`,
    sql`DELETE FROM org_classes WHERE org_id IN ${orgsSub}`,
    // Org-scoped content + delivery.
    sql`DELETE FROM delivery_sessions WHERE tenant_id IN ${orgsSub}`,
    sql`DELETE FROM interactive_activities WHERE organisation_id IN ${orgsSub}`,
    sql`DELETE FROM case_scenarios WHERE organisation_id IN ${orgsSub}`,
    // Partner-OWNED courses (not platform courses) and their content.
    sql`DELETE FROM beats WHERE module_id IN ${modulesSub}`,
    sql`DELETE FROM module_readings WHERE course_id IN ${coursesSub}`,
    sql`DELETE FROM modules WHERE course_id IN ${coursesSub}`,
    sql`DELETE FROM assignments WHERE course_id IN ${coursesSub}`,
    sql`DELETE FROM discussions WHERE course_id IN ${coursesSub}`,
    sql`DELETE FROM gradebook_items WHERE course_id IN ${coursesSub}`,
    sql`DELETE FROM courses WHERE tenant_id = ${pid}`,
    // Partner-scoped records.
    sql`DELETE FROM course_partner_assignments WHERE partner_id = ${pid}`,
    sql`DELETE FROM brand_themes WHERE tenant_id = ${pid} OR tenant_id IN ${orgsSub}`,
    sql`DELETE FROM delegated_admins WHERE partner_id = ${pid}`,
    sql`DELETE FROM funding_agreements WHERE partner_id = ${pid}`,
    sql`DELETE FROM funded_seat_assignments WHERE partner_id = ${pid}`,
    sql`DELETE FROM billing_subscriptions WHERE partner_id = ${pid}`,
    sql`DELETE FROM billing_invoices WHERE partner_id = ${pid}`,
    sql`DELETE FROM partner_documents WHERE partner_id = ${pid}`,
    sql`DELETE FROM partner_announcements WHERE partner_id = ${pid}`,
    sql`DELETE FROM platform_filings WHERE partner_id = ${pid}`,
    sql`DELETE FROM class_join_codes WHERE class_id IN ${classSub}`,
    // Finally: the users, the organisations, then the partner itself.
    sql`DELETE FROM users WHERE partner_id = ${pid} OR organisation_id IN ${orgsSub}`,
    sql`DELETE FROM organisations WHERE partner_id = ${pid}`,
    sql`DELETE FROM partners WHERE id = ${pid}`,
  ];
  for (const s of statements) {
    try { await db.execute(s); } catch { /* table absent or column drift - skip, others still run */ }
  }
}

function toPartnerResponse(p: typeof partnersTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.status,
    contactEmail: p.contactEmail,
    orgCount: p.orgCount,
    learnerCount: p.learnerCount,
    createdAt: p.createdAt.toISOString(),
  };
}

// GET /partners
router.get("/partners", requireAuth, requireRole("super_admin"), async (req, res) => {
  const partners = await db.select().from(partnersTable);
  // Compute learner/org counts LIVE — the stored partners.orgCount/learnerCount columns are
  // denormalised and never recomputed when learners are seeded/enrolled, so they read stale 0.
  // A learner may attach to a partner directly (partner_id) or via their organisation, so resolve
  // through both. Two grouped queries instead of the stale column.
  const orgById = new Map<string, number>();
  const learnerById = new Map<string, number>();
  try {
    const orgRows: any = await db.execute(sql`
      SELECT partner_id AS pid, COUNT(*)::int AS c FROM organisations
      WHERE partner_id IS NOT NULL GROUP BY partner_id`);
    for (const r of orgRows.rows ?? []) orgById.set(r.pid, Number(r.c));
    const learnerRows: any = await db.execute(sql`
      SELECT COALESCE(u.partner_id, o.partner_id) AS pid, COUNT(*)::int AS c
      FROM users u LEFT JOIN organisations o ON u.organisation_id = o.id
      WHERE u.role = 'learner' AND COALESCE(u.partner_id, o.partner_id) IS NOT NULL
      GROUP BY COALESCE(u.partner_id, o.partner_id)`);
    for (const r of learnerRows.rows ?? []) learnerById.set(r.pid, Number(r.c));
  } catch {
    /* fall back to stored columns below */
  }
  res.json(partners.map((p) => ({
    ...toPartnerResponse(p),
    orgCount: orgById.get(p.id) ?? p.orgCount ?? 0,
    learnerCount: learnerById.get(p.id) ?? p.learnerCount ?? 0,
  })));
});

// POST /partners
router.post("/partners", requireAuth, requireRole("super_admin"), async (req, res) => {
  if (!validateBody(req, res, {
    name: { required: true, maxLength: 200 },
    slug: { required: true, maxLength: 100 },
    contactEmail: { type: "email" },
  })) return;
  const { name, slug, contactEmail } = req.body;
  const [partner] = await db
    .insert(partnersTable)
    .values({ name, slug, contactEmail, status: "onboarding" })
    .returning();
  res.status(201).json(toPartnerResponse(partner));
});

// GET /partners/:partnerId
router.get("/partners/:partnerId", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  const user = req.dbUser!;
  // super_admin can see all; partner_admin can see own
  if (user.role !== "super_admin" && user.partnerId !== partnerId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const partner = await db.query.partnersTable.findFirst({
    where: eq(partnersTable.id, partnerId),
  });
  if (!partner) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(toPartnerResponse(partner));
});

// PATCH /partners/:partnerId
router.patch("/partners/:partnerId", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  const user = req.dbUser!;
  if (user.role !== "super_admin" && user.partnerId !== partnerId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { name, contactEmail, status } = req.body;
  const [updated] = await db
    .update(partnersTable)
    .set({ name, contactEmail, status, updatedAt: new Date() })
    .where(eq(partnersTable.id, partnerId))
    .returning();
  res.json(toPartnerResponse(updated));
});

// DELETE /partners/:partnerId — super admin only. Hard-deletes the partner and all its data.
router.delete("/partners/:partnerId", requireAuth, requireRole("super_admin"), async (req, res) => {
  const { partnerId } = req.params;
  const partner = await db.query.partnersTable.findFirst({ where: eq(partnersTable.id, partnerId) });
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
  await deletePartnerCascade(partnerId);
  res.json({ ok: true, deleted: partner.name });
});

// GET /partners/:partnerId/stats
router.get("/partners/:partnerId/stats", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  const user = req.dbUser!;
  if (user.role !== "super_admin" && user.partnerId !== partnerId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [orgCountResult] = await db
    .select({ count: count() })
    .from(organisationsTable)
    .where(eq(organisationsTable.partnerId, partnerId));
  const [learnerCountResult] = await db
    .select({ count: count() })
    .from(usersTable)
    .where(eq(usersTable.partnerId, partnerId));

  res.json({
    partnerId,
    totalLearners: Number(learnerCountResult.count),
    activeEnrolments: 0,
    credentialsIssued: 0,
    completionRate: 0,
    orgCount: Number(orgCountResult.count),
  });
});

// GET /partners/:partnerId/members — the real staff/learner accounts belonging to a partner
// (super admin sees any partner; a partner_admin sees their own). Powers the Accounts & Roles page.
router.get("/partners/:partnerId/members", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  const user = req.dbUser!;
  if (user.role !== "super_admin" && user.partnerId !== partnerId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  // Bounded + paginated. Callers that pass no params get the historical behaviour (up to 2000 rows,
  // now stably ordered); the Accounts roster opts into smaller pages with ?limit/&offset and an
  // optional ?search, and reads the true total from the X-Total-Count header so it can page/"load
  // more" without ever silently truncating a large partner.
  const rawLimit = Number((req.query.limit as string) ?? 2000);
  const limit = Math.min(Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 2000), 2000);
  const rawOffset = Number((req.query.offset as string) ?? 0);
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);
  const search = String((req.query.search as string) ?? "").trim();

  const scope = eq(usersTable.partnerId, partnerId);
  const where = search
    ? and(
        scope,
        sql`(coalesce(${usersTable.firstName}, '') || ' ' || coalesce(${usersTable.lastName}, '') || ' ' || ${usersTable.email}) ILIKE ${"%" + search + "%"}`,
      )
    : scope;

  const [{ value: total }] = await db.select({ value: count() }).from(usersTable).where(where);
  res.setHeader("X-Total-Count", String(total));

  const rows = await db
    .select()
    .from(usersTable)
    .where(where)
    .orderBy(desc(usersTable.updatedAt), usersTable.id)
    .limit(limit)
    .offset(offset);
  const orgIds = [...new Set(rows.map((r) => r.organisationId).filter((v): v is string => !!v))];
  const orgs = orgIds.length ? await db.select().from(organisationsTable).where(inArray(organisationsTable.id, orgIds)) : [];
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  res.json(
    rows.map((u) => ({
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
      email: u.email,
      role: u.role,
      status: u.status,
      // Soft-lifecycle flags (columns healed at boot; guard in case an old row predates them).
      archived: !!(u as { archivedAt?: Date | null }).archivedAt,
      deleted: !!(u as { deletedAt?: Date | null }).deletedAt,
      organisationId: u.organisationId,
      orgName: u.organisationId ? (orgName.get(u.organisationId) ?? null) : null,
      updatedAt: u.updatedAt.toISOString(),
    })),
  );
});

// GET /partners/:partnerId/audit — the real, append-only audit trail scoped to this partner (the
// events its own staff generated). Super admin sees any partner; a facilitator sees their own.
router.get("/partners/:partnerId/audit", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  const user = req.dbUser!;
  if (!(isSuperAdmin(user.role) || (isFacilitator(user.role) && user.partnerId === partnerId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const limit = Math.min(Number((req.query.limit as string) ?? 200), 500);
  let events: (typeof auditEventsTable.$inferSelect)[] = [];
  try {
    events = await db.select().from(auditEventsTable)
      .where(eq(auditEventsTable.partnerId, partnerId))
      .orderBy(desc(auditEventsTable.createdAt))
      .limit(limit);
  } catch { events = []; }

  // Resolve actor names in one query.
  const actorIds = [...new Set(events.map((e) => e.actorId).filter((v): v is string => !!v))];
  const actors = actorIds.length ? await db.select().from(usersTable).where(inArray(usersTable.id, actorIds)) : [];
  const actorName = new Map(actors.map((a) => [a.id, [a.firstName, a.lastName].filter(Boolean).join(" ") || a.email]));

  res.json(events.map((e) => {
    let detail = e.resourceType + (e.resourceId ? ` · ${e.resourceId}` : "");
    if (e.metadata) { try { const m = JSON.parse(e.metadata); detail = Object.entries(m).map(([k, v]) => `${k}: ${v}`).join(", ") || detail; } catch { /* keep default */ } }
    return {
      id: e.id,
      at: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
      category: auditCategory(e.action),
      actor: (e.actorId && actorName.get(e.actorId)) || "System",
      actorRole: e.actorRole ?? "",
      action: e.action,
      detail,
    };
  }));
});

export default router;
