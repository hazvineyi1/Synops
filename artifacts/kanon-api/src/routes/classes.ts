import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, classesTable, classMembershipsTable, usersTable, type ClassRow } from "@workspace/kanon-db";
import {
  ListClassesParams,
  CreateClassParams,
  CreateClassBody,
  UpdateClassParams,
  UpdateClassBody,
  ListClassRosterParams,
  AddClassMemberParams,
  AddClassMemberBody,
  RemoveClassMemberParams,
  ListOrgMembersQueryParams,
} from "@workspace/kanon-api-zod";
import { resolveCourseScope, resolveClassScope, denyNoScope, denyBuilderWrite, resolveManagedOrg, denyUnmanagedOrg, actorCanAccessOrg, getClassOrgId } from "../lib/tenancy";
import { recordActorAudit } from "../lib/audit";

const router = Router();

function classView(row: ClassRow) {
  return {
    id: row.id,
    courseId: row.courseId,
    name: row.name,
    section: row.section,
    term: row.term,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Classes/sections sit under a course; access follows the course scope. A builder
// allocated to the course (or its project) can read and create classes here.
router.get("/courses/:courseId/classes", async (req, res): Promise<void> => {
  const params = ListClassesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const scope = await resolveCourseScope(params.data.courseId);
  if (await denyNoScope(res, req.actor!, scope, "read", "Course not found")) return;

  const rows = await db
    .select()
    .from(classesTable)
    .where(eq(classesTable.courseId, params.data.courseId))
    .orderBy(classesTable.createdAt);

  res.json(rows.map(classView));
});

router.post("/courses/:courseId/classes", async (req, res): Promise<void> => {
  const params = CreateClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const scope = await resolveCourseScope(params.data.courseId);
  if (await denyNoScope(res, req.actor!, scope, "write", "Course not found")) return;

  const [cls] = await db
    .insert(classesTable)
    .values({
      courseId: params.data.courseId,
      name: parsed.data.name.trim(),
      section: parsed.data.section ?? null,
      term: parsed.data.term ?? null,
      status: parsed.data.status ?? "active",
    })
    .returning();

  await recordActorAudit(req.actor!, {
    action: "created",
    entityType: "class",
    entityTitle: cls.name,
    projectId: scope?.projectId ?? null,
  });

  res.status(201).json(classView(cls));
});

router.patch("/classes/:id", async (req, res): Promise<void> => {
  const params = UpdateClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const scope = await resolveClassScope(params.data.id);
  if (await denyNoScope(res, req.actor!, scope, "write", "Class not found")) return;

  const updates: Partial<Pick<ClassRow, "name" | "section" | "term" | "status">> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
  if (parsed.data.section !== undefined) updates.section = parsed.data.section;
  if (parsed.data.term !== undefined) updates.term = parsed.data.term;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;

  let cls: ClassRow;
  if (Object.keys(updates).length === 0) {
    [cls] = await db.select().from(classesTable).where(eq(classesTable.id, params.data.id));
  } else {
    [cls] = await db
      .update(classesTable)
      .set(updates)
      .where(eq(classesTable.id, params.data.id))
      .returning();
  }

  await recordActorAudit(req.actor!, {
    action: "updated",
    entityType: "class",
    entityTitle: cls.name,
    projectId: scope?.projectId ?? null,
  });

  res.json(classView(cls));
});

// ── Class roster ─────────────────────────────────────────────────────────────
// Roster reads are open to anyone who can access the class scope.
// Roster writes (add/remove) require admin or school_admin.

router.get("/classes/:classId/roster", async (req, res): Promise<void> => {
  const params = ListClassRosterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const scope = await resolveClassScope(params.data.classId);
  if (await denyNoScope(res, req.actor!, scope, "read", "Class not found")) return;

  const memberships = await db
    .select({
      id: classMembershipsTable.id,
      classId: classMembershipsTable.classId,
      userId: classMembershipsTable.userId,
      createdAt: classMembershipsTable.createdAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
      userRole: usersTable.role,
    })
    .from(classMembershipsTable)
    .innerJoin(usersTable, eq(classMembershipsTable.userId, usersTable.id))
    .where(eq(classMembershipsTable.classId, params.data.classId))
    .orderBy(classMembershipsTable.createdAt);

  res.json(
    memberships.map((m) => ({
      id: m.id,
      classId: m.classId,
      userId: m.userId,
      userName: m.userName,
      userEmail: m.userEmail,
      userRole: m.userRole,
      addedAt: m.createdAt.toISOString(),
    })),
  );
});

router.post("/classes/:classId/roster", async (req, res): Promise<void> => {
  if (denyBuilderWrite(res, req.actor!)) return;

  const params = AddClassMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AddClassMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const scope = await resolveClassScope(params.data.classId);
  if (await denyNoScope(res, req.actor!, scope, "write", "Class not found")) return;

  // The user being added must belong to the same organization as the class.
  const [targetUser] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      organizationId: usersTable.organizationId,
    })
    .from(usersTable)
    .where(eq(usersTable.id, parsed.data.userId));

  if (
    !targetUser ||
    !actorCanAccessOrg(req.actor!, targetUser.organizationId) ||
    targetUser.organizationId !== scope!.orgId
  ) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Only school_admin and builder roles are valid roster members (existing org staff).
  if (targetUser.role !== "school_admin" && targetUser.role !== "builder") {
    res.status(422).json({ error: "Only school administrators and builders can be added to a class roster." });
    return;
  }

  // Detect duplicate — return 409.
  const existing = await db
    .select({ id: classMembershipsTable.id })
    .from(classMembershipsTable)
    .where(
      and(
        eq(classMembershipsTable.classId, params.data.classId),
        eq(classMembershipsTable.userId, parsed.data.userId),
      ),
    );
  if (existing.length > 0) {
    res.status(409).json({ error: "This person is already on the roster." });
    return;
  }

  const [membership] = await db
    .insert(classMembershipsTable)
    .values({
      classId: params.data.classId,
      userId: parsed.data.userId,
      addedByUserId: req.actor!.userId,
    })
    .returning();

  await recordActorAudit(req.actor!, {
    action: "added_to_roster",
    entityType: "class_member",
    entityTitle: targetUser.name,
    projectId: scope!.projectId,
  });

  res.status(201).json({
    id: membership.id,
    classId: membership.classId,
    userId: membership.userId,
    userName: targetUser.name,
    userEmail: targetUser.email,
    userRole: targetUser.role,
    addedAt: membership.createdAt.toISOString(),
  });
});

