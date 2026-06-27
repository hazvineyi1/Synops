// Exam-specific domain packs.
//
// A domain pack is curated, public-blueprint structure for a well-known exam: its
// weighted content domains and its question format. The coach uses this to plan
// (spend time in proportion to domain weight and the learner's weak spots), to
// frame scenarios in the exam's style, and to give a brand-new learner a real
// map of the exam before they have uploaded any material.
//
// IMPORTANT: weights and formats are APPROXIMATE and change between exam versions.
// They are guidance for prioritization, not authoritative. The coach should tell
// the learner to confirm the current official blueprint.

export type ExamDomain = {
  name: string;
  weightPct?: number; // approximate share of the exam
  summary: string; // what this domain covers, in one line
};

export type DomainPack = {
  id: string;
  label: string; // canonical exam name
  matchTerms: string[]; // lowercase aliases/substrings matched against examName
  format: string; // one-line description of the exam's question format
  domains: ExamDomain[];
};

export const DOMAIN_PACKS: DomainPack[] = [
  {
    id: "pmp",
    label: "PMP (Project Management Professional)",
    matchTerms: ["pmp", "project management professional"],
    format: "About 180 questions, mostly scenario-based, across multiple choice, multiple response, matching, and hotspot.",
    domains: [
      { name: "People", weightPct: 42, summary: "Leading and building teams, conflict, motivation, stakeholder engagement, servant leadership." },
      { name: "Process", weightPct: 50, summary: "Running the project: scope, schedule, budget, risk, quality, procurement, value delivery (predictive and agile)." },
      { name: "Business Environment", weightPct: 8, summary: "Compliance, organizational change, benefits realization, project alignment to strategy." },
    ],
  },
  {
    id: "security-plus",
    label: "CompTIA Security+ (SY0-701)",
    matchTerms: ["security+", "security plus", "sec+", "comptia security", "sy0"],
    format: "Up to 90 questions: multiple choice plus performance-based (hands-on) tasks.",
    domains: [
      { name: "General Security Concepts", weightPct: 12, summary: "Security controls, CIA triad, zero trust, cryptography basics, change management." },
      { name: "Threats, Vulnerabilities & Mitigations", weightPct: 22, summary: "Threat actors, attack types, vulnerabilities, indicators, and mitigation techniques." },
      { name: "Security Architecture", weightPct: 18, summary: "Secure design across cloud, network, and data, plus resilience and recovery." },
      { name: "Security Operations", weightPct: 28, summary: "Hardening, monitoring, identity and access, incident response, and automation." },
      { name: "Security Program Management & Oversight", weightPct: 20, summary: "Governance, risk management, third-party risk, compliance, and audits." },
    ],
  },
  {
    id: "aws-saa",
    label: "AWS Certified Solutions Architect - Associate (SAA-C03)",
    matchTerms: ["aws solutions architect", "saa-c03", "saa c03", "aws saa", "solutions architect associate"],
    format: "65 questions, multiple choice and multiple response, scenario-driven design tradeoffs.",
    domains: [
      { name: "Design Secure Architectures", weightPct: 30, summary: "IAM, data protection, secure network design, and secure access to AWS resources." },
      { name: "Design Resilient Architectures", weightPct: 26, summary: "Decoupling, high availability, fault tolerance, and multi-tier/scalable designs." },
      { name: "Design High-Performing Architectures", weightPct: 24, summary: "Choosing performant storage, compute, networking, and database solutions." },
      { name: "Design Cost-Optimized Architectures", weightPct: 20, summary: "Right-sizing, storage/compute cost tradeoffs, and cost-effective networking." },
    ],
  },
  {
    id: "mcat",
    label: "MCAT (Medical College Admission Test)",
    matchTerms: ["mcat"],
    format: "About 230 questions across four sections, heavily passage-based reasoning.",
    domains: [
      { name: "Biological & Biochemical Foundations", weightPct: 25, summary: "Biology, biochemistry, organic and general chemistry applied to living systems." },
      { name: "Chemical & Physical Foundations", weightPct: 25, summary: "General chemistry, physics, organic chemistry, and biochemistry of biological systems." },
      { name: "Psychological, Social & Biological Foundations of Behavior", weightPct: 25, summary: "Psychology, sociology, and biology of behavior and mind." },
      { name: "Critical Analysis & Reasoning Skills (CARS)", weightPct: 25, summary: "Reading comprehension and reasoning over humanities and social science passages." },
    ],
  },
  {
    id: "gre",
    label: "GRE General Test",
    matchTerms: ["gre", "graduate record"],
    format: "Sections of Verbal, Quant, and Analytical Writing; section-adaptive.",
    domains: [
      { name: "Verbal Reasoning", weightPct: 40, summary: "Reading comprehension, text completion, and sentence equivalence." },
      { name: "Quantitative Reasoning", weightPct: 40, summary: "Arithmetic, algebra, geometry, and data analysis problem solving." },
      { name: "Analytical Writing", weightPct: 20, summary: "Analyze-an-issue essay: clear, evidence-backed argument under time." },
    ],
  },
  {
    id: "toefl",
    label: "TOEFL iBT",
    matchTerms: ["toefl", "esl", "english as a second", "english proficiency"],
    format: "Four sections, each scored equally; integrated tasks combine skills.",
    domains: [
      { name: "Reading", weightPct: 25, summary: "Understand academic passages: main ideas, detail, inference, vocabulary." },
      { name: "Listening", weightPct: 25, summary: "Lectures and conversations: gist, detail, attitude, and organization." },
      { name: "Speaking", weightPct: 25, summary: "Independent and integrated spoken responses, clear and well-organized." },
      { name: "Writing", weightPct: 25, summary: "Integrated (read/listen/write) and independent essay tasks." },
    ],
  },
  {
    id: "nclex-rn",
    label: "NCLEX-RN",
    matchTerms: ["nclex", "registered nurse exam", "rn licensure"],
    format: "Variable-length adaptive test across client-needs categories, including next-gen case studies.",
    domains: [
      { name: "Safe & Effective Care Environment", weightPct: 27, summary: "Management of care and safety/infection control." },
      { name: "Health Promotion & Maintenance", weightPct: 9, summary: "Growth, development, prevention, and early detection." },
      { name: "Psychosocial Integrity", weightPct: 9, summary: "Coping, mental health, and therapeutic communication." },
      { name: "Physiological Integrity", weightPct: 55, summary: "Basic care, pharmacology, risk reduction, and physiological adaptation (the heaviest area)." },
    ],
  },
  {
    id: "ube-bar",
    label: "Bar Exam (UBE)",
    matchTerms: ["bar exam", "ube", "uniform bar", "bar"],
    format: "MBE multiple-choice plus MEE essays and the MPT performance task.",
    domains: [
      { name: "MBE (Multistate Bar Exam)", weightPct: 50, summary: "200 MCQs over Civ Pro, Con Law, Contracts, Crim Law/Pro, Evidence, Property, Torts." },
      { name: "MEE (Multistate Essay Exam)", weightPct: 30, summary: "Essays applying rules to facts across a broad set of subjects." },
      { name: "MPT (Multistate Performance Test)", weightPct: 20, summary: "Lawyering task from a closed file and library: analysis and drafting." },
    ],
  },
  {
    id: "cpa",
    label: "CPA (US Uniform CPA Exam)",
    matchTerms: ["cpa", "certified public accountant", "uniform cpa"],
    format: "Three core sections plus one chosen discipline; MCQs and task-based simulations.",
    domains: [
      { name: "AUD - Auditing & Attestation", summary: "Audit engagements, ethics, internal control, evidence, and reporting." },
      { name: "FAR - Financial Accounting & Reporting", summary: "Financial statements, transactions, and governmental/nonprofit accounting." },
      { name: "REG - Taxation & Regulation", summary: "Federal taxation, business law, and ethics." },
      { name: "Discipline (BAR, ISC, or TCP)", summary: "One chosen focus: business analysis, information systems, or tax compliance/planning." },
    ],
  },
  {
    id: "acca",
    label: "ACCA Qualification",
    matchTerms: ["acca", "chartered certified accountant"],
    format: "Exams across three levels; objective tests and longer constructed-response questions.",
    domains: [
      { name: "Applied Knowledge", summary: "Business and technology, management accounting, financial accounting fundamentals." },
      { name: "Applied Skills", summary: "Law, performance and financial management, taxation, audit, and reporting." },
      { name: "Strategic Professional", summary: "Strategic business leadership and reporting, plus chosen options (AFM, APM, ATX, AAA)." },
    ],
  },
];

