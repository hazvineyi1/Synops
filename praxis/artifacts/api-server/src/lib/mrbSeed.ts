import { db } from "@workspace/db";
import {
  partnersTable, organisationsTable, usersTable,
  coursesTable, modulesTable, beatsTable, interactiveActivitiesTable, moduleReadingsTable, caseScenariosTable,
  enrolmentsTable, assignmentsTable, discussionsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { MRB_M1_SPEC, MRB_M2_SPEC } from "./mrbStations";
import { MRB_M1_READING, MRB_M2_READING } from "./mrbReadings";
import { MUTALE_PERSONA, MUTALE_CONSTRAINTS, MRB_M1_COACH, MRB_M2_COACH, type CoachCase } from "./mrbCoach";

/*
 * Seed for the partner "Zambian Clinician Leadership" and its "Leading with Purpose" demo course,
 * built the same way as the Project Expedite Justice pilot: a partner-owned, published course with two
 * decision-first modules, each housing an interactive Decision Station, a just-in-time reading, the
 * Mutale AI case coach, a published assignment and a discussion. A demo learner is enrolled so the
 * public /demos/mrb link drops a visitor straight into the full course.
 *
 * Idempotent: re-running finds-or-creates the partner, org, faculty, course and modules by natural key.
 * Policy / regulatory references are illustrative placeholders, UNVERIFIED, pending SME and Zambian
 * health-law sign-off. Everything is a composite.
 */

const SLUG = "zambian-leadership";
const COURSE_TITLE = "Leading with Purpose · Zambian Clinician Leadership";
export const ZCL_DEMO_LEARNER_EMAIL = "demo.learner@zcl.test";

interface SeedModule {
  title: string;
  order: number;
  objectives: string[];
  minutes: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec: any;
  stationBlurb: string;
  reading: string;
  coach: CoachCase;
  assignmentTitle: string;
  assignmentIntro: string;
  // Structured case-study config stored in assignments.instructions (JSON with __type), so the
  // assessment renders each case as its own on-page question with an input, plus an upload option.
  assignmentConfig: {
    __type: "case_study";
    scenario: string;
    sections: { id: string; title: string; prompt: string }[];
  };
  discussionTitle: string;
  discussionPrompt: string;
}

const MODULES: SeedModule[] = [
  {
    title: "Module 1 · The first 48 hours",
    order: 0,
    minutes: 40,
    spec: MRB_M1_SPEC,
    reading: MRB_M1_READING,
    coach: MRB_M1_COACH,
    stationBlurb:
      "A decision-first rehearsal of values and ethical leadership at the point of decision. As Acting Clinical Lead in a resource-scarcity crisis, you sequence your first actions before applying the allocation criteria, make a defensible allocation under pressure, elicit a colleague's hesitant disclosure without leading, catch a favouritism defect before co-signing, and produce an honest contemporaneous record. The result is computed from your decisions across two equally-weighted streams with a conjunctive floor, and resolves to pass or resubmit, not a percentage.",
    objectives: [
      "Given a resource-scarcity crisis, sequence your first leadership actions so no prioritisation is made before the facility's stated allocation criteria are applied.",
      "Identify the components that make a resource-prioritisation decision defensible and fair.",
      "Elicit a colleague's hesitant disclosure so no fact is lost through a leading or dismissive question.",
      "Identify the single defect in a colleague's triage decision before co-signing it.",
      "Produce a one-page contemporaneous decision record in which every ethically-conflicted call, including your own, is flagged.",
    ],
    assignmentTitle: "Your 48-hour decision record",
    assignmentIntro:
      "Work through the five cases below. Write your response in each box, or attach a document (or audio) instead; the format does not affect the pass-or-resubmit decision. A human reviewer makes the final decision. Composite scenario only.",
    assignmentConfig: {
      __type: "case_study",
      scenario: "You are the Acting Clinical Lead at a district-level facility. Overnight a critical medicine ran out as patient load surged. A well-connected family is pressing staff for priority for a relative. A junior colleague keeps starting to tell you something, then stopping. A peer's triage decision awaits your co-signature. Everyone and the facility are composites.",
      sections: [
        { id: "A", title: "Case A · Sequence your first actions", prompt: "Write your sequence of first leadership actions as Acting Clinical Lead, showing clearly that no prioritisation is made before the facility's allocation criteria are applied. State each step and your reason for its position in the sequence." },
        { id: "B", title: "Case B · Your allocation decision", prompt: "Write your allocation of the scarce medicine and identify every component that makes it defensible and fair, referencing the three criteria from the module reading." },
        { id: "C", title: "Case C · Eliciting the disclosure", prompt: "Write the exact questions or statements you would use to elicit your colleague's hesitant disclosure. You must not use leading or dismissive language. Briefly explain why each prompt avoids those two failure modes." },
        { id: "D", title: "Case D · The co-sign defect", prompt: "Identify the single defect in the peer's triage decision, and state what you would do before co-signing." },
        { id: "E", title: "Case E · Your one-page decision record", prompt: "Produce a one-page contemporaneous decision record covering every ethically conflicted call from Cases A through D, including your own decisions. Flag every conflicted call explicitly, with a brief justification." },
      ],
    },
    discussionTitle: "Where does fairness end and rigid rule-following begin?",
    discussionPrompt:
      "Set out your own view: where does defensible fairness end and rigid rule-following begin when you are allocating a scarce medicine under pressure, and what do you owe a colleague who hesitates but doesn't finish their sentence? Ground it in a real decision you have faced.",
  },
  {
    title: "Module 2 · The overloaded team and the next 90 days",
    order: 1,
    minutes: 40,
    spec: MRB_M2_SPEC,
    reading: MRB_M2_READING,
    coach: MRB_M2_COACH,
    stationBlurb:
      "A decision-first rehearsal of servant, transformational and social-value leadership. Leading a short-staffed ward, you hear a team member's real constraint before reallocating, share the work on a transparent criterion, pitch a change whose buy-in rests on trust you actually earned, catch an equity-excluding flaw in a colleague's proposal before co-endorsing, and write a 90-day plan that flags its own equity gaps. Two equally-weighted streams plus a conjunctive floor; pass or resubmit, not a percentage.",
    objectives: [
      "Given a staffing crisis, sequence your first actions so no task is reassigned before hearing the team member's actual constraint.",
      "Identify what makes a task-reallocation decision transparent and legitimate rather than arbitrary.",
      "Elicit a struggling team member's real constraint without leading or dismissing it.",
      "Identify the single equity-excluding flaw in a colleague's proposed change initiative before co-endorsing it.",
      "Produce a 90-day leadership action plan in which every equity gap, including your own, is explicitly flagged.",
    ],
    assignmentTitle: "Your 90-day leadership action plan",
    assignmentIntro:
      "Work through the five cases below. Write your response in each box, or attach a document (or audio) instead; the format does not affect the pass-or-resubmit decision. A human reviewer makes the final decision. Composite scenario only.",
    assignmentConfig: {
      __type: "case_study",
      scenario: "You lead a short-staffed ward. A team member says she cannot take on anything more; the work still has to be shared. You then design a change to stop the overload recurring, and pressure-test it against who it might leave out, for example outreach clinics serving the poorest catchment. Everyone is a composite.",
      sections: [
        { id: "A", title: "Case A · Hear the constraint", prompt: "Write how you respond when the team member says she can't take on anything more, showing that you hear her real constraint before reassigning any task." },
        { id: "B", title: "Case B · Transparent reallocation", prompt: "Write how you reallocate the work, and identify what makes your criterion transparent and legitimate rather than arbitrary." },
        { id: "C", title: "Case C · Pitching the change", prompt: "Write how you pitch your change idea so buy-in rests on trust you have actually earned. If trust is thin, include the specific step you would take to rebuild it first." },
        { id: "D", title: "Case D · The equity-excluding flaw", prompt: "Identify the single equity-excluding flaw in your colleague's proposed change, and state what you would require before co-endorsing it." },
        { id: "E", title: "Case E · Your 90-day plan", prompt: "Produce a 90-day action plan, told as the story of who benefits and who was nearly left out. Explicitly flag every equity gap, including in your own design, with what you will do about it." },
      ],
    },
    discussionTitle: "Pitching a vision to a team that doesn't trust you yet",
    discussionPrompt:
      "Set out your own view: how do you pitch a change to a team that doesn't yet fully trust you, and who gets to decide which catchment areas count as 'the community' in a hospital-wide initiative? Anchor it in a change you have actually tried to lead.",
  },
];

const COURSE = {
  title: COURSE_TITLE,
  description:
    "A values-driven, decision-first leadership programme for Zambian clinicians, prepared for the Manchester Review Board practice-credentials portfolio and built to the Synops Praxis methodology. Every lesson opens with a real decision under real constraint; theory appears only where a decision needs it; poor decisions carry forward rather than resetting; and each module resolves to pass or resubmit with developmental feedback, not a percentage. Coached throughout by Mutale, a leadership thinking-partner, not an examiner. Accessibility is built in: every outcome is achievable in writing, by voice, visually, or with a scribe. Policy references are illustrative placeholders, UNVERIFIED pending subject-matter-expert and Zambian health-law sign-off.",
  catalogDescription:
    "Leading with Purpose · a rehearsal of values, ethical, servant, transformational and social-value leadership at the point of decision, for Zambian clinicians. Two decision-first modules, coached by Mutale. Demo, SME sign-off pending.",
  objectives: [
    "Lead through a resource-scarcity crisis so no prioritisation is made before the allocation criteria are applied, and every conflicted call, including your own, is flagged.",
    "Lead a short-staffed team so the real constraint is heard before any task is reassigned, and design a 90-day change that flags who it might leave out.",
  ],
  tags: ["leadership", "clinical leadership", "values and ethics", "servant leadership", "social value", "Zambia", "Manchester Review Board"],
};

async function firstOrNull<T>(rows: T[]): Promise<T | null> {
  return rows.length ? rows[0] : null;
}

async function ensureModule(courseId: string, orgId: string, m: SeedModule, authorId: string): Promise<void> {
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
      { moduleId: mod.id, type: "points", order: 1, title: "What you will be able to do", narration: "By the end of this module you will be able to:", bulletPoints: m.objectives },
      { moduleId: mod.id, type: "scenario", order: 2, title: "The interactive station", narration: "This module is a Decision Station: a task-first rehearsal where you make decisions under realistic constraints. It plays inline below. Your choices produce a pass-or-resubmit result and a one-page leadership job aid." },
      { moduleId: mod.id, type: "close", order: 3, title: "Before you finish", narration: "Everything here is a composite. Any policy or regulatory reference is an illustrative placeholder, UNVERIFIED, pending subject-matter-expert and Zambian health-law sign-off. A human reviewer on the Review Board portal makes the final decision." },
    ]);
    await db.update(modulesTable).set({ beatCount: 4 }).where(eq(modulesTable.id, mod.id));
  }

  const title = `Interactive station: ${m.title.replace(/^Module \d+ · /, "")}`;
  const instructions = "A task-first rehearsal. Every case study opens with a decision under realistic constraints; your choices carry consequences and produce a computed pass-or-resubmit result across two equally-weighted leadership streams.";
  const existing = await db.select({ id: interactiveActivitiesTable.id })
    .from(interactiveActivitiesTable)
    .where(and(eq(interactiveActivitiesTable.moduleId, mod.id), eq(interactiveActivitiesTable.kind, "decision_station")));
  if (existing.length === 0) {
    await db.insert(interactiveActivitiesTable).values({
      organisationId: orgId, courseId, moduleId: mod.id, title, instructions,
      spec: m.spec, kind: "decision_station", source: "html", html: "",
      bloomsLevel: "Evaluate", difficulty: "advanced",
      published: true, isLibrary: false, createdByUserId: authorId,
    });
  } else {
    await db.update(interactiveActivitiesTable)
      .set({ title, instructions, spec: m.spec, updatedAt: new Date() })
      .where(eq(interactiveActivitiesTable.id, existing[0].id));
  }

  if (m.reading) {
    const readingTitle = `${m.title}: Reading`;
    await db.delete(moduleReadingsTable).where(eq(moduleReadingsTable.moduleId, mod.id));
    await db.insert(moduleReadingsTable).values({
      moduleId: mod.id, courseId, title: readingTitle, kind: "note",
      content: m.reading, chars: m.reading.length, order: 0, published: true, createdBy: authorId,
    });
  }

  if (m.coach) {
    const coachFields = {
      title: m.coach.title, learningObjective: m.coach.objective, contextBlock: m.coach.context,
      openingQuestion: m.coach.opener, focusAreas: m.coach.focus,
      aiPersona: MUTALE_PERSONA, aiConstraints: MUTALE_CONSTRAINTS, guidingInstructions: m.coach.guiding,
      tutorName: "Mutale", difficulty: "advanced" as const, bloomsLevel: "Evaluate",
      status: "published" as const, isLibrary: false, tags: ["leadership", "Zambia", "Manchester Review Board"],
      promptLimit: 10, updatedAt: new Date(),
    };
    const existingCase = await db.select({ id: caseScenariosTable.id })
      .from(caseScenariosTable).where(eq(caseScenariosTable.moduleId, mod.id));
    if (existingCase.length === 0) {
      await db.insert(caseScenariosTable).values({
        organisationId: orgId, moduleId: mod.id, createdBy: authorId, createdByName: "MRB Faculty", ...coachFields,
      });
    } else {
      await db.update(caseScenariosTable).set(coachFields).where(eq(caseScenariosTable.id, existingCase[0].id));
    }
  }

  const publishedAsg = await db.select({ id: assignmentsTable.id })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.moduleId, mod.id), eq(assignmentsTable.published, true)));
  if (publishedAsg.length === 0) {
    // Structured case-study assignment: the config lives in `instructions` as JSON with __type, so the
    // Assessment tab renders each case as its own on-page question with an input (plus an upload option).
    await db.insert(assignmentsTable).values({
      courseId, moduleId: mod.id, title: m.assignmentTitle,
      description: m.assignmentIntro, instructions: JSON.stringify(m.assignmentConfig),
      submissionType: "essay", pointsPossible: "100", published: true,
    });
  } else {
    // Keep an already-seeded assignment's structured config current on re-provision (e.g. upgrading a
    // plain file_upload brief to the case-study layout).
    await db.update(assignmentsTable)
      .set({ title: m.assignmentTitle, description: m.assignmentIntro, instructions: JSON.stringify(m.assignmentConfig), submissionType: "essay", published: true, updatedAt: new Date() })
      .where(eq(assignmentsTable.id, publishedAsg[0].id));
  }

  const existingDisc = await db.select({ id: discussionsTable.id })
    .from(discussionsTable).where(eq(discussionsTable.moduleId, mod.id));
  if (existingDisc.length === 0) {
    await db.insert(discussionsTable).values({
      courseId, moduleId: mod.id, authorId, title: m.discussionTitle, body: m.discussionPrompt,
      aiFacilitated: true, language: "en",
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
      competencyTags: COURSE.tags, objectives: COURSE.objectives,
    }).returning();
    created = true;
  }

  for (const m of MODULES) {
    await ensureModule(course.id, orgId, m, authorId);
  }
  await db.update(coursesTable).set({ moduleCount: MODULES.length }).where(eq(coursesTable.id, course.id));
  return { courseId: course.id, created };
}

