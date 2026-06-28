import { Router, type RequestHandler } from "express";
import { count, eq, inArray, type SQL } from "drizzle-orm";
import { type PgTable } from "drizzle-orm/pg-core";
import {
  db,
  organizationsTable,
  usersTable,
  clientsTable,
  projectsTable,
  coursesTable,
  modulesTable,
  classesTable,
  objectivesTable,
  assessmentsTable,
  activitiesTable,
  qaChecksTable,
  crosswalkLinksTable,
  allocationsTable,
} from "@workspace/kanon-db";
import {
  GetScopeStatsQueryParams,
  UpdateOrganizationBrandingParams,
  UpdateOrganizationBrandingBody,
} from "@workspace/kanon-api-zod";
import {
  resolveProjectScope,
  resolveCourseScope,
  resolveClassScope,
  denyNoScope,
  actorCanAccessOrg,
  denyBuilderWrite,
  type ScopeRef,
} from "../lib/tenancy";
import { isValidAccentColor, isValidLogoUrl, isValidDomain, normalizeHost } from "../lib/branding";
import { blockWhileImpersonating } from "../lib/auth";
import {
  orgHasFeature,
  upgradeRequiredBody,
  planFor,
  type OrgBilling,
  type PlanFeatures,
  type PlanTier,
} from "../lib/billing";

/**
 * Super-admin console + per-scope analytics + white-label branding management.
 * Mounted INSIDE the /compass engineRouter, so requireAuth -> requireProduct
 * ("compass") -> loadActorContext already ran and req.actor is populated.
 *
 * Authorization within this router:
 *  - /admin/overview and /admin/report.md are cross-organization, so they are
 *    GLOBAL-only (admin/super_admin). requireProduct lets school_admin/builder
 *    through the engine gate, so we re-check actor.isGlobal here.
 *  - /stats/scope is org- and allocation-scoped through denyNoScope (read).
 *  - branding management is org-scoped: a global admin may edit any org; a
 *    school_admin only their own org; the domain field is global-only.
 */
const router = Router();

const requireGlobal: RequestHandler = (req, res, next) => {
  if (!req.actor?.isGlobal) {
    res.status(403).json({ error: "This view is restricted to platform administrators." });
    return;
  }
  next();
};

// ── Cross-organization platform overview ────────────────────────────────────

interface CountByKey {
  key: string;
  count: number;
}

interface OrgOverview {
  id: number;
  name: string;
  slug: string;
  type: string;
  // Effective entitlement view (derived from billing state, never the raw
  // planTier) so admins can see why a tenant action is gated.
  tier: PlanTier;
  planLabel: string;
  subscriptionStatus: string;
  features: PlanFeatures;
  domain: string | null;
  accentColor: string | null;
  tagline: string | null;
  logoUrl: string | null;
  users: number;
  clients: number;
  projects: number;
  activeProjects: number;
  courses: number;
  classes: number;
  builders: number;
  activeAllocations: number;
}

interface PlatformOverview {
  generatedAt: string;
  totals: {
    organizations: number;
    users: number;
    clients: number;
    projects: number;
    activeProjects: number;
    courses: number;
    classes: number;
    builders: number;
    activeAllocations: number;
  };
  usersByRole: CountByKey[];
  usersByProduct: CountByKey[];
  organizations: OrgOverview[];
}

