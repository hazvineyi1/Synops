import { Router } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import {
  interactiveActivitiesTable,
  activitySubmissionsTable,
  activityEmbedLinksTable,
  activityAssignmentsTable,
  usersTable,
  partnersTable,
  organisationsTable,
  coursesTable,
  courseGroupsTable,
  courseGroupMembersTable,
  type InteractiveActivity,
  type ActivityAssignment,
} from "@workspace/db";
import { eq, and, or, ne, inArray, desc, isNull, type SQL } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { canParticipateInCourse } from "../lib/scope";
import { isSuperAdmin, hasHubAccess, canAdministerOrg, isInstructionalDesigner } from "../lib/roles";
import { logAudit } from "../lib/audit";
import { generateActivities } from "../lib/activityEngine";
import { extractFromBuffer, extractFromUrl } from "../lib/extractText";
import { onGradeEvent } from "../lib/gradebookAlerts";

const router = Router();

type U = { id: string; role: string; organisationId?: string | null; partnerId?: string | null; firstName?: string | null; lastName?: string | null; email: string };

/** Tenant match: an activity's organisationId may hold an org OR a partner id (like cases). */
function userOwnsTenant(user: U, tenantId: string | null): boolean {
  if (!tenantId) return false;
  if (user.organisationId && tenantId === user.organisationId) return true;
  if (user.partnerId && tenantId === user.partnerId) return true;
  return false;
}
/** Who may author activities: Hub roles, Facilitators, or a section coach (staff). */
function canAuthorActivities(role: string): boolean {
  return hasHubAccess(role) || canAdministerOrg(role) || role === "coach";
}
function canManageActivity(user: U, a: InteractiveActivity): boolean {
  if (hasHubAccess(user.role)) return true;
  if ((canAdministerOrg(user.role) || user.role === "coach") && userOwnsTenant(user, a.organisationId)) return true;
  return false;
}
/** Visible-to-run: in the user's tenant, OR a shared library, OR (for Hub) anything. */
function activityInScope(user: U, a: InteractiveActivity): boolean {
  if (hasHubAccess(user.role)) return true;
  if (userOwnsTenant(user, a.organisationId)) return true;
  if (a.isLibrary && !a.organisationId) return true;
  return false;
}

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
    organisationId: a.organisationId,
    courseId: a.courseId,
    moduleId: a.moduleId,
    title: a.title,
    instructions: a.instructions,
    html: a.html,
    source: a.source,
    embedUrl: a.embedUrl,
    kind: a.kind,
    bloomsLevel: a.bloomsLevel,
    difficulty: a.difficulty,
    isLibrary: a.isLibrary,
    tags: a.tags ?? [],
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

/** GET /activities?moduleId=&courseId= — list, tenant + library + assignment scoped. */
router.get("/activities", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const { moduleId, courseId } = req.query as { moduleId?: string; courseId?: string };

  let rows: InteractiveActivity[];
  if (hasHubAccess(u.role)) {
    rows = await db.select().from(interactiveActivitiesTable).orderBy(desc(interactiveActivitiesTable.createdAt));
  } else {
    // Tenant-owned OR shared library.
    const conds: SQL[] = [and(eq(interactiveActivitiesTable.isLibrary, true), isNull(interactiveActivitiesTable.organisationId)) as SQL];
    if (u.organisationId) conds.unshift(eq(interactiveActivitiesTable.organisationId, u.organisationId));
    if (u.partnerId) conds.unshift(eq(interactiveActivitiesTable.organisationId, u.partnerId));
    rows = await db.select().from(interactiveActivitiesTable).where(or(...conds)).orderBy(desc(interactiveActivitiesTable.createdAt));

    // Also anything reached through the distribution chain (learner/org/partner grants).
    const accessConds: SQL[] = [];
    if (u.id) accessConds.push(and(eq(activityAssignmentsTable.userId, u.id), eq(activityAssignmentsTable.tier, "learner")) as SQL);
    if (u.organisationId) accessConds.push(and(eq(activityAssignmentsTable.organisationId, u.organisationId), eq(activityAssignmentsTable.tier, "organisation")) as SQL);
    if (u.partnerId) accessConds.push(and(eq(activityAssignmentsTable.partnerId, u.partnerId), eq(activityAssignmentsTable.tier, "partner")) as SQL);
    if (accessConds.length) {
      const grants = await db.select({ activityId: activityAssignmentsTable.activityId }).from(activityAssignmentsTable)
        .where(and(ne(activityAssignmentsTable.status, "revoked"), or(...accessConds)));
      const have = new Set(rows.map((r) => r.id));
      const missing = [...new Set(grants.map((g) => g.activityId))].filter((id) => !have.has(id));
      if (missing.length) rows = [...rows, ...(await db.select().from(interactiveActivitiesTable).where(inArray(interactiveActivitiesTable.id, missing)))];
    }
    if (!canAuthorActivities(u.role)) rows = rows.filter((a) => a.published);
  }
  if (moduleId) rows = rows.filter((a) => a.moduleId === moduleId);
  if (courseId) rows = rows.filter((a) => a.courseId === courseId);

  // `mySubmitted` for the CALLING user only. The module page needs to know whether THIS
  // learner has done each activity before it can honestly say the module is finished;
  // the activity row alone only says the activity exists.
  const mine = await db
    .select({ activityId: activitySubmissionsTable.activityId })
    .from(activitySubmissionsTable)
    .where(eq(activitySubmissionsTable.userId, req.userId!));
  const submitted = new Set(mine.map((r) => r.activityId));

  res.json(rows.map((a) => ({ ...activityResponse(a), mySubmitted: submitted.has(a.id) })));
});

