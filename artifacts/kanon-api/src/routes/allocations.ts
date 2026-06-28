import { Router } from "express";
import { and, desc, eq, type SQL } from "drizzle-orm";
import {
  db,
  allocationsTable,
  usersTable,
  projectsTable,
  coursesTable,
  classesTable,
  type Allocation,
  type AllocationScopeType,
} from "@workspace/kanon-db";
import {
  ListAllocationsQueryParams,
  CreateAllocationBody,
  RevokeAllocationParams,
} from "@workspace/kanon-api-zod";
import {
  actorCanAccessOrg,
  assertAllocationTargetInOrg,
  denyBuilderWrite,
  denyUnmanagedOrg,
  resolveManagedOrg,
} from "../lib/tenancy";
import { recordActorAudit } from "../lib/audit";
import { blockWhileImpersonating } from "../lib/auth";

const router = Router();

// Drizzle wraps the underlying pg error, so the Postgres error code (23505 for a
// unique violation) can sit on the thrown error or anywhere down its cause chain.
function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && cur != null; depth++) {
    if (typeof cur === "object" && "code" in cur && (cur as { code?: string }).code === "23505") {
      return true;
    }
    cur = typeof cur === "object" && "cause" in cur ? (cur as { cause?: unknown }).cause : null;
  }
  return false;
}

interface ScopeDescription {
  scopeTitle: string;
  projectId: number | null;
  projectTitle: string | null;
}

// Resolve a human label and parent project for an allocation target.
async function describeScope(
  scopeType: AllocationScopeType,
  scopeId: number,
): Promise<ScopeDescription> {
  if (scopeType === "project") {
    const [row] = await db
      .select({ title: projectsTable.title })
      .from(projectsTable)
      .where(eq(projectsTable.id, scopeId));
    return { scopeTitle: row?.title ?? `Project #${scopeId}`, projectId: scopeId, projectTitle: row?.title ?? null };
  }
  if (scopeType === "course") {
    const [row] = await db
      .select({ title: coursesTable.title, projectId: projectsTable.id, projectTitle: projectsTable.title })
      .from(coursesTable)
      .innerJoin(projectsTable, eq(coursesTable.projectId, projectsTable.id))
      .where(eq(coursesTable.id, scopeId));
    return {
      scopeTitle: row?.title ?? `Course #${scopeId}`,
      projectId: row?.projectId ?? null,
      projectTitle: row?.projectTitle ?? null,
    };
  }
  const [row] = await db
    .select({ name: classesTable.name, projectId: projectsTable.id, projectTitle: projectsTable.title })
    .from(classesTable)
    .innerJoin(coursesTable, eq(classesTable.courseId, coursesTable.id))
    .innerJoin(projectsTable, eq(coursesTable.projectId, projectsTable.id))
    .where(eq(classesTable.id, scopeId));
  return {
    scopeTitle: row?.name ?? `Class #${scopeId}`,
    projectId: row?.projectId ?? null,
    projectTitle: row?.projectTitle ?? null,
  };
}

async function allocationView(alloc: Allocation, builderName: string | null) {
  const scope = await describeScope(alloc.scopeType as AllocationScopeType, alloc.scopeId);
  return {
    id: alloc.id,
    organizationId: alloc.organizationId,
    builderUserId: alloc.builderUserId,
    builderName,
    scopeType: alloc.scopeType,
    scopeId: alloc.scopeId,
    scopeTitle: scope.scopeTitle,
    projectId: scope.projectId,
    projectTitle: scope.projectTitle,
    status: alloc.status,
    notes: alloc.notes,
    createdAt: alloc.createdAt.toISOString(),
    updatedAt: alloc.updatedAt.toISOString(),
  };
}

