import { Router } from "express";
import { db } from "@workspace/db";
import {
  orgClassesTable, orgClassLearnersTable, orgClassCoursesTable,
  organisationsTable, usersTable, enrolmentsTable, coursesTable, brandThemesTable,
  authSessionsTable,
} from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { hashPassword, newSessionToken, cookieOptions, sessionExpiry, clientIp, SESSION_COOKIE } from "../lib/auth";
import { logAudit } from "../lib/audit";

/**
 * Self-enrolment by shareable cohort link (spec: learners join a cohort from a link they receive on
 * WhatsApp). A class gets a short join code; opening /join/:code lets a new learner register and set a
 * password, and enrols them into that cohort's organisation and its courses in one step - no admin
 * provisioning needed. The join code lives in a self-creating table so no migration is required.
 */

const router = Router();

async function ensureJoinTable() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS class_join_codes (code text PRIMARY KEY, class_id text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now())`);
}
function genCode() {
  // 7-char, unambiguous (no 0/o/1/l/i) so it is easy to read out over the phone.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 7; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
function baseUrl(req: { protocol: string; get: (h: string) => string | undefined }) {
  return process.env.APP_URL?.replace(/\/$/, "") || `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

// POST /classes/:classId/join-link - create (or fetch) the cohort's self-enrol link. Admin only.
router.post("/classes/:classId/join-link", requireAuth, async (req, res) => {
  const actor = req.dbUser!;
  if (!["super_admin", "partner_admin", "org_admin"].includes(actor.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const cls = await db.query.orgClassesTable.findFirst({ where: eq(orgClassesTable.id, req.params.classId) });
  if (!cls) { res.status(404).json({ error: "Class not found" }); return; }
  if (actor.role === "partner_admin" && actor.partnerId !== cls.partnerId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (actor.role === "org_admin" && actor.organisationId !== cls.orgId) { res.status(403).json({ error: "Forbidden" }); return; }

  await ensureJoinTable();
  const found = await db.execute(sql`SELECT code FROM class_join_codes WHERE class_id = ${cls.id} LIMIT 1`);
  let code = (found.rows[0] as { code?: string } | undefined)?.code;
  if (!code) {
    // Retry a couple of times in the astronomically unlikely event of a collision.
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = genCode();
      try {
        await db.execute(sql`INSERT INTO class_join_codes (code, class_id) VALUES (${candidate}, ${cls.id})`);
        code = candidate;
      } catch { /* unique violation - try again */ }
    }
    if (!code) { res.status(500).json({ error: "Could not allocate a join code." }); return; }
  }
  res.json({ code, url: `${baseUrl(req)}/join/${code}` });
});

// GET /enrol/:code - PUBLIC. Cohort summary for the join landing page (no auth).
router.get("/enrol/:code", async (req, res) => {
  await ensureJoinTable();
  const codeRow = await db.execute(sql`SELECT class_id FROM class_join_codes WHERE code = ${req.params.code} LIMIT 1`);
  const classId = (codeRow.rows[0] as { class_id?: string } | undefined)?.class_id;
  if (!classId) { res.status(404).json({ error: "This link is not valid." }); return; }

  const cls = await db.query.orgClassesTable.findFirst({ where: eq(orgClassesTable.id, classId) });
  if (!cls) { res.status(404).json({ error: "This cohort no longer exists." }); return; }
  const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, cls.orgId) });

  const courseLinks = await db.select({ courseId: orgClassCoursesTable.courseId }).from(orgClassCoursesTable).where(eq(orgClassCoursesTable.classId, classId));
  const courseIds = courseLinks.map((c) => c.courseId);
  const courses = courseIds.length
    ? await db.select({ id: coursesTable.id, title: coursesTable.title }).from(coursesTable).where(inArray(coursesTable.id, courseIds))
    : [];

  let brand: { displayName?: string | null; primaryColor?: string | null; secondaryColor?: string | null; logoUrl?: string | null } | null = null;
  if (cls.partnerId) {
    const t = await db.query.brandThemesTable.findFirst({ where: eq(brandThemesTable.tenantId, cls.partnerId) });
    if (t) brand = { displayName: t.displayName, primaryColor: t.primaryColor, secondaryColor: t.secondaryColor, logoUrl: t.logoUrl };
  }

  res.json({
    className: cls.name,
    orgName: org?.name ?? null,
    courses: courses.map((c) => ({ title: c.title })),
    brand,
  });
});