/** GET /activities/:id — scoped to tenant / library / assignment; unpublished = managers only. */
router.get("/activities/:id", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const [a] = await db.select().from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.id, req.params.id)).limit(1);
  if (!a) { res.status(404).json({ error: "Activity not found" }); return; }
  if (!activityInScope(u, a) && !(await hasActivityAssignmentAccess(u, a.id))) { res.status(404).json({ error: "Activity not found" }); return; }
  if (!a.published && !canManageActivity(u, a)) { res.status(404).json({ error: "Activity not found" }); return; }
  res.json(activityResponse(a));
});

const SOURCES = ["html", "embed", "ai"];
const DIFFS = ["foundational", "intermediate", "advanced"];

/** POST /activities */
router.post("/activities", requireAuth, requireAuthor, async (req, res) => {
  const u = req.dbUser! as U;
  const b = req.body ?? {};
  const title = String(b.title ?? "").trim();
  if (!title) { res.status(400).json({ error: "A title is required." }); return; }

  // Hub authors may publish to the shared library (org null); everyone else authors for their tenant.
  const isLibrary = hasHubAccess(u.role) && b.isLibrary === true;
  const organisationId = isLibrary ? null : (u.organisationId ?? u.partnerId ?? b.organisationId ?? null);

  const [row] = await db
    .insert(interactiveActivitiesTable)
    .values({
      organisationId,
      title,
      instructions: b.instructions ?? null,
      html: String(b.html ?? ""),
      source: SOURCES.includes(b.source) ? b.source : "html",
      embedUrl: b.embedUrl ?? null,
      kind: typeof b.kind === "string" && b.kind ? b.kind : "custom",
      bloomsLevel: b.bloomsLevel ?? null,
      difficulty: DIFFS.includes(b.difficulty) ? b.difficulty : null,
      isLibrary,
      tags: Array.isArray(b.tags) ? b.tags : null,
      courseId: b.courseId ?? null,
      moduleId: b.moduleId ?? null,
      maxScore: b.maxScore != null ? String(b.maxScore) : "100",
      published: Boolean(b.published ?? false),
      createdByUserId: u.id,
    })
    .returning();
  await logAudit(req, "activity.create", "activity", row.id, { title, organisationId, source: row.source });
  res.status(201).json(activityResponse(row));
});

/** PATCH /activities/:id */
router.patch("/activities/:id", requireAuth, requireAuthor, async (req, res) => {
  const u = req.dbUser! as U;
  const [existing] = await db.select().from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.id, req.params.id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Activity not found" }); return; }
  if (!canManageActivity(u, existing)) { res.status(403).json({ error: "Forbidden" }); return; }
  const b = req.body ?? {};
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (b.title !== undefined) patch.title = String(b.title);
  if (b.instructions !== undefined) patch.instructions = b.instructions;
  if (b.html !== undefined) patch.html = String(b.html);
  if (b.source !== undefined && SOURCES.includes(b.source)) patch.source = b.source;
  if (b.embedUrl !== undefined) patch.embedUrl = b.embedUrl;
  if (b.kind !== undefined) patch.kind = String(b.kind);
  if (b.bloomsLevel !== undefined) patch.bloomsLevel = b.bloomsLevel;
  if (b.difficulty !== undefined) patch.difficulty = DIFFS.includes(b.difficulty) ? b.difficulty : null;
  if (b.tags !== undefined) patch.tags = Array.isArray(b.tags) ? b.tags : null;
  if (b.courseId !== undefined) patch.courseId = b.courseId;
  if (b.moduleId !== undefined) patch.moduleId = b.moduleId;
  if (b.maxScore !== undefined) patch.maxScore = String(b.maxScore);
  if (b.published !== undefined) patch.published = Boolean(b.published);

  const [row] = await db.update(interactiveActivitiesTable).set(patch).where(eq(interactiveActivitiesTable.id, req.params.id)).returning();
  res.json(activityResponse(row));
});