router.delete("/classes/:classId/roster/:memberId", async (req, res): Promise<void> => {
  if (denyBuilderWrite(res, req.actor!)) return;

  const params = RemoveClassMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const scope = await resolveClassScope(params.data.classId);
  if (await denyNoScope(res, req.actor!, scope, "write", "Class not found")) return;

  // Load the membership and verify it belongs to this class.
  const [membership] = await db
    .select({
      id: classMembershipsTable.id,
      classId: classMembershipsTable.classId,
      userId: classMembershipsTable.userId,
    })
    .from(classMembershipsTable)
    .where(
      and(
        eq(classMembershipsTable.id, params.data.memberId),
        eq(classMembershipsTable.classId, params.data.classId),
      ),
    );

  if (!membership) {
    res.status(404).json({ error: "Roster entry not found" });
    return;
  }

  // Fetch the user name for the audit record.
  const [user] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, membership.userId));

  await db.delete(classMembershipsTable).where(eq(classMembershipsTable.id, membership.id));

  await recordActorAudit(req.actor!, {
    action: "removed_from_roster",
    entityType: "class_member",
    entityTitle: user?.name ?? String(membership.userId),
    projectId: scope!.projectId,
  });

  res.status(204).end();
});

// ── Org members picker ────────────────────────────────────────────────────────
// Lists active school_admin and builder users in the org for roster pickers.
// school_admin always see their own org; global admins may specify an org.

router.get("/org-members", async (req, res): Promise<void> => {
  const query = ListOrgMembersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const managed = resolveManagedOrg(req.actor!, query.data.organizationId ?? null, { requireConcrete: false });
  if (denyUnmanagedOrg(res, managed)) return;

  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      status: usersTable.status,
      organizationId: usersTable.organizationId,
    })
    .from(usersTable)
    .where(
      managed.kind === "org"
        ? and(
            inArray(usersTable.role, ["school_admin", "builder"]),
            eq(usersTable.organizationId, managed.orgId),
          )
        : inArray(usersTable.role, ["school_admin", "builder"]),
    )
    .orderBy(usersTable.name);

  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      status: r.status,
    })),
  );
});

export default router;
