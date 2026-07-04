import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, coursesTable, modulesTable } from "@workspace/compass-db";
import {
  ListCoursesParams,
  CreateCourseParams,
  CreateCourseBody,
  GetCourseParams,
  UpdateCourseParams,
  UpdateCourseBody,
  ListModulesParams,
  CreateModuleParams,
  CreateModuleBody,
  UpdateModuleParams,
  UpdateModuleBody,
  DeleteModuleParams,
} from "@workspace/compass-api-zod";
import {
  denyNoScope,
  loadBuilderScope,
  resolveCourseScope,
  resolveModuleScope,
  resolveProjectScope,
} from "../lib/tenancy";
import { recordActorAudit } from "../lib/audit";
import { createCourseWithLimit } from "../lib/billing";

const router = Router();

// Courses
router.get("/projects/:projectId/courses", async (req, res): Promise<void> => {
  const params = ListCoursesParams.safeParse(req.params);
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

  let courses = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.projectId, params.data.projectId))
    .orderBy(coursesTable.createdAt);

  // A course/class-allocated builder only sees the courses they can reach.
  const actor = req.actor!;
  if (actor.role === "builder") {
    const bs = await loadBuilderScope(actor.userId);
    if (!bs.writableProjects.has(params.data.projectId)) {
      courses = courses.filter((c) => bs.accessibleCourses.has(c.id));
    }
  }

  res.json(courses);
});

router.post("/projects/:projectId/courses", async (req, res): Promise<void> => {
  const params = CreateCourseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateCourseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Creating a course is a project-level write (adds a child to the project).
  const projectScope = await resolveProjectScope(params.data.projectId);
  if (await denyNoScope(res, req.actor!, projectScope, "write", "Project not found")) {
    return;
  }

  // Enforce the tenant's active-course quota atomically (advisory lock keyed by
  // org) so two concurrent creates cannot both pass the check and overshoot.
  // Global actors (internal staff) bypass metering.
  const result = await createCourseWithLimit(
    projectScope!.orgId,
    req.actor!.isGlobal,
    async (exec) => {
      const [created] = await exec
        .insert(coursesTable)
        .values({
          projectId: params.data.projectId,
          title: parsed.data.title,
          creditHours: parsed.data.creditHours ?? null,
          termWeeks: parsed.data.termWeeks ?? null,
          moduleCount: parsed.data.moduleCount ?? null,
          modality: parsed.data.modality ?? null,
          accreditors: parsed.data.accreditors ?? null,
          seatTimeHours: parsed.data.seatTimeHours ?? null,
          courseDescription: parsed.data.courseDescription ?? null,
          instructorName: parsed.data.instructorName ?? null,
          instructorEmail: parsed.data.instructorEmail ?? null,
          instructorTitle: parsed.data.instructorTitle ?? null,
        })
        .returning();
      return created;
    },
  );

  if (result.status === "limit_exceeded") {
    res.status(402).json({
      error: "upgrade_required",
      message: `Your plan allows ${result.limit} active ${result.limit === 1 ? "course" : "courses"}. Contact us to add more.`,
      tier: result.tier,
      limit: result.limit,
      current: result.current,
    });
    return;
  }

  const course = result.value;
  if (!course) {
    res.status(500).json({ error: "Failed to create course" });
    return;
  }

  await recordActorAudit(req.actor!, {
    action: "created",
    entityType: "course",
    entityTitle: course.title,
    projectId: params.data.projectId,
  });

  res.status(201).json(course);
});

router.get("/courses/:id", async (req, res): Promise<void> => {
  const params = GetCourseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (await denyNoScope(res, req.actor!, await resolveCourseScope(params.data.id), "read", "Course not found"))
    return;

  const [course] = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.id, params.data.id));

  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  res.json(course);
});

