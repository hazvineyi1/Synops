import { Router } from "express";
import { and, count, eq, inArray } from "drizzle-orm";
import {
  db,
  organizationsTable,
  clientsTable,
  projectsTable,
  coursesTable,
  classesTable,
  usersTable,
  allocationsTable,
} from "@workspace/compass-db";
import {
  GetSchoolReportQueryParams,
  GetSchoolReportMarkdownQueryParams,
} from "@workspace/compass-api-zod";
import { resolveManagedOrg, denyUnmanagedOrg } from "../lib/tenancy";

const router = Router();

const STAGE_LABELS = [
  "Kickoff & Intake",
  "Backward Design",
  "QA & Accessibility",
  "Handoff",
];

interface SchoolReport {
  organization: { id: number; name: string; slug: string; type: string };
  generatedAt: string;
  totals: {
    clients: number;
    projects: number;
    activeProjects: number;
    courses: number;
    classes: number;
    builders: number;
    activeAllocations: number;
  };
  projectsByStage: { stage: number; label: string; count: number }[];
  builders: {
    id: number;
    name: string;
    email: string;
    status: string;
    activeAllocations: number;
    allocationsByScope: { project: number; course: number; class: number };
  }[];
}

// Compile a per-organization rollup of curriculum scale and builder activity.
async function buildSchoolReport(orgId: number): Promise<SchoolReport | null> {
  const [org] = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      slug: organizationsTable.slug,
      type: organizationsTable.type,
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId));
  if (!org) return null;

  const clients = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(eq(clientsTable.organizationId, orgId));
  const clientIds = clients.map((c) => c.id);

  const projects = clientIds.length
    ? await db
        .select({ id: projectsTable.id, stage: projectsTable.stage, status: projectsTable.status })
        .from(projectsTable)
        .where(inArray(projectsTable.clientId, clientIds))
    : [];
  const projectIds = projects.map((p) => p.id);

  const courses = projectIds.length
    ? await db
        .select({ id: coursesTable.id })
        .from(coursesTable)
        .where(inArray(coursesTable.projectId, projectIds))
    : [];
  const courseIds = courses.map((c) => c.id);

  const classesCount = courseIds.length
    ? Number(
        (
          await db
            .select({ c: count() })
            .from(classesTable)
            .where(inArray(classesTable.courseId, courseIds))
        )[0].c,
      )
    : 0;

  const builders = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, status: usersTable.status })
    .from(usersTable)
    .where(and(eq(usersTable.role, "builder"), eq(usersTable.organizationId, orgId)))
    .orderBy(usersTable.name);

  const allocs = await db
    .select({ builderUserId: allocationsTable.builderUserId, scopeType: allocationsTable.scopeType })
    .from(allocationsTable)
    .where(and(eq(allocationsTable.organizationId, orgId), eq(allocationsTable.status, "active")));

  const stageMap = new Map<number, number>();
  for (const p of projects) stageMap.set(p.stage, (stageMap.get(p.stage) ?? 0) + 1);
  const projectsByStage = STAGE_LABELS.map((label, idx) => ({
    stage: idx,
    label,
    count: stageMap.get(idx) ?? 0,
  }));

  const buildersOut = builders.map((b) => {
    const mine = allocs.filter((a) => a.builderUserId === b.id);
    const byScope = { project: 0, course: 0, class: 0 };
    for (const a of mine) {
      if (a.scopeType === "project") byScope.project += 1;
      else if (a.scopeType === "course") byScope.course += 1;
      else if (a.scopeType === "class") byScope.class += 1;
    }
    return {
      id: b.id,
      name: b.name,
      email: b.email,
      status: b.status,
      activeAllocations: mine.length,
      allocationsByScope: byScope,
    };
  });

  return {
    organization: org,
    generatedAt: new Date().toISOString(),
    totals: {
      clients: clientIds.length,
      projects: projects.length,
      activeProjects: projects.filter((p) => p.status === "active").length,
      courses: courseIds.length,
      classes: classesCount,
      builders: builders.length,
      activeAllocations: allocs.length,
    },
    projectsByStage,
    builders: buildersOut,
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

function renderMarkdown(r: SchoolReport): string {
  const orgName = mdEscape(r.organization.name);
  const orgSlug = mdEscape(r.organization.slug);
  const orgType = mdEscape(r.organization.type);

  const lines: string[] = [
    `# School Report: ${orgName}`,
    "",
    `Generated: ${r.generatedAt}`,
    `Organization: ${orgName} (${orgSlug}, ${orgType})`,
    "",
    "## Totals",
    "",
    "| Metric | Count |",
    "| --- | --- |",
    `| Clients | ${r.totals.clients} |`,
    `| Projects | ${r.totals.projects} |`,
    `| Active projects | ${r.totals.activeProjects} |`,
    `| Courses | ${r.totals.courses} |`,
    `| Classes | ${r.totals.classes} |`,
    `| Builders | ${r.totals.builders} |`,
    `| Active allocations | ${r.totals.activeAllocations} |`,
    "",
    "## Projects by stage",
    "",
    "| Stage | Count |",
    "| --- | --- |",
    ...r.projectsByStage.map((s) => `| ${s.label} | ${s.count} |`),
    "",
    "## Builders",
    "",
  ];

  if (r.builders.length === 0) {
    lines.push("No builders provisioned.");
  } else {
    lines.push("| Builder | Email | Status | Active allocations | Projects | Courses | Classes |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const b of r.builders) {
      lines.push(
        `| ${mdEscape(b.name)} | ${mdEscape(b.email)} | ${mdEscape(b.status)} | ${b.activeAllocations} | ${b.allocationsByScope.project} | ${b.allocationsByScope.course} | ${b.allocationsByScope.class} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

router.get("/school/report", async (req, res): Promise<void> => {
  const query = GetSchoolReportQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const managed = resolveManagedOrg(req.actor!, query.data.organizationId ?? null, { requireConcrete: true });
  if (denyUnmanagedOrg(res, managed)) return;
  if (managed.kind !== "org") return;

  const report = await buildSchoolReport(managed.orgId);
  if (!report) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  res.json(report);
});

router.get("/school/report.md", async (req, res): Promise<void> => {
  const query = GetSchoolReportMarkdownQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const managed = resolveManagedOrg(req.actor!, query.data.organizationId ?? null, { requireConcrete: true });
  if (denyUnmanagedOrg(res, managed)) return;
  if (managed.kind !== "org") return;

  const report = await buildSchoolReport(managed.orgId);
  if (!report) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  res.type("text/markdown").send(renderMarkdown(report));
});

export default router;