// POST /enrol/:code - PUBLIC. Register a new learner and enrol them into the cohort.
router.post("/enrol/:code", async (req, res) => {
  await ensureJoinTable();
  const codeRow = await db.execute(sql`SELECT class_id FROM class_join_codes WHERE code = ${req.params.code} LIMIT 1`);
  const classId = (codeRow.rows[0] as { class_id?: string } | undefined)?.class_id;
  if (!classId) { res.status(404).json({ error: "This link is not valid." }); return; }

  const cls = await db.query.orgClassesTable.findFirst({ where: eq(orgClassesTable.id, classId) });
  if (!cls) { res.status(404).json({ error: "This cohort no longer exists." }); return; }

  const email = String(req.body?.email ?? "").toLowerCase().trim();
  const password = String(req.body?.password ?? "");
  const firstName = (req.body?.firstName ?? "").trim() || null;
  const lastName = (req.body?.lastName ?? "").trim() || null;
  if (!email || !email.includes("@")) { res.status(400).json({ error: "Enter a valid email address." }); return; }
  if (password.length < 8) { res.status(400).json({ error: "Choose a password of at least 8 characters." }); return; }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length) { res.status(409).json({ error: "An account with that email already exists. Please sign in instead." }); return; }

  // Create the learner (active, with their chosen password).
  const [learner] = await db.insert(usersTable).values({
    email, firstName, lastName, role: "learner", status: "active",
    passwordHash: hashPassword(password), partnerId: cls.partnerId ?? null, organisationId: cls.orgId,
    lastLoginAt: new Date(),
  }).returning();

  // Add to the cohort roster (if not already present).
  const roster = await db.select({ id: orgClassLearnersTable.id }).from(orgClassLearnersTable)
    .where(and(eq(orgClassLearnersTable.classId, classId), eq(orgClassLearnersTable.learnerId, learner.id)));
  if (roster.length === 0) await db.insert(orgClassLearnersTable).values({ classId, learnerId: learner.id });

  // Enrol into every course attached to the cohort.
  const courseLinks = await db.select({ courseId: orgClassCoursesTable.courseId }).from(orgClassCoursesTable).where(eq(orgClassCoursesTable.classId, classId));
  const courseIds = courseLinks.map((c) => c.courseId);
  if (courseIds.length) {
    await db.insert(enrolmentsTable).values(courseIds.map((courseId) => ({ userId: learner.id, courseId, status: "active" as const })));
  }

  // Keep the org member count honest.
  if (cls.orgId) {
    const members = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.organisationId, cls.orgId));
    await db.update(organisationsTable).set({ memberCount: members.length, updatedAt: new Date() }).where(eq(organisationsTable.id, cls.orgId));
  }

  // Log them straight in so the journey is a single step.
  const token = newSessionToken();
  await db.insert(authSessionsTable).values({
    token, userId: learner.id, ipAddress: clientIp(req as any),
    userAgent: (req.headers["user-agent"] as string) ?? null, expiresAt: sessionExpiry(),
  });
  await logAudit(req, "learner.self_enrol", "user", learner.id, { classId, courses: courseIds.length });

  res.cookie(SESSION_COOKIE, token, cookieOptions());
  res.status(201).json({ ok: true, enrolled: courseIds.length, user: { id: learner.id, email, role: "learner", firstName, lastName } });
});

export default router;
