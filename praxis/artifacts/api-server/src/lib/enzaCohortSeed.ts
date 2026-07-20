import { db } from "@workspace/db";
import {
  partnersTable, organisationsTable, usersTable,
  modulesTable, beatsTable, assignmentsTable, assignmentSubmissionsTable,
  coursePartnerAssignmentsTable,
  enrolmentsTable, orgClassesTable, orgClassLearnersTable, orgClassCoursesTable, orgClassStaffTable,
  beatProgressTable, submissionsTable, gradebookAlertsTable, coachMessagesTable,
  deliverySessionsTable, attendanceRecordsTable,
} from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/auth";

/**
 * Seeds a realistic delivery ORGANISATION under the "Enza Global Media" partner: a cohort of real-
 * feeling township / rural SMME entrepreneurs (fictional personas, not the real named alumni),
 * an org admin and a coach, enrolments into Enza's assigned BizAscend courses, and enough progress /
 * grades / coaching data to show FOUR distinct levels of understanding:
 *
 *   1. Nomsa Dlamini  - ADVANCED / excelling  (~92% done, high grades, on_track)
 *   2. Sipho Khumalo  - ON TRACK / solid      (~58% done, solid grades, on_track)
 *   3. Lerato Mokoena - AT RISK / struggling  (~30% done, low grades + missing summative, coach intervention)
 *   4. Thabo Nkosi    - JUST STARTED / novice (~8% done, only the first module opened, no grades yet)
 *
 * Depends on seedEnza() having created the partner + its 15 courses first. Idempotent: if the org
 * already exists it is a no-op.
 */

const ENZA_SLUG = "enza-global";
const ORG_NAME = "Enza BizAscend Programme";

