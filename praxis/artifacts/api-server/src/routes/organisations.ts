import { Router } from "express";
import { db } from "@workspace/db";
import { organisationsTable, usersTable } from "@workspace/db";
import { eq, and, count, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { canAdministerOrg, canAccessOrg, canAssignRole, assignableRoles } from "../lib/roles";
import { logAudit } from "../lib/audit";
import { validateBody } from "../lib/validate";

const router = Router();

function toOrgResponse(o: typeof organisationsTable.$inferSelect) {
  return {
    id: o.id,
    name: o.name,
    partnerId: o.partnerId,
    industry: o.industry,
    memberCount: o.memberCount,
    createdAt: o.createdAt.toISOString(),
  };
}

function toUserResponse(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    clerkId: u.clerkId,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    avatarUrl: u.avatarUrl,
    role: u.role,
    partnerId: u.partnerId,
    organisationId: u.organisationId,
    createdAt: u.createdAt.toISOString(),
  };
}

// GET /organisations
router.get("/organisations", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  // Explicitly typed: `let orgs;` left TS unable to infer the type across the
  // branches (implicit any[]), which silently disabled type checking on the rows.
  let orgs: (typeof organisationsTable.$inferSelect)[];
  if (user.role === "super_admin") {
    orgs = await db.select().from(organisationsTable);
  } else if (user.partnerId) {
    orgs = await db
      .select()
      .from(organisationsTable)
      .where(eq(organisationsTable.partnerId, user.partnerId));
  } else {
    orgs = [];
  }
  res.json(orgs.map(toOrgResponse));
});

// POST /organisations
router.post("/organisations", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  if (!["super_admin", "partner_admin"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!validateBody(req, res, { name: { required: true, maxLength: 200 }, industry: { maxLength: 200 } })) return;
  const { name, industry } = req.body;
  const partnerId = user.partnerId!;
  const [org] = await db
    .insert(organisationsTable)
    .values({ name, industry, partnerId })
    .returning();
  res.status(201).json(toOrgResponse(org));
});

// GET /organisations/:orgId
router.get("/organisations/:orgId", requireAuth, async (req, res) => {
  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, req.params.orgId),
  });
  if (!org) { res.status(404).json({ error: "Not found" }); return; }
  if (!canAccessOrg(req.dbUser!, org)) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(toOrgResponse(org));
});

// PATCH /organisations/:orgId
router.patch("/organisations/:orgId", requireAuth, async (req, res) => {
  // Was requireAuth-only: any user (incl. a learner in another partner) could rename any org.
  const actor = req.dbUser!;
  if (!canAdministerOrg(actor.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, req.params.orgId) });
  if (!org) { res.status(404).json({ error: "Not found" }); return; }
  if (!canAccessOrg(actor, org)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { name, industry } = req.body;
  const [updated] = await db
    .update(organisationsTable)
    .set({ name, industry, updatedAt: new Date() })
    .where(eq(organisationsTable.id, req.params.orgId))
    .returning();
  res.json(toOrgResponse(updated));
});

// GET /organisations/:orgId/members
router.get("/organisations/:orgId/members", requireAuth, async (req, res) => {
  // Was requireAuth-only: any user could enumerate any org's roster (name/email/role) — PII leak.
  const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, req.params.orgId) });
  if (!org) { res.status(404).json({ error: "Not found" }); return; }
  if (!canAccessOrg(req.dbUser!, org)) { res.status(403).json({ error: "Forbidden" }); return; }
  // Bounded + paginated. No-param callers get the historical behaviour (up to 2000, now stably
  // ordered); ?limit/&offset page and ?search filters, with the true count in X-Total-Count so a
  // large org is never silently truncated. Body stays a plain array — every existing consumer is safe.
  const rawLimit = Number((req.query.limit as string) ?? 2000);
  const limit = Math.min(Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 2000), 2000);
  const rawOffset = Number((req.query.offset as string) ?? 0);
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);
  const search = String((req.query.search as string) ?? "").trim();
  const scope = eq(usersTable.organisationId, req.params.orgId);
  const where = search
    ? and(scope, sql`(coalesce(${usersTable.firstName}, '') || ' ' || coalesce(${usersTable.lastName}, '') || ' ' || ${usersTable.email}) ILIKE ${"%" + search + "%"}`)
    : scope;
  const [{ value: total }] = await db.select({ value: count() }).from(usersTable).where(where);
  res.setHeader("X-Total-Count", String(total));
  const members = await db
    .select()
    .from(usersTable)
    .where(where)
    .orderBy(desc(usersTable.updatedAt), usersTable.id)
    .limit(limit)
    .offset(offset);
  res.json(members.map(toUserResponse));
});

