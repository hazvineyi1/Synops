// Curated, US-focused immigration reference data for the Immigration portal.
//
// IMPORTANT: This is general informational content, NOT legal advice. Filing
// fees and form editions change frequently (especially after the 2024 fee rule
// and 2025-2026 statutory changes), so every fee here is APPROXIMATE and must be
// verified on the official USCIS Fee Calculator. Scenarios are ILLUSTRATIVE
// examples, not real client records and not predictions of any outcome.

export const IMMIGRATION_DISCLAIMER =
  "This tool provides general information only and is NOT legal advice. It does not create an attorney-client relationship. US immigration forms, fees, and rules change often. Always verify current forms and fees on uscis.gov and consider consulting a licensed immigration attorney or a DOJ-accredited representative before filing. Example scenarios are illustrative only and do not predict or guarantee any outcome.";

export const USCIS_FEE_CALCULATOR_URL = "https://www.uscis.gov/feecalculator";

export type ImmigrationForm = {
  code: string;
  name: string;
  purpose: string;
  approxFee: string;
  category: string;
};

// Approximate base filing fees as of 2026. Verify exact amounts (and any extra
// surcharges, biometric, or annual fees) on the USCIS Fee Calculator.
export const IMMIGRATION_FORMS: ImmigrationForm[] = [
  {
    code: "I-130",
    name: "Petition for Alien Relative",
    purpose: "A US citizen or permanent resident uses this to establish a qualifying family relationship (spouse, parent, child, sibling) so the relative can later apply for a green card.",
    approxFee: "about $675 (paper) / $625 (online)",
    category: "Family",
  },
  {
    code: "I-485",
    name: "Application to Register Permanent Residence or Adjust Status",
    purpose: "Applies for a green card from inside the US once a visa is available (family-based, employment-based, asylee, etc.).",
    approxFee: "about $1,440 (plus biometrics in many cases)",
    category: "Green card",
  },
  {
    code: "I-765",
    name: "Application for Employment Authorization (EAD)",
    purpose: "Requests a work permit. Used by adjustment applicants, asylum seekers, students (OPT), TPS holders, and others. Fee varies a lot by category.",
    approxFee: "about $470 (online) / $520 (paper); some categories differ",
    category: "Work authorization",
  },
  {
    code: "I-131",
    name: "Application for Travel Document",
    purpose: "Requests advance parole (to travel while a green card application is pending), a reentry permit, or a refugee travel document.",
    approxFee: "about $630",
    category: "Travel",
  },
  {
    code: "I-140",
    name: "Immigrant Petition for Alien Worker",
    purpose: "An employer (or a self-petitioner in some categories) petitions for an employment-based green card.",
    approxFee: "about $715",
    category: "Employment",
  },
  {
    code: "I-129",
    name: "Petition for a Nonimmigrant Worker",
    purpose: "An employer petitions for a temporary work visa such as H-1B, L-1, O-1, or TN. Fees vary by classification and employer size, plus possible extra fees.",
    approxFee: "varies, roughly $1,015 and up plus surcharges",
    category: "Employment",
  },
  {
    code: "I-589",
    name: "Application for Asylum and for Withholding of Removal",
    purpose: "Requests asylum based on persecution or a well-founded fear of persecution. Recent law added filing and annual fees where it was previously free.",
    approxFee: "about $100 filing plus a $100 annual fee while pending (verify)",
    category: "Humanitarian",
  },
  {
    code: "N-400",
    name: "Application for Naturalization",
    purpose: "Applies for US citizenship, generally after holding a green card for 5 years (or 3 years if married to a US citizen).",
    approxFee: "about $760 (paper) / $710 (online)",
    category: "Citizenship",
  },
  {
    code: "I-90",
    name: "Application to Replace Permanent Resident Card",
    purpose: "Renews or replaces a green card that is expiring, lost, stolen, or contains errors.",
    approxFee: "about $465 (paper) / $415 (online)",
    category: "Green card",
  },
  {
    code: "I-751",
    name: "Petition to Remove Conditions on Residence",
    purpose: "Filed by conditional permanent residents (usually those married less than 2 years at approval) to get a 10-year green card.",
    approxFee: "about $750",
    category: "Green card",
  },
  {
    code: "I-539",
    name: "Application to Extend / Change Nonimmigrant Status",
    purpose: "Extends or changes a temporary status (for example B-1/B-2 visitors, F-2 or H-4 dependents).",
    approxFee: "about $420 (online) / $470 (paper)",
    category: "Status",
  },
  {
    code: "I-821",
    name: "Application for Temporary Protected Status (TPS)",
    purpose: "Requests TPS for nationals of designated countries facing unsafe conditions. Often filed with Form I-765 for work authorization.",
    approxFee: "about $50 initial application (plus possible biometrics and EAD fees)",
    category: "Humanitarian",
  },
];

export type ImmigrationScenario = {
  id: string;
  title: string;
  category: string;
  situation: string;
  likelyForms: string[];
  approxCost: string;
  typicalTimeline: string;
  whatHelps: string[];
  whatToWatch: string[];
};

