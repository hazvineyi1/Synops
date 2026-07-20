import { db } from "@workspace/db";
import {
  partnersTable, organisationsTable, usersTable,
  coursesTable, modulesTable, beatsTable, moduleReadingsTable,
  caseScenariosTable, interactiveActivitiesTable, discussionsTable, assignmentsTable,
  deliverySessionsTable, coursePartnerAssignmentsTable, gradebookItemsTable,
} from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";

/**
 * Turns the Enza course catalogue into FULL, comprehensive modules - no greyed-out tabs. For every
 * module of every Enza course this builds: a rich slide-deck lesson (with two Check-for-Understanding
 * quizzes), a NotebookLM-style narrated video lesson (rendered from slides), two substantial readings
 * (a deep dive and a current South-African landscape + resources reading), an interactive case-study
 * workshop, a Socratic case scenario, a module assignment, a module discussion, and a live workshop.
 * All content is written for township and rural SMME entrepreneurs using everyday South African
 * scenarios. Idempotent per module (a module that already has a video lesson is skipped).
 */

const ENZA_SLUG = "enza-global";
const ORG_NAME = "Enza SMME Academy";

function firstOrNull<T>(rows: T[]): T | null { return rows.length ? rows[0] : null; }
const soon = (days: number, hour = 10) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d; };

