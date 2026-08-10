import { randomBytes } from "node:crypto";
import {
  db,
  teachersTable,
  classesTable,
  studentsTable,
  lessonPlansTable,
  worksheetsTable,
  quizzesTable,
  assignmentsTable,
  submissionsTable,
} from "@workspace/paideia-db";
import { eq } from "drizzle-orm";
import { hashPassword, generateShortCode } from "./auth.js";
import { logger } from "./logger.js";

/**
 * One-click demo teacher for Synops Teacher. A single fixed identity, pre-loaded with a class,
 * students, lesson plans, worksheets, quizzes and one graded assignment so the product feels
 * alive the instant a visitor lands. Entered ONLY through the host-gated /auth/demo-login button
 * (its password is random and unusable). Idempotent: seeds once, on the boot that first finds the
 * account missing; a partial failure rolls the teacher row back so the next boot retries cleanly.
 */
export const DEMO_TEACHER_EMAIL = "demo.teacher@synops-demo.test";
// Catalog region ids are lowercase ("us"), so the teacher.region must match for the
// subject / year-group pickers to populate.
const REGION = "us";

type WQ = { number: number; prompt: string; type: "short" | "multiple_choice" | "long" | "calculation"; options: string[] | null; answer: string; workingOrRubric: string };
type QI = { number: number; prompt: string; type: "multiple_choice" | "short_answer" | "true_false"; options: string[] | null; correctAnswer: string; difficulty: "easy" | "medium" | "hard"; skillAssessed: string };

function lessonPlan(title: string, topic: string, objectives: string[], starter: string, core: string, support: string, stretch: string, exitPrompt: string, exitAnswer: string, misconceptions: string[], homework: string) {
  return {
    title,
    summary: `A backward-designed 50-minute lesson on ${topic.toLowerCase()}, built from clear objectives down to a checkable exit ticket.`,
    learningObjectives: objectives,
    successCriteria: objectives.map((o) => `I can ${o.replace(/^Students will (be able to )?/i, "").toLowerCase()}`),
    starter: { activity: starter, durationMinutes: 8 },
    mainTask: { core, support, stretch, durationMinutes: 28 },
    miniPlenary: { activity: "Two students share their method under the visualiser; the class votes on the clearest explanation and says why.", durationMinutes: 6 },
    exitTicket: { prompt: exitPrompt, expectedResponse: exitAnswer },
    resourcesNeeded: ["Mini whiteboards", "Printed worksheet", "Visualiser or document camera"],
    commonMisconceptions: misconceptions,
    homeworkSuggestion: homework,
  };
}

function buildPlans() {
  return [
    {
      title: "Ratios & Rates: comparing quantities",
      subject: "Mathematics",
      yearGroup: "Grade 6",
      topic: "Ratios and unit rates",
      content: lessonPlan(
        "Ratios & Rates: comparing quantities",
        "Ratios and unit rates",
        ["Students will be able to write a ratio in three forms", "Students will be able to find a unit rate from a ratio", "Students will be able to compare two rates to decide which is the better value"],
        "Show two shop labels (12 oz for $3.00 vs 20 oz for $4.60). Ask: which is the better deal, and how do you know?",
        "Students find the unit price of five paired products and mark the better value, showing division each time.",
        "A part-completed ratio table scaffolds the division so students focus on the comparison, not the arithmetic.",
        "Students design a 'best-value' shelf card for a product and justify it with two different unit rates.",
        "A recipe uses 3 cups of flour to 2 cups of sugar. Write the ratio in three forms and give the unit rate of flour to sugar.",
        "3:2, 3 to 2, 3/2; unit rate 1.5 cups of flour per cup of sugar.",
        ["Writing the ratio in the wrong order", "Confusing the ratio 3:2 with the fraction 3/5", "Forgetting to label the unit when stating a rate"],
        "Find three unit prices from your own kitchen or a store flyer and rank them from best to worst value.",
      ),
    },
    {
      title: "Dividing fractions: why we multiply by the reciprocal",
      subject: "Mathematics",
      yearGroup: "Grade 6",
      topic: "Dividing fractions",
      content: lessonPlan(
        "Dividing fractions: why we multiply by the reciprocal",
        "Dividing fractions",
        ["Students will be able to model fraction division with a diagram", "Students will be able to divide a fraction by a fraction using the reciprocal", "Students will be able to explain why the reciprocal method works"],
        "How many 1/4-cup scoops are in 3/4 of a cup? Draw it before you calculate.",
        "Students solve eight fraction-division problems, drawing a model for the first three then using the reciprocal for the rest.",
        "A fraction wall and worked example keep the model visible while students build confidence.",
        "Students write a word problem whose answer is 2/3 ÷ 1/6 and swap with a partner to solve.",
        "Work out 5/6 ÷ 1/3 and explain in one sentence why multiplying by 3/1 gives the same answer.",
        "5/6 ÷ 1/3 = 5/6 × 3/1 = 15/6 = 2 1/2. Dividing by 1/3 asks how many thirds fit, which is the same as multiplying by 3.",
        ["Flipping the first fraction instead of the second", "Multiplying straight across without taking the reciprocal", "Leaving the answer un-simplified"],
        "Complete the reciprocal-method practice sheet, questions 1–10.",
      ),
    },
    {
      title: "Cells: structure and function",
      subject: "Science",
      yearGroup: "Grade 7",
      topic: "Plant and animal cells",
      content: lessonPlan(
        "Cells: structure and function",
        "Plant and animal cells",
        ["Students will be able to label the main parts of plant and animal cells", "Students will be able to describe the function of each organelle", "Students will be able to explain two differences between plant and animal cells"],
        "Two unlabeled micrographs on the board, one plant and one animal. Ask students to spot three differences with a partner.",
        "Students annotate a plant and an animal cell diagram, then complete a function-matching table for six organelles.",
        "A cut-and-stick organelle card set reduces the writing load while keeping the science.",
        "Students argue, in three sentences, why a plant cell needs a cell wall and chloroplasts but an animal cell does not.",
        "Name one structure found only in plant cells and state its job.",
        "Cell wall (support/structure) or chloroplast (photosynthesis); either is correct with the right function.",
        ["Thinking animal cells have a cell wall", "Confusing the cell membrane with the cell wall", "Believing only plant cells have a nucleus"],
        "Draw and label a plant cell from memory, then check it against your notes and correct in a different colour.",
      ),
    },
  ];
}

