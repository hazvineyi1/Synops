/*
 * The MRB Framework for Advanced Leadership Practice, v2.1 (received 15 Oct 2026), as data.
 *
 * MRB owns this framework. It is loaded verbatim so the Practice Hub can tag credentials, practice areas
 * and evidence to the 12 Core Competencies. Each credential has ONE primary competency and may make a
 * secondary contribution to others. Practice areas are programme-specific groupings of credentials;
 * ZIMBABWE_PROGRAMME is the set Cris proposed on 15 Oct 2026 and is seeded as a DRAFT until MRB confirms
 * the final list and which credentials are mandatory.
 *
 * Design principle (framework v2.1): no individual is expected to demonstrate all 12 competencies;
 * teams and organisations develop the full range collectively. Never present the 12 as a per-candidate
 * checklist.
 */

export type FrameworkCompetency = {
  num: number;
  code: string;
  title: string;
  definition: string;
  primary: string[]; // credentials whose primary competency this is
  secondary: string[]; // credentials that also contribute here
};

export const FRAMEWORK_VERSION = "2.1";

export const FRAMEWORK_COMPETENCIES: FrameworkCompetency[] = [
  {
    "num": 1,
    "code": "RESPONSIBLE-ACCOUNTABILITY",
    "title": "Responsible Accountability",
    "definition": "Accept responsibility for the consequences of leadership decisions for the organisation, its stakeholders, communities and wider society. Welcome challenge, provide honest explanations for actions, and work to restore trust, relationships and social harmony when problems arise rather than focusing solely on blame.",
    "primary": [
      "Accountability",
      "Reporting",
      "Performance and Resource Management",
      "Board Performance"
    ],
    "secondary": [
      "Ethical Leadership",
      "Governance Ethics",
      "Governance Decision-Making",
      "Decision-Making",
      "Financial Stewardship",
      "Enhancing Psychological Safety",
      "Personal Values",
      "Trust",
      "Legal Responsibilities"
    ]
  },
  {
    "num": 2,
    "code": "ADAPTIVE-STEWARDSHIP",
    "title": "Adaptive Stewardship",
    "definition": "Adjusting leadership approaches and responses, priorities and actions in response to changing circumstances and emerging challenges, while protecting the long-term wellbeing of people, communities and the environment. Make decisions that balance present needs with future sustainability.",
    "primary": [
      "Leading Through Turbulence",
      "Sustainability",
      "Strategic Thinking",
      "Budgeting and Forecasting",
      "System Financing",
      "Financial Stewardship"
    ],
    "secondary": [
      "Leading Organisational Change",
      "Responsive Decision-Making",
      "Innovation and Improvement",
      "Systems Leadership",
      "Organisational Design",
      "Governance Decision-Making",
      "Social Impact Analysis",
      "Impact Management",
      "Decision-Making"
    ]
  },
  {
    "num": 3,
    "code": "RESILIENCE-AND-COLLECTIVE-CONFIDENCE",
    "title": "Resilience and Collective Confidence",
    "definition": "Maintaining effectiveness and protecting wellbeing through sustained pressure, setbacks and adversity, while strengthening the confidence, capability and resilience of colleagues and partners. Build environments in which others are able to flourish during adversity.",
    "primary": [
      "Managing Wellbeing",
      "Transformational Leadership",
      "Building Team Functions"
    ],
    "secondary": [
      "Leading Through Turbulence",
      "Emotional Intelligence",
      "Developing Others",
      "Enhancing Psychological Safety",
      "Trust",
      "Servant Leadership",
      "Team Formation",
      "Professional Development",
      "Managing Organisational Values"
    ]
  },
  {
    "num": 4,
    "code": "RELATIONSHIP-AND-COMMUNITY-BUILDING",
    "title": "Relationship and Community Building",
    "definition": "Develop trusting relationships and others across professional, organisational and community boundaries. Clarify roles, encourage mutual respect and strengthen collaboration through shared responsibilities and reciprocal support.",
    "primary": [
      "Team Formation",
      "Reviewing Team Roles",
      "Trust",
      "Collaborative Working",
      "Agreeing Team Objectives"
    ],
    "secondary": [
      "Inter-Personal Skills",
      "Communication",
      "Developing Others",
      "Inter-Group Working",
      "Stakeholder Engagement",
      "Co-Production",
      "Servant Leadership",
      "Enhancing Psychological Safety",
      "Emotional Intelligence",
      "Building Team Functions"
    ]
  },
  {
    "num": 5,
    "code": "HUMAN-CENTRED-LEADERSHIP",
    "title": "Human-Centred Leadership",
    "definition": "Lead with humility, dignity and compassion. Demonstrate organisational values through everyday behaviour while recognising that people are members of families and communities before they are employees or customers. Decisions should respect the whole person rather than only their organisational role.",
    "primary": [
      "Servant Leadership",
      "Emotional Intelligence",
      "Managing Organisational Values"
    ],
    "secondary": [
      "Ethical Leadership",
      "Personal Values",
      "Managing Wellbeing",
      "Inter-Personal Skills",
      "Developing Others",
      "Enhancing Psychological Safety",
      "Trust",
      "Co-Production",
      "Ethics",
      "Stakeholder Engagement"
    ]
  },
  {
    "num": 6,
    "code": "REFLECTION-AND-PRACTICE-LEARNING",
    "title": "Reflection and Practice Learning",
    "definition": "Regularly examine personal decisions and behaviours through structured reflection. Participate actively in peer review and use evidence, dialogue and feedback to improve individual and collective practice.",
    "primary": [
      "Reflexivity",
      "Critical Thinking",
      "Evidence-Informed Management",
      "Use of Artificial Intelligence"
    ],
    "secondary": [
      "Professional Development",
      "Developing Others",
      "Decision-Making",
      "Innovation and Improvement",
      "Social Impact Analysis",
      "Impact Management",
      "Process Improvement",
      "Organisational Performance",
      "Personal Values",
      "Board Performance"
    ]
  },
  {
    "num": 7,
    "code": "STAKEHOLDER-CITIZENSHIP",
    "title": "Stakeholder Citizenship",
    "definition": "Engage openly with colleagues, service users, communities, partners and other stakeholders to understand their experiences, obligations and aspirations. Move beyond stakeholder management towards genuine citizenship and belonging within the communities served.",
    "primary": [
      "Stakeholder Engagement",
      "Co-Production",
      "Responsive Decision-Making"
    ],
    "secondary": [
      "Collaborative Working",
      "Systems Leadership",
      "Social Value Action",
      "Social Impact Analysis",
      "Impact Management",
      "Inter-Group Working",
      "Communication",
      "Inter-Personal Skills",
      "Ethical Leadership",
      "Sustainability",
      "System Financing"
    ]
  },
  {
    "num": 8,
    "code": "RESTORATIVE-ENGAGEMENT",
    "title": "Restorative Engagement",
    "definition": "Facilitate respectful conversations that improve understanding, rebuild trust and strengthen relationships where conflict or misunderstanding exists. Demonstrate the ability to host constructive dialogue that promotes reconciliation, learning and shared purpose rather than simply assigning fault.",
    "primary": [
      "Communication",
      "Inter-Personal Skills",
      "Enhancing Psychological Safety",
      "Inter-Group Working"
    ],
    "secondary": [
      "Trust",
      "Emotional Intelligence",
      "Ethical Leadership",
      "Servant Leadership",
      "Collaborative Working",
      "Stakeholder Engagement",
      "Reviewing Team Roles",
      "Co-Production",
      "Accountability",
      "Team Formation"
    ]
  },
  {
    "num": 9,
    "code": "COLLABORATIVE-INNOVATION",
    "title": "Collaborative Innovation",
    "definition": "Generate improvements by integrating evidence, evaluation, lived experience and community knowledge. Encourage innovation that enhances organisational performance while increasing social value and long-term community wellbeing.",
    "primary": [
      "Innovation and Improvement",
      "Process Improvement",
      "Social Value Action",
      "Social Impact Analysis",
      "Impact Management",
      "Organisational Performance"
    ],
    "secondary": [
      "Co-Production",
      "Evidence-Informed Management",
      "Collaborative Working",
      "Systems Leadership",
      "Leading Organisational Change",
      "Use of Artificial Intelligence",
      "Strategic Thinking",
      "Responsive Decision-Making",
      "Stakeholder Engagement",
      "Organisational Design"
    ]
  },
  {
    "num": 10,
    "code": "PROFESSIONAL-INFLUENCE",
    "title": "Professional Influence",
    "definition": "Provide expert guidance across professional and organisational boundaries. Support colleagues to improve quality, reduce unnecessary variation, share learning and build capability throughout the wider system.",
    "primary": [
      "Developing Others",
      "Systems Leadership",
      "Leadership for Directors",
      "Leading Organisational Change",
      "Organisational Design"
    ],
    "secondary": [
      "Communication",
      "Inter-Personal Skills",
      "Transformational Leadership",
      "Inter-Group Working",
      "Stakeholder Engagement",
      "Collaborative Working",
      "Evidence-Informed Management",
      "Strategic Thinking",
      "Team Formation",
      "Innovation and Improvement",
      "Board Performance"
    ]
  },
  {
    "num": 11,
    "code": "ETHICAL-JUDGEMENT",
    "title": "Ethical Judgement",
    "definition": "Recognise ethical issues and exercise sound judgement within legal, ethical and professional frameworks when values, interests or responsibilities conflict. Consider how decisions affect individuals, communities, society and future generations.",
    "primary": [
      "Ethics",
      "Ethical Leadership",
      "Governance Ethics",
      "Legal Responsibilities",
      "Governance Decision-Making",
      "Decision-Making"
    ],
    "secondary": [
      "Personal Values",
      "Accountability",
      "Financial Stewardship",
      "Sustainability",
      "Responsive Decision-Making",
      "Managing Organisational Values",
      "Leadership for Directors",
      "Strategic Thinking",
      "Performance and Resource Management",
      "Stakeholder Engagement"
    ]
  },
  {
    "num": 12,
    "code": "PERSONAL-GROWTH-AND-SELF-MASTERY",
    "title": "Personal Growth and Self-Mastery",
    "definition": "Demonstrate self-awareness, humility and a commitment to lifelong learning. Continually develop personal capabilities through reflection, evidence, feedback and engagement with diverse perspectives, recognising that leadership maturity develops through relationships and experience.",
    "primary": [
      "Professional Development",
      "Time Management",
      "Personal Values"
    ],
    "secondary": [
      "Reflexivity",
      "Managing Wellbeing",
      "Emotional Intelligence",
      "Critical Thinking",
      "Use of Artificial Intelligence",
      "Communication",
      "Inter-Personal Skills",
      "Decision-Making",
      "Ethics",
      "Developing Others"
    ]
  }
];