// Match a learner's stated exam to a curated pack. Matching is by examName only;
// the generic goal (certification/university/general) is not specific enough.
export function matchDomainPack(examName?: string | null): DomainPack | null {
  if (!examName) return null;
  const q = examName.toLowerCase();
  // Prefer the most specific (longest) matching term so e.g. "security+" wins
  // over a bare "bar"-style short term if both somehow appear.
  let best: { pack: DomainPack; termLen: number } | null = null;
  for (const pack of DOMAIN_PACKS) {
    for (const term of pack.matchTerms) {
      if (q.includes(term) && (!best || term.length > best.termLen)) {
        best = { pack, termLen: term.length };
      }
    }
  }
  return best?.pack ?? null;
}

// Format a pack as prompt context for the coach.
export function domainPackContext(pack: DomainPack): string {
  const lines = pack.domains
    .map(
      (d) =>
        `  - ${d.name}${d.weightPct != null ? ` (~${d.weightPct}% of the exam)` : ""}: ${d.summary}`,
    )
    .join("\n");
  return `EXAM DOMAIN PACK — ${pack.label}
Format: ${pack.format}
Weighted domains (approximate; tell the learner to confirm the current official blueprint):
${lines}
Use this map to: prioritize the plan by domain weight and the learner's weak areas, frame scenarios and checkpoints in this exam's style, and map the learner's own concepts onto these domains. Spend the most time where weight is high and mastery is low.`;
}
