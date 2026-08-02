import { Router } from "express";
import { db } from "@workspace/db";
import {
  interactiveActivitiesTable, coursesTable, partnersTable, organisationsTable,
  coursePartnerAssignmentsTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, desc } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/requireAuth";
import { GAME_TEMPLATES } from "../lib/gameTemplates";
import { logAudit } from "../lib/audit";

/**
 * Super-admin Content Catalog — the central place where platform content (games, activities, courses)
 * and the reusable game templates live, cleanly demarcated by owner so one partner's content never
 * mixes with another's. There is one shared "Platform Templates & Games" catalog (isLibrary items +
 * platform-owned courses + the game templates) plus one catalog per partner/organisation. From here a
 * super admin can build content centrally and DEPLOY it to a partner (a scoped copy), or author
 * directly INTO a partner's catalog. Every read is strictly scoped to the selected tenant.
 */
const router = Router();

const PLATFORM = "platform";

// The org ids that belong to a partner (so a partner catalog includes its organisations' content).
async function partnerOrgIds(partnerId: string): Promise<string[]> {
  const orgs = await db.select({ id: organisationsTable.id }).from(organisationsTable).where(eq(organisationsTable.partnerId, partnerId));
  return orgs.map((o) => o.id);
}

// GET /admin/catalog/tenants — the switcher: a shared Platform catalog + every partner (with its orgs).
router.get("/admin/catalog/tenants", requireAuth, requireSuperAdmin, async (_req, res) => {
  const [partners, orgs] = await Promise.all([
    db.select({ id: partnersTable.id, name: partnersTable.name, slug: partnersTable.slug }).from(partnersTable),
    db.select({ id: organisationsTable.id, name: organisationsTable.name, partnerId: organisationsTable.partnerId }).from(organisationsTable),
  ]);
  const orgsByPartner = new Map<string, { id: string; name: string }[]>();
  for (const o of orgs) { if (!o.partnerId) continue; const a = orgsByPartner.get(o.partnerId) ?? []; a.push({ id: o.id, name: o.name }); orgsByPartner.set(o.partnerId, a); }
  res.json({
    tenants: [
      { id: PLATFORM, name: "Platform Templates & Games", type: "platform", orgs: [] as { id: string; name: string }[] },
      ...partners.map((p) => ({ id: p.id, name: p.name, slug: p.slug, type: "partner", orgs: orgsByPartner.get(p.id) ?? [] })),
    ],
  });
});

function activityCard(a: typeof interactiveActivitiesTable.$inferSelect) {
  return {
    id: a.id, title: a.title, kind: a.kind, organisationId: a.organisationId, isLibrary: a.isLibrary,
    courseId: a.courseId, moduleId: a.moduleId, tags: a.tags, published: a.published,
    bloomsLevel: a.bloomsLevel, difficulty: a.difficulty, updatedAt: a.updatedAt,
  };
}

// GET /admin/catalog/:tenantId — content owned by / delivered to exactly this tenant, nothing else.
router.get("/admin/catalog/:tenantId", requireAuth, requireSuperAdmin, async (req, res) => {
  const tenantId = req.params.tenantId;
  const templates = GAME_TEMPLATES.map((t) => ({ key: t.key, name: t.name, blurb: t.blurb, bands: t.bands }));

  if (tenantId === PLATFORM) {
    const [acts, courses] = await Promise.all([
      db.select().from(interactiveActivitiesTable)
        .where(and(eq(interactiveActivitiesTable.isLibrary, true), isNull(interactiveActivitiesTable.organisationId)))
        .orderBy(desc(interactiveActivitiesTable.updatedAt)),
      db.select({ id: coursesTable.id, title: coursesTable.title, tenantId: coursesTable.tenantId, status: coursesTable.status })
        .from(coursesTable).where(eq(coursesTable.tenantId, PLATFORM)).orderBy(coursesTable.title),
    ]);
    res.json({ tenant: { id: PLATFORM, name: "Platform Templates & Games", type: "platform" }, templates, activities: acts.map(activityCard), courses });
    return;
  }

  // Resolve the tenant: a partner (include its orgs) or a single organisation.
  const partner = (await db.select().from(partnersTable).where(eq(partnersTable.id, tenantId)))[0];
  const org = partner ? null : (await db.select().from(organisationsTable).where(eq(organisationsTable.id, tenantId)))[0];
  if (!partner && !org) { res.status(404).json({ error: "Unknown tenant" }); return; }

  const ownerIds = partner ? [tenantId, ...(await partnerOrgIds(tenantId))] : [tenantId];

  // Activities owned by any of this tenant's ids.
  const acts = await db.select().from(interactiveActivitiesTable)
    .where(inArray(interactiveActivitiesTable.organisationId, ownerIds))
    .orderBy(desc(interactiveActivitiesTable.updatedAt));

  // Courses: tenant-owned (tenantId in ownerIds) PLUS, for a partner, courses assigned to it.
  const owned = await db.select({ id: coursesTable.id, title: coursesTable.title, tenantId: coursesTable.tenantId, status: coursesTable.status })
    .from(coursesTable).where(inArray(coursesTable.tenantId, ownerIds));
  let assignedIds: string[] = [];
  if (partner) {
    const rows = await db.select({ courseId: coursePartnerAssignmentsTable.courseId }).from(coursePartnerAssignmentsTable).where(eq(coursePartnerAssignmentsTable.partnerId, tenantId));
    assignedIds = rows.map((r) => r.courseId);
  }
  const ownedIds = new Set(owned.map((c) => c.id));
  const extraIds = assignedIds.filter((id) => !ownedIds.has(id));
  const assigned = extraIds.length
    ? await db.select({ id: coursesTable.id, title: coursesTable.title, tenantId: coursesTable.tenantId, status: coursesTable.status })
        .from(coursesTable).where(inArray(coursesTable.id, extraIds))
    : [];
  const courses = [...owned.map((c) => ({ ...c, delivery: "owned" })), ...assigned.map((c) => ({ ...c, delivery: "assigned" }))];

  res.json({
    tenant: { id: tenantId, name: (partner?.name ?? org?.name) as string, type: partner ? "partner" : "organisation" },
    templates, activities: acts.map(activityCard), courses,
  });
});