/** DELETE /activities/:id */
router.delete("/activities/:id", requireAuth, requireAuthor, async (req, res) => {
  const u = req.dbUser! as U;
  const [existing] = await db.select().from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.id, req.params.id)).limit(1);
  if (!existing) { res.json({ ok: true }); return; }
  if (!canManageActivity(u, existing)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(activityAssignmentsTable).where(eq(activityAssignmentsTable.activityId, existing.id));
  await db.delete(activityEmbedLinksTable).where(eq(activityEmbedLinksTable.activityId, existing.id));
  await db.delete(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.id, existing.id));
  await logAudit(req, "activity.delete", "activity", existing.id, { title: existing.title });
  res.json({ ok: true });
});

/* ─────────────────────────── AI generation ─────────────────────────── */

/** POST /activities/extract — pull plain text from an uploaded document or a URL, so the AI
 *  generator can work from real course material (PDF/Word/PowerPoint/Excel/text/Google Docs). */
router.post("/activities/extract", requireAuth, requireAuthor, async (req, res) => {
  const { url, filename, dataBase64 } = req.body ?? {};
  try {
    let text = "";
    if (typeof dataBase64 === "string" && dataBase64) {
      const buf = Buffer.from(dataBase64, "base64");
      if (buf.length > 20 * 1024 * 1024) { res.status(400).json({ error: "That file is too large (max 20MB)." }); return; }
      text = await extractFromBuffer(String(filename || "file.txt"), buf);
    } else if (typeof url === "string" && url.trim()) {
      text = await extractFromUrl(url);
    } else {
      res.status(400).json({ error: "Provide a file or a URL." });
      return;
    }
    await logAudit(req, "activity.extract", "activity", "-", { source: dataBase64 ? "file" : "url", chars: text.length });
    res.json({ text, chars: text.length });
  } catch (err) {
    req.log?.error({ err }, "activity extract error");
    res.status(422).json({ error: err instanceof Error ? err.message : "Could not read that content." });
  }
});

/** POST /activities/generate — AI proposes a menu of gamified activities (not persisted). */
router.post("/activities/generate", requireAuth, requireAuthor, async (req, res) => {
  const content = String(req.body?.content ?? "").trim();
  if (content.length < 40) { res.status(400).json({ error: "Paste more course content so the generator has something to work from." }); return; }
  try {
    const activities = await generateActivities(content, {
      count: Number.isFinite(req.body?.count) ? req.body.count : 4,
      types: Array.isArray(req.body?.types) ? req.body.types : undefined,
      targetBloom: typeof req.body?.targetBloom === "string" ? req.body.targetBloom : null,
      targetDifficulty: typeof req.body?.targetDifficulty === "string" ? req.body.targetDifficulty : null,
    });
    await logAudit(req, "activity.generate", "activity", "-", { count: activities.length });
    res.json({ activities });
  } catch (err) {
    req.log?.error({ err }, "activity generate error");
    res.status(502).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
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
  // Being published makes an activity visible to its COURSE, not to the whole platform.
  // This route writes a gradebook result, so an unenrolled submitter perturbs a cohort's
  // grades. Activities that are deliberately course-less (standalone library items) keep
  // working -- there is no course to be enrolled on.
  if (activity.courseId && !(await canParticipateInCourse(req.dbUser!, activity.courseId))) {
    res.status(403).json({ error: "Forbidden" });
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

  // Roll the learner's assignment to completed so admin progress + reporting update.
  await db.update(activityAssignmentsTable)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(activityAssignmentsTable.userId, req.userId!), eq(activityAssignmentsTable.activityId, activity.id), eq(activityAssignmentsTable.tier, "learner"), ne(activityAssignmentsTable.status, "revoked")));

  // Refresh gradebook off-track state wherever this activity is a graded column.
  void onGradeEvent({ sourceType: "activity", sourceId: activity.id, userId: req.userId! });

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
    // A reviewed score can move a learner on/off track — refresh their gradebook alert.
    void onGradeEvent({ sourceType: "activity", sourceId: row.activityId, userId: row.userId });
    res.json(submissionResponse(row));
  },
);

