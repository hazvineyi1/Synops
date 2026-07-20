import { db } from "@workspace/db";
import {
  gradebookItemsTable,
  gradebookAlertsTable,
  coachPlansTable,
  enrolmentsTable,
  usersTable,
  courseGroupsTable,
  courseGroupMembersTable,
  coursesTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { recomputeLearnerAlert, REASON_LABEL, type AlertTransition } from "./gradebookEngine";
import { generateStudyPlan } from "./studyPlanEngine";
import { mailerConfigured, sendMail, appUrl, emailShell } from "./mailer";
import { resolveEmailBrand } from "./emailBrand";
import { coachPushConfigured, pushCatchUpToCoach } from "./coachPush";

/**
 * Off-track orchestration: recompute a learner's alert after a grade event and, when they
 * NEWLY cross into off_track, auto-generate an adaptive study plan and raise in-app alerts
 * to the learner, their section coach(es) and org admins. In-app only (email is deferred).
 *
 * Everything here is best-effort and wrapped so it can never break the grade-write path.
 */

const today = (): string => new Date().toISOString().slice(0, 10);

/** Learner + the staff who should be told when that learner falls behind in a course. */
async function offTrackStaff(courseId: string, learner: { id: string; organisationId?: string | null }): Promise<string[]> {
  const staff = new Set<string>();
  try {
    // Section coaches: leaders of groups in this course that contain the learner.
    const memberGroups = await db
      .select({ groupId: courseGroupMembersTable.groupId })
      .from(courseGroupMembersTable)
      .innerJoin(courseGroupsTable, eq(courseGroupMembersTable.groupId, courseGroupsTable.id))
      .where(and(eq(courseGroupMembersTable.userId, learner.id), eq(courseGroupsTable.courseId, courseId)));
    const groupIds = [...new Set(memberGroups.map((g) => g.groupId))];
    if (groupIds.length) {
      const leaders = await db
        .select({ userId: courseGroupMembersTable.userId })
        .from(courseGroupMembersTable)
        .where(and(inArray(courseGroupMembersTable.groupId, groupIds), eq(courseGroupMembersTable.role, "leader")));
      leaders.forEach((l) => staff.add(l.userId));
    }
    // Org admins for the learner's organisation.
    if (learner.organisationId) {
      const admins = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.organisationId, learner.organisationId),
            inArray(usersTable.role, ["org_admin", "partner_admin"]),
          ),
        );
      admins.forEach((a) => staff.add(a.id));
    }
  } catch {
    /* best-effort */
  }
  staff.delete(learner.id);
  return [...staff];
}