// ILLUSTRATIVE examples only — composite situations written to show how common
// cases typically proceed. Not real people, not legal advice, not predictions.
export const IMMIGRATION_SCENARIOS: ImmigrationScenario[] = [
  {
    id: "marriage-aos",
    title: "Marriage-based green card (spouse already in the US)",
    category: "Family",
    situation: "Someone married to a US citizen is living in the US and wants to become a permanent resident without leaving the country.",
    likelyForms: ["I-130", "I-485", "I-765", "I-131"],
    approxCost: "roughly $1,500-$2,000 in filing fees combined (verify on the USCIS calculator)",
    typicalTimeline: "often about 8-14 months to the green card, varying by field office",
    whatHelps: [
      "Strong proof the marriage is genuine (joint lease/finances, photos over time, affidavits)",
      "Filing the I-130 and I-485 together (concurrent filing) when eligible",
      "Keeping copies of everything and responding to any RFE promptly",
    ],
    whatToWatch: [
      "Traveling abroad before advance parole is approved can abandon the I-485",
      "Gaps or inconsistencies in the relationship evidence",
      "Any prior immigration violations or overstays - get advice first",
    ],
  },
  {
    id: "naturalization",
    title: "Applying for US citizenship after 5 years as a green card holder",
    category: "Citizenship",
    situation: "A lawful permanent resident has held a green card for 5+ years, meets the physical-presence requirements, and wants to naturalize.",
    likelyForms: ["N-400"],
    approxCost: "about $710-$760 (verify; fee waivers exist for those who qualify)",
    typicalTimeline: "often about 6-12 months from filing to the oath ceremony",
    whatHelps: [
      "Continuous residence and not being outside the US for long trips",
      "Studying the civics test questions early",
      "Clean, well-documented tax and selective-service history",
    ],
    whatToWatch: [
      "Long absences (6+ months) can break continuous residence",
      "Any arrests or unpaid taxes should be reviewed with an attorney first",
    ],
  },
  {
    id: "employment-gc",
    title: "Employer-sponsored green card for a skilled worker",
    category: "Employment",
    situation: "A professional on a work visa (for example H-1B) has an employer willing to sponsor them for a permanent (green card) position.",
    likelyForms: ["I-140", "I-485"],
    approxCost: "roughly $2,000+ in USCIS fees (often employer-paid), plus possible PERM costs",
    typicalTimeline: "varies widely by category and country of birth - months to several years due to visa backlogs",
    whatHelps: [
      "An employer experienced with PERM and immigrant petitions",
      "Maintaining valid status throughout the process",
      "Tracking the visa bulletin priority dates",
    ],
    whatToWatch: [
      "Country-specific backlogs can add years before I-485 is possible",
      "Changing jobs mid-process has rules (portability) - get advice",
    ],
  },
  {
    id: "asylum",
    title: "Seeking asylum after arriving in the US",
    category: "Humanitarian",
    situation: "Someone fears persecution in their home country and wants to apply for asylum, plus a work permit while the case is pending.",
    likelyForms: ["I-589", "I-765"],
    approxCost: "I-589 now has filing and annual fees (verify); EAD fee varies by category",
    typicalTimeline: "highly variable - work permit eligibility has waiting periods and cases can take years",
    whatHelps: [
      "Filing within one year of arrival (there are limited exceptions)",
      "Detailed, consistent personal declaration and supporting evidence",
      "Working with an attorney or accredited representative - asylum is complex",
    ],
    whatToWatch: [
      "Missing the one-year deadline without an exception can bar the claim",
      "Inconsistencies between the application and testimony",
    ],
  },
  {
    id: "student-opt",
    title: "F-1 student getting work authorization (OPT)",
    category: "Work authorization",
    situation: "An international student on an F-1 visa wants to work in their field after graduation using Optional Practical Training.",
    likelyForms: ["I-765"],
    approxCost: "about $470-$520 for the EAD (verify)",
    typicalTimeline: "often about 2-4 months to receive the work permit",
    whatHelps: [
      "Getting the I-20 OPT recommendation from the school's DSO first",
      "Applying within the allowed filing window",
      "Tracking unemployment days once OPT starts",
    ],
    whatToWatch: [
      "Filing outside the eligibility window leads to denial",
      "Working before the EAD is approved is not allowed",
    ],
  },
  {
    id: "gc-renewal",
    title: "Renewing an expiring green card",
    category: "Green card",
    situation: "A permanent resident's 10-year green card is about to expire and they need to renew it.",
    likelyForms: ["I-90"],
    approxCost: "about $415-$465 (verify)",
    typicalTimeline: "often a few months; a receipt notice can extend the current card while waiting",
    whatHelps: [
      "Filing a few months before expiration",
      "Keeping the receipt notice, which usually extends card validity",
    ],
    whatToWatch: [
      "Conditional (2-year) cards use Form I-751, not I-90",
      "If you are eligible for citizenship, naturalizing may be a better path",
    ],
  },
];