function buildWorksheets() {
  const ratioQs: WQ[] = [
    { number: 1, prompt: "Write the ratio of 8 apples to 12 oranges in simplest form.", type: "short", options: null, answer: "2:3", workingOrRubric: "Divide both parts by the GCF, 4." },
    { number: 2, prompt: "A car travels 150 miles in 3 hours. What is the unit rate in miles per hour?", type: "calculation", options: null, answer: "50 mph", workingOrRubric: "150 ÷ 3 = 50." },
    { number: 3, prompt: "Which is the better value: 6 pens for $4.20 or 10 pens for $6.50?", type: "short", options: null, answer: "10 pens for $6.50 (65¢ each vs 70¢ each)", workingOrRubric: "Compare unit prices: 4.20/6 = 0.70; 6.50/10 = 0.65." },
    { number: 4, prompt: "A paint mix uses blue and white in the ratio 2:5. How much white is needed for 8 litres of blue?", type: "calculation", options: null, answer: "20 litres", workingOrRubric: "Scale factor 8÷2 = 4; 5×4 = 20." },
    { number: 5, prompt: "Explain in one sentence what a unit rate is.", type: "long", options: null, answer: "A unit rate is the amount of one quantity for exactly one unit of another (e.g. cost per item).", workingOrRubric: "Award full marks for 'per one unit' idea." },
  ];
  const cellsQs: WQ[] = [
    { number: 1, prompt: "Which organelle controls what enters and leaves the cell?", type: "multiple_choice", options: ["Nucleus", "Cell membrane", "Mitochondrion", "Vacuole"], answer: "Cell membrane", workingOrRubric: "Membrane = gatekeeper." },
    { number: 2, prompt: "State the function of the mitochondria.", type: "short", options: null, answer: "Release energy through respiration.", workingOrRubric: "Accept 'powerhouse / energy release'." },
    { number: 3, prompt: "Name two structures found in a plant cell but not an animal cell.", type: "short", options: null, answer: "Cell wall and chloroplast (also large vacuole).", workingOrRubric: "Any two of: cell wall, chloroplast, permanent vacuole." },
    { number: 4, prompt: "True or false: the nucleus is found only in plant cells.", type: "multiple_choice", options: ["True", "False"], answer: "False", workingOrRubric: "Both plant and animal cells have a nucleus." },
    { number: 5, prompt: "Why do leaf cells contain many chloroplasts?", type: "long", options: null, answer: "Chloroplasts carry out photosynthesis, and leaves are the main site of photosynthesis, so they need many to capture light.", workingOrRubric: "Link chloroplast → photosynthesis → light capture." },
  ];
  return [
    { title: "Ratios and unit rates practice", subject: "Mathematics", yearGroup: "Grade 6", topic: "Ratios and unit rates", difficulty: "core", content: { title: "Ratios and unit rates practice", instructions: "Show your working for every calculation. Simplify all ratios.", questions: ratioQs, teacherNotes: "Q3 is the key discriminator, so watch for students comparing totals instead of unit prices." } },
    { title: "Cell structure: labelling and function", subject: "Science", yearGroup: "Grade 7", topic: "Plant and animal cells", difficulty: "core", content: { title: "Cell structure: labelling and function", instructions: "Answer in full sentences where asked. Use the word bank if you need it.", questions: cellsQs, teacherNotes: "Q1 and Q4 surface the most common misconceptions; review as a class." } },
  ];
}