function firstOrNull<T>(rows: T[]): T | null {
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Heal the org_classes / org_class_* tables. `CREATE TABLE IF NOT EXISTS` from earlier deploys never
 * adds columns to a table that already existed, so a table created before partner_id / created_by were
 * introduced is missing them - and then EVERY Drizzle query (which selects all columns) fails. Adding
 * the columns idempotently repairs that drift so the cohort seed and the classes UI both work.
 */
async function healClassTables(): Promise<void> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS org_classes (id text PRIMARY KEY, org_id text NOT NULL, partner_id text, name text NOT NULL, created_by text, created_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`ALTER TABLE org_classes ADD COLUMN IF NOT EXISTS partner_id text`);
  await db.execute(sql`ALTER TABLE org_classes ADD COLUMN IF NOT EXISTS created_by text`);
  await db.execute(sql`ALTER TABLE org_classes ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS org_class_learners (id text PRIMARY KEY, class_id text NOT NULL, learner_id text NOT NULL)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS org_class_courses (id text PRIMARY KEY, class_id text NOT NULL, course_id text NOT NULL)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS org_class_staff (id text PRIMARY KEY, class_id text NOT NULL, staff_id text NOT NULL, role text NOT NULL DEFAULT 'facilitator')`);
  await db.execute(sql`ALTER TABLE org_class_staff ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'facilitator'`);
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// Standardised test sign-in for the four demo learners, so the founder can log in as each level.
// student1 = advanced, student2 = on-track, student3 = at-risk, student4 = novice (creation order).
const LEARNER_TEST_PASSWORD = "Enzatest123";
const learnerTestEmail = (index1Based: number) => `enza@student${index1Based}.test`;

/**
 * Self-healing: GUARANTEES the four demo learners exist with working test logins
 * (enza@student1.test .. enza@student4.test, shared password, active) AND are enrolled in the cohort's
 * courses at their level. Reuses learners already in the org (renaming them in creation order so
 * student1 is the advanced learner); creates any that are missing; and only adds enrolments/progress
 * for a learner who has none yet, so it never duplicates a good seed. Runs on every seed click, so a
 * partially-seeded cohort is repaired into a known-good, loggable state. Passwords are hashed server-side.
 */
async function ensureTestLearners(partnerId: string, orgId: string): Promise<string[]> {
  // Cohort class (first one) and its course list; fall back to the partner's assigned courses.
  const cls = firstOrNull(await db.select().from(orgClassesTable).where(eq(orgClassesTable.orgId, orgId)).orderBy(asc(orgClassesTable.createdAt)));
  let courseIds: string[] = [];
  if (cls) {
    const links = await db.select({ courseId: orgClassCoursesTable.courseId }).from(orgClassCoursesTable).where(eq(orgClassCoursesTable.classId, cls.id));
    courseIds = links.map((l) => l.courseId);
  }
  if (courseIds.length === 0) {
    const assigned = await db.select().from(coursePartnerAssignmentsTable).where(eq(coursePartnerAssignmentsTable.partnerId, partnerId));
    courseIds = assigned.map((a) => a.courseId).slice(0, 4);
  }

  // Ordered beats per course, for realistic progress.
  const courseBeats: Record<string, { beatId: string; moduleId: string }[]> = {};
  for (const courseId of courseIds) {
    const mods = await db.select().from(modulesTable).where(eq(modulesTable.courseId, courseId)).orderBy(asc(modulesTable.order));
    const list: { beatId: string; moduleId: string }[] = [];
    for (const m of mods) {
      const bs = await db.select().from(beatsTable).where(eq(beatsTable.moduleId, m.id)).orderBy(asc(beatsTable.createdAt));
      for (const b of bs) list.push({ beatId: b.id, moduleId: m.id });
    }
    courseBeats[courseId] = list;
  }

  const existing = await db.select().from(usersTable)
    .where(and(eq(usersTable.organisationId, orgId), eq(usersTable.role, "learner")))
    .orderBy(asc(usersTable.createdAt));
  const hash = hashPassword(LEARNER_TEST_PASSWORD);
  const emails: string[] = [];
  const learnerIds: string[] = [];

  // PASS 1 - GUARANTEE THE ACCOUNTS. This is all that login needs, so nothing below may throw here.
  for (let i = 0; i < PERSONAS.length; i++) {
    const p = PERSONAS[i];
    const email = learnerTestEmail(i + 1);
    const profile = {
      email, passwordHash: hash, status: "active" as const, role: "learner" as const,
      partnerId, organisationId: orgId, firstName: p.firstName, lastName: p.lastName,
      phone: p.phone, learningStyle: p.learningStyle, updatedAt: new Date(),
    };

    // Update EVERY row already on this email (so a stray duplicate can never shadow the real account
    // with a null password at login time); else adopt the i-th existing learner; else create fresh.
    const updated = await db.update(usersTable).set(profile).where(eq(usersTable.email, email)).returning({ id: usersTable.id });
    let learnerId: string;
    if (updated.length > 0) {
      learnerId = updated[0].id;
    } else if (existing[i]) {
      learnerId = existing[i].id;
      await db.update(usersTable).set(profile).where(eq(usersTable.id, learnerId));
    } else {
      const [created] = await db.insert(usersTable).values(profile).returning();
      learnerId = created.id;
    }
    emails.push(email);
    learnerIds.push(learnerId);

    if (cls) {
      const link = await db.select({ id: orgClassLearnersTable.id }).from(orgClassLearnersTable)
        .where(and(eq(orgClassLearnersTable.classId, cls.id), eq(orgClassLearnersTable.learnerId, learnerId)));
      if (link.length === 0) await db.insert(orgClassLearnersTable).values({ classId: cls.id, learnerId });
    }
  }

  // PASS 2 - enrolments + progress. Each insert is isolated so a hiccup on one (e.g. a beat-progress
  // drift or duplicate) can never stop the OTHER enrolments - which is what makes a learner see courses.
  for (let i = 0; i < PERSONAS.length; i++) {
    const p = PERSONAS[i];
    const learnerId = learnerIds[i];
    let already = 0;
    try { already = (await db.select({ id: enrolmentsTable.id }).from(enrolmentsTable).where(eq(enrolmentsTable.userId, learnerId))).length; } catch { /* ignore */ }
    if (already > 0 || courseIds.length === 0) continue;
    const myCourses = courseIds.slice(0, p.courseCount);
    for (let ci = 0; ci < myCourses.length; ci++) {
      const courseId = myCourses[ci];
      const completed = ci < p.completedCount;
      try {
        await db.insert(enrolmentsTable).values({
          userId: learnerId, courseId, status: completed ? "completed" : "active",
          enrolledAt: daysAgo(45 - ci * 3), completedAt: completed ? daysAgo(7 + ci * 5) : null,
        });
      } catch { /* one enrolment failing must not block the rest */ }
      try {
        const beats = courseBeats[courseId] ?? [];
        const frac = completed ? 1 : p.progress;
        const viewCount = Math.max(p.key === "novice" ? 1 : 0, Math.ceil(beats.length * frac));
        const rows = beats.slice(0, viewCount).map((b, idx) => ({
          userId: learnerId, beatId: b.beatId, moduleId: b.moduleId, courseId,
          secondsSpent: 60 + (idx % 5) * 20,
          firstViewedAt: daysAgo(40 - ci * 4), lastViewedAt: daysAgo(Math.max(1, 28 - ci * 4)),
        }));
        if (rows.length > 0) await db.insert(beatProgressTable).values(rows).onConflictDoNothing();
      } catch { /* progress is cosmetic */ }
    }
  }

  return emails;
}

/**
 * Re-reads each test learner and confirms the shared password actually validates and the account is
 * active + unique. Returns a human-readable verification the endpoint surfaces, so a login failure can
 * be diagnosed from the seed's own response instead of guesswork.
 */
async function verifyTestLearners(partnerId: string): Promise<{ ok: number; total: number; assigned: number; detail: string }> {
  let assigned = 0;
  try { assigned = (await db.select().from(coursePartnerAssignmentsTable).where(eq(coursePartnerAssignmentsTable.partnerId, partnerId))).length; } catch { /* ignore */ }
  const parts: string[] = [];
  let ok = 0;
  for (let i = 0; i < PERSONAS.length; i++) {
    const email = learnerTestEmail(i + 1);
    const rows = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (rows.length === 0) { parts.push(`${email}: MISSING`); continue; }
    const u = rows[0];
    const pwOk = verifyPassword(LEARNER_TEST_PASSWORD, u.passwordHash);
    let courses = 0;
    try { courses = (await db.select({ id: enrolmentsTable.id }).from(enrolmentsTable).where(eq(enrolmentsTable.userId, u.id))).length; } catch { /* ignore */ }
    const dup = rows.length > 1 ? ` (${rows.length} dupes)` : "";
    if (pwOk && u.status === "active") { ok++; parts.push(`${email}: OK ${courses}c${dup}`); }
    else parts.push(`${email}: ${!pwOk ? "bad-password" : u.status} ${courses}c${dup}`);
  }
  return { ok, total: PERSONAS.length, assigned, detail: parts.join("; ") };
}

// People in the cohort. Learner emails use their own micro-business domains for realism.
const ORG_ADMIN = { email: "zanele.mthembu@enzaglobalmedia.co.za", firstName: "Zanele", lastName: "Mthembu" };
const COACH = { email: "bongani.sithole@enzaglobalmedia.co.za", firstName: "Bongani", lastName: "Sithole" };

interface Persona {
  key: "advanced" | "on_track" | "at_risk" | "novice";
  email: string; firstName: string; lastName: string;
  venture: string; location: string; phone: string;
  learningStyle: string;
  // fraction of each enrolled course's beats that have been viewed
  progress: number;
  // grade band applied to graded assignments (min..max)
  grade: [number, number];
  // number of the cohort's ordered courses this learner is enrolled in
  courseCount: number;
  // how many of those enrolments are fully completed (from the front of the list)
  completedCount: number;
  lastLoginDaysAgo: number | null;
}

const PERSONAS: Persona[] = [
  {
    key: "advanced",
    email: "nomsa@nomsasbakes.co.za", firstName: "Nomsa", lastName: "Dlamini",
    venture: "Nomsa's Bakes (home bakery)", location: "Soweto, Gauteng", phone: "+27 82 145 6620",
    learningStyle: "visual", progress: 0.92, grade: [86, 94], courseCount: 4, completedCount: 2, lastLoginDaysAgo: 1,
  },
  {
    key: "on_track",
    email: "sipho@kotacorner.co.za", firstName: "Sipho", lastName: "Khumalo",
    venture: "Sipho's Kota Corner (street food & catering)", location: "Katlehong, Gauteng", phone: "+27 83 902 1174",
    learningStyle: "kinesthetic", progress: 0.58, grade: [70, 78], courseCount: 3, completedCount: 1, lastLoginDaysAgo: 3,
  },
  {
    key: "at_risk",
    email: "lerato@leratoliving.co.za", firstName: "Lerato", lastName: "Mokoena",
    venture: "Lerato Living (handmade decor & crafts)", location: "Diepsloot, Gauteng", phone: "+27 71 448 3390",
    learningStyle: "reading_writing", progress: 0.30, grade: [46, 56], courseCount: 2, completedCount: 0, lastLoginDaysAgo: 12,
  },
  {
    key: "novice",
    email: "thabo@thabocornerstore.co.za", firstName: "Thabo", lastName: "Nkosi",
    venture: "Thabo's Corner Store (spaza shop)", location: "Daveyton, Gauteng", phone: "+27 84 663 7712",
    learningStyle: "auditory", progress: 0.08, grade: [0, 0], courseCount: 1, completedCount: 0, lastLoginDaysAgo: 2,
  },
];

/** Find or create a user by email; always (re)sets role/org/partner scoping. */
async function upsertUser(u: {
  email: string; firstName: string; lastName: string; role: "org_admin" | "coach" | "learner";
  partnerId: string; organisationId: string; phone?: string; learningStyle?: string;
  coachPersonality?: "socratic_mentor" | "warm_encourager" | "strategic_analyst" | "drill_sergeant";
  lastLoginDaysAgo?: number | null;
}) {
  const existing = firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, u.email)));
  const fields = {
    firstName: u.firstName, lastName: u.lastName, role: u.role, status: "active" as const,
    partnerId: u.partnerId, organisationId: u.organisationId,
    phone: u.phone ?? null, learningStyle: u.learningStyle ?? null,
    coachPersonality: u.coachPersonality ?? ("socratic_mentor" as const),
    lastLoginAt: u.lastLoginDaysAgo == null ? null : daysAgo(u.lastLoginDaysAgo),
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(usersTable).set(fields).where(eq(usersTable.id, existing.id));
    return existing.id;
  }
  const [created] = await db.insert(usersTable).values({ email: u.email, ...fields }).returning();
  return created.id;
}

