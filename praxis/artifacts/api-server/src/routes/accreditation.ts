import { Router } from "express";
import { db } from "@workspace/db";
import { organisationsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { hasHubAccess, canAdministerOrg, canAccessOrg, isSuperAdmin, type ScopedUser } from "../lib/roles";
import { logAudit } from "../lib/audit";
import { buildAccreditationReport } from "../lib/accreditationEngine";
import { buildWorkbook, buildPdf } from "../lib/accreditationExport";

const router = Router();

type U = ScopedUser & { id: string };

/** Orgs the actor may run an accreditation export for (super/hub: all; facilitator: own). */
router.get("/accreditation/organisations", requireAuth, async (req, res) => {
  const u = req.dbUser as U;
  const all = await db.select({ id: organisationsTable.id, name: organisationsTable.name, partnerId: organisationsTable.partnerId }).from(organisationsTable);
  const visible = hasHubAccess(u.role)
    ? all
    : all.filter((o) => canAdministerOrg(u.role) && canAccessOrg(u, o));
  res.json(visible.map((o) => ({ id: o.id, name: o.name })));
});

async function authorise(req: any, res: any, orgId: string): Promise<boolean> {
  const u = req.dbUser as U;
  const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, orgId) });
  if (!org) { res.status(404).json({ error: "Organisation not found" }); return false; }
  const allowed = hasHubAccess(u.role) || (canAdministerOrg(u.role) && canAccessOrg(u, org));
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return false; }
  return true;
}

// JSON preview of the readiness report.
router.get("/organisations/:orgId/accreditation-report", requireAuth, async (req, res) => {
  if (!(await authorise(req, res, req.params.orgId))) return;
  const report = await buildAccreditationReport(req.params.orgId);
  res.json(report);
});

// Excel download.
router.get("/organisations/:orgId/accreditation-export.xlsx", requireAuth, async (req, res) => {
  if (!(await authorise(req, res, req.params.orgId))) return;
  const report = await buildAccreditationReport(req.params.orgId);
  const buf = await buildWorkbook(report);
  await logAudit(req, "compliance.export_download", "organisation", req.params.orgId, { format: "xlsx" });
  const fname = `accreditation-readiness-${slug(report.org.name)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
  res.end(buf);
});

// PDF download.
router.get("/organisations/:orgId/accreditation-export.pdf", requireAuth, async (req, res) => {
  if (!(await authorise(req, res, req.params.orgId))) return;
  const report = await buildAccreditationReport(req.params.orgId);
  const buf = await buildPdf(report);
  await logAudit(req, "compliance.export_download", "organisation", req.params.orgId, { format: "pdf" });
  const fname = `accreditation-readiness-${slug(report.org.name)}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
  res.end(buf);
});

function slug(s: string): string {
  return (s || "org").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";
}

export default router;