function buildQuizzes() {
  const ratioItems: QI[] = [
    { number: 1, prompt: "The ratio 15:25 in simplest form is:", type: "multiple_choice", options: ["3:5", "5:3", "3:4", "1:2"], correctAnswer: "3:5", difficulty: "easy", skillAssessed: "Simplifying ratios" },
    { number: 2, prompt: "12 cookies for 4 children is a unit rate of ___ cookies per child.", type: "short_answer", options: null, correctAnswer: "3", difficulty: "easy", skillAssessed: "Unit rate" },
    { number: 3, prompt: "A unit rate always compares a quantity to one unit of another quantity.", type: "true_false", options: ["True", "False"], correctAnswer: "True", difficulty: "medium", skillAssessed: "Defining unit rate" },
    { number: 4, prompt: "Which is the better buy: 3 kg for $7.50 or 5 kg for $12.00?", type: "multiple_choice", options: ["3 kg for $7.50", "5 kg for $12.00", "They are equal", "Cannot tell"], correctAnswer: "5 kg for $12.00", difficulty: "medium", skillAssessed: "Comparing rates" },
    { number: 5, prompt: "A recipe uses flour to sugar in the ratio 3:2. For 9 cups of flour, how many cups of sugar are needed?", type: "short_answer", options: null, correctAnswer: "6", difficulty: "hard", skillAssessed: "Scaling ratios" },
  ];
  return [
    { title: "Ratios and rates exit quiz", subject: "Mathematics", yearGroup: "Grade 6", topic: "Ratios and unit rates", format: "mixed", content: { title: "Ratios and rates exit quiz", format: "mixed", instructions: "Five questions. No calculator needed.", items: ratioItems } },
  ];
}

const STUDENTS = [
  { firstName: "Maya", lastInitial: "R" },
  { firstName: "Leo", lastInitial: "S" },
  { firstName: "Aisha", lastInitial: "K" },
  { firstName: "Diego", lastInitial: "M" },
  { firstName: "Grace", lastInitial: "T" },
  { firstName: "Noah", lastInitial: "P" },
];