/* ─────────────────────────── Public embed links ─────────────────────────── */

// GET /activities/:id/embed-links
router.get("/activities/:id/embed-links", requireAuth, requireAuthor, async (req, res) => {
  const u = req.dbUser! as U;
  const [a] = await db.select().from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.id, req.params.id)).limit(1);
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  if (!canManageActivity(u, a)) { res.status(403).json({ error: "Forbidden" }); return; }
  const links = await db.select().from(activityEmbedLinksTable).where(eq(activityEmbedLinksTable.activityId, a.id)).orderBy(desc(activityEmbedLinksTable.createdAt));
  res.json(links.map((l) => ({ id: l.id, token: l.token, label: l.label, isActive: l.isActive, accessCount: Number(l.accessCount), expiresAt: l.expiresAt?.toISOString() ?? null, createdAt: l.createdAt.toISOString() })));
});

// POST /activities/:id/embed-links — mint a public token (activity must be published).
router.post("/activities/:id/embed-links", requireAuth, requireAuthor, async (req, res) => {
  const u = req.dbUser! as U;
  const [a] = await db.select().from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.id, req.params.id)).limit(1);
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  if (!canManageActivity(u, a)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!a.published) { res.status(400).json({ error: "Publish the activity before sharing an embed link." }); return; }
  const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
  const [link] = await db.insert(activityEmbedLinksTable).values({ activityId: a.id, organisationId: a.organisationId, createdBy: u.id, token: randomBytes(24).toString("hex"), label: req.body?.label ?? null, expiresAt }).returning();
  await logAudit(req, "activity.embed_link_create", "activity", a.id, { linkId: link.id });
  res.status(201).json({ id: link.id, token: link.token, label: link.label, isActive: link.isActive, accessCount: 0, expiresAt: link.expiresAt?.toISOString() ?? null, createdAt: link.createdAt.toISOString() });
});

// DELETE /activities/:id/embed-links/:linkId — soft deactivate.
router.delete("/activities/:id/embed-links/:linkId", requireAuth, requireAuthor, async (req, res) => {
  const u = req.dbUser! as U;
  const [a] = await db.select().from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.id, req.params.id)).limit(1);
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  if (!canManageActivity(u, a)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.update(activityEmbedLinksTable).set({ isActive: false }).where(and(eq(activityEmbedLinksTable.id, req.params.linkId), eq(activityEmbedLinksTable.activityId, a.id)));
  await logAudit(req, "activity.embed_link_revoke", "activity", a.id, { linkId: req.params.linkId });
  res.status(204).send();
});

/* ─────────────────── Distribution / assignment chain (Partner -> Org -> Learner) ─────────────────── */

const TIERS = ["partner", "organisation", "learner"] as const;
type Tier = (typeof TIERS)[number];
const isTier = (x: unknown): x is Tier => typeof x === "string" && (TIERS as readonly string[]).includes(x);

function roleTier(role: string): Tier | null {
  if (isInstructionalDesigner(role)) return "partner";
  if (role === "partner_admin") return "organisation";
  if (role === "org_admin") return "learner";
  return null;
}

async function activeActivityAssignments(activityId: string): Promise<ActivityAssignment[]> {
  return db.select().from(activityAssignmentsTable).where(and(eq(activityAssignmentsTable.activityId, activityId), ne(activityAssignmentsTable.status, "revoked")));
}

async function hasActivityAssignmentAccess(u: U, activityId: string): Promise<boolean> {
  const conds: SQL[] = [];
  if (u.id) conds.push(and(eq(activityAssignmentsTable.userId, u.id), eq(activityAssignmentsTable.tier, "learner")) as SQL);
  if (u.organisationId) conds.push(and(eq(activityAssignmentsTable.organisationId, u.organisationId), eq(activityAssignmentsTable.tier, "organisation")) as SQL);
  if (u.partnerId) conds.push(and(eq(activityAssignmentsTable.partnerId, u.partnerId), eq(activityAssignmentsTable.tier, "partner")) as SQL);
  if (!conds.length) return false;
  const row = await db.select().from(activityAssignmentsTable).where(and(eq(activityAssignmentsTable.activityId, activityId), ne(activityAssignmentsTable.status, "revoked"), or(...conds))).limit(1);
  return row.length > 0;
}

