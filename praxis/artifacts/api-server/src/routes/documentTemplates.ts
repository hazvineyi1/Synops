import { Router } from "express";
import { db } from "@workspace/db";
import { partnerDocumentsTable, partnersTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { auditDocumentContent } from "../lib/templateAudit";
import templatesData from "../data/documentTemplates.json";
import filesData from "../data/documentFiles.json";

/**
 * Standard document library (Synops's letterhead legal pack). The templates live on the platform
 * (baked, served here) so a super admin can view/send them, and can be SENT OUT to partners, which
 * files a real entry in each partner's Documents & Filing repository. Content is the on-platform
 * (HTML) version; the signable Word/PDF letterhead versions are managed alongside.
 */
const router = Router();

interface Template { key: string; title: string; docType: string; contentHtml: string }
const TEMPLATES = templatesData as Template[];
const byKey = (key: string) => TEMPLATES.find((t) => t.key === key);

// Map a template doc type to a partner_documents category (invoice|contract|funder|compliance|other).
function categoryFor(docType: string): string {
  if (["MSA", "MOU", "NDA", "SLA", "Partnership", "Order Form"].includes(docType)) return "contract";
  if (["DPA", "Policy"].includes(docType)) return "compliance";
  return "other";
}

async function ensureTemplateKey() {
  await db.execute(sql`ALTER TABLE partner_documents ADD COLUMN IF NOT EXISTS template_key text`);
}

// GET /platform/document-templates — the standard pack (super admin).
router.get("/platform/document-templates", requireAuth, requireRole("super_admin"), (_req, res) => {
  res.json(TEMPLATES.map(({ key, title, docType }) => ({ key, title, docType })));
});

// GET /document-templates/:key — a template's on-platform content (any authenticated user, so a
// partner can read a template that was sent to them).
router.get("/document-templates/:key", requireAuth, (req, res) => {
  const t = byKey(req.params.key);
  if (!t) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ key: t.key, title: t.title, docType: t.docType, contentHtml: t.contentHtml });
});

interface DocFile { docxName: string; pdfName: string; docx: string; pdf: string | null }
const FILES = filesData as Record<string, DocFile>;

// GET /document-templates/:key/download?format=docx|pdf — the real letterhead file (any authed user).
router.get("/document-templates/:key/download", requireAuth, (req, res) => {
  const f = FILES[req.params.key];
  if (!f) { res.status(404).json({ error: "Not found" }); return; }
  const fmt = req.query.format === "pdf" ? "pdf" : "docx";
  const b64 = fmt === "pdf" ? f.pdf : f.docx;
  if (!b64) { res.status(404).json({ error: "File not available" }); return; }
  const name = fmt === "pdf" ? f.pdfName : f.docxName;
  const mime = fmt === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const buf = Buffer.from(b64, "base64");
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.setHeader("Content-Length", String(buf.length));
  res.send(buf);
});

// POST /platform/document-templates/:key/send { partnerIds } — file this template into each partner's
// Documents & Filing repository (super admin).
router.post("/platform/document-templates/:key/send", requireAuth, requireRole("super_admin"), async (req, res) => {
  const t = byKey(req.params.key);
  if (!t) { res.status(404).json({ error: "Not found" }); return; }
  // Audit gate: never send a template that leaks internal infrastructure or
  // codenames to a client. A failing audit blocks the send with the findings so
  // a human fixes the content first.
  const findings = auditDocumentContent(t.contentHtml);
  if (findings.length) {
    res.status(422).json({
      error: "Template failed the client-safety audit and was not sent.",
      findings,
    });
    return;
  }
  const partnerIds = Array.isArray(req.body?.partnerIds)
    ? [...new Set((req.body.partnerIds as unknown[]).filter((p): p is string => typeof p === "string" && p.length > 0))]
    : [];
  if (!partnerIds.length) { res.status(400).json({ error: "Select at least one partner." }); return; }
  await ensureTemplateKey();
  // Skip partners that already have this exact template filed (avoid duplicates on re-send).
  const existing = await db
    .select({ partnerId: partnerDocumentsTable.partnerId })
    .from(partnerDocumentsTable)
    .where(eq(partnerDocumentsTable.templateKey, t.key));
  const already = new Set(existing.map((e) => e.partnerId));
  const targets = partnerIds.filter((p) => !already.has(p));
  if (targets.length) {
    await db.insert(partnerDocumentsTable).values(
      targets.map((partnerId) => ({
        partnerId,
        orgId: null,
        orgName: null,
        name: t.title,
        category: categoryFor(t.docType),
        status: "filed",
        size: "Template",
        templateKey: t.key,
        uploadedBy: req.dbUser!.id,
      })),
    );
  }
  await logAudit(req, "document_template.send", "document_template", t.key, { title: t.title, sent: targets.length });
  res.json({ sent: targets.length, skipped: partnerIds.length - targets.length });
});

// GET /platform/document-templates/:key/recipients — which partners already have it filed.
router.get("/platform/document-templates/:key/recipients", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const rows = await db
      .select({ partnerId: partnerDocumentsTable.partnerId })
      .from(partnerDocumentsTable)
      .where(eq(partnerDocumentsTable.templateKey, req.params.key));
    const ids = [...new Set(rows.map((r) => r.partnerId))];
    const names = ids.length ? await db.select({ id: partnersTable.id, name: partnersTable.name }).from(partnersTable).where(inArray(partnersTable.id, ids)) : [];
    res.json({ partnerIds: ids, partners: names });
  } catch {
    res.json({ partnerIds: [], partners: [] });
  }
});

export default router;