// POST /admin/catalog/deploy { activityId, targetTenantId } — deploy a game/activity to a partner:
// an isolated COPY owned by the target tenant. The source (often a platform-library item) is untouched.
router.post("/admin/catalog/deploy", requireAuth, requireSuperAdmin, async (req, res) => {
  const { activityId, targetTenantId } = req.body ?? {};
  if (!activityId || !targetTenantId || targetTenantId === PLATFORM) { res.status(400).json({ error: "activityId and a partner/org targetTenantId are required" }); return; }
  const src = (await db.select().from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.id, activityId)))[0];
  if (!src) { res.status(404).json({ error: "Activity not found" }); return; }
  const partner = (await db.select().from(partnersTable).where(eq(partnersTable.id, targetTenantId)))[0];
  const org = partner ? null : (await db.select().from(organisationsTable).where(eq(organisationsTable.id, targetTenantId)))[0];
  if (!partner && !org) { res.status(404).json({ error: "Unknown target tenant" }); return; }

  const [copy] = await db.insert(interactiveActivitiesTable).values({
    organisationId: targetTenantId, courseId: null, moduleId: null,
    title: src.title, instructions: src.instructions, html: src.html, source: src.source, kind: src.kind,
    bloomsLevel: src.bloomsLevel, difficulty: src.difficulty, maxScore: src.maxScore,
    isLibrary: false, tags: src.tags, published: src.published, createdByUserId: req.dbUser!.id,
  }).returning();
  await logAudit(req, "catalog.deploy", "activity", copy.id, { from: src.id, to: targetTenantId, title: src.title });
  res.status(201).json(activityCard(copy));
});

// POST /admin/catalog/activity { targetTenantId, title, ... } — author an activity directly INTO a
// tenant's catalog (or the shared platform library when targetTenantId = "platform").
router.post("/admin/catalog/activity", requireAuth, requireSuperAdmin, async (req, res) => {
  const b = req.body ?? {};
  if (!b.title || !b.targetTenantId) { res.status(400).json({ error: "title and targetTenantId are required" }); return; }
  const toPlatform = b.targetTenantId === PLATFORM;
  if (!toPlatform) {
    const partner = (await db.select({ id: partnersTable.id }).from(partnersTable).where(eq(partnersTable.id, b.targetTenantId)))[0];
    const org = partner ? null : (await db.select({ id: organisationsTable.id }).from(organisationsTable).where(eq(organisationsTable.id, b.targetTenantId)))[0];
    if (!partner && !org) { res.status(404).json({ error: "Unknown target tenant" }); return; }
  }
  const [row] = await db.insert(interactiveActivitiesTable).values({
    organisationId: toPlatform ? null : b.targetTenantId, courseId: null, moduleId: null,
    title: b.title, instructions: b.instructions ?? null, html: b.html ?? "", source: b.source ?? "html", kind: b.kind ?? "game",
    bloomsLevel: b.bloomsLevel ?? null, difficulty: b.difficulty ?? null,
    isLibrary: toPlatform, tags: b.tags ?? [], published: b.published ?? true, createdByUserId: req.dbUser!.id,
  }).returning();
  await logAudit(req, "catalog.authorForTenant", "activity", row.id, { tenant: b.targetTenantId, title: b.title });
  res.status(201).json(activityCard(row));
});

export default router;
