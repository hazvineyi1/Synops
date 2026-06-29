// AACSB reference dataset.
//
// AACSB accredits business programs against the 2020 Guiding Principles and
// Standards for Business Accreditation: nine standards grouped into three
// sections. The descriptions below are concise paraphrases authored for this
// product, not verbatim copies of AACSB's copyrighted standards text. They are
// seeded as global reference data so a tenant can map curriculum outcomes to the
// learner-success standards (and reference the broader set).

import type { AccreditorFrameworkSeed } from "./ccne";

export const AACSB_FRAMEWORK: AccreditorFrameworkSeed = {
  name: "AACSB Business Accreditation Standards (2020)",
  acronym: "AACSB",
  frameworkType: "accreditor",
  description:
    "Business program accreditation aligned to the AACSB 2020 standards (nine standards across three sections).",
  domains: [
    {
      code: "1",
      name: "Strategic Management and Innovation",
      competencies: [
        { code: "1", description: "Maintain a current, mission-driven strategic plan with measurable outcomes and evidence of innovation." },
        { code: "2", description: "Secure physical, virtual, and financial resources sufficient to support the mission and strategy." },
        { code: "3", description: "Maintain sufficient, qualified faculty and professional staff aligned to the mission and programs." },
      ],
    },
    {
      code: "2",
      name: "Learner Success",
      competencies: [
        { code: "4", description: "Deliver current, relevant, and well-structured curricula that develop the competencies each program promises." },
        { code: "5", description: "Operate a systematic assurance-of-learning process that assesses learning outcomes and drives improvement." },
        { code: "6", description: "Support learner recruitment, progression, and successful program completion." },
        { code: "7", description: "Ensure high-quality, continuously improving teaching effectiveness and impact." },
      ],
    },
    {
      code: "3",
      name: "Thought Leadership, Engagement, and Societal Impact",
      competencies: [
        { code: "8", description: "Produce intellectual contributions that advance theory, practice, and teaching in the discipline." },
        { code: "9", description: "Engage stakeholders and demonstrate positive, measurable societal impact." },
      ],
    },
  ],
};
