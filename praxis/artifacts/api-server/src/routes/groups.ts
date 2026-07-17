import { Router } from "express";
import { db } from "@workspace/db";
import {
  courseGroupsTable,
  courseGroupMembersTable,
  usersTable,
  coursesTable,
  enrolmentsTable,
  gradebookAlertsTable,
  organisationsTable,
} from "@workspace/db";
import { eq, and, inArray, or, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { canAdministerOrg, canAccessCourse, type ScopedUser } from "../lib/roles";
import { computeCoachingHealth, type CoachingHealth } from "../lib/coachingHealth";
import { mailerConfigured, sendMail, appUrl, emailShell, type EmailBrand } from "../lib/mailer";
import { resolveEmailBrand } from "../lib/emailBrand";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const router = Router();

const fullName = (u: { firstName: string | null; lastName: string | null; email: string } | null | undefined) =>
  u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email : "Unknown";

// GET /courses/:courseId/matching — everything the coach-matching dashboard needs in one call:
// the course's sections (each with its coach + learners), all enrolled learners with their
// section + off-track flag, and the coaches available to lead a section. Facilitator-scoped.
router.get("/courses/:courseId/matching", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  const courseId = req.params.courseId;
  if (!(await canManageCourseSections(user, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const course = (await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, courseId) }))!;
  const tenantId = course.tenantId;

  // Sections + their members.
  const groups = await db.select().from(courseGroupsTable).where(eq(courseGroupsTable.courseId, courseId));
  const groupIds = groups.map((g) => g.id);
  const memberRows = groupIds.length
    ? await db
        .select({ m: courseGroupMembersTable, u: usersTable })
        .from(courseGroupMembersTable)
        .leftJoin(usersTable, eq(courseGroupMembersTable.userId, usersTable.id))
        .where(inArray(courseGroupMembersTable.groupId, groupIds))
    : [];

  // Flags for this course.
  const alerts = await db
    .select({ userId: gradebookAlertsTable.userId, status: gradebookAlertsTable.status })
    .from(gradebookAlertsTable)
    .where(
      and(
        eq(gradebookAlertsTable.courseId, courseId),
        inArray(gradebookAlertsTable.status, ["off_track", "at_risk"]),
        isNull(gradebookAlertsTable.resolvedAt),
      ),
    );
  const flagOf = new Map(alerts.map((a) => [a.userId, a.status]));

  // Coaches in the course's tenant (org-owned: coaches in that org; partner-owned: coaches across
  // the partner's orgs or attached to the partner directly).
  const partnerOrgs = await db
    .select({ id: organisationsTable.id })
    .from(organisationsTable)
    .where(eq(organisationsTable.partnerId, tenantId));
  const orgScope = [tenantId, ...partnerOrgs.map((o) => o.id)];
  const coachRows = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.role, "coach"),
        or(inArray(usersTable.organisationId, orgScope), eq(usersTable.partnerId, tenantId)),
      ),
    );

  // Assignment maps.
  const leaderOfGroup = new Map<string, { userId: string; name: string }>();
  const membersOfGroup = new Map<string, Array<{ userId: string; name: string; email: string; status: string | null }>>();
  const sectionOfLearner = new Map<string, { id: string; name: string }>();
  for (const g of groups) membersOfGroup.set(g.id, []);
  for (const r of memberRows) {
    const name = fullName(r.u);
    if (r.m.role === "leader") {
      leaderOfGroup.set(r.m.groupId, { userId: r.m.userId, name });
    } else {
      membersOfGroup.get(r.m.groupId)?.push({ userId: r.m.userId, name, email: r.u?.email ?? "", status: flagOf.get(r.m.userId) ?? null });
      const grp = groups.find((g) => g.id === r.m.groupId);
      if (grp && !sectionOfLearner.has(r.m.userId)) sectionOfLearner.set(r.m.userId, { id: grp.id, name: grp.name });
    }
  }

  const sections = groups.map((g) => {
    const leader = leaderOfGroup.get(g.id) ?? null;
    const members = membersOfGroup.get(g.id) ?? [];
    return { id: g.id, name: g.name, leaderUserId: leader?.userId ?? null, leaderName: leader?.name ?? null, members };
  });

  // Enrolled learners (users with the learner role).
  const enrolled = await db
    .select({ u: usersTable })
    .from(enrolmentsTable)
    .innerJoin(usersTable, eq(enrolmentsTable.userId, usersTable.id))
    .where(and(eq(enrolmentsTable.courseId, courseId), eq(usersTable.role, "learner")));
  const learners = enrolled.map(({ u }) => {
    const sec = sectionOfLearner.get(u.id) ?? null;
    return {
      userId: u.id,
      name: fullName(u),
      email: u.email,
      status: flagOf.get(u.id) ?? null,
      sectionId: sec?.id ?? null,
      sectionName: sec?.name ?? null,
    };
  });

  const sectionsLed = new Map<string, number>();
  for (const [, leader] of leaderOfGroup) sectionsLed.set(leader.userId, (sectionsLed.get(leader.userId) ?? 0) + 1);
  const coaches = coachRows.map((c) => ({ userId: c.id, name: fullName(c), email: c.email, sectionsLed: sectionsLed.get(c.id) ?? 0 }));

  const assigned = learners.filter((l) => l.sectionId).length;
  const flaggedTotal = learners.filter((l) => l.status).length;
  const flaggedUnassigned = learners.filter((l) => l.status && !l.sectionId).length;

  res.json({
    course: { id: course.id, title: course.title, tenantId },
    sections,
    learners,
    coaches,
    summary: { totalLearners: learners.length, assigned, unassigned: learners.length - assigned, flaggedTotal, flaggedUnassigned },
  });
});

