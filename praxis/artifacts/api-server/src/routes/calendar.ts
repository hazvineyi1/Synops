import { Router } from "express";
import { db } from "@workspace/db";
import { courseEventsTable, enrolmentsTable, assignmentsTable } from "@workspace/db";
import { eq, or, and, gte, lte, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// GET /calendar — all events for current user across enrolled courses + personal
router.get("/calendar", requireAuth, async (req, res) => {
  const { start, end } = req.query;
  const startDate = start ? new Date(start as string) : (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d; })();
  const endDate = end ? new Date(end as string) : (() => { const d = new Date(); d.setMonth(d.getMonth() + 2); return d; })();

  // Get enrolled course IDs
  const enrolled = await db.select({ courseId: enrolmentsTable.courseId })
    .from(enrolmentsTable).where(eq(enrolmentsTable.userId, req.userId!));
  const courseIds = enrolled.map(e => e.courseId);

  const events = await db.select().from(courseEventsTable)
    .where(or(eq(courseEventsTable.userId, req.userId!), isNull(courseEventsTable.userId)));

  // Also synthesise events from assignment due dates
  const assignments = await db.select().from(assignmentsTable);
  const assignmentEvents = assignments
    .filter(a => a.dueDate && a.published && courseIds.includes(a.courseId))
    .map(a => ({
      id: `assignment_due_${a.id}`,
      courseId: a.courseId,
      userId: null,
      title: `Due: ${a.title}`,
      description: `${Number(a.pointsPossible)} points`,
      startDate: a.dueDate!,
      endDate: null,
      allDay: true,
      type: "assignment" as const,
      linkedAssignmentId: a.id,
      color: "#ef4444",
      createdAt: a.createdAt,
    }));

  res.json([
    ...events.map(e => ({ ...e, startDate: e.startDate.toISOString(), endDate: e.endDate?.toISOString() ?? null, createdAt: e.createdAt.toISOString() })),
    ...assignmentEvents.map(e => ({ ...e, startDate: e.startDate.toISOString(), endDate: null, createdAt: e.createdAt.toISOString() })),
  ]);
});

// GET /courses/:courseId/events
router.get("/courses/:courseId/events", requireAuth, async (req, res) => {
  const events = await db.select().from(courseEventsTable).where(eq(courseEventsTable.courseId, req.params.courseId));
  res.json(events.map(e => ({ ...e, startDate: e.startDate.toISOString(), endDate: e.endDate?.toISOString() ?? null })));
});

// POST /calendar/events
router.post("/calendar/events", requireAuth, async (req, res) => {
  const { courseId, title, description, startDate, endDate, allDay, type, color } = req.body;
  const [event] = await db.insert(courseEventsTable).values({
    courseId: courseId ?? null, userId: req.userId, title, description,
    startDate: new Date(startDate), endDate: endDate ? new Date(endDate) : null,
    allDay: allDay ?? false, type: type ?? "other", color,
  }).returning();
  res.status(201).json({ ...event, startDate: event.startDate.toISOString() });
});

// PATCH /calendar/events/:eventId
router.patch("/calendar/events/:eventId", requireAuth, async (req, res) => {
  const { title, description, startDate, endDate, color } = req.body;
  const [updated] = await db.update(courseEventsTable)
    .set({ title, description, startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : undefined, color })
    .where(eq(courseEventsTable.id, req.params.eventId))
    .returning();
  res.json({ ...updated, startDate: updated.startDate.toISOString() });
});

// DELETE /calendar/events/:eventId
router.delete("/calendar/events/:eventId", requireAuth, async (req, res) => {
  await db.delete(courseEventsTable).where(eq(courseEventsTable.id, req.params.eventId));
  res.status(204).send();
});

export default router;