/**
 * Existing Practice Hub credentials (seeded Aug 2026) that correspond to framework credentials. Their
 * codes and candidate data are kept; they are simply linked to the framework name.
 */
export const LEGACY_CODE_TO_FRAMEWORK: Record<string, string> = {
  "ETHICAL-LEADERSHIP": "Ethical Leadership",
  "TEAM-FORMATION": "Team Formation",
  "SERVANT-LEADERSHIP": "Servant Leadership",
  "TRANSFORMATIONAL-LEADERSHIP": "Transformational Leadership",
  "SOCIAL-VALUE-LEADERSHIP": "Social Value Action",
  "LEADING-CHANGE": "Leading Organisational Change",
};

export type ProgrammeArea = { code: string; title: string; credentials: string[] };

/** Open questions on the Zimbabwe list, shown to staff beside the affected credential. */
export const ZIMBABWE_NOTES: Record<string, string> = {
  "Inter-Group Working": "Listed as \"Inter-Team Working\" in the 15 Oct email; framework v2.1 names it Inter-Group Working. Awaiting MRB confirmation.",
};

export const ZIMBABWE_PROGRAMME = {
  code: "zimbabwe-2027",
  title: "Advanced Leadership Programme, Zimbabwe (proposed)",
  notes: "Proposed by MRB on 15 Oct 2026: 7 practice areas. Mandatory and new credentials were marked in italics in the email and did not survive; flags are unset until MRB confirms. 28 entries, 25 distinct credentials (Accountability, Governance Ethics and Stakeholder Engagement each sit in two areas).",
  areas: [
    {
      "code": "ethical-leadership-and-accountability",
      "title": "Ethical leadership and accountability",
      "credentials": [
        "Ethical Leadership",
        "Ethics",
        "Accountability",
        "Governance Ethics"
      ]
    },
    {
      "code": "leading-through-turbulence",
      "title": "Leading through turbulence",
      "credentials": [
        "Leading Through Turbulence",
        "Decision-Making",
        "Responsive Decision-Making"
      ]
    },
    {
      "code": "strategic-adaptation-and-innovation",
      "title": "Strategic adaptation and innovation",
      "credentials": [
        "Strategic Thinking",
        "Innovation and Improvement",
        "Evidence-Informed Management",
        "Use of Artificial Intelligence"
      ]
    },
    {
      "code": "engagement-voice-and-consensus",
      "title": "Engagement, voice and consensus",
      "credentials": [
        "Communication",
        "Enhancing Psychological Safety",
        "Stakeholder Engagement",
        "Co-Production",
        "Trust"
      ]
    },
    {
      "code": "developing-people-and-future-leaders",
      "title": "Developing people and future leaders",
      "credentials": [
        "Developing Others",
        "Servant Leadership",
        "Transformational Leadership"
      ]
    },
    {
      "code": "navigating-systems-and-stakeholders",
      "title": "Navigating systems and stakeholders",
      "credentials": [
        "Systems Leadership",
        "Stakeholder Engagement",
        "Collaborative Working",
        "Inter-Group Working"
      ]
    },
    {
      "code": "governance-and-institution-building",
      "title": "Governance and institution-building",
      "credentials": [
        "Accountability",
        "Governance Decision-Making",
        "Governance Ethics",
        "Organisational Design",
        "Leadership for Directors"
      ]
    }
  ],
};
