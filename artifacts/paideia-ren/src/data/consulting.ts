// Single source of truth for the consulting site: service lines, sectors,
// case studies and engagement models. Pages render from this file so copy
// stays consistent. House rule: no em dashes anywhere in site copy.
//
// Client names are deliberately anonymized. Replace a `client` string with the
// real name only once that client has agreed to be named.

export interface Service {
  slug: string;
  num: string;
  title: string;
  short: string;
  promise: string;
  problems: string[];
  deliverables: string[];
  tools: string;
}

export const services: Service[] = [
  {
    slug: "learning",
    num: "01",
    title: "Learning Design & E-Learning",
    short: "Courses, simulations and training programs that change what people actually do.",
    promise:
      "We design training around the decisions people have to make on the job, then build it to a standard that survives accreditation, accessibility review and real learners.",
    problems: [
      "Training is lecture-heavy and nobody can show it changed practice",
      "You need scenario practice for high-stakes work, not more slides",
      "Courses must meet accreditation, Quality Matters or WCAG 2.1 AA",
      "Subject experts are busy and content keeps stalling",
    ],
    deliverables: [
      "Curriculum and program architecture",
      "Scenario-based and branching simulations",
      "Assessment, rubric and evaluation design",
      "Trainer and faculty enablement",
      "Accessibility and Quality Matters review",
      "Course builds in Storyline, Rise or your LMS",
    ],
    tools: "Articulate Storyline & Rise · Captivate · Camtasia · Quality Matters · WCAG 2.1 AA · Section 508 · UDL",
  },
  {
    slug: "platforms",
    num: "02",
    title: "LMS & Learning Platforms",
    short: "Choose, configure, launch and run the platform your learners actually use.",
    promise:
      "We implement the platform you have, or stand up one built for your context: white-label, low-bandwidth, multi-tenant, and compliant with the data law you operate under.",
    problems: [
      "The LMS is underused, misconfigured or mid-migration",
      "Partners or cohorts need their own branded space",
      "Learners are on mobile data and expensive bandwidth",
      "Data protection (POPIA, GDPR, FERPA) has to be designed in, not bolted on",
    ],
    deliverables: [
      "LMS selection, implementation and migration",
      "White-label learning platform deployment",
      "Practice hubs and credentialing portals",
      "Mobile, offline and WhatsApp-first delivery",
      "Privacy-by-design data architecture",
      "Learning analytics and progress dashboards",
    ],
    tools: "Canvas · D2L Brightspace · Blackboard · Moodle · Synops Praxis · POPIA · GDPR · FERPA",
  },
  {
    slug: "ai",
    num: "03",
    title: "AI Integration & Automation",
    short: "Put AI to work in daily operations, with guardrails your team trusts.",
    promise:
      "We find the repetitive, high-volume work in your operation, automate it with AI agents and integrations, and train your people to run and govern it themselves.",
    problems: [
      "Staff lose hours to inboxes, status updates and document chasing",
      "Leadership wants an AI plan that is more than a pilot",
      "You want AI tutors, coaches or assessors that will not make things up",
      "There is no policy for safe, responsible AI use",
    ],
    deliverables: [
      "AI readiness assessment and adoption roadmap",
      "AI agents for triage, briefings and drafting",
      "Workflow automation and system integrations",
      "AI tutors, coaches and rubric-bound assessors",
      "Staff AI training and prompt practice",
      "Responsible AI policy, evaluation and QA",
    ],
    tools: "Claude & OpenAI models · Agent SDKs · Supabase & Postgres · Microsoft 365 & Google Workspace · GitHub Actions",
  },
  {
    slug: "operations",
    num: "04",
    title: "Operations & Program Management",
    short: "Stand up the PMO, fix the process, and deliver the program on time.",
    promise:
      "Two decades of running complex, regulated operations. We redesign the workflow, hold the quality line, and manage the change so the improvement sticks.",
    problems: [
      "A program is slipping and nobody owns the whole picture",
      "Processes have too many handoffs and the backlog keeps growing",
      "Vendors or offshore teams are not held to standard",
      "A regulated program needs audit-ready documentation",
    ],
    deliverables: [
      "PMO stand-up and delivery governance",
      "Process redesign and root-cause analysis",
      "SOPs, quality assurance and compliance",
      "Change management and workforce transition",
      "Vendor and offshore operations oversight",
      "Managed care and Medicaid program operations",
    ],
    tools: "PMP · Agile & Scrum · Smartsheet · Asana · Jira · NCQA-aligned quality programs",
  },
];

export interface Sector {
  slug: string;
  title: string;
  body: string;
  examples: string[];
}