// Deterministic pick so re-runs are stable and modules vary.
function hashInt(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function pick<T>(arr: T[], seed: string, offset = 0): T { return arr[(hashInt(seed) + offset) % arr.length]; }

// Everyday township / rural micro-business scenarios used to make every concept concrete.
const SCENARIOS = [
  { biz: "a spaza shop", owner: "Thandi", place: "Soweto", detail: "she buys stock in bulk from a cash-and-carry and sells airtime, bread and paraffin" },
  { biz: "a kota and street-food stand", owner: "Sipho", place: "Katlehong", detail: "he serves office workers at lunch and students after school" },
  { biz: "a home hair salon", owner: "Lerato", place: "Diepsloot", detail: "she braids and does treatments from a room at home, mostly weekends" },
  { biz: "a home bakery", owner: "Nomsa", place: "Tembisa", detail: "she takes cake orders on WhatsApp for birthdays and weddings" },
  { biz: "a mobile car wash", owner: "Bongani", place: "Daveyton", detail: "he washes cars at a taxi rank and at customers' homes" },
  { biz: "a sewing and alterations business", owner: "Miriam", place: "Mdantsane", detail: "she makes school uniforms and does repairs" },
  { biz: "a poultry and egg business", owner: "Jabu", place: "rural KwaZulu-Natal", detail: "he sells eggs and live chickens to neighbours and a local shop" },
  { biz: "a catering business", owner: "Grace", place: "Mamelodi", detail: "she caters for funerals, church events and small functions" },
  { biz: "a beadwork and crafts business", owner: "Zanele", place: "the Eastern Cape", detail: "she sells at markets and to a tourist shop" },
  { biz: "a fresh-produce stall", owner: "Peter", place: "Khayelitsha", detail: "he buys vegetables at the market early and resells at a busy corner" },
];

// Current, real South-African business context woven into the 'landscape' reading, rotated by topic.
const LANDSCAPE = [
  { h: "Registering your business (CIPC)", t: "You can register a company with the CIPC (Companies and Intellectual Property Commission) online, often for under R200, and get a registration number that lets you open a business bank account and invoice larger customers. Many township businesses stay informal at first, which is fine to start, but formalising unlocks contracts, funding and supplier deals." },
  { h: "Tax made simple (SARS)", t: "Register on SARS eFiling once you are trading regularly. Very small businesses can use Turnover Tax, a single simplified tax based on turnover instead of full company tax. Keep every slip: what you cannot prove you spent, you cannot deduct." },
  { h: "Funding and support (SEFA, NYDA, SEDA)", t: "SEFA offers loans to small businesses, the NYDA supports youth-owned businesses with grants and mentorship, and SEDA gives free business advice and training. Development finance is patient money, but it always wants to see records, a plan and real demand." },
  { h: "Enterprise & Supplier Development (B-BBEE)", t: "Large corporates earn B-BBEE points by developing and buying from small black-owned businesses. This is why becoming 'corporate-ready' - registered, compliant, able to invoice and deliver - can open the door to steady orders far bigger than walk-in trade." },
  { h: "Getting paid digitally", t: "Card and QR tools like Yoco, SnapScan and Kazang let even a stand accept cards and track every sale. Digital records double as proof of income when you apply for funding, and customers without cash can still buy." },
  { h: "Stokvels and community savings", t: "Stokvels move billions of rand every year. A business or savings stokvel can fund stock, equipment or a lump sum through disciplined monthly contributions - community capital that needs no bank approval." },
  { h: "Selling on WhatsApp and social media", t: "WhatsApp Business lets you show a catalogue, set an away message and take orders in the app your customers already use. A consistent Facebook or Instagram page turns once-off buyers into repeat customers at almost no cost." },
  { h: "Trading through load-shedding", t: "Power cuts are a real cost. Gas, a small inverter or battery, and shifting the most power-hungry work to times when power is on all protect your income. Build the cost of staying open into your prices." },
];

function scenarioFor(seed: string) { return pick(SCENARIOS, seed); }
function landscapeFor(seed: string, n: number): typeof LANDSCAPE {
  const start = hashInt(seed) % LANDSCAPE.length;
  const out: typeof LANDSCAPE = [];
  for (let i = 0; i < n; i++) out.push(LANDSCAPE[(start + i) % LANDSCAPE.length]);
  return out;
}

interface Mod { id: string; title: string; objectives: string[]; }
interface Crs { id: string; title: string; description: string | null; tags: string[]; }

// ---- Beat generation (the slide-deck lesson) -------------------------------------------------
function buildBeats(course: Crs, mod: Mod, moduleIndex: number) {
  const objs = mod.objectives.length ? mod.objectives : [`understand the key ideas of ${mod.title}`];
  const s = scenarioFor(mod.id);
  const focus = mod.title.toLowerCase();
  const o0 = objs[0]; const o1 = objs[1] ?? objs[0]; const o2 = objs[2] ?? objs[objs.length - 1];

  const q1 = {
    quiz: {
      question: `${s.owner} runs ${s.biz} in ${s.place}. Which first step best reflects "${o0}"?`,
      options: [
        { id: "a", text: "Guess and hope it works out at month-end" },
        { id: "b", text: "Write down the real numbers and one small, specific action to take this week" },
        { id: "c", text: "Wait until the business is bigger before bothering with this" },
        { id: "d", text: "Copy exactly what the shop next door does" },
      ],
      correctId: "b",
      explanation: "Enza's method is implementation over theory: start from real numbers and take one small, costed, specific action now. Growth comes from doing, measuring and adjusting - not from guessing or waiting.",
    },
  };
  const q2 = {
    quiz: {
      question: `What is the strongest sign that ${s.owner} has actually applied "${o1}"?`,
      options: [
        { id: "a", text: "A change you can see in the numbers or the customer's experience" },
        { id: "b", text: "A longer to-do list" },
        { id: "c", text: "A feeling that things are better" },
        { id: "d", text: "More stock sitting in the back room" },
      ],
      correctId: "a",
      explanation: "Real learning shows up as a measurable change - more repeat customers, a healthier margin, less waste. If nothing in the numbers or the customer experience moves, the idea has not been applied yet.",
    },
  };

  return [
    { type: "title_card", order: 0, title: mod.title, narration: `Welcome to "${mod.title}". By the end of this module you will be able to: ${objs.join("; ")}. We will keep it practical and tied to a real business you know, so bring one to mind now - your own, or one like ${s.owner}'s ${s.biz} in ${s.place}.`, bulletPoints: objs },
    { type: "points", order: 1, title: "Why this matters for your business", narration: `Small changes in ${focus} compound. When ${s.owner} gets this right, ${s.detail} becomes more profitable and less stressful. Get it wrong and you work harder for less. This module gives you the exact moves to make.`, bulletPoints: [`It protects your cash and your time`, `It is something you can act on this week`, `It applies whether you are starting, growing or scaling`] },
    { type: "scenario", order: 2, title: "A day in the business", narration: `${s.owner} runs ${s.biz} in ${s.place} - ${s.detail}. Today ${s.owner} faces a decision about ${focus}. As you watch, ask yourself: what would I do here, and why? There is rarely one right answer, but there is always a clearer way to think it through.`, scenario: `${s.owner}'s challenge: getting ${focus} right without a big budget, while serving customers every day. Where would you start?` },
    { type: "points", order: 3, title: o0, narration: `The first big idea is simple: ${o0}. In practice that means writing things down instead of keeping them in your head, and turning a vague worry into one concrete number or action. ${s.owner} does not need fancy software - a notebook and honesty are enough to start.`, bulletPoints: [o0, "Write it down - do not keep it in your head", "Start with the real numbers you already have"] },
    { type: "points", order: 4, title: "Check for Understanding", narration: "Quick check before we go on.", bulletPoints: [], visualData: q1 },
    { type: "compare", order: 5, title: "Two ways to handle it", narration: `Compare two owners. One guesses and reacts; the other measures and plans. The guesser is always busy but never sure if today made money. The planner does a little admin each week and sleeps better because the numbers tell the truth. Small discipline beats big effort.`, bulletPoints: ["Guessing: busy, stressed, unsure if it is profitable", "Measuring: a little admin weekly, clear decisions, steady growth"] },
    { type: "points", order: 6, title: o1, narration: `The second idea builds on the first: ${o1}. This is where many good businesses stall - they can make the product but cannot ${focus} in a repeatable way. We break it into small steps so ${s.owner} can do one this week and the next one next week.`, bulletPoints: [o1, o2, "Repeatable beats perfect - build a habit, not a hero effort"] },
    { type: "diagram", order: 7, title: "A simple way to remember it", narration: `Hold on to this order: See the real numbers, Decide one small change, Do it this week, then Check what happened. See, Decide, Do, Check. Run that loop again and again and ${focus} keeps improving without a big budget or a business degree.`, bulletPoints: ["1. See the real numbers", "2. Decide one small change", "3. Do it this week", "4. Check what happened, then repeat"] },
    { type: "points", order: 8, title: "Check for Understanding", narration: "One more check.", bulletPoints: [], visualData: q2 },
    { type: "points", order: 9, title: "Do this in your own business this week", narration: `Do not close this module and forget it. Pick ONE action from ${focus} and do it before your next session. Bring the result - even if it did not work - to the discussion and your coaching. That is how ${s.owner}, and you, actually grow.`, bulletPoints: ["Choose ONE specific action", "Do it within 7 days", "Note what changed in the numbers or the customer experience", "Bring it to the discussion"] },
    { type: "close", order: 10, title: "Wrap up", narration: `You have completed "${mod.title}". You can now: ${objs.join("; ")}. Next: read the two readings, do the readiness workshop under Complete, post in the discussion, and submit the assignment. See you in the live workshop.`, bulletPoints: objs },
  ];
}

// ---- Video lesson (NotebookLM-style narrated slides) -----------------------------------------
function buildVideoBeat(course: Crs, mod: Mod) {
  const objs = mod.objectives.length ? mod.objectives : [mod.title];
  const s = scenarioFor(mod.id + "v");
  // Keyword-based, freely-licensed photos (LoremFlickr serves CC images from Flickr, no API key).
  // `lock` makes each slide's image stable across reloads. Keywords match township/SMME themes.
  const img = (kw: string, n: number) => `https://loremflickr.com/1280/720/${encodeURIComponent(kw)}?lock=${(hashInt(mod.id) % 900) + n}`;
  const slides = [
    { heading: mod.title, script: `This is your narrated overview of "${mod.title}", part of ${course.title}. In a few minutes you will get the big picture before you dive into the detail.`, points: ["What you will be able to do", "Why it matters", "How to apply it this week"], image: img("south,africa,business", 1) },
    { heading: "What you will be able to do", script: `By the end you will be able to: ${objs.join("; ")}. Keep a real business in mind - your own, or one like ${s.owner}'s ${s.biz}.`, points: objs.slice(0, 4), image: img("entrepreneur,africa", 2) },
    { heading: "The core idea", script: `${objs[0]}. The trick is to work from real numbers, not feelings, and to take small, specific actions you can actually do this week.`, points: ["Work from real numbers", "Small, specific actions", "Do it this week"], image: img("notebook,planning,business", 3) },
    { heading: "In real life", script: `${s.owner} runs ${s.biz} in ${s.place}, where ${s.detail}. Every idea in this module maps onto decisions ${s.owner} makes every day.`, points: ["Everyday decisions", "No big budget needed", "Notebook and honesty to start"], image: img("market,vendor,africa", 4) },
    { heading: "The loop to remember", script: `See the real numbers. Decide one small change. Do it this week. Check what happened. Then repeat. That simple loop is how ${mod.title.toLowerCase()} keeps improving.`, points: ["See", "Decide", "Do", "Check"], image: img("small,shop,owner", 5) },
    { heading: "Your next steps", script: `Read the two readings, complete the workshop under Complete, post in the discussion, and submit the assignment. Then bring your result to the live workshop.`, points: ["Readings", "Complete workshop", "Discussion", "Assignment", "Live workshop"], image: img("teamwork,training,africa", 6) },
  ];
  return {
    type: "video", order: 11, title: `Video lesson: ${mod.title}`,
    narration: `A short narrated slide lesson summarising "${mod.title}". Press play and follow along, then work through the sections.`,
    bulletPoints: [] as string[],
    transcript: slides.map((sl) => `${sl.heading}. ${sl.script}`).join("\n\n"),
    visualData: { slides },
  };
}

// ---- Readings --------------------------------------------------------------------------------
function deepDiveReading(course: Crs, mod: Mod): { title: string; content: string } {
  const objs = mod.objectives.length ? mod.objectives : [mod.title];
  const s = scenarioFor(mod.id + "r");
  const content = `# ${mod.title} - a practical deep dive\n\nThis reading goes deeper than the slides so you can apply "${mod.title.toLowerCase()}" in your own business with confidence.\n\n## Why this matters\n\n${course.description ?? course.title} sits or falls on getting this right. For a business like ${s.owner}'s ${s.biz} in ${s.place} - where ${s.detail} - the difference between guessing and knowing is the difference between surviving a slow month and being wiped out by one.\n\n## What you are learning to do\n\n${objs.map((o, i) => `${i + 1}. **${o}.** Do not just read this - picture exactly how it looks in your business.`).join("\n\n")}\n\n## A worked example\n\nImagine ${s.owner} sits down on a Sunday evening with a notebook. Instead of a vague sense that "things are okay", ${s.owner} writes down the real numbers for the week: what came in, what went out, and what is left. Suddenly the decisions about ${mod.title.toLowerCase()} are obvious, because they are based on facts, not feelings. That thirty minutes of honest admin is worth more than any expensive tool.\n\n## The method: See, Decide, Do, Check\n\n1. **See** the real numbers you already have.\n2. **Decide** one small, specific change.\n3. **Do** it within the week.\n4. **Check** what actually changed - in the money or in the customer's experience.\n\nRun that loop weekly and ${mod.title.toLowerCase()} stops being a mystery.\n\n## Common mistakes to avoid\n\n- Waiting until the business is "big enough" to bother. The habits you build small are the ones that carry you big.\n- Keeping everything in your head. Your memory is not a record; a cheap notebook is.\n- Copying the shop next door without checking whether it actually works for them.\n\n## Do this now\n\nBefore your next session, take one action from this reading and apply it to a real business. Write down what you did and what changed. Bring it to the discussion and to coaching.`;
  return { title: `Reading: ${mod.title} (deep dive)`, content };
}

function landscapeReading(course: Crs, mod: Mod): { title: string; content: string } {
  const items = landscapeFor(mod.id + "l", 4);
  const content = `# ${mod.title} - the South African landscape and where to get help\n\nBusiness does not happen in a vacuum. Here is current, practical context and real resources you can use as you apply "${mod.title.toLowerCase()}".\n\n${items.map((it) => `## ${it.h}\n\n${it.t}`).join("\n\n")}\n\n## Where to get free help\n\n- **SEDA** (Small Enterprise Development Agency): free business advice, training and support, with offices in most areas.\n- **NYDA** (National Youth Development Agency): grants, mentorship and voucher programmes for young entrepreneurs.\n- **Your local municipality's LED (Local Economic Development) office:** permits, market space and local opportunities.\n- **Enza Global:** coaching, practical training and incubation through the BizAscend programme - use your coach.\n\n## A note on staying current\n\nRules, grant windows and digital tools change. Before you rely on a specific number, deadline or programme, confirm it on the official website (for example cipc.co.za, sars.gov.za, sefa.org.za, nyda.gov.za) or ask your Enza coach. The habit of checking a primary source before you act is itself a business skill.`;
  return { title: `Reading: ${mod.title} (SA landscape & resources)`, content };
}

// ---- Interactive case-study workshop (Complete tab) ------------------------------------------
function caseWorkshopHtml(course: Crs, mod: Mod): string {
  const objs = mod.objectives.length ? mod.objectives : [mod.title];
  const s = scenarioFor(mod.id + "c");
  const checks = objs.map((o) => `<li><label><input type="checkbox"> I can do this in my own business: ${o}</label></li>`).join("");
  const prompts = [
    `What is the single biggest challenge in ${mod.title.toLowerCase()} for your business right now?`,
    `Looking at ${s.owner}'s ${s.biz}, what one change would you make first, and why?`,
    `What is the ONE action you will take this week, and how will you know if it worked?`,
  ].map((p, i) => `<div class="q"><label>${i + 1}. ${p}</label><textarea rows="3" placeholder="Type your answer..."></textarea></div>`).join("");
  return `<!doctype html><meta charset="utf-8"><style>body{font-family:Heebo,system-ui,sans-serif;color:#111;margin:0;padding:22px;background:#fff;line-height:1.5}h2{margin:.2rem 0}h3{color:#111}.case{background:#f6f8f0;border-left:4px solid #9CDF00;padding:12px 14px;border-radius:8px;margin:12px 0}li{margin:.4rem 0;list-style:none}.q{margin:14px 0}textarea{width:100%;box-sizing:border-box;border:1px solid #cfd6c2;border-radius:8px;padding:8px;font:inherit}.bar{height:8px;background:#eee;border-radius:6px;overflow:hidden;margin:10px 0}.fill{height:100%;width:0;background:#9CDF00;transition:.3s}button{background:#111;color:#fff;border:0;border-radius:8px;padding:.6rem 1rem;font:inherit;cursor:pointer}.hint{color:#666;font-size:.9rem}</style>`
    + `<h2>${mod.title}: case-study workshop</h2><p class="hint">Work through the case, rate yourself, and plan one real action. This is your Complete activity.</p>`
    + `<h3>The case</h3><div class="case"><strong>${s.owner}'s ${s.biz}, ${s.place}.</strong> ${s.detail}. ${s.owner} needs to get <em>${mod.title.toLowerCase()}</em> right without a big budget, while serving customers every day.</div>`
    + `<h3>Rate yourself</h3><ul id="l">${checks}</ul><div class="bar"><div class="fill" id="f"></div></div><p id="s" class="hint">0% ready</p>`
    + `<h3>Plan your move</h3>${prompts}`
    + `<p><button onclick="save()">Save my workshop</button></p>`
    + `<script>const cs=[...document.querySelectorAll('#l input')];function upd(){const n=cs.filter(x=>x.checked).length,p=Math.round(n/cs.length*100);document.getElementById('f').style.width=p+'%';document.getElementById('s').textContent=p+'% ready ('+n+' of '+cs.length+')';}cs.forEach(x=>x.addEventListener('change',upd));function save(){upd();alert('Saved. Bring your one action to the discussion and to coaching.');}<\/script>`;
}

async function healContentTables(): Promise<void> {
  // delivery_sessions was created by an older deploy in some environments; heal any missing columns.
  const ds: string[] = [
    "course_id text", "module_id text", "facilitator_id text",
    "session_type text NOT NULL DEFAULT 'in_person'", "scheduled_at timestamptz",
    "duration_minutes integer NOT NULL DEFAULT 60", "location text", "join_url text", "notes text",
    "created_at timestamptz NOT NULL DEFAULT now()", "updated_at timestamptz NOT NULL DEFAULT now()",
  ];
  await db.execute(sql`CREATE TABLE IF NOT EXISTS delivery_sessions (id text PRIMARY KEY, tenant_id text NOT NULL, title text NOT NULL DEFAULT 'Session')`);
  for (const c of ds) { try { await db.execute(sql.raw(`ALTER TABLE delivery_sessions ADD COLUMN IF NOT EXISTS ${c}`)); } catch { /* ignore */ } }
  const asg: string[] = [
    "module_id text", "description text", "instructions text", "assignment_type text NOT NULL DEFAULT 'essay'",
    "due_date timestamptz", "available_from timestamptz", "available_until timestamptz",
    "points_possible numeric(7,2) NOT NULL DEFAULT 100", "allow_late_submissions boolean NOT NULL DEFAULT true",
    "late_penalty_percent integer NOT NULL DEFAULT 0", "rubric_id text", "group_assignment boolean NOT NULL DEFAULT false",
    "peer_review_required boolean NOT NULL DEFAULT false", "peer_review_count integer NOT NULL DEFAULT 0",
    "published boolean NOT NULL DEFAULT false", "position integer NOT NULL DEFAULT 0",
    "created_at timestamptz NOT NULL DEFAULT now()", "updated_at timestamptz NOT NULL DEFAULT now()",
  ];
  for (const c of asg) { try { await db.execute(sql.raw(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS ${c}`)); } catch { /* ignore */ } }
}

export async function enrichEnzaCourses(): Promise<{ modules: number; enriched: number; error: string | null }> {
  const partner = firstOrNull(await db.select().from(partnersTable).where(eq(partnersTable.slug, ENZA_SLUG)));
  if (!partner) return { modules: 0, enriched: 0, error: "Provision Enza Global first." };
  await healContentTables();

  let org = firstOrNull(await db.select().from(organisationsTable).where(and(eq(organisationsTable.partnerId, partner.id), eq(organisationsTable.name, ORG_NAME))));
  if (!org) org = firstOrNull(await db.select().from(organisationsTable).where(eq(organisationsTable.partnerId, partner.id)));
  const orgId = org?.id ?? partner.id;
  let faculty = firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, "curriculum@enzaglobalmedia.co.za")));
  const facultyId = faculty?.id ?? null;

  // Enza's assigned courses.
  const assigned = await db.select().from(coursePartnerAssignmentsTable).where(eq(coursePartnerAssignmentsTable.partnerId, partner.id));
  const courseIds = [...new Set(assigned.map((a) => a.courseId))];

  let modulesTotal = 0;
  let enriched = 0;
  let error: string | null = null;

  for (const courseId of courseIds) {
    const course = firstOrNull(await db.select().from(coursesTable).where(eq(coursesTable.id, courseId)));
    if (!course) continue;
    const crs: Crs = { id: course.id, title: course.title, description: course.description ?? null, tags: (course.competencyTags as string[]) ?? [] };
    const mods = await db.select().from(modulesTable).where(eq(modulesTable.courseId, courseId)).orderBy(asc(modulesTable.order));

    for (let mi = 0; mi < mods.length; mi++) {
      modulesTotal++;
      const m = mods[mi];
      const mod: Mod = { id: m.id, title: m.title, objectives: (m.objectives as string[]) ?? [] };
      try {
        const existingBeats = await db.select().from(beatsTable).where(eq(beatsTable.moduleId, m.id));
        // "Enriched" only if the module already has a video lesson whose slides carry images - so an
        // earlier build that predates slide images is upgraded on the next run rather than skipped.
        const videoBeat = existingBeats.find((b) => b.type === "video");
        const hasSlideImages = !!(videoBeat && (videoBeat.visualData as any)?.slides?.[0]?.image);
        const alreadyEnriched = hasSlideImages;
        if (!alreadyEnriched) {
          // Replace placeholder beats with the full slide-deck lesson + video lesson.
          await db.delete(beatsTable).where(eq(beatsTable.moduleId, m.id));
          const beats = buildBeats(crs, mod, mi).map((b) => ({ moduleId: m.id, ...b }));
          const video = { moduleId: m.id, ...buildVideoBeat(crs, mod) };
          await db.insert(beatsTable).values([...beats, video] as any);
          await db.update(modulesTable).set({ beatCount: beats.length + 1, estimatedMinutes: 45, status: "published", updatedAt: new Date() }).where(eq(modulesTable.id, m.id));
          enriched++;
        }

        // Readings: ensure at least the two rich readings exist for this module.
        const readings = await db.select({ id: moduleReadingsTable.id }).from(moduleReadingsTable).where(eq(moduleReadingsTable.moduleId, m.id));
        if (readings.length < 2) {
          const dd = deepDiveReading(crs, mod);
          const ls = landscapeReading(crs, mod);
          for (const r of [dd, ls]) {
            await db.insert(moduleReadingsTable).values({ moduleId: m.id, courseId, title: r.title, kind: "note", content: r.content, chars: r.content.length, order: 0, published: true, createdBy: facultyId });
          }
        }

        // Complete: an interactive case-study workshop homed in this module.
        const acts = await db.select({ id: interactiveActivitiesTable.id }).from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.moduleId, m.id));
        if (acts.length === 0) {
          await db.insert(interactiveActivitiesTable).values({
            organisationId: orgId, courseId, moduleId: m.id,
            title: `${mod.title}: case-study workshop`,
            instructions: "Work through the case, rate yourself against the objectives, and plan one real action to take this week.",
            html: caseWorkshopHtml(crs, mod), source: "html", kind: "checklist", bloomsLevel: "Apply",
            isLibrary: false, tags: crs.tags, published: true, createdByUserId: facultyId,
          } as any);
        }

        // A Socratic case scenario homed in this module. It MUST be a library case with no owning
        // org (organisationId null + isLibrary true): a learner starts a case only if it is in scope,
        // and scope for a module case = "library OR my tenant". The learners live in a different org
        // than the content author, so an org-owned case 404s for them - a library case + the module's
        // course-enrolment check is the correct gate.
        const cases = await db.select().from(caseScenariosTable).where(eq(caseScenariosTable.moduleId, m.id));
        let caseId: string | null = cases[0]?.id ?? null;
        if (cases.length === 0 && facultyId) {
          const s = scenarioFor(mod.id + "sc");
          const [createdCase] = await db.insert(caseScenariosTable).values({
            organisationId: null, moduleId: m.id, createdBy: facultyId, createdByName: "Enza Faculty",
            title: `Case study: ${crs.title}`, learningObjective: mod.objectives[0] ?? mod.title,
            contextBlock: `${s.owner} runs ${s.biz} in ${s.place}, where ${s.detail}. ${s.owner} must get ${mod.title.toLowerCase()} right on a tight budget while serving customers every day.`,
            openingQuestion: "Where would you start, and why? Talk me through your thinking as an entrepreneur.",
            focusAreas: mod.objectives.slice(0, 3), difficulty: "foundational", status: "published", isLibrary: true, tags: crs.tags,
            guidingInstructions: `Coach through questions, not answers. Keep the learner focused on ${mod.title.toLowerCase()} and push for concrete, costed, actionable steps in a South African SMME context.`,
          } as any).returning();
          caseId = createdCase?.id ?? null;
        } else if (cases.length > 0) {
          // Repair earlier cases so they are reachable by learners (library, published).
          await db.update(caseScenariosTable)
            .set({ organisationId: null, isLibrary: true, status: "published", updatedAt: new Date() })
            .where(eq(caseScenariosTable.moduleId, m.id));
        }
        // Connect the case to the gradebook, so the end-of-session analysis is recorded as a grade.
        if (caseId) {
          await db.insert(gradebookItemsTable).values({
            courseId, sourceType: "case", sourceId: caseId,
            title: `Case study: ${mod.title}`, category: "Case studies", itemType: "formative",
            pointsPossible: "100", includeInGrade: true, position: mi, createdBy: facultyId,
          } as any).onConflictDoNothing();
        }

        // Assignments: a module-level applied task.
        const asg = await db.select({ id: assignmentsTable.id }).from(assignmentsTable).where(eq(assignmentsTable.moduleId, m.id));
        if (asg.length === 0) {
          await db.insert(assignmentsTable).values({
            courseId, moduleId: m.id, title: `Apply it: ${mod.title}`,
            description: `A short, practical task applying "${mod.title.toLowerCase()}" to a real business.`,
            instructions: `Using a real business (your own or one you can access), complete this task:\n\n${mod.objectives.map((o, i) => `${i + 1}. Show how you would: ${o}`).join("\n")}\n\nKeep it to one page or a filled-in template. Use real numbers. Then take ONE action this week and note what changed.`,
            submissionType: "file_upload", pointsPossible: "50", published: true, position: mi,
          } as any);
        }

        // Participate: a module discussion.
        const disc = await db.select({ id: discussionsTable.id }).from(discussionsTable).where(and(eq(discussionsTable.courseId, courseId), eq(discussionsTable.moduleId, m.id)));
        if (disc.length === 0 && facultyId) {
          await db.insert(discussionsTable).values({
            courseId, authorId: facultyId, moduleId: m.id, title: `Discussion: ${mod.title}`,
            body: `Post about a real business (your own or one you know). In 100-150 words: (1) the biggest challenge it faces with ${mod.title.toLowerCase()}; (2) one specific action you will take from this module; (3) the result you expect. Then reply to two classmates with a practical suggestion.`,
            aiFacilitated: true, requireInitialPost: true, graded: false,
          } as any);
        }

        // Workshop: a live facilitated session on this module.
        const sess = await db.select({ id: deliverySessionsTable.id }).from(deliverySessionsTable).where(eq(deliverySessionsTable.moduleId, m.id));
        if (sess.length === 0) {
          await db.insert(deliverySessionsTable).values({
            tenantId: orgId, courseId, moduleId: m.id, facilitatorId: facultyId,
            title: `Workshop: ${mod.title}`, sessionType: "workshop",
            scheduledAt: soon(7 + mi * 3), durationMinutes: 90,
            joinUrl: "https://meet.google.com/enza-bizascend",
            notes: `Bring the action you took from "${mod.title}". We will troubleshoot together and plan the next step.`,
          } as any);
        }
      } catch (e) {
        if (!error) error = (e instanceof Error ? e.message : String(e)).slice(0, 240);
      }
    }
  }

  return { modules: modulesTotal, enriched, error };
}
