import { Router } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, projectTimeEntriesTable, usersTable } from "@workspace/compass-db";
import {
  ListTimeEntriesParams,
  CreateTimeEntryParams,
  CreateTimeEntryBody,
  StopTimeEntryParams,
  UpdateTimeEntryParams,
  UpdateTimeEntryBody,
  DeleteTimeEntryParams,
} from "@workspace/compass-api-zod";
import { denyNoScope, resolveProjectScope, resolveTimeEntryScope } from "../lib/tenancy";
import { recordActorAudit } from "../lib/audit";

const router = Router();

/**
 * Postgres unique-violation SQLSTATE check. Drizzle wraps the driver error, so
 * the `23505` code may sit on the thrown error or on its `cause`.
 */
function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    if ((cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

type TimeEntryRow = typeof projectTimeEntriesTable.$inferSelect;

function serialize(row: TimeEntryRow, userName: string | null) {
  const durationSeconds = row.endedAt
    ? Math.max(0, Math.round((row.endedAt.getTime() - row.startedAt.getTime()) / 1000))
    : null;
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    userName,
    description: row.description,
    source: row.source,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    durationSeconds,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadUserName(userId: number): Promise<string | null> {
  const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  return u?.name ?? null;
}

/**
 * Re-anchor a date-only value at 12:00 UTC. The wire value is parsed by
 * `zod.coerce.date()` to UTC midnight, which can display as the previous
 * calendar day in negative-offset time zones; midday keeps the date stable.
 */
function anchorDate(d: Date): Date {
  return new Date(`${d.toISOString().slice(0, 10)}T12:00:00.000Z`);
}

const auditEntityTitle = (description: string | null): string => description?.trim() || "Time entry";

router.get("/projects/:projectId/time-entries", async (req, res): Promise<void> => {
  const params = ListTimeEntriesParams.safeParse(req.params);
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
    .select({ entry: projectTimeEntriesTable, userName: usersTable.name })
    .from(projectTimeEntriesTable)
    .leftJoin(usersTable, eq(projectTimeEntriesTable.userId, usersTable.id))
    .where(eq(projectTimeEntriesTable.projectId, params.data.projectId))
    .orderBy(desc(projectTimeEntriesTable.startedAt), desc(projectTimeEntriesTable.id));

  res.json(rows.map((r) => serialize(r.entry, r.userName)));
});

router.post("/projects/:projectId/time-entries", async (req, res): Promise<void> => {
  const params = CreateTimeEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateTimeEntryBody.safeParse(req.body);
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

  const userId = req.actor!.userId;
  const description = parsed.data.description?.trim() ? parsed.data.description.trim() : null;

  let values: typeof projectTimeEntriesTable.$inferInsert;

  if (parsed.data.kind === "manual") {
    if (parsed.data.minutes == null) {
      res.status(400).json({ error: "A manual entry requires the number of minutes worked." });
      return;
    }
    const startedAt = parsed.data.spentOn ? anchorDate(parsed.data.spentOn) : new Date();
    const endedAt = new Date(startedAt.getTime() + parsed.data.minutes * 60_000);
    values = { projectId: params.data.projectId, userId, description, startedAt, endedAt, source: "manual" };
  } else {
    // kind === "timer": start a live stopwatch. Only one running timer per
    // actor+project at a time, so a second start cannot orphan the first.
    const [running] = await db
      .select({ id: projectTimeEntriesTable.id })
      .from(projectTimeEntriesTable)
      .where(
        and(
          eq(projectTimeEntriesTable.projectId, params.data.projectId),
          eq(projectTimeEntriesTable.userId, userId),
          isNull(projectTimeEntriesTable.endedAt),
        ),
      );
    if (running) {
      res.status(409).json({ error: "You already have a running timer on this project." });
      return;
    }
    values = {
      projectId: params.data.projectId,
      userId,
      description,
      startedAt: new Date(),
      endedAt: null,
      source: "timer",
    };
  }

  let row;
  try {
    [row] = await db.insert(projectTimeEntriesTable).values(values).returning();
  } catch (err) {
    // Partial unique index on (projectId, userId) WHERE ended_at IS NULL: a
    // concurrent start that races past the pre-check still gets rejected here.
    // Drizzle wraps the pg error, so the SQLSTATE may sit on err or err.cause.
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "You already have a running timer on this project." });
      return;
    }
    throw err;
  }

  await recordActorAudit(req.actor!, {
    action: "create",
    entityType: "time_entry",
    entityTitle: auditEntityTitle(row.description),
    projectId: row.projectId,
  });

  res.status(201).json(serialize(row, await loadUserName(row.userId)));
});

