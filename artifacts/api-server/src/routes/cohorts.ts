import { Router } from "express";
import crypto from "node:crypto";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import {
  institutionsTable,
  cohortsTable,
  cohortMembersTable,
  conceptsTable,
  checkpointsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";

const router = Router();

// Readable, hard-to-guess cohort join code.
function genJoinCode(): string {
  return crypto
    .randomBytes(8)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 7)
    .toUpperCase();
}

// POST /institutions — create an institution; the creator is its admin.
router.post("/institutions", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : "";
  if (!name) {
    res.status(400).json({ error: "An institution name is required." });
    return;
  }
  const [institution] = await db
    .insert(institutionsTable)
    .values({ name, ownerId: userId })
    .returning();
  res.status(201).json(institution);
});

// GET /institutions/mine — institutions the user administers.
router.get("/institutions/mine", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const rows = await db
    .select()
    .from(institutionsTable)
    .where(eq(institutionsTable.ownerId, userId))
    .orderBy(desc(institutionsTable.id));
  res.json(rows);
});

// POST /cohorts — create a cohort under an institution the user owns.
router.post("/cohorts", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const institutionId = Number(req.body?.institutionId);
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : "";
  const examName =
    typeof req.body?.examName === "string" && req.body.examName.trim()
      ? req.body.examName.trim().slice(0, 120)
      : null;
  if (!institutionId || !name) {
    res.status(400).json({ error: "institutionId and a cohort name are required." });
    return;
  }

  const inst = await db
    .select()
    .from(institutionsTable)
    .where(eq(institutionsTable.id, institutionId))
    .limit(1);
  if (!inst[0] || inst[0].ownerId !== userId) {
    res.status(403).json({ error: "You do not administer that institution." });
    return;
  }

  // Insert with a unique join code, retrying on the rare collision.
  let cohort;
  for (let i = 0; i < 4 && !cohort; i++) {
    const [row] = await db
      .insert(cohortsTable)
      .values({ institutionId, name, examName, joinCode: genJoinCode(), ownerId: userId })
      .onConflictDoNothing()
      .returning();
    cohort = row;
  }
  if (!cohort) {
    res.status(500).json({ error: "Could not create the cohort. Please try again." });
    return;
  }

  // The instructor is also a member (as instructor).
  await db
    .insert(cohortMembersTable)
    .values({ cohortId: cohort.id, userId, role: "instructor" })
    .onConflictDoNothing();

  res.status(201).json(cohort);
});

// GET /cohorts/mine — cohorts the user belongs to, with role and member count.
router.get("/cohorts/mine", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const memberships = await db
    .select()
    .from(cohortMembersTable)
    .where(eq(cohortMembersTable.userId, userId));
  const cohortIds = memberships.map((m) => m.cohortId);
  if (cohortIds.length === 0) {
    res.json([]);
    return;
  }

  const cohorts = await db.select().from(cohortsTable).where(inArray(cohortsTable.id, cohortIds));
  const allMembers = await db
    .select({ cohortId: cohortMembersTable.cohortId })
    .from(cohortMembersTable)
    .where(inArray(cohortMembersTable.cohortId, cohortIds));
  const countByCohort = new Map<number, number>();
  for (const m of allMembers) countByCohort.set(m.cohortId, (countByCohort.get(m.cohortId) ?? 0) + 1);

  const roleByCohort = new Map(memberships.map((m) => [m.cohortId, m.role]));
  const cohortById = new Map(cohorts.map((c) => [c.id, c]));

  const result = cohortIds
    .map((id) => {
      const c = cohortById.get(id);
      if (!c) return null;
      const role = roleByCohort.get(id) ?? "member";
      const isInstructor = role === "instructor" || c.ownerId === userId;
      return {
        id: c.id,
        name: c.name,
        examName: c.examName,
        role,
        memberCount: countByCohort.get(id) ?? 0,
        joinCode: isInstructor ? c.joinCode : undefined, // only instructors see/share the code
      };
    })
    .filter(Boolean);

  res.json(result);
});