function assignmentResponse(a: ActivityAssignment) {
  return {
    id: a.id, activityId: a.activityId, tier: a.tier,
    partnerId: a.partnerId, organisationId: a.organisationId, userId: a.userId, groupId: a.groupId,
    status: a.status, dueDate: a.dueDate?.toISOString() ?? null,
    assignedByName: a.assignedByName, assignedAt: a.assignedAt.toISOString(), completedAt: a.completedAt?.toISOString() ?? null,
  };
}

const canDistribute = (role: string) => isSuperAdmin(role) || isInstructionalDesigner(role) || role === "partner_admin" || role === "org_admin";

// GET /activities/:id/assign/targets
router.get("/activities/:id/assign/targets", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  if (!canDistribute(u.role)) { res.status(403).json({ error: "Your role cannot assign activities." }); return; }
  const [a] = await db.select().from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.id, req.params.id)).limit(1);
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  const superA = isSuperAdmin(u.role);
  const tier: Tier | null = superA ? (isTier(req.query.tier) ? req.query.tier : "partner") : roleTier(u.role);
  if (!tier) { res.status(403).json({ error: "Your role cannot assign activities." }); return; }
  const existing = await activeActivityAssignments(a.id);

  if (tier === "partner") {
    const partners = await db.select().from(partnersTable).orderBy(partnersTable.name);
    const set = new Set(existing.filter((x) => x.tier === "partner").map((x) => x.partnerId));
    res.json({ tier, targets: partners.map((p) => ({ id: p.id, name: p.name, alreadyAssigned: set.has(p.id) })), groups: [] });
    return;
  }
  if (tier === "organisation") {
    const partnerId = superA ? (typeof req.query.partnerId === "string" ? req.query.partnerId : null) : (u.partnerId ?? null);
    const orgs = partnerId ? await db.select().from(organisationsTable).where(eq(organisationsTable.partnerId, partnerId)).orderBy(organisationsTable.name)
      : (superA ? await db.select().from(organisationsTable).orderBy(organisationsTable.name) : []);
    const set = new Set(existing.filter((x) => x.tier === "organisation").map((x) => x.organisationId));
    res.json({ tier, targets: orgs.map((o) => ({ id: o.id, name: o.name, alreadyAssigned: set.has(o.id) })), groups: [] });
    return;
  }
  const orgId = superA ? (typeof req.query.organisationId === "string" ? req.query.organisationId : (u.organisationId ?? null)) : (u.organisationId ?? u.partnerId ?? null);
  const learners = orgId ? await db.select().from(usersTable).where(and(eq(usersTable.organisationId, orgId), eq(usersTable.role, "learner"))).orderBy(usersTable.firstName) : [];
  const set = new Set(existing.filter((x) => x.tier === "learner").map((x) => x.userId));
  let groups: { id: string; name: string; courseTitle: string | null; memberCount: number }[] = [];
  if (orgId) {
    const courses = await db.select().from(coursesTable).where(eq(coursesTable.tenantId, orgId));
    const courseIds = courses.map((cc) => cc.id);
    if (courseIds.length) {
      const cgs = await db.select().from(courseGroupsTable).where(inArray(courseGroupsTable.courseId, courseIds));
      const titleById = new Map(courses.map((cc) => [cc.id, cc.title]));
      const gm = cgs.length ? await db.select().from(courseGroupMembersTable).where(inArray(courseGroupMembersTable.groupId, cgs.map((g) => g.id))) : [];
      const counts = new Map<string, number>();
      gm.forEach((m) => counts.set(m.groupId, (counts.get(m.groupId) ?? 0) + 1));
      groups = cgs.map((g) => ({ id: g.id, name: g.name, courseTitle: titleById.get(g.courseId) ?? null, memberCount: counts.get(g.id) ?? 0 }));
    }
  }
  res.json({ tier, targets: learners.map((l) => ({ id: l.id, name: [l.firstName, l.lastName].filter(Boolean).join(" ") || l.email, alreadyAssigned: set.has(l.id) })), groups });
});