export async function seedEnzaCohort(): Promise<{ created: boolean; orgId?: string; learners?: number; message?: string }> {
  const partner = firstOrNull(await db.select().from(partnersTable).where(eq(partnersTable.slug, ENZA_SLUG)));
  if (!partner) return { created: false, message: "Provision Enza Global first (the partner and its courses must exist)." };

  // Repair any org_classes column drift BEFORE we touch those tables (this was the seed's real failure).
  await healClassTables();

  // Idempotent: if the cohort org already exists, do nothing.
  const existingOrg = firstOrNull(
    await db.select().from(organisationsTable)
      .where(and(eq(organisationsTable.partnerId, partner.id), eq(organisationsTable.name, ORG_NAME))),
  );
  if (existingOrg) {
    const emails = await ensureTestLearners(partner.id, existingOrg.id);
    const v = await verifyTestLearners(partner.id);
    return { created: false, orgId: existingOrg.id, learners: emails.length, message: `Logins ${v.ok}/${v.total} verified (password ${LEARNER_TEST_PASSWORD}). Enza has ${v.assigned} courses assigned. ${v.detail}` };
  }

  // 1. Organisation (the delivery tenant) + its cohort class
  const [org] = await db.insert(organisationsTable).values({
    name: ORG_NAME, partnerId: partner.id, industry: "SMME Enterprise Development",
  }).returning();

  const [cls] = await db.insert(orgClassesTable).values({
    orgId: org.id, partnerId: partner.id, name: "BizAscend Starter - Gauteng Cohort (Feb 2026)",
  }).returning();

  // 2. People
  const adminId = await upsertUser({ ...ORG_ADMIN, role: "org_admin", partnerId: partner.id, organisationId: org.id, lastLoginDaysAgo: 1 });
  const coachId = await upsertUser({ ...COACH, role: "coach", partnerId: partner.id, organisationId: org.id, coachPersonality: "warm_encourager", lastLoginDaysAgo: 0 });
  await db.insert(orgClassStaffTable).values([
    { classId: cls.id, staffId: coachId, role: "coach" },
    { classId: cls.id, staffId: adminId, role: "administrator" },
  ]);

  // 3. Enza's assigned courses (ordered), so enrolments point at real BizAscend content.
  const assigned = await db.select().from(coursePartnerAssignmentsTable)
    .where(eq(coursePartnerAssignmentsTable.partnerId, partner.id));
  const courseIds = assigned.map((a) => a.courseId);
  if (courseIds.length === 0) return { created: false, orgId: org.id, message: "No courses are assigned to Enza yet - provision Enza Global first." };

  // Register the cohort's shared course list on the class (first up-to-4 courses).
  const classCourseIds = courseIds.slice(0, 4);
  await db.insert(orgClassCoursesTable).values(classCourseIds.map((courseId) => ({ classId: cls.id, courseId })));

  // Pre-fetch modules, ordered beats, and the assignment for each of those courses (one query set).
  const courseModules: Record<string, { id: string; title: string }[]> = {};
  const moduleBeats: Record<string, string[]> = {};
  const courseAssignment: Record<string, string | null> = {};
  for (const courseId of classCourseIds) {
    const mods = await db.select().from(modulesTable).where(eq(modulesTable.courseId, courseId)).orderBy(asc(modulesTable.order));
    courseModules[courseId] = mods.map((m) => ({ id: m.id, title: m.title }));
    for (const m of mods) {
      const bs = await db.select().from(beatsTable).where(eq(beatsTable.moduleId, m.id)).orderBy(asc(beatsTable.createdAt));
      moduleBeats[m.id] = bs.map((b) => b.id);
    }
    const asg = firstOrNull(await db.select().from(assignmentsTable).where(eq(assignmentsTable.courseId, courseId)));
    courseAssignment[courseId] = asg ? asg.id : null;
  }

  // 4-8. Rich delivery data (progress, grades, alerts, coaching thread, attendance). Wrapped so that a
  // failure in any of this cosmetic seeding can NEVER stop the guaranteed learner logins in step 9.
  try {
  let learnerCount = 0;
  for (const p of PERSONAS) {
    const userId = await upsertUser({
      email: p.email, firstName: p.firstName, lastName: p.lastName, role: "learner",
      partnerId: partner.id, organisationId: org.id, phone: p.phone, learningStyle: p.learningStyle,
      lastLoginDaysAgo: p.lastLoginDaysAgo,
    });
    learnerCount++;
    await db.insert(orgClassLearnersTable).values({ classId: cls.id, learnerId: userId });

    const myCourses = classCourseIds.slice(0, p.courseCount);
    for (let ci = 0; ci < myCourses.length; ci++) {
      const courseId = myCourses[ci];
      const completed = ci < p.completedCount;
      const frac = completed ? 1 : p.progress;
      const gradePct = Math.round(p.grade[0] + Math.random() * (p.grade[1] - p.grade[0]));

      // Enrolment
      await db.insert(enrolmentsTable).values({
        userId, courseId,
        status: completed ? "completed" : "active",
        finalGrade: completed ? String(gradePct) : null,
        completedAt: completed ? daysAgo(7 + ci * 5) : null,
        enrolledAt: daysAgo(45 - ci * 3),
      });

      // Beat progress (front-loaded: the first `frac` of ordered beats have been viewed)
      const mods = courseModules[courseId] ?? [];
      const allBeats: string[] = [];
      const beatToModule: Record<string, string> = {};
      for (const m of mods) for (const b of (moduleBeats[m.id] ?? [])) { allBeats.push(b); beatToModule[b] = m.id; }
      const viewCount = Math.max(p.key === "novice" ? 1 : 0, Math.ceil(allBeats.length * frac));
      const rows = allBeats.slice(0, viewCount).map((beatId, idx) => ({
        userId, beatId, moduleId: beatToModule[beatId], courseId,
        secondsSpent: 45 + Math.floor(Math.random() * 150),
        firstViewedAt: daysAgo(40 - ci * 4 - Math.floor(idx / 3)),
        lastViewedAt: daysAgo(Math.max(1, 30 - ci * 4 - Math.floor(idx / 3))),
      }));
      if (rows.length > 0) await db.insert(beatProgressTable).values(rows);

      // Graded assignment submission (skip the novice, who has not submitted anything yet)
      const assignmentId = courseAssignment[courseId];
      if (assignmentId && p.key !== "novice") {
        const missing = p.key === "at_risk" && ci === myCourses.length - 1; // struggler has one outstanding summative
        await db.insert(assignmentSubmissionsTable).values({
          assignmentId, userId,
          status: missing ? "not_submitted" : "graded",
          score: missing ? null : String(gradePct),
          feedback: missing ? null : feedbackFor(p.key, gradePct),
          gradedBy: missing ? null : coachId,
        });
      }
    }

    // 5. Gradebook alert (drives the on_track / at_risk dashboards) on the learner's primary course.
    const primaryCourse = myCourses[myCourses.length - 1];
    if (p.key === "advanced") {
      await db.insert(gradebookAlertsTable).values({ courseId: primaryCourse, userId, status: "on_track", masteryPct: "91.00", reasons: [] });
    } else if (p.key === "on_track") {
      await db.insert(gradebookAlertsTable).values({ courseId: primaryCourse, userId, status: "on_track", masteryPct: "74.00", reasons: [] });
    } else if (p.key === "at_risk") {
      const [alert] = await db.insert(gradebookAlertsTable).values({
        courseId: primaryCourse, userId, status: "off_track", masteryPct: "52.00",
        reasons: ["mastery_low", "missing_summative"],
        coachNote: "Lerato has strong product instincts but stalls on the numbers work. Missed the pricing worksheet deadline and mastery has dipped. Booked a 1:1 to rebuild the costing sheet together and set a smaller weekly milestone.",
        notifiedAt: daysAgo(5),
      }).returning();
      // Two-way coaching thread on the intervention
      await db.insert(coachMessagesTable).values([
        { alertId: alert.id, fromUserId: coachId, fromRole: "coach", body: "Hi Lerato, I noticed the pricing worksheet is still outstanding and it's affecting your progress. No stress - let's tackle it together. Can you send me your current material costs and we'll build the sheet on our call Thursday?", createdAt: daysAgo(4) },
        { alertId: alert.id, fromUserId: userId, fromRole: "learner", body: "Thank you Coach Bongani. I got stuck on the markup part and then fell behind. I'll gather my costs tonight. Thursday works.", createdAt: daysAgo(4) },
        { alertId: alert.id, fromUserId: coachId, fromRole: "coach", body: "Perfect. I've broken Module 3 into three smaller steps for you in your study plan so it feels less heavy. Start with just Step 1 before Thursday - that's all.", createdAt: daysAgo(3) },
      ]);
    }
    // novice: no alert yet (too early to evaluate)

    // 6. A reflective module submission with coach feedback for the two stronger learners.
    if (p.key === "advanced" || p.key === "on_track") {
      const firstCourse = myCourses[0];
      const mod = (courseModules[firstCourse] ?? [])[0];
      if (mod) {
        await db.insert(submissionsTable).values({
          userId, moduleId: mod.id, moduleTitle: mod.title,
          title: `${p.firstName}'s reflection: ${mod.title}`,
          contentText: p.key === "advanced"
            ? `Applying this to ${p.venture}: I mapped my customer segments and realised my weekday office-lunch orders are a separate segment from weekend celebration cakes, each needing its own offer and price. I've already tested a pre-order form for the weekday segment.`
            : `For ${p.venture} I worked through the canvas. My key insight was that my kotas sell on speed and consistency, not variety - so I'm cutting my menu down and standardising portions to protect my margin.`,
          status: "reviewed",
          coachFeedback: p.key === "advanced"
            ? "Excellent segmentation - you've gone beyond the brief by testing a channel. Next: put a simple unit cost against each segment so you can see which is actually more profitable per hour of your time."
            : "Strong, practical decision. Standardising portions is exactly right. Bring your new portion cost to our next session and we'll lock in a price that protects the margin.",
          coachId,
          reviewedAt: daysAgo(p.key === "advanced" ? 6 : 4),
        });
      }
    }
  }

  // 7. Blended delivery: a workshop + a 1:1 mentoring session, with attendance and coaching hours.
  const primaryCourseForSessions = classCourseIds[0];
  const [workshop] = await db.insert(deliverySessionsTable).values({
    tenantId: org.id, courseId: primaryCourseForSessions, facilitatorId: coachId,
    title: "BizAscend Kickoff Workshop: Mindset & Opportunity", sessionType: "workshop",
    scheduledAt: daysAgo(40), durationMinutes: 180, location: "Enza Hub, Sandton",
    notes: "In-person cohort kickoff. Introduced Backward Design and the BizAscend journey.",
  }).returning();
  const [mentoring] = await db.insert(deliverySessionsTable).values({
    tenantId: org.id, courseId: primaryCourseForSessions, facilitatorId: coachId,
    title: "1:1 Mentoring: Costing & Pricing clinic", sessionType: "mentoring",
    scheduledAt: daysAgo(4), durationMinutes: 60, joinUrl: "https://meet.google.com/enza-costing-clinic",
    notes: "Targeted support for learners flagged off-track on unit economics.",
  }).returning();

  // Attendance: everyone at the workshop; the struggler + on-track learner at the mentoring clinic.
  const learnerRows = await db.select().from(usersTable)
    .where(and(eq(usersTable.organisationId, org.id), eq(usersTable.role, "learner")));
  const attend: any[] = [];
  for (const l of learnerRows) {
    const isNovice = l.email === "thabo@thabocornerstore.co.za";
    attend.push({ sessionId: workshop.id, userId: l.id, status: isNovice ? "late" : "present", coachingHours: "3.0", recordedBy: coachId });
  }
  const clinicEmails = ["lerato@leratoliving.co.za", "sipho@kotacorner.co.za"];
  for (const l of learnerRows.filter((x) => clinicEmails.includes(x.email))) {
    attend.push({ sessionId: mentoring.id, userId: l.id, status: "present", coachingHours: "1.0", recordedBy: coachId });
  }
  await db.insert(attendanceRecordsTable).values(attend);

  // 8. Keep the org member count honest.
  await db.update(organisationsTable)
    .set({ memberCount: learnerCount + 2, updatedAt: new Date() })
    .where(eq(organisationsTable.id, org.id));
  } catch { /* cosmetic delivery data failed; the learner logins below are still guaranteed */ }

  // 9. Standardise learner test logins (enza@student1.test .. , shared password) + heal any gaps.
  const emails = await ensureTestLearners(partner.id, org.id);
  const v = await verifyTestLearners(partner.id);

  return { created: true, orgId: org.id, learners: emails.length, message: `Cohort seeded. Logins ${v.ok}/${v.total} verified (password ${LEARNER_TEST_PASSWORD}). Enza has ${v.assigned} courses assigned. ${v.detail}` };
}

function feedbackFor(level: Persona["key"], score: number): string {
  if (level === "advanced") return `Outstanding work (${score}%). Your reasoning is evidence-based and you clearly applied it to your own venture. Push yourself on the financial detail next.`;
  if (level === "on_track") return `Solid submission (${score}%). The core is right; tighten your assumptions and show the numbers behind your pricing to move into the top band.`;
  return `Passing (${score}%) but the numbers need work. Let's rebuild the costing section together in our next session - you're closer than it feels.`;
}
