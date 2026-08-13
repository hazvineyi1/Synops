import { db } from "@workspace/db";
import {
  partnersTable, organisationsTable, usersTable,
  coursesTable, modulesTable, beatsTable, interactiveActivitiesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { PEJ_M1_SPEC, PEJ_M2_SPEC } from "./stations";

/**
 * Seed for the partner "Executive Learning" and its Project Expedite Justice demo course.
 *
 * Unlike Enza (platform-owned courses assigned OUT to the partner), this course is OWNED by the
 * Executive Learning partner tenant directly (courses.tenantId = partner.id) so the two interactive
 * training stations are genuinely HOUSED under the partner, not merely assigned to it.
 *
 * The interactive experience for each module is a self-contained React page (DemoPEJ / DemoPEJ2)
 * mounted at /demos/pej-evd-01 and /demos/pej-evd-02. There is no "external tool" module type in the
 * schema, so each module carries a kind:"link" reading (module_readings.sourceUrl) that launches its
 * station, plus native beats so the module reads properly in the viewer.
 *
 * Idempotent: re-running finds-or-creates the partner, org, faculty, course and modules by natural
 * key, so a partial run completes rather than duplicating.
 */

const SLUG = "executive-learning";
const COURSE_TITLE = "PEJ-EVD-01 · Evidence at the conflict-related crime scene";

interface SeedModule {
  title: string;
  order: number;
  objectives: string[];
  minutes: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec: any;
  stationBlurb: string;
}

const MODULES: SeedModule[] = [
  {
    title: "Module 1 · Documenting the scene",
    order: 0,
    minutes: 35,
    spec: PEJ_M1_SPEC,
    stationBlurb:
      "A task-first rehearsal of the first hour at a conflict-related crime scene: sequencing under field conditions, the lawful basis for the inspection under martial law, taking a witness's initial account without leading, and auditing a colleague's chain of custody. The station result is computed from the decisions you take, across two equally-weighted streams, with a partly-conjunctive safety and evidential floor.",
    objectives: [
      "Given a de-occupied site with a suspected hazard, sequence the first documentation actions so no action is taken on the hazard before EOD clearance.",
      "Select the components that constitute a lawful inspection and register entry under martial law.",
      "Elicit a witness's initial account so no fact enters the file through a leading question.",
      "Identify the single defect in a colleague's chain of custody before co-signing it.",
      "Produce a one-page contemporaneous scene record in which every tainted item is flagged.",
    ],
  },
  {
    title: "Module 2 · Getting the account",
    order: 1,
    minutes: 35,
    spec: PEJ_M2_SPEC,
    stationBlurb:
      "Taking a witness's account so consent is informed and continuous, the account is in the witness's own words, only proportionate detail is taken, a mid-interview disclosure of ill-treatment is handled without harm, and the testimony is preserved before the witness is displaced. Non-negotiables are informed consent, disclosure handled without harm, and preservation before displacement.",
    objectives: [
      "Establish informed, revocable consent before any account is taken.",
      "Open the account so no fact enters through a leading question.",
      "Choose follow-up questions so no detail beyond the file's need is taken.",
      "Handle a disclosure of ill-treatment without harm and renew consent (Istanbul Protocol / do no harm).",
      "Choose the mechanism that preserves the testimony before the witness is displaced.",
    ],
  },
];

const COURSE = {
  title: COURSE_TITLE,
  description:
    "An interactive, task-first training course for qualified justice-sector professionals working conflict-related atrocity files. Built to the Synops Praxis justice-sector methodology: every lesson opens with a decision under realistic constraints, legal content appears only where it decides something, poor decisions produce consequences that persist, and each module's station result is computed from the decisions taken rather than a bolt-on quiz. All legal content is tagged to its authority and is UNVERIFIED pending subject-matter-expert sign-off.",
  catalogDescription:
    "Project Expedite Justice · a rehearsal of the professional task of documenting a conflict-related crime scene and taking a witness's account so the evidence is admissible and the chain of custody is unbroken. Demo, SME sign-off pending.",
  objectives: [
    "Document a conflict-related crime scene under field conditions so the physical and digital evidence is admissible and the chain of custody is unbroken.",
    "Take a witness's account so consent is informed and continuous, only proportionate detail is taken, and the testimony is preserved before displacement.",
  ],
  tags: ["justice", "atrocity crimes", "evidence", "witness interviewing", "Project Expedite Justice"],
  nqf: 8,
};

async function firstOrNull<T>(rows: T[]): Promise<T | null> {
  return rows.length ? rows[0] : null;
}

async function ensureModule(courseId: string, orgId: string, m: SeedModule, authorId: string): Promise<void> {
  // Find-or-create the module by (courseId, title).
  let mod = await firstOrNull(
    await db.select().from(modulesTable).where(and(eq(modulesTable.courseId, courseId), eq(modulesTable.title, m.title))),
  );
  if (!mod) {
    [mod] = await db.insert(modulesTable).values({
      courseId, title: m.title, status: "published", lessonType: "socratic",
      modality: "async", order: m.order, objectives: m.objectives, estimatedMinutes: m.minutes,
      description: m.stationBlurb,
    }).returning();

    await db.insert(beatsTable).values([
      { moduleId: mod.id, type: "title_card", order: 0, title: m.title, narration: `${m.stationBlurb}` },
      { moduleId: mod.id, type: "points", order: 1, title: "What you will be able to do", narration: "By the end of this station you will be able to:", bulletPoints: m.objectives },
      { moduleId: mod.id, type: "scenario", order: 2, title: "The interactive station", narration: "This module is a Decision Station: a task-first rehearsal where you make decisions under realistic constraints. It plays inline below. Your choices produce a station result and a one-page field job aid." },
      { moduleId: mod.id, type: "close", order: 3, title: "Before you finish", narration: "Every legal reference in this station is tagged with its sign-off status. This is a demo build: content marked \"confirm\" is pending subject-matter-expert verification and must not be relied on operationally." },
    ]);
    await db.update(modulesTable).set({ beatCount: 4 }).where(eq(modulesTable.id, mod.id));
  }

  // Find-or-create the native Decision Station activity for this module.
  const existing = await db.select({ id: interactiveActivitiesTable.id })
    .from(interactiveActivitiesTable)
    .where(and(eq(interactiveActivitiesTable.moduleId, mod.id), eq(interactiveActivitiesTable.kind, "decision_station")));
  if (existing.length === 0) {
    await db.insert(interactiveActivitiesTable).values({
      organisationId: orgId, courseId, moduleId: mod.id,
      title: `Interactive station: ${m.title.replace(/^Module \d+ · /, "")}`,
      instructions: "A task-first rehearsal. Every lesson opens with a decision under realistic constraints; your choices carry consequences and produce a computed station result.",
      spec: m.spec, kind: "decision_station", source: "html", html: "",
      bloomsLevel: "Evaluate", difficulty: "advanced",
      published: true, isLibrary: false, createdByUserId: authorId,
    });
  }
}

async function ensureCourseAndModules(partnerId: string, orgId: string, authorId: string): Promise<{ courseId: string; created: boolean }> {
  let course = await firstOrNull(
    await db.select().from(coursesTable).where(and(eq(coursesTable.title, COURSE.title), eq(coursesTable.tenantId, partnerId))),
  );
  let created = false;
  if (!course) {
    [course] = await db.insert(coursesTable).values({
      title: COURSE.title, description: COURSE.description, catalogDescription: COURSE.catalogDescription,
      tenantId: partnerId, status: "published",
      competencyTags: COURSE.tags, objectives: COURSE.objectives, nqfLevel: COURSE.nqf,
    }).returning();
    created = true;
  }

  for (const m of MODULES) {
    await ensureModule(course.id, orgId, m, authorId);
  }
  await db.update(coursesTable).set({ moduleCount: MODULES.length }).where(eq(coursesTable.id, course.id));
  return { courseId: course.id, created };
}

export async function seedExecutiveLearning(): Promise<{
  created: boolean; partnerId: string; courseId: string; message: string;
}> {
  // 1. Partner (find-or-create by slug)
  let partner = await firstOrNull(await db.select().from(partnersTable).where(eq(partnersTable.slug, SLUG)));
  let createdPartner = false;
  if (!partner) {
    [partner] = await db.insert(partnersTable).values({
      name: "Executive Learning", slug: SLUG, status: "active", contactEmail: "info@synops-consulting.com",
    }).returning();
    createdPartner = true;
  }

  // 2. Organisation under the partner
  let org = await firstOrNull(
    await db.select().from(organisationsTable).where(and(eq(organisationsTable.partnerId, partner.id), eq(organisationsTable.name, "Executive Learning Academy"))),
  );
  if (!org) {
    [org] = await db.insert(organisationsTable).values({
      name: "Executive Learning Academy", partnerId: partner.id, industry: "Justice-sector professional development",
    }).returning();
  }

  // 3. Faculty author for the partner tenant
  let faculty = await firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, "curriculum@executive-learning.synops")));
  if (!faculty) {
    [faculty] = await db.insert(usersTable).values({
      email: "curriculum@executive-learning.synops", firstName: "Executive Learning", lastName: "Faculty",
      role: "instructional_designer", status: "active", partnerId: partner.id, organisationId: org.id,
    }).returning();
  }

  await db.update(partnersTable).set({ orgCount: 1 }).where(eq(partnersTable.id, partner.id));

  // 4. Course + modules, owned by the partner tenant
  const { courseId, created: createdCourse } = await ensureCourseAndModules(partner.id, org.id, faculty.id);

  return {
    created: createdPartner || createdCourse,
    partnerId: partner.id,
    courseId,
    message: `Executive Learning ${createdPartner ? "created" : "already existed"}; course "${COURSE.title}" ${createdCourse ? "created" : "present"} with ${MODULES.length} modules housed under the partner.`,
  };
}