function tally(values: (string | null | undefined)[], fallback = "none"): CountByKey[] {
  const map = new Map<string, number>();
  for (const v of values) {
    const key = v && v.length > 0 ? v : fallback;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, c]) => ({ key, count: c }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

async function buildPlatformOverview(): Promise<PlatformOverview> {
  const orgs = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      slug: organizationsTable.slug,
      type: organizationsTable.type,
      domain: organizationsTable.domain,
      accentColor: organizationsTable.accentColor,
      tagline: organizationsTable.tagline,
      logoUrl: organizationsTable.logoUrl,
      planTier: organizationsTable.planTier,
      subscriptionStatus: organizationsTable.subscriptionStatus,
      trialEndsAt: organizationsTable.trialEndsAt,
      currentPeriodEnd: organizationsTable.currentPeriodEnd,
    })
    .from(organizationsTable)
    .orderBy(organizationsTable.name);

  const users = await db
    .select({ organizationId: usersTable.organizationId, role: usersTable.role, productKey: usersTable.productKey })
    .from(usersTable);
  const clients = await db
    .select({ id: clientsTable.id, organizationId: clientsTable.organizationId })
    .from(clientsTable);
  const projects = await db
    .select({ id: projectsTable.id, clientId: projectsTable.clientId, status: projectsTable.status })
    .from(projectsTable);
  const courses = await db
    .select({ id: coursesTable.id, projectId: coursesTable.projectId })
    .from(coursesTable);
  const classes = await db
    .select({ id: classesTable.id, courseId: classesTable.courseId })
    .from(classesTable);
  const allocs = await db
    .select({ organizationId: allocationsTable.organizationId })
    .from(allocationsTable)
    .where(eq(allocationsTable.status, "active"));

  // Trace every curriculum entity back to its owning organization.
  const clientOrg = new Map(clients.map((c) => [c.id, c.organizationId]));
  const projectOrg = new Map<number, number | null>();
  for (const p of projects) projectOrg.set(p.id, clientOrg.get(p.clientId) ?? null);
  const courseOrg = new Map<number, number | null>();
  for (const c of courses) courseOrg.set(c.id, projectOrg.get(c.projectId) ?? null);

  const organizations: OrgOverview[] = orgs.map((org) => {
    const orgProjects = projects.filter((p) => projectOrg.get(p.id) === org.id);
    const orgCourseIds = new Set(courses.filter((c) => courseOrg.get(c.id) === org.id).map((c) => c.id));
    const billing: OrgBilling = {
      id: org.id,
      type: org.type,
      planTier: org.planTier,
      subscriptionStatus: org.subscriptionStatus,
      trialEndsAt: org.trialEndsAt,
      currentPeriodEnd: org.currentPeriodEnd,
    };
    const plan = planFor(billing);
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.type,
      tier: plan.tier,
      planLabel: plan.label,
      subscriptionStatus: org.subscriptionStatus,
      features: plan.features,
      domain: org.domain,
      accentColor: org.accentColor,
      tagline: org.tagline,
      logoUrl: org.logoUrl,
      users: users.filter((u) => u.organizationId === org.id).length,
      clients: clients.filter((c) => c.organizationId === org.id).length,
      projects: orgProjects.length,
      activeProjects: orgProjects.filter((p) => p.status === "active").length,
      courses: orgCourseIds.size,
      classes: classes.filter((cl) => orgCourseIds.has(cl.courseId)).length,
      builders: users.filter((u) => u.organizationId === org.id && u.role === "builder").length,
      activeAllocations: allocs.filter((a) => a.organizationId === org.id).length,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      organizations: orgs.length,
      users: users.length,
      clients: clients.length,
      projects: projects.length,
      activeProjects: projects.filter((p) => p.status === "active").length,
      courses: courses.length,
      classes: classes.length,
      builders: users.filter((u) => u.role === "builder").length,
      activeAllocations: allocs.length,
    },
    usersByRole: tally(users.map((u) => u.role)),
    usersByProduct: tally(users.map((u) => u.productKey)),
    organizations,
  };
}

