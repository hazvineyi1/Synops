import { Router } from "express";
import { db } from "@workspace/db";
import { gradebookEntriesTable, assignmentsTable, usersTable, enrolmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// GET /courses/:courseId/gradebook — instructor/admin view
router.get("/courses/:courseId/gradebook", requireAuth, async (req, res) => {
  const { courseId } = req.params;

  const assignments = await db.select().from(assignmentsTable)
    .where(eq(assignmentsTable.courseId, courseId))
    .orderBy(assignmentsTable.position);

  const enrolled = await db
    .select({ enrolment: enrolmentsTable, user: usersTable })
    .from(enrolmentsTable)
    .leftJoin(usersTable, eq(enrolmentsTable.userId, usersTable.id))
    .where(eq(enrolmentsTable.courseId, courseId));

  const entries = await db.select().from(gradebookEntriesTable).where(eq(gradebookEntriesTable.courseId, courseId));

  // Build matrix: learner → { assignmentId → entry }
  const matrix = enrolled.map(({ enrolment, user }) => {
    const learnerEntries: Record<string, typeof gradebookEntriesTable.$inferSelect> = {};
    entries.filter(e => e.userId === enrolment.userId).forEach(e => { learnerEntries[e.assignmentId] = e; });

    const scores = assignments.map(a => {
      const entry = learnerEntries[a.id];
      return {
        assignmentId: a.id,
        score: entry?.score ? Number(entry.score) : null,
        possibleScore: Number(a.pointsPossible),
        letterGrade: entry?.letterGrade ?? null,
        excused: entry?.excused ?? false,
        missing: entry?.missing ?? false,
        late: entry?.late ?? false,
      };
    });

    const totalEarned = scores.reduce((s, e) => s + (e.score ?? 0), 0);
    const totalPossible = scores.reduce((s, e) => s + (e.excused ? 0 : e.possibleScore), 0);
    const overallPercent = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : null;

    return {
      userId: enrolment.userId,
      user: user ? { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email } : null,
      enrolmentStatus: enrolment.status,
      finalGrade: enrolment.finalGrade,
      overallPercent,
      scores,
    };
  });

  res.json({ assignments: assignments.map(a => ({ id: a.id, title: a.title, pointsPossible: Number(a.pointsPossible), dueDate: a.dueDate?.toISOString() ?? null })), learners: matrix });
});

// GET /courses/:courseId/gradebook/me — learner's own grades
router.get("/courses/:courseId/gradebook/me", requireAuth, async (req, res) => {
  const assignments = await db.select().from(assignmentsTable)
    .where(eq(assignmentsTable.courseId, req.params.courseId))
    .orderBy(assignmentsTable.position);

  const entries = await db.select().from(gradebookEntriesTable)
    .where(and(eq(gradebookEntriesTable.courseId, req.params.courseId), eq(gradebookEntriesTable.userId, req.userId!)));

  const entryMap: Record<string, typeof gradebookEntriesTable.$inferSelect> = {};
  entries.forEach(e => { entryMap[e.assignmentId] = e; });

  const grades = assignments.map(a => {
    const entry = entryMap[a.id];
    return {
      assignmentId: a.id,
      assignmentTitle: a.title,
      dueDate: a.dueDate?.toISOString() ?? null,
      pointsPossible: Number(a.pointsPossible),
      score: entry?.score ? Number(entry.score) : null,
      letterGrade: entry?.letterGrade ?? null,
      excused: entry?.excused ?? false,
      missing: entry?.missing ?? false,
      late: entry?.late ?? false,
    };
  });

  const totalEarned = grades.reduce((s, g) => s + (g.score ?? 0), 0);
  const totalPossible = grades.reduce((s, g) => s + (g.excused ? 0 : g.pointsPossible), 0);

  res.json({ grades, totalEarned, totalPossible, overallPercent: totalPossible > 0 ? (totalEarned / totalPossible) * 100 : null });
});

// PATCH /gradebook-entries/:entryId
router.patch("/gradebook-entries/:entryId", requireAuth, async (req, res) => {
  const { score, letterGrade, excused } = req.body;
  const [updated] = await db.update(gradebookEntriesTable)
    .set({ score, letterGrade, excused, updatedAt: new Date() })
    .where(eq(gradebookEntriesTable.id, req.params.entryId))
    .returning();
  res.json(updated);
});

export default router;
