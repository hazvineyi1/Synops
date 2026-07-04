import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, ledgerEntriesTable } from "@workspace/compass-db";
import {
  ListLedgerEntriesParams,
  CreateLedgerEntryParams,
  CreateLedgerEntryBody,
  GetLedgerReportParams,
} from "@workspace/compass-api-zod";
import { denyNoScope, resolveProjectScope } from "../lib/tenancy";

const router = Router();

router.get("/projects/:projectId/ledger", async (req, res): Promise<void> => {
  const params = ListLedgerEntriesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveProjectScope(params.data.projectId),
      "read",
      "Project not found",
    )
  ) {
    return;
  }

  const entries = await db
    .select()
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.projectId, params.data.projectId))
    .orderBy(desc(ledgerEntriesTable.createdAt));

  res.json(entries);
});

router.post("/projects/:projectId/ledger", async (req, res): Promise<void> => {
  const params = CreateLedgerEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateLedgerEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveProjectScope(params.data.projectId),
      "write",
      "Project not found",
    )
  ) {
    return;
  }

  const [entry] = await db
    .insert(ledgerEntriesTable)
    .values({
      projectId: params.data.projectId,
      entryType: parsed.data.entryType,
      content: parsed.data.content,
      aiGenerated: parsed.data.aiGenerated ?? false,
      aiDisclosure: parsed.data.aiDisclosure ?? null,
      authorName: parsed.data.authorName ?? null,
      entityType: parsed.data.entityType ?? null,
      entityId: parsed.data.entityId ?? null,
    })
    .returning();

  res.status(201).json(entry);
});

router.get("/projects/:projectId/ledger/report", async (req, res): Promise<void> => {
  const params = GetLedgerReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveProjectScope(params.data.projectId),
      "read",
      "Project not found",
    )
  ) {
    return;
  }

  const entries = await db
    .select()
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.projectId, params.data.projectId))
    .orderBy(desc(ledgerEntriesTable.createdAt));

  const filter = (type: string) => entries.filter((e) => e.entryType === type);
  const aiEntries = entries.filter((e) => e.aiGenerated);
  const accessibilityEntries = filter("accessibility_finding");
  const designEntries = filter("design_decision");
  const standardsEntries = filter("standards_crosswalk");

  const aiCount = aiEntries.length;

  res.json({
    projectId: params.data.projectId,
    generatedAt: new Date().toISOString(),
    accessibilityConformance: {
      title: "Accessibility Conformance Report",
      summary: accessibilityEntries.length > 0
        ? `${accessibilityEntries.length} accessibility finding(s) documented. Review the entries below for findings and remediation status.`
        : "No accessibility findings recorded. Ensure axe automated scan and manual audit have been completed.",
      entries: accessibilityEntries,
    },
    aiDisclosure: {
      title: "AI Usage Disclosure",
      summary: aiCount > 0
        ? `${aiCount} AI-generated content item(s) documented in this project. All AI output was reviewed by a qualified human before use.`
        : "No AI-generated content documented for this project.",
      entries: aiEntries,
    },
    designRationale: {
      title: "Design Rationale",
      summary: designEntries.length > 0
        ? `${designEntries.length} design decision(s) recorded in the Evidence Ledger.`
        : "No design decisions recorded yet.",
      entries: designEntries,
    },
    standardsCrosswalk: {
      title: "Standards Crosswalk / Accreditation Alignment Report",
      summary: standardsEntries.length > 0
        ? `${standardsEntries.length} standards alignment entries recorded.`
        : "No standards crosswalk entries recorded. Run the accreditation crosswalk in the Backward Design stage.",
      entries: standardsEntries,
    },
  });
});

export default router;
