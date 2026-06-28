import { Router } from "express";
import { and, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import {
  db,
  usersTable,
  organizationsTable,
  allocationsTable,
  auditEventsTable,
} from "@workspace/kanon-db";
import {
  ListBuildersQueryParams,
  CreateBuilderBody,
  UpdateBuilderStatusParams,
  UpdateBuilderStatusBody,
  ResetBuilderPasswordParams,
  ResetBuilderPasswordBody,
  GetBuilderActivityParams,
} from "@workspace/kanon-api-zod";
import { blockWhileImpersonating, hashPassword } from "../lib/auth";
import {
  actorCanAccessOrg,
  denyBuilderWrite,
  denyUnmanagedOrg,
  resolveManagedOrg,
} from "../lib/tenancy";

const router = Router();

interface BuilderRow {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  organizationId: number | null;
  organizationName: string | null;
  createdAt: Date;
}

function builderView(row: BuilderRow, activeAllocationCount: number) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    createdAt: row.createdAt.toISOString(),
    activeAllocationCount,
  };
}

const builderCols = {
  id: usersTable.id,
  name: usersTable.name,
  email: usersTable.email,
  role: usersTable.role,
  status: usersTable.status,
  organizationId: usersTable.organizationId,
  organizationName: organizationsTable.name,
  createdAt: usersTable.createdAt,
};

async function activeAllocationCounts(builderIds: number[]): Promise<Map<number, number>> {
  if (builderIds.length === 0) return new Map();
  const rows = await db
    .select({ builderUserId: allocationsTable.builderUserId, c: count() })
    .from(allocationsTable)
    .where(and(inArray(allocationsTable.builderUserId, builderIds), eq(allocationsTable.status, "active")))
    .groupBy(allocationsTable.builderUserId);
  return new Map(rows.map((r) => [r.builderUserId, Number(r.c)]));
}

// List builders the actor manages (school_admin -> own org, global -> all or a
// requested org). Builders themselves cannot list builders.
router.get("/builders", async (req, res): Promise<void> => {
  const query = ListBuildersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const managed = resolveManagedOrg(req.actor!, query.data.organizationId ?? null, { requireConcrete: false });
  if (denyUnmanagedOrg(res, managed)) return;

  const where: SQL =
    managed.kind === "org"
      ? and(eq(usersTable.role, "builder"), eq(usersTable.organizationId, managed.orgId))!
      : eq(usersTable.role, "builder");

  const rows = await db
    .select(builderCols)
    .from(usersTable)
    .leftJoin(organizationsTable, eq(usersTable.organizationId, organizationsTable.id))
    .where(where)
    .orderBy(usersTable.createdAt);

  const counts = await activeAllocationCounts(rows.map((r) => r.id));
  res.json(rows.map((r) => builderView(r, counts.get(r.id) ?? 0)));
});

// Provision a builder in the actor's organization.
router.post("/builders", blockWhileImpersonating, async (req, res): Promise<void> => {
  const parsed = CreateBuilderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const managed = resolveManagedOrg(req.actor!, parsed.data.organizationId ?? null, { requireConcrete: true });
  if (denyUnmanagedOrg(res, managed)) return;
  if (managed.kind !== "org") return; // narrow for TypeScript
  const orgId = managed.orgId;

  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId));
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      name: parsed.data.name.trim(),
      organization: org.name,
      organizationId: orgId,
      role: "builder",
      productKey: "compass",
      status: "active",
    })
    .returning();

  res.status(201).json(
    builderView(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        organizationId: user.organizationId,
        organizationName: org.name,
        createdAt: user.createdAt,
      },
      0,
    ),
  );
});

// Load a builder the actor is allowed to manage, or null (response already sent).
async function loadManagedBuilder(req: import("express").Request, res: import("express").Response, builderId: number) {
  const [row] = await db
    .select(builderCols)
    .from(usersTable)
    .leftJoin(organizationsTable, eq(usersTable.organizationId, organizationsTable.id))
    .where(eq(usersTable.id, builderId));

  if (!row || row.role !== "builder" || !actorCanAccessOrg(req.actor!, row.organizationId)) {
    res.status(404).json({ error: "Builder not found" });
    return null;
  }
  return row;
}

// Activate or deactivate a builder. Deactivated builders cannot authenticate.
router.patch("/builders/:id/status", blockWhileImpersonating, async (req, res): Promise<void> => {
  if (denyBuilderWrite(res, req.actor!)) return;

  const params = UpdateBuilderStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBuilderStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const builder = await loadManagedBuilder(req, res, params.data.id);
  if (!builder) return;

  const [updated] = await db
    .update(usersTable)
    .set({ status: parsed.data.status })
    .where(eq(usersTable.id, builder.id))
    .returning();

  const counts = await activeAllocationCounts([builder.id]);
  res.json(
    builderView(
      { ...builder, status: updated.status },
      counts.get(builder.id) ?? 0,
    ),
  );
});

// Reset a builder's password (school admins cannot see the existing one).
router.post("/builders/:id/password", blockWhileImpersonating, async (req, res): Promise<void> => {
  if (denyBuilderWrite(res, req.actor!)) return;

  const params = ResetBuilderPasswordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ResetBuilderPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const builder = await loadManagedBuilder(req, res, params.data.id);
  if (!builder) return;

  const passwordHash = await hashPassword(parsed.data.password);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, builder.id));

  res.json({ ok: true });
});

// Per-builder activity feed (the curriculum mutations they performed).
router.get("/builders/:id/activity", async (req, res): Promise<void> => {
  if (denyBuilderWrite(res, req.actor!)) return;

  const params = GetBuilderActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const builder = await loadManagedBuilder(req, res, params.data.id);
  if (!builder) return;

  const events = await db
    .select({
      id: auditEventsTable.id,
      projectId: auditEventsTable.projectId,
      projectTitle: auditEventsTable.projectTitle,
      action: auditEventsTable.action,
      entityType: auditEventsTable.entityType,
      entityTitle: auditEventsTable.entityTitle,
      createdAt: auditEventsTable.createdAt,
    })
    .from(auditEventsTable)
    .where(eq(auditEventsTable.actorUserId, builder.id))
    .orderBy(desc(auditEventsTable.createdAt))
    .limit(50);

  res.json(
    events.map((e) => ({
      id: e.id,
      projectId: e.projectId ?? 0,
      projectTitle: e.projectTitle ?? "Unknown Project",
      action: e.action,
      entityType: e.entityType,
      entityTitle: e.entityTitle,
      timestamp: e.createdAt.toISOString(),
    })),
  );
});

export default router;
