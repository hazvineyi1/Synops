import { db } from "@workspace/db";
import {
  partnersTable, organisationsTable, usersTable,
  coursesTable, modulesTable, beatsTable, moduleReadingsTable, assignmentsTable, caseScenariosTable,
  coursePartnerAssignmentsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

/**
 * A proper, editable demo COURSE for the PEJ Justice Practice partner, mirroring the justice-sector
 * practice demo (/demos/pej-practice). It sits in the partner's org "Courses" alongside the practice
 * credentials. Idempotent: find-or-create by title, assign to the partner and allocate to its org.
 */

type DModule = { title: string; outcome: string; scenario: string; points: string[]; minutes: number };

const PEJ_COURSE = {
  title: "Justice-Sector Practice: Sound Decisions Under Pressure",
  intro: "A decision-first course for justice-sector practitioners. Every module opens with a real situation under real constraint; you reason it through, and the record you leave has to survive later challenge.",
  courseOutcome: "Handle a scene, an inspection, an account and a decision so each is lawful, humane, and defensible after the fact.",
  tags: ["justice", "investigation", "lawful practice", "decision-making"],
  artifactLabel: "A worked case file from a real (or realistic) situation you have handled",
  artifactInstructions: "Choose a situation you have handled or can access. Produce a short case file (2-4 pages) showing the sequence you followed, the lawful basis for each step, how you drew out the account, and the decision you reached with its justification. Ground it in real constraints; be specific.",
  caseScenario: "A report comes in of an unsafe, possibly unlawful operation on a site with people present. You arrive first, alone, with partial information. Work through how you make the scene safe, establish a lawful basis to act, gather an account, and reach a decision that will hold up if it is reviewed next month.",
  modules: [
    { title: "Safety-First Scene Sequencing", outcome: "Sequence your first actions at a scene so that safety and evidence integrity are both protected.", scenario: "You are first on scene with people present and a hazard you cannot yet fully assess.", minutes: 8,
      points: ["Make people safe before you make the case; sequenced well, they don't compete", "What you touch, move or miss in the first minutes shapes what can be proven later", "Name your priorities on the record so the sequence is defensible"] },
    { title: "A Lawful Inspection That Survives Challenge", outcome: "Conduct an inspection whose record withstands a later legal challenge.", scenario: "You have grounds to inspect, but the operator is uncooperative and watching for a mistake.", minutes: 8,
      points: ["Know and state your lawful basis before you act, not after", "Record what you did, saw and decided contemporaneously — memory is not evidence", "A plausible-but-wrong basis is worse than an honest omission"] },
    { title: "Eliciting an Account Without Leading", outcome: "Draw out a full, usable account using open, non-leading questions.", scenario: "A nervous witness wants to help but keeps agreeing with whatever you suggest.", minutes: 7,
      points: ["Open questions get you their account; leading questions get you your own back", "Silence is a tool — let them fill it", "Separate what they saw from what they concluded, and note which is which"] },
    { title: "Making a Defensible Decision", outcome: "Reach and record a decision you can justify to a reviewer who was not there.", scenario: "You must decide now, on incomplete information, and the decision will be second-guessed.", minutes: 7,
      points: ["State the decision, the basis, and the alternatives you rejected and why", "Proportionality: match the response to the actual risk, not the loudest voice", "Write it so a reviewer next month sees not just what you did but why it was reasonable then"] },
  ] as DModule[],
};

async function firstOrNull<T>(rows: T[]): Promise<T | null> { return rows.length ? rows[0]! : null; }

async function buildCourse(orgId: string, facultyId: string): Promise<string> {
  const c = PEJ_COURSE;
  const outcomes = c.modules.map((m) => m.outcome);
  const [course] = await db.insert(coursesTable).values({
    title: c.title, description: `${c.intro}\n\nCourse outcome: ${c.courseOutcome}`,
    tenantId: "platform", status: "published", competencyTags: c.tags, objectives: outcomes,
  }).returning();
  let firstModuleId = "";
  for (let mi = 0; mi < c.modules.length; mi++) {
    const m = c.modules[mi];
    const [mod] = await db.insert(modulesTable).values({
      courseId: course.id, title: m.title, status: "published", lessonType: "slides",
      modality: "async", order: mi, objectives: [m.outcome], estimatedMinutes: m.minutes,
      description: `Part of ${c.title}. Outcome: ${m.outcome}`,
    }).returning();
    if (mi === 0) firstModuleId = mod.id;
    await db.insert(beatsTable).values([
      { moduleId: mod.id, type: "title_card", order: 0, title: m.title, narration: `Scenario: ${m.scenario}  By the end of this module you'll be able to: ${m.outcome}` },
      { moduleId: mod.id, type: "points", order: 1, title: "The key points", narration: "Hold the scenario in mind as we work through these.", bulletPoints: m.points },
      { moduleId: mod.id, type: "close", order: 2, title: "Your move", narration: `You can now: ${m.outcome}` },
    ]);
    await db.update(modulesTable).set({ beatCount: 3 }).where(eq(modulesTable.id, mod.id));
    const body = `# ${m.title}\n\n**Scenario.** ${m.scenario}\n\n**By the end of this module you can:** ${m.outcome}\n\n## Key points\n\n${m.points.map((p) => `- ${p}`).join("\n")}`;
    await db.insert(moduleReadingsTable).values({
      moduleId: mod.id, courseId: course.id, title: `Lesson: ${m.title}`, kind: "note",
      content: body, chars: body.length, order: 0, published: true, createdBy: facultyId,
    });
  }
  await db.update(coursesTable).set({ moduleCount: c.modules.length }).where(eq(coursesTable.id, course.id));
  await db.insert(caseScenariosTable).values({
    organisationId: orgId, moduleId: firstModuleId, createdBy: facultyId, createdByName: "Demo Faculty",
    title: `Final scenario: ${c.title}`, learningObjective: c.courseOutcome, contextBlock: c.caseScenario,
    openingQuestion: "Where would you start, and why? Talk me through your reasoning, not just your answer.",
    focusAreas: outcomes.slice(0, 3), difficulty: "intermediate", status: "published", isLibrary: true, tags: c.tags,
    guidingInstructions: "Coach the learner through this with questions, never answers. Push for a specific, defensible conclusion.",
  });
  await db.insert(assignmentsTable).values({
    courseId: course.id, moduleId: firstModuleId, title: `Artifact: ${c.artifactLabel}`,
    description: "The real output of this course. Your coach reviews it to open the coaching relationship.",
    instructions: c.artifactInstructions, submissionType: "file_upload", pointsPossible: "100", published: true, position: 0,
  });
  return course.id;
}

export async function seedPejCourse(): Promise<{ ok: boolean; created: boolean; courseId?: string; message: string }> {
  const partner = await firstOrNull(await db.select().from(partnersTable).where(eq(partnersTable.slug, "pej-practice")));
  if (!partner) return { ok: false, created: false, message: "PEJ Justice Practice partner not found. Provision the PEJ demo first." };
  let org = await firstOrNull(await db.select().from(organisationsTable).where(eq(organisationsTable.partnerId, partner.id)));
  if (!org) [org] = await db.insert(organisationsTable).values({ name: "Synops Justice Practice Academy", partnerId: partner.id }).returning();
  let faculty = await firstOrNull(await db.select().from(usersTable).where(and(eq(usersTable.partnerId, partner.id), eq(usersTable.role, "instructional_designer"))));
  if (!faculty) [faculty] = await db.insert(usersTable).values({
    email: `faculty+pej@synops-demo.test`, firstName: "Demo", lastName: "Faculty",
    role: "instructional_designer", status: "active", partnerId: partner.id, organisationId: org!.id,
  }).returning();

  let created = false;
  let course = await firstOrNull(await db.select().from(coursesTable).where(and(eq(coursesTable.title, PEJ_COURSE.title), eq(coursesTable.tenantId, "platform"))));
  let courseId: string;
  if (!course) { courseId = await buildCourse(org!.id, faculty!.id); created = true; }
  else { courseId = course.id; if (course.status !== "published") await db.update(coursesTable).set({ status: "published" }).where(eq(coursesTable.id, courseId)); }

  // Assign to the partner and allocate to its org so the org's Courses shows it and classes can run it.
  const has = await db.select({ id: coursePartnerAssignmentsTable.id }).from(coursePartnerAssignmentsTable)
    .where(and(eq(coursePartnerAssignmentsTable.courseId, courseId), eq(coursePartnerAssignmentsTable.partnerId, partner.id)));
  if (!has.length) await db.insert(coursePartnerAssignmentsTable).values({ courseId, partnerId: partner.id, assignedBy: faculty!.id });
  await db.execute(sql`CREATE TABLE IF NOT EXISTS org_course_assignments (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, org_id text NOT NULL, course_id text NOT NULL, partner_id text, assigned_by text, assigned_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS org_course_assignments_org_course_uidx ON org_course_assignments (org_id, course_id)`);
  await db.execute(sql`INSERT INTO org_course_assignments (org_id, course_id, partner_id, assigned_by) VALUES (${org!.id}, ${courseId}, ${partner.id}, ${faculty!.id}) ON CONFLICT (org_id, course_id) DO NOTHING`);

  return { ok: true, created, courseId, message: `PEJ demo course ${created ? "built" : "already present"} and assigned to ${org!.name}.` };
}
