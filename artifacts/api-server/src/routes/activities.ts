import { Router } from "express";
import { db } from "@workspace/db";
import {
  interactiveActivitiesTable,
  activitySubmissionsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router = Router();

/**
 * Interactive HTML activities.
 *
 * Authoring (create/update/delete/review) is limited to staff roles. Submitting is open
 * to any signed-in user. The activity HTML itself is served to the client and rendered
 * in a sandboxed iframe there -- the server never executes it.
 */

// Who may author activities and review submissions. There is no dedicated
// "instructional designer" role in this platform, so the content-staff roles stand in.
const requireAuthor = requireRole("coach", "org_admin", "partner_admin", "super_admin");

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

function activityResponse(a: typeof interactiveActivitiesTable.$inferSelect) {
  return {
    id: a.id,
    courseId: a.courseId,
    moduleId: a.moduleId,
    title: a.title,
    instructions: a.instructions,
    html: a.html,
    maxScore: num(a.maxScore),
    published: a.published,
    createdByUserId: a.createdByUserId,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

function submissionResponse(s: typeof activitySubmissionsTable.$inferSelect) {
  return {
    id: s.id,
    activityId: s.activityId,
    userId: s.userId,
    payload: s.payload,
    score: num(s.score),
    status: s.status,
    feedback: s.feedback,
    reviewedBy: s.reviewedBy,
    submittedAt: s.submittedAt.toISOString(),
    reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
  };
}

/* ─────────────────────────── Activities ─────────────────────────── */

/** GET /activities?moduleId=&courseId= — list. Non-staff see only published. */
router.get("/activities", requireAuth, async (req, res) => {
  const { moduleId, courseId } = req.query as { moduleId?: string; courseId?: string };
  const staff = ["coach", "org_admin", "partner_admin", "super_admin"].includes(req.dbUser!.role);

  const filters = [];
  if (moduleId) filters.push(eq(interactiveActivitiesTable.moduleId, moduleId));
  if (courseId) filters.push(eq(interactiveActivitiesTable.courseId, courseId));
  if (!staff) filters.push(eq(interactiveActivitiesTable.published, true));

  const rows = await db
    .select()
    .from(interactiveActivitiesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(interactiveActivitiesTable.createdAt));

  res.json(rows.map(activityResponse));
});

/** GET /activities/:id — an unpublished activity is only visible to staff. */
router.get("/activities/:id", requireAuth, async (req, res) => {
  const [a] = await db
    .select()
    .from(interactiveActivitiesTable)
    .where(eq(interactiveActivitiesTable.id, req.params.id))
    .limit(1);
  if (!a) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }
  const staff = ["coach", "org_admin", "partner_admin", "super_admin"].includes(req.dbUser!.role);
  if (!a.published && !staff) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }
  res.json(activityResponse(a));
});

/** POST /activities */
router.post("/activities", requireAuth, requireAuthor, async (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  if (!title) {
    res.status(400).json({ error: "A title is required." });
    return;
  }
  const [row] = await db
    .insert(interactiveActivitiesTable)
    .values({
      title,
      instructions: req.body?.instructions ?? null,
      html: String(req.body?.html ?? ""),
      courseId: req.body?.courseId ?? null,
      moduleId: req.body?.moduleId ?? null,
      maxScore: req.body?.maxScore != null ? String(req.body.maxScore) : "100",
      published: Boolean(req.body?.published ?? false),
      createdByUserId: req.userId!,
    })
    .returning();
  res.status(201).json(activityResponse(row));
});

/** PATCH /activities/:id */
router.patch("/activities/:id", requireAuth, requireAuthor, async (req, res) => {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (req.body?.title !== undefined) patch.title = String(req.body.title);
  if (req.body?.instructions !== undefined) patch.instructions = req.body.instructions;
  if (req.body?.html !== undefined) patch.html = String(req.body.html);
  if (req.body?.courseId !== undefined) patch.courseId = req.body.courseId;
  if (req.body?.moduleId !== undefined) patch.moduleId = req.body.moduleId;
  if (req.body?.maxScore !== undefined) patch.maxScore = String(req.body.maxScore);
  if (req.body?.published !== undefined) patch.published = Boolean(req.body.published);

  const [row] = await db
    .update(interactiveActivitiesTable)
    .set(patch)
    .where(eq(interactiveActivitiesTable.id, req.params.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }
  res.json(activityResponse(row));
});

/** DELETE /activities/:id */
router.delete("/activities/:id", requireAuth, requireAuthor, async (req, res) => {
  await db.delete(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.id, req.params.id));
  res.json({ ok: true });
});

/* ─────────────────────────── Submissions ─────────────────────────── */

/**
 * POST /activities/:id/submit — the learner-facing hand-in.
 * The sandboxed iframe posts a result to the parent page, and the parent (which holds
 * the session cookie) calls this. The iframe itself is never authenticated.
 */
router.post("/activities/:id/submit", requireAuth, async (req, res) => {
  const [activity] = await db
    .select()
    .from(interactiveActivitiesTable)
    .where(eq(interactiveActivitiesTable.id, req.params.id))
    .limit(1);
  if (!activity || !activity.published) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }

  const payload = req.body?.payload ?? {};
  const score =
    req.body?.score !== undefined && req.body?.score !== null ? String(Number(req.body.score)) : null;

  const [row] = await db
    .insert(activitySubmissionsTable)
    .values({
      activityId: activity.id,
      userId: req.userId!,
      payload,
      score,
    })
    .returning();

  res.status(201).json(submissionResponse(row));
});

/** GET /activities/:id/submissions — staff view of everyone's hand-ins for an activity. */
router.get("/activities/:id/submissions", requireAuth, requireAuthor, async (req, res) => {
  const rows = await db
    .select({
      submission: activitySubmissionsTable,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
    })
    .from(activitySubmissionsTable)
    .leftJoin(usersTable, eq(activitySubmissionsTable.userId, usersTable.id))
    .where(eq(activitySubmissionsTable.activityId, req.params.id))
    .orderBy(desc(activitySubmissionsTable.submittedAt));

  res.json(
    rows.map((r) => ({
      ...submissionResponse(r.submission),
      learnerName: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || "Unknown",
      learnerEmail: r.email,
    })),
  );
});

/** GET /activities/:id/my-submissions — a learner's own history for one activity. */
router.get("/activities/:id/my-submissions", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(activitySubmissionsTable)
    .where(
      and(
        eq(activitySubmissionsTable.activityId, req.params.id),
        eq(activitySubmissionsTable.userId, req.userId!),
      ),
    )
    .orderBy(desc(activitySubmissionsTable.submittedAt));
  res.json(rows.map(submissionResponse));
});

/** PATCH /activities/submissions/:submissionId/review — coach grades/annotates. */
router.patch(
  "/activities/submissions/:submissionId/review",
  requireAuth,
  requireAuthor,
  async (req, res) => {
    const status = String(req.body?.status ?? "reviewed");
    if (!["submitted", "reviewed", "approved"].includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    const patch: Record<string, unknown> = {
      status,
      reviewedBy: req.userId!,
      reviewedAt: new Date(),
    };
    if (req.body?.feedback !== undefined) patch.feedback = req.body.feedback;
    if (req.body?.score !== undefined && req.body?.score !== null) patch.score = String(Number(req.body.score));

    const [row] = await db
      .update(activitySubmissionsTable)
      .set(patch)
      .where(eq(activitySubmissionsTable.id, req.params.submissionId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }
    res.json(submissionResponse(row));
  },
);

export default router;