router.post("/time-entries/:id/stop", async (req, res): Promise<void> => {
  const params = StopTimeEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveTimeEntryScope(params.data.id),
      "write",
      "Time entry not found",
    )
  ) {
    return;
  }

  // Atomic stop: only the row that is still running gets stamped, so two
  // concurrent stops cannot both succeed with different end times. Scope was
  // already validated above, so a missing row here means it was already stopped.
  const [updated] = await db
    .update(projectTimeEntriesTable)
    .set({ endedAt: new Date() })
    .where(
      and(
        eq(projectTimeEntriesTable.id, params.data.id),
        isNull(projectTimeEntriesTable.endedAt),
      ),
    )
    .returning();
  if (!updated) {
    res.status(400).json({ error: "This entry is not running." });
    return;
  }

  await recordActorAudit(req.actor!, {
    action: "update",
    entityType: "time_entry",
    entityTitle: auditEntityTitle(updated.description),
    projectId: updated.projectId,
  });

  res.json(serialize(updated, await loadUserName(updated.userId)));
});

router.patch("/time-entries/:id", async (req, res): Promise<void> => {
  const params = UpdateTimeEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTimeEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveTimeEntryScope(params.data.id),
      "write",
      "Time entry not found",
    )
  ) {
    return;
  }

  const [row] = await db
    .select()
    .from(projectTimeEntriesTable)
    .where(eq(projectTimeEntriesTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Time entry not found" });
    return;
  }

  const updates: Partial<typeof projectTimeEntriesTable.$inferInsert> = {};

  if (parsed.data.description !== undefined) {
    const trimmed = parsed.data.description?.trim();
    updates.description = trimmed ? trimmed : null;
  }

  const changesDuration = parsed.data.minutes !== undefined || parsed.data.spentOn !== undefined;
  if (changesDuration) {
    if (!row.endedAt) {
      res.status(400).json({ error: "Stop the timer before editing its duration or date." });
      return;
    }
    const startedAt = parsed.data.spentOn ? anchorDate(parsed.data.spentOn) : row.startedAt;
    const minutes =
      parsed.data.minutes ?? Math.round((row.endedAt.getTime() - row.startedAt.getTime()) / 60_000);
    updates.startedAt = startedAt;
    updates.endedAt = new Date(startedAt.getTime() + minutes * 60_000);
  }

  if (Object.keys(updates).length === 0) {
    res.json(serialize(row, await loadUserName(row.userId)));
    return;
  }

  const [updated] = await db
    .update(projectTimeEntriesTable)
    .set(updates)
    .where(eq(projectTimeEntriesTable.id, params.data.id))
    .returning();

  await recordActorAudit(req.actor!, {
    action: "update",
    entityType: "time_entry",
    entityTitle: auditEntityTitle(updated.description),
    projectId: updated.projectId,
  });

  res.json(serialize(updated, await loadUserName(updated.userId)));
});

router.delete("/time-entries/:id", async (req, res): Promise<void> => {
  const params = DeleteTimeEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveTimeEntryScope(params.data.id),
      "write",
      "Time entry not found",
    )
  ) {
    return;
  }

  const [row] = await db
    .select()
    .from(projectTimeEntriesTable)
    .where(eq(projectTimeEntriesTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Time entry not found" });
    return;
  }

  await db.delete(projectTimeEntriesTable).where(eq(projectTimeEntriesTable.id, params.data.id));

  await recordActorAudit(req.actor!, {
    action: "delete",
    entityType: "time_entry",
    entityTitle: auditEntityTitle(row.description),
    projectId: row.projectId,
  });

  res.status(204).end();
});

export default router;
