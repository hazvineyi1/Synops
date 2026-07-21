import { db } from "@workspace/db";
import {
  partnersTable, organisationsTable, usersTable,
  coursesTable, modulesTable, beatsTable, moduleReadingsTable,
  caseScenariosTable, interactiveActivitiesTable, discussionsTable, assignmentsTable,
  coursePartnerAssignmentsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

/**
 * Skills-catalogue seed: 10 full, high-demand vocational courses for the South African market,
 * researched against the DHET 2024 National List of Occupations in High Demand, Stats SA youth
 * labour data, the 2025 Critical Skills picture, and sector demand (green energy, GBS/BPO, tourism,
 * care economy). Each course is platform-owned (tenantId "platform"), NQF-levelled, SETA-mapped,
 * and assigned to the Enza partner. Built as full curricula: 6 modules each with objectives, a real
 * teaching lesson (module reader), a title/points/close beat set, plus a course reader, an AI-coached
 * case study, a readiness self-check interactive, an AI-facilitated discussion and a capstone project.
 *
 * Idempotent: a course already present (by title, platform tenant) is reused and simply (re)assigned.
 */

const ENZA_SLUG = "enza-global";

interface SeedModule { title: string; objectives: string[]; minutes: number; lesson: string }
interface SeedCourse {
  title: string;
  focus: string;
  description: string;
  objectives: string[];
  tags: string[];
  nqf: number;
  seta: string;       // responsible SETA
  occupation: string; // mapped high-demand occupation / OFO-style label
  modules: SeedModule[];
  caseScenario: string;
}

const COURSES: SeedCourse[] = [
  // 1 ─────────────────────────────────────────────────────────────────────
  {
    title: "Digital & Data Literacy for the Modern Workplace",
    focus: "the everyday digital and data skills every South African worker and business owner now needs",
    description: "Digital literacy is the new numeracy. With over 90% of South African employers reporting difficulty finding digitally capable staff, this foundational course equips learners with the confidence to use a computer and smartphone productively, work safely online, handle files and email professionally, and read, organise and present simple data. It is the on-ramp to every other course in the catalogue and to the formal digital economy.",
    objectives: [
      "Operate a computer and smartphone confidently for work: files, folders, email, and core apps.",
      "Work safely and responsibly online, protecting personal data, money and passwords.",
      "Capture, clean and organise simple data in a spreadsheet.",
      "Read a chart or table and present a clear, honest data story.",
    ],
    tags: ["digital literacy", "data literacy", "end user computing", "MICT SETA", "NQF 3", "employability"],
    nqf: 3,
    seta: "MICT SETA",
    occupation: "End User Computing / Digital Office Support",
    modules: [
      { title: "Getting confident with your devices", objectives: ["Navigate a computer desktop, files and folders.", "Use a smartphone for productive work, not just chatting.", "Save, find and back up your work reliably."], minutes: 45, lesson: "Most jobs now assume you can find a file, attach it to an email, and not lose your work. In this module you build that muscle memory. You will learn the desktop, the difference between a file and a folder, and a simple naming habit (date_project_version) that means you never lose an important document again. On your phone you will move beyond WhatsApp to the tools that get you paid: a document scanner, cloud storage that survives a lost phone, and offline access for when data is tight. Data is expensive in South Africa, so you will also learn to work offline and sync later, and to spot which apps quietly eat your airtime. Small habits here save hours every week." },
      { title: "Working online safely", objectives: ["Create strong passwords and use a password habit you can keep.", "Spot scams, phishing and fake job offers.", "Protect your personal information and money online."], minutes: 45, lesson: "Being online means being a target. South Africans lose real money to SIM-swap fraud, fake job offers that ask for a 'registration fee', and phishing links pretending to be your bank or SASSA. This module teaches the defensive basics: a password you can actually remember but a scammer cannot guess, why you never share a one-time PIN, and how to check a link before you tap it. You will learn the tell-tale signs of a scam (urgency, secrecy, an upfront fee, bad grammar, a wrong web address) and what to do if you have already clicked. Safety online is a skill employers value, because a careless employee is a business risk." },
      { title: "Email and professional communication", objectives: ["Set up and organise a professional email account.", "Write a clear, polite work email with an attachment.", "Manage your inbox so nothing important is missed."], minutes: 40, lesson: "Your email address is your professional face. gangster4life@ will not get you the interview; firstname.surname@ will. Here you set up a clean account, learn the anatomy of a good work email (clear subject, greeting, one main point, a clear ask, a sign-off), and practise attaching documents without sending the wrong file. You will learn to keep an inbox that works: folders or labels, flagging what needs a reply, and the golden rule of replying within one working day. These habits mark you out as someone an employer or client can rely on." },
      { title: "Spreadsheets from scratch", objectives: ["Enter and format data in rows and columns.", "Use SUM, AVERAGE and simple formulas.", "Sort and filter to find what matters."], minutes: 60, lesson: "A spreadsheet is the most useful business tool most people never learn properly. Starting from a blank sheet, you will build a simple record: a stock list, a sales log, or an attendance register. You will learn cells, rows and columns, how to format numbers and money (Rands and cents), and the four formulas that do 90% of the work: SUM, AVERAGE, COUNT and a basic IF. Then you will sort and filter, so a list of 200 sales becomes an instant answer to 'which product sold most last month?'. Everything is taught in Google Sheets, which is free and works on a cheap laptop or a phone." },
      { title: "Reading and telling data stories", objectives: ["Read a table and a chart without being misled.", "Choose the right simple chart for a message.", "Turn numbers into a short, honest story."], minutes: 50, lesson: "Data only matters when it changes a decision. In this module you learn to read a table and a chart critically: what is the axis, what is being compared, and what is being hidden. You will make your first bar chart and line chart, and learn the one rule that separates honesty from manipulation: never cut the axis to exaggerate a change. Finally you practise the 'so what' skill: taking three numbers and writing a two-sentence story a manager can act on ('Sales dropped 20% in June, driven entirely by the Soweto branch; we should investigate stock-outs there.')." },
      { title: "Putting it together at work", objectives: ["Combine documents, email and data into one small task.", "Present your work simply and professionally.", "Plan your next digital-skills step."], minutes: 40, lesson: "This capstone module ties the course together with a realistic work task: you receive a messy set of figures, clean them in a spreadsheet, draw one clear chart, write a short email summarising what you found, and attach the file. You will present it as if to a manager. We close by mapping your next step, whether that is the Data Analytics course, Digital Marketing, or applying for entry-level digital roles and learnerships, and how to describe these new skills on a CV so an employer notices." },
    ],
    caseScenario: "Nomsa has just been hired as an admin assistant at a small logistics firm in Germiston. On day one her manager hands her a printed page of delivery figures and says 'can you put this on the computer and tell me which route is losing us money?' She has a smartphone and a shared laptop but has never used a spreadsheet. Help Nomsa work through the task step by step.",
  },
  // 2 ─────────────────────────────────────────────────────────────────────
  {
    title: "Web & Software Development Foundations",
    focus: "building real websites and simple programs, and launching a freelance developer career",
    description: "Software developer is one of the hardest roles in South Africa to fill, and web development is the most accessible, best-paid freelancing skill for young Africans. This course takes an absolute beginner to their first working websites and simple programs using HTML, CSS, JavaScript and Python, with an emphasis on building a portfolio and earning as a freelancer while you learn. No maths degree required, just discipline and a laptop.",
    objectives: [
      "Build and style a responsive web page with HTML and CSS.",
      "Add interactivity with JavaScript and reason about basic programming logic.",
      "Write simple, useful programs in Python.",
      "Publish a portfolio and win your first freelance or junior-developer work.",
    ],
    tags: ["software development", "web development", "coding", "JavaScript", "Python", "MICT SETA", "NQF 5", "freelancing"],
    nqf: 5,
    seta: "MICT SETA",
    occupation: "Software Developer / Web Developer (OIHD 2024)",
    modules: [
      { title: "How the web works & your first page", objectives: ["Explain how browsers, servers and websites fit together.", "Write structured HTML for a real page.", "Set up a free coding environment."], minutes: 60, lesson: "Before you write code, you need a mental model. A website is just files a server sends to a browser, which draws them on the screen. In this module you set up a free, professional toolset (VS Code and a browser) and write your first HTML, the skeleton of every web page. You will learn semantic tags (headings, paragraphs, lists, links, images) and build a simple 'about me' page. HTML is forgiving and visual, so you see results instantly, which is exactly why it is the right place to start and why web skills are the fastest route into paid tech work." },
      { title: "Styling with CSS", objectives: ["Apply colour, spacing, fonts and layout with CSS.", "Make a page responsive on phones and laptops.", "Use a simple design system for a professional look."], minutes: 65, lesson: "CSS turns a plain page into something people trust. You will learn the box model (every element is a box with padding, border and margin), how to control layout with flexbox, and how to make a site look good on a cheap Android phone as well as a laptop, which matters because most South Africans browse on mobile. You will build a clean, responsive profile site using a small, consistent set of colours, spacing and fonts. By the end you can make any HTML look professional, the single most marketable skill for a beginner freelancer." },
      { title: "Programming logic with JavaScript", objectives: ["Use variables, conditions and loops.", "Write and call functions.", "Debug by reading errors calmly."], minutes: 70, lesson: "This is where you learn to think like a programmer. Using JavaScript, the language of the browser, you meet the four ideas behind almost all code: variables (storing values), conditions (if this, then that), loops (do this many times) and functions (reusable blocks). You will build small interactive pieces, a tip calculator, a form that validates input, and learn the most important developer skill of all: reading an error message without panic and fixing it. Logic is transferable, so everything here applies to Python, mobile apps and beyond." },
      { title: "Making pages interactive", objectives: ["Respond to clicks and input in the browser.", "Change the page with JavaScript (the DOM).", "Build a small, useful web app."], minutes: 65, lesson: "Now you connect logic to the page. You will learn the DOM, the live map of a web page that JavaScript can change, and use it to respond to a user: a to-do list that adds and removes items, a currency converter, a simple quiz. You will handle events (clicks, typing, submitting a form) and update the screen without reloading. This is the core loop of every web app, and building two or three small interactive apps gives you the portfolio pieces that win freelance clients." },
      { title: "Real programs with Python", objectives: ["Write Python scripts that automate a task.", "Work with data, files and simple APIs.", "Know when to reach for Python versus JavaScript."], minutes: 65, lesson: "Python is the most in-demand language in South Africa's job adverts and the friendliest for automation and data. You will learn Python's clean syntax and rewrite familiar logic, then do something genuinely useful: automate a boring task (renaming files, cleaning a spreadsheet, sending a report), read and write files, and pull live data from a free API such as an exchange-rate or weather service. Understanding both a browser language (JavaScript) and a general-purpose language (Python) makes you far more employable than a one-language beginner." },
      { title: "Portfolio, GitHub & getting paid", objectives: ["Publish your projects online for free.", "Use Git and GitHub like a professional.", "Land your first freelance or junior role."], minutes: 55, lesson: "Skills are invisible until they are shown. In this final module you put your projects online for free (GitHub Pages / Netlify), learn Git and GitHub, the version-control tools every employer expects, and assemble a portfolio site that proves what you can do. Then the business side: writing a profile on Upwork and local platforms, pricing your first jobs, and the reality that a small, real portfolio beats a stack of certificates. We map the local pathways too: MICT SETA learnerships, junior developer roles, and the growing GBS sector's tech desks." },
    ],
    caseScenario: "Katlego finished matric two years ago, has a second-hand laptop, and teaches himself bits of code from YouTube but has never finished a project or earned a cent. A local NGO needs a simple one-page website to advertise its programmes. Help Katlego scope, build and publish it, and turn it into his first portfolio piece and possibly his first invoice.",
  },
  // 3 ─────────────────────────────────────────────────────────────────────
  {
    title: "Data Analytics & Business Intelligence",
    focus: "turning raw data into clear insights and dashboards that drive better business decisions",
    description: "Data analysts and data scientists sit at the very top of South Africa's ICT shortage list. This course trains learners to take messy real-world data, clean and analyse it, and communicate findings through dashboards that leaders actually use. Built around free, industry-standard tools (spreadsheets, SQL and a BI tool), it prepares learners for analyst roles and for making any business, including their own, more evidence-driven.",
    objectives: [
      "Frame a business question and gather the right data to answer it.",
      "Clean, transform and analyse data using spreadsheets and SQL.",
      "Build clear, honest dashboards in a business-intelligence tool.",
      "Communicate insights and recommendations to decision-makers.",
    ],
    tags: ["data analytics", "business intelligence", "SQL", "dashboards", "MICT SETA", "NQF 5", "in-demand"],
    nqf: 5,
    seta: "MICT SETA",
    occupation: "Data Analyst / Business Intelligence Analyst (OIHD 2024)",
    modules: [
      { title: "Thinking like an analyst", objectives: ["Turn a vague business question into a measurable one.", "Identify what data would answer it.", "Recognise bias and bad data before you start."], minutes: 50, lesson: "Analytics begins before any tool opens. A manager asks 'why are sales down?', and your job is to turn that into questions data can answer: down compared to when, in which product, in which region, for which customer? In this module you learn to define a metric precisely, decide what data you would need, and spot the traps, survivorship bias, seasonality, and the difference between correlation and cause, that make confident analysts wrong. Framing well is what separates an analyst from someone who just makes charts." },
      { title: "Cleaning and preparing data", objectives: ["Find and fix errors, duplicates and gaps.", "Reshape data into a tidy table.", "Document your steps so work is repeatable."], minutes: 65, lesson: "Real data is dirty: misspelled town names, dates in three formats, duplicate customers, blank cells. Analysts spend most of their time here, so you will too. You will learn a repeatable cleaning routine, standardising text, handling missing values honestly, removing duplicates, and reshaping data into a 'tidy' table where every row is one observation. You will keep a record of every change so your work can be trusted and repeated, the habit that makes an analyst credible in an audit or a boardroom." },
      { title: "Analysis in spreadsheets", objectives: ["Use pivot tables to summarise quickly.", "Apply lookups and key functions.", "Find patterns, trends and outliers."], minutes: 60, lesson: "The humble spreadsheet is still the world's most-used analytics tool. You will master pivot tables, which turn thousands of rows into an instant summary, and the functions analysts lean on (VLOOKUP/XLOOKUP, IF, SUMIF, COUNTIF). Working with a real South African dataset, retail sales or clinic visits, you will find the trend, the seasonal pattern and the outlier that nobody noticed, and learn to sanity-check every result so you never present a number you cannot defend." },
      { title: "Databases and SQL", objectives: ["Explain how relational data is organised.", "Write SELECT queries with filters and sorting.", "Join tables and aggregate with GROUP BY."], minutes: 70, lesson: "Most business data lives in databases, and SQL is the language that unlocks it, a skill that immediately raises your pay grade. You will learn how tables relate, then write real queries: selecting and filtering rows, sorting, and the analyst's workhorses, GROUP BY for aggregation and JOIN for combining tables. Using a free practice database you will answer genuine questions ('top five products by revenue per province') in seconds. SQL appears on almost every data-analyst job advert in the country, so this module alone moves the employability needle." },
      { title: "Dashboards and BI tools", objectives: ["Build an interactive dashboard in a BI tool.", "Choose visualisations that inform, not mislead.", "Design for the person who will use it."], minutes: 65, lesson: "A dashboard is analysis other people can use without you. Using a free BI tool (Power BI or Looker Studio), you will connect your cleaned data and build an interactive dashboard: KPIs at the top, a trend, a breakdown by region, and filters the user controls. You will apply data-visualisation principles, right chart for the message, honest axes, restrained colour, and design for your audience, an executive wants one screen and a headline, an operations lead wants detail. This is the deliverable that gets analysts hired and promoted." },
      { title: "From insight to decision", objectives: ["Write a crisp findings summary with a recommendation.", "Present to non-technical stakeholders.", "Build an analyst portfolio."], minutes: 55, lesson: "Insight that nobody acts on is wasted. You will learn to write the one-page summary leaders read, situation, finding, recommendation, expected impact, and to present it with confidence to people who fear numbers. You will practise handling the hard question ('are you sure?') by showing your working. Finally you assemble a portfolio, two or three end-to-end analyses from question to dashboard to recommendation, that proves you can do the job, plus the local routes into analyst roles and data learnerships." },
    ],
    caseScenario: "A mid-sized spaza-shop wholesaler in Cape Town has two years of sales data in a spreadsheet but makes stock decisions on gut feel, and keeps running out of fast-movers while cash sits in slow stock. The owner asks you to 'make sense of the numbers'. Take the messy data through cleaning, analysis and a simple dashboard, and give the owner one clear recommendation.",
  },
  // 4 ─────────────────────────────────────────────────────────────────────
  {
    title: "Digital Marketing & Social Media for Business",
    focus: "growing a brand and driving real sales online, as an employee, freelancer or business owner",
    description: "Every business now competes for attention online, and digital marketing is among the most accessible, in-demand and freelanceable skills in South Africa. This practical course teaches learners to build a brand, create content that converts, run affordable paid campaigns, and measure what works, using the free and low-cost tools that suit a South African, mobile-first, data-conscious audience. It serves both job-seekers and entrepreneurs marketing their own venture.",
    objectives: [
      "Build a clear brand and content strategy for a real business.",
      "Create engaging content and grow an audience on the right platforms.",
      "Plan and run a low-budget paid advertising campaign.",
      "Measure results and improve return on every rand spent.",
    ],
    tags: ["digital marketing", "social media", "content marketing", "SEO", "Services SETA", "MICT SETA", "NQF 4", "freelancing"],
    nqf: 4,
    seta: "Services SETA / MICT SETA",
    occupation: "Digital Marketing Specialist / Social Media Manager",
    modules: [
      { title: "Marketing that actually works", objectives: ["Define a target customer and a core message.", "Map the customer journey from stranger to buyer.", "Set marketing goals you can measure."], minutes: 50, lesson: "Marketing is not posting and praying, it is moving a specific person from not knowing you to buying and telling others. You will define one clear target customer (age, place, need, budget), craft a single core message, and map the journey: awareness, interest, decision, purchase, loyalty. You will set measurable goals (followers are vanity, sales and enquiries are sanity) so that every later tactic is judged on results. This foundation stops the most common and expensive mistake, spending money before you know who you are talking to." },
      { title: "Brand and content that converts", objectives: ["Create a simple, consistent brand look and voice.", "Plan a month of content in an afternoon.", "Write posts and captions that drive action."], minutes: 60, lesson: "People buy from brands they recognise and trust. You will build a lightweight brand kit, colours, fonts, logo, tone, using free tools like Canva, and learn the content types that work (educate, entertain, inspire, prove, sell) and the 80/20 rule that stops you being annoying. You will batch-plan a month of content in one sitting and write captions with a hook, value and a clear call to action. Everything is designed mobile-first and data-light, because that is how your South African customer actually scrolls." },
      { title: "Growing on the right platforms", objectives: ["Choose platforms that fit your customer and offer.", "Use WhatsApp Business, Instagram, TikTok and Facebook well.", "Grow reach without paying, at first."], minutes: 55, lesson: "You do not need to be everywhere, you need to be where your customer is. This module compares the platforms that matter locally, WhatsApp Business (the quiet giant of SA commerce), Facebook, Instagram and TikTok, and how each rewards different content. You will set up a WhatsApp Business catalogue, learn organic-growth tactics (hooks, hashtags, collaborations, replying fast), and understand each platform's algorithm well enough to earn reach before you ever pay for it." },
      { title: "Paid ads on a small budget", objectives: ["Set up a basic Meta ad campaign.", "Target the right audience affordably.", "Avoid the common ways beginners waste money."], minutes: 60, lesson: "A little paid advertising, spent well, beats a lot spent badly. Using Meta (Facebook/Instagram) Ads Manager, you will build a simple campaign from R50/day: choosing an objective, defining an audience by location and interest, setting a budget, and writing an ad that stops the scroll. Crucially, you will learn the beginner traps, boosting random posts, targeting 'everyone', ignoring the results, and how to run a small test before scaling. This is a skill businesses pay freelancers well to do properly." },
      { title: "SEO and getting found", objectives: ["Understand how search brings free customers.", "Optimise a Google Business Profile and website basics.", "Write content people actually search for."], minutes: 55, lesson: "When someone Googles 'plumber near Tembisa', you want to be the answer, forever, for free. This module demystifies search: how Google ranks pages, and the highest-value, easiest win for local businesses, a complete, reviewed Google Business Profile. You will learn keyword basics (writing what customers actually type), on-page essentials (titles, descriptions, mobile speed), and how a few helpful articles can bring in leads for years. SEO is the marketing that keeps working after you stop paying." },
      { title: "Measuring and improving", objectives: ["Read the key metrics on each platform.", "Calculate return on marketing spend.", "Run a simple test-and-improve cycle."], minutes: 50, lesson: "What gets measured gets better. You will learn to read the numbers that matter, reach, engagement, click-through, cost per result, and conversions, and to calculate return on ad spend so you know whether marketing is making or losing money. You will run a simple A/B test (two captions, two images) and let the data pick the winner. We finish with your portfolio, a real mini-campaign with before/after numbers, plus how to package these skills for a marketing job or freelance clients." },
    ],
    caseScenario: "Zanele runs a home-based baking business in Soweto. She posts cakes on her personal Facebook now and then, gets the odd order from friends, but wants steady sales from strangers, with almost no budget. Design her a 30-day digital-marketing plan: brand, content, platform choice, one small paid test, and how she will know it worked.",
  },
  // 5 ─────────────────────────────────────────────────────────────────────
  {
    title: "Solar PV Installation & the Green Economy",
    focus: "installing, maintaining and selling solar power systems in South Africa's booming renewable sector",
    description: "Solar is projected to create around 140,000 South African jobs by 2030, and demand for installers, technicians and sales agents is outstripping supply. This course gives learners the practical grounding to work safely in solar PV, from how a system works to sizing, installing, maintaining and selling small-scale systems, plus the pathway to formal electrical qualifications. It suits both those seeking employment with installers and those starting a solar service business.",
    objectives: [
      "Explain how a solar PV system generates, stores and delivers power.",
      "Size a small residential or small-business system to a real need.",
      "Follow safe, correct installation and maintenance practice.",
      "Sell and support solar systems, and map the route to formal certification.",
    ],
    tags: ["solar PV", "renewable energy", "green economy", "installation", "EWSETA", "NQF 4", "artisan"],
    nqf: 4,
    seta: "EWSETA",
    occupation: "Solar Photovoltaic Installer / Renewable Energy Technician (OIHD 2024)",
    modules: [
      { title: "The energy crisis and the solar opportunity", objectives: ["Explain why demand for solar is surging in South Africa.", "Describe the main types of solar customers and jobs.", "See where you fit in the solar value chain."], minutes: 45, lesson: "Load-shedding turned solar from a luxury into a national necessity, and created a jobs boom. This module sets the scene: why households, businesses and farms are switching, the difference between grid-tied, hybrid and off-grid systems, and the many roles the sector needs, installers, technicians, sales agents, maintenance crews and system designers. You will locate yourself in this value chain and understand that the durable jobs are in ongoing installation, maintenance and sales of small systems, not just big once-off construction projects." },
      { title: "How a PV system works", objectives: ["Name the key components and what each does.", "Trace the flow from panel to appliance.", "Read a basic system diagram."], minutes: 60, lesson: "You cannot install or sell what you do not understand. Here you learn the building blocks, PV panels, charge controller, inverter, battery, and protection devices, and exactly what each one does. You will trace the flow of energy: sunlight to DC electricity in the panel, conversion to usable AC by the inverter, storage in the battery for night and load-shedding, and delivery to appliances. You will read a single-line system diagram, the map every installer works from, so the later practical modules make complete sense." },
      { title: "Sizing a system to a real need", objectives: ["Do a simple load assessment for a home or shop.", "Calculate panel, inverter and battery sizes.", "Match a system to a customer's budget."], minutes: 65, lesson: "The most valuable, and most often botched, skill in solar is sizing. Too small and the customer is disappointed; too big and they overpay. You will learn a practical method: list the appliances, estimate daily energy use in kilowatt-hours, decide what must run during load-shedding, and from that calculate the panel array, inverter rating and battery capacity needed. You will practise on a real South African home and a small spaza shop, and learn to offer a phased, affordable design, because most customers cannot buy everything at once." },
      { title: "Safe installation practice", objectives: ["Apply core electrical and working-at-height safety.", "Follow correct mounting, wiring and connection steps.", "Understand the legal and compliance boundaries."], minutes: 70, lesson: "Solar work involves electricity, roofs and heavy components, respect it or it hurts you. Safety leads this module: isolation, PPE, working at height, and never working live. You will walk through correct practice: mounting panels securely, running and protecting cables, connecting to the inverter and battery, and the importance of correct earthing. Critically, you will learn the legal line, which final connections must, by law, be signed off by a registered electrician and issued with a Certificate of Compliance, so you work within the rules and know exactly which qualification to pursue next." },
      { title: "Maintenance and fault-finding", objectives: ["Perform routine maintenance and cleaning.", "Diagnose common faults systematically.", "Keep clear service records for customers."], minutes: 55, lesson: "Systems that are installed and forgotten fail early, which is why maintenance is where the repeat income is. You will learn a routine service: cleaning panels safely, checking connections and battery health, and reading the inverter's status and error codes. Then structured fault-finding, working from the symptom (no power, low output, error light) back through the system to the cause, without guessing. Good record-keeping and honest service turn a one-off install into a customer for life and a stream of referrals." },
      { title: "Selling solar and building a career", objectives: ["Explain value and payback to a customer clearly.", "Quote a job professionally and honestly.", "Plan your path to formal certification and work."], minutes: 50, lesson: "Technical skill pays more when paired with sales sense. You will learn to explain solar in plain terms, focusing on payback, reliability and independence from load-shedding, handle the price objection with a phased option, and produce a clear, honest quote. We finish with your career map: EWSETA learnerships, the route to becoming a qualified/registered electrician and installer, opportunities with established installers, and how to start lean as a maintenance-and-sales business before you take on full installations." },
    ],
    caseScenario: "A family in Rustenburg is exhausted by load-shedding and has about R40,000 to spend. They want their lights, Wi-Fi, TV and fridge to keep working, but not the geyser or stove, during outages. Walk through a load assessment, size an honest, affordable system, and explain the safety and legal steps before it can be switched on.",
  },
  // 6 ─────────────────────────────────────────────────────────────────────
  {
    title: "Skilled Trades & Technical Artisanship",
    focus: "the practical trade skills, safety and business sense to work as, or run a business as, an artisan",
    description: "Employers report a chronic shortage of qualified artisans even amid high unemployment, and trades such as electrical, plumbing and welding offer some of the most secure, well-paid and self-employable careers in South Africa. This course builds the practical foundations, tools, materials, safety and core techniques across key trades, plus the reading, measuring and business skills to turn a trade into a living, and maps the path to a recognised trade qualification and Red Seal.",
    objectives: [
      "Work safely with hand tools, power tools and materials.",
      "Apply core techniques in electrical, plumbing and basic construction work.",
      "Read simple technical drawings, measure and cost a job accurately.",
      "Run a trade job professionally and pursue formal artisan certification.",
    ],
    tags: ["artisan", "trades", "electrical", "plumbing", "merSETA", "NQF 4", "Red Seal", "self-employment"],
    nqf: 4,
    seta: "merSETA / CETA",
    occupation: "Electrician / Plumber / Artisan (OIHD 2024 scarce skills)",
    modules: [
      { title: "The artisan opportunity and safety first", objectives: ["Understand why skilled artisans are in demand and well paid.", "Apply core workplace and personal safety.", "Identify hazards before they cause harm."], minutes: 50, lesson: "A good artisan never lacks work, and in South Africa the shortage is acute. This module opens with the opportunity, then plants the non-negotiable foundation: safety. You will learn hazard identification, personal protective equipment, safe handling of electricity, water, gas and heat, and the discipline of a tidy, organised worksite. You will learn that the professional who works safely and cleanly is the one who gets rehired and recommended, and the one who goes home uninjured." },
      { title: "Tools, materials and measurement", objectives: ["Identify and correctly use common hand and power tools.", "Know the main materials of each trade and their uses.", "Measure and mark accurately, every time."], minutes: 60, lesson: "Command of tools and materials is the mark of a tradesperson. You will learn the essential hand and power tools, how to use them correctly and maintain them, and the common materials across trades: cable and conduit, pipe and fittings, timber, board and fixings. Running through everything is measurement, the skill that saves money and reputation. 'Measure twice, cut once' becomes a habit, along with reading a tape measure and spirit level accurately and marking work so it is right the first time." },
      { title: "Electrical foundations", objectives: ["Explain basic circuits, current and safety.", "Wire simple circuits correctly and safely.", "Know the legal limits and the route to registration."], minutes: 65, lesson: "Electrical work is among the scarcest and best-paid trades. You will learn the fundamentals, voltage, current, resistance and the circuit, and wire simple, common configurations (a light, a plug circuit) correctly, with correct earthing and protection. As with solar, you will learn precisely where the legal line sits: which work requires a registered electrician and a Certificate of Compliance, so you build real skill while understanding the qualification, wireman's licence and registration path that unlocks the higher-paid, legally-signed-off work." },
      { title: "Plumbing foundations", objectives: ["Understand water supply, drainage and pressure.", "Install and repair common fittings and fix leaks.", "Meet basic compliance for plumbing work."], minutes: 60, lesson: "Water is always in demand, and so are people who can control it. You will learn how supply and drainage systems work, water pressure, and the common materials and joints. Then the bread-and-butter jobs: installing a tap or mixer, replacing a toilet mechanism, clearing a blockage and, above all, finding and fixing leaks, which waste water and money across the country. You will learn to test your work for leaks and pressure, and the compliance basics, including where a registered plumber's certificate is required." },
      { title: "Reading drawings and costing a job", objectives: ["Interpret a simple technical or site drawing.", "Produce an accurate materials list.", "Quote a job so you make a fair profit."], minutes: 55, lesson: "The artisan who can read a drawing and price a job accurately earns far more than one who only works with their hands. You will learn to interpret simple technical and site drawings and symbols, translate them into a complete, accurate materials list (with a sensible wastage allowance), and cost the job properly, materials, labour, transport, overheads and a real profit margin. Under-quoting is the fastest way a skilled artisan goes broke, so you will practise quoting until it is honest and profitable." },
      { title: "Running trade work as a business", objectives: ["Manage a job from quote to sign-off professionally.", "Build a reputation, referrals and repeat work.", "Plan your path to a trade qualification and Red Seal."], minutes: 50, lesson: "Skill plus professionalism equals a sustainable living. You will learn to run a job well, clear quote, agreed scope, tidy work, on-time finish, snag-free handover, and how that behaviour builds the referrals that keep an artisan busy. You will cover the basics of invoicing, deposits and managing cash flow between jobs. Finally, the qualification map: apprenticeships and learnerships through merSETA/CETA, the trade test, and the Red Seal that makes you a nationally recognised, top-earning artisan." },
    ],
    caseScenario: "Bongani is good with his hands and already does small fix-it jobs for neighbours in Mdantsane for cash, but he under-charges, has had one near-miss with a live wire, and cannot read the drawing for a bigger job he has been offered. Help him work safely, read the drawing, quote the job to make a real profit, and plan his route to a recognised qualification.",
  },
  // 7 ─────────────────────────────────────────────────────────────────────
  {
    title: "Global Business Services & Customer Experience (BPO)",
    focus: "the communication, service and digital skills to thrive in South Africa's booming call-centre and BPO sector",
    description: "South Africa is now the world's most favoured offshore contact-centre destination, and the Global Business Services sector is targeting 500,000 jobs by 2030, with most going to young people. This course builds exactly the skills BPO employers screen for: clear communication, customer empathy, problem-solving, computer and CRM literacy, and workplace professionalism, giving job-seekers a genuine, fast route into formal employment.",
    objectives: [
      "Communicate clearly and professionally by voice, chat and email.",
      "Deliver excellent customer experience and handle difficult interactions.",
      "Use contact-centre systems, CRMs and quality standards.",
      "Meet the professionalism, resilience and performance a BPO role demands.",
    ],
    tags: ["BPO", "call centre", "customer experience", "GBS", "Services SETA", "NQF 4", "employability"],
    nqf: 4,
    seta: "Services SETA (BPESA)",
    occupation: "Contact Centre Agent / Customer Service Representative",
    modules: [
      { title: "Inside the GBS opportunity", objectives: ["Explain what BPO/GBS is and why SA is winning it.", "Describe the roles and career ladder.", "Understand what employers screen for."], minutes: 45, lesson: "The voices answering calls for UK and US companies are increasingly South African, and that is a national jobs engine. This module explains the sector, inbound and outbound, voice and non-voice, sales, support and back-office, and why global firms choose South Africa: neutral accent, strong service culture, favourable time zones and government incentives. You will map the career ladder from agent to team leader to operations, and learn exactly what recruiters test for, so you can prepare to pass assessments most applicants fail." },
      { title: "Communication that connects", objectives: ["Speak clearly with good pace, tone and articulation.", "Listen actively and confirm understanding.", "Adapt your language to the customer."], minutes: 60, lesson: "In a contact centre your voice is the whole product. You will train the fundamentals, clear articulation, controlled pace, warm tone and a smile the customer can hear, and the harder skill of active listening: hearing the real issue, not just the words, and confirming it back. You will practise plain, jargon-free language and adapting your style to different customers. These are learnable techniques, not talents, and they are the single biggest predictor of passing a BPO voice assessment." },
      { title: "Customer experience excellence", objectives: ["Own a customer's problem end to end.", "Turn a complaint into loyalty.", "Balance empathy with efficiency."], minutes: 55, lesson: "Great service is not about being nice, it is about solving the problem while making the person feel heard. You will learn a reliable service framework: acknowledge, empathise, take ownership, resolve or escalate, confirm satisfaction. You will practise turning an angry complaint into a loyal customer, and the professional balance between genuine empathy and the efficiency a centre measures. You will also learn the metrics that define good service (first-contact resolution, customer satisfaction) so you understand how your work is judged." },
      { title: "Handling difficult calls and pressure", objectives: ["Stay calm and professional with an angry customer.", "Use de-escalation techniques that work.", "Protect your own wellbeing and resilience."], minutes: 55, lesson: "Some customers arrive furious, and how you respond defines you. You will learn de-escalation that actually works: lowering your voice, not matching their heat, acknowledging feeling before fact, and offering a clear next step. You will practise scripts for saying no, delivering bad news, and handling abuse within policy. Just as important, you will learn to protect your own wellbeing, resetting between hard calls, managing stress, and asking for support, because resilience is what lets good agents last and get promoted." },
      { title: "Systems, CRM and quality", objectives: ["Navigate a CRM and log interactions accurately.", "Follow scripts, processes and compliance rules.", "Meet quality-assurance standards."], minutes: 55, lesson: "Modern agents juggle several screens while staying warm on the line. You will learn how a CRM works, capturing accurate notes, updating records, following a process flow, and why clean data matters to the next agent and the business. You will practise working with scripts and knowledge bases without sounding robotic, and meeting compliance rules (data protection, verification). Finally you will learn how quality assurance scores a call, so you can consistently hit the standard that earns bonuses and promotion." },
      { title: "Getting hired and getting ahead", objectives: ["Pass BPO assessments and interviews.", "Show workplace professionalism from day one.", "Plan your progression in the sector."], minutes: 50, lesson: "This sector hires at scale and promotes from within, if you show up right. You will prepare for the typical recruitment gauntlet, versant/voice tests, typing and computer checks, role-plays and interviews, and practise until you are ready. You will lock in the professional basics that keep a job: punctuality, adherence, attitude and teamwork. We close with the progression map, agent to senior agent, quality analyst, trainer, team leader, and the Services SETA learnerships that formalise your growth." },
    ],
    caseScenario: "Ayanda, 22, has matric and strong English but has been turned down by two call centres after freezing in the voice assessment and role-play. She is articulate with friends but panics under test conditions. Coach her through a difficult-customer role-play and an assessment-style call so she can walk into the next interview prepared and confident.",
  },
  // 8 ─────────────────────────────────────────────────────────────────────
  {
    title: "Tourism, Hospitality & Tour-Guiding Excellence",
    focus: "delivering world-class guest experiences and building a career or business in SA's tourism economy",
    description: "Tourism supports around 1.9 million South African jobs and is one of the fastest routes to youth employment and entrepreneurship, especially in guiding, hospitality and cultural and township tourism. This course builds the service excellence, product knowledge, safety and storytelling skills that turn a visitor's trip into an unforgettable experience, and prepares learners for hospitality roles, registered tour-guiding, and running their own tourism micro-enterprise.",
    objectives: [
      "Deliver warm, professional service that earns great reviews and repeat visitors.",
      "Demonstrate strong destination knowledge and compelling storytelling.",
      "Apply hospitality operations, safety and responsible-tourism practice.",
      "Build a career or start a tourism business, including the guiding registration path.",
    ],
    tags: ["tourism", "hospitality", "tour guiding", "customer service", "CATHSSETA", "NQF 4", "self-employment"],
    nqf: 4,
    seta: "CATHSSETA",
    occupation: "Tourist Guide / Hospitality Service (high-employment sector)",
    modules: [
      { title: "The visitor economy and your place in it", objectives: ["Explain how tourism creates jobs and businesses locally.", "Map the roles across hospitality and guiding.", "See the opportunity in township and cultural tourism."], minutes: 45, lesson: "Every visitor who arrives brings income that can reach deep into a community, if the experience is good. This module shows how tourism money flows through accommodation, food, transport, activities and guiding, and where the jobs and business opportunities sit. You will pay special attention to the fast-growing space of township, heritage and cultural tourism, where local knowledge is the product, and locate where you want to build, employed in an established operation or running your own small experience." },
      { title: "Service excellence and the guest experience", objectives: ["Anticipate guest needs and exceed expectations.", "Handle requests and complaints gracefully.", "Create the moments that earn five-star reviews."], minutes: 60, lesson: "In tourism, the experience is the product, and service is the experience. You will learn to read guests and anticipate needs, to greet, host and farewell with genuine warmth, and to handle special requests and complaints so smoothly that a problem becomes a positive memory. You will study what actually drives a five-star review, feeling cared for, small surprises, being remembered, and learn to create those moments deliberately, because reviews now make or break a tourism business." },
      { title: "Know your destination, tell its story", objectives: ["Build deep, accurate knowledge of your area.", "Craft and deliver engaging stories and commentary.", "Answer visitor questions with confidence."], minutes: 55, lesson: "Facts inform, but stories are what visitors remember and repeat. You will learn to research your destination properly, history, culture, nature, food, current life, and to turn dry facts into vivid, respectful stories. You will practise commentary and pacing, reading the group, and the confident handling of the questions guides always get. Authentic, accurate storytelling, especially of local and cultural heritage, is exactly what today's traveller seeks and pays a premium for." },
      { title: "Hospitality operations and safety", objectives: ["Apply core front-of-house and food-safety basics.", "Follow health, safety and emergency procedures.", "Keep quality consistent under pressure."], minutes: 55, lesson: "Behind every smooth experience is disciplined operation. You will learn front-of-house and basic food-and-beverage service standards, hygiene and food-safety essentials, and the health-and-safety and emergency procedures that protect guests and your licence to operate. You will learn to keep standards consistent when it is busy and things go wrong, the professionalism that separates a business travellers trust from one they warn others about." },
      { title: "Responsible and sustainable tourism", objectives: ["Practise tourism that respects people and place.", "Deliver authentic experiences without exploitation.", "Build community benefit into your offering."], minutes: 45, lesson: "Tourism can uplift a community or damage it, and travellers increasingly choose operators who get this right. You will learn responsible-tourism principles: protecting the environment, respecting cultures and dignity, avoiding the traps of 'poverty tourism', and ensuring local people genuinely benefit. You will design experiences that are authentic and fair, sourcing locally, sharing income, telling stories with consent, which is both the ethical choice and, increasingly, the marketable one." },
      { title: "Your tourism career or business", objectives: ["Prepare for hospitality roles and guiding registration.", "Package and price a tourism experience.", "Market to visitors and win bookings."], minutes: 50, lesson: "This module turns skill into livelihood. You will learn the path into employment and the legal route to becoming a registered tourist guide (the qualification, first-aid and registration South African law requires). For the entrepreneur, you will package a small experience, a township food tour, a heritage walk, a guesthouse stay, price it for profit, and market it where travellers actually book (review sites, social media, local partnerships). We map CATHSSETA learnerships and internships as your on-ramp." },
    ],
    caseScenario: "Sisanda grew up in Langa, knows its history, music and best food spots intimately, and dreams of running walking tours for international visitors, but has never guided formally, is unsure what is legally required, and does not know how to price or sell a tour. Help her design an authentic, responsible half-day experience, price it, and plan the steps to guide legally and get her first bookings.",
  },
  // 9 ─────────────────────────────────────────────────────────────────────
  {
    title: "Financial Literacy & Small Business Management",
    focus: "the money, record-keeping and management skills to run a small business that survives and grows",
    description: "Up to half of South Africans are financially illiterate, and poor money management is a leading cause of small-business failure. This course gives entrepreneurs and aspiring managers the practical financial and management foundations to control cash, price for profit, keep proper records, stay compliant, and access finance, so that a promising hustle becomes a durable, growing enterprise. It underpins every other business ambition in the catalogue.",
    objectives: [
      "Manage personal and business money separately and responsibly.",
      "Price products and services for real profit and control cash flow.",
      "Keep books, meet tax and compliance basics, and read simple financial statements.",
      "Plan for growth and access the right funding.",
    ],
    tags: ["financial literacy", "small business", "SMME", "cash flow", "Services SETA", "FASSET", "NQF 4", "entrepreneurship"],
    nqf: 4,
    seta: "Services SETA / FASSET",
    occupation: "Small Business Owner / Enterprise Manager",
    modules: [
      { title: "Money mindset and personal finance", objectives: ["Separate personal and business money.", "Budget, save and manage debt wisely.", "Build the financial discipline a founder needs."], minutes: 50, lesson: "You cannot run a business's money if you cannot run your own. This module builds the personal foundation: a simple budget, the habit of saving even small amounts, and the truth about debt, the difference between borrowing that grows income and borrowing that drowns you. Above all you will learn the rule that saves small businesses, keep personal and business money in separate accounts, so you always know what the business is really making and never spend its cash by accident." },
      { title: "Pricing for profit", objectives: ["Work out the true cost of your product or service.", "Set prices that cover costs and make profit.", "Avoid the under-pricing that kills small businesses."], minutes: 55, lesson: "Most small businesses price by copying competitors or guessing, and quietly lose money on every sale. You will learn to calculate true cost, materials, time, transport, airtime, a share of your overheads, and to set a price that covers it and leaves real profit. You will learn the difference between mark-up and margin, how to price a service (your time is not free), and how to raise prices without losing customers. Getting this right is often the fastest way to turn a struggling venture profitable." },
      { title: "Cash flow is king", objectives: ["Track money in and out with a simple system.", "Forecast cash and avoid running dry.", "Manage customers who pay late."], minutes: 55, lesson: "Profitable businesses still die when they run out of cash. You will learn the difference between profit and cash, and build a simple cash-flow tracker and a short forecast so you can see a shortfall coming and act before it hits. You will learn practical tactics for the South African reality of late payers, deposits, clear terms, polite follow-up, and managing your own payments to suppliers so timing works in your favour. Cash-flow control is the single most important survival skill for an SMME." },
      { title: "Record-keeping and tax basics", objectives: ["Keep simple, accurate business records.", "Understand the tax and registration basics for a small business.", "Stay compliant without a full-time accountant."], minutes: 55, lesson: "Good records are not bureaucracy, they are how you know your business and how you access finance and contracts. You will set up a simple, honest bookkeeping system (even a well-kept spreadsheet), recording every sale and expense with proof. You will learn the compliance basics relevant to a small South African business, registration options, when VAT applies, provisional tax and the value of a tax-clearance status, and how to work with SARS's small-business tools, so you stay legal and ready for opportunity without needing an expensive accountant from day one." },
      { title: "Reading the numbers", objectives: ["Read a simple income statement and balance sheet.", "Calculate a few key business ratios.", "Use the numbers to make better decisions."], minutes: 50, lesson: "Numbers are a language, and once you speak it your business stops being a mystery. You will learn to read the two statements that matter, the income statement (are we making a profit?) and the balance sheet (what do we own and owe?), built from the records you kept last module. You will calculate a few practical numbers, gross margin, break-even, and how long your cash lasts, and, most importantly, use them to make real decisions: what to cut, what to grow, what to charge." },
      { title: "Growth, funding and the plan", objectives: ["Decide when and how to grow safely.", "Match the right funding to the need.", "Write a lean, fundable business plan."], minutes: 55, lesson: "Growth is exciting and dangerous, done wrong it bankrupts good businesses. You will learn to grow deliberately: proving demand before adding cost, and financing growth from the right source. You will compare the real South African funding options, own savings, family, SEFA and government programmes, development finance, grants and, carefully, credit, and what each demands. You will finish by writing a lean, one-page-plus business plan and a simple funding pitch, the document that turns a plan into money and a hustle into an enterprise." },
    ],
    caseScenario: "Themba's printing and signage business in Polokwane is busy, he is always working, but his bank account is somehow always empty and he cannot tell if he is actually making money. He mixes his business and personal cards, prices jobs by 'feel', and has three customers who owe him for work done months ago. Diagnose his finances and give him a 90-day plan to get control and profit.",
  },
  // 10 ────────────────────────────────────────────────────────────────────
  {
    title: "Early Childhood Development & the Care Economy",
    focus: "caring for and teaching young children well, and running a registered, sustainable ECD micro-enterprise",
    description: "Early Childhood Development is a double opportunity: it shapes the country's future and it is a women-led entrepreneurial sector with real government-funding pathways, yet South Africa is far off its goal of universal ECD access. This course equips learners to nurture and teach children from birth to school-going age to a high standard, run a safe and compliant ECD centre, and build it into a funded, sustainable small business, formalising a vital part of the care economy.",
    objectives: [
      "Support healthy early development across all domains, from birth to school.",
      "Plan and lead play-based, age-appropriate learning.",
      "Run a safe, healthy, compliant ECD environment.",
      "Register, fund and sustainably manage an ECD centre as a business.",
    ],
    tags: ["early childhood development", "ECD", "care economy", "education", "ETDP SETA", "NQF 4", "women entrepreneurship"],
    nqf: 4,
    seta: "ETDP SETA",
    occupation: "ECD Practitioner / ECD Centre Owner-Manager",
    modules: [
      { title: "Why the early years matter most", objectives: ["Explain how early experiences shape a whole life.", "Describe the ECD opportunity in South Africa.", "Commit to the practitioner's professional role."], minutes: 45, lesson: "More brain development happens before age five than at any later stage, which is why quality early care changes the trajectory of a life, and a nation. This module makes the case: the science of the early years, South Africa's large gap in access, and the dignity and importance of the ECD practitioner's work. It also frames the opportunity honestly, a sector built largely by women running small centres, with growing government support, and sets the professional standards of care, warmth and reliability the rest of the course builds on." },
      { title: "How young children develop", objectives: ["Track development across physical, cognitive, language, social and emotional domains.", "Recognise typical milestones by age.", "Spot signs that a child may need extra support."], minutes: 60, lesson: "To nurture a child you must understand how they grow. You will learn the domains of development, physical, cognitive, language, social and emotional, and the typical milestones from birth to school-going age, so you know what to expect and encourage at each stage. Crucially, you will learn to observe children well and to recognise early signs of developmental delay or difficulty, so you can support the child and guide the family toward help early, when it makes the biggest difference." },
      { title: "Learning through play", objectives: ["Plan play-based activities that teach real skills.", "Set up stimulating learning areas cheaply.", "Support early language, numeracy and creativity."], minutes: 60, lesson: "For young children, play is not a break from learning, it is how learning happens. You will learn to plan purposeful, play-based activities that build early language, number sense, motor skills and creativity, matched to each age. You will learn to create rich learning areas from low-cost and recycled materials, because a stimulating environment need not be expensive, and to read stories, sing and talk in ways that pour language into young minds. This is the daily craft of a great practitioner." },
      { title: "Health, safety and nutrition", objectives: ["Keep an ECD environment safe and hygienic.", "Provide good nutrition on a real budget.", "Respond correctly to illness, accidents and emergencies."], minutes: 55, lesson: "Parents entrust you with the most precious thing they have, safety is sacred. You will learn to make and keep an environment safe and hygienic, indoors and out, and the daily routines (hand-washing, cleaning, supervision) that prevent illness and injury. You will learn to provide balanced nutrition on a tight budget, why it matters so much for young brains, and exactly how to respond to common illnesses, accidents and emergencies, including basic first aid and when to call for help." },
      { title: "Child protection and working with families", objectives: ["Recognise and respond to signs of abuse or neglect.", "Understand your legal duties to protect children.", "Build strong, respectful partnerships with parents."], minutes: 50, lesson: "An ECD practitioner is often the first to notice when a child is in danger, and the law places a duty on you to act. You will learn to recognise signs of possible abuse or neglect, the correct, safe steps to report and refer, and your legal and ethical responsibilities under South African child-protection law. You will also learn to build trusting partnerships with parents and caregivers, because a child thrives when centre and home work together, and because those relationships are also the foundation of a stable, respected business." },
      { title: "Running an ECD centre as a business", objectives: ["Meet registration and compliance requirements.", "Access government subsidies and other funding.", "Manage the centre sustainably and grow enrolment."], minutes: 55, lesson: "A great practitioner can still fail as a business owner, this module prevents that. You will learn the practical path to registering an ECD centre and meeting the health, safety and staffing requirements, and how to access the government per-child subsidy and other funding that so many eligible centres miss out on. You will cover the money side, fees, costs, record-keeping and cash flow, and how to build enrolment and reputation. We map the ETDP SETA qualifications that professionalise you and unlock funding, turning a caring vocation into a sustainable enterprise." },
    ],
    caseScenario: "Gogo Miriam looks after fourteen young children in her home in KwaMashu while their parents work. The parents trust her, but she has no registration, no real programme beyond keeping the children fed and safe, and no idea she might qualify for a government subsidy. Help her raise the quality of care and learning, make the space safe and compliant, and take the first concrete steps to register and access funding.",
  },
];

// ───────────────────────────────────────────────────────────────────────────
async function firstOrNull<T>(rows: T[]): Promise<T | null> { return rows.length ? rows[0]! : null; }

async function createCourse(c: SeedCourse, orgId: string, facultyId: string): Promise<string> {
  const framing = [...c.tags, c.seta, c.occupation];
  const [course] = await db.insert(coursesTable).values({
    title: c.title, description: c.description, tenantId: "platform", status: "published",
    competencyTags: framing, objectives: c.objectives, nqfLevel: c.nqf,
  }).returning();

  let firstModuleId = "";
  for (let mi = 0; mi < c.modules.length; mi++) {
    const m = c.modules[mi];
    const [mod] = await db.insert(modulesTable).values({
      courseId: course.id, title: m.title, status: "published", lessonType: "slides",
      modality: "async", order: mi, objectives: m.objectives, estimatedMinutes: m.minutes,
      description: `Part of ${c.title}. ${m.title}.`,
    }).returning();
    if (mi === 0) firstModuleId = mod.id;
    await db.insert(beatsTable).values([
      { moduleId: mod.id, type: "title_card", order: 0, title: m.title, narration: `Welcome to "${m.title}". This module focuses on ${c.focus}. By the end you will be able to: ${m.objectives.join(" ")}` },
      { moduleId: mod.id, type: "points", order: 1, title: "What you'll learn", narration: m.lesson, bulletPoints: m.objectives },
      { moduleId: mod.id, type: "close", order: 2, title: "Wrap up", narration: `You've completed "${m.title}". Try the practice, then bring a real example to the discussion before the next module.` },
    ]);
    await db.update(modulesTable).set({ beatCount: 3 }).where(eq(modulesTable.id, mod.id));
    // A full teaching lesson per module, so every module has real content, not just objectives.
    const body = `# ${m.title}\n\n${m.lesson}\n\n## In this module you will be able to\n\n${m.objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}`;
    await db.insert(moduleReadingsTable).values({
      moduleId: mod.id, courseId: course.id, title: `Lesson: ${m.title}`,
      kind: "note", content: body, chars: body.length, order: 0, published: true, createdBy: facultyId,
    });
  }
  await db.update(coursesTable).set({ moduleCount: c.modules.length }).where(eq(coursesTable.id, course.id));

  const reader = `# ${c.title}\n\n**NQF Level ${c.nqf}  ·  ${c.seta}  ·  Aligned occupation: ${c.occupation}**\n\n${c.description}\n\n## What you will be able to do\n\n${c.objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}\n\n## How this course is built\n\nSix modules, each with a lesson, key ideas and practice; an AI-coached case study; a readiness self-check; a class discussion; and a capstone project applied to a real South African business or workplace. Work in order, do the project, and take part in the discussion. This course is designed for implementation over theory.`;
  await db.insert(moduleReadingsTable).values({
    moduleId: firstModuleId, courseId: course.id, title: `Course reader: ${c.title}`,
    kind: "note", content: reader, chars: reader.length, order: 1, published: true, createdBy: facultyId,
  });

  await db.insert(caseScenariosTable).values({
    organisationId: orgId, moduleId: firstModuleId, createdBy: facultyId, createdByName: "Enza Faculty",
    title: `Case study: ${c.title}`,
    learningObjective: c.objectives[0],
    contextBlock: c.caseScenario,
    openingQuestion: "Where would you start, and why? Talk me through your thinking.",
    focusAreas: c.objectives.slice(0, 3),
    difficulty: c.nqf >= 6 ? "advanced" : c.nqf >= 5 ? "intermediate" : "foundational",
    status: "published", isLibrary: true, tags: c.tags,
    guidingInstructions: `Coach the learner through the scenario using questions, not answers. Keep them focused on ${c.focus}. Push for concrete, practical, costed steps in a South African context.`,
  });

  const items = c.objectives.map((o) => `<li><label><input type="checkbox"> ${o}</label></li>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>body{font-family:Heebo,system-ui,sans-serif;color:#111;margin:0;padding:20px;background:#fff}h2{color:#111}li{margin:.5rem 0;list-style:none}.bar{height:8px;background:#eee;border-radius:6px;overflow:hidden;margin:12px 0}.fill{height:100%;width:0;background:#9CDF00;transition:.3s}button{background:#111;color:#fff;border:0;border-radius:6px;padding:.6rem 1rem;font:inherit;cursor:pointer}.hint{color:#666;font-size:.9rem}</style><h2>${c.title} - readiness check</h2><p class="hint">Tick each skill you can honestly do today.</p><ul id="l">${items}</ul><div class="bar"><div class="fill" id="f"></div></div><p id="s" class="hint">0% ready</p><button onclick="save()">Save my score</button><script>const cs=[...document.querySelectorAll('input')];function upd(){const n=cs.filter(x=>x.checked).length,p=Math.round(n/cs.length*100);document.getElementById('f').style.width=p+'%';document.getElementById('s').textContent=p+'% ready ('+n+' of '+cs.length+')';}cs.forEach(x=>x.addEventListener('change',upd));function save(){upd();alert('Saved. Focus next on the skills you left unticked.');}<\/script>`;
  await db.insert(interactiveActivitiesTable).values({
    organisationId: orgId, courseId: course.id, moduleId: firstModuleId,
    title: `${c.title}: readiness self-check`,
    instructions: `Rate yourself against the course objectives now, and again at the end to see your growth.`,
    html, source: "html", kind: "checklist", bloomsLevel: "Evaluate",
    difficulty: c.nqf >= 6 ? "advanced" : c.nqf >= 5 ? "intermediate" : "foundational",
    isLibrary: true, tags: c.tags, published: true, createdByUserId: facultyId,
  });

  await db.insert(discussionsTable).values({
    courseId: course.id, authorId: facultyId, moduleId: firstModuleId,
    title: `Discussion: applying ${c.title}`,
    body: `In your first post (100-150 words): (1) name a real business, workplace or situation where you will use these skills; (2) describe one specific action you will take from this course; and (3) the result you expect. Then reply helpfully to at least two classmates.`,
    aiFacilitated: true, requireInitialPost: true, graded: false,
  });

  await db.insert(assignmentsTable).values({
    courseId: course.id, moduleId: firstModuleId,
    title: `Capstone project: ${c.title}`,
    description: `A practical, real-world application of everything in this course.`,
    instructions: `Apply this course to a real business, workplace or project (your own or one you can access). Produce a practical output (2-4 pages, or a completed template/portfolio piece) that demonstrates the course objectives:\n\n${c.objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}\n\nGround everything in real numbers and a real South African context. Be specific and actionable. Submit your work and be ready to present it in coaching.`,
    submissionType: "file_upload", pointsPossible: "100", published: true, position: 0,
  });

  return course.id;
}

/**
 * Idempotent. Requires the Enza partner to exist (run seed-enza first). Find-or-creates the shared
 * Enza SMME Academy org + faculty author, then for each course: reuse-by-title or create, and ensure
 * it is assigned to the Enza partner. Per-course try/catch so one failure cannot stop the rest.
 */
export async function seedSkillsCatalog(): Promise<{ total: number; created: number; assigned: number; error: string | null }> {
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
      let course = await firstOrNull(await db.select().from(coursesTable).where(and(eq(coursesTable.title, c.title), eq(coursesTable.tenantId, "platform"))));
      const courseId = course ? course.id : await createCourse(c, org.id, faculty.id);
      if (!course) created++;
      const has = await db.select({ id: coursePartnerAssignmentsTable.id }).from(coursePartnerAssignmentsTable)
        .where(and(eq(coursePartnerAssignmentsTable.courseId, courseId), eq(coursePartnerAssignmentsTable.partnerId, partner.id)));
      if (has.length === 0) { await db.insert(coursePartnerAssignmentsTable).values({ courseId, partnerId: partner.id, assignedBy: faculty.id }); assigned++; }
    } catch (e) {
      if (!error) error = (e instanceof Error ? e.message : String(e)).slice(0, 240);
    }
  }
  return { total: COURSES.length, created, assigned, error };
}