export const sectors: Sector[] = [
  {
    slug: "justice",
    title: "Justice, Law & Legal Education",
    body:
      "Training for investigators, prosecutors, judges and law students, where procedure and judgement matter more than recall.",
    examples: [
      "Scenario practice for international crimes investigations",
      "Bar and SQE simulations, including client-interview practice",
      "Knowledge hubs for justice practitioners",
    ],
  },
  {
    slug: "education",
    title: "Higher Education & Credentialing",
    body:
      "Universities, professional bodies and credentialing organizations that need rigorous, accessible, accreditation-ready learning.",
    examples: [
      "Course and program design to Quality Matters and WCAG 2.1 AA",
      "Practice-based and stackable credentials",
      "Faculty enablement for online and AI-supported teaching",
    ],
  },
  {
    slug: "workforce",
    title: "Workforce & Skills Development",
    body:
      "Training providers and funders building skills at scale, including across Southern Africa where bandwidth, data law and funding rules shape every design choice.",
    examples: [
      "White-label LMS for accredited training providers",
      "Entrepreneur and SME programs",
      "SETA / QCTO-aware program structures and POPIA-by-design data",
    ],
  },
  {
    slug: "public-sector",
    title: "Public Sector & Government",
    body:
      "Agencies and public bodies that need program management, training and process improvement delivered by a certified small business.",
    examples: [
      "Management, organizational development and QA consulting",
      "Staff training and digital learning programs",
      "SWaM certified, Virginia eVA and SAM.gov registered",
    ],
  },
  {
    slug: "health",
    title: "Health & Human Services",
    body:
      "Health plans, providers and clinician-leadership programs where operations are regulated and the stakes are high.",
    examples: [
      "Managed care and Medicaid program operations",
      "Provider-network management and dispute resolution",
      "Leadership development for clinicians",
    ],
  },
  {
    slug: "nonprofit",
    title: "Nonprofits & International Development",
    body:
      "Mission-driven organizations that need serious learning and systems work on a realistic budget, often across borders.",
    examples: [
      "Capacity-building programs for frontline staff",
      "Low-bandwidth, multilingual delivery",
      "Clear governance on data and knowledge ownership",
    ],
  },
];

export interface CaseStudy {
  slug: string;
  sector: string;
  service: string;
  client: string;
  title: string;
  challenge: string;
  approach: string[];
  result: string;
  metric?: { value: string; label: string };
}

