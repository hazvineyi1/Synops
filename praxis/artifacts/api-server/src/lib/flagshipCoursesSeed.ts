import { db } from "@workspace/db";
import {
  partnersTable, organisationsTable, usersTable,
  coursesTable, modulesTable, beatsTable, moduleReadingsTable,
  caseScenariosTable, interactiveActivitiesTable, discussionsTable, assignmentsTable,
  coursePartnerAssignmentsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

/**
 * Three priority "flagship" courses for the Synops Praxis build, encoded exactly to the agreed
 * course architecture. Each module is one competency unit: phone-sized (6-8 min + a reasoning
 * check), opens with a Socratic scenario, has content points that support an observable DO
 * outcome, and sequences by dependency. Every course ends with an ARTIFACT the learner produces
 * from their own business, which the coach reviews to open the human coaching stage.
 *
 * Platform-owned, assigned to the Enza partner. Idempotent (reuse-by-title). Governance: this is a
 * delivery architecture to map a partner's signature curriculum onto; where the partner's programme
 * sequencing differs, it governs. Compliance content (Course 3) needs a named owner + review date
 * and verification against current SARS/CIPC/DTIC requirements before each intake; it teaches
 * process (what is required and where to do it), not tax or legal advice.
 */

const ENZA_SLUG = "enza-global";

interface FModule { title: string; outcome: string; scenario: string; points: string[]; minutes: number }
interface FCourse {
  title: string;
  courseOutcome: string;
  artifactLabel: string;
  artifactInstructions: string;
  intro: string;
  nqf: number;
  seta: string;
  tags: string[];
  modules: FModule[];
  caseScenario: string;
  readerExtra?: string;
}

const COURSES: FCourse[] = [
  // COURSE 1 ──────────────────────────────────────────────────────────────
  {
    title: "Business Model Canvas",
    courseOutcome: "Produce a complete, tested one-page business model for your own venture.",
    artifactLabel: "Completed canvas plus a named riskiest assumption",
    artifactInstructions: "Upload your completed Business Model Canvas for your OWN venture: one page, all nine blocks filled in. Then, in a sentence, name the single riskiest assumption in your model, the one that would break the business if it turned out to be wrong. Your coach reviews this before your first session, so be honest rather than tidy.",
    intro: "A great idea is not yet a business. Over eight short modules you build a complete business model on one page for your own venture, block by block, and finish by naming the one assumption most likely to sink it. This is the canvas your coach works from.",
    nqf: 5,
    seta: "Services SETA",
    tags: ["business model canvas", "value proposition", "customer segments", "SMME", "entrepreneurship"],
    modules: [
      { title: "What a business model actually is", outcome: "Distinguish a business idea from a business model.", scenario: "A friend says \"my business model is a coffee shop.\" Why is that not yet a model?", minutes: 8, points: [
        "A model is the story of how you create value and get paid for it",
        "Three things it must answer: what value, for whom, and how money returns",
        "Why funders and coaches ask for this before anything else",
      ] },
      { title: "Customer segments: who exactly", outcome: "Name and describe one to three specific customer segments.", scenario: "An entrepreneur says her customer is \"everyone who eats.\" What is the risk?", minutes: 8, points: [
        "Why \"everyone\" means no one in particular",
        "Segmenting by need, not just demographics",
        "Choosing a primary segment to start with",
      ] },
      { title: "Value proposition: the problem you solve", outcome: "Write a value proposition for one chosen segment.", scenario: "Two spaza shops on the same street sell the same goods. One thrives. Why?", minutes: 8, points: [
        "Pains you remove and gains you create",
        "The job the customer is actually hiring you to do",
        "Why they choose you over the alternative, including doing nothing",
      ] },
      { title: "Fit: testing your riskiest assumption", outcome: "Identify the single assumption that would break the business if it were wrong.", scenario: "A beautiful product, and nobody buying. Where is the gap?", minutes: 8, points: [
        "Problem and solution fit, in plain terms",
        "How to test an assumption cheaply, before spending money",
        "Talking to five real customers, and what to ask them",
      ] },
      { title: "Channels and relationships: reaching and keeping customers", outcome: "Map how customers find you, buy from you, and come back.", scenario: "WhatsApp orders, walk-in trade, or a corporate purchase order. Which fits your business?", minutes: 8, points: [
        "The path from awareness to purchase to after-sale",
        "Keeping a customer costs less than finding a new one",
        "Channels that actually work locally, including informal and digital",
      ] },
      { title: "Revenue streams: how the money comes in", outcome: "List your revenue streams and how each one is charged.", scenario: "A baker who only sells cakes, beside one who also teaches classes and delivers. Who is steadier?", minutes: 8, points: [
        "One-off sales versus repeat and recurring income",
        "More than one stream, and why that steadies a business",
        "The payer is not always the user, which matters in funded and corporate work",
      ] },
      { title: "The delivery side: activities, resources and partners", outcome: "Identify what you must do yourself and what you can partner or outsource.", scenario: "A caterer doing the cooking, the driving, the invoicing and the marketing alone. What breaks first?", minutes: 8, points: [
        "Key activities: the few things the business must do well",
        "Key resources: people, equipment, cash, reputation",
        "Key partners: suppliers, subcontractors, and who de-risks you",
      ] },
      { title: "Costs, and seeing the canvas as one system", outcome: "Complete your canvas and explain how changing one block changes others.", scenario: "You add a new customer segment. Which other blocks must move?", minutes: 8, points: [
        "Where your money goes, as a first look before the costing course",
        "The blocks connect: change one and others shift",
        "The canvas is a working draft you revisit, not a form you file",
      ] },
    ],
    caseScenario: "Sipho spent his savings building a slick app that books home cleaners for busy households in Sandton. Six months on, downloads are high but bookings are almost nil, and the few cleaners on the platform are drifting away. Walk his business model block by block with the learner and help them find where it actually breaks, and which assumption Sipho never tested.",
  },
  // COURSE 2 ──────────────────────────────────────────────────────────────
  {
    title: "Costing, Pricing and Margin",
    courseOutcome: "Calculate the true cost of one product or service and set a price you can defend.",
    artifactLabel: "A costing sheet for one product, with the chosen price and the reasoning",
    artifactInstructions: "Upload a costing sheet for ONE of your own products or services. Show the true unit cost (materials, your labour, packaging, waste and a share of overheads), your break-even, the price you have chosen, and the reasoning behind it. Real numbers from your own business, not an example. Your coach reviews this before your first session.",
    intro: "Busy but broke is the most common story in small business, and it is almost always a costing and pricing problem. Over eight short modules you work out what one of your products truly costs, how much you must sell to survive, and a price you can explain and defend, using your own numbers.",
    nqf: 5,
    seta: "Services SETA",
    tags: ["costing", "pricing", "margin", "break-even", "unit economics", "SMME"],
    modules: [
      { title: "Busy but broke: why turnover is not profit", outcome: "Explain the difference between turnover, profit, and cash in the bank.", scenario: "\"I am busy every single day and I still have no money.\" What is the first number to check?", minutes: 8, points: [
        "Three different numbers people call \"money\"",
        "Why a full order book can still sink a business",
        "What we will work out over this course",
      ] },
      { title: "The true cost of one unit", outcome: "Calculate the direct cost of producing one product or delivering one service.", scenario: "A plate of food sells for R50. What did it really cost to put on the table?", minutes: 8, points: [
        "Materials and ingredients, counted honestly",
        "Direct labour, including yours",
        "Packaging, waste and spoilage, the costs people leave out",
      ] },
      { title: "The costs you forget", outcome: "Include your own time and your overheads in the cost of what you sell.", scenario: "\"I do not pay myself, so my labour is free.\" What does that hide?", minutes: 8, points: [
        "Your time has a rate, even when you do not take it out",
        "Overheads: rent, transport, electricity, data and airtime",
        "Spreading overheads across what you sell",
      ] },
      { title: "Fixed and variable, and why the difference decides your choices", outcome: "Classify your costs and explain what changes when volume changes.", scenario: "Two businesses with the same turnover. One survives a slow month, one does not. Why?", minutes: 8, points: [
        "Costs that stay the same whether you sell one or one hundred",
        "Costs that move with every sale",
        "What each sale contributes once variable costs are covered",
      ] },
      { title: "Break-even: the number that keeps you alive", outcome: "Calculate how much you must sell before you earn anything.", scenario: "How many plates must you sell this month before a single rand is yours?", minutes: 8, points: [
        "Working out break-even in units and in rand",
        "What it tells you about your targets",
        "How far above break-even you need to be to be safe",
      ] },
      { title: "Choosing your pricing approach", outcome: "Select a pricing approach for your product and justify the choice.", scenario: "The same service priced three different ways. Which is right, and when?", minutes: 8, points: [
        "Cost-plus: simple, safe, and often leaves money behind",
        "Value-based: what the outcome is worth to the customer",
        "Market-based: pricing against what others charge, and its trap",
      ] },
      { title: "Markup, margin, and the discount trap", outcome: "Calculate markup and margin correctly, and work out what a discount really costs.", scenario: "You offer twenty percent off. How much more must you sell just to stand still?", minutes: 8, points: [
        "Markup and margin are not the same number",
        "Gross margin and net margin, and what each tells you",
        "The real cost of discounting, and of giving credit",
      ] },
      { title: "Changing your price, and defending it", outcome: "Plan a price change and explain it to a customer.", scenario: "You must raise prices. Your oldest customer complains. What do you say?", minutes: 8, points: [
        "When and how much to raise",
        "What to say, and what not to apologise for",
        "Which customers are worth keeping at the old price, and which are not",
      ] },
    ],
    caseScenario: "Nomsa bakes from home in Tembisa and sells about 200 cupcakes a week at R8 each. She is exhausted and always short of cash. Work with the learner to find her true cost per cupcake (including her own time and overheads), her weekly break-even, and a defensible new price, then help them explain the increase to her regular customers.",
  },
  // COURSE 3 ──────────────────────────────────────────────────────────────
  {
    title: "Compliance Essentials",
    courseOutcome: "Assemble a complete, supplier-ready compliance pack for your business.",
    artifactLabel: "A compliance checklist showing the status of each item, with documents attached",
    artifactInstructions: "Upload a completed compliance checklist for your business showing the status of each item (done / in progress / not started): CIPC registration, tax compliance status, B-BBEE affidavit, banking confirmation, company profile, and any employer registrations that apply. Attach the documents you already have. Your coach reviews this and helps you close the gaps.",
    intro: "Compliance is money, not paperwork: it is what lets a corporate pay you, a funder fund you, and a tender consider you. Over eight short modules you assemble a complete, supplier-ready document pack for your own business and build a simple calendar so it stays current.",
    nqf: 4,
    seta: "Services SETA",
    tags: ["compliance", "CIPC", "SARS", "VAT", "B-BBEE", "supplier readiness", "SMME"],
    readerExtra: "## Important\n\nThis course teaches **process, not advice**. It tells you what is required and where to do it, and stops short of tax or legal advice on your specific situation, for that, speak to a registered accountant or attorney. Compliance rules change: thresholds, portals and processes must be verified against the current SARS, CIPC and DTIC requirements. This course carries a named owner and a review date and should be re-checked before each intake.",
    modules: [
      { title: "Why compliance is money, not paperwork", outcome: "Explain what compliance unlocks: contracts, funding and tenders.", scenario: "An SME wins the work on merit, then loses it for one missing document. Which one?", minutes: 7, points: [
        "The documents a corporate asks for before they can pay you",
        "Why funders and tenders gate on compliance",
        "What this course will get you to by the end",
      ] },
      { title: "Choosing your business structure", outcome: "Choose an appropriate structure and explain the reasoning.", scenario: "Trading as yourself, or registering a company. What actually changes?", minutes: 7, points: [
        "Sole proprietor, partnership, and private company",
        "Personal liability, and why it matters as you grow",
        "How structure affects tax, credibility and access to contracts",
      ] },
      { title: "Registering your business with CIPC", outcome: "Complete or verify your company registration and know what stays due.", scenario: "Registered five years ago, never filed since. What is the risk?", minutes: 7, points: [
        "Name reservation and registration, step by step",
        "Your registration documents and where to keep them",
        "Annual returns and beneficial ownership, and what happens if you skip them",
      ] },
      { title: "SARS and your tax compliance status", outcome: "Obtain and maintain a valid tax compliance status.", scenario: "A corporate asks for your tax compliance status pin before issuing a purchase order.", minutes: 7, points: [
        "Registering for income tax as a business",
        "Getting your tax compliance status and keeping it valid",
        "Provisional tax and the deadlines that catch people out",
      ] },
      { title: "When VAT applies to you", outcome: "Determine whether you must register for VAT, or should choose to.", scenario: "Your turnover is growing fast. At what point does VAT become compulsory?", minutes: 7, points: [
        "The compulsory registration threshold and how it is measured",
        "Voluntary registration, and when it helps or hurts",
        "What changes once you are registered: invoicing, records and returns",
      ] },
      { title: "Employing people: PAYE, UIF and COIDA", outcome: "Identify your obligations when you hire your first employee.", scenario: "Your first hire starts on Monday. What must be in place before they do?", minutes: 7, points: [
        "Registering as an employer and deducting correctly",
        "UIF, and why it is not optional",
        "COIDA and the letter of good standing corporates ask for",
      ] },
      { title: "Your B-BBEE affidavit, and why it wins work", outcome: "Obtain the correct B-BBEE evidence for your turnover band.", scenario: "Two suppliers quote the same price. One has an affidavit. Who wins the contract?", minutes: 7, points: [
        "Exempted micro enterprises and the sworn affidavit",
        "What changes as you grow into the next band",
        "Why your rating earns procurement points for your customer, and therefore wins you work",
      ] },
      { title: "Becoming supplier-ready, and staying compliant", outcome: "Assemble the full document pack and build a compliance calendar.", scenario: "A buyer asks for your supplier pack today. Can you send it in an hour?", minutes: 7, points: [
        "The standard folder: registration, tax, affidavit, banking, company profile",
        "Registering on supplier databases for public and corporate work",
        "A simple calendar of what is due, and when",
      ] },
    ],
    caseScenario: "A corporate buyer wants to onboard Thabo's cleaning business as a supplier and asks for his full compliance pack by Friday. Work through each document he needs, honestly mark its likely status, and help the learner sequence how Thabo closes the gaps in time, without giving him specific tax or legal advice.",
  },
];

// ───────────────────────────────────────────────────────────────────────────
async function firstOrNull<T>(rows: T[]): Promise<T | null> { return rows.length ? rows[0]! : null; }

async function createFlagshipCourse(c: FCourse, orgId: string, facultyId: string): Promise<string> {
  const outcomes = c.modules.map((m) => m.outcome);
  const description = `${c.intro}\n\nCourse outcome: ${c.courseOutcome}`;
  const [course] = await db.insert(coursesTable).values({
    title: c.title, description, tenantId: "platform", status: "published",
    competencyTags: [...c.tags, c.seta], objectives: outcomes, nqfLevel: c.nqf,
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
      { moduleId: mod.id, type: "points", order: 1, title: "The key points", narration: `Hold the scenario in mind as we work through these. The check at the end asks you to reason, not just recall.`, bulletPoints: m.points },
      { moduleId: mod.id, type: "close", order: 2, title: "Your move", narration: `You can now: ${m.outcome} Apply it to your own business before the next module, this course builds one block on the last.` },
    ]);
    await db.update(modulesTable).set({ beatCount: 3 }).where(eq(modulesTable.id, mod.id));
    const body = `# ${m.title}\n\n**Scenario.** ${m.scenario}\n\n**By the end of this module you can:** ${m.outcome}\n\n## Key points\n\n${m.points.map((p) => `- ${p}`).join("\n")}\n\n_Knowledge check: a short Socratic question that probes your reasoning about the scenario, with mastery gating before you move on._`;
    await db.insert(moduleReadingsTable).values({
      moduleId: mod.id, courseId: course.id, title: `Lesson: ${m.title}`,
      kind: "note", content: body, chars: body.length, order: 0, published: true, createdBy: facultyId,
    });
  }
  await db.update(coursesTable).set({ moduleCount: c.modules.length }).where(eq(coursesTable.id, course.id));

  const reader = `# ${c.title}\n\n**NQF Level ${c.nqf}  ·  ${c.seta}  ·  ${c.modules.length} modules, phone-sized (6-8 min each) + final assessment**\n\n${c.intro}\n\n## Course outcome\n\n${c.courseOutcome}\n\n## What you will be able to do\n\n${outcomes.map((o, i) => `${i + 1}. ${o}`).join("\n")}\n\n## The artifact you produce\n\n${c.artifactLabel}. This is real work from your own business, and it is what opens your coaching relationship: your coach reviews it before your first session.\n\n## How this course is built\n\nEach module opens with a scenario, teaches a few supporting points, and ends with a Socratic knowledge check that probes your reasoning (with mastery gating). The modules run in dependency order, so nothing needs an idea introduced later. The course ends with a scenario assessment and your own artifact.${c.readerExtra ? `\n\n${c.readerExtra}` : ""}`;
  await db.insert(moduleReadingsTable).values({
    moduleId: firstModuleId, courseId: course.id, title: `Course reader: ${c.title}`,
    kind: "note", content: reader, chars: reader.length, order: 1, published: true, createdBy: facultyId,
  });

  await db.insert(caseScenariosTable).values({
    organisationId: orgId, moduleId: firstModuleId, createdBy: facultyId, createdByName: "Synops Faculty",
    title: `Final scenario: ${c.title}`,
    learningObjective: c.courseOutcome,
    contextBlock: c.caseScenario,
    openingQuestion: "Where would you start, and why? Talk me through your reasoning, not just your answer.",
    focusAreas: outcomes.slice(0, 3),
    difficulty: c.nqf >= 5 ? "intermediate" : "foundational",
    status: "published", isLibrary: true, tags: c.tags,
    guidingInstructions: `Coach the learner through this diagnosis with questions, never answers. Keep them reasoning about ${c.title.toLowerCase()} in a plain South African context. Push for a specific, defensible conclusion they could act on.`,
  });

  const items = outcomes.map((o) => `<li><label><input type="checkbox"> ${o}</label></li>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;color:#111;margin:0;padding:20px;background:#fff}h2{color:#111}li{margin:.5rem 0;list-style:none}.bar{height:8px;background:#eee;border-radius:6px;overflow:hidden;margin:12px 0}.fill{height:100%;width:0;background:#2563eb;transition:.3s}button{background:#111;color:#fff;border:0;border-radius:6px;padding:.6rem 1rem;font:inherit;cursor:pointer}.hint{color:#666;font-size:.9rem}</style><h2>${c.title} - readiness check</h2><p class="hint">Tick each thing you can honestly DO for your own business today.</p><ul id="l">${items}</ul><div class="bar"><div class="fill" id="f"></div></div><p id="s" class="hint">0% ready</p><button onclick="save()">Save my score</button><script>const cs=[...document.querySelectorAll('input')];function upd(){const n=cs.filter(x=>x.checked).length,p=Math.round(n/cs.length*100);document.getElementById('f').style.width=p+'%';document.getElementById('s').textContent=p+'% ready ('+n+' of '+cs.length+')';}cs.forEach(x=>x.addEventListener('change',upd));function save(){upd();alert('Saved. Focus next on the outcomes you left unticked.');}<\/script>`;
  await db.insert(interactiveActivitiesTable).values({
    organisationId: orgId, courseId: course.id, moduleId: firstModuleId,
    title: `${c.title}: readiness self-check`,
    instructions: `Rate yourself against the course outcomes now, and again at the end to see your growth.`,
    html, source: "html", kind: "checklist", bloomsLevel: "Evaluate",
    difficulty: c.nqf >= 5 ? "intermediate" : "foundational",
    isLibrary: true, tags: c.tags, published: true, createdByUserId: facultyId,
  });

  await db.insert(discussionsTable).values({
    courseId: course.id, authorId: facultyId, moduleId: firstModuleId,
    title: `Discussion: ${c.title} in your own business`,
    body: `In your first post (100-150 words): (1) name your own business or the one you are building; (2) share one thing this course changed in how you see it; and (3) one decision you will make because of it. Then reply helpfully to at least two classmates.`,
    aiFacilitated: true, requireInitialPost: true, graded: false,
  });

  await db.insert(assignmentsTable).values({
    courseId: course.id, moduleId: firstModuleId,
    title: `Artifact: ${c.artifactLabel}`,
    description: `The real output of this course, produced from your own business. Your coach reviews it to open the coaching relationship.`,
    instructions: c.artifactInstructions,
    submissionType: "file_upload", pointsPossible: "100", published: true, position: 0,
  });

  return course.id;
}

/**
 * Idempotent. Requires the Enza partner (run seed-enza first). Reuses the shared Enza SMME Academy
 * org + faculty author, then for each flagship course reuse-by-title or create, and assign to Enza.
 */
export async function seedFlagshipCourses(): Promise<{ total: number; created: number; assigned: number; error: string | null }> {
  const partner = await firstOrNull(await db.select().from(partnersTable).where(eq(partnersTable.slug, ENZA_SLUG)));
  if (!partner) return { total: COURSES.length, created: 0, assigned: 0, error: "Enza partner not found. Run seed-enza first." };

  await db.execute(sql`CREATE TABLE IF NOT EXISTS course_partner_assignments (id text PRIMARY KEY, course_id text NOT NULL, partner_id text NOT NULL, assigned_by text, assigned_at timestamptz NOT NULL DEFAULT now())`);

  let org = await firstOrNull(await db.select().from(organisationsTable).where(and(eq(organisationsTable.partnerId, partner.id), eq(organisationsTable.name, "Enza SMME Academy"))));
  if (!org) [org] = await db.insert(organisationsTable).values({ name: "Enza SMME Academy", partnerId: partner.id, industry: "Enterprise & Supplier Development" }).returning();
  let faculty = await firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, "curriculum@enzaglobalmedia.co.za")));
  if (!faculty) [faculty] = await db.insert(usersTable).values({ email: "curriculum@enzaglobalmedia.co.za", firstName: "Enza", lastName: "Faculty", role: "instructional_designer", status: "active", partnerId: partner.id, organisationId: org.id }).returning();

  let created = 0, assigned = 0, error: string | null = null;
  for (const c of COURSES) {
    try {
      const existingCourse = await firstOrNull(await db.select().from(coursesTable).where(and(eq(coursesTable.title, c.title), eq(coursesTable.tenantId, "platform"))));
      const courseId = existingCourse ? existingCourse.id : await createFlagshipCourse(c, org.id, faculty.id);
      if (!existingCourse) created++;
      const has = await db.select({ id: coursePartnerAssignmentsTable.id }).from(coursePartnerAssignmentsTable)
        .where(and(eq(coursePartnerAssignmentsTable.courseId, courseId), eq(coursePartnerAssignmentsTable.partnerId, partner.id)));
      if (has.length === 0) { await db.insert(coursePartnerAssignmentsTable).values({ courseId, partnerId: partner.id, assignedBy: faculty.id }); assigned++; }
    } catch (e) {
      if (!error) error = (e instanceof Error ? e.message : String(e)).slice(0, 240);
    }
  }
  return { total: COURSES.length, created, assigned, error };
}
