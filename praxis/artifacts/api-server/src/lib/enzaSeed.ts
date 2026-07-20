import { db } from "@workspace/db";
import {
  partnersTable, brandThemesTable, organisationsTable, usersTable,
  coursesTable, modulesTable, beatsTable, moduleReadingsTable,
  caseScenariosTable, interactiveActivitiesTable, discussionsTable, assignmentsTable,
  coursePartnerAssignmentsTable,
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
    title: "The Entrepreneurial Mindset & Opportunity Spotting",
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
      { title: "Seeing opportunity everywhere", objectives: ["Use the problem-first lens to find opportunities in daily life.", "Distinguish a real customer pain from a nice-to-have.", "Generate at least ten opportunity ideas from your own context."], minutes: 55 },
      { title: "Screening and shaping ideas", objectives: ["Apply the desirability / feasibility / viability test to an idea.", "Narrow many ideas down to one to pursue first.", "Write a one-sentence opportunity statement."], minutes: 50 },
      { title: "From idea to first action", objectives: ["Break a big idea into the smallest testable first step.", "Set a 90-day founder action plan with milestones.", "Commit to an accountability and support routine."], minutes: 40 },
    ],
    caseScenario: "Thandi runs a small vegetable stall in Diepsloot and keeps hearing customers complain that fresh produce spoils before month-end. She suspects there is a bigger opportunity but is unsure whether it is worth pursuing or how to start. Help Thandi think it through as an entrepreneur.",
  },
  {
    title: "Business Model Design with the Business Model Canvas",
    focus: "designing how a business creates, delivers and captures value using the Business Model Canvas",
    description: "A great idea is not yet a business. This course teaches learners to design a complete business model on one page using the Business Model Canvas, so they can see how customer segments, value, channels, revenue and costs fit together - and spot the weak assumptions that sink small businesses before they test them in the market.",
    objectives: [
      "Explain the nine building blocks of the Business Model Canvas and how they interact.",
      "Map your own business idea onto a complete one-page canvas.",
      "Identify the riskiest assumptions in your model and how you would test them.",
      "Compare alternative revenue and channel options for the same idea.",
    ],
    tags: ["business model", "canvas", "strategy", "SMME"],
    nqf: 5,
    modules: [
      { title: "Why business models matter", objectives: ["Explain the difference between an idea, a product and a business model.", "Describe how a viable model links value and money.", "Recognise common model failure patterns in small business."], minutes: 45 },
      { title: "The front stage: customers, value, channels", objectives: ["Define clear customer segments for your idea.", "Write a value proposition for each segment.", "Choose channels and a customer-relationship approach."], minutes: 60 },
      { title: "The back stage: activities, resources, partners, costs", objectives: ["List the key activities and resources your model needs.", "Identify partners that reduce cost or risk.", "Estimate your main cost drivers."], minutes: 55 },
      { title: "Revenue, risk and iteration", objectives: ["Design one or more revenue streams.", "Surface and rank your riskiest assumptions.", "Revise the canvas after a reality check."], minutes: 50 },
    ],
    caseScenario: "Sipho wants to turn his weekend car-wash into a real business with regular income. He has energy and loyal customers but no clear model. Walk Sipho through building his Business Model Canvas and finding his riskiest assumption.",
  },
  {
    title: "Value Proposition Design & Customer Discovery",
    focus: "getting out of the building to understand customers deeply and design a value proposition they will pay for",
    description: "Most small businesses fail because they build something nobody wants badly enough to pay for. This course teaches customer discovery - how to talk to real customers, uncover their jobs, pains and gains, and shape a value proposition that fits - so founders build with evidence instead of assumptions.",
    objectives: [
      "Explain the jobs-to-be-done, pains and gains framework for understanding customers.",
      "Plan and run a customer-discovery interview without leading the witness.",
      "Design a value proposition that maps directly to customer pains and gains.",
      "Decide whether to persevere, tweak or pivot based on customer evidence.",
    ],
    tags: ["value proposition", "customer discovery", "product-market fit", "SMME"],
    nqf: 5,
    modules: [
      { title: "Understanding the customer", objectives: ["Describe customer jobs, pains and gains.", "Build a customer profile for your target segment.", "Avoid assuming what customers want."], minutes: 50 },
      { title: "The art of the customer interview", objectives: ["Write non-leading discovery questions.", "Conduct a short interview and take useful notes.", "Separate facts from opinions and compliments."], minutes: 55 },
      { title: "Designing the value map", objectives: ["Create products/services that relieve pains and create gains.", "Draft a clear value-proposition statement.", "Check fit between the value map and customer profile."], minutes: 55 },
      { title: "Fit, evidence and the decision to pivot", objectives: ["Weigh evidence for and against product-market fit.", "Decide to persevere, tweak or pivot.", "Plan the next round of discovery."], minutes: 45 },
    ],
    caseScenario: "Lerato is about to spend her savings launching a meal-prep service for busy professionals, based on what her friends told her they'd love. Before she commits, help her design a customer-discovery plan and test whether the demand is real.",
  },
  {
    title: "Market Research & Idea Validation",
    focus: "researching a market and running cheap experiments to validate demand before spending money",
    description: "Before investing time and money, smart founders validate. This course gives learners practical, low-cost tools to size a market, understand competitors, and run simple experiments (landing pages, pre-orders, smoke tests) that produce real signals of demand - so decisions rest on evidence, not hope.",
    objectives: [
      "Distinguish primary from secondary research and choose the right method for a question.",
      "Estimate the size and reachability of a target market.",
      "Analyse competitors and find a defensible position.",
      "Design and run a low-cost validation experiment and interpret the result.",
    ],
    tags: ["market research", "validation", "competitor analysis", "SMME"],
    nqf: 4,
    modules: [
      { title: "Asking the right market questions", objectives: ["Frame the key questions your business must answer.", "Choose primary or secondary methods to answer them.", "Find free and low-cost data sources."], minutes: 45 },
      { title: "Sizing the market and reaching it", objectives: ["Estimate market size top-down and bottom-up.", "Judge whether you can actually reach that market.", "Segment the market into serviceable groups."], minutes: 50 },
      { title: "Knowing your competitors", objectives: ["Map direct and indirect competitors.", "Identify a gap or differentiator you can own.", "Position your offer against alternatives."], minutes: 45 },
      { title: "Running validation experiments", objectives: ["Design a smoke test, pre-order or landing-page experiment.", "Define a clear pass/fail signal in advance.", "Interpret results and decide the next step."], minutes: 55 },
    ],
    caseScenario: "Ayanda believes there is demand for affordable school uniforms sold online in her township, but she has never tested it. Design a two-week, low-budget validation plan and tell her what result would justify going ahead.",
  },
  {
    title: "Costing, Pricing & Unit Economics for SMMEs",
    focus: "knowing your true costs, setting profitable prices, and understanding the economics of a single sale",
    description: "Under-pricing quietly kills profitable-looking small businesses. This hands-on course teaches learners to calculate true costs, set prices that cover costs and margin, and understand unit economics - the profit or loss on a single sale - so every sale moves the business forward, not backward.",
    objectives: [
      "Separate fixed from variable costs and calculate the true cost of a product or service.",
      "Apply cost-plus, value-based and competitor-based pricing and choose appropriately.",
      "Calculate the contribution and break-even point for your business.",
      "Build a simple unit-economics model and use it to make pricing decisions.",
    ],
    tags: ["costing", "pricing", "unit economics", "profit", "SMME"],
    nqf: 5,
    modules: [
      { title: "Knowing your true costs", objectives: ["Classify costs as fixed or variable.", "Cost a product or service accurately, including hidden costs.", "Avoid the most common costing mistakes."], minutes: 55 },
      { title: "Pricing strategies that work", objectives: ["Apply cost-plus, value-based and competitor pricing.", "Choose the right approach for your offer and market.", "Handle discounts and price objections without destroying margin."], minutes: 55 },
      { title: "Break-even and contribution", objectives: ["Calculate contribution per unit.", "Find your break-even volume.", "Use break-even to set sales targets."], minutes: 50 },
      { title: "Unit economics and decisions", objectives: ["Build a simple unit-economics model.", "Judge whether each sale is profitable.", "Use the model to change price, cost or mix."], minutes: 50 },
    ],
    caseScenario: "Wendy of CakesbyWendy sells cakes but is not sure she is actually making money after ingredients, gas, transport and her own time. Help her cost one signature cake properly and set a price that finally makes the business profitable.",
  },
  {
    title: "Financial Management & Bookkeeping Basics",
    focus: "keeping clean records, separating business and personal money, and reading the numbers that keep a business alive",
    description: "Cash-flow problems, not lack of profit, close most small businesses. This course builds the financial discipline every SMME needs: separating business and personal money, keeping simple books, managing cash flow, and reading the three basic financial statements well enough to make good decisions and satisfy funders.",
    objectives: [
      "Separate business and personal finances and set up a simple record-keeping system.",
      "Record income and expenses and reconcile them monthly.",
      "Build and manage a cash-flow forecast.",
      "Read an income statement, balance sheet and cash-flow statement at a basic level.",
    ],
    tags: ["finance", "bookkeeping", "cash flow", "SMME"],
    nqf: 4,
    modules: [
      { title: "Getting your money house in order", objectives: ["Separate business and personal money.", "Choose a simple record-keeping system.", "Establish a weekly money routine."], minutes: 45 },
      { title: "Recording and reconciling", objectives: ["Record income and expenses consistently.", "Reconcile records to the bank monthly.", "Keep documents that satisfy SARS and funders."], minutes: 50 },
      { title: "Cash is king: managing cash flow", objectives: ["Build a 12-week cash-flow forecast.", "Spot and prevent cash-flow gaps.", "Manage debtors, creditors and stock for cash."], minutes: 55 },
      { title: "Reading your financial statements", objectives: ["Read an income statement and balance sheet.", "Interpret a cash-flow statement.", "Use three simple ratios to check business health."], minutes: 50 },
    ],
    caseScenario: "Mofine Foods is growing but the owner never knows whether there will be enough cash to pay suppliers next week, and mixes business and personal money. Help set up a simple bookkeeping and cash-flow system that gives control back.",
  },
  {
    title: "Sales Fundamentals & the Sales Boost",
    focus: "building a repeatable sales process, handling objections, and closing more sales with confidence",
    description: "Nothing happens until something is sold. This practical course - modelled on Enza's Sales Boost coaching - builds a repeatable sales process for small businesses: finding leads, qualifying, presenting value, handling objections, closing, and following up, so founders can grow revenue predictably instead of waiting for luck.",
    objectives: [
      "Map a simple, repeatable sales process from lead to repeat customer.",
      "Qualify leads and focus effort on the best prospects.",
      "Present value and handle common objections with confidence.",
      "Ask for the sale and build a follow-up habit that grows repeat business.",
    ],
    tags: ["sales", "revenue", "customers", "SMME"],
    nqf: 4,
    modules: [
      { title: "The sales mindset and process", objectives: ["Reframe selling as helping, not pushing.", "Map your own sales process end to end.", "Set a weekly sales activity target."], minutes: 45 },
      { title: "Finding and qualifying leads", objectives: ["Generate leads from your network and channels.", "Qualify leads so you spend time on the right ones.", "Keep a simple sales pipeline."], minutes: 50 },
      { title: "Presenting value and handling objections", objectives: ["Present benefits, not just features.", "Respond to price and trust objections calmly.", "Turn objections into progress."], minutes: 55 },
      { title: "Closing and follow-up", objectives: ["Ask for the sale confidently.", "Build a follow-up routine.", "Turn one sale into repeat and referral business."], minutes: 45 },
    ],
    caseScenario: "A Katlehong founder gets lots of interest at markets but few people actually buy, and he never follows up. Coach him through a simple sales process and role-play how he could handle the most common objection he hears: 'It's too expensive.'",
  },
  {
    title: "Digital Marketing & Social Media for Small Business",
    focus: "using social media, WhatsApp and simple content to attract and keep customers on a small budget",
    description: "A small business today can reach thousands of customers from a phone. This course teaches practical, low-cost digital marketing for SMMEs: building a simple brand and content plan, using WhatsApp Business, Facebook and Instagram well, and turning followers into paying customers - without wasting money on ads that don't work.",
    objectives: [
      "Define a simple brand identity and consistent message for your business.",
      "Create a lightweight content plan you can actually maintain.",
      "Use WhatsApp Business, Facebook and Instagram to attract and serve customers.",
      "Measure what is working and stop wasting effort on what is not.",
    ],
    tags: ["digital marketing", "social media", "branding", "SMME"],
    nqf: 4,
    modules: [
      { title: "Your brand and message", objectives: ["Define who you serve and what you stand for.", "Create a consistent name, look and message.", "Write a one-line pitch for your business."], minutes: 45 },
      { title: "Content that attracts customers", objectives: ["Plan a simple weekly content rhythm.", "Create posts that show value, not just products.", "Reuse content across channels efficiently."], minutes: 50 },
      { title: "Channels that work for SMMEs", objectives: ["Set up WhatsApp Business properly.", "Use Facebook and Instagram to reach local customers.", "Decide when a small paid boost is worth it."], minutes: 55 },
      { title: "Turning followers into customers", objectives: ["Move people from a post to a purchase.", "Collect and use customer contact details responsibly.", "Track simple metrics and improve."], minutes: 45 },
    ],
    caseScenario: "Shai Shai Hills has beautiful products but posts randomly and rarely sells online. Build a one-month, phone-only digital marketing plan that would turn their followers into paying customers.",
  },
  {
    title: "Access to Finance & Funding Readiness",
    focus: "understanding funding options and getting a small business genuinely ready to raise money",
    description: "Many founders chase funding before they are ready and get rejected. This course demystifies the funding landscape for South African SMMEs - grants, loans, development finance, and investors - and builds funding readiness: the documents, numbers and story a business needs to say yes when opportunity knocks.",
    objectives: [
      "Compare the main funding options available to SMMEs and match them to your stage.",
      "Assemble the core funding-readiness pack most funders require.",
      "Present your numbers and use of funds credibly.",
      "Avoid the common reasons small businesses are declined.",
    ],
    tags: ["funding", "access to finance", "investment readiness", "SMME"],
    nqf: 5,
    modules: [
      { title: "The funding landscape", objectives: ["Compare grants, loans, development finance and equity.", "Match funding types to business stage and need.", "Understand what each funder wants in return."], minutes: 50 },
      { title: "Getting funding-ready", objectives: ["Assemble the standard documentation pack.", "Get your compliance and records in order.", "Clarify exactly how much you need and why."], minutes: 55 },
      { title: "The numbers funders check", objectives: ["Present financials funders can trust.", "Explain your use of funds and repayment.", "Show traction and risk honestly."], minutes: 50 },
      { title: "Applying and avoiding rejection", objectives: ["Tailor an application to a specific funder.", "Avoid the top reasons applications fail.", "Plan a funding pipeline, not a single bet."], minutes: 45 },
    ],
    caseScenario: "EMBODGTECH, a rural tech founder, wants to apply for development finance but has scattered records and an unclear funding ask. Help her build a funding-readiness checklist and define exactly how much she needs and for what.",
  },
  {
    title: "Writing a Bankable Business Plan",
    focus: "turning strategy into a clear, credible, action-ready business plan and financial model",
    description: "A business plan is a decision-making tool, not homework. This course helps founders write a lean, bankable plan - problem, solution, market, model, team, and a realistic three-year financial forecast - that guides their own decisions and gives funders and partners the confidence to back them.",
    objectives: [
      "Structure a lean, credible business plan that a funder will actually read.",
      "Articulate the problem, solution, market and business model clearly.",
      "Build a simple three-year financial forecast with sensible assumptions.",
      "Present the plan as a decision-making tool, not a document that sits in a drawer.",
    ],
    tags: ["business plan", "strategy", "financial forecast", "SMME"],
    nqf: 5,
    modules: [
      { title: "What a bankable plan contains", objectives: ["List the sections funders expect.", "Write a compelling executive summary.", "Keep the plan lean and honest."], minutes: 50 },
      { title: "Problem, solution, market and model", objectives: ["State the problem and your solution crisply.", "Summarise market evidence.", "Explain the business model and edge."], minutes: 55 },
      { title: "The financial forecast", objectives: ["Build a 3-year income and cash-flow forecast.", "Document assumptions clearly.", "Run a simple best/worst case."], minutes: 60 },
      { title: "Team, risk and using the plan", objectives: ["Show why your team can execute.", "Name key risks and mitigations.", "Turn the plan into a 90-day action list."], minutes: 45 },
    ],
    caseScenario: "A Metropolitan Collective Shapers finalist has a working business but a messy, over-long plan that funders never finish reading. Help restructure it into a lean, bankable plan and identify the three numbers a funder will check first.",
  },
  {
    title: "Operations, Inventory & Supply Chain Basics",
    focus: "running smooth day-to-day operations, managing stock, and building reliable supplier relationships",
    description: "Growth without operational control creates chaos. This course teaches SMMEs to design simple, repeatable operations, manage inventory so cash is not tied up or sales lost, and build dependable supplier relationships - the unglamorous systems that let a small business deliver consistently and scale.",
    objectives: [
      "Map and standardise your core operating processes.",
      "Manage inventory to avoid both stock-outs and dead stock.",
      "Build reliable supplier relationships and manage lead times.",
      "Use simple operational measures to find and fix bottlenecks.",
    ],
    tags: ["operations", "inventory", "supply chain", "SMME"],
    nqf: 4,
    modules: [
      { title: "Designing simple operations", objectives: ["Map your core process from order to delivery.", "Standardise repeatable tasks.", "Remove obvious waste and rework."], minutes: 45 },
      { title: "Inventory without the pain", objectives: ["Balance stock-outs against dead stock.", "Set simple reorder points.", "Free up cash tied in stock."], minutes: 55 },
      { title: "Suppliers and lead times", objectives: ["Choose and manage reliable suppliers.", "Plan around lead times.", "Negotiate better terms."], minutes: 45 },
      { title: "Measuring and improving", objectives: ["Track a few operational measures.", "Find the biggest bottleneck.", "Run a small improvement."], minutes: 45 },
    ],
    caseScenario: "A Daveyton food producer keeps running out of key ingredients on busy days while over-buying others that spoil. Help design a simple inventory and reorder system that protects both cash and sales.",
  },
  {
    title: "Business Compliance: Registration, Tax & B-BBEE (South Africa)",
    focus: "getting a South African small business legal, tax-compliant and B-BBEE-aware",
    description: "Compliance opens doors: it unlocks bank accounts, contracts, tenders and funding. This South-Africa-focused course walks founders through registering a business (CIPC), tax basics (SARS), and B-BBEE - what it is, why it matters for supplier development, and how a small business earns and uses its status.",
    objectives: [
      "Register a business and understand the main legal forms in South Africa.",
      "Explain core SARS tax obligations relevant to SMMEs.",
      "Describe B-BBEE and why it matters for accessing corporate and government opportunities.",
      "Build a simple compliance calendar so nothing is missed.",
    ],
    tags: ["compliance", "registration", "tax", "B-BBEE", "South Africa"],
    nqf: 4,
    modules: [
      { title: "Registering your business", objectives: ["Compare sole proprietor, partnership and company.", "Register with CIPC and open a business account.", "Understand basic legal responsibilities."], minutes: 45 },
      { title: "Tax basics with SARS", objectives: ["Register for the right taxes.", "Understand VAT, PAYE and provisional tax at a basic level.", "Keep records that satisfy SARS."], minutes: 55 },
      { title: "Understanding B-BBEE", objectives: ["Explain what B-BBEE measures and why.", "Determine your likely B-BBEE status as an SMME.", "Use B-BBEE to access ESD and procurement."], minutes: 50 },
      { title: "Staying compliant", objectives: ["Build a compliance calendar.", "Know your annual filing duties.", "Avoid common penalties."], minutes: 40 },
    ],
    caseScenario: "A promising supplier keeps losing corporate contracts because she cannot provide a B-BBEE certificate, tax clearance or company registration. Help her map exactly which registrations and documents she needs and in what order.",
  },
  {
    title: "Leadership, Resilience & the Growth Mindset",
    focus: "leading yourself and others, bouncing back from setbacks, and building the habits of sustained growth",
    description: "Founders are pushed to their limits. This course builds the inner capabilities Enza's alumni credit for their progress: self-leadership, resilience under pressure, a growth mindset, and the ability to lead a small team - so entrepreneurs can keep going, keep learning, and grow people alongside the business.",
    objectives: [
      "Lead yourself with clear goals, priorities and healthy routines.",
      "Apply resilience strategies to recover from setbacks and pressure.",
      "Adopt a growth mindset that turns failure into learning.",
      "Lead and grow a small team with trust and clear expectations.",
    ],
    tags: ["leadership", "resilience", "growth mindset", "SMME"],
    nqf: 5,
    modules: [
      { title: "Leading yourself first", objectives: ["Set clear goals and priorities.", "Build routines that protect your energy.", "Manage your time under pressure."], minutes: 45 },
      { title: "Resilience under pressure", objectives: ["Recognise stress and its effect on decisions.", "Apply practical resilience strategies.", "Build a support network."], minutes: 50 },
      { title: "The growth mindset", objectives: ["Turn setbacks into structured learning.", "Seek and use feedback.", "Keep improving deliberately."], minutes: 45 },
      { title: "Leading a small team", objectives: ["Delegate with clear expectations.", "Build trust and accountability.", "Grow the people around you."], minutes: 50 },
    ],
    caseScenario: "After a major client cancelled, a founder is close to giving up and taking it out on her small team. Coach her through a resilient response and a plan to steady both herself and her people.",
  },
  {
    title: "Enterprise & Supplier Development: Becoming Corporate-Ready",
    focus: "meeting the standards corporates and government require to onboard a small supplier",
    description: "Enterprise & Supplier Development (ESD) is where SMMEs and big organisations meet. This course - drawn from Enza's core delivery - shows small businesses exactly what corporates and government need to onboard them as suppliers: compliance, quality, capacity, pricing and relationships, so they can win and keep contracts and grow through the supply chain.",
    objectives: [
      "Explain how ESD and supplier development work and why corporates invest in them.",
      "Assess your business against typical supplier onboarding requirements.",
      "Prepare the documentation and capacity evidence buyers ask for.",
      "Build and manage a professional relationship with a corporate buyer.",
    ],
    tags: ["ESD", "supplier development", "procurement", "corporate-ready", "SMME"],
    nqf: 6,
    modules: [
      { title: "How ESD really works", objectives: ["Explain enterprise vs supplier development.", "Understand the buyer's motivation and risk.", "See where SMMEs fit in a supply chain."], minutes: 50 },
      { title: "The supplier-readiness assessment", objectives: ["Assess your business against onboarding criteria.", "Find and close your biggest readiness gaps.", "Prioritise what to fix first."], minutes: 55 },
      { title: "The evidence buyers require", objectives: ["Prepare compliance, quality and capacity evidence.", "Present pricing and terms professionally.", "Assemble a supplier profile pack."], minutes: 50 },
      { title: "Winning and keeping the relationship", objectives: ["Approach and pitch to a corporate buyer.", "Deliver reliably to keep the contract.", "Grow the account over time."], minutes: 50 },
    ],
    caseScenario: "A capable manufacturer has been invited into a corporate's supplier development programme but has never sold to a big company and fears the paperwork and delivery demands. Help her assess her readiness and build a plan to become a dependable supplier.",
  },
  {
    title: "Pitching & Storytelling for Founders",
    focus: "telling a clear, compelling business story and pitching with confidence to funders, buyers and partners",
    description: "Founders win or lose rooms in minutes. This course teaches the craft of the founder pitch and story: structuring a clear narrative, presenting the numbers, handling tough questions, and pitching with authentic confidence - whether to a funder, a corporate buyer, a mentor, or a market of customers.",
    objectives: [
      "Structure a clear, memorable pitch and founder story.",
      "Present the key numbers simply and credibly.",
      "Handle tough questions and objections under pressure.",
      "Deliver with authentic confidence and adapt the pitch to the audience.",
    ],
    tags: ["pitching", "storytelling", "communication", "SMME"],
    nqf: 4,
    modules: [
      { title: "The story behind the business", objectives: ["Find the human story in your business.", "Structure a clear narrative arc.", "Connect your story to customer value."], minutes: 45 },
      { title: "Structuring the pitch", objectives: ["Use a simple pitch structure.", "Lead with the problem and the ask.", "Present numbers the audience will remember."], minutes: 50 },
      { title: "Handling the room", objectives: ["Anticipate and answer tough questions.", "Stay calm under challenge.", "Read and adapt to the audience."], minutes: 45 },
      { title: "Delivering with confidence", objectives: ["Practise delivery and body language.", "Adapt the pitch to funder, buyer or customer.", "Close with a clear call to action."], minutes: 45 },
    ],
    caseScenario: "A founder has three minutes to pitch at an Enza demo day but freezes and buries the ask in detail. Help her rebuild the pitch around one clear story and a single, confident ask.",
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
async function createCourseContent(c: (typeof COURSES)[number], orgId: string, facultyId: string): Promise<string> {
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
    submissionType: "project", pointsPossible: "100", published: true, position: 0,
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

async function ensureEnzaCourses(partnerId: string): Promise<{ total: number; created: number; error: string | null }> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS course_partner_assignments (id text PRIMARY KEY, course_id text NOT NULL, partner_id text NOT NULL, assigned_by text, assigned_at timestamptz NOT NULL DEFAULT now())`);
  await healAssignmentsTable();

  let org = await firstOrNull(await db.select().from(organisationsTable).where(and(eq(organisationsTable.partnerId, partnerId), eq(organisationsTable.name, "Enza SMME Academy"))));
  if (!org) {
    [org] = await db.insert(organisationsTable).values({ name: "Enza SMME Academy", partnerId, industry: "Enterprise & Supplier Development" }).returning();
  }
  let faculty = await firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, "curriculum@enzaglobalmedia.co.za")));
  if (!faculty) {
    [faculty] = await db.insert(usersTable).values({ email: "curriculum@enzaglobalmedia.co.za", firstName: "Enza", lastName: "Faculty", role: "instructional_designer", status: "active", partnerId, organisationId: org.id }).returning();
  }

  let created = 0;
  let error: string | null = null;
  for (const c of COURSES) {
    try {
      let course = await firstOrNull(await db.select().from(coursesTable).where(and(eq(coursesTable.title, c.title), eq(coursesTable.tenantId, "platform"))));
      let courseId: string;
      if (course) { courseId = course.id; }
      else { courseId = await createCourseContent(c, org.id, faculty.id); created++; }

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
          submissionType: "project", pointsPossible: "100", published: true, position: 0,
        });
      }

      const has = await db.select({ id: coursePartnerAssignmentsTable.id }).from(coursePartnerAssignmentsTable)
        .where(and(eq(coursePartnerAssignmentsTable.courseId, courseId), eq(coursePartnerAssignmentsTable.partnerId, partnerId)));
      if (has.length === 0) await db.insert(coursePartnerAssignmentsTable).values({ courseId, partnerId, assignedBy: faculty.id });
    } catch (e) {
      if (!error) error = (e instanceof Error ? e.message : String(e)).slice(0, 240);
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

  // 3. Organisation
  const [org] = await db.insert(organisationsTable).values({
    name: "Enza SMME Academy", partnerId: partner.id, industry: "Enterprise & Supplier Development",
  }).returning();

  // 4. Faculty author (used as content author)
  const [faculty] = await db.insert(usersTable).values({
    email: "curriculum@enzaglobalmedia.co.za", firstName: "Enza", lastName: "Faculty",
    role: "instructional_designer", status: "active", partnerId: partner.id, organisationId: org.id,
  }).returning();

  await db.update(partnersTable).set({ orgCount: 1 }).where(eq(partnersTable.id, partner.id));

  // 5. Courses + content - shared, self-healing, per-course resilient provisioning.
  const seeded = await ensureEnzaCourses(partner.id);

  return { created: true, partnerId: partner.id, courses: seeded.total, message: `Enza provisioned with ${seeded.total} courses.${seeded.error ? " First error: " + seeded.error : ""}` };
}