// POST /activities/:id/assign
router.post("/activities/:id/assign", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  if (!canDistribute(u.role)) { res.status(403).json({ error: "Your role cannot assign activities." }); return; }
  const [a] = await db.select().from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.id, req.params.id)).limit(1);
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  const superA = isSuperAdmin(u.role);
  const tier: Tier | null = superA ? (isTier(req.body?.tier) ? req.body.tier : null) : roleTier(u.role);
  if (!tier) { res.status(403).json({ error: superA ? "Specify a tier: partner, organisation or learner." : "Your role cannot assign activities." }); return; }

  const targetIds: string[] = Array.isArray(req.body?.targetIds) ? req.body.targetIds.filter((x: unknown) => typeof x === "string") : [];
  const groupId: string | null = typeof req.body?.groupId === "string" ? req.body.groupId : null;
  const dueDate = req.body?.dueDate ? new Date(req.body.dueDate) : null;
  const existing = await activeActivityAssignments(a.id);
  const assignerName = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
  const rows: (typeof activityAssignmentsTable.$inferInsert)[] = [];
  let skipped = 0;

  if (tier === "partner") {
    if (!hasHubAccess(u.role)) { res.status(403).json({ error: "Only Hub roles assign to partners." }); return; }
    const partners = targetIds.length ? await db.select().from(partnersTable).where(inArray(partnersTable.id, targetIds)) : [];
    const already = new Set(existing.filter((x) => x.tier === "partner").map((x) => x.partnerId));
    for (const p of partners) { if (already.has(p.id)) { skipped++; continue; } rows.push({ activityId: a.id, tier: "partner", partnerId: p.id, assignedBy: u.id, assignedByName: assignerName, dueDate }); }
  } else if (tier === "organisation") {
    const partnerId = superA ? (typeof req.body?.partnerId === "string" ? req.body.partnerId : null) : (u.partnerId ?? null);
    if (!superA) { const up = existing.some((x) => x.tier === "partner" && x.partnerId === partnerId); if (!partnerId || !up) { res.status(403).json({ error: "This activity has not been assigned to your partner yet." }); return; } }
    const orgs = targetIds.length ? await db.select().from(organisationsTable).where(inArray(organisationsTable.id, targetIds)) : [];
    const parent = existing.find((x) => x.tier === "partner" && x.partnerId === partnerId);
    const already = new Set(existing.filter((x) => x.tier === "organisation").map((x) => x.organisationId));
    for (const o of orgs) { if (!superA && o.partnerId !== partnerId) { skipped++; continue; } if (already.has(o.id)) { skipped++; continue; } rows.push({ activityId: a.id, tier: "organisation", organisationId: o.id, partnerId: o.partnerId, parentAssignmentId: parent?.id ?? null, assignedBy: u.id, assignedByName: assignerName, dueDate }); }
  } else {
    const orgId = superA ? (typeof req.body?.organisationId === "string" ? req.body.organisationId : (u.organisationId ?? null)) : (u.organisationId ?? u.partnerId ?? null);
    if (!superA) { const up = existing.some((x) => x.tier === "organisation" && x.organisationId === orgId); if (!orgId || !up) { res.status(403).json({ error: "This activity has not been assigned to your organisation yet." }); return; } }
    const learnerIds = new Set<string>(targetIds);
    if (groupId) { const members = await db.select().from(courseGroupMembersTable).where(eq(courseGroupMembersTable.groupId, groupId)); members.forEach((m) => learnerIds.add(m.userId)); }
    const ids = Array.from(learnerIds);
    const learners = ids.length ? await db.select().from(usersTable).where(inArray(usersTable.id, ids)) : [];
    const parent = existing.find((x) => x.tier === "organisation" && x.organisationId === orgId);
    const already = new Set(existing.filter((x) => x.tier === "learner").map((x) => x.userId));
    for (const l of learners) { if (l.role !== "learner") { skipped++; continue; } if (!superA && l.organisationId !== orgId) { skipped++; continue; } if (already.has(l.id)) { skipped++; continue; } rows.push({ activityId: a.id, tier: "learner", userId: l.id, organisationId: l.organisationId ?? orgId, groupId: groupId ?? null, parentAssignmentId: parent?.id ?? null, assignedBy: u.id, assignedByName: assignerName, dueDate }); }
  }

  if (!rows.length) { res.status(200).json({ created: 0, skipped, assignments: [] }); return; }
  const inserted = await db.insert(activityAssignmentsTable).values(rows).returning();
  await logAudit(req, "activity.assign", "activity", a.id, { tier, created: inserted.length, skipped });
  res.status(201).json({ created: inserted.length, skipped, assignments: inserted.map(assignmentResponse) });
});