// POST /organisations/:orgId/members
router.post("/organisations/:orgId/members", requireAuth, async (req, res) => {
  const { email, role } = req.body;
  const user = req.dbUser!;

  // Tier + scope + assignment-ceiling gate (decision §4.2). Previously this route was
  // authentication-only: any signed-in user could add a member to any org with any role.
  if (!canAdministerOrg(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, req.params.orgId),
  });
  if (!org) { res.status(404).json({ error: "Organisation not found" }); return; }
  if (!canAccessOrg(user, org)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!validateBody(req, res, { email: { type: "email", required: true }, role: { required: true, maxLength: 40 } })) return;
  if (!canAssignRole(user.role, role)) {
    res.status(403).json({ error: `You may only assign: ${assignableRoles(user.role).join(", ")}` });
    return;
  }

  // Find or create user by email (in production you'd send an invite)
  let member = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, email),
  });
  if (!member) {
    // A real invite. Previously this minted a fake `clerkId: placeholder_<timestamp>`
    // purely to satisfy a NOT NULL column -- which meant invited users were
    // indistinguishable from real ones and could never actually sign in.
    //
    // Now: status "invited", no password. They become active by setting a password
    // through a reset link (issued from the platform console, or emailed once a mail
    // provider is configured).
    const [created] = await db
      .insert(usersTable)
      .values({
        email,
        role,
        status: "invited",
        // Own the new member to the ORG's partner, not the actor's — a Super Admin
        // acting here has no partnerId of their own.
        partnerId: org.partnerId,
        organisationId: req.params.orgId,
      })
      .returning();
    member = created;
  } else {
    const [updated] = await db
      .update(usersTable)
      .set({ role, organisationId: req.params.orgId, partnerId: org.partnerId })
      .where(eq(usersTable.id, member.id))
      .returning();
    member = updated;
  }
  await logAudit(req, "org.member_add", "user", member.id, { role, organisationId: req.params.orgId });
  res.status(201).json(toUserResponse(member));
});

// PATCH /organisations/:orgId/members/:userId — change role
router.patch("/organisations/:orgId/members/:userId", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  if (!canAdministerOrg(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, req.params.orgId),
  });
  if (!org) { res.status(404).json({ error: "Organisation not found" }); return; }
  if (!canAccessOrg(user, org)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { role } = req.body;
  // Enforce the assignment ceiling (decision §4.2): a Facilitator may set only coach or
  // learner; only a Super Admin may promote to a Facilitator/ID/Super Admin role.
  if (!canAssignRole(user.role, role)) {
    res.status(403).json({ error: `You may only assign: ${assignableRoles(user.role).join(", ")}` });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ role, updatedAt: new Date() })
    .where(and(eq(usersTable.id, req.params.userId), eq(usersTable.organisationId, req.params.orgId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Member not found" }); return; }
  await logAudit(req, "org.member_role_change", "user", req.params.userId, { role, organisationId: req.params.orgId });
  res.json(toUserResponse(updated));
});

// DELETE /organisations/:orgId/members/:userId — remove from org
router.delete("/organisations/:orgId/members/:userId", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  if (!canAdministerOrg(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, req.params.orgId),
  });
  if (!org) { res.status(404).json({ error: "Organisation not found" }); return; }
  if (!canAccessOrg(user, org)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db
    .update(usersTable)
    .set({ organisationId: null, updatedAt: new Date() })
    .where(and(eq(usersTable.id, req.params.userId), eq(usersTable.organisationId, req.params.orgId)));
  await logAudit(req, "org.member_remove", "user", req.params.userId, { organisationId: req.params.orgId });
  res.status(204).send();
});

// GET /organisations/:orgId/stats
router.get("/organisations/:orgId/stats", requireAuth, async (req, res) => {
  const { orgId } = req.params;
  // Was requireAuth-only: any user (incl. an admin in another tenant) could read
  // any org's member counts. Scope to the caller's tenant.
  const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, orgId) });
  if (!org) { res.status(404).json({ error: "Not found" }); return; }
  if (!canAccessOrg(req.dbUser!, org)) { res.status(403).json({ error: "Forbidden" }); return; }
  const [memberCount] = await db
    .select({ count: count() })
    .from(usersTable)
    .where(eq(usersTable.organisationId, orgId));

  res.json({
    orgId,
    totalMembers: Number(memberCount.count),
    activeEnrolments: 0,
    completions: 0,
    credentialsIssued: 0,
    avgMasteryScore: 0,
    competencyGaps: [],
  });
});

export default router;