/** Handle a learner who just became off_track in a course: plan + notifications. */
async function handleNewOffTrack(courseId: string, userId: string, transition: AlertTransition): Promise<void> {
  const learner = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, courseId) });
  const courseTitle = course?.title ?? "your course";
  const reasonsText = (transition.reasons || []).map((r) => REASON_LABEL[r] || r).join("; ");

  // Auto-generate an adaptive study plan from the learner's gaps.
  let planCreated = false;
  let planRow: { id: string } | undefined;
  const plan = await generateStudyPlan({ courseId, userId, learnerName: learner?.firstName ?? null });
  if (plan) {
    try {
      await db
        .update(coachPlansTable)
        .set({ status: "completed", updatedAt: new Date() })
        .where(
          and(
            eq(coachPlansTable.userId, userId),
            eq(coachPlansTable.courseId, courseId),
            eq(coachPlansTable.source, "gradebook_alert"),
            eq(coachPlansTable.status, "active"),
          ),
        );
      const [row] = await db
        .insert(coachPlansTable)
        .values({
          userId,
          planDate: today(),
          rationale: plan.rationale,
          items: plan.items,
          status: "active",
          courseId,
          source: "gradebook_alert",
        })
        .returning();
      if (row) {
        planCreated = true;
        planRow = row;
        await db
          .update(gradebookAlertsTable)
          .set({ planId: row.id, notifiedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(gradebookAlertsTable.courseId, courseId), eq(gradebookAlertsTable.userId, userId)));
      }
    } catch {
      /* best-effort */
    }
  } else {
    await db
      .update(gradebookAlertsTable)
      .set({ notifiedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(gradebookAlertsTable.courseId, courseId), eq(gradebookAlertsTable.userId, userId)))
      .catch(() => undefined);
  }

  // Push the off-track learner into The Coach (the standalone AI study-coach app) so it provisions
  // them and sets up a ready-to-use catch-up plan they can open in the coach conversation. The gap
  // is the weak categories (or the off-track reasons); the content is the remedial plan's steps.
  // Best-effort, fire-and-forget; a safe no-op until COACH_API_URL + COACH_API_KEY are configured.
  if (plan && learner?.email && coachPushConfigured()) {
    const gapCats = [...new Set((plan.items.map((i) => i.category).filter(Boolean)) as string[])];
    const gap = gapCats.length
      ? `${courseTitle}: ${gapCats.join(", ")}`
      : `${courseTitle}${reasonsText ? ` (${reasonsText.toLowerCase()})` : ""}`;
    // Fire-and-forget so the grade path stays fast; when The Coach replies with the learner's
    // magic-link URL, persist it on the plan row so "Start catch-up" opens the AI coach directly.
    void pushCatchUpToCoach({
      learnerEmail: learner.email,
      learnerName: [learner.firstName, learner.lastName].filter(Boolean).join(" ") || null,
      examName: courseTitle,
      gap,
      planRationale: plan.rationale,
      content: plan.items.map((i) => ({ title: i.title, body: i.why })).filter((c) => c.title && c.body),
    })
      .then(async (pushed) => {
        if (pushed.ok && pushed.coachUrl && planRow) {
          await db
            .update(coachPlansTable)
            .set({ coachUrl: pushed.coachUrl, updatedAt: new Date() })
            .where(eq(coachPlansTable.id, planRow.id))
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }

  const learnerName = [learner?.firstName, learner?.lastName].filter(Boolean).join(" ") || "A learner";
  const staffIds = await offTrackStaff(courseId, { id: userId, organisationId: learner?.organisationId ?? null });

  // In-app notifications (always on).
  try {
    await db.insert(notificationsTable).values({
      userId,
      type: "system",
      title: planCreated ? "A study plan is ready to get you back on track" : "Let's get you back on track",
      body: `In ${courseTitle} we noticed you're falling behind${reasonsText ? ` (${reasonsText.toLowerCase()})` : ""}.${planCreated ? " We've built a short personalised plan for you." : " Your coach has been notified."}`,
      link: "/grades",
      courseId,
    });
    for (const sid of staffIds) {
      await db.insert(notificationsTable).values({
        userId: sid,
        type: "system",
        title: `${learnerName} may need support`,
        body: `${learnerName} is off track in ${courseTitle}${reasonsText ? `: ${reasonsText.toLowerCase()}` : ""}.`,
        link: `/courses/${courseId}/gradebook`,
        courseId,
        actorId: userId,
      });
    }
  } catch {
    /* best-effort */
  }

  // Email reports (only when a mail sender is configured; safe no-op otherwise).
  if (mailerConfigured()) {
    try {
      const reasonPhrase = reasonsText ? ` (${reasonsText.toLowerCase()})` : "";
      if (learner?.email) {
        const brand = await resolveEmailBrand(learner.partnerId);
        await sendMail({
          to: learner.email,
          fromName: brand.senderName ?? brand.displayName,
          subject: planCreated ? `Your study plan for ${courseTitle} is ready` : `Let's get you back on track in ${courseTitle}`,
          html: emailShell({
            brand,
            heading: "Let's get you back on track",
            bodyHtml: `Hi ${learner.firstName || "there"}, in <strong>${courseTitle}</strong> we noticed you're falling behind${reasonPhrase}. ${planCreated ? "We've built a short, personalised plan to help you catch up — work through it a step at a time." : "Your coach has been notified and will help you catch up."}`,
            ctaLabel: planCreated ? "View my study plan" : "View my grades",
            ctaUrl: appUrl("/grades"),
          }),
        });
      }
      if (staffIds.length) {
        const staff = await db
          .select({ id: usersTable.id, email: usersTable.email, partnerId: usersTable.partnerId })
          .from(usersTable)
          .where(inArray(usersTable.id, staffIds));
        const gradebookUrl = appUrl(`/courses/${courseId}/gradebook`);
        for (const s of staff) {
          if (!s.email) continue;
          const brand = await resolveEmailBrand(s.partnerId);
          await sendMail({
            to: s.email,
            fromName: brand.senderName ?? brand.displayName,
            subject: `${learnerName} may need support in ${courseTitle}`,
            html: emailShell({
              brand,
              heading: `${learnerName} is off track`,
              bodyHtml: `<strong>${learnerName}</strong> is off track in <strong>${courseTitle}</strong>${reasonsText ? `: ${reasonsText.toLowerCase()}` : ""}.${planCreated ? " An adaptive study plan has been generated for them automatically." : ""}`,
              ctaLabel: "Open the gradebook",
              ctaUrl: gradebookUrl,
            }),
          });
        }
      }
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Called after any grade-affecting event. Resolves which course gradebooks the source feeds,
 * recomputes the learner's alert in each, and orchestrates plan + notifications on a new
 * off_track transition. Never throws.
 */
export async function onGradeEvent(opts: {
  sourceType: "assignment" | "case" | "activity" | "manual";
  sourceId?: string | null;
  courseId?: string | null;
  userId: string;
  notify?: boolean; // default true; staff manual edits pass false to just refresh state
}): Promise<void> {
  const notify = opts.notify !== false;
  try {
    const courseIds = new Set<string>();
    if (opts.courseId) courseIds.add(opts.courseId);
    if (opts.sourceId) {
      const items = await db
        .select({ courseId: gradebookItemsTable.courseId })
        .from(gradebookItemsTable)
        .where(and(eq(gradebookItemsTable.sourceType, opts.sourceType), eq(gradebookItemsTable.sourceId, opts.sourceId)));
      items.forEach((i) => courseIds.add(i.courseId));
    }
    for (const courseId of courseIds) {
      const enrolled = await db.query.enrolmentsTable.findFirst({
        where: and(eq(enrolmentsTable.courseId, courseId), eq(enrolmentsTable.userId, opts.userId)),
      });
      if (!enrolled) continue;
      const transition = await recomputeLearnerAlert(courseId, opts.userId);
      if (notify && transition.becameOffTrack) {
        await handleNewOffTrack(courseId, opts.userId, transition);
      }
    }
  } catch {
    /* never break the caller */
  }
}

/** Run the off-track sweep across a whole course (used by the manual scan endpoint). */
export async function scanCourse(courseId: string): Promise<{ evaluated: number; offTrack: number; alerted: number }> {
  let evaluated = 0;
  let offTrack = 0;
  let alerted = 0;
  const learners = await db
    .select({ userId: enrolmentsTable.userId })
    .from(enrolmentsTable)
    .where(eq(enrolmentsTable.courseId, courseId));
  for (const l of learners) {
    evaluated += 1;
    const t = await recomputeLearnerAlert(courseId, l.userId);
    if (t.status === "off_track") offTrack += 1;
    if (t.becameOffTrack) {
      alerted += 1;
      await handleNewOffTrack(courseId, l.userId, t);
    }
  }
  return { evaluated, offTrack, alerted };
}

/**
 * On-demand, self-serve version for the learner opening their Coach hub: recompute the learner's own
 * off-track status across every enrolled course and, for any course where they are off track and have
 * no active plan yet, build the gap-targeted catch-up plan. This is what makes the Coach reflect
 * reality (instead of a stale "on track") the moment a learner is behind, even without a grade event.
 * Best-effort and never throws.
 */
export async function ensureLearnerCoachPlans(userId: string): Promise<void> {
  try {
    const enrols = await db.select({ courseId: enrolmentsTable.courseId }).from(enrolmentsTable).where(eq(enrolmentsTable.userId, userId));
    const courseIds = [...new Set(enrols.map((e) => e.courseId))];
    for (const courseId of courseIds) {
      let transition: AlertTransition;
      try { transition = await recomputeLearnerAlert(courseId, userId); } catch { continue; }
      if (transition.status !== "off_track") continue;
      const existing = await db.query.coachPlansTable.findFirst({
        where: and(eq(coachPlansTable.userId, userId), eq(coachPlansTable.courseId, courseId), eq(coachPlansTable.source, "gradebook_alert"), eq(coachPlansTable.status, "active")),
      });
      if (existing) continue;
      const learner = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
      const plan = await generateStudyPlan({ courseId, userId, learnerName: learner?.firstName ?? null });
      if (!plan) continue;
      const [row] = await db.insert(coachPlansTable).values({
        userId, planDate: today(), rationale: plan.rationale, items: plan.items, status: "active", courseId, source: "gradebook_alert",
      }).returning();
      if (row) {
        await db.update(gradebookAlertsTable).set({ planId: row.id, updatedAt: new Date() }).where(and(eq(gradebookAlertsTable.courseId, courseId), eq(gradebookAlertsTable.userId, userId)));
      }
    }
  } catch { /* best-effort - the hub still renders */ }
}