router.patch("/courses/:id", async (req, res): Promise<void> => {
  const params = UpdateCourseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCourseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const courseScope = await resolveCourseScope(params.data.id);
  if (await denyNoScope(res, req.actor!, courseScope, "write", "Course not found")) return;

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.creditHours !== undefined) updates.creditHours = parsed.data.creditHours;
  if (parsed.data.termWeeks !== undefined) updates.termWeeks = parsed.data.termWeeks;
  if (parsed.data.moduleCount !== undefined) updates.moduleCount = parsed.data.moduleCount;
  if (parsed.data.modality !== undefined) updates.modality = parsed.data.modality;
  if (parsed.data.accreditors !== undefined) updates.accreditors = parsed.data.accreditors;
  if (parsed.data.seatTimeHours !== undefined) updates.seatTimeHours = parsed.data.seatTimeHours;
  if (parsed.data.courseDescription !== undefined) updates.courseDescription = parsed.data.courseDescription;
  if (parsed.data.instructorName !== undefined) updates.instructorName = parsed.data.instructorName;
  if (parsed.data.instructorEmail !== undefined) updates.instructorEmail = parsed.data.instructorEmail;
  if (parsed.data.instructorTitle !== undefined) updates.instructorTitle = parsed.data.instructorTitle;

  const [course] = await db
    .update(coursesTable)
    .set(updates)
    .where(eq(coursesTable.id, params.data.id))
    .returning();

  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  await recordActorAudit(req.actor!, {
    action: "updated",
    entityType: "course",
    entityTitle: course.title,
    projectId: courseScope?.projectId ?? null,
  });

  res.json(course);
});

// Modules
router.get("/courses/:courseId/modules", async (req, res): Promise<void> => {
  const params = ListModulesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (await denyNoScope(res, req.actor!, await resolveCourseScope(params.data.courseId), "read", "Course not found")) {
    return;
  }

  const modules = await db
    .select()
    .from(modulesTable)
    .where(eq(modulesTable.courseId, params.data.courseId))
    .orderBy(modulesTable.position);

  res.json(modules);
});

router.post("/courses/:courseId/modules", async (req, res): Promise<void> => {
  const params = CreateModuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateModuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Creating a module is a course-level write.
  const courseScope = await resolveCourseScope(params.data.courseId);
  if (await denyNoScope(res, req.actor!, courseScope, "write", "Course not found")) {
    return;
  }

  const [module] = await db
    .insert(modulesTable)
    .values({
      courseId: params.data.courseId,
      title: parsed.data.title,
      position: parsed.data.position,
      weekNumber: parsed.data.weekNumber ?? null,
      description: parsed.data.description ?? null,
      isPrototype: parsed.data.isPrototype ?? false,
      status: "draft",
    })
    .returning();

  await recordActorAudit(req.actor!, {
    action: "created",
    entityType: "module",
    entityTitle: module.title,
    projectId: courseScope?.projectId ?? null,
  });

  res.status(201).json(module);
});

router.patch("/modules/:id", async (req, res): Promise<void> => {
  const params = UpdateModuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateModuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const moduleScope = await resolveModuleScope(params.data.id);
  if (await denyNoScope(res, req.actor!, moduleScope, "write", "Module not found")) return;

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.position !== undefined) updates.position = parsed.data.position;
  if (parsed.data.weekNumber !== undefined) updates.weekNumber = parsed.data.weekNumber;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.isPrototype !== undefined) updates.isPrototype = parsed.data.isPrototype;

  const [module] = await db
    .update(modulesTable)
    .set(updates)
    .where(eq(modulesTable.id, params.data.id))
    .returning();

  if (!module) {
    res.status(404).json({ error: "Module not found" });
    return;
  }

  await recordActorAudit(req.actor!, {
    action: "updated",
    entityType: "module",
    entityTitle: module.title,
    projectId: moduleScope?.projectId ?? null,
  });

  res.json(module);
});

router.delete("/modules/:id", async (req, res): Promise<void> => {
  const params = DeleteModuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const moduleScope = await resolveModuleScope(params.data.id);
  if (await denyNoScope(res, req.actor!, moduleScope, "write", "Module not found")) return;

  const [deleted] = await db
    .delete(modulesTable)
    .where(eq(modulesTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Module not found" });
    return;
  }

  await recordActorAudit(req.actor!, {
    action: "deleted",
    entityType: "module",
    entityTitle: deleted.title,
    projectId: moduleScope?.projectId ?? null,
  });

  res.sendStatus(204);
});

export default router;
