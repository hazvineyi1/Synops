// CCNE reference dataset.
//
// CCNE (Commission on Collegiate Nursing Education) accredits nursing programs
// against the AACN Essentials (2021) competency domains. The competency
// descriptions below are concise paraphrases authored for this product, not
// verbatim copies of the copyrighted Essentials text. They are seeded as global
// reference data so a tenant can map curriculum outcomes to CCNE domains.
//
// The structure is intentionally accreditor-agnostic so a second accreditor can
// be added as another dataset without changing the seed or renderer code.

export interface AccreditorCompetencySeed {
  code: string;
  description: string;
}

export interface AccreditorDomainSeed {
  code: string;
  name: string;
  competencies: AccreditorCompetencySeed[];
}

export interface AccreditorFrameworkSeed {
  name: string;
  acronym: string;
  frameworkType: string;
  description: string;
  domains: AccreditorDomainSeed[];
}

/** The stored domain grouping label for a competency, e.g. "Domain 1: ...". */
export function domainLabel(domain: AccreditorDomainSeed): string {
  return `Domain ${domain.code}: ${domain.name}`;
}

export const CCNE_FRAMEWORK: AccreditorFrameworkSeed = {
  name: "Commission on Collegiate Nursing Education",
  acronym: "CCNE",
  frameworkType: "accreditor",
  description:
    "Nursing program accreditation aligned to the AACN Essentials (2021) competency domains.",
  domains: [
    {
      code: "1",
      name: "Knowledge for Nursing Practice",
      competencies: [
        { code: "1.1", description: "Apply foundational knowledge from nursing, the arts, the sciences, and the humanities to practice." },
        { code: "1.2", description: "Integrate theory and current evidence to inform clinical reasoning." },
        { code: "1.3", description: "Translate science into safe, person-centered care decisions." },
      ],
    },
    {
      code: "2",
      name: "Person-Centered Care",
      competencies: [
        { code: "2.1", description: "Establish respectful, therapeutic relationships with individuals and families." },
        { code: "2.2", description: "Conduct comprehensive, culturally responsive assessments." },
        { code: "2.3", description: "Develop and evaluate individualized plans of care in partnership with patients." },
        { code: "2.4", description: "Coordinate safe care transitions across settings." },
      ],
    },
    {
      code: "3",
      name: "Population Health",
      competencies: [
        { code: "3.1", description: "Apply principles of population health to communities and systems." },
        { code: "3.2", description: "Use epidemiologic data to plan health promotion and disease prevention." },
        { code: "3.3", description: "Address social determinants of health and advance health equity." },
      ],
    },
    {
      code: "4",
      name: "Scholarship for the Nursing Discipline",
      competencies: [
        { code: "4.1", description: "Apply evidence-based practice and translate research into care." },
        { code: "4.2", description: "Participate in quality improvement and scholarly inquiry." },
        { code: "4.3", description: "Communicate findings that advance nursing knowledge." },
      ],
    },
    {
      code: "5",
      name: "Quality and Safety",
      competencies: [
        { code: "5.1", description: "Apply quality improvement methods to improve outcomes." },
        { code: "5.2", description: "Promote a culture of safety and just accountability." },
        { code: "5.3", description: "Use risk reduction and error prevention strategies." },
      ],
    },
    {
      code: "6",
      name: "Interprofessional Partnerships",
      competencies: [
        { code: "6.1", description: "Communicate effectively within interprofessional teams." },
        { code: "6.2", description: "Collaborate to deliver coordinated, patient-centered care." },
        { code: "6.3", description: "Apply principles of team dynamics and shared decision making." },
      ],
    },
    {
      code: "7",
      name: "Systems-Based Practice",
      competencies: [
        { code: "7.1", description: "Navigate care delivery within complex health systems." },
        { code: "7.2", description: "Apply principles of cost, value, and resource stewardship." },
        { code: "7.3", description: "Coordinate care to optimize system performance." },
      ],
    },
    {
      code: "8",
      name: "Informatics and Healthcare Technologies",
      competencies: [
        { code: "8.1", description: "Use information and communication technologies to deliver safe care." },
        { code: "8.2", description: "Apply data management and clinical decision support tools." },
        { code: "8.3", description: "Uphold privacy, security, and ethical use of health data." },
      ],
    },
    {
      code: "9",
      name: "Professionalism",
      competencies: [
        { code: "9.1", description: "Demonstrate accountability, integrity, and ethical conduct." },
        { code: "9.2", description: "Apply professional standards and a code of ethics to practice." },
        { code: "9.3", description: "Engage in self-reflection and professional identity formation." },
      ],
    },
    {
      code: "10",
      name: "Personal, Professional, and Leadership Development",
      competencies: [
        { code: "10.1", description: "Demonstrate leadership behaviors that advance the profession." },
        { code: "10.2", description: "Pursue lifelong learning and personal well-being." },
        { code: "10.3", description: "Apply principles of mentorship and self management." },
      ],
    },
  ],
};
