export type DemoLevel = "elementary" | "secondary" | "higher";

export type DemoSkill =
  | "Main idea"
  | "Inference"
  | "Vocabulary in context"
  | "Evaluate argument";

export interface DemoItem {
  id: string;
  level: DemoLevel;
  difficulty: number; // 1 (easiest) .. 5 (hardest)
  skill: DemoSkill;
  passage: string;
  question: string;
  options: string[];
  correctIndex: number;
  hint: string;
}

export const DEMO_LEVELS: DemoLevel[] = ["elementary", "secondary", "higher"];

export const DEMO_LEVEL_LABELS: Record<DemoLevel, string> = {
  elementary: "Elementary",
  secondary: "Secondary",
  higher: "Higher Education",
};

export const DEMO_SKILLS: DemoSkill[] = [
  "Main idea",
  "Inference",
  "Vocabulary in context",
  "Evaluate argument",
];

/**
 * One unified, institution-agnostic item bank for the public adaptive demo.
 * A single assessment draws across all four reading skills and the full
 * difficulty range (1 to 5), so one run shows the engine adapting to the
 * learner and capturing data across every area.
 *
 * The level tag is kept only to satisfy the persistence contract; the demo
 * presents a single adaptive track rather than separate level choices.
 */
const TRACK: DemoLevel = "secondary";

const BANK: DemoItem[] = [
  {
    id: "mi-1",
    level: TRACK,
    difficulty: 1,
    skill: "Main idea",
    passage:
      "A library started lending tools, not just books. Within a month, neighbors who had never met were sharing ladders and drills.",
    question: "What is the passage mostly about?",
    options: [
      "A library that lends tools and connects neighbors",
      "How to repair a leaking sink",
      "The history of printed books",
      "A store that sells power drills",
    ],
    correctIndex: 0,
    hint: "Focus on what the library changed and what happened next.",
  },
  {
    id: "vo-1",
    level: TRACK,
    difficulty: 1,
    skill: "Vocabulary in context",
    passage:
      "The trail was steep, so the guide set a gentle pace that even young children could keep.",
    question: 'As used here, the word "gentle" most nearly means',
    options: ["mild and easy", "loud", "expensive", "dangerous"],
    correctIndex: 0,
    hint: "What kind of pace would let young children keep up on a steep trail?",
  },
  {
    id: "in-1",
    level: TRACK,
    difficulty: 2,
    skill: "Inference",
    passage:
      "She glanced at the sky, slipped an umbrella into her bag, and traded her sandals for boots before heading out.",
    question: "What can you infer about the day ahead?",
    options: [
      "Rain is likely",
      "It will be hot and dry",
      "She is going to the beach",
      "It is the middle of the night",
    ],
    correctIndex: 0,
    hint: "Why pack an umbrella and boots?",
  },
  {
    id: "mi-2",
    level: TRACK,
    difficulty: 2,
    skill: "Main idea",
    passage:
      "The team shipped nothing new for a month. Instead they watched ten customers use the old product and fixed only what tripped them up.",
    question: "The main idea is that the team focused on",
    options: [
      "adding as many features as possible",
      "learning from real users before building more",
      "lowering the price",
      "hiring a larger staff",
    ],
    correctIndex: 1,
    hint: "What did the team do instead of shipping new things?",
  },
  {
    id: "vo-2",
    level: TRACK,
    difficulty: 3,
    skill: "Vocabulary in context",
    passage:
      "Funding was finite, so the lab backed the one experiment most likely to pay off rather than chasing every idea.",
    question: 'As used here, "finite" most nearly means',
    options: ["limited", "wasted", "secret", "growing"],
    correctIndex: 0,
    hint: "Why would the funding force a single choice?",
  },
  {
    id: "in-2",
    level: TRACK,
    difficulty: 3,
    skill: "Inference",
    passage:
      "By closing time the bakery shelves were bare, and the owner was already mixing a double batch for the morning.",
    question: "What can you infer?",
    options: [
      "Business was slow",
      "Demand was strong",
      "The bakery is shutting down",
      "The owner dislikes baking",
    ],
    correctIndex: 1,
    hint: "Bare shelves plus a double batch points to what?",
  },
  {
    id: "ar-1",
    level: TRACK,
    difficulty: 3,
    skill: "Evaluate argument",
    passage:
      "A manager says remote work hurt output because sales dipped last quarter. Sales also dipped at every competitor that stayed fully in the office.",
    question: "Which point most weakens the manager's claim?",
    options: [
      "Remote workers prefer flexible hours",
      "Office-based competitors saw the same dip",
      "The office has a pleasant view",
      "Sales reports are long to read",
    ],
    correctIndex: 1,
    hint: "If in-office rivals dipped too, was remote work really the cause?",
  },
  {
    id: "mi-3",
    level: TRACK,
    difficulty: 4,
    skill: "Main idea",
    passage:
      "The report fills pages with charts, but its real message is simple: customers leave over slow support, not over price.",
    question: "What is the main idea of the report?",
    options: [
      "Charts make a report more convincing",
      "Slow support, not price, drives customers away",
      "Prices should be raised",
      "Customers almost never leave",
    ],
    correctIndex: 1,
    hint: "Look past the charts to the reason customers leave.",
  },
  {
    id: "in-3",
    level: TRACK,
    difficulty: 4,
    skill: "Inference",
    passage:
      "The candidate answered every question fluently, yet asked none of her own and never once named the role.",
    question: "What can you reasonably infer?",
    options: [
      "She had researched the company deeply",
      "Her interest in this specific role may be limited",
      "She will certainly decline any offer",
      "She was overqualified for the job",
    ],
    correctIndex: 1,
    hint: "What does asking nothing and not naming the role suggest?",
  },
  {
    id: "ar-2",
    level: TRACK,
    difficulty: 4,
    skill: "Evaluate argument",
    passage:
      "An ad says its supplement boosts focus, pointing to users who scored higher on a test. Those users also slept eight hours for the first time that week.",
    question: "Which fact most undermines the ad's claim?",
    options: [
      "The test used multiple choice questions",
      "Better sleep could explain the higher scores",
      "The supplement tastes bitter",
      "The users were unpaid volunteers",
    ],
    correctIndex: 1,
    hint: "Could something other than the supplement explain the gains?",
  },
  {
    id: "vo-3",
    level: TRACK,
    difficulty: 5,
    skill: "Vocabulary in context",
    passage:
      "Her tone stayed measured even as the room grew heated, and that restraint, not her volume, won the vote.",
    question: 'As used here, "measured" most nearly means',
    options: ["calm and controlled", "counted with a ruler", "angry", "unsure"],
    correctIndex: 0,
    hint: "Contrast it with the heated room and her restraint.",
  },
  {
    id: "ar-3",
    level: TRACK,
    difficulty: 5,
    skill: "Evaluate argument",
    passage:
      "A study concludes a tutoring app raised grades. Students chose to use it freely, and the ones who did already studied more than those who skipped it.",
    question: "Which flaw most undermines the study's causal claim?",
    options: [
      "The app offered a free trial period",
      "Self-selected users already studied more, so the app may not be the cause",
      "Grades are difficult to define",
      "The study ran for a full year",
    ],
    correctIndex: 1,
    hint: "If motivated students opted in, can the app alone take the credit?",
  },
];

export function bankForLevel(_level: DemoLevel): DemoItem[] {
  // The demo runs a single unified adaptive track regardless of level.
  return [...BANK].sort((a, b) => a.difficulty - b.difficulty);
}

export function findItem(id: string): DemoItem | undefined {
  return BANK.find((item) => item.id === id);
}
