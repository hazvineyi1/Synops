import { Router } from "express";
import { db } from "@workspace/db";
import { courseEventsTable, enrolmentsTable, assignmentsTable, deliverySessionsTable } from "@workspace/db";
import { eq, or, and, gte, lte, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { canParticipateInCourse, canStaffActOnCourse } from "../lib/scope";

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

  // Live sessions / workshops for the learner's enrolled courses. A scheduled workshop the
  // learner is expected to attend but that never appears on their calendar is a missed
  // session waiting to happen, so these are synthesised in as "class_session" events (that
  // enum value already existed with no producer). Sessions with no course are org-wide
  // internal ones and are not surfaced to the learner here.
  const sessions = courseIds.length
    ? await db.select().from(deliverySessionsTable)
    : [];
  const sessionEvents = sessions
    .filter((s) => s.courseId && courseIds.includes(s.courseId))
    .map((s) => ({
      id: `delivery_session_${s.id}`,
      courseId: s.courseId!,
      userId: null,
      title: s.title,
      description: [
        s.sessionType.replace(/_/g, " "),
        s.location ? `at ${s.location}` : null,
        `${s.durationMinutes} min`,
      ].filter(Boolean).join(" · "),
      startDate: s.scheduledAt,
      endDate: new Date(s.scheduledAt.getTime() + s.durationMinutes * 60_000),
      allDay: false,
      type: "class_session" as const,
      linkedAssignmentId: null,
      color: "#0ea5e9",
      createdAt: s.createdAt,
    }));

  res.json([
    ...events.map(e => ({ ...e, startDate: e.startDate.toISOString(), endDate: e.endDate?.toISOString() ?? null, createdAt: e.createdAt.toISOString() })),
    ...assignmentEvents.map(e => ({ ...e, startDate: e.startDate.toISOString(), endDate: null, createdAt: e.createdAt.toISOString() })),
    ...sessionEvents.map(e => ({ ...e, startDate: e.startDate.toISOString(), endDate: e.endDate.toISOString(), createdAt: e.createdAt.toISOString() })),
  ]);
});

/**
 * Who may edit or delete a calendar event.
 *
 * Both routes previously took an eventId and wrote, with no ownership check at all -- any
 * authenticated user could rewrite or delete any event on the platform, including another
 * cohort's deadlines. An event belongs either to the person who made it (personal) or to a
 * course (staff of that course).
 */
async function ownsEvent(req: any, res: any, eventId: string): Promise<boolean> {
  const ev = await db.query.courseEventsTable.findFirst({ where: eq(courseEventsTable.id, eventId) });
  if (!ev) { res.status(404).json({ error: "Event not found" }); return false; }
  if (ev.userId && ev.userId === req.userId) return true;
  if (ev.courseId && (await canStaffActOnCourse(req.dbUser!, ev.courseId))) return true;
  res.status(403).json({ error: "Forbidden" });
  return false;
}

// GET /courses/:courseId/events
router.get("/courses/:courseId/events", requireAuth, async (req, res) => {
  if (!(await canParticipateInCourse(req.dbUser!, req.params.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const events = await db.select().from(courseEventsTable).where(eq(courseEventsTable.courseId, req.params.courseId));
  res.json(events.map(e => ({ ...e, startDate: e.startDate.toISOString(), endDate: e.endDate?.toISOString() ?? null })));
});

// POST /calendar/events
router.post("/calendar/events", requireAuth, async (req, res) => {
  const { courseId, title, description, startDate, endDate, allDay, type, color } = req.body;
  // courseId is caller-supplied. Without this, anyone could post an event onto any cohort's
  // calendar. A null courseId is a personal event and stays unrestricted.
  if (courseId && !(await canParticipateInCourse(req.dbUser!, courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [event] = await db.insert(courseEventsTable).values({
    courseId: courseId ?? null, userId: req.userId, title, description,
    startDate: new Date(startDate), endDate: endDate ? new Date(endDate) : null,
    allDay: allDay ?? false, type: type ?? "other", color,
  }).returning();
  res.status(201).json({ ...event, startDate: event.startDate.toISOString() });
});

// PATCH /calendar/events/:eventId
router.patch("/calendar/events/:eventId", requireAuth, async (req, res) => {
  if (!(await ownsEvent(req, res, req.params.eventId))) return;
  const { title, description, startDate, endDate, color } = req.body;
  const [updated] = await db.update(courseEventsTable)
    .set({ title, description, startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : undefined, color })
    .where(eq(courseEventsTable.id, req.params.eventId))
    .returning();
  res.json({ ...updated, startDate: updated.startDate.toISOString() });
});

// DELETE /calendar/events/:eventId
router.delete("/calendar/events/:eventId", requireAuth, async (req, res) => {
  if (!(await ownsEvent(req, res, req.params.eventId))) return;
  await db.delete(courseEventsTable).where(eq(courseEventsTable.id, req.params.eventId));
  res.status(204).send();
});

export default router;