export const caseStudies: CaseStudy[] = [
  {
    slug: "justice-training",
    sector: "Justice & Legal Education",
    service: "Learning Design & E-Learning",
    client: "An international justice NGO",
    title: "Scenario training for war-crimes investigators, prosecutors and judges",
    challenge:
      "Frontline justice actors in an active conflict needed to practice the procedural decisions that lead to convictions: interviewing witnesses, proving linkage, valuing pillaged assets and weighing expert evidence. Lectures on substantive law were not going to do it.",
    approach: [
      "Capacity-building program architecture for police, prosecutors and judges",
      "Branching case simulations with a rubric-bound AI assessor",
      "A judge-facing bench view for expert and satellite evidence",
      "A two-module online course with banded assessment, delivered on our LMS",
    ],
    result:
      "Training is now organized around evidence decisions rather than reading, and feeds a knowledge hub practitioners can return to between bootcamps.",
  },
  {
    slug: "practice-credentials",
    sector: "Higher Education & Credentialing",
    service: "LMS & Learning Platforms",
    client: "A UK leadership credentialing body",
    title: "A Practice Hub for experience-first leadership credentials",
    challenge:
      "Clinician leaders across Southern Africa earn credentials from evidence of their own practice, not from courses. A conventional LMS would have quietly turned the program back into content. Data costs also made long online sessions unrealistic.",
    approach: [
      "Inverted the usual flow: experience, reflection, theory, evidence, then credential",
      "An AI Socratic coach that offers competing theoretical lenses and never picks one for the learner",
      "Asynchronous, upload-in-a-minute design for expensive mobile data, with peer Learning Sets that can run on WhatsApp",
      "A written governance model separating platform, methodology and community-owned knowledge",
    ],
    result:
      "The client's leadership endorsed the direction and the Hub is being refined with tutors and academics who will own the knowledge base.",
  },
  {
    slug: "white-label-lms",
    sector: "Workforce & Skills Development",
    service: "LMS & Learning Platforms",
    client: "An accredited South African training provider",
    title: "A white-label LMS for a three-tier entrepreneur program",
    challenge:
      "A QCTO-accredited provider training township and rural entrepreneurs needed its own branded platform, partner-level reporting for funders, and data handling that satisfies POPIA across borders.",
    approach: [
      "Deployed a branded, multi-tenant instance of our LMS with partner, organization and learner tiers",
      "Privacy by design: learners held as opaque IDs, identifiers stay with the provider, EU hosting for POPIA adequacy",
      "Organization-controlled enrollment so funders see exactly who was assigned what",
      "Three eight-module courses, each ending in a real business artifact, plus an AI coach for remedial help",
    ],
    result:
      "The provider runs on its own branded domain with a commercial model aligned to its funders' tranche payments.",
  },
  {
    slug: "ai-chief-of-staff",
    sector: "Professional Services",
    service: "AI Integration & Automation",
    client: "Synops (our own practice)",
    title: "An AI chief of staff that runs a multi-client portfolio",
    challenge:
      "Eight concurrent client engagements, five mailboxes and constant status chasing. Important requests were getting buried and client sign-offs lived in email threads.",
    approach: [
      "An AI agent that scans email, calendar and documents each weekday and writes a prioritized brief",
      "Drafts replies to a Drafts folder only, never sends, and books only confirmed meetings",
      "A sign-off repository where clients confirm or amend documents by link, time and identity stamped",
      "A live portfolio Gantt that updates from the same project registry",
    ],
    result:
      "Every morning starts with one brief instead of five inboxes, at a running cost of roughly $45 a month after tuning.",
    metric: { value: "~$45", label: "per month to run, after cutting model costs by about 45%" },
  },
  {
    slug: "legal-education",
    sector: "Justice & Legal Education",
    service: "Learning Design & E-Learning",
    client: "A market-leading legal-education publisher",
    title: "Accessible, high-volume legal education at scale",
    challenge:
      "Law students and bar candidates needed rigorous, accessible courses and realistic practice, produced at volume without losing quality.",
    approach: [
      "Lead instructional design and senior QA across a large course portfolio",
      "Competency modules, assessments and branching practice built to WCAG 2.1 AA",
      "An AI-integration initiative that trained designers in generative-AI evaluation",
    ],
    result: "More than forty courses and curricula shipped to accessibility standards, on schedule.",
    metric: { value: "40+", label: "courses delivered to WCAG 2.1 AA" },
  },
  {
    slug: "managed-care",
    sector: "Health & Human Services",
    service: "Operations & Program Management",
    client: "One of the largest US managed-care organizations",
    title: "Cutting provider-dispute resolution time",
    challenge:
      "High-dollar provider disputes passed through nine handoffs and three systems before anyone with authority saw them, carrying financial risk and damaging provider trust.",
    approach: [
      "Mapped the full dispute lifecycle to find where claims sat idle",
      "Tiered disputes by dollar value and complexity so high-impact cases reached senior reviewers early",
      "Built a predictable provider collaboration cadence into the framework",
    ],
    result: "Average resolution time fell by about 40%, concentrated in the claims carrying the most risk.",
    metric: { value: "40%", label: "faster average dispute resolution" },
  },
];

export interface EngagementModel {
  title: string;
  duration: string;
  body: string;
  outputs: string[];
}

export const engagementModels: EngagementModel[] = [
  {
    title: "Diagnostic sprint",
    duration: "2 to 4 weeks",
    body: "A fixed-scope look at your training, platform, or operation, ending in a costed plan you can act on with or without us.",
    outputs: ["Current-state review", "Prioritized roadmap", "Costed options"],
  },
  {
    title: "Design & build",
    duration: "8 to 16 weeks",
    body: "We design and deliver the thing itself: the course, the simulation, the platform, or the automation, through launch.",
    outputs: ["Working deliverable", "Launch support", "Handover documentation"],
  },
  {
    title: "Embedded or fractional",
    duration: "Monthly retainer",
    body: "A senior learning, AI, or program lead working inside your team for a set number of days each month.",
    outputs: ["Fractional leadership", "Team coaching", "Steady delivery cadence"],
  },
  {
    title: "Managed platform",
    duration: "Ongoing",
    body: "We host, run and support the learning platform or AI coach for you, so your team focuses on learners, not servers.",
    outputs: ["Hosting & support", "Content updates", "Usage reporting"],
  },
];

export const method = [
  { step: "Discover", body: "Listen first. Map the real work, the learners, the constraints, and what success has to look like." },
  { step: "Design", body: "Ground the solution in evidence: learning science, process data, and your regulatory reality." },
  { step: "Build", body: "Ship working courses, platforms and automations in short cycles you can review." },
  { step: "Launch", body: "Go live with training, support and a clear owner for every moving part." },
  { step: "Hand over", body: "Stay until your team can run it without us, then step back." },
];

export const credentials = [
  "SWaM Certified (Women & Minority-Owned)",
  "SAM.gov Registered",
  "Virginia eVA Registered",
  "PMP",
  "Quality Matters",
  "WCAG 2.1 AA / Section 508",
];