export async function seedZambianLeadership(): Promise<{
  created: boolean; partnerId: string; courseId: string; message: string;
}> {
  // 1. Partner (find-or-create by slug)
  let partner = await firstOrNull(await db.select().from(partnersTable).where(eq(partnersTable.slug, SLUG)));
  let createdPartner = false;
  if (!partner) {
    [partner] = await db.insert(partnersTable).values({
      name: "Zambian Clinician Leadership", slug: SLUG, status: "active", contactEmail: "info@synops-consulting.com",
    }).returning();
    createdPartner = true;
  }

  // 2. Organisation under the partner
  let org = await firstOrNull(
    await db.select().from(organisationsTable).where(and(eq(organisationsTable.partnerId, partner.id), eq(organisationsTable.name, "Manchester Review Board Academy"))),
  );
  if (!org) {
    [org] = await db.insert(organisationsTable).values({
      name: "Manchester Review Board Academy", partnerId: partner.id, industry: "Clinical leadership professional development",
    }).returning();
  }

  // 3. Faculty author for the partner tenant
  let faculty = await firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, "curriculum@zambian-leadership.synops")));
  if (!faculty) {
    [faculty] = await db.insert(usersTable).values({
      email: "curriculum@zambian-leadership.synops", firstName: "MRB", lastName: "Faculty",
      role: "instructional_designer", status: "active", partnerId: partner.id, organisationId: org.id,
    }).returning();
  }

  await db.update(partnersTable).set({ orgCount: 1 }).where(eq(partnersTable.id, partner.id));

  // 4. Course + modules, owned by the partner tenant
  const { courseId, created: createdCourse } = await ensureCourseAndModules(partner.id, org.id, faculty.id);

  // 5. Demo learner enrolled in the course, so the public /demos/mrb link drops a visitor straight into
  //    the full published course as an enrolled learner.
  let demoLearner = await firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, ZCL_DEMO_LEARNER_EMAIL)));
  if (!demoLearner) {
    [demoLearner] = await db.insert(usersTable).values({
      email: ZCL_DEMO_LEARNER_EMAIL, firstName: "Demo", lastName: "Learner",
      role: "learner", status: "active", partnerId: partner.id, organisationId: org.id,
    }).returning();
  }
  const enrolled = await db.select().from(enrolmentsTable)
    .where(and(eq(enrolmentsTable.userId, demoLearner.id), eq(enrolmentsTable.courseId, courseId)));
  if (!enrolled.length) {
    await db.insert(enrolmentsTable).values({ userId: demoLearner.id, courseId, status: "active" });
  }

  return {
    created: createdPartner || createdCourse,
    partnerId: partner.id,
    courseId,
    message: `Zambian Clinician Leadership ${createdPartner ? "created" : "already existed"}; course "${COURSE.title}" ${createdCourse ? "created" : "present"} with ${MODULES.length} modules housed under the partner.`,
  };
}
