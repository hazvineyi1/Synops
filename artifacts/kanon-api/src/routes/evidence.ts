import { Router } from "express";
import type { Request, Response } from "express";
import { denyNoScope, resolveProjectScope } from "../lib/tenancy";
import { recordActorAudit } from "../lib/audit";
import { orgHasFeature, upgradeRequiredBody } from "../lib/billing";
import { loadEvidencePacket } from "../lib/evidence-packet/load";
import { renderEvidencePacketPdf } from "../lib/evidence-packet/pdf";
import { renderEvidencePacketDocx } from "../lib/evidence-packet/docx";

const router = Router();

/**
 * Plan-tier gate for the evidence packet (a Professional+ feature). Must run
 * AFTER denyNoScope so a project the actor cannot see stays a 404 and is never
 * probed via a 402. An org-bound actor that passed the read scope belongs to the
 * project's org, so we check that actor's own org entitlement; globals (internal
 * staff serving clients) bypass. Returns true and writes the 402 when blocked.
 */
async function denyWithoutEvidenceFeature(req: Request, res: Response): Promise<boolean> {
  const actor = req.actor!;
  if (actor.isGlobal) return false;
  if (actor.organizationId == null || !(await orgHasFeature(actor.organizationId, "multiAccreditorExport"))) {
    res.status(402).json(upgradeRequiredBody("multiAccreditorExport"));
    return true;
  }
  return false;
}

/**
 * One-click accreditation evidence packet for a project, exported as a binary
 * download. Two formats share one assembled model (see lib/evidence-packet).
 *
 * Security: these routes are mounted INSIDE the /compass engineRouter, so
 * requireAuth + requireProduct("compass") + loadActorContext already ran. Each
 * handler additionally org-scopes the project (cross-org / missing => 404 via
 * denyNoScope in "read" mode) so a packet can never disclose another tenant's
 * curriculum. Branding is taken from the data-owning org, never the request Host.
 */

/** Build a filesystem-safe, ASCII ascii download name from the project title. */
function downloadName(projectTitle: string, ext: string): string {
  const slug = projectTitle
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  const base = slug || "project";
  return `evidence-packet-${base}.${ext}`;
}

function parseProjectId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

router.get("/projects/:id/evidence-packet.pdf", async (req, res): Promise<void> => {
  const projectId = parseProjectId(req.params.id);
  if (projectId === null) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }

  if (
    await denyNoScope(res, req.actor!, await resolveProjectScope(projectId), "read", "Project not found")
  ) {
    return;
  }

  if (await denyWithoutEvidenceFeature(req, res)) return;

  const packet = await loadEvidencePacket(projectId);
  if (!packet) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const buffer = await renderEvidencePacketPdf(packet);

  await recordActorAudit(req.actor!, {
    action: "exported evidence packet (PDF)",
    entityType: "evidence_packet",
    entityTitle: packet.meta.title,
    projectId,
    projectTitle: packet.meta.projectTitle,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${downloadName(packet.meta.projectTitle, "pdf")}"`);
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Cache-Control", "no-store");
  res.end(buffer);
});

router.get("/projects/:id/evidence-packet.docx", async (req, res): Promise<void> => {
  const projectId = parseProjectId(req.params.id);
  if (projectId === null) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }

  if (
    await denyNoScope(res, req.actor!, await resolveProjectScope(projectId), "read", "Project not found")
  ) {
    return;
  }

  if (await denyWithoutEvidenceFeature(req, res)) return;

  const packet = await loadEvidencePacket(projectId);
  if (!packet) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const buffer = await renderEvidencePacketDocx(packet);

  await recordActorAudit(req.actor!, {
    action: "exported evidence packet (DOCX)",
    entityType: "evidence_packet",
    entityTitle: packet.meta.title,
    projectId,
    projectTitle: packet.meta.projectTitle,
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${downloadName(packet.meta.projectTitle, "docx")}"`);
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Cache-Control", "no-store");
  res.end(buffer);
});

export default router;
