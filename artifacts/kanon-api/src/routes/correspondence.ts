import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  projectCorrespondenceTable,
  type ProjectCorrespondenceRow,
} from "@workspace/kanon-db";
import {
  ListProjectCorrespondenceParams,
  CreateProjectCorrespondenceParams,
  CreateProjectCorrespondenceBody,
  UpdateCorrespondenceParams,
  UpdateCorrespondenceBody,
  DeleteCorrespondenceParams,
} from "@workspace/kanon-api-zod";
import { denyNoScope, resolveProjectScope, resolveCorrespondenceScope } from "../lib/tenancy";
import { recordActorAudit } from "../lib/audit";

const router = Router();

function serializeCorrespondence(row: ProjectCorrespondenceRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    direction: row.direction,
    subject: row.subject,
    party: row.party,
    body: row.body,
    occurredAt: row.occurredAt ? row.occurredAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Correspondence ─────────────────────────────────────────────

router.get("/projects/:projectId/correspondence", async (req, res): Promise<void> => {
  const params = ListProjectCorrespondenceParams.safeParse(req.params);
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

  const rows = await db
    .select()
    .from(projectCorrespondenceTable)
    .where(eq(projectCorrespondenceTable.projectId, params.data.projectId))
    .orderBy(desc(projectCorrespondenceTable.createdAt));

  res.json(rows.map(serializeCorrespondence));
});

router.post("/projects/:projectId/correspondence", async (req, res): Promise<void> => {
  const params = CreateProjectCorrespondenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateProjectCorrespondenceBody.safeParse(req.body);
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

  const [row] = await db
    .insert(projectCorrespondenceTable)
    .values({
      projectId: params.data.projectId,
      direction: parsed.data.direction ?? "inbound",
      subject: parsed.data.subject,
      party: parsed.data.party ?? null,
      body: parsed.data.body ?? "",
      occurredAt: parsed.data.occurredAt ?? null,
      createdByUserId: req.actor!.userId,
    })
    .returning();

  await recordActorAudit(req.actor!, {
    action: "create",
    entityType: "correspondence",
    entityTitle: row.subject,
    projectId: row.projectId,
  });

  res.status(201).json(serializeCorrespondence(row));
});

router.patch("/correspondence/:id", async (req, res): Promise<void> => {
  const params = UpdateCorrespondenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCorrespondenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveCorrespondenceScope(params.data.id),
      "write",
      "Correspondence not found",
    )
  ) {
    return;
  }

  // Patch-safe: only set columns present in the body so a partial edit never
  // wipes untouched fields.
  const update: Partial<typeof projectCorrespondenceTable.$inferInsert> = {};
  if (parsed.data.direction !== undefined) update.direction = parsed.data.direction;
  if (parsed.data.subject !== undefined) update.subject = parsed.data.subject;
  if (parsed.data.party !== undefined) update.party = parsed.data.party;
  if (parsed.data.body !== undefined) update.body = parsed.data.body;
  if (parsed.data.occurredAt !== undefined) update.occurredAt = parsed.data.occurredAt;

  if (Object.keys(update).length === 0) {
    const [row] = await db
      .select()
      .from(projectCorrespondenceTable)
      .where(eq(projectCorrespondenceTable.id, params.data.id));
    if (!row) {
      res.status(404).json({ error: "Correspondence not found" });
      return;
    }
    res.json(serializeCorrespondence(row));
    return;
  }

  const [row] = await db
    .update(projectCorrespondenceTable)
    .set(update)
    .where(eq(projectCorrespondenceTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Correspondence not found" });
    return;
  }

  await recordActorAudit(req.actor!, {
    action: "update",
    entityType: "correspondence",
    entityTitle: row.subject,
    projectId: row.projectId,
  });

  res.json(serializeCorrespondence(row));
});

router.delete("/correspondence/:id", async (req, res): Promise<void> => {
  const params = DeleteCorrespondenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveCorrespondenceScope(params.data.id),
      "write",
      "Correspondence not found",
    )
  ) {
    return;
  }

  const [row] = await db
    .select()
    .from(projectCorrespondenceTable)
    .where(eq(projectCorrespondenceTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Correspondence not found" });
    return;
  }

  await db.delete(projectCorrespondenceTable).where(eq(projectCorrespondenceTable.id, params.data.id));

  await recordActorAudit(req.actor!, {
    action: "delete",
    entityType: "correspondence",
    entityTitle: row.subject,
    projectId: row.projectId,
  });

  res.status(204).end();
});

export default router;
