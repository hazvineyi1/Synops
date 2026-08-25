import { db } from "@workspace/db";
import {
  partnersTable, organisationsTable, usersTable,
  coursesTable, modulesTable, beatsTable, moduleReadingsTable, assignmentsTable, caseScenariosTable,
  coursePartnerAssignmentsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

/**
 * A proper, editable demo COURSE for the Educator Professional Development partner, mirroring the
 * educator practice demo (/demos/educator). Sits in the partner's org "Courses" alongside its practice
 * credentials. Idempotent: find-or-create by title, assign to the partner and allocate to its org.
 */

type DModule = { title: string; outcome: string; scenario: string; points: string[]; minutes: number };

const EDU_COURSE = {
  title: "Teaching Well with AI",
  intro: "A practical course for educators on using AI to deepen learning rather than shortcut it. Each module starts from a real classroom decision and ends with something you can use on Monday.",
  courseOutcome: "Design lessons, assessments and feedback that stay rigorous and human when both you and your students have AI.",
  tags: ["education", "AI in teaching", "assessment", "pedagogy"],
  artifactLabel: "One redesigned lesson or assessment for your own class",
  artifactInstructions: "Take a lesson or assessment you already teach and redesign it for a world where students have AI. Produce the redesigned version plus a short note (1-2 pages) on what you changed, why it still measures real learning, and how you'll teach students to use AI well within it.",
  caseScenario: "Half your class is quietly using AI for their essays and you can't reliably tell which half. Rather than police it, you decide to redesign the task and teach the skill. Work through how you keep the learning real, keep the assessment valid, and turn AI from a threat into a tool.",
  modules: [
    { title: "AI-Assisted Lesson Design", outcome: "Design a lesson that uses AI to deepen thinking instead of replacing it.", scenario: "You have 40 minutes and a topic students find dry; AI could help or could do the thinking for them.", minutes: 8,
      points: ["Use AI for the parts that free attention for thinking, not for the thinking itself", "Design the task so a good AI answer is the START of the work, not the end", "Keep a clear 'what only you can do' step in every lesson"] },
    { title: "Assessment Integrity in the Age of AI", outcome: "Design assessment that stays valid when students have AI.", scenario: "Your usual essay prompt can be answered well by a chatbot in seconds.", minutes: 8,
      points: ["Assess the process and the reasoning, not just the polished product", "Move up Bloom's: application, evaluation and creation resist copy-paste", "Make the student's own context, voice or defence part of what's assessed"] },
    { title: "Teaching Students to Use AI Well", outcome: "Teach students to use AI as a thinking partner, responsibly and transparently.", scenario: "Students are already using AI; nobody has taught them how to do it honestly or well.", minutes: 7,
      points: ["Name it: transparency about when and how AI was used is the baseline", "Teach prompting as a thinking skill — asking better questions is learning", "Model checking AI's work; treat it as a fallible collaborator, not an oracle"] },
    { title: "Feedback and Workload with AI", outcome: "Use AI to give better feedback faster without losing the human read.", scenario: "You have 90 scripts to mark this weekend and want feedback to actually help.", minutes: 7,
      points: ["Let AI draft the routine feedback so your time goes to the judgement calls", "Always keep the human read for tone, effort and the individual student", "Feedback students can act on beats feedback that is merely correct"] },
  ] as DModule[],
};

async function firstOrNull<T>(rows: T[]): Promise<T | null> { return rows.length ? rows[0]! : null; }

async function buildCourse(orgId: string, facultyId: string): Promise<string> {
  const c = EDU_COURSE;
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

export async function seedEducatorCourse(): Promise<{ ok: boolean; created: boolean; courseId?: string; message: string }> {
  const partner = await firstOrNull(await db.select().from(partnersTable).where(eq(partnersTable.slug, "educator-pd")));
  if (!partner) return { ok: false, created: false, message: "Educator PD partner not found. Provision the Educator demo first." };
  let org = await firstOrNull(await db.select().from(organisationsTable).where(eq(organisationsTable.partnerId, partner.id)));
  if (!org) [org] = await db.insert(organisationsTable).values({ name: "Synops Educator Academy", partnerId: partner.id }).returning();
  let faculty = await firstOrNull(await db.select().from(usersTable).where(and(eq(usersTable.partnerId, partner.id), eq(usersTable.role, "instructional_designer"))));
  if (!faculty) [faculty] = await db.insert(usersTable).values({
    email: `faculty+educator@synops-demo.test`, firstName: "Demo", lastName: "Faculty",
    role: "instructional_designer", status: "active", partnerId: partner.id, organisationId: org!.id,
  }).returning();

  let created = false;
  let course = await firstOrNull(await db.select().from(coursesTable).where(and(eq(coursesTable.title, EDU_COURSE.title), eq(coursesTable.tenantId, "platform"))));
  let courseId: string;
  if (!course) { courseId = await buildCourse(org!.id, faculty!.id); created = true; }
  else { courseId = course.id; if (course.status !== "published") await db.update(coursesTable).set({ status: "published" }).where(eq(coursesTable.id, courseId)); }

  const has = await db.select({ id: coursePartnerAssignmentsTable.id }).from(coursePartnerAssignmentsTable)
    .where(and(eq(coursePartnerAssignmentsTable.courseId, courseId), eq(coursePartnerAssignmentsTable.partnerId, partner.id)));
  if (!has.length) await db.insert(coursePartnerAssignmentsTable).values({ courseId, partnerId: partner.id, assignedBy: faculty!.id });
  await db.execute(sql`CREATE TABLE IF NOT EXISTS org_course_assignments (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, org_id text NOT NULL, course_id text NOT NULL, partner_id text, assigned_by text, assigned_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS org_course_assignments_org_course_uidx ON org_course_assignments (org_id, course_id)`);
  await db.execute(sql`INSERT INTO org_course_assignments (org_id, course_id, partner_id, assigned_by) VALUES (${org!.id}, ${courseId}, ${partner.id}, ${faculty!.id}) ON CONFLICT (org_id, course_id) DO NOTHING`);

  return { ok: true, created, courseId, message: `Educator demo course ${created ? "built" : "already present"} and assigned to ${org!.name}.` };
}
