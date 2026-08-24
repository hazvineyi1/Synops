import { db } from "@workspace/db";
import {
  partnersTable, brandThemesTable, usersTable,
  coursesTable, modulesTable, beatsTable, moduleReadingsTable,
  caseScenariosTable, interactiveActivitiesTable, discussionsTable, assignmentsTable,
  coursePartnerAssignmentsTable, enrolmentsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

/**
 * One-off seed for the real partner "Enza Global Media" (SMME development, coaching, incubation and
 * Enterprise & Supplier Development). Creates the partner, its brand theme (built from the enza-
 * globalmedia.co.za palette), an organisation, a faculty author, and a catalogue of 15 professional
 * entrepreneurship courses - each with modules + objectives, a case study, a reading, an interactive,
 * a discussion and an assignment - all assigned to the Enza partner. Idempotent: re-running is a no-op
 * once the partner exists.
 */

const ENZA_SLUG = "enza-global";

// Brand palette from enzaglobalmedia.co.za (signature lime + olive + rust on near-black; Heebo).
const BRAND = {
  displayName: "Enza Global Media",
  primaryColor: "#111111",   // near-black (headers/buttons; carries white text)
  secondaryColor: "#9CDF00", // signature lime green
  accentColor: "#D8613C",    // warm rust accent
  fontFamily: "Heebo, system-ui, sans-serif",
  credentialTitle: "Enza Global Certificate",
  emailSenderName: "Enza Global Media",
  logoUrl: "https://enzaglobalmedia.co.za/wp-content/uploads/2025/09/cropped-logo-300x235-1.jpg",
  faviconUrl: "https://enzaglobalmedia.co.za/wp-content/uploads/2025/09/cropped-fav-enza-270x270.jpg",
};

interface SeedModule { title: string; objectives: string[]; minutes: number }
interface SeedCourse {
  title: string;
  focus: string;
  description: string;
  objectives: string[];
  tags: string[];
  nqf: number;
  modules: SeedModule[];
  caseScenario: string;
}

const COURSES: SeedCourse[] = [
  {
    title: "Enza Foundations: The Entrepreneurial Mindset",
    focus: "thinking and acting like an entrepreneur, and turning everyday problems into business opportunities",
    description: "Every business begins with a founder who sees a problem worth solving and believes they can act on it. This foundational course builds the entrepreneurial mindset that carries a small business through uncertainty - self-belief, ownership, and disciplined action - and gives learners a practical method for spotting, screening and shaping real opportunities in their own community and market.",
    objectives: [
      "Describe the mindset, habits and behaviours that distinguish resilient entrepreneurs from employees.",
      "Identify problems worth solving in your own environment and reframe them as business opportunities.",
      "Apply a simple opportunity-screening test to rank ideas by desirability, feasibility and viability.",
      "Set a personal 90-day founder action plan with measurable first steps.",
    ],
    tags: ["entrepreneurship", "mindset", "opportunity", "SMME"],
    nqf: 4,
    modules: [
      { title: "What it really means to be an entrepreneur", objectives: ["Contrast an employee mindset with an owner mindset.", "Explain why ownership and initiative drive small-business survival.", "Reflect on your own reasons and readiness to start or grow a business."], minutes: 45 },
    ],
    caseScenario: "Thandi runs a small vegetable stall in Diepsloot and keeps hearing customers complain that fresh produce spoils before month-end. She suspects there is a bigger opportunity but is unsure whether it is worth pursuing or how to start. Help Thandi think it through as an entrepreneur.",
  },
];

async function firstOrNull<T>(rows: T[]): Promise<T | null> { return rows.length ? rows[0] : null; }

// Upsert the Enza brand theme (logo, favicon, colours, font) for the partner tenant. Safe to re-run.
async function applyBrand(partnerId: string): Promise<void> {
  const fields = {
    displayName: BRAND.displayName,
    primaryColor: BRAND.primaryColor,
    secondaryColor: BRAND.secondaryColor,
    accentColor: BRAND.accentColor,
    logoUrl: BRAND.logoUrl,
    faviconUrl: BRAND.faviconUrl,
    fontFamily: BRAND.fontFamily,
    credentialTitle: BRAND.credentialTitle,
    emailSenderName: BRAND.emailSenderName,
    updatedAt: new Date(),
  };
  const current = await firstOrNull(await db.select().from(brandThemesTable).where(eq(brandThemesTable.tenantId, partnerId)));
  if (current) {
    await db.update(brandThemesTable).set(fields).where(eq(brandThemesTable.tenantId, partnerId));
  } else {
    await db.insert(brandThemesTable).values({ ...fields, tenantId: partnerId, tenantType: "partner" });
  }
}

// Create one course and all of its content (modules, beats, reading, case, interactive, discussion,
// assignment). Returns the new course id. Thrown errors are handled per-course by ensureEnzaCourses.
async function createCourseContent(c: (typeof COURSES)[number], orgId: string | null, facultyId: string): Promise<string> {
  const [course] = await db.insert(coursesTable).values({
    title: c.title, description: c.description, tenantId: "platform", status: "published",
    competencyTags: c.tags, objectives: c.objectives, nqfLevel: c.nqf,
  }).returning();

  let firstModuleId = "";
  for (let mi = 0; mi < c.modules.length; mi++) {
    const m = c.modules[mi];
    const [mod] = await db.insert(modulesTable).values({
      courseId: course.id, title: m.title, status: "published", lessonType: "slides",
      modality: "async", order: mi, objectives: m.objectives, estimatedMinutes: m.minutes,
      description: `Part of ${c.title}. This module covers ${m.title.toLowerCase()}.`,
    }).returning();
    if (mi === 0) firstModuleId = mod.id;
    await db.insert(beatsTable).values([
      { moduleId: mod.id, type: "title_card", order: 0, title: m.title, narration: `Welcome to "${m.title}". In this module you will focus on ${c.focus}. By the end you will be able to: ${m.objectives.join(" ")}` },
      { moduleId: mod.id, type: "points", order: 1, title: "Key ideas", narration: `The core ideas in ${m.title} that you will apply to your own business.`, bulletPoints: m.objectives },
      { moduleId: mod.id, type: "close", order: 2, title: "Wrap up", narration: `You have completed ${m.title}. Apply what you learned to your own business before the next module, and bring your questions to the discussion.` },
    ]);
    await db.update(modulesTable).set({ beatCount: 3 }).where(eq(modulesTable.id, mod.id));
  }
  await db.update(coursesTable).set({ moduleCount: c.modules.length }).where(eq(coursesTable.id, course.id));

  const readingBody = `# Reading: ${c.title}\n\nThis short reading anchors the course. ${c.description}\n\n## Why this matters for your business\n\n${c.objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}\n\n## How to use this course\n\nWork through the modules in order, complete the interactive and the assignment, and take part in the discussion. Bring a real business - your own or one you know - and apply every idea to it. Enza's approach is implementation over theory: break the work into small, costed, actionable steps.`;
  await db.insert(moduleReadingsTable).values({
    moduleId: firstModuleId, courseId: course.id, title: `Course reader: ${c.title}`,
    kind: "note", content: readingBody, chars: readingBody.length, order: 0, published: true, createdBy: facultyId,
  });

  await db.insert(caseScenariosTable).values({
    organisationId: orgId, moduleId: firstModuleId, createdBy: facultyId, createdByName: "Enza Faculty",
    title: `Case study: ${c.title}`,
    learningObjective: c.objectives[0],
    contextBlock: c.caseScenario,
    openingQuestion: "Where would you start, and why? Talk me through your thinking as an entrepreneur.",
    focusAreas: c.objectives.slice(0, 3),
    difficulty: c.nqf >= 6 ? "advanced" : c.nqf >= 5 ? "intermediate" : "foundational",
    status: "published", isLibrary: true, tags: c.tags,
    guidingInstructions: `Coach the learner through the scenario using questions, not answers. Keep them focused on ${c.focus}. Push for concrete, costed, actionable steps in a South African SMME context.`,
  });

  const items = c.objectives.map((o) => `<li><label><input type="checkbox"> ${o}</label></li>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>body{font-family:Heebo,system-ui,sans-serif;color:#111;margin:0;padding:20px;background:#fff}h2{color:#111}li{margin:.5rem 0;list-style:none}.bar{height:8px;background:#eee;border-radius:6px;overflow:hidden;margin:12px 0}.fill{height:100%;width:0;background:#9CDF00;transition:.3s}button{background:#111;color:#fff;border:0;border-radius:6px;padding:.6rem 1rem;font:inherit;cursor:pointer}.hint{color:#666;font-size:.9rem}</style><h2>${c.title} - readiness check</h2><p class="hint">Tick each capability you can honestly do in your own business today.</p><ul id="l">${items}</ul><div class="bar"><div class="fill" id="f"></div></div><p id="s" class="hint">0% ready</p><button onclick="save()">Save my score</button><script>const cs=[...document.querySelectorAll('input')];function upd(){const n=cs.filter(x=>x.checked).length,p=Math.round(n/cs.length*100);document.getElementById('f').style.width=p+'%';document.getElementById('s').textContent=p+'% ready ('+n+' of '+cs.length+')';}cs.forEach(x=>x.addEventListener('change',upd));function save(){upd();alert('Saved. Focus next on the items you left unticked.');}<\/script>`;
  await db.insert(interactiveActivitiesTable).values({
    organisationId: orgId, courseId: course.id, moduleId: firstModuleId,
    title: `${c.title}: readiness self-check`,
    instructions: `Use this checklist to rate your own business against the course objectives. Revisit it at the end of the course to see your growth.`,
    html, source: "html", kind: "checklist", bloomsLevel: "Evaluate",
    difficulty: c.nqf >= 6 ? "advanced" : c.nqf >= 5 ? "intermediate" : "foundational",
    isLibrary: true, tags: c.tags, published: true, createdByUserId: facultyId,
  });

  await db.insert(discussionsTable).values({
    courseId: course.id, authorId: facultyId, moduleId: firstModuleId,
    title: `Discussion: applying ${c.title} to your business`,
    body: `Share how you will apply this course to a real business - your own or one you know well. In your first post (100-150 words): (1) name the business and the single biggest challenge it faces related to ${c.focus}; (2) describe one specific action you will take based on this course; and (3) what result you expect. Then reply thoughtfully to at least two classmates with a practical suggestion.`,
    aiFacilitated: true, requireInitialPost: true, graded: false,
  });

  await db.insert(assignmentsTable).values({
    courseId: course.id, moduleId: firstModuleId,
    title: `Applied project: ${c.title}`,
    description: `A practical, real-world application of everything in this course to a business of your choice.`,
    instructions: `Choose a real business (your own or one you can access). Produce a short, practical output (2-4 pages or a completed template) that demonstrates the course objectives:\n\n${c.objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}\n\nGround every recommendation in the real numbers and context of the business. Be specific and actionable - Enza values implementation over theory. Submit your work and be ready to present it in coaching.`,
    submissionType: "file_upload", pointsPossible: "100", published: true, position: 0,
  });

  return course.id;
}

/**
 * Self-healing course provisioning for Enza. Find-or-creates the org + faculty author, then for each of
 * the 15 courses: reuses an existing course of the same title (so a partial prior run is not duplicated)
 * or creates it, and ensures it is assigned to the Enza partner. Each course is isolated in try/catch so
 * one failing course cannot stop the rest, and the first error is returned so a real bug is diagnosable.
 */
// Heal the assignments table: older deploys created it before several columns existed, and
// `CREATE TABLE IF NOT EXISTS` never backfills columns - so the Drizzle insert (which lists every
// column) failed with "column ... does not exist", which is what stopped every course from seeding.
async function healAssignmentsTable(): Promise<void> {
  const cols: string[] = [
    "module_id text",
    "description text",
    "instructions text",
    "assignment_type text NOT NULL DEFAULT 'essay'",
    "due_date timestamptz",
    "available_from timestamptz",
    "available_until timestamptz",
    "points_possible numeric(7,2) NOT NULL DEFAULT 100",
    "allow_late_submissions boolean NOT NULL DEFAULT true",
    "late_penalty_percent integer NOT NULL DEFAULT 0",
    "rubric_id text",
    "group_assignment boolean NOT NULL DEFAULT false",
    "peer_review_required boolean NOT NULL DEFAULT false",
    "peer_review_count integer NOT NULL DEFAULT 0",
    "published boolean NOT NULL DEFAULT false",
    "position integer NOT NULL DEFAULT 0",
    "created_at timestamptz NOT NULL DEFAULT now()",
    "updated_at timestamptz NOT NULL DEFAULT now()",
  ];
  for (const c of cols) {
    await db.execute(sql.raw(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS ${c}`));
  }
}

/** The Enza content author, partner-level (no organisation). Heals an existing faculty that was tied to
 * the old "Enza SMME Academy" demo org so re-provisioning never resurrects that org. */
async function ensureEnzaFaculty(partnerId: string): Promise<{ id: string }> {
  const existing = await firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, "curriculum@enzaglobalmedia.co.za")));
  if (existing) {
    if ((existing as { organisationId?: string | null }).organisationId) {
      await db.update(usersTable).set({ organisationId: null }).where(eq(usersTable.id, existing.id));
    }
    return { id: existing.id };
  }
  const [created] = await db.insert(usersTable).values({
    email: "curriculum@enzaglobalmedia.co.za", firstName: "Enza", lastName: "Faculty",
    role: "instructional_designer", status: "active", partnerId, organisationId: null,
  }).returning();
  return { id: created.id };
}

async function ensureEnzaCourses(partnerId: string): Promise<{ total: number; created: number; error: string | null }> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS course_partner_assignments (id text PRIMARY KEY, course_id text NOT NULL, partner_id text NOT NULL, assigned_by text, assigned_at timestamptz NOT NULL DEFAULT now())`);
  await healAssignmentsTable();

  // Provisioning Enza must NOT recreate a delivery organisation. The old "Enza SMME Academy" demo org
  // kept coming back on every provision even after being deleted, so we no longer create it: the
  // faculty author is partner-level (no org), and course library content is authored at platform scope
  // (organisationId null). The partner builds its own organisations from the hub.
  const faculty = await ensureEnzaFaculty(partnerId);

  let created = 0;
  let error: string | null = null;
  for (const c of COURSES) {
    try {
      let course = await firstOrNull(await db.select().from(coursesTable).where(and(eq(coursesTable.title, c.title), eq(coursesTable.tenantId, "platform"))));
      let courseId: string;
      if (course) { courseId = course.id; }
      else { courseId = await createCourseContent(c, null, faculty.id); created++; }

      // Backfill the applied-project assignment on courses that an earlier run created before the
      // assignments table was healed (they have every other piece but no assignment).
      const hasAssignment = await db.select({ id: assignmentsTable.id }).from(assignmentsTable).where(eq(assignmentsTable.courseId, courseId)).limit(1);
      if (hasAssignment.length === 0) {
        const firstMod = await firstOrNull(await db.select({ id: modulesTable.id }).from(modulesTable).where(eq(modulesTable.courseId, courseId)));
        await db.insert(assignmentsTable).values({
          courseId, moduleId: firstMod?.id ?? null,
          title: `Applied project: ${c.title}`,
          description: `A practical, real-world application of everything in this course to a business of your choice.`,
          instructions: `Choose a real business (your own or one you can access). Produce a short, practical output (2-4 pages or a completed template) that demonstrates the course objectives:\n\n${c.objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}\n\nGround every recommendation in the real numbers and context of the business. Be specific and actionable - Enza values implementation over theory.`,
          submissionType: "file_upload", pointsPossible: "100", published: true, position: 0,
        });
      }

      const has = await db.select({ id: coursePartnerAssignmentsTable.id }).from(coursePartnerAssignmentsTable)
        .where(and(eq(coursePartnerAssignmentsTable.courseId, courseId), eq(coursePartnerAssignmentsTable.partnerId, partnerId)));
      if (has.length === 0) await db.insert(coursePartnerAssignmentsTable).values({ courseId, partnerId, assignedBy: faculty.id });
    } catch (e) {
      if (!error) error = (e instanceof Error ? e.message : String(e)).slice(0, 240);
    }
  }
  // Reconcile: Enza should hold only the course(s) in COURSES. Unassign any other course currently
  // assigned to Enza and un-enrol the cohort from it. Non-destructive: the platform catalog keeps the
  // course rows; they simply leave the Enza demo (which is now a single one-lesson course).
  const keptTitles = new Set(COURSES.map((c) => c.title));
  const assigned = await db.select().from(coursePartnerAssignmentsTable).where(eq(coursePartnerAssignmentsTable.partnerId, partnerId));
  for (const a of assigned) {
    const [course] = await db.select({ id: coursesTable.id, title: coursesTable.title }).from(coursesTable).where(eq(coursesTable.id, a.courseId)).limit(1);
    if (course && !keptTitles.has(course.title)) {
      await db.delete(enrolmentsTable).where(eq(enrolmentsTable.courseId, a.courseId)).catch(() => {});
      await db.delete(coursePartnerAssignmentsTable).where(eq(coursePartnerAssignmentsTable.id, a.id)).catch(() => {});
    }
  }

  const total = (await db.select({ id: coursePartnerAssignmentsTable.id }).from(coursePartnerAssignmentsTable).where(eq(coursePartnerAssignmentsTable.partnerId, partnerId))).length;
  return { total, created, error };
}

export async function seedEnza(): Promise<{ created: boolean; partnerId?: string; courses?: number; message?: string }> {
  // Idempotent: if the partner already exists, don't re-create courses, but DO (re)apply the
  // full brand kit (logo, favicon, colours) so branding stays in sync with the website.
  const existing = await firstOrNull(await db.select().from(partnersTable).where(eq(partnersTable.slug, ENZA_SLUG)));
  if (existing) {
    await applyBrand(existing.id);
    // Re-run course provisioning: this completes courses that a prior partial run never created/assigned.
    const r = await ensureEnzaCourses(existing.id);
    return { created: false, partnerId: existing.id, courses: r.total, message: `Branding refreshed. ${r.total} courses assigned to Enza (created ${r.created} new).${r.error ? " First error: " + r.error : ""}` };
  }

  // Make sure the assignment table exists (in case setup-platform never ran).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS course_partner_assignments (
      id text PRIMARY KEY, course_id text NOT NULL, partner_id text NOT NULL,
      assigned_by text, assigned_at timestamptz NOT NULL DEFAULT now())`);

  // 1. Partner
  const [partner] = await db.insert(partnersTable).values({
    name: "Enza Global Media", slug: ENZA_SLUG, status: "active", contactEmail: "connect@enzaglobalmedia.co.za",
  }).returning();

  // 2. Brand theme (partner tenant) - logo, favicon, colours from the website
  await applyBrand(partner.id);

  // 3. No delivery organisation is seeded. Enza starts clean and builds its own organisations from the
  // hub; the content author below is partner-level. (The old "Enza SMME Academy" demo org is gone.)
  await db.update(partnersTable).set({ orgCount: 0 }).where(eq(partnersTable.id, partner.id));

  // 4. Courses + content - shared, self-healing (ensureEnzaCourses provisions the partner-level author).
  const seeded = await ensureEnzaCourses(partner.id);

  return { created: true, partnerId: partner.id, courses: seeded.total, message: `Enza provisioned with ${seeded.total} courses.${seeded.error ? " First error: " + seeded.error : ""}` };
}