function mdEscape(text: string): string {
  return String(text)
    .replace(/\r?\n|\r/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/!/g, "\\!")
    .replace(/\|/g, "&#124;")
    .replace(/`/g, "\\`")
    .replace(/\*/g, "\\*")
    .replace(/#/g, "\\#");
}

function renderPlatformMarkdown(o: PlatformOverview): string {
  const lines: string[] = [
    "# Platform Overview",
    "",
    `Generated: ${o.generatedAt}`,
    "",
    "## Totals",
    "",
    "| Metric | Count |",
    "| --- | --- |",
    `| Organizations | ${o.totals.organizations} |`,
    `| Users | ${o.totals.users} |`,
    `| Clients | ${o.totals.clients} |`,
    `| Projects | ${o.totals.projects} |`,
    `| Active projects | ${o.totals.activeProjects} |`,
    `| Courses | ${o.totals.courses} |`,
    `| Classes | ${o.totals.classes} |`,
    `| Builders | ${o.totals.builders} |`,
    `| Active allocations | ${o.totals.activeAllocations} |`,
    "",
    "## Users by role",
    "",
    "| Role | Count |",
    "| --- | --- |",
    ...o.usersByRole.map((r) => `| ${mdEscape(r.key)} | ${r.count} |`),
    "",
    "## Users by product",
    "",
    "| Product | Count |",
    "| --- | --- |",
    ...o.usersByProduct.map((r) => `| ${mdEscape(r.key)} | ${r.count} |`),
    "",
    "## Organizations",
    "",
    "| Organization | Type | Plan | Users | Clients | Projects | Active | Courses | Classes | Builders | Active allocations |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...o.organizations.map(
      (org) =>
        `| ${mdEscape(org.name)} | ${mdEscape(org.type)} | ${mdEscape(org.planLabel)} | ${org.users} | ${org.clients} | ${org.projects} | ${org.activeProjects} | ${org.courses} | ${org.classes} | ${org.builders} | ${org.activeAllocations} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

router.get("/admin/overview", requireGlobal, async (_req, res): Promise<void> => {
  res.json(await buildPlatformOverview());
});

router.get("/admin/report.md", requireGlobal, async (_req, res): Promise<void> => {
  const overview = await buildPlatformOverview();
  res.type("text/markdown").send(renderPlatformMarkdown(overview));
});

// Cross-organization user directory, used by the console's impersonation picker.
// Global-only; impersonation itself is further restricted to super_admin in
// routes/impersonation.ts.
router.get("/admin/users", requireGlobal, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      productKey: usersTable.productKey,
      status: usersTable.status,
      organizationId: usersTable.organizationId,
      organizationName: organizationsTable.name,
    })
    .from(usersTable)
    .leftJoin(organizationsTable, eq(usersTable.organizationId, organizationsTable.id))
    .orderBy(usersTable.name);
  res.json(rows);
});

// Organization directory. Global roles only. Lets a global admin (who is not
// bound to an org) pick a tenant when creating a client. Returns only neutral
// presentational fields; never grants access.
router.get("/admin/organizations", requireGlobal, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      slug: organizationsTable.slug,
      type: organizationsTable.type,
    })
    .from(organizationsTable)
    .orderBy(organizationsTable.name);
  res.json(rows);
});

// ── Per-scope rollup statistics ─────────────────────────────────────────────

async function countWhere(table: PgTable, where: SQL | undefined): Promise<number> {
  const [row] = await db.select({ c: count() }).from(table).where(where);
  return Number(row?.c ?? 0);
}

router.get("/stats/scope", async (req, res): Promise<void> => {
  const query = GetScopeStatsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "scopeType and scopeId are required." });
    return;
  }
  const { scopeType, scopeId } = query.data;

  let scope: ScopeRef | null;
  if (scopeType === "project") scope = await resolveProjectScope(scopeId);
  else if (scopeType === "course") scope = await resolveCourseScope(scopeId);
  else scope = await resolveClassScope(scopeId);

  if (await denyNoScope(res, req.actor!, scope, "read", "Scope not found")) return;
  if (!scope) return; // already handled by denyNoScope; narrows the type

  const totals = {
    courses: 0,
    modules: 0,
    objectives: 0,
    assessments: 0,
    activities: 0,
    classes: 0,
    crosswalkLinks: 0,
    qaChecks: 0,
  };
  let name = "";

  if (scopeType === "project") {
    const [proj] = await db
      .select({ title: projectsTable.title })
      .from(projectsTable)
      .where(eq(projectsTable.id, scopeId));
    name = proj?.title ?? "";

    const courseRows = await db
      .select({ id: coursesTable.id })
      .from(coursesTable)
      .where(eq(coursesTable.projectId, scopeId));
    const courseIds = courseRows.map((c) => c.id);

    totals.courses = courseIds.length;
    totals.objectives = await countWhere(objectivesTable, eq(objectivesTable.projectId, scopeId));
    totals.crosswalkLinks = await countWhere(crosswalkLinksTable, eq(crosswalkLinksTable.projectId, scopeId));
    totals.qaChecks = await countWhere(qaChecksTable, eq(qaChecksTable.projectId, scopeId));
    if (courseIds.length) {
      totals.modules = await countWhere(modulesTable, inArray(modulesTable.courseId, courseIds));
      totals.assessments = await countWhere(assessmentsTable, inArray(assessmentsTable.courseId, courseIds));
      totals.activities = await countWhere(activitiesTable, inArray(activitiesTable.courseId, courseIds));
      totals.classes = await countWhere(classesTable, inArray(classesTable.courseId, courseIds));
    }
  } else if (scopeType === "course") {
    const [course] = await db
      .select({ title: coursesTable.title })
      .from(coursesTable)
      .where(eq(coursesTable.id, scopeId));
    name = course?.title ?? "";

    totals.modules = await countWhere(modulesTable, eq(modulesTable.courseId, scopeId));
    totals.assessments = await countWhere(assessmentsTable, eq(assessmentsTable.courseId, scopeId));
    totals.activities = await countWhere(activitiesTable, eq(activitiesTable.courseId, scopeId));
    totals.classes = await countWhere(classesTable, eq(classesTable.courseId, scopeId));
  } else {
    const [cls] = await db
      .select({ name: classesTable.name })
      .from(classesTable)
      .where(eq(classesTable.id, scopeId));
    name = cls?.name ?? "";
  }

  res.json({ scopeType, scopeId, name, totals });
});

// ── White-label branding management ─────────────────────────────────────────

router.patch("/admin/organizations/:id/branding", blockWhileImpersonating, async (req, res): Promise<void> => {
  const params = UpdateOrganizationBrandingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid organization id." });
    return;
  }
  const orgId = params.data.id;
  const actor = req.actor!;

  // Builders cannot manage branding; a school_admin may only touch their own org
  // (cross-org reported as not found so existence is not leaked).
  if (denyBuilderWrite(res, actor)) return;
  if (!actorCanAccessOrg(actor, orgId)) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const body = UpdateOrganizationBrandingBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const data = body.data;

  const update: Partial<{
    name: string;
    tagline: string | null;
    accentColor: string | null;
    logoUrl: string | null;
    domain: string | null;
  }> = {};

  if (data.name !== undefined) update.name = data.name;
  if (data.tagline !== undefined) update.tagline = data.tagline ?? null;

  if (data.accentColor !== undefined) {
    if (data.accentColor != null && !isValidAccentColor(data.accentColor)) {
      res.status(400).json({ error: "accentColor must be a hex color, for example #0a7c5b." });
      return;
    }
    update.accentColor = data.accentColor ?? null;
  }

  if (data.logoUrl !== undefined) {
    if (data.logoUrl != null && !isValidLogoUrl(data.logoUrl)) {
      res.status(400).json({ error: "logoUrl must be an https URL or a site-relative path." });
      return;
    }
    update.logoUrl = data.logoUrl ?? null;
  }

  if (data.domain !== undefined) {
    // The domain controls public branding resolution platform-wide, so only a
    // global admin may change it; a school_admin cannot self-assign a domain.
    if (!actor.isGlobal) {
      res.status(403).json({ error: "Only a platform administrator can change the domain." });
      return;
    }
    if (data.domain == null || data.domain === "") {
      update.domain = null;
    } else {
      const normalized = normalizeHost(data.domain);
      if (!normalized || !isValidDomain(normalized)) {
        res.status(400).json({ error: "domain must be a valid hostname, for example school.example.org." });
        return;
      }
      const [clash] = await db
        .select({ id: organizationsTable.id })
        .from(organizationsTable)
        .where(eq(organizationsTable.domain, normalized));
      if (clash && clash.id !== orgId) {
        res.status(409).json({ error: "That domain is already assigned to another organization." });
        return;
      }
      update.domain = normalized;
    }
  }

  const selection = {
    id: organizationsTable.id,
    name: organizationsTable.name,
    slug: organizationsTable.slug,
    type: organizationsTable.type,
    accentColor: organizationsTable.accentColor,
    tagline: organizationsTable.tagline,
    logoUrl: organizationsTable.logoUrl,
    domain: organizationsTable.domain,
  };

  // No-op patch: return the current branding rather than issuing an empty UPDATE.
  // Kept BEFORE the entitlement gate so a no-op save is never refused.
  if (Object.keys(update).length === 0) {
    const [current] = await db.select(selection).from(organizationsTable).where(eq(organizationsTable.id, orgId));
    if (!current) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }
    res.json(current);
    return;
  }

  // Plan-tier feature gating. Cosmetic white-label fields require the whiteLabel
  // entitlement for org-bound admins; globals configure on behalf of clients and
  // bypass (consistent with quota bypass). Assigning a non-empty custom domain
  // requires the customDomain entitlement on the TARGET org even for globals,
  // since the domain is durable tenant config, not throughput; clearing a domain
  // is always allowed (so a downgraded org can still remove its host).
  const cosmeticChanging =
    update.name !== undefined ||
    update.tagline !== undefined ||
    update.accentColor !== undefined ||
    update.logoUrl !== undefined;
  if (cosmeticChanging && !actor.isGlobal && !(await orgHasFeature(orgId, "whiteLabel"))) {
    res.status(402).json(upgradeRequiredBody("whiteLabel"));
    return;
  }
  if (
    typeof update.domain === "string" &&
    update.domain.length > 0 &&
    !(await orgHasFeature(orgId, "customDomain"))
  ) {
    res.status(402).json(upgradeRequiredBody("customDomain"));
    return;
  }

  const [org] = await db
    .update(organizationsTable)
    .set(update)
    .where(eq(organizationsTable.id, orgId))
    .returning(selection);

  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  req.log.info(
    { actorUserId: actor.userId, organizationId: orgId, fields: Object.keys(update) },
    "Organization branding updated",
  );
  res.json(org);
});

export default router;