// GET /activities/:id/assignments
router.get("/activities/:id/assignments", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const [a] = await db.select().from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.id, req.params.id)).limit(1);
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  let all = await db.select().from(activityAssignmentsTable).where(eq(activityAssignmentsTable.activityId, a.id)).orderBy(desc(activityAssignmentsTable.assignedAt));
  if (!hasHubAccess(u.role)) all = all.filter((x) => (!!u.partnerId && x.partnerId === u.partnerId) || (!!u.organisationId && x.organisationId === u.organisationId));
  const partnerIds = [...new Set(all.map((x) => x.partnerId).filter(Boolean))] as string[];
  const orgIds = [...new Set(all.map((x) => x.organisationId).filter(Boolean))] as string[];
  const userIds = [...new Set(all.map((x) => x.userId).filter(Boolean))] as string[];
  const [ps, os, us] = await Promise.all([
    partnerIds.length ? db.select().from(partnersTable).where(inArray(partnersTable.id, partnerIds)) : Promise.resolve([]),
    orgIds.length ? db.select().from(organisationsTable).where(inArray(organisationsTable.id, orgIds)) : Promise.resolve([]),
    userIds.length ? db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : Promise.resolve([]),
  ]);
  const pN = new Map(ps.map((p) => [p.id, p.name])); const oN = new Map(os.map((o) => [o.id, o.name]));
  const uN = new Map(us.map((x) => [x.id, [x.firstName, x.lastName].filter(Boolean).join(" ") || x.email]));
  res.json(all.map((x) => ({ ...assignmentResponse(x), targetName: x.tier === "partner" ? (pN.get(x.partnerId!) ?? null) : x.tier === "organisation" ? (oN.get(x.organisationId!) ?? null) : (uN.get(x.userId!) ?? null) })));
});

// GET /activity-assignments/my — the current learner's assigned activities.
router.get("/activity-assignments/my", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const rows = await db.select().from(activityAssignmentsTable)
    .where(and(eq(activityAssignmentsTable.userId, u.id), eq(activityAssignmentsTable.tier, "learner"), ne(activityAssignmentsTable.status, "revoked")))
    .orderBy(desc(activityAssignmentsTable.assignedAt));
  const ids = [...new Set(rows.map((r) => r.activityId))];
  const acts = ids.length ? await db.select().from(interactiveActivitiesTable).where(inArray(interactiveActivitiesTable.id, ids)) : [];
  const byId = new Map(acts.map((x) => [x.id, x]));
  res.json(rows.map((x) => { const act = byId.get(x.activityId); return { ...assignmentResponse(x), title: act?.title ?? null, instructions: act?.instructions ?? null, kind: act?.kind ?? null, bloomsLevel: act?.bloomsLevel ?? null, difficulty: act?.difficulty ?? null, published: act?.published ?? false }; }).filter((r) => r.title && r.published));
});

// DELETE /activity-assignments/:id — soft revoke + cascade descendants.
router.delete("/activity-assignments/:id", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const [a] = await db.select().from(activityAssignmentsTable).where(eq(activityAssignmentsTable.id, req.params.id)).limit(1);
  if (!a) { res.status(204).send(); return; }
  const can = hasHubAccess(u.role) || (!!u.partnerId && a.partnerId === u.partnerId) || (!!u.organisationId && a.organisationId === u.organisationId);
  if (!can) { res.status(403).json({ error: "Forbidden" }); return; }
  const revoke = new Set<string>([a.id]);
  let frontier = [a.id];
  for (let d = 0; d < 3 && frontier.length; d++) {
    const kids = await db.select().from(activityAssignmentsTable).where(inArray(activityAssignmentsTable.parentAssignmentId, frontier));
    frontier = kids.map((k) => k.id).filter((id) => !revoke.has(id));
    frontier.forEach((id) => revoke.add(id));
  }
  await db.update(activityAssignmentsTable).set({ status: "revoked", updatedAt: new Date() }).where(inArray(activityAssignmentsTable.id, Array.from(revoke)));
  await logAudit(req, "activity.assign_revoke", "activity", a.activityId, { assignmentId: a.id, revoked: revoke.size });
  res.status(204).send();
});

export default router;
