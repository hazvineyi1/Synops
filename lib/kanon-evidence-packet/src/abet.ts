// ABET (EAC) reference dataset.
//
// ABET's Engineering Accreditation Commission accredits engineering programs.
// Criterion 3 defines seven Student Outcomes (1)-(7) that graduates must attain
// (2025-2026 cycle). The descriptions below are concise paraphrases authored for
// this product, not verbatim copies of ABET's copyrighted criteria text. They are
// seeded as global reference data so a tenant can map curriculum outcomes to ABET
// student outcomes.

import type { AccreditorFrameworkSeed } from "./ccne";

export const ABET_FRAMEWORK: AccreditorFrameworkSeed = {
  name: "ABET Engineering Accreditation Commission",
  acronym: "ABET",
  frameworkType: "accreditor",
  description:
    "Engineering program accreditation aligned to ABET EAC Criterion 3 Student Outcomes (2025-2026).",
  domains: [
    {
      code: "3",
      name: "Student Outcomes (Criterion 3)",
      competencies: [
        { code: "1", description: "Identify, formulate, and solve complex engineering problems by applying principles of engineering, science, and mathematics." },
        { code: "2", description: "Apply engineering design to produce solutions that meet specified needs while accounting for public health, safety, and welfare and for global, cultural, social, environmental, and economic factors." },
        { code: "3", description: "Communicate effectively with a range of audiences." },
        { code: "4", description: "Recognize ethical and professional responsibilities and make informed judgments that weigh the global, economic, environmental, and societal impact of engineering solutions." },
        { code: "5", description: "Function effectively on a team that provides leadership, fosters a collaborative and inclusive environment, sets goals, plans tasks, and meets objectives." },
        { code: "6", description: "Develop and conduct appropriate experimentation, analyze and interpret data, and use engineering judgment to draw conclusions." },
        { code: "7", description: "Acquire and apply new knowledge as needed using appropriate learning strategies." },
      ],
    },
  ],
};