/**
 * Section (course-group) management is a Facilitator action scoped to the course's org
 * (decision §4.2: cohort/section management = Org/Facilitator, own org). Returns true
 * only for a Super Admin, or a Facilitator whose org owns the course (course.tenantId).
 * Co-facilitators only VIEW their sections; they do not create or delete them.
 */
async function canManageCourseSections(user: ScopedUser, courseId: string): Promise<boolean> {
  if (!canAdministerOrg(user.role)) return false;
  const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, courseId) });
  if (!course) return false;
  return canAccessCourse(user, course);
}

// GET /coaching/health — org/partner-wide coaching effectiveness (facilitator-scoped). The
// management layer over the matching + intervention flow. Aggregation lives in lib/coachingHealth
// so the dashboard and the digest email share one source of truth.
router.get("/coaching/health", requireAuth, async (req, res) => {
  const user = req.dbUser as ScopedUser & { id: string; organisationId?: string | null; partnerId?: string | null };
  if (!canAdministerOrg(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(await computeCoachingHealth(user));
});

/** Compose the branded coaching-health digest email. */
function healthDigestHtml(health: CoachingHealth, brand: EmailBrand, appLink: string): string {
  const s = health.summary;
  const rate = s.resolutionRate == null ? "-" : `${s.resolutionRate}%`;
  const stat = (n: number | string, label: string, color?: string) =>
    `<td style="padding:0 18px 0 0"><div style="font-size:22px;font-weight:800${color ? `;color:${color}` : ""}">${n}</div><div style="font-size:11px;color:#8a9995;text-transform:uppercase;letter-spacing:1px">${label}</div></td>`;
  const topCoaches = health.coaches.filter((c) => c.flagged > 0).slice(0, 5);
  const rows = topCoaches
    .map((c) => `<tr><td style="padding:4px 0">${escapeHtml(c.name)}</td><td style="padding:4px 0;text-align:right;color:#b91c1c;font-weight:600">${c.flagged} flagged</td><td style="padding:4px 0;text-align:right;color:#4b5b57">${c.learners} learners</td></tr>`)
    .join("");
  const body =
    `<p>Here's your current coaching snapshot.</p>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 14px"><tr>` +
    stat(s.flaggedLearners, "Flagged") +
    stat(s.unassignedFlagged, "Unassigned", "#b91c1c") +
    stat(rate, "Resolved") +
    `</tr></table>` +
    (s.unassignedFlagged > 0
      ? `<p style="color:#b91c1c"><strong>${s.unassignedFlagged}</strong> flagged learner${s.unassignedFlagged === 1 ? " is" : "s are"} slipping through with no coach assigned — match them so someone owns the intervention.</p>`
      : `<p>Every flagged learner has a coach assigned.</p>`) +
    (rows ? `<p style="margin-top:12px;font-weight:600">Coaches with flagged learners</p><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">${rows}</table>` : "");
  return emailShell({ brand, heading: "Coaching health", bodyHtml: body, ctaLabel: "Open coaching health", ctaUrl: appLink });
}

// POST /coaching/health/digest — email the caller (an admin) the current coaching snapshot. This is
// the on-demand path; a scheduled weekly send is a Railway cron hitting this endpoint.
router.post("/coaching/health/digest", requireAuth, async (req, res) => {
  const user = req.dbUser as ScopedUser & { id: string; email?: string; organisationId?: string | null; partnerId?: string | null };
  if (!canAdministerOrg(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!mailerConfigured()) { res.json({ configured: false, sent: false, message: "Set RESEND_API_KEY + EMAIL_FROM to enable email." }); return; }
  const to = (typeof req.body?.to === "string" && req.body.to.trim()) || user.email;
  if (!to) { res.status(400).json({ error: "No recipient email on your account." }); return; }
  const health = await computeCoachingHealth(user);
  const brand = await resolveEmailBrand(user.partnerId ?? null);
  const r = await sendMail({
    to,
    fromName: brand.senderName ?? brand.displayName,
    subject: `Coaching health - ${health.summary.flaggedLearners} flagged, ${health.summary.unassignedFlagged} unassigned`,
    html: healthDigestHtml(health, brand, appUrl("/coaching/health")),
  });
  res.json({ configured: true, sent: r.ok, to, error: r.error });
});

// GET /courses/:courseId/groups
router.get("/courses/:courseId/groups", requireAuth, async (req, res) => {
  const groups = await db.select().from(courseGroupsTable).where(eq(courseGroupsTable.courseId, req.params.courseId));
  const withMembers = await Promise.all(groups.map(async g => {
    const memberRows = await db
      .select({ member: courseGroupMembersTable, user: usersTable })
      .from(courseGroupMembersTable)
      .leftJoin(usersTable, eq(courseGroupMembersTable.userId, usersTable.id))
      .where(eq(courseGroupMembersTable.groupId, g.id));
    return {
      ...g,
      members: memberRows.map(r => ({
        id: r.member.id, userId: r.member.userId, role: r.member.role,
        user: r.user ? { id: r.user.id, firstName: r.user.firstName, lastName: r.user.lastName, email: r.user.email } : null,
      })),
    };
  }));
  res.json(withMembers);
});

// POST /courses/:courseId/groups
router.post("/courses/:courseId/groups", requireAuth, async (req, res) => {
  if (!(await canManageCourseSections(req.dbUser!, req.params.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { name, description, maxMembers } = req.body;
  const [group] = await db.insert(courseGroupsTable).values({ courseId: req.params.courseId, name, description, maxMembers }).returning();
  res.status(201).json({ ...group, members: [] });
});

// PATCH /groups/:groupId
router.patch("/groups/:groupId", requireAuth, async (req, res) => {
  const group = await db.query.courseGroupsTable.findFirst({ where: eq(courseGroupsTable.id, req.params.groupId) });
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (!(await canManageCourseSections(req.dbUser!, group.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { name, description, maxMembers } = req.body;
  const [updated] = await db.update(courseGroupsTable).set({ name, description, maxMembers }).where(eq(courseGroupsTable.id, req.params.groupId)).returning();
  res.json(updated);
});

// DELETE /groups/:groupId
router.delete("/groups/:groupId", requireAuth, async (req, res) => {
  const group = await db.query.courseGroupsTable.findFirst({ where: eq(courseGroupsTable.id, req.params.groupId) });
  if (!group) { res.status(204).send(); return; }
  if (!(await canManageCourseSections(req.dbUser!, group.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(courseGroupMembersTable).where(eq(courseGroupMembersTable.groupId, req.params.groupId));
  await db.delete(courseGroupsTable).where(eq(courseGroupsTable.id, req.params.groupId));
  res.status(204).send();
});

// POST /groups/:groupId/join
router.post("/groups/:groupId/join", requireAuth, async (req, res) => {
  const existing = await db.query.courseGroupMembersTable.findFirst({
    where: and(eq(courseGroupMembersTable.groupId, req.params.groupId), eq(courseGroupMembersTable.userId, req.userId!)),
  });
  if (existing) { res.json(existing); return; }
  const [member] = await db.insert(courseGroupMembersTable).values({ groupId: req.params.groupId, userId: req.userId!, role: "member" }).returning();
  res.status(201).json(member);
});

// POST /groups/:groupId/members — a Facilitator assigns a user to a section, optionally
// as its "leader" (the section's Co-facilitator). This is how Co-facilitators become
// bound to the sections they teach (decision §8). Idempotent: re-assigning updates role.
router.post("/groups/:groupId/members", requireAuth, async (req, res) => {
  const { userId, role = "member" } = req.body as { userId: string; role?: "leader" | "member" };
  const group = await db.query.courseGroupsTable.findFirst({ where: eq(courseGroupsTable.id, req.params.groupId) });
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (!(await canManageCourseSections(req.dbUser!, group.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const existing = await db.query.courseGroupMembersTable.findFirst({
    where: and(eq(courseGroupMembersTable.groupId, req.params.groupId), eq(courseGroupMembersTable.userId, userId)),
  });
  if (existing) {
    const [updated] = await db.update(courseGroupMembersTable).set({ role }).where(eq(courseGroupMembersTable.id, existing.id)).returning();
    res.json(updated);
    return;
  }
  const [member] = await db.insert(courseGroupMembersTable).values({ groupId: req.params.groupId, userId, role }).returning();
  res.status(201).json(member);
});

// DELETE /groups/:groupId/members/:userId — a member may remove themselves; removing
// anyone else is a Facilitator action scoped to the course's org.
router.delete("/groups/:groupId/members/:userId", requireAuth, async (req, res) => {
  const actor = req.dbUser!;
  if (actor.id !== req.params.userId) {
    const group = await db.query.courseGroupsTable.findFirst({ where: eq(courseGroupsTable.id, req.params.groupId) });
    if (!group) { res.status(204).send(); return; }
    if (!(await canManageCourseSections(actor, group.courseId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
  await db.delete(courseGroupMembersTable).where(and(eq(courseGroupMembersTable.groupId, req.params.groupId), eq(courseGroupMembersTable.userId, req.params.userId)));
  res.status(204).send();
});

export default router;
