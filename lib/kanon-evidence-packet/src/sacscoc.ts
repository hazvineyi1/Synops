// SACSCOC reference dataset.
//
// SACSCOC is a regional/institutional accreditor; its 2024 Principles of
// Accreditation organize requirements into numbered sections. This dataset covers
// the sections most relevant to curriculum design and program quality (faculty,
// institutional effectiveness, student achievement, program structure/content,
// educational policies, and academic support). Descriptions are concise
// paraphrases authored for this product, not verbatim copies of the copyrighted
// Principles text. They are seeded as global reference data so a tenant can map
// curriculum and program outcomes to the relevant SACSCOC standards.

import type { AccreditorFrameworkSeed } from "./ccne";

export const SACSCOC_FRAMEWORK: AccreditorFrameworkSeed = {
  name: "SACSCOC Principles of Accreditation (2024)",
  acronym: "SACSCOC",
  frameworkType: "accreditor",
  description:
    "Regional institutional accreditation aligned to the 2024 SACSCOC Principles (curriculum and program-quality sections).",
  domains: [
    {
      code: "6",
      name: "Faculty",
      competencies: [
        { code: "6.1", description: "Employ qualified faculty sufficient in number to support the mission and the programs offered." },
        { code: "6.2.a", description: "Justify and document the qualifications of each faculty member for the courses they teach." },
      ],
    },
    {
      code: "7",
      name: "Institutional Planning and Effectiveness",
      competencies: [
        { code: "7.1", description: "Engage in ongoing, integrated, institution-wide, research-based planning and evaluation." },
        { code: "7.2", description: "Maintain a quality enhancement plan and demonstrate the capability to initiate and complete it." },
        { code: "7.3", description: "Identify expected outcomes and provide evidence of improvement for administrative and academic-support units." },
      ],
    },
    {
      code: "8",
      name: "Student Achievement",
      competencies: [
        { code: "8.1", description: "Identify, evaluate, and publish goals and outcomes for student achievement." },
        { code: "8.2.a", description: "Identify expected outcomes, assess achievement, and document improvement for student learning in educational programs." },
        { code: "8.2.b", description: "Identify expected outcomes and document improvement for student learning outcomes in general education." },
        { code: "8.2.c", description: "Identify expected outcomes and document improvement for academic and student-support services." },
      ],
    },
    {
      code: "9",
      name: "Educational Program Structure and Content",
      competencies: [
        { code: "9.1", description: "Ensure program content, rigor, and coherence appropriate to the degree or credential awarded." },
        { code: "9.2", description: "Ensure each program of study is coherent and culminates in the achievement of identified student learning outcomes." },
        { code: "9.3", description: "Require a general education component grounded in a coherent rationale for undergraduate degrees." },
      ],
    },
    {
      code: "10",
      name: "Educational Policies, Procedures, and Practices",
      competencies: [
        { code: "10.1", description: "Publish and apply academic policies consistent with principles of good educational practice." },
        { code: "10.7", description: "Award academic credit using policies consistent with commonly accepted practices and the credit defined." },
      ],
    },
    {
      code: "12",
      name: "Academic and Student Support Services",
      competencies: [
        { code: "12.1", description: "Provide appropriate academic and student support programs, services, and activities for student success." },
      ],
    },
  ],
};