async function createTeacherDemo(): Promise<void> {
  const passwordHash = hashPassword(randomBytes(24).toString("hex"));
  const [teacher] = await db.insert(teachersTable).values({
    email: DEMO_TEACHER_EMAIL,
    passwordHash,
    name: "Jordan Ellis",
    region: REGION,
    country: "United States",
    schoolName: "Lincoln Middle School (Demo)",
    subjects: ["Mathematics", "Science"],
    yearGroups: ["Grade 6", "Grade 7"],
    status: "active",
    // Unlimited generations for the shared demo, so visitors are never blocked by the free
    // quota and the seeded resources don't count against it.
    subscriptionStatus: "active",
    onboardedAt: new Date(),
    approvedAt: new Date(),
  }).returning();

  try {
    // Class + students
    const [cls] = await db.insert(classesTable).values({
      teacherId: teacher!.id,
      name: "Period 3: Grade 6 Math",
      subject: "Mathematics",
      yearGroup: "Grade 6",
      region: REGION,
    }).returning();

    const studentRows = await db.insert(studentsTable).values(
      STUDENTS.map((s) => ({
        classId: cls!.id,
        teacherId: teacher!.id,
        firstName: s.firstName,
        lastInitial: s.lastInitial,
        joinCode: generateShortCode(6),
      })),
    ).returning();

    // Lesson plans
    for (const p of buildPlans()) {
      await db.insert(lessonPlansTable).values({
        teacherId: teacher!.id,
        title: p.title,
        region: REGION,
        subject: p.subject,
        yearGroup: p.yearGroup,
        topic: p.topic,
        durationMinutes: 50,
        content: p.content,
      });
    }

    // Worksheets
    for (const w of buildWorksheets()) {
      await db.insert(worksheetsTable).values({
        teacherId: teacher!.id,
        title: w.title,
        region: REGION,
        subject: w.subject,
        yearGroup: w.yearGroup,
        topic: w.topic,
        difficulty: w.difficulty,
        questionCount: (w.content.questions as WQ[]).length,
        content: w.content,
      });
    }

    // Quizzes
    const quizIds: string[] = [];
    for (const q of buildQuizzes()) {
      const [row] = await db.insert(quizzesTable).values({
        teacherId: teacher!.id,
        title: q.title,
        region: REGION,
        subject: q.subject,
        yearGroup: q.yearGroup,
        topic: q.topic,
        format: q.format,
        questionCount: (q.content.items as QI[]).length,
        content: q.content,
      }).returning();
      quizIds.push(row!.id);
    }

    // One published assignment (the ratios quiz) + a spread of graded submissions
    const [assignment] = await db.insert(assignmentsTable).values({
      teacherId: teacher!.id,
      classId: cls!.id,
      resourceKind: "quiz",
      quizId: quizIds[0]!,
      title: "Ratios and rates exit quiz",
      deliveryMode: "accounts",
      shareCode: generateShortCode(7),
    }).returning();

    // Answers keyed by question number (1..5). Correct answers as strings.
    const correct: Record<string, string> = { "1": "3:5", "2": "3", "3": "True", "4": "5 kg for $12.00", "5": "6" };
    const scenarios = [
      { i: 0, answers: { "1": "3:5", "2": "3", "3": "True", "4": "5 kg for $12.00", "5": "6" }, status: "graded" },
      { i: 1, answers: { "1": "3:5", "2": "3", "3": "True", "4": "3 kg for $7.50", "5": "6" }, status: "graded" },
      { i: 2, answers: { "1": "5:3", "2": "3", "3": "True", "4": "5 kg for $12.00", "5": "4" }, status: "graded" },
      { i: 3, answers: { "1": "3:5", "2": "4", "3": "False", "4": "5 kg for $12.00", "5": "6" }, status: "graded" },
    ];
    for (const sc of scenarios) {
      const st = studentRows[sc.i]!;
      let auto = 0;
      const feedback = Object.keys(correct).map((n) => {
        const given = sc.answers[n] ?? "";
        const isRight = given.trim().toLowerCase() === correct[n]!.toLowerCase();
        if (isRight) auto += 1;
        return { number: Number(n), given, correct: correct[n]!, state: isRight ? "correct" : "incorrect" };
      });
      const pct = Math.round((auto / 5) * 100);
      await db.insert(submissionsTable).values({
        assignmentId: assignment!.id,
        studentId: st.id,
        displayName: `${st.firstName} ${st.lastInitial}.`,
        answers: sc.answers,
        autoScore: auto,
        maxAutoScore: 5,
        needsReviewCount: 0,
        feedback,
        gradingStatus: "graded",
        gradedAt: new Date(),
        aiSummary: {
          overall: pct >= 80
            ? `${st.firstName} has a secure grasp of ratios and unit rates, scoring ${auto}/5.`
            : `${st.firstName} scored ${auto}/5; the core idea is there but a specific step is slipping.`,
          strengths: auto >= 4 ? ["Simplifying ratios", "Finding unit rates"] : ["Finding simple unit rates"],
          gaps: pct >= 100 ? [] : [auto <= 3 ? "Ordering the parts of a ratio correctly" : "Comparing rates to judge the better value"],
          recommendations: pct >= 100
            ? ["Extend with multi-step scaling problems."]
            : ["Re-teach the 'divide to a unit' step with the ratio table scaffold.", "Assign the reciprocal-of-comparison practice set."],
        },
      });
    }
  } catch (err) {
    // Roll the teacher back so a partial seed doesn't wedge the demo; next boot retries.
    logger.error({ err }, "demo teacher seed failed; rolling back teacher row");
    await db.delete(teachersTable).where(eq(teachersTable.id, teacher!.id)).catch(() => {});
    throw err;
  }
}

export async function ensureTeacherDemoSeed(): Promise<{ created: boolean }> {
  const [existing] = await db.select().from(teachersTable).where(eq(teachersTable.email, DEMO_TEACHER_EMAIL)).limit(1);
  if (existing) return { created: false };
  await createTeacherDemo();
  return { created: true };
}

/** Force the demo account to the latest seed content (delete + recreate). Boot-time only. */
export async function reseedTeacherDemo(): Promise<{ created: boolean }> {
  const [existing] = await db.select().from(teachersTable).where(eq(teachersTable.email, DEMO_TEACHER_EMAIL)).limit(1);
  if (existing) await db.delete(teachersTable).where(eq(teachersTable.id, existing.id));
  await createTeacherDemo();
  return { created: true };
}