// POST /cohorts/join — join a cohort by its code.
router.post("/cohorts/join", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
  if (!code) {
    res.status(400).json({ error: "Enter a cohort code." });
    return;
  }
  const rows = await db.select().from(cohortsTable).where(eq(cohortsTable.joinCode, code)).limit(1);
  const cohort = rows[0];
  if (!cohort) {
    res.status(404).json({ error: "No cohort found for that code." });
    return;
  }
  await db
    .insert(cohortMembersTable)
    .values({ cohortId: cohort.id, userId, role: "member" })
    .onConflictDoNothing();
  res.json({ joined: true, cohort: { id: cohort.id, name: cohort.name, examName: cohort.examName } });
});

// GET /cohorts/:id/dashboard — instructor view of member progress.
router.get("/cohorts/:id/dashboard", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const cohortId = Number(req.params.id);
  if (!cohortId) {
    res.status(400).json({ error: "Invalid cohort." });
    return;
  }

  const cohortRows = await db.select().from(cohortsTable).where(eq(cohortsTable.id, cohortId)).limit(1);
  const cohort = cohortRows[0];
  if (!cohort) {
    res.status(404).json({ error: "Cohort not found." });
    return;
  }

  // Authorize: the cohort instructor or the owning institution's admin.
  let authorized = cohort.ownerId === userId;
  if (!authorized) {
    const inst = await db
      .select()
      .from(institutionsTable)
      .where(eq(institutionsTable.id, cohort.institutionId))
      .limit(1);
    authorized = inst[0]?.ownerId === userId;
  }
  if (!authorized) {
    res.status(403).json({ error: "Only the instructor can view this dashboard." });
    return;
  }

  const members = await db
    .select()
    .from(cohortMembersTable)
    .where(eq(cohortMembersTable.cohortId, cohortId));
  const memberIds = members.map((m) => m.userId);
  if (memberIds.length === 0) {
    res.json({ cohort: { id: cohort.id, name: cohort.name, examName: cohort.examName }, members: [], aggregate: null });
    return;
  }

  const [users, concepts, checkpoints] = await Promise.all([
    db.select().from(usersTable).where(inArray(usersTable.id, memberIds)),
    db.select().from(conceptsTable).where(inArray(conceptsTable.userId, memberIds)),
    db.select().from(checkpointsTable).where(inArray(checkpointsTable.userId, memberIds)),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));

  const perMember = members.map((m) => {
    const mine = concepts.filter((c) => c.userId === m.userId);
    const myChecks = checkpoints.filter((c) => c.userId === m.userId && c.coachGrade !== null);
    const total = mine.length;
    const mastered = mine.filter((c) => c.mastery >= 0.8).length;
    const avgMastery = total > 0 ? mine.reduce((s, c) => s + c.mastery, 0) / total : 0;
    const accuracy =
      myChecks.length > 0 ? myChecks.reduce((s, c) => s + (c.coachGrade ?? 0), 0) / (myChecks.length * 3) : 0;
    const readinessPercent = Math.round((avgMastery * 0.6 + (accuracy || avgMastery) * 0.4) * 100);
    const lastDates = myChecks.map((c) => c.date).filter(Boolean).sort();
    const u = userById.get(m.userId);
    return {
      userId: m.userId,
      name: u?.name ?? null,
      email: u?.email ?? null,
      role: m.role,
      conceptsTotal: total,
      mastered,
      checkpointsCompleted: myChecks.length,
      accuracyPct: Math.round(accuracy * 100),
      readinessPercent,
      lastActive: lastDates.length > 0 ? lastDates[lastDates.length - 1] : null,
    };
  });

  const learners = perMember.filter((m) => m.role !== "instructor");
  const aggregate =
    learners.length > 0
      ? {
          learners: learners.length,
          avgReadiness: Math.round(learners.reduce((s, m) => s + m.readinessPercent, 0) / learners.length),
          avgMastered: Math.round((learners.reduce((s, m) => s + m.mastered, 0) / learners.length) * 10) / 10,
          totalCheckpoints: learners.reduce((s, m) => s + m.checkpointsCompleted, 0),
        }
      : null;

  res.json({
    cohort: { id: cohort.id, name: cohort.name, examName: cohort.examName },
    members: perMember,
    aggregate,
  });
});

export default router;
