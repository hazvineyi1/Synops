/**
 * K-12 demo persona registry (frontend, keyed by the fixed demo email).
 *
 * The real pedagogical accommodations live on the user record (drive the AI tutor + the supports
 * panel). THIS file holds the demo *presentation* config that isn't stored on the user: grade band,
 * the challenge story, layout scale, high-contrast / calm / gamified flags, brand accent, and the
 * default language. Everything is derived from the signed-in learner's email, so no schema change is
 * needed. Only the six synthetic K-12 demo learners are listed here.
 */
export type GradeBand = "early" | "elementary" | "middle" | "high";

export interface K12Persona {
  key: string;              // short key used by /auth/demo-login (persona field)
  email: string;
  first: string; name: string;
  grade: number; gradeLabel: string; band: GradeBand;
  subject: string; subjectEmoji: string;
  challenge: string;        // short label, e.g. "Autism"
  challengeLong: string;    // the one-line story a visitor reads
  learningStyleLabel: string;
  accent: string;           // hex accent for this persona's card
  avatarBg: string;         // avatar circle color
  rootPx: number;           // base font-size applied app-wide when signed in (bigger = younger / low-vision)
  highContrast: boolean;    // low-vision: crisp dark-on-white, thicker focus
  calm: boolean;            // autism: muted, predictable, low-stimulation accents
  gamified: boolean;        // show the gamification suite
  autismMode: boolean;      // extra: token board + visual schedule
  defaultLang?: string;     // e.g. "es" for the Spanish-speaking learner
  supports: string;         // what's turned on, in plain words
}

export const K12_PERSONAS: K12Persona[] = [
  {
    key: "sofia", email: "sofia.k12@synops-demo.test", first: "Sofía", name: "Sofía Ramírez",
    grade: 3, gradeLabel: "Grade 3", band: "early", subject: "Reading", subjectEmoji: "📚",
    challenge: "English learner", challengeLong: "A native Spanish speaker learning to read in English.",
    learningStyleLabel: "Visual learner",
    accent: "#0D9488", avatarBg: "#0D9488", rootPx: 20, highContrast: false, calm: false, gamified: true, autismMode: false, defaultLang: "es",
    supports: "Spanish interface + bilingual read-aloud, simpler wording, big friendly text, and one idea at a time.",
  },
  {
    key: "aiden", email: "aiden.k12@synops-demo.test", first: "Aiden", name: "Aiden Walsh",
    grade: 4, gradeLabel: "Grade 4", band: "elementary", subject: "Math", subjectEmoji: "🎯",
    challenge: "Autism", challengeLong: "Autistic; thrives on predictable structure, clear steps, and rewards.",
    learningStyleLabel: "Hands-on learner",
    accent: "#7C3AED", avatarBg: "#7C3AED", rootPx: 18, highContrast: false, calm: true, gamified: true, autismMode: true,
    supports: "A visual schedule, a star/token board, one predictable step at a time, literal language, and extra thinking time.",
  },
  {
    key: "maya", email: "maya.k12@synops-demo.test", first: "Maya", name: "Maya Chen",
    grade: 6, gradeLabel: "Grade 6", band: "middle", subject: "Math", subjectEmoji: "➗",
    challenge: "On-track", challengeLong: "A confident, on-track student — the baseline experience.",
    learningStyleLabel: "Reading/writing learner",
    accent: "#4F46E5", avatarBg: "#4F46E5", rootPx: 16, highContrast: false, calm: false, gamified: true, autismMode: false,
    supports: "The standard middle-school experience: balanced pacing, an AI tutor, quizzes, and earned badges.",
  },
  {
    key: "leo", email: "leo.k12@synops-demo.test", first: "Leo", name: "Leo Rivera",
    grade: 6, gradeLabel: "Grade 6", band: "middle", subject: "Science", subjectEmoji: "🌿",
    challenge: "Dyslexia + ADHD", challengeLong: "Bright and curious; reading is hard and focus comes in bursts.",
    learningStyleLabel: "Auditory learner",
    accent: "#D97706", avatarBg: "#D97706", rootPx: 16, highContrast: false, calm: false, gamified: true, autismMode: false,
    supports: "Read-aloud, an easy-reading font toggle, one idea at a time, extra time, and a tutor that keeps steps short.",
  },
  {
    key: "jordan", email: "jordan.k12@synops-demo.test", first: "Jordan", name: "Jordan Bell",
    grade: 8, gradeLabel: "Grade 8", band: "middle", subject: "Writing", subjectEmoji: "✍️",
    challenge: "Dysgraphia", challengeLong: "Strong ideas, but writing by hand is slow and tiring.",
    learningStyleLabel: "Auditory learner",
    accent: "#2563EB", avatarBg: "#2563EB", rootPx: 16, highContrast: false, calm: false, gamified: true, autismMode: false,
    supports: "Speak-to-write (voice) responses, extended time, scaffolded steps, and read-aloud for every prompt.",
  },
  {
    key: "emma", email: "emma.k12@synops-demo.test", first: "Emma", name: "Emma Novak",
    grade: 11, gradeLabel: "Grade 11", band: "high", subject: "Algebra", subjectEmoji: "📐",
    challenge: "Low vision + dyscalculia", challengeLong: "Analytical, aiming for college; needs large, high-contrast, concrete math.",
    learningStyleLabel: "Visual learner",
    accent: "#111827", avatarBg: "#111827", rootPx: 19, highContrast: true, calm: false, gamified: false, autismMode: false,
    supports: "Large high-contrast text, one step shown at a time, concrete real-world examples, and extra time.",
  },
];

export function personaByEmail(email?: string | null): K12Persona | null {
  if (!email) return null;
  const e = email.toLowerCase();
  return K12_PERSONAS.find((p) => p.email === e) ?? null;
}

export function isK12DemoEmail(email?: string | null): boolean {
  return !!email && email.toLowerCase().includes(".k12@synops-demo.test");
}