// List allocations the actor manages, optionally filtered by builder.
router.get("/allocations", async (req, res): Promise<void> => {
  const query = ListAllocationsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const managed = resolveManagedOrg(req.actor!, query.data.organizationId ?? null, { requireConcrete: false });
  if (denyUnmanagedOrg(res, managed)) return;

  const filters: SQL[] = [];
  if (managed.kind === "org") filters.push(eq(allocationsTable.organizationId, managed.orgId));
  if (query.data.builderUserId != null) filters.push(eq(allocationsTable.builderUserId, query.data.builderUserId));

  const rows = await db
    .select({ alloc: allocationsTable, builderName: usersTable.name })
    .from(allocationsTable)
    .leftJoin(usersTable, eq(allocationsTable.builderUserId, usersTable.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(allocationsTable.createdAt));

  res.json(await Promise.all(rows.map((r) => allocationView(r.alloc, r.builderName))));
});

// Create an active allocation binding a builder to a scope in their org.
router.post("/allocations", blockWhileImpersonating, async (req, res): Promise<void> => {
  if (denyBuilderWrite(res, req.actor!)) return;

  const parsed = CreateAllocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [builder] = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, organizationId: usersTable.organizationId })
    .from(usersTable)
    .where(eq(usersTable.id, parsed.data.builderUserId));

  if (!builder || builder.role !== "builder" || !actorCanAccessOrg(req.actor!, builder.organizationId)) {
    res.status(404).json({ error: "Builder not found" });
    return;
  }
  const orgId = builder.organizationId!;

  const inOrg = await assertAllocationTargetInOrg(parsed.data.scopeType, parsed.data.scopeId, orgId);
  if (!inOrg) {
    res.status(400).json({ error: "Allocation target is not in the builder's organization." });
    return;
  }

  let alloc: Allocation;
  try {
    [alloc] = await db
      .insert(allocationsTable)
      .values({
        organizationId: orgId,
        builderUserId: builder.id,
        scopeType: parsed.data.scopeType,
        scopeId: parsed.data.scopeId,
        status: "active",
        notes: parsed.data.notes ?? null,
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "An active allocation already exists for this target." });
      return;
    }
    throw err;
  }

  const scope = await describeScope(parsed.data.scopeType, parsed.data.scopeId);
  await recordActorAudit(req.actor!, {
    action: "allocated",
    entityType: "allocation",
    entityTitle: `${builder.name}: ${scope.scopeTitle}`,
    projectId: scope.projectId,
    projectTitle: scope.projectTitle,
  });

  res.status(201).json(await allocationView(alloc, builder.name));
});

// Revoke an allocation (idempotent). Downward write access disappears at once.
router.patch("/allocations/:id/revoke", blockWhileImpersonating, async (req, res): Promise<void> => {
  if (denyBuilderWrite(res, req.actor!)) return;

  const params = RevokeAllocationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [alloc] = await db.select().from(allocationsTable).where(eq(allocationsTable.id, params.data.id));
  if (!alloc || !actorCanAccessOrg(req.actor!, alloc.organizationId)) {
    res.status(404).json({ error: "Allocation not found" });
    return;
  }

  const [updated] = await db
    .update(allocationsTable)
    .set({ status: "revoked" })
    .where(eq(allocationsTable.id, alloc.id))
    .returning();

  const [builder] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, alloc.builderUserId));

  if (alloc.status !== "revoked") {
    const scope = await describeScope(alloc.scopeType as AllocationScopeType, alloc.scopeId);
    await recordActorAudit(req.actor!, {
      action: "revoked",
      entityType: "allocation",
      entityTitle: `${builder?.name ?? "Builder"}: ${scope.scopeTitle}`,
      projectId: scope.projectId,
      projectTitle: scope.projectTitle,
    });
  }

  res.json(await allocationView(updated, builder?.name ?? null));
});

// A builder's own active allocations (what they may build). Empty for non-builders.
router.get("/my/allocations", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(allocationsTable)
    .where(and(eq(allocationsTable.builderUserId, req.actor!.userId), eq(allocationsTable.status, "active")))
    .orderBy(desc(allocationsTable.createdAt));

  res.json(await Promise.all(rows.map((alloc) => allocationView(alloc, null))));
});

export default router;
