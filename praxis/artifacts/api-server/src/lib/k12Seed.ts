import { db } from "@workspace/db";
import {
  partnersTable, brandThemesTable, organisationsTable, usersTable,
  coursesTable, modulesTable, beatsTable, moduleReadingsTable,
  caseScenariosTable, interactiveActivitiesTable, discussionsTable, assignmentsTable,
  coursePartnerAssignmentsTable, enrolmentsTable, activitySubmissionsTable,
  orgClassesTable, orgClassCoursesTable, orgClassStaffTable, orgClassLearnersTable,
  beatProgressTable, credentialsTable,
  unitStandardsTable, unitStandardMappingsTable,
} from "@workspace/db";
import { eq, and, asc, inArray, ne, like } from "drizzle-orm";
import { hashPassword } from "../lib/auth";
import { PRIVACY_POLICY_VERSION } from "../lib/popia";
import { GAME_TEMPLATES, type Band } from "./gameTemplates";

/**
 * Public K-12 demo tenant "Synops Academy" — the investor/prospect link at
 * praxis.synops-consulting.com/k12. It showcases inclusive, adaptive, US-standards learning across
 * grade levels with SIX learner personas, each with a real challenge + the accommodations that help:
 *   - Sofía  · Grade 3  · Spanish-speaking English learner   (bilingual, playful, big text)
 *   - Aiden  · Grade 4  · autistic                            (gamified, predictable, token board)
 *   - Maya   · Grade 6  · on-track                            (balanced)
 *   - Leo    · Grade 6  · dyslexia + ADHD                     (read-aloud, easy-reading, chunked)
 *   - Jordan · Grade 8  · dysgraphia / slow processing        (speech-to-text, extended time)
 *   - Emma   · Grade 11 · low vision + dyscalculia            (high-contrast, large text, analytical)
 * Each persona has one grade-appropriate course of two comprehensive, fully-built lessons.
 * Idempotent: reuse-by-title / upsert, and it reconciles each learner's enrolments to their plan.
 */
const DEMO_SLUG = "synops-k12";
const ORG_NAME = "Synops Academy (K-12)";
const CLASS_NAME = "Synops Academy · 2026";
const DEMO_PASSWORD = "SynopsDemo123";

export const K12_PARTNER_SLUG = DEMO_SLUG;
export const K12_ADMIN_EMAIL = "teacher.k12@synops-demo.test";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

const BRAND = {
  displayName: "Synops Academy",
  primaryColor: "#4F46E5",   // indigo
  secondaryColor: "#FBF7EF", // warm paper
  accentColor: "#F59E0B",    // sunny amber
  logoUrl: null as string | null,
  faviconUrl: null as string | null,
  fontFamily: "Inter, system-ui, sans-serif",
  credentialTitle: "Synops Academy Badge",
  emailSenderName: "Synops Academy",
};

interface Std { code: string; title: string }
interface K12Module {
  title: string; outcome: string; hook: string;
  points: string[]; reading: string; minutes: number;
  standards: Std[]; quiz: { q: string; options: string[]; answer: number; img?: string }[];
  caseContext: string; caseOpening: string;
  game?: "choice" | "find" | "match" | "memory" | "puzzle" | "pair" | "sort";   // default "choice"; each lesson uses a different one
  video?: string;   // YouTube id/URL → adds a "Watch" step to the lesson
}
interface K12Persona {
  email: string; firstName: string; lastName: string;
  grade: number; gradeLabel: string;
  learningStyle: string; accommodations: string[];
  progressFraction: number;   // how far through their course to pre-fill
}
interface K12Course {
  title: string; subject: string; emoji: string; grade: number; gradeLabel: string;
  framework: string; intro: string; outcome: string; tags: string[];
  modules: K12Module[]; persona: K12Persona;
  lang?: string;   // "es" → games/instructions render in Spanish by default
}

// Early-reader "picture words" served as transparent cut-out PNGs by /api/kid-cutout (background
// removed once via remove.bg, cached; falls back to the original photo if no key is set). Absolute
// URLs because the quiz renders inside a srcdoc iframe where relative URLs don't resolve.
const CUTOUT_HOST = "https://praxis.synops-consulting.com";
const CUT = (w: string) => `${CUTOUT_HOST}/api/kid-cutout/${w}.png`;
const KID_PICS: Record<string, string> = {
  cat: CUT("cat"), dog: CUT("dog"), sun: CUT("sun"), hat: CUT("hat"),
  apple: CUT("apple"), ball: CUT("ball"), fish: CUT("fish"), tree: CUT("tree"),
};

// ── COURSES (one per persona; two comprehensive lessons each) ────────────────
const COURSES: K12Course[] = [
  // 0) MATEO · Grade 1 · just starting out (K-2 band) ─────────────────────────
  {
    title: "Grade 1 Reading Adventure", subject: "English Language Arts", emoji: "🔤", grade: 1, gradeLabel: "Grade 1",
    framework: "Common Core State Standards — Grade 1 Foundational Reading",
    intro: "A five-part reading adventure! Find first letters, read picture words, then spell them in a puzzle — look, tap, and earn stars.",
    outcome: "Recognize beginning letters, read common one-syllable words, and spell them.",
    tags: ["ela", "reading", "letters", "grade 1", "common core"],
    persona: { email: "mateo.k12@synops-demo.test", firstName: "Mateo", lastName: "Flores", grade: 1, gradeLabel: "Grade 1", learningStyle: "kinesthetic", accommodations: ["simplified_language", "concrete_examples", "chunked_content", "positive_reinforcement"], progressFraction: 0.15 },
    modules: [
      { title: "First letters: A B C D", outcome: "Find the first letter (A, B, C, D).", hook: "Apple starts with A! Ball starts with B!", minutes: 5,
        standards: [{ code: "CCSS.ELA-LITERACY.RF.1.1", title: "Demonstrate understanding of the organization and basic features of print" }],
        points: ["Every word starts with a letter", "Look at the picture, then find the first letter", "apple → A, ball → B, cat → C, dog → D"],
        reading: "Every word starts with a letter! **Apple** starts with **A**. **Ball** starts with **B**. **Cat** starts with **C**. **Dog** starts with **D**.\n\nLook at the picture, then tap the first letter. You're a letter detective! 🔎⭐",
        quiz: [
          { q: "Which letter does this word start with?", img: KID_PICS.apple, options: ["A", "E", "O", "S"], answer: 0 },
          { q: "Which letter does this word start with?", img: KID_PICS.ball, options: ["B", "D", "P", "R"], answer: 0 },
          { q: "Which letter does this word start with?", img: KID_PICS.cat, options: ["C", "O", "S", "G"], answer: 0 },
          { q: "Which letter does this word start with?", img: KID_PICS.dog, options: ["D", "B", "P", "O"], answer: 0 },
        ],
        caseContext: "", caseOpening: "" },
      { title: "First letters: F H S T", outcome: "Find the first letter (F, H, S, T).", hook: "Fish starts with F! Tree starts with T!", minutes: 5, game: "memory",
        standards: [{ code: "CCSS.ELA-LITERACY.RF.1.1", title: "Demonstrate understanding of the organization and basic features of print" }],
        points: ["More first letters", "fish → F, hat → H, sun → S, tree → T", "Look and tap the first letter"],
        reading: "More first letters! **Fish** starts with **F**. **Hat** starts with **H**. **Sun** starts with **S**. **Tree** starts with **T**.\n\nLook at the picture, then tap the first letter. Keep going, superstar! ⭐",
        quiz: [
          { q: "Which letter does this word start with?", img: KID_PICS.fish, options: ["F", "E", "T", "L"], answer: 0 },
          { q: "Which letter does this word start with?", img: KID_PICS.hat, options: ["H", "N", "M", "K"], answer: 0 },
          { q: "Which letter does this word start with?", img: KID_PICS.sun, options: ["S", "C", "Z", "E"], answer: 0 },
          { q: "Which letter does this word start with?", img: KID_PICS.tree, options: ["T", "F", "I", "L"], answer: 0 },
        ],
        caseContext: "", caseOpening: "" },
      { title: "Reading words: cat, dog, sun, hat", outcome: "Match a word to its picture.", hook: "See the picture, then tap the word that matches!", minutes: 5, game: "match",
        standards: [{ code: "CCSS.ELA-LITERACY.RF.1.3", title: "Know and apply grade-level phonics and word analysis skills in decoding words" }],
        points: ["Words name the things we see", "Look at the picture, then find the word", "You can read short words!"],
        reading: "Words name the things we see! A **cat**, a **dog**, the **sun**, a **hat**.\n\nLook at the picture, then tap the right word. You're reading! 📖⭐",
        quiz: [
          { q: "Which word matches this picture?", img: KID_PICS.cat, options: ["cat", "dog", "sun", "hat"], answer: 0 },
          { q: "Which word matches this picture?", img: KID_PICS.dog, options: ["dog", "log", "dig", "day"], answer: 0 },
          { q: "Which word matches this picture?", img: KID_PICS.sun, options: ["sun", "run", "six", "sit"], answer: 0 },
          { q: "Which word matches this picture?", img: KID_PICS.hat, options: ["hat", "ham", "hop", "cat"], answer: 0 },
        ],
        caseContext: "", caseOpening: "" },
      { title: "Reading words: apple, ball, fish, tree", outcome: "Read more picture words.", hook: "Read even more words — you're a reading star!", minutes: 5, game: "find",
        standards: [{ code: "CCSS.ELA-LITERACY.RF.1.3", title: "Know and apply grade-level phonics and word analysis skills in decoding words" }],
        points: ["More picture words", "Look at the picture, then find the word", "You're a reading star!"],
        reading: "More words to read! An **apple**, a **ball**, a **fish**, a **tree**.\n\nLook at the picture, then tap the right word. You're a reading star! 🌟",
        quiz: [
          { q: "Which word matches this picture?", img: KID_PICS.apple, options: ["apple", "ant", "arm", "ax"], answer: 0 },
          { q: "Which word matches this picture?", img: KID_PICS.ball, options: ["ball", "bell", "bat", "bus"], answer: 0 },
          { q: "Which word matches this picture?", img: KID_PICS.fish, options: ["fish", "fox", "fan", "fig"], answer: 0 },
          { q: "Which word matches this picture?", img: KID_PICS.tree, options: ["tree", "two", "toy", "top"], answer: 0 },
        ],
        caseContext: "", caseOpening: "" },
      { title: "Word Puzzle", outcome: "Spell the words you learned.", hook: "Now for a puzzle — build the words letter by letter!", minutes: 5, game: "puzzle",
        standards: [{ code: "CCSS.ELA-LITERACY.RF.1.3", title: "Know and apply grade-level phonics and word analysis skills in decoding words" }],
        points: ["Look at the picture", "Tap the letters in the right order", "Spell the whole word!"],
        reading: "Now for a puzzle! 🧩 Look at the picture, then tap the letters in the right order to spell the word. Take your time — you can do it! ⭐",
        quiz: [
          { q: "Spell the word", img: KID_PICS.cat, options: ["cat"], answer: 0 },
          { q: "Spell the word", img: KID_PICS.dog, options: ["dog"], answer: 0 },
          { q: "Spell the word", img: KID_PICS.sun, options: ["sun"], answer: 0 },
          { q: "Spell the word", img: KID_PICS.hat, options: ["hat"], answer: 0 },
        ],
        caseContext: "", caseOpening: "" },
    ],
  },
  // 1) SOFÍA · Grade 3 · Spanish-speaking English learner ─────────────────────
  {
    title: "Aventura de Lectura (Grado 3)", subject: "Lectura", emoji: "📚", grade: 3, gradeLabel: "Grade 3", lang: "es",
    framework: "Common Core State Standards — Grade 3 ELA/Literacy",
    intro: "¡Una aventura de lectura en español! En cada lección lees un texto corto y juegas de una forma distinta — clasificas ideas, unes palabras con su significado y usas pistas del contexto para descubrir palabras nuevas. Todo en español (o en inglés si prefieres).",
    outcome: "Encontrar la idea principal, aprender vocabulario y usar pistas del contexto.",
    tags: ["lectura", "español", "grade 3", "common core"],
    persona: { email: "sofia.k12@synops-demo.test", firstName: "Sofía", lastName: "Ramírez", grade: 3, gradeLabel: "Grade 3", learningStyle: "visual", accommodations: ["simplified_language", "concrete_examples", "scaffolded_questions", "positive_reinforcement", "chunked_content"], progressFraction: 0.15 },
    modules: [
      { title: "La idea principal", outcome: "Distinguir la idea principal de los detalles de un texto.",
        hook: "Un texto tiene UNA idea grande y muchos detalles pequeños. ¿Puedes separarlos?", minutes: 8, game: "sort",
        standards: [{ code: "CCSS.ELA-LITERACY.RI.3.2", title: "Determine the main idea; recount key details" }],
        points: ["La idea principal es de qué trata CASI todo el texto", "Los detalles son datos pequeños que apoyan la idea principal", "Un texto tiene una idea principal, pero muchos detalles"],
        reading: "Cuando lees, tu cerebro busca la **idea principal**: de qué trata *casi todo* el texto. Lo demás son **detalles** — datos pequeños que dan más información sobre esa idea.\n\nLee esto: *Los delfines son mamíferos marinos muy inteligentes. Usan sonidos para hablar entre ellos, nadan muy rápido y salen a la superficie para respirar aire.* La **idea principal** es que *los delfines son mamíferos muy inteligentes*. Que usen sonidos o que respiren aire son **detalles**.\n\nAhora otro: *Un volcán es una montaña que puede expulsar lava caliente. La lava es roca derretida, y algunos volcanes están escondidos bajo el mar.* ¿Cuál es la idea grande? *Un volcán puede expulsar lava.* Lo demás son detalles.\n\nEn el juego, lee cada tarjeta y decide: ¿es la **idea principal** o un **detalle**? 🕵️",
        quiz: [
          { q: "Los delfines son mamíferos marinos muy inteligentes.", options: ["Idea principal", "Detalle"], answer: 0 },
          { q: "Los delfines usan sonidos para hablar entre ellos.", options: ["Idea principal", "Detalle"], answer: 1 },
          { q: "Los delfines salen a la superficie para respirar aire.", options: ["Idea principal", "Detalle"], answer: 1 },
          { q: "Un volcán es una montaña que puede expulsar lava.", options: ["Idea principal", "Detalle"], answer: 0 },
          { q: "La lava es roca derretida.", options: ["Idea principal", "Detalle"], answer: 1 },
          { q: "Algunos volcanes están escondidos bajo el mar.", options: ["Idea principal", "Detalle"], answer: 1 },
        ],
        caseContext: "", caseOpening: "" },
      { title: "Vocabulario en contexto", outcome: "Unir palabras nuevas de tercer grado con su significado.",
        hook: "Palabras nuevas: veloz, enorme, frágil… ¿sabes qué significan?", minutes: 8, game: "pair",
        standards: [{ code: "CCSS.ELA-LITERACY.L.3.4", title: "Determine the meaning of words and phrases" }],
        points: ["Mientras más palabras conoces, mejor entiendes lo que lees", "Cada palabra tiene un significado exacto", "Une cada palabra con lo que significa"],
        reading: "Los buenos lectores conocen muchas palabras. Mientras más palabras sabes, mejor entiendes lo que lees. Aquí tienes palabras nuevas de tercer grado — fíjate cómo se usan en una oración.\n\nUn guepardo es **veloz**: corre muy rápido. Una ballena es **enorme**: es muy grande. Un vaso de vidrio es **frágil**: se rompe con facilidad. Un bombero es **valiente**: no siente miedo cuando ayuda. El sol es **brillante**: da mucha luz. Y una biblioteca es **silenciosa**: casi no hace ruido.\n\nEn el juego, une cada palabra con su significado. ¡Tú puedes! 📖⭐",
        quiz: [
          { q: "veloz", options: ["muy rápido"], answer: 0 },
          { q: "enorme", options: ["muy grande"], answer: 0 },
          { q: "frágil", options: ["que se rompe con facilidad"], answer: 0 },
          { q: "valiente", options: ["que no siente miedo"], answer: 0 },
          { q: "brillante", options: ["que da mucha luz"], answer: 0 },
          { q: "silencioso", options: ["que casi no hace ruido"], answer: 0 },
        ],
        caseContext: "", caseOpening: "" },
      { title: "Pistas del contexto", outcome: "Usar las palabras cercanas para descubrir una palabra nueva.",
        hook: "Lees una palabra que nunca has visto. ¿Te rindes? ¡Claro que no!", minutes: 8, game: "choice",
        standards: [{ code: "CCSS.ELA-LITERACY.L.3.4", title: "Determine the meaning of unknown words using context clues" }],
        points: ["Las pistas del contexto son las otras palabras cercanas", "Lee toda la oración, no solo la palabra difícil", "Adivina y luego revisa si tiene sentido"],
        reading: "¿Qué haces cuando encuentras una palabra que no conoces? ¡Te vuelves **detective de palabras** y buscas **pistas del contexto** — las otras palabras cercanas que te dan pistas de lo que significa!\n\nLee esto: *\"El perrito era tan **tímido** que se escondió detrás del sofá cuando llegaron las visitas.\"* Aunque no conozcas la palabra **tímido**, las pistas ayudan: se *escondió* cuando llegó gente. ¡Entonces tímido significa *penoso o asustado*! Lo resolviste sin diccionario.\n\nSiempre haz lo mismo: lee toda la oración, busca las pistas, adivina el significado y vuelve a leer para ver si tiene sentido. 🌟",
        quiz: [
          { q: "Las pistas del contexto son…", options: ["Las otras palabras cerca de la palabra difícil", "El número de página", "Solo los dibujos", "El título"], answer: 0 },
          { q: "\"La sopa estaba tan **sosa** que necesitaba sal.\" Sosa significa…", options: ["Muy picante", "Sin mucho sabor", "Muy caliente", "Congelada"], answer: 1 },
          { q: "\"El sendero era tan **empinado** que nos costó mucho subir.\" Empinado significa…", options: ["Muy plano", "Con mucha subida", "Muy corto", "Muy ancho"], answer: 1 },
          { q: "\"La niña estaba **agotada** después de correr todo el día.\" Agotada significa…", options: ["Muy cansada", "Muy contenta", "Con hambre", "Muy veloz"], answer: 0 },
          { q: "Cuando encuentras una palabra nueva, primero debes…", options: ["Saltar toda la página", "Leer toda la oración para buscar pistas", "Cerrar el libro", "Adivinar cualquier palabra"], answer: 1 },
          { q: "Después de adivinar el significado, debes…", options: ["Dejar de leer", "Releer para ver si tiene sentido", "Borrarlo", "No preguntarle a nadie"], answer: 1 },
        ],
        caseContext: "", caseOpening: "" },
    ],
  },
  // 2) AIDEN · Grade 4 · autistic (gamified, predictable) ─────────────────────
  {
    title: "Number Quest (Grade 4)", subject: "Mathematics", emoji: "🎯", grade: 4, gradeLabel: "Grade 4",
    framework: "Common Core State Standards — Grade 4 Mathematics",
    intro: "Welcome to Number Quest! Every lesson is a level. You'll earn stars for each step, follow a clear map, and always know exactly what comes next. Ready, steady — let's begin.",
    outcome: "Understand multiplication as equal groups and use arrays to find totals.",
    tags: ["math", "multiplication", "grade 4", "common core"],
    persona: { email: "aiden.k12@synops-demo.test", firstName: "Aiden", lastName: "Walsh", grade: 4, gradeLabel: "Grade 4", learningStyle: "kinesthetic", accommodations: ["predictable_structure", "chunked_content", "explicit_transitions", "positive_reinforcement", "literal_language", "extended_processing"], progressFraction: 0.5 },
    modules: [
      { title: "Level 1: Equal groups", outcome: "See multiplication as a number of equal groups.",
        hook: "4 baskets. 3 apples in each. How many apples — WITHOUT counting one by one?", minutes: 7,
        standards: [{ code: "CCSS.MATH.CONTENT.4.OA.A.1", title: "Interpret a multiplication equation as a comparison / equal groups" }],
        points: ["Multiplication is a fast way to add equal groups", "4 × 3 means 4 groups of 3", "The answer is called the product"],
        reading: "Multiplication is a superpower: it adds up **equal groups** fast.\n\nPicture **4 baskets**, and each basket has **3 apples**. You *could* count 1, 2, 3, 4, 5... but there's a faster way. That's **4 groups of 3**, which we write as **4 × 3**. It equals **12**. The answer has a name: the **product**.\n\nHere is the one rule to remember: the groups must be **equal** — the same size. 4 baskets of 3 apples works. 4 baskets with different amounts does NOT. \n\nStep 1: count the groups. Step 2: count how many in each group. Step 3: multiply. That's the whole quest for this level. You're ready. ⭐",
        quiz: [
          { q: "4 × 3 means…", options: ["4 plus 3", "4 groups of 3", "3 minus 4", "43"], answer: 1 },
          { q: "The answer to a multiplication problem is called the…", options: ["Sum", "Product", "Total groups", "Difference"], answer: 1 },
          { q: "5 bags with 2 marbles each is…", options: ["5 × 2 = 10", "5 + 2 = 7", "2 − 5", "52"], answer: 0 },
          { q: "For multiplication, the groups must be…", options: ["Different sizes", "Equal sizes", "Very big", "Empty"], answer: 1 },
        ],
        caseContext: "Aiden sees 3 plates with 4 cookies on each. He starts counting cookies one at a time. Coach him — with short, clear, literal steps and lots of encouragement — to see it as 3 groups of 4, i.e. 3 × 4 = 12. Keep each message to one small step.",
        caseOpening: "Step 1: How many plates are there? Just tell me that number." },
      { title: "Level 2: Arrays", outcome: "Use a rectangle array of rows and columns to find a total.",
        hook: "Chairs in 5 rows, 4 in each row. How many chairs?", minutes: 7,
        standards: [{ code: "CCSS.MATH.CONTENT.3.MD.C.7", title: "Relate area to multiplication using arrays of rows and columns" }],
        points: ["An array is objects lined up in rows and columns", "Rows × columns = the total", "Arrays make multiplication easy to SEE"],
        reading: "An **array** is a neat rectangle of things in **rows** and **columns**. It turns multiplication into a picture you can see.\n\nImagine a classroom with **5 rows** of chairs and **4 chairs in each row**. To find the total, multiply **rows × columns = 5 × 4 = 20** chairs. You don't have to count every chair — the array does the work.\n\nArrays are everywhere: eggs in a carton, windows on a building, tiles on a floor. Whenever things line up in even rows and columns, you can multiply. Step 1: count the rows. Step 2: count how many in each row. Step 3: multiply. Level complete! 🏆",
        quiz: [
          { q: "An array is…", options: ["A messy pile", "Objects in equal rows and columns", "One single object", "A number line"], answer: 1 },
          { q: "3 rows of 6 stickers is…", options: ["3 × 6 = 18", "3 + 6 = 9", "6 − 3", "36"], answer: 0 },
          { q: "To find the total in an array you multiply…", options: ["Rows × columns", "Rows + columns", "Rows − columns", "Just the rows"], answer: 0 },
          { q: "An egg carton with 2 rows of 6 has…", options: ["8 eggs", "12 eggs", "26 eggs", "4 eggs"], answer: 1 },
        ],
        caseContext: "Aiden looks at a 6-by-2 array of muffins (6 rows, 2 columns) and isn't sure how to count them fast. Guide him with clear, predictable one-step prompts to multiply 6 × 2 = 12, praising each correct step.",
        caseOpening: "First step: count the rows going down. How many rows do you see?" },
    ],
  },
  // 3) MAYA · Grade 6 · on-track ───────────────────────────────────────────────
  {
    title: "Math 6: Ratios & Rates", subject: "Mathematics", emoji: "➗", grade: 6, gradeLabel: "Grade 6",
    framework: "Common Core State Standards — Grade 6 Mathematics",
    intro: "Sixth-grade math describes the real world: how fast, how much, how many for how many. In two lessons you'll master ratios and rates using playlists, recipes, and road trips.",
    outcome: "Use ratios and unit rates to solve real-world problems.",
    tags: ["math", "ratios", "rates", "grade 6", "common core"],
    persona: { email: "maya.k12@synops-demo.test", firstName: "Maya", lastName: "Chen", grade: 6, gradeLabel: "Grade 6", learningStyle: "reading_writing", accommodations: [], progressFraction: 0.75 },
    modules: [
      { title: "Ratios and rates", outcome: "Describe a relationship with a ratio and find a unit rate.",
        hook: "Your playlist plays 3 songs every 12 minutes. How long for 10 songs?", minutes: 8,
        standards: [{ code: "CCSS.MATH.CONTENT.6.RP.A.1", title: "Understand the concept of a ratio and use ratio language" }, { code: "CCSS.MATH.CONTENT.6.RP.A.2", title: "Understand unit rate and use rate language" }],
        points: ["A ratio compares two amounts (3 songs to 12 minutes)", "A unit rate is 'per one' — 1 song every 4 minutes", "Divide to find a unit rate"],
        reading: "A **ratio** compares two quantities. If a playlist plays 3 songs every 12 minutes, the ratio of songs to minutes is 3 to 12 — written 3:12 or 3/12.\n\nA **unit rate** answers 'how much for exactly one?' Divide: 12 minutes ÷ 3 songs = **4 minutes per song**. Now any question is easy: 10 songs take 10 × 4 = 40 minutes.\n\nRates are everywhere — miles per hour, price per ounce, points per game. The move is always the same: set up the ratio, then divide to get the 'per one' rate. Once you have the unit rate, scaling up or down is just multiplication.",
        quiz: [
          { q: "A recipe uses 2 cups flour for 3 eggs. The ratio of flour to eggs is…", options: ["3:2", "2:3", "2:5", "6:1"], answer: 1 },
          { q: "150 miles on 5 gallons is a unit rate of…", options: ["30 mpg", "150 mpg", "5 mpg", "75 mpg"], answer: 0 },
          { q: "3 songs take 12 min. 9 songs take…", options: ["24 min", "27 min", "36 min", "40 min"], answer: 2 },
          { q: "Which is the SAME ratio as 4:6?", options: ["2:3", "6:4", "8:10", "4:12"], answer: 0 },
        ],
        caseContext: "A food truck sells 3 tacos for $5. A classmate says 9 tacos should be $15 and 12 tacos $20. Walk Maya through checking this with a unit rate and a ratio table, and where the reasoning could slip.",
        caseOpening: "Before we calculate — what stays the same no matter how many tacos you buy?" },
      { title: "Solving rate problems", outcome: "Use a ratio table or unit rate to solve a multi-step problem.",
        hook: "Which is the better buy: 12 oz for $3, or 20 oz for $4.60?", minutes: 9,
        standards: [{ code: "CCSS.MATH.CONTENT.6.RP.A.3", title: "Use ratio and rate reasoning to solve real-world problems" }],
        points: ["A ratio table scales both numbers together", "Compare unit rates to find the better deal", "Watch the units — dollars per ounce vs ounces per dollar"],
        reading: "Real problems reward organized thinking. A **ratio table** keeps two quantities in step: whatever you multiply the top by, you multiply the bottom by too.\n\nFor 'better buy' problems, find the **unit rate** for each option and compare. Option A: 12 oz for $3 → $3 ÷ 12 = **$0.25 per ounce**. Option B: 20 oz for $4.60 → $4.60 ÷ 20 = **$0.23 per ounce**. Option B is cheaper per ounce, so it's the better buy — even though it costs more total.\n\nThe key habit is watching your **units**. 'Dollars per ounce' and 'ounces per dollar' answer different questions. Decide which one you want, compute it for each choice, then compare.",
        quiz: [
          { q: "In a ratio table, if you double the top you must…", options: ["Halve the bottom", "Double the bottom", "Leave the bottom", "Add 2 to the bottom"], answer: 1 },
          { q: "12 oz for $3 is a unit price of…", options: ["$0.25/oz", "$4/oz", "$0.12/oz", "$3/oz"], answer: 0 },
          { q: "The better buy is usually the one with the…", options: ["Higher total price", "Lower price per unit", "Bigger package always", "Nicer label"], answer: 1 },
          { q: "To compare two deals fairly, compare their…", options: ["Colors", "Unit rates", "Brand names", "Total sizes only"], answer: 1 },
        ],
        caseContext: "Maya must choose between a 6-pack of juice for $4 and a 10-pack for $6.50. Coach her to compute price per juice for each and justify the better buy.",
        caseOpening: "What number would let you compare these two packs fairly?" },
    ],
  },
  // 4) LEO · Grade 6 · dyslexia + ADHD ─────────────────────────────────────────
  {
    title: "Science 6: Ecosystems", subject: "Science", emoji: "🌿", grade: 6, gradeLabel: "Grade 6",
    framework: "Next Generation Science Standards — Middle School Life Science",
    intro: "Every living thing is connected. In two short lessons you'll map how energy flows through a food web and see why changing one thing changes everything.",
    outcome: "Model how energy flows through an ecosystem and predict the effect of a change.",
    tags: ["science", "ecosystems", "food web", "grade 6", "ngss"],
    persona: { email: "leo.k12@synops-demo.test", firstName: "Leo", lastName: "Rivera", grade: 6, gradeLabel: "Grade 6", learningStyle: "auditory", accommodations: ["simplified_language", "chunked_content", "scaffolded_questions", "extended_processing", "concrete_examples", "positive_reinforcement"], progressFraction: 0.4 },
    modules: [
      { title: "Food webs", outcome: "Trace how energy moves from the sun to plants to animals.",
        hook: "Grass never chases anything. So where does a hawk's energy really come from?", minutes: 8,
        standards: [{ code: "NGSS.MS-LS2-3", title: "Develop a model to describe the cycling of matter and flow of energy" }],
        points: ["Producers (plants) capture the sun's energy", "Energy flows: producers → herbivores → predators", "A food web links many food chains together"],
        reading: "Every ecosystem runs on energy that starts with the **sun**.\n\n**Producers** — plants and algae — catch sunlight and make food. They are the base of everything. **Consumers** eat to get energy: herbivores (like mice) eat plants; predators (like snakes and hawks) eat other animals.\n\nSo a hawk's energy really came from the sun → grass → mouse → snake → hawk. Energy **flows one way** along the chain. A **food web** is just lots of these chains linked together, because most animals eat more than one thing.\n\nOne big idea: everything is connected. Follow the arrows and you can trace any animal's energy all the way back to the sun.",
        quiz: [
          { q: "Producers get their energy from…", options: ["Eating animals", "The sun", "The soil only", "Other producers"], answer: 1 },
          { q: "Energy in a food chain flows…", options: ["In a circle", "One way, from producers to consumers", "From predators to plants", "Randomly"], answer: 1 },
          { q: "A mouse that eats seeds is a…", options: ["Producer", "Herbivore (consumer)", "Predator only", "The sun"], answer: 1 },
          { q: "A food web is…", options: ["One single chain", "Many food chains linked together", "A spider's home", "A list of plants"], answer: 1 },
        ],
        caseContext: "In a meadow web, hawks eat snakes, snakes eat mice, mice eat grass. Leo thinks removing the hawks changes nothing. Coach him — in short, simple steps with concrete examples and extra thinking time — to trace what happens to snakes, then mice, then grass.",
        caseOpening: "Take your time. If the hawks are gone, which animal is suddenly safer — snakes or mice?" },
      { title: "Energy flow", outcome: "Explain why there are fewer predators than prey.",
        hook: "Why are there tons of grasshoppers but only a few hawks?", minutes: 8,
        standards: [{ code: "NGSS.MS-LS2-1", title: "Analyze data for the effects of resource availability on organisms" }],
        points: ["Energy is lost as heat at every step", "Only some energy passes to the next level", "So each level up has fewer living things"],
        reading: "Here's a puzzle: in a field there are thousands of grasshoppers, hundreds of frogs, but only a few hawks. Why?\n\nThe answer is **energy loss**. At every step of a food chain, a lot of energy is used up for living — moving, breathing, staying warm — and lost as heat. Only a small part of the energy gets passed to the next animal.\n\nSo plants have the most energy. Herbivores get less. Predators get even less. That's why the top of a food chain can only support a **few** animals — there simply isn't enough energy left for many. Scientists draw this as an **energy pyramid**: wide at the bottom, narrow at the top.",
        quiz: [
          { q: "At each step of a food chain, energy is…", options: ["Created", "Mostly lost as heat", "Doubled", "Frozen"], answer: 1 },
          { q: "There are fewer predators than prey because…", options: ["Predators are lazy", "Less energy reaches the top", "Prey hide", "Predators sleep"], answer: 1 },
          { q: "Which level has the MOST energy?", options: ["Top predators", "Producers (plants)", "Herbivores", "They're equal"], answer: 1 },
          { q: "An energy pyramid is…", options: ["Narrow at bottom", "Wide at bottom, narrow at top", "A perfect square", "Upside down"], answer: 1 },
        ],
        caseContext: "Leo wonders why a lake can feed millions of tiny algae but only a few big fish. Coach him gently, in small steps, to connect it to energy being lost at each level.",
        caseOpening: "Let's go slow. Where does the energy in the lake start — with the algae or the fish?" },
    ],
  },
  // 5) JORDAN · Grade 8 · dysgraphia / slow processing ─────────────────────────
  {
    title: "Writing & Argument (Grade 8)", subject: "English Language Arts", emoji: "✍️", grade: 8, gradeLabel: "Grade 8",
    framework: "Common Core State Standards — Grade 8 ELA/Literacy",
    intro: "A strong argument can change minds. Over two lessons you'll build a clear claim backed by evidence, then learn to answer the other side — the move that makes writing persuasive.",
    outcome: "Write an argument with a clear claim, evidence, and a counterargument.",
    tags: ["ela", "writing", "argument", "grade 8", "common core"],
    persona: { email: "jordan.k12@synops-demo.test", firstName: "Jordan", lastName: "Bell", grade: 8, gradeLabel: "Grade 8", learningStyle: "auditory", accommodations: ["extended_processing", "scaffolded_questions", "chunked_content", "concrete_examples"], progressFraction: 0.35 },
    modules: [
      { title: "Claim and evidence", outcome: "State a clear claim and support it with specific evidence.",
        hook: "You say later school start times are better. A skeptic says 'prove it.' What now?", minutes: 9,
        standards: [{ code: "CCSS.ELA-LITERACY.W.8.1", title: "Write arguments to support claims with clear reasons and relevant evidence" }],
        points: ["A claim is the position you're arguing", "Evidence is specific proof — facts, data, examples", "Always explain HOW the evidence supports the claim"],
        reading: "An **argument** is a clear case for what you believe, built so a reasonable person might agree. It starts with a **claim** — your position, stated plainly: *\"Schools should start later.\"*\n\nA claim alone convinces no one. You need **evidence**: specific facts, data, or examples. *\"Studies show teens who start school later have better attendance and higher grades.\"* Good evidence is concrete and relevant — not just \"it's better,\" but *why*, with proof.\n\nThe step writers skip is the **link**: after your evidence, explain how it supports the claim. \"Better attendance and grades show later start times help students succeed.\" Claim → evidence → explanation. Master that chain and you can argue anything.",
        quiz: [
          { q: "A claim is…", options: ["A random fact", "The position you're arguing", "A question", "The title"], answer: 1 },
          { q: "The best evidence is…", options: ["Vague and general", "Specific and relevant", "Only your opinion", "Off-topic"], answer: 1 },
          { q: "After giving evidence, a strong writer…", options: ["Stops immediately", "Explains how it supports the claim", "Changes the subject", "Repeats the claim only"], answer: 1 },
          { q: "Which is a claim?", options: ["Schools exist.", "Schools should start later.", "What time is school?", "Buses are yellow."], answer: 1 },
        ],
        caseContext: "Jordan wants to argue that his town needs a new skate park but only writes 'it would be fun.' Coach him — with extended thinking time and small scaffolded steps — to turn that into a claim plus one specific piece of evidence.",
        caseOpening: "No rush. 'It would be fun' is a start. WHO would it help, and how? Let's find one specific reason." },
      { title: "Answering the other side", outcome: "Name an objection and respond to it (counterargument).",
        hook: "The best way to win an argument? Bring up the OTHER side yourself.", minutes: 9,
        standards: [{ code: "CCSS.ELA-LITERACY.W.8.1.B", title: "Support claims with logical reasoning, acknowledging counterclaims" }],
        points: ["A counterargument is the other side's strongest point", "Name it fairly, then respond with reasons", "Handling objections makes you more convincing, not less"],
        reading: "It sounds backwards, but strong writers **bring up the other side themselves**. This is the **counterargument**.\n\nSay you're arguing for later school start times. A reader might think: *\"But buses would need new schedules.\"* Instead of hoping no one notices, you name it: \"Some worry that later starts would disrupt bus schedules.\" Then you **respond**: \"But many districts have adjusted routes successfully, and the benefit to students' health outweighs the inconvenience.\"\n\nWhy do this? Because it shows you've thought it through, and it takes the wind out of your critic's sails before they even speak. Name the objection fairly, then answer it with reasons. That's the move that turns a good argument into a convincing one.",
        quiz: [
          { q: "A counterargument is…", options: ["Your own claim again", "The other side's strongest point", "A spelling rule", "The conclusion"], answer: 1 },
          { q: "You should present the other side…", options: ["Never", "Fairly, then respond to it", "As a joke", "Only if forced"], answer: 1 },
          { q: "Addressing objections makes your argument…", options: ["Weaker", "More convincing", "Shorter only", "Off-topic"], answer: 1 },
          { q: "After naming a counterargument, you should…", options: ["Ignore it", "Respond with reasons", "Agree and quit", "Change topics"], answer: 1 },
        ],
        caseContext: "Jordan argues the school day should be shorter, but ignores the obvious objection (less learning time). Coach him to name that objection fairly and craft a reasonable response.",
        caseOpening: "Someone WILL say 'a shorter day means less learning.' Let's not dodge it — how could you answer that fairly?" },
    ],
  },
  // 6) EMMA · Grade 11 · low vision + dyscalculia ──────────────────────────────
  {
    title: "Algebra I (Grade 11 support)", subject: "Mathematics", emoji: "📐", grade: 11, gradeLabel: "Grade 11",
    framework: "Common Core State Standards — High School Algebra",
    intro: "Algebra is the language of patterns and change. In two lessons you'll solve linear equations step by step and read slope as a real rate of change — with every step shown clearly.",
    outcome: "Solve one-variable linear equations and interpret slope as a rate of change.",
    tags: ["math", "algebra", "linear equations", "grade 11", "common core"],
    persona: { email: "emma.k12@synops-demo.test", firstName: "Emma", lastName: "Novak", grade: 11, gradeLabel: "Grade 11", learningStyle: "visual", accommodations: ["concrete_examples", "extended_processing", "scaffolded_questions", "chunked_content"], progressFraction: 0.55 },
    modules: [
      { title: "Solving linear equations", outcome: "Solve a one-variable equation by keeping it balanced.",
        hook: "3x + 4 = 19. What is x — and how do you know you're right?", minutes: 10,
        standards: [{ code: "CCSS.MATH.CONTENT.HSA.REI.B.3", title: "Solve linear equations in one variable" }],
        points: ["An equation is a balance: do the same to both sides", "Undo operations in reverse order", "Check by substituting your answer back in"],
        reading: "An **equation** is a balance scale: the two sides are equal, and whatever you do to one side you must do to the other to keep it balanced.\n\nTo solve **3x + 4 = 19**, undo the operations in reverse. First subtract 4 from both sides: 3x = 15. Then divide both sides by 3: **x = 5**.\n\nThe order matters — you undo addition/subtraction before multiplication/division, the reverse of how you'd build the expression. \n\nFinally, **check**: put x = 5 back in. 3(5) + 4 = 15 + 4 = 19. ✓ It balances, so the answer is correct. Checking isn't optional — it's how you *know* you're right, every time.",
        quiz: [
          { q: "Solving 2x + 3 = 11, first you…", options: ["Divide by 2", "Subtract 3 from both sides", "Add 3", "Multiply by 2"], answer: 1 },
          { q: "In x/4 = 5, x equals…", options: ["20", "9", "1.25", "45"], answer: 0 },
          { q: "To keep an equation true, you must…", options: ["Change only one side", "Do the same to both sides", "Ignore the equals sign", "Add anything"], answer: 1 },
          { q: "The best way to know your answer is right is to…", options: ["Guess", "Substitute it back and check", "Ask a friend", "Move on"], answer: 1 },
        ],
        caseContext: "Emma solves 5x − 2 = 18 and gets x = 4. Coach her to check her work by substituting, discover it doesn't balance, and find x = 4 correctly (5·4−2 = 18 ✓ — actually correct). Use clear, concrete steps.",
        caseOpening: "Let's verify. Put x = 4 back into 5x − 2. What do you get?" },
      { title: "Slope as rate of change", outcome: "Read slope as how much y changes per unit of x.",
        hook: "A phone plan charges $30 plus $10 per gig. What's the 'slope' — and what does it mean?", minutes: 9,
        standards: [{ code: "CCSS.MATH.CONTENT.HSF.IF.B.6", title: "Calculate and interpret the average rate of change" }],
        points: ["Slope = rise over run = change in y ÷ change in x", "Slope is a rate: how fast y changes as x grows", "In y = mx + b, m is the slope"],
        reading: "**Slope** measures how steeply a line rises — and more usefully, it's a **rate of change**: how much *y* changes for each step in *x*.\n\nYou compute it as **rise over run**: the change in y divided by the change in x. On a phone plan that costs $30 plus $10 per gigabyte, every extra gig adds $10, so the **slope is 10** — 10 dollars per gig. The $30 is the starting point (the **y-intercept**).\n\nIn the equation **y = mx + b**, the **m** is the slope and **b** is where the line starts. Reading slope as a rate turns abstract lines into real meaning: dollars per gig, miles per hour, degrees per minute. Same idea, everywhere.",
        quiz: [
          { q: "Slope is…", options: ["Change in y ÷ change in x", "x times y", "The y-intercept", "Always 1"], answer: 0 },
          { q: "In y = mx + b, the slope is…", options: ["b", "m", "x", "y"], answer: 1 },
          { q: "A plan is $20 + $5 per month. The slope is…", options: ["20", "5", "25", "0"], answer: 1 },
          { q: "Slope as a rate of change tells you…", options: ["The starting value", "How fast y changes as x grows", "The color of the line", "Nothing useful"], answer: 1 },
        ],
        caseContext: "Emma sees the line y = 15 + 8x for a gym (a $15 join fee plus $8 per visit) and isn't sure what 8 means. Coach her, with a concrete real-world framing, to read 8 as the cost per visit (the rate of change).",
        caseOpening: "In y = 15 + 8x, the 8 is attached to x — the number of visits. So what does 8 cost you each time?" },
    ],
  },
];

// ── SECOND SUBJECT per learner (each persona takes TWO different subjects, e.g. math + civics,
//    science + history) so every K-12 class spans two subjects, fully built and gamified. ──────────
const SECOND_COURSES: K12Course[] = [
  {
    title: "Grade 1 Math: Counting & Adding", subject: "Mathematics", emoji: "🔢", grade: 1, gradeLabel: "Grade 1",
    framework: "Common Core State Standards — Grade 1 Operations & Algebraic Thinking",
    intro: "Let's learn to count and add small numbers. We will use our fingers, toys, and pictures to see how numbers grow.",
    outcome: "I can count on from a number and add two numbers within 10.",
    tags: ["math", "counting", "addition", "grade 1", "common core"],
    persona: { email: "mateo.k12@synops-demo.test", firstName: "Mateo", lastName: "Flores", grade: 1, gradeLabel: "Grade 1", learningStyle: "kinesthetic", accommodations: ["simplified_language", "concrete_examples", "chunked_content", "positive_reinforcement"], progressFraction: 0.1 },
    modules: [
      { title: "Counting On to Add", outcome: "I can start at a big number and count on to add within 10.", hook: "If you have 4 blocks and get 3 more, do you have to count them all again?", minutes: 7, game: "choice",
        standards: [{ code: "CCSS.MATH.CONTENT.1.OA.C.6", title: "Add and subtract within 20" }],
        points: ["Start with the bigger number in your head.", "Count on with your fingers to add the smaller number.", "The last number you say is the answer."],
        reading: "When we **add**, we put two groups together to make one bigger group.\n\nHere is a fast way. You do NOT have to start at 1 every time. You can **count on**. That means you say the first number, then keep counting up.\n\nLet's try **4 + 3**. Start at the bigger number, **4**. Now hold up 3 fingers and count on: \"5... 6... 7.\" The last number you say is **7**. So 4 + 3 = 7!\n\nCounting on is like hopping up a stairway. You are already on step 4, so you just take 3 more hops: 5, 6, 7.\n\nTry it with your own toys. Put 5 toys in a pile. Say \"five,\" then add 2 more, one at a time: \"six, seven.\" You have **7** toys. Counting on makes adding fast and fun.",
        quiz: [
          { q: "To add 5 + 2 by counting on, which number do you start with?", options: ["1", "2", "5", "7"], answer: 2 },
          { q: "What is 6 + 3?", options: ["8", "9", "10", "7"], answer: 1 },
          { q: "You start at 4 and count on 2 more. What do you say?", options: ["5, 6", "3, 2", "4, 4", "6, 7"], answer: 0 },
          { q: "What is 3 + 4?", options: ["6", "8", "5", "7"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
      { title: "Teen Numbers: Ten and Some Ones", outcome: "I can show a teen number as one ten and some ones.", hook: "What is hiding inside the number 14?", minutes: 7, game: "pair",
        standards: [{ code: "CCSS.MATH.CONTENT.1.NBT.B.2", title: "Understand place value: tens and ones" }],
        points: ["A teen number is made of one ten and some ones.", "11 is 10 and 1 more; 15 is 10 and 5 more.", "The ten stays the same and the ones change."],
        reading: "Numbers from 11 to 19 are called **teen numbers**. Every teen number has a secret! It is made of **one ten** and some **ones**.\n\nLet's look at **11**. Take 10 blocks and snap them into one stick of ten. Then add **1** more block. That is 10 and 1, which makes **11**.\n\nNow try **15**. Start with your stick of **ten** blocks. Then count out **5** more single blocks. Ten and five more is **15**!\n\nDo you see the pattern? The **ten** stays the same. Only the **ones** change. 13 is ten and 3. 17 is ten and 7.\n\nThis helps us understand big numbers. When you see a teen number, think: \"one ten, and how many ones?\" That makes counting much easier.",
        quiz: [
          { q: "The number 12 is made of one ten and how many ones?", options: ["1", "2", "3", "12"], answer: 1 },
          { q: "Ten and 6 more makes which number?", options: ["16", "60", "6", "10"], answer: 0 },
          { q: "Which number is one ten and 8 ones?", options: ["80", "8", "18", "10"], answer: 2 },
          { q: "In the number 14, how many tens are there?", options: ["4", "14", "0", "1"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
    ],
  },
  {
    title: "Matemáticas (Grado 3): Multiplicación", subject: "Matemáticas", emoji: "✖️", grade: 3, gradeLabel: "Grade 3", lang: "es",
    framework: "Common Core State Standards — Grade 3 Mathematics",
    intro: "Vamos a aprender qué es la multiplicación. Verás que multiplicar es una forma rápida de sumar grupos iguales.",
    outcome: "Puedo explicar la multiplicación como grupos iguales y resolver problemas sencillos.",
    tags: ["matematicas", "multiplicacion", "grade 3", "common core"],
    persona: { email: "sofia.k12@synops-demo.test", firstName: "Sofía", lastName: "Ramírez", grade: 3, gradeLabel: "Grade 3", learningStyle: "visual", accommodations: ["simplified_language", "concrete_examples", "scaffolded_questions", "positive_reinforcement", "chunked_content"], progressFraction: 0.1 },
    modules: [
      { title: "Grupos Iguales", outcome: "Puedo mostrar una multiplicación como grupos iguales de objetos.", hook: "¿Cómo puedes contar 3 cajas con 4 galletas cada una sin contar una por una?", minutes: 8, game: "choice",
        standards: [{ code: "CCSS.MATH.CONTENT.3.OA.A.1", title: "Interpret products as equal groups" }],
        points: ["Multiplicar es juntar grupos que tienen la misma cantidad.", "3 × 4 quiere decir 3 grupos de 4 cosas.", "Multiplicar es una suma rápida de grupos iguales."],
        reading: "La **multiplicación** es una manera rápida de sumar **grupos iguales**. Un grupo igual es un grupo que tiene siempre la misma cantidad de cosas.\n\nImagina que tienes **3 platos**, y en cada plato hay **4 galletas**. Puedes contar de una en una: 1, 2, 3, 4... pero es lento.\n\nEs más fácil escribir **3 × 4**. Esto quiere decir \"**3 grupos de 4**\". El primer número dice **cuántos grupos** hay. El segundo número dice **cuántos hay en cada grupo**.\n\nPara resolverlo, puedes sumar los grupos: 4 + 4 + 4 = **12**. Entonces 3 × 4 = **12**. Hay 12 galletas en total.\n\nEl signo **×** significa \"veces\". Así que 3 × 4 se lee \"3 veces 4\". Buscar grupos iguales te ayuda a multiplicar rápido.",
        quiz: [
          { q: "¿Qué significa 3 × 4?", options: ["3 grupos de 4", "3 más 4", "4 menos 3", "3 grupos de 3"], answer: 0 },
          { q: "Hay 2 cajas con 5 lápices cada una. ¿Cuántos lápices hay?", options: ["7", "25", "10", "12"], answer: 2 },
          { q: "En 5 × 2, ¿qué nos dice el primer número (5)?", options: ["Cuántos hay en cada grupo", "El total", "Cuántos grupos hay", "Cuánto sobra"], answer: 2 },
          { q: "¿Cuál suma es igual a 4 × 3?", options: ["4 + 3", "3 + 3 + 3 + 3", "4 + 4", "3 + 4 + 3"], answer: 1 },
        ], caseContext: "", caseOpening: "" },
      { title: "Problemas con Multiplicación", outcome: "Puedo resolver problemas de la vida real usando la multiplicación.", hook: "Si cada mesa tiene la misma cantidad de sillas, ¿cómo sabes cuántas sillas hay en total?", minutes: 8, game: "pair",
        standards: [{ code: "CCSS.MATH.CONTENT.3.OA.A.3", title: "Use multiplication to solve word problems" }],
        points: ["Busca grupos iguales dentro del problema.", "Multiplica el número de grupos por lo que hay en cada grupo.", "El resultado es el total de todas las cosas juntas."],
        reading: "Muchos problemas de la vida real usan **grupos iguales**. Cuando veas grupos que tienen la misma cantidad, puedes usar la **multiplicación** para hallar el total.\n\nLee este problema: \"Ana tiene **4 bolsas**. En cada bolsa hay **6 manzanas**. ¿Cuántas manzanas tiene en total?\"\n\nPrimero, busca los grupos iguales. Hay **4 grupos** (las bolsas) y cada uno tiene **6 manzanas**. Entonces escribimos **4 × 6**.\n\nAhora resuélvelo: 6 + 6 + 6 + 6 = **24**. ¡Ana tiene **24 manzanas**!\n\nSigue estos pasos: (1) encuentra cuántos grupos hay, (2) encuentra cuántos hay en cada grupo, y (3) multiplica los dos números. La palabra \"**cada**\" te ayuda a ver que los grupos son iguales. Practicar estos pasos te ayudará a resolver muchos problemas.",
        quiz: [
          { q: "Hay 3 mesas con 5 sillas cada una. ¿Cuántas sillas hay?", options: ["8", "15", "35", "10"], answer: 1 },
          { q: "¿Qué palabra te ayuda a saber que los grupos son iguales?", options: ["menos", "cada", "resta", "mitad"], answer: 1 },
          { q: "Un problema dice: 5 cajas, 2 pelotas en cada caja. ¿Qué multiplicación usas?", options: ["5 + 2", "5 × 2", "2 − 5", "5 × 5"], answer: 1 },
          { q: "¿Cuánto es 6 × 3?", options: ["9", "18", "12", "63"], answer: 1 },
        ], caseContext: "", caseOpening: "" },
    ],
  },
  {
    title: "Science 4: Energy & Motion", subject: "Science", emoji: "⚡", grade: 4, gradeLabel: "Grade 4",
    framework: "Next Generation Science Standards — Grade 4 Physical Science",
    intro: "In this course you will learn about energy and how things move. We will go step by step, with clear examples you can picture.",
    outcome: "I can explain how the speed of an object relates to its energy and describe how energy transfers.",
    tags: ["science", "energy", "motion", "grade 4", "ngss"],
    persona: { email: "aiden.k12@synops-demo.test", firstName: "Aiden", lastName: "Walsh", grade: 4, gradeLabel: "Grade 4", learningStyle: "kinesthetic", accommodations: ["predictable_structure", "chunked_content", "explicit_transitions", "positive_reinforcement", "literal_language", "extended_processing"], progressFraction: 0.4 },
    modules: [
      { title: "Speed and Energy of Motion", outcome: "I can explain that a faster object has more energy of motion.", hook: "Which hurts more if it bumps you: a slow rolling ball or a fast rolling ball?", minutes: 8, game: "choice",
        standards: [{ code: "NGSS.4-PS3-1", title: "Relate the speed of an object to its energy" }],
        points: ["Energy of motion is the energy a moving object has.", "A faster object has more energy of motion.", "A slower object has less energy of motion."],
        reading: "**Energy** is the ability to make something happen or move. When an object is moving, it has a special kind of energy called **energy of motion**.\n\nHere is the main rule, step by step:\n\n1. A moving object has energy of motion.\n2. If the object moves **faster**, it has **more** energy of motion.\n3. If the object moves **slower**, it has **less** energy of motion.\n\nThink about a soccer ball. If you tap it gently, it rolls slowly. It has a little energy of motion. If you kick it hard, it rolls fast. Now it has a lot of energy of motion.\n\nWe can see this energy when the ball hits something. A fast ball can knock over many cups. A slow ball might knock over only one. More speed means more energy. Less speed means less energy. This rule is always true for moving objects.",
        quiz: [
          { q: "Which object has MORE energy of motion?", options: ["A ball rolling slowly", "A ball rolling fast", "A ball sitting still", "A ball in a box"], answer: 1 },
          { q: "What is energy of motion?", options: ["The energy a moving object has", "The color of an object", "The size of an object", "The weight of a still object"], answer: 0 },
          { q: "If a car slows down, its energy of motion...", options: ["gets bigger", "stays exactly the same", "gets smaller", "turns into light"], answer: 2 },
          { q: "A fast ball knocks over more cups than a slow ball because it has...", options: ["less energy", "no energy", "the same energy", "more energy"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
      { title: "How Energy Moves From Place to Place", outcome: "I can name ways energy transfers, such as sound, light, heat, and collisions.", hook: "How does the heat from a stove get to your hands without touching the stove?", minutes: 8, game: "pair",
        standards: [{ code: "NGSS.4-PS3-2", title: "Observe energy transferred from place to place" }],
        points: ["Energy can move from one place to another. This is called a transfer.", "Energy transfers by sound, light, heat, and collisions.", "When objects bump, energy passes from one to the other."],
        reading: "Energy does not stay in one spot. It can **transfer**, which means it moves from one place to another. There are several clear ways this happens.\n\n**Sound**: When you clap, energy moves through the air as sound. Your ears catch that energy so you can hear it.\n\n**Light**: The Sun sends energy to Earth as light. The light travels all the way through space to reach you.\n\n**Heat**: A warm cup of cocoa gives heat energy to your cold hands. The energy moves from the hot cup to your cooler hands.\n\n**Collisions**: When one marble rolls and bumps another, energy transfers from the first marble to the second. The second marble then starts to move.\n\nSo energy can travel by sound, light, heat, and collisions. In each case, energy leaves one place and arrives at another. Nothing disappears; the energy just moves.",
        quiz: [
          { q: "When one marble bumps another and makes it move, this is energy transfer by...", options: ["collision", "light", "sound", "smell"], answer: 0 },
          { q: "How does energy from the Sun reach Earth?", options: ["By sound", "By touching", "By light", "By wind only"], answer: 2 },
          { q: "What does the word \"transfer\" mean?", options: ["Energy disappears", "Energy moves from one place to another", "Energy gets colder", "Energy stops"], answer: 1 },
          { q: "A warm cup warming your cold hands is an example of energy moving as...", options: ["sound", "light", "a collision", "heat"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
    ],
  },
  {
    title: "Civics 6: How Government Works", subject: "Social Studies", emoji: "🏛️", grade: 6, gradeLabel: "Grade 6",
    framework: "C3 Framework for Social Studies — Civics",
    intro: "Government shapes daily life, from schools to roads. In this course you will learn how the U.S. government is organized and what it means to be an active citizen.",
    outcome: "I can describe the three branches of government and explain the rights and responsibilities of citizens.",
    tags: ["civics", "government", "citizenship", "grade 6", "c3"],
    persona: { email: "maya.k12@synops-demo.test", firstName: "Maya", lastName: "Chen", grade: 6, gradeLabel: "Grade 6", learningStyle: "reading_writing", accommodations: [], progressFraction: 0.5 },
    modules: [
      { title: "The Three Branches of Government", outcome: "I can identify the three branches of government and the job of each one.", hook: "Why does one group get to make laws, another enforce them, and a third decide what they mean?", minutes: 9, game: "choice",
        standards: [{ code: "C3.D2.CIV.1.6-8", title: "Distinguish the powers and responsibilities of citizens and institutions" }],
        points: ["The government is split into three branches with different jobs.", "Legislative makes laws, executive enforces them, judicial interprets them.", "Separating power keeps any one branch from becoming too strong."],
        reading: "The United States government is divided into **three branches**. Each branch has its own job, and together they run the country. This design keeps power balanced.\n\nThe **legislative branch** is Congress. Its job is to **make laws**. Congress is made up of the Senate and the House of Representatives, whose members are elected by citizens.\n\nThe **executive branch** is led by the President. Its job is to **carry out and enforce laws**. The President also leads the military and represents the nation to the world.\n\nThe **judicial branch** is the courts, including the Supreme Court. Its job is to **interpret laws** and decide what they mean when people disagree.\n\nWhy split the work this way? The framers of the Constitution worried that too much power in one place could lead to unfairness. By giving each branch a separate role, they created a system where the branches check one another, protecting people's freedom.",
        quiz: [
          { q: "Which branch makes the laws?", options: ["Executive", "Legislative", "Judicial", "Military"], answer: 1 },
          { q: "What is the main job of the judicial branch?", options: ["To interpret laws and decide what they mean", "To elect the President", "To write new laws", "To collect taxes"], answer: 0 },
          { q: "The President is the head of which branch?", options: ["Legislative", "Judicial", "Executive", "Congress"], answer: 2 },
          { q: "Why did the framers split the government into three branches?", options: ["To make voting slower", "To copy other countries exactly", "To give the President all power", "To keep any one branch from becoming too strong"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
      { title: "The Roles of Citizens", outcome: "I can explain the rights and responsibilities citizens have in a democracy.", hook: "What does a democracy ask of you in return for your freedoms?", minutes: 9, game: "pair",
        standards: [{ code: "C3.D2.CIV.2.6-8", title: "Explain the roles of citizens in a democracy" }],
        points: ["Citizens have rights, such as free speech and the right to vote.", "Citizens also have responsibilities, like voting and jury duty.", "A democracy works best when citizens take part."],
        reading: "In a **democracy**, the people hold the power. That power comes with both **rights** and **responsibilities**.\n\n**Rights** are freedoms that the government must protect. Citizens have the right to **free speech**, the right to practice their religion, and the right to **vote** for their leaders. These rights let people share ideas and help choose the direction of the country.\n\n**Responsibilities** are duties that citizens are expected to fulfill. **Voting** in elections is one of the most important. Serving on a **jury** helps make sure trials are fair. Citizens are also expected to obey laws, pay taxes, and stay informed about issues.\n\nRights and responsibilities work together. For example, you have the right to vote, and you also have the responsibility to learn about the candidates before you do. When citizens take these roles seriously, the government reflects the will of the people. A democracy is strongest when its citizens participate.",
        quiz: [
          { q: "Which of these is a responsibility of a citizen?", options: ["Serving on a jury", "Ignoring the news", "Refusing to obey any law", "Never voting"], answer: 0 },
          { q: "Which of these is a right of a citizen?", options: ["Paying taxes", "Free speech", "Jury duty", "Obeying laws"], answer: 1 },
          { q: "In a democracy, who holds the power?", options: ["Only the President", "Only judges", "The people", "Only Congress"], answer: 2 },
          { q: "Why is voting called both a right and a responsibility?", options: ["It is only for leaders", "It costs money to do", "It happens once in a lifetime", "Citizens are free to vote and expected to take part"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
    ],
  },
  {
    title: "World History 6: Early Civilizations", subject: "Social Studies", emoji: "🏺", grade: 6, gradeLabel: "Grade 6",
    framework: "C3 Framework for Social Studies — History",
    intro: "Long ago, the first cities and civilizations began. In this course you will learn where they started, why, and the amazing things they invented.",
    outcome: "I can explain why early civilizations began near rivers and name key inventions they created.",
    tags: ["history", "civilizations", "mesopotamia", "grade 6", "c3"],
    persona: { email: "leo.k12@synops-demo.test", firstName: "Leo", lastName: "Rivera", grade: 6, gradeLabel: "Grade 6", learningStyle: "auditory", accommodations: ["simplified_language", "chunked_content", "scaffolded_questions", "extended_processing", "concrete_examples", "positive_reinforcement"], progressFraction: 0.35 },
    modules: [
      { title: "Why Civilizations Began Near Rivers", outcome: "I can explain why the first civilizations grew up next to rivers.", hook: "Why did people long ago choose to build their first cities right next to rivers?", minutes: 8, game: "choice",
        standards: [{ code: "C3.D2.HIS.1.6-8", title: "Analyze connections among events and developments in broad historical contexts" }],
        points: ["Rivers gave people water to drink and to grow food.", "Good farming near rivers meant extra food and bigger towns.", "Mesopotamia and Egypt both grew along great rivers."],
        reading: "The first **civilizations** were large groups of people who lived together in cities with shared rules. Most of them began near **rivers**. Why?\n\nA river gives people **water**. They can drink it, and they can use it to water crops. Rivers also flood and leave behind rich, dark soil that is great for **farming**.\n\nWhen farming works well, people grow **extra food**. Extra food means not everyone has to farm. Some people can become builders, traders, or leaders. Towns grow into cities.\n\nOne early civilization was **Mesopotamia**, which grew between two rivers called the Tigris and the Euphrates. Another grew in **Egypt** along the **Nile River**. The Nile flooded each year and made the land good for crops.\n\nSo rivers gave water, food, and a way to travel by boat. These gifts helped the first civilizations begin and grow strong.",
        quiz: [
          { q: "Why did early civilizations begin near rivers?", options: ["Rivers gave water and good soil for farming", "Rivers were always cold", "Rivers had gold in them", "Rivers were easy to hide in"], answer: 0 },
          { q: "Mesopotamia grew between which two rivers?", options: ["The Nile and the Amazon", "The Tigris and the Euphrates", "The Mississippi and the Ohio", "The Thames and the Seine"], answer: 1 },
          { q: "Egypt's civilization grew along which river?", options: ["The Tigris", "The Euphrates", "The Nile", "The Amazon"], answer: 2 },
          { q: "What happened when farming near rivers gave people extra food?", options: ["Everyone had to keep farming", "People left the cities", "Rivers dried up", "Some people could become builders, traders, or leaders"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
      { title: "Inventions of Early Civilizations", outcome: "I can name important inventions of early civilizations and why they mattered.", hook: "Which everyday things you use today were first invented thousands of years ago?", minutes: 8, game: "pair",
        standards: [{ code: "C3.D2.HIS.2.6-8", title: "Classify series of historical events and developments as examples of change and/or continuity" }],
        points: ["Early people invented writing to keep records.", "The wheel helped them move goods and travel.", "Written laws helped keep order in growing cities."],
        reading: "As cities grew, early civilizations needed new tools and ideas. They created **inventions** that we still use today.\n\nOne big invention was **writing**. In Mesopotamia, people pressed marks into clay to keep track of trades and stories. Writing let people **save information** so it would not be forgotten.\n\nAnother invention was the **wheel**. With wheels, people could build carts to move heavy goods and travel farther. This made trade easier and faster.\n\nEarly civilizations also created **laws**. As more people lived close together, they needed rules to stay fair and safe. One famous set of written laws was the Code of Hammurabi. Written laws meant everyone could know the rules, and leaders could keep order.\n\nWriting, the wheel, and laws were huge steps forward. They helped cities grow, trade, and last a long time. Many modern ideas began with these early inventions.",
        quiz: [
          { q: "Why was writing an important invention?", options: ["It let people save information and keep records", "It made rivers flood", "It replaced farming", "It was used only for games"], answer: 0 },
          { q: "How did the wheel help early civilizations?", options: ["It made writing faster", "It helped move goods and travel", "It grew more crops by itself", "It cooled the cities"], answer: 1 },
          { q: "Why did growing cities need written laws?", options: ["To make farming harder", "To hide information", "To keep people fair and safe with rules everyone could know", "To stop the use of the wheel"], answer: 2 },
          { q: "In Mesopotamia, early writing was made by...", options: ["painting on the sky", "carving into gold coins", "singing songs only", "pressing marks into clay"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
    ],
  },
  {
    title: "U.S. History 8: The Constitution", subject: "Social Studies", emoji: "📜", grade: 8, gradeLabel: "Grade 8",
    framework: "C3 Framework for Social Studies — Civics & History",
    intro: "The U.S. Constitution is the plan for American government. In this course you will explore why it was written and how it protects people's freedoms.",
    outcome: "I can explain why the Constitution was written and describe the Bill of Rights and separation of powers.",
    tags: ["us history", "constitution", "government", "grade 8", "c3"],
    persona: { email: "jordan.k12@synops-demo.test", firstName: "Jordan", lastName: "Bell", grade: 8, gradeLabel: "Grade 8", learningStyle: "auditory", accommodations: ["extended_processing", "scaffolded_questions", "chunked_content", "concrete_examples"], progressFraction: 0.3 },
    modules: [
      { title: "Why the Framers Wrote the Constitution", outcome: "I can explain why the Constitution was created and what separation of powers means.", hook: "What made America's first plan of government fail, and how did the framers fix it?", minutes: 9, game: "choice",
        standards: [{ code: "C3.D2.CIV.4.6-8", title: "Explain the origins, functions, and structure of the Constitution" }],
        points: ["The first government under the Articles of Confederation was too weak.", "The Constitution created a stronger national government.", "Separation of powers divides government into three branches."],
        reading: "After winning independence, the United States needed a plan for government. Its first plan, the **Articles of Confederation**, made the national government very **weak**. It could not collect taxes or keep order well, and the country struggled.\n\nIn 1787, leaders called **framers** met at the Constitutional Convention to fix these problems. They wrote a new plan: the **Constitution**. It created a stronger national government that could tax, defend the country, and settle disputes between states.\n\nBut the framers also feared giving one person or group too much power. Their solution was **separation of powers**. This idea divides the government into three branches: the legislative branch makes laws, the executive branch enforces them, and the judicial branch interprets them.\n\nEach branch can also check the others, a system called checks and balances. By separating power, the framers hoped to protect freedom and prevent any leader from becoming a tyrant. The Constitution remains the foundation of American government today.",
        quiz: [
          { q: "What was a major problem with the Articles of Confederation?", options: ["The national government was too weak", "It gave the President total power", "It banned all state governments", "It created too many courts"], answer: 0 },
          { q: "What does \"separation of powers\" mean?", options: ["One leader holds all power", "Government is divided into three branches with different jobs", "States cannot make any laws", "The military runs the country"], answer: 1 },
          { q: "Where and when did the framers write the Constitution?", options: ["In 1776 during the Revolution", "In 1812 during a war", "At the Constitutional Convention in 1787", "In 1865 after the Civil War"], answer: 2 },
          { q: "Why did the framers use checks and balances?", options: ["To make government slower for no reason", "To copy the Articles exactly", "To give Congress all the power", "To keep any one branch from becoming too powerful"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
      { title: "The Bill of Rights", outcome: "I can describe the Bill of Rights and identify key freedoms it protects.", hook: "Why did Americans demand a list of freedoms before they would accept the Constitution?", minutes: 9, game: "pair",
        standards: [{ code: "C3.D2.CIV.8.6-8", title: "Analyze the purposes of rules and laws (the Bill of Rights)" }],
        points: ["The Bill of Rights is the first ten amendments to the Constitution.", "It protects freedoms like speech, religion, and the press.", "It limits government power to protect individual rights."],
        reading: "When the Constitution was first written, many Americans worried it did not clearly protect people's **freedoms**. To win their support, leaders promised to add a list of protected rights. This became the **Bill of Rights**, the first **ten amendments** to the Constitution.\n\nAn **amendment** is an addition or change to the Constitution. The Bill of Rights was ratified in 1791.\n\nThe **First Amendment** is one of the most famous. It protects freedom of **speech**, **religion**, the **press**, and the right to assemble and petition the government. These freedoms let people share ideas and criticize leaders without fear.\n\nOther amendments protect people too. For example, they guarantee fair trials and protect against unfair searches of homes.\n\nThe main purpose of the Bill of Rights is to **limit the power of government**. By listing rights the government cannot take away, it protects individual freedom. These protections still shape American life and law today.",
        quiz: [
          { q: "What is the Bill of Rights?", options: ["The first ten amendments to the Constitution", "A list of the Presidents", "The plan for the three branches", "A tax law"], answer: 0 },
          { q: "Which freedom is protected by the First Amendment?", options: ["The right to own a business only", "Freedom of speech", "The right to skip taxes", "The right to be a judge"], answer: 1 },
          { q: "What does the word \"amendment\" mean?", options: ["A new state", "A type of court", "An addition or change to the Constitution", "A national election"], answer: 2 },
          { q: "What is the main purpose of the Bill of Rights?", options: ["To make the President stronger", "To create new taxes", "To add more states", "To limit government power and protect individual rights"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
    ],
  },
  {
    title: "U.S. Government (Grade 11): Foundations of Democracy", subject: "Social Studies", emoji: "⚖️", grade: 11, gradeLabel: "Grade 11",
    framework: "C3 Framework for Social Studies — Civics (High School)",
    intro: "American democracy rests on how power is divided and how citizens shape policy. In this course you will analyze the constitutional structure and the lawmaking process.",
    outcome: "I can explain how the Constitution distributes and limits power and evaluate how citizens influence policy.",
    tags: ["government", "democracy", "federalism", "grade 11", "c3"],
    persona: { email: "emma.k12@synops-demo.test", firstName: "Emma", lastName: "Novak", grade: 11, gradeLabel: "Grade 11", learningStyle: "visual", accommodations: ["concrete_examples", "extended_processing", "scaffolded_questions", "chunked_content"], progressFraction: 0.45 },
    modules: [
      { title: "Separation of Powers, Checks and Balances, and Federalism", outcome: "I can explain how the Constitution distributes and constrains political power.", hook: "How does a written document stop any single person or level of government from seizing total control?", minutes: 10, game: "choice",
        standards: [{ code: "C3.D2.CIV.4.9-12", title: "Explain how constitutions distribute and constrain political power" }],
        points: ["Separation of powers divides government into three branches.", "Checks and balances let each branch limit the others.", "Federalism divides power between national and state governments."],
        reading: "The U.S. Constitution limits power through three connected principles that work together to protect liberty.\n\nFirst is **separation of powers**. Governing authority is divided among three branches: the **legislative** branch makes laws, the **executive** branch enforces them, and the **judicial** branch interprets them. No single branch holds all authority.\n\nSecond is **checks and balances**. Each branch can restrain the others. For example, Congress passes a bill, but the President can **veto** it; Congress can then override the veto with a two-thirds vote. Courts can rule laws unconstitutional. These overlapping powers force branches to cooperate.\n\nThird is **federalism**, which divides power between the **national government** and the **states**. Some powers, like coining money, belong to the national government. Others, like running schools, belong mostly to states. Some are shared.\n\nTogether, these principles spread power across branches and levels of government. This design makes it difficult for any person or group to gain unchecked control, safeguarding democratic government.",
        quiz: [
          { q: "What does federalism divide power between?", options: ["The national government and the states", "The Senate and the House only", "Two political parties", "The President and the Vice President"], answer: 0 },
          { q: "Which is an example of checks and balances?", options: ["States running their own schools", "The President vetoing a bill from Congress", "Citizens voting in an election", "A city passing a parking rule"], answer: 1 },
          { q: "Under separation of powers, which branch interprets laws?", options: ["Legislative", "Executive", "Judicial", "Federal"], answer: 2 },
          { q: "Why do these three principles work together?", options: ["To give Congress unlimited power", "To eliminate state governments", "To speed up all decisions", "To keep any person or group from gaining unchecked control"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
      { title: "How a Bill Becomes a Law and How Citizens Influence Policy", outcome: "I can trace how a bill becomes a law and evaluate how citizens influence policy.", hook: "Between an idea and an official law, how many hurdles must an idea clear, and where can citizens push?", minutes: 10, game: "pair",
        standards: [{ code: "C3.D2.CIV.8.9-12", title: "Evaluate social and political systems, citing evidence" }],
        points: ["A bill must pass both houses of Congress and be signed by the President.", "Committees, debate, and votes shape a bill along the way.", "Citizens influence policy through voting, advocacy, and public opinion."],
        reading: "Turning an idea into a **law** follows a clear process, and citizens can shape it at many points.\n\nFirst, a member of Congress introduces a **bill**. It goes to a **committee**, where lawmakers study, debate, and revise it. Many bills stop here. If the committee approves it, the full chamber debates and votes. To advance, a bill must pass **both** the House and the Senate, usually in matching form.\n\nNext, the bill goes to the **President**, who can **sign** it into law or **veto** it. Congress can override a veto with a two-thirds vote in both chambers.\n\nCitizens influence this process in several ways. They **vote** for representatives who share their views. They contact lawmakers, sign petitions, join interest groups, and shape **public opinion** through protests and media. Evidence shows that sustained public pressure can move lawmakers to act or to block a bill.\n\nBy understanding the steps and the pressure points, citizens can evaluate where their voices matter most and participate effectively in shaping policy.",
        quiz: [
          { q: "For a bill to advance to the President, it must first...", options: ["Pass both the House and the Senate", "Be approved by the Supreme Court", "Win a national election", "Be signed by a state governor"], answer: 0 },
          { q: "What can Congress do if the President vetoes a bill?", options: ["Nothing; the bill is dead forever", "Override the veto with a two-thirds vote in both chambers", "Send it to the Supreme Court to sign", "Automatically make it law"], answer: 1 },
          { q: "Where are bills often studied, debated, and revised early in the process?", options: ["The White House", "The Supreme Court", "A committee", "A voting booth"], answer: 2 },
          { q: "Which is a way citizens influence policy, supported by evidence?", options: ["Ignoring elections", "Never contacting lawmakers", "Refusing to join any group", "Voting, contacting lawmakers, and shaping public opinion"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
    ],
  },
];

// Every course processed by the seed = each learner's primary subject + their second subject.
const ALL_COURSES: K12Course[] = [...COURSES, ...SECOND_COURSES];

// ── Interactive game engine (sandboxed HTML). DIFFERENT games so lessons don't repeat.
//    Picture games (young readers): find (tap the picture) · match (picture↔word pairs) · memory (flip cards) · puzzle (spell).
//    Text games (older readers): choice (multiple choice) · pair (word↔meaning, no pictures) · sort (drag cards into two groups). ──
function gameHtml(title: string, items: { q: string; options: string[]; answer: number; img?: string }[], mode: string, lang = "en"): string {
  const data = JSON.stringify(items).replace(/</g, "\\u003c");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{--indigo:#4F46E5;--amber:#F59E0B;--ink:#1f2430;--ok:#15803d;--no:#b91c1c}*{box-sizing:border-box}body{font-family:Inter,system-ui,sans-serif;color:var(--ink);margin:0;padding:18px;background:#FBF7EF;overflow-x:hidden}h2{margin:.2rem 0 .6rem;font-size:1.25rem}#stars{text-align:center;font-weight:800;font-size:1.3rem;margin:0 0 10px}.q{background:#fff;border:2px solid #f0e9da;border-radius:20px;padding:16px 18px;margin:0 0 16px;box-shadow:0 2px 8px rgba(0,0,0,.05)}.q.solved{border-color:var(--ok);background:#f6fbf7}.qt{font-weight:700;font-size:1.1rem;margin:0 0 12px;text-align:center}.qimg{display:block;width:160px;height:160px;object-fit:contain;border-radius:22px;margin:0 auto 12px;background:#eef0fb;padding:10px;filter:drop-shadow(0 5px 9px rgba(0,0,0,.18))}.opt{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:2px solid #e6e0d0;background:#fff;border-radius:14px;padding:14px 16px;margin:8px 0;font:inherit;font-size:1.1rem;font-weight:700;cursor:pointer;transition:.15s}.opt:hover{border-color:var(--indigo);transform:translateY(-1px)}.opt .mk{margin-left:auto;font-size:1.3rem}.opt.correct{border-color:var(--ok);background:#e9f7ee;animation:pop .5s}.opt.wrong{border-color:var(--no);background:#fdecec;animation:shake .4s}@keyframes pop{0%{transform:scale(1)}40%{transform:scale(1.08)}70%{transform:scale(.97)}100%{transform:scale(1)}}@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}.mrow{display:flex;gap:16px;justify-content:center;align-items:flex-start;flex-wrap:wrap}.mcol{display:flex;flex-direction:column;gap:12px}.mpic{border:3px solid #e6e0d0;background:#fff;border-radius:18px;padding:6px;cursor:pointer;transition:.15s}.mpic img{width:100px;height:100px;object-fit:contain;display:block;border-radius:12px;background:#eef0fb;padding:6px}.mpic.sel{border-color:var(--indigo);transform:scale(1.06)}.mpic.done{border-color:var(--ok);opacity:.5;pointer-events:none}.mpic.wrong{animation:shake .4s;border-color:var(--no)}.mword{display:flex;align-items:center;justify-content:center;border:3px solid #e6e0d0;background:#fff;border-radius:16px;padding:0 20px;height:112px;font:inherit;font-size:1.3rem;font-weight:800;cursor:pointer;min-width:110px;transition:.15s}.mword:hover{border-color:var(--indigo)}.mword.done{border-color:var(--ok);background:#e9f7ee;opacity:.6;pointer-events:none}.mword.wrong{animation:shake .4s;border-color:var(--no)}.mgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;max-width:470px;margin:0 auto}.card{height:92px;border:3px solid #e6e0d0;background:var(--indigo);border-radius:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:800;color:#fff;transition:.15s}.card .face{display:flex;align-items:center;justify-content:center;width:100%;height:100%}.card .face img{width:74px;height:74px;object-fit:contain}.card.open{background:#fff;color:var(--ink);border-color:var(--indigo)}.card.done{background:#e9f7ee;color:var(--ok);border-color:var(--ok);opacity:.7;pointer-events:none}.slots{display:flex;gap:8px;justify-content:center;margin:6px 0 16px}.slot{width:52px;height:60px;border:3px dashed #cdc7b8;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:800;color:var(--indigo)}.slot.filled{border-style:solid;border-color:var(--ok);background:#e9f7ee}.tiles{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}.tile{width:56px;height:56px;border:3px solid #e6e0d0;background:#fff;border-radius:14px;font:inherit;font-size:1.6rem;font-weight:800;cursor:pointer;transition:.15s}.tile:hover{border-color:var(--indigo);transform:translateY(-1px)}.tile.used{opacity:.35;pointer-events:none}.tile.wrong{animation:shake .4s;border-color:var(--no)}.bar{height:12px;background:#eee;border-radius:8px;overflow:hidden;margin:16px 0 8px}.fill{height:100%;width:0;background:linear-gradient(90deg,#F59E0B,#15803d);transition:.4s}.hint{color:#6b7280;font-size:1rem;text-align:center;font-weight:600}.done{display:none;text-align:center;font-weight:800;font-size:1.5rem;color:var(--ok);margin:14px 0}.float{position:fixed;pointer-events:none;font-size:1.9rem;z-index:9;animation:rise 1.4s ease-out forwards}@keyframes rise{0%{transform:translateY(0) scale(.5);opacity:0}20%{opacity:1}100%{transform:translateY(-150px) scale(1.25) rotate(18deg);opacity:0}}.confetti{position:fixed;top:-30px;font-size:1.8rem;animation:fall linear forwards;z-index:9;pointer-events:none}@keyframes fall{to{transform:translateY(110vh) rotate(360deg);opacity:.85}}</style>
<h2>${title}</h2><div id="stars">⭐ 0</div><div id="app"></div><div class="bar"><div class="fill" id="f"></div></div><p id="hint" class="hint"></p><div id="done" class="done"></div>
<script>var items=${data};var MODE=${JSON.stringify(mode)};var LANG=${JSON.stringify(lang)};function L(en,es){return LANG==='es'?es:en;}var pics=items.filter(function(x){return x.img;});var stars=0,total=0;var app=document.getElementById('app');var hint=document.getElementById('hint');function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}function report(s){try{parent.postMessage({type:'activity_result',score:s,payload:{stars:stars}},'*');}catch(e){}}function setStars(){document.getElementById('stars').textContent='⭐ '+stars+' / '+total;document.getElementById('f').style.width=Math.round(stars/Math.max(total,1)*100)+'%';}function burst(el,kind){var r=el.getBoundingClientRect();var set=kind==='balloon'?['🎈','⭐','🎉','✨']:['🎉','⭐','🌟','🎊','✨','🏆'];var n=kind==='balloon'?9:34;for(var i=0;i<n;i++){var s=document.createElement('span');if(kind==='balloon'){s.className='float';s.style.left=(r.left+Math.random()*r.width)+'px';s.style.top=r.top+'px';s.style.animationDelay=(Math.random()*.25)+'s';}else{s.className='confetti';s.style.left=(Math.random()*100)+'vw';s.style.animationDuration=(1.6+Math.random()*1.4)+'s';s.style.animationDelay=(Math.random()*.4)+'s';}s.textContent=set[i%set.length];document.body.appendChild(s);setTimeout(function(){s.remove();},3600);}}function finish(msg){var dn=document.getElementById('done');dn.innerHTML='🎉 '+(msg||L('You did it!','¡Lo lograste!'))+' '+L('You earned','Ganaste')+' <b>'+stars+'</b> ⭐';dn.style.display='block';hint.style.display='none';burst(document.body,'confetti');setTimeout(function(){report(100);},1500);}
function renderChoice(){total=items.length;setStars();hint.textContent=L('Tap the right answer! 👆','¡Toca la respuesta correcta! 👆');var solved=0;items.forEach(function(it,qi){var d=document.createElement('div');d.className='q';d.innerHTML=(it.img?'<img class="qimg" src="'+it.img+'" alt="picture">':'')+'<p class="qt">'+(qi+1)+'. '+it.q+'</p>';shuffle(it.options.map(function(o,i){return {o:o,i:i};})).forEach(function(p){var b=document.createElement('button');b.className='opt';b.innerHTML='<span>'+p.o+'</span><span class="mk"></span>';b.onclick=function(){if(d.dataset.done)return;var mk=b.querySelector('.mk');if(p.i===it.answer){b.classList.add('correct');mk.textContent='✅';d.dataset.done='1';d.classList.add('solved');[].slice.call(d.querySelectorAll('.opt')).forEach(function(x){if(x!==b)x.disabled=true;});burst(b,'balloon');stars++;setStars();solved++;if(solved===total)setTimeout(function(){finish(L('Great job!','¡Buen trabajo!'));},550);}else{b.classList.add('wrong');mk.textContent='❌';setTimeout(function(){b.classList.remove('wrong');mk.textContent='';},700);}};d.appendChild(b);});app.appendChild(d);});}
function renderFind(){total=items.length;setStars();hint.textContent=L('Tap the right picture! 👆','¡Toca la imagen correcta! 👆');var solved=0;items.forEach(function(it){var prompt=it.options[it.answer];var d=document.createElement('div');d.className='q';d.innerHTML='<p class="qt">'+L('Find: ','Busca: ')+'<b style="font-size:1.5em;color:#4F46E5">'+prompt+'</b></p>';var row=document.createElement('div');row.className='mrow';var others=shuffle(pics.filter(function(x){return x!==it;})).slice(0,2);shuffle([it].concat(others)).forEach(function(o){var b=document.createElement('button');b.className='mpic';b.innerHTML='<img src="'+o.img+'" alt="picture">';b.onclick=function(){if(d.dataset.done)return;if(o===it){b.classList.add('done');d.dataset.done='1';d.classList.add('solved');burst(b,'balloon');stars++;setStars();solved++;if(solved===total)setTimeout(function(){finish(L('You found them all!','¡Las encontraste todas!'));},550);}else{b.classList.add('wrong');setTimeout(function(){b.classList.remove('wrong');},500);}};row.appendChild(b);});d.appendChild(row);app.appendChild(d);});}
function renderMatch(){total=pics.length;setStars();hint.textContent=L('Tap a picture, then its word! 👆','¡Toca una imagen y luego su palabra! 👆');var wrap=document.createElement('div');wrap.className='q';var mrow=document.createElement('div');mrow.className='mrow';var pcol=document.createElement('div');pcol.className='mcol';var wcol=document.createElement('div');wcol.className='mcol';mrow.appendChild(pcol);mrow.appendChild(wcol);wrap.appendChild(mrow);app.appendChild(wrap);var sel=null;var done2=0;shuffle(pics).forEach(function(it){var b=document.createElement('button');b.className='mpic';b.innerHTML='<img src="'+it.img+'" alt="picture">';b.dataset.word=it.options[it.answer];b.onclick=function(){if(b.dataset.done)return;[].slice.call(pcol.querySelectorAll('.mpic')).forEach(function(x){x.classList.remove('sel');});b.classList.add('sel');sel=b;};pcol.appendChild(b);});shuffle(pics.map(function(x){return x.options[x.answer];})).forEach(function(w){var b=document.createElement('button');b.className='mword';b.textContent=w;b.onclick=function(){if(b.dataset.done||!sel)return;if(sel.dataset.word===w){sel.dataset.done='1';sel.classList.add('done');sel.classList.remove('sel');b.dataset.done='1';b.classList.add('done');burst(b,'balloon');stars++;setStars();sel=null;done2++;if(done2===total)setTimeout(function(){finish(L('Perfect matching!','¡Emparejaste todo!'));},550);}else{b.classList.add('wrong');setTimeout(function(){b.classList.remove('wrong');},500);}};wcol.appendChild(b);});}
function renderMemory(){total=pics.length;setStars();hint.textContent=L('Flip two cards to find a pair! 👆','¡Voltea dos cartas para encontrar un par! 👆');var cards=[];pics.forEach(function(it){var key=it.options[it.answer];cards.push({key:key,type:'pic',img:it.img});cards.push({key:key,type:'word'});});cards=shuffle(cards);var grid=document.createElement('div');grid.className='mgrid';app.appendChild(grid);var first=null,lock=false,matched=0;cards.forEach(function(cd){var b=document.createElement('button');b.className='card';b.innerHTML='<span class="face">?</span>';b.onclick=function(){if(lock||b.classList.contains('open')||b.classList.contains('done'))return;b.classList.add('open');b.querySelector('.face').innerHTML=cd.type==='pic'?'<img src="'+cd.img+'" alt="">':cd.key;if(!first){first=b;first.__key=cd.key;}else{lock=true;if(first.__key===cd.key&&first!==b){setTimeout(function(){first.classList.add('done');b.classList.add('done');burst(b,'balloon');stars++;setStars();matched++;first=null;lock=false;if(matched===total)setTimeout(function(){finish(L('Amazing memory!','¡Qué buena memoria!'));},550);},400);}else{setTimeout(function(){first.classList.remove('open');first.querySelector('.face').innerHTML='?';b.classList.remove('open');b.querySelector('.face').innerHTML='?';first=null;lock=false;},850);}}};grid.appendChild(b);});}
function renderPuzzle(){total=items.length;setStars();hint.textContent=L('Tap the letters in order to spell the word! 👇','¡Toca las letras en orden para escribir la palabra! 👇');var solved=0;items.forEach(function(it){var word=(it.options[it.answer]||'').toString().toLowerCase();var d=document.createElement('div');d.className='q';d.innerHTML=(it.img?'<img class="qimg" src="'+it.img+'" alt="picture">':'')+'<p class="qt">'+L('Spell the word','Escribe la palabra')+'</p>';var slots=document.createElement('div');slots.className='slots';var slotEls=[];word.split('').forEach(function(){var s=document.createElement('div');s.className='slot';slots.appendChild(s);slotEls.push(s);});d.appendChild(slots);d.__filled=0;var tiles=document.createElement('div');tiles.className='tiles';shuffle(word.split('')).forEach(function(ch){var b=document.createElement('button');b.className='tile';b.textContent=ch.toUpperCase();b.onclick=function(){if(d.dataset.done)return;var need=word[d.__filled];if(b.textContent.toLowerCase()===need){var idx=d.__filled;slotEls[idx].textContent=b.textContent;slotEls[idx].classList.add('filled');b.disabled=true;b.classList.add('used');d.__filled=idx+1;if(d.__filled===word.length){d.dataset.done='1';d.classList.add('solved');burst(b,'balloon');stars++;setStars();solved++;if(solved===total)setTimeout(function(){finish(L('You spelled them all!','¡Las escribiste todas!'));},650);}}else{b.classList.add('wrong');setTimeout(function(){b.classList.remove('wrong');},450);}};tiles.appendChild(b);});d.appendChild(tiles);app.appendChild(d);});}
function renderPair(){total=items.length;setStars();hint.textContent=L('Tap a word, then its meaning! 👆','¡Toca una palabra y luego su significado! 👆');var wrap=document.createElement('div');wrap.className='q';var mrow=document.createElement('div');mrow.className='mrow';var lcol=document.createElement('div');lcol.className='mcol';var rcol=document.createElement('div');rcol.className='mcol';mrow.appendChild(lcol);mrow.appendChild(rcol);wrap.appendChild(mrow);app.appendChild(wrap);function stylePair(b){b.style.height='auto';b.style.minHeight='58px';b.style.padding='12px 16px';b.style.fontSize='1.05rem';b.style.whiteSpace='normal';b.style.lineHeight='1.25';b.style.maxWidth='240px';}var sel=null,done2=0;shuffle(items).forEach(function(it){var b=document.createElement('button');b.className='mword';stylePair(b);b.textContent=it.q;b.dataset.mean=it.options[it.answer];b.onclick=function(){if(b.dataset.done)return;[].slice.call(lcol.querySelectorAll('.mword')).forEach(function(x){x.classList.remove('sel');});b.classList.add('sel');sel=b;};lcol.appendChild(b);});shuffle(items.map(function(x){return x.options[x.answer];})).forEach(function(w){var b=document.createElement('button');b.className='mword';stylePair(b);b.textContent=w;b.onclick=function(){if(b.dataset.done||!sel)return;if(sel.dataset.mean===w){sel.dataset.done='1';sel.classList.add('done');sel.classList.remove('sel');b.dataset.done='1';b.classList.add('done');burst(b,'balloon');stars++;setStars();sel=null;done2++;if(done2===total)setTimeout(function(){finish(L('Perfect!','¡Perfecto!'));},550);}else{b.classList.add('wrong');setTimeout(function(){b.classList.remove('wrong');},500);}};rcol.appendChild(b);});}
function renderSort(){total=items.length;setStars();var labels=(items[0]&&items[0].options)||['A','B'];hint.textContent=L('Tap a card, then the group it belongs to! 👆','¡Toca una tarjeta y luego el grupo al que pertenece! 👆');var wrap=document.createElement('div');wrap.className='q';var pool=document.createElement('div');pool.style.display='flex';pool.style.flexDirection='column';pool.style.gap='8px';pool.style.marginBottom='14px';wrap.appendChild(pool);var zrow=document.createElement('div');zrow.style.display='flex';zrow.style.gap='12px';var zones=[];labels.forEach(function(lab,zi){var z=document.createElement('div');z.style.flex='1';z.style.minWidth='140px';z.style.border='3px dashed #cdc7b8';z.style.borderRadius='16px';z.style.padding='10px';z.style.minHeight='120px';z.style.display='flex';z.style.flexDirection='column';z.style.gap='8px';var h=document.createElement('div');h.textContent=lab;h.style.fontWeight='800';h.style.textAlign='center';h.style.color='#4F46E5';z.appendChild(h);z.onclick=function(){place(zi,z);};zones.push(z);zrow.appendChild(z);});wrap.appendChild(zrow);app.appendChild(wrap);var sel=null,placed=0;shuffle(items).forEach(function(it){var b=document.createElement('button');b.className='opt';b.style.width='100%';b.style.textAlign='left';b.textContent=it.q;b.__ans=it.answer;b.onclick=function(){if(b.dataset.done)return;[].slice.call(pool.querySelectorAll('.opt')).forEach(function(x){x.style.outline='';});b.style.outline='3px solid #4F46E5';sel=b;};pool.appendChild(b);});function place(zi,z){if(!sel)return;if(sel.__ans===zi){sel.dataset.done='1';sel.classList.add('correct');sel.style.outline='';sel.disabled=true;z.appendChild(sel);burst(sel,'balloon');stars++;setStars();sel=null;placed++;if(placed===total)setTimeout(function(){finish(L('You sorted them all!','¡Los clasificaste todos!'));},550);}else{z.style.animation='shake .4s';setTimeout(function(){z.style.animation='';},450);sel.style.outline='';sel=null;}}}
if(MODE==='find')renderFind();else if(MODE==='match')renderMatch();else if(MODE==='memory')renderMemory();else if(MODE==='puzzle')renderPuzzle();else if(MODE==='pair')renderPair();else if(MODE==='sort')renderSort();else renderChoice();</script>`;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function firstOrNull<T>(rows: T[]): T | null { return rows.length ? rows[0]! : null; }

// Localise a string by course language so a Spanish course reads Spanish end-to-end (headers, beat
// titles, narration) — not just the game instructions.
function TL(lang: string | undefined, en: string, es: string): string { return lang === "es" ? es : en; }

// The reading-step body for a module, with its section headers in the course language. Shared by the
// fresh-course build and the reused-course refresh so a language change propagates on the next reseed.
function readingBody(m: K12Module, lang?: string): string {
  const think = TL(lang, "Think about this:", "Piensa en esto:");
  const byEnd = TL(lang, "By the end you can:", "Al terminar podrás:");
  const bigIdeas = TL(lang, "Big ideas", "Ideas importantes");
  const aligned = TL(lang, "Aligned to:", "Alineado con:");
  return `# ${m.title}\n\n**${think}** ${m.hook}\n\n**${byEnd}** ${m.outcome}\n\n${m.reading}\n\n## ${bigIdeas}\n\n${m.points.map((p) => `- ${p}`).join("\n")}\n\n**${aligned}** ${m.standards.map((s) => s.code).join(", ")}`;
}

async function applyBrand(partnerId: string): Promise<void> {
  const fields = { ...BRAND, updatedAt: new Date() };
  const current = firstOrNull(await db.select().from(brandThemesTable).where(eq(brandThemesTable.tenantId, partnerId)));
  if (current) await db.update(brandThemesTable).set(fields).where(eq(brandThemesTable.tenantId, partnerId));
  else await db.insert(brandThemesTable).values({ ...fields, tenantId: partnerId, tenantType: "partner" });
}

async function upsertUser(u: {
  email: string; firstName: string; lastName: string;
  role: "partner_admin" | "instructional_designer" | "learner";
  partnerId: string; organisationId: string | null;
  learningStyle?: string | null; accommodations?: string[];
}): Promise<string> {
  const existing = firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, u.email)));
  const fields = {
    firstName: u.firstName, lastName: u.lastName, role: u.role, status: "active" as const,
    partnerId: u.partnerId, organisationId: u.organisationId,
    learningStyle: u.learningStyle ?? null, accommodations: u.accommodations ?? [],
    consentVersion: PRIVACY_POLICY_VERSION, consentedAt: new Date(),
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(usersTable).set(fields).where(eq(usersTable.id, existing.id));
    return existing.id;
  }
  const [created] = await db.insert(usersTable).values({
    email: u.email, passwordHash: hashPassword(DEMO_PASSWORD), ...fields,
  }).returning();
  return created.id;
}

async function createK12Course(c: K12Course, orgId: string, facultyId: string): Promise<string> {
  const outcomes = c.modules.map((m) => m.outcome);
  const description = `${c.emoji} ${c.intro}\n\nCourse goal: ${c.outcome}`;
  const [course] = await db.insert(coursesTable).values({
    title: c.title, description, tenantId: "platform", status: "published",
    competencyTags: [...c.tags, c.subject, c.gradeLabel], objectives: outcomes, nqfLevel: c.grade,
  }).returning();

  for (let mi = 0; mi < c.modules.length; mi++) {
    const m = c.modules[mi];
    const [mod] = await db.insert(modulesTable).values({
      courseId: course.id, title: m.title, status: "published", lessonType: "slides",
      modality: "async", order: mi, objectives: [m.outcome], estimatedMinutes: m.minutes,
      description: `${c.subject} · ${c.gradeLabel}. Goal: ${m.outcome}`,
    }).returning();

    const lang = c.lang;
    await db.insert(beatsTable).values([
      { moduleId: mod.id, type: "title_card", order: 0, title: m.title, narration: TL(lang, `${m.hook}  By the end of this lesson you'll be able to: ${m.outcome}`, `${m.hook}  Al terminar esta lección podrás: ${m.outcome}`) },
      { moduleId: mod.id, type: "points", order: 1, title: TL(lang, "Big ideas", "Ideas importantes"), narration: TL(lang, `Keep the question in mind: ${m.hook}`, `Ten presente la pregunta: ${m.hook}`), bulletPoints: m.points },
      { moduleId: mod.id, type: "close", order: 2, title: TL(lang, "You've got this", "¡Tú puedes!"), narration: TL(lang, `Nice work — you can now ${m.outcome.toLowerCase()} Try the practice, then move on.`, `¡Buen trabajo! Ya puedes ${m.outcome.toLowerCase()} Haz la práctica y sigue adelante.`) },
      // Optional teaching video (YouTube) — surfaced as a "Watch" step in the young lesson view.
      ...(m.video ? [{ moduleId: mod.id, type: "video" as const, order: 3, title: TL(lang, "Watch", "Ver"), narration: TL(lang, `Watch this short video, then keep going: ${m.hook}`, `Mira este video corto y luego continúa: ${m.hook}`), videoUrl: m.video }] : []),
    ]);
    await db.update(modulesTable).set({ beatCount: m.video ? 4 : 3 }).where(eq(modulesTable.id, mod.id));

    const body = readingBody(m, lang);
    await db.insert(moduleReadingsTable).values({
      moduleId: mod.id, courseId: course.id, title: `Lesson: ${m.title}`,
      kind: "note", content: body, chars: body.length, order: 0, published: true, createdBy: facultyId,
    });

    // Interactive quiz (every module → satisfies the "interactive" completeness component).
    await db.insert(interactiveActivitiesTable).values({
      organisationId: orgId, courseId: course.id, moduleId: mod.id,
      title: `${m.title}: quick check`,
      instructions: "Answer each question, then check your work. You can retry as many times as you like.",
      html: gameHtml(`${m.title}: quick check`, m.quiz, m.game ?? "choice", c.lang ?? "en"), source: "html", kind: "quiz",
      bloomsLevel: "Understand", difficulty: "foundational",
      isLibrary: false, tags: c.tags, published: true, createdByUserId: facultyId,
    });

    // NOTE: K-12 deliberately has NO AI tutor / case study. An open-ended Socratic tutor accepts any
    // answer (no objective right/wrong), can't hear a child speak, and its live generations pulled in
    // off-region examples. K-12 practice is the tappable, self-checking quiz above instead.

    // Standards.
    for (const s of m.standards) {
      let std = firstOrNull(await db.select().from(unitStandardsTable).where(eq(unitStandardsTable.code, s.code)));
      if (!std) [std] = await db.insert(unitStandardsTable).values({ code: s.code, title: s.title, framework: "other", nqfLevel: c.grade, description: `${c.framework} · ${c.subject}` }).returning();
      const mMapped = await db.select().from(unitStandardMappingsTable).where(and(eq(unitStandardMappingsTable.unitStandardId, std.id), eq(unitStandardMappingsTable.targetId, mod.id)));
      if (mMapped.length === 0) await db.insert(unitStandardMappingsTable).values({ unitStandardId: std.id, targetType: "module", targetId: mod.id });
      const cMapped = await db.select().from(unitStandardMappingsTable).where(and(eq(unitStandardMappingsTable.unitStandardId, std.id), eq(unitStandardMappingsTable.targetId, course.id)));
      if (cMapped.length === 0) await db.insert(unitStandardMappingsTable).values({ unitStandardId: std.id, targetType: "course", targetId: course.id });
    }
  }
  await db.update(coursesTable).set({ moduleCount: c.modules.length }).where(eq(coursesTable.id, course.id));

  // Course-level assignment + discussion (module_id NULL) → satisfies those components for EVERY module.
  await db.insert(assignmentsTable).values({
    courseId: course.id, moduleId: null,
    title: `Show what you learned: ${c.subject}`,
    description: `A short, friendly wrap-up task for ${c.title}.`,
    instructions: `In your own words (or a quick recording), explain the most important thing you learned in this course and give one example.`,
    submissionType: "file_upload", pointsPossible: "100", published: true, position: 0,
  });
  await db.insert(discussionsTable).values({
    courseId: course.id, authorId: facultyId, moduleId: null,
    title: `Class discussion: ${c.title}`,
    body: `Share one thing that surprised you in this course, and reply kindly to a classmate.`,
    aiFacilitated: true, requireInitialPost: true, graded: false,
  });

  return course.id;
}

export async function seedK12(): Promise<{ ok: boolean; partnerId?: string; courses?: number; learners?: number; standards?: number; message: string }> {
  // 1. Partner + brand.
  let partner = firstOrNull(await db.select().from(partnersTable).where(eq(partnersTable.slug, DEMO_SLUG)));
  if (!partner) [partner] = await db.insert(partnersTable).values({ name: "Synops Academy", slug: DEMO_SLUG, status: "active", contactEmail: "k12@synops-consulting.com" }).returning();
  await applyBrand(partner.id);

  // 2. Org + class + faculty.
  let org = firstOrNull(await db.select().from(organisationsTable).where(and(eq(organisationsTable.partnerId, partner.id), eq(organisationsTable.name, ORG_NAME))));
  if (!org) [org] = await db.insert(organisationsTable).values({ name: ORG_NAME, partnerId: partner.id, industry: "K-12 Education" }).returning();
  let cls = firstOrNull(await db.select().from(orgClassesTable).where(eq(orgClassesTable.orgId, org.id)));
  if (!cls) [cls] = await db.insert(orgClassesTable).values({ orgId: org.id, partnerId: partner.id, name: CLASS_NAME }).returning();
  const facultyId = await upsertUser({ email: "faculty.k12@synops-demo.test", firstName: "Ms.", lastName: "Ramírez", role: "instructional_designer", partnerId: partner.id, organisationId: org.id });

  // 3. Courses (idempotent by title) + assign to partner + register on class.
  // Each persona now has TWO courses (two subjects), so map persona → LIST of course ids, and also
  // keep a title → id map for the per-course refresh / game / math-coach steps below.
  let standardsCount = 0;
  const coursesByPersona: Record<string, string[]> = {};
  const courseIdByTitle: Record<string, string> = {};
  for (const c of ALL_COURSES) {
    let existing = firstOrNull(await db.select().from(coursesTable).where(and(eq(coursesTable.title, c.title), eq(coursesTable.tenantId, "platform"))));
    // Self-heal a PARTIAL course. A prior seed can abort mid-build (e.g. an insert error on one
    // module), leaving a course with fewer modules than it should have — which idempotent reuse
    // would then keep forever. If the existing course is short on modules, tear it and its
    // dependents down completely so it rebuilds clean below.
    if (existing) {
      const emods = await db.select({ id: modulesTable.id }).from(modulesTable).where(eq(modulesTable.courseId, existing.id));
      if (emods.length < c.modules.length) {
        const emodIds = emods.map((m) => m.id);
        if (emodIds.length) {
          await db.delete(beatsTable).where(inArray(beatsTable.moduleId, emodIds));
          await db.delete(moduleReadingsTable).where(inArray(moduleReadingsTable.moduleId, emodIds));
          await db.delete(interactiveActivitiesTable).where(inArray(interactiveActivitiesTable.moduleId, emodIds));
          await db.delete(caseScenariosTable).where(inArray(caseScenariosTable.moduleId, emodIds));
        }
        await db.delete(beatProgressTable).where(eq(beatProgressTable.courseId, existing.id));
        await db.delete(enrolmentsTable).where(eq(enrolmentsTable.courseId, existing.id));
        await db.delete(orgClassCoursesTable).where(eq(orgClassCoursesTable.courseId, existing.id));
        await db.delete(coursePartnerAssignmentsTable).where(eq(coursePartnerAssignmentsTable.courseId, existing.id));
        await db.delete(modulesTable).where(eq(modulesTable.courseId, existing.id));
        await db.delete(coursesTable).where(eq(coursesTable.id, existing.id));
        existing = null;
      }
    }
    const courseId = existing ? existing.id : await createK12Course(c, org.id, facultyId);
    (coursesByPersona[c.persona.email] ??= []).push(courseId);
    courseIdByTitle[c.title] = courseId;
    standardsCount += c.modules.reduce((n, m) => n + m.standards.length, 0);
    // Idempotently ensure the grade tag on pre-existing courses.
    if (existing && !(existing.competencyTags ?? []).some((t) => /^\s*grade\s+\d+/i.test(t))) {
      await db.update(coursesTable).set({ competencyTags: [...(existing.competencyTags ?? []), c.gradeLabel] }).where(eq(coursesTable.id, courseId));
    }
    const hasAssign = await db.select().from(coursePartnerAssignmentsTable).where(and(eq(coursePartnerAssignmentsTable.courseId, courseId), eq(coursePartnerAssignmentsTable.partnerId, partner.id)));
    if (hasAssign.length === 0) await db.insert(coursePartnerAssignmentsTable).values({ courseId, partnerId: partner.id, assignedBy: facultyId });
    const linked = (await db.select().from(orgClassCoursesTable).where(eq(orgClassCoursesTable.classId, cls.id))).map((x) => x.courseId);
    if (!linked.includes(courseId)) await db.insert(orgClassCoursesTable).values({ classId: cls.id, courseId });
  }

  // 3b. K-12 has NO AI tutor / case studies. Courses reused from an earlier seed still carry the
  // old "Tutor:" cases on their modules, so delete every case scenario on these courses' modules.
  const k12CourseIds = Object.values(courseIdByTitle);
  if (k12CourseIds.length) {
    const k12Mods = await db.select({ id: modulesTable.id }).from(modulesTable).where(inArray(modulesTable.courseId, k12CourseIds));
    const k12ModIds = k12Mods.map((m) => m.id);
    if (k12ModIds.length) await db.delete(caseScenariosTable).where(inArray(caseScenariosTable.moduleId, k12ModIds));
  }

  // 3c. Refresh the quiz HTML AND the reading content + objectives on REUSED courses so content
  // edits actually propagate — existing courses are reused, not recreated, on reseed.
  for (const c of ALL_COURSES) {
    const cid = courseIdByTitle[c.title];
    if (!cid) continue;
    const cmods = await db.select().from(modulesTable).where(eq(modulesTable.courseId, cid)).orderBy(asc(modulesTable.order));
    for (let i = 0; i < cmods.length && i < c.modules.length; i++) {
      const m = c.modules[i];
      const modId = cmods[i].id;
      const lang = c.lang;
      await db.update(interactiveActivitiesTable)
        .set({ title: `${m.title}: quick check`, html: gameHtml(`${m.title}: quick check`, m.quiz, m.game ?? "choice", lang ?? "en") })
        .where(and(eq(interactiveActivitiesTable.moduleId, modId), eq(interactiveActivitiesTable.kind, "quiz")));
      const body = readingBody(m, lang);
      await db.update(moduleReadingsTable).set({ title: `Lesson: ${m.title}`, content: body, chars: body.length }).where(eq(moduleReadingsTable.moduleId, modId));
      await db.update(modulesTable).set({ title: m.title, objectives: [m.outcome], description: `${c.subject} · ${c.gradeLabel}. Goal: ${m.outcome}` }).where(eq(modulesTable.id, modId));
      // Converge the story beats in place (keeps beatIds → pre-filled progress intact) so a language or
      // title change propagates, and reconcile the optional video beat (remove it if the module no longer
      // has a video, add it if it gained one).
      await db.update(beatsTable).set({ title: m.title, narration: TL(lang, `${m.hook}  By the end of this lesson you'll be able to: ${m.outcome}`, `${m.hook}  Al terminar esta lección podrás: ${m.outcome}`) }).where(and(eq(beatsTable.moduleId, modId), eq(beatsTable.order, 0)));
      await db.update(beatsTable).set({ title: TL(lang, "Big ideas", "Ideas importantes"), narration: TL(lang, `Keep the question in mind: ${m.hook}`, `Ten presente la pregunta: ${m.hook}`), bulletPoints: m.points }).where(and(eq(beatsTable.moduleId, modId), eq(beatsTable.order, 1)));
      await db.update(beatsTable).set({ title: TL(lang, "You've got this", "¡Tú puedes!"), narration: TL(lang, `Nice work — you can now ${m.outcome.toLowerCase()} Try the practice, then move on.`, `¡Buen trabajo! Ya puedes ${m.outcome.toLowerCase()} Haz la práctica y sigue adelante.`) }).where(and(eq(beatsTable.moduleId, modId), eq(beatsTable.order, 2)));
      const vbeats = await db.select().from(beatsTable).where(and(eq(beatsTable.moduleId, modId), eq(beatsTable.type, "video")));
      if (!m.video && vbeats.length) {
        await db.delete(beatsTable).where(and(eq(beatsTable.moduleId, modId), eq(beatsTable.type, "video")));
      } else if (m.video && !vbeats.length) {
        await db.insert(beatsTable).values({ moduleId: modId, type: "video", order: 3, title: TL(lang, "Watch", "Ver"), narration: TL(lang, `Watch this short video, then keep going: ${m.hook}`, `Mira este video corto y luego continúa: ${m.hook}`), videoUrl: m.video });
      }
      await db.update(modulesTable).set({ beatCount: m.video ? 4 : 3 }).where(eq(modulesTable.id, modId));
    }
  }

  // 3d. Pre-attach a grade-appropriate game to each NON-young course so games are visibly part of the
  // classes out of the box (no teacher action needed). Young early/elementary courses (Mateo, Sofía,
  // Aiden) are skipped on purpose: their lesson view auto-launches the module's first activity, so a
  // bonus game must never displace the guided quiz. Idempotent: refreshed in place by title.
  // Each game's content is written to REVIEW that specific course — not generic trivia — so the game is
  // clearly relevant to the lesson it sits in.
  const gamePlan: { email: string; courseTitle: string; key: string; band: Band; instructions: string; content: Record<string, unknown> }[] = [
    { email: "maya.k12@synops-demo.test", courseTitle: "Math 6: Ratios & Rates", key: "jeopardy", band: "68",
      instructions: "Pick a value, read the clue, work it out as a team, then reveal and score. All about ratios and rates!",
      content: { title: "Ratios & Rates Jeopardy", categories: [
        { name: "Ratios", clues: [
          { value: 100, clue: "The ratio 6 cats to 9 dogs, simplified", answer: "2 to 3" },
          { value: 200, clue: "A recipe uses 2 cups flour to 3 cups sugar. Flour-to-sugar ratio?", answer: "2 : 3" },
          { value: 300, clue: "Boys to girls is 3 : 4. If there are 12 boys, how many girls?", answer: "16" } ] },
        { name: "Unit Rates", clues: [
          { value: 100, clue: "120 miles in 2 hours is how many miles per hour?", answer: "60 mph" },
          { value: 200, clue: "$6 for 3 pounds is what price per pound?", answer: "$2 per pound" },
          { value: 300, clue: "A car goes 150 miles on 5 gallons. Miles per gallon?", answer: "30 mpg" } ] },
        { name: "Proportions", clues: [
          { value: 100, clue: "Solve: 2/4 = x/8", answer: "x = 4" },
          { value: 200, clue: "3 pens cost $1.50. How much for 5 pens?", answer: "$2.50" },
          { value: 300, clue: "Map scale 1 inch = 20 miles. How far is 3.5 inches?", answer: "70 miles" } ] },
      ] } },
    { email: "leo.k12@synops-demo.test", courseTitle: "Science 6: Ecosystems", key: "feud", band: "68",
      instructions: "Read the survey question about ecosystems. Tap the answers you think are most popular — three misses ends the round.",
      content: { title: "Ecosystems Survey Feud", rounds: [
        { question: "Name a living or non-living part of an ecosystem.", answers: [{ text: "Plants", points: 32 }, { text: "Animals", points: 28 }, { text: "Water", points: 22 }, { text: "Sunlight", points: 18 }], distractors: ["Cars", "Buildings"] },
        { question: "Name a role an organism can play in a food chain.", answers: [{ text: "Producer", points: 38 }, { text: "Consumer", points: 34 }, { text: "Decomposer", points: 28 }], distractors: ["Spectator", "Referee"] },
      ] } },
    { email: "jordan.k12@synops-demo.test", courseTitle: "Writing & Argument (Grade 8)", key: "escape", band: "68",
      instructions: "You're drafting an argument essay. Unlock each step in order to finish it. Use a hint only if you're stuck.",
      content: { title: "Argument Writing Escape Room", intro: "Build a strong argument, one lock at a time, to finish your essay!", stages: [
        { prompt: "What do we call the position you are arguing for? (one word)", answer: "claim", hint: "It states plainly what you believe." },
        { prompt: "Which sentence is the STRONGEST evidence?", answer: "Studies show later start times raise attendance and grades.", choices: ["School is important.", "Studies show later start times raise attendance and grades.", "I think it's just better.", "Everyone already agrees."], hint: "Evidence is specific and factual, not an opinion." },
        { prompt: "What do we call fairly naming the other side's view and answering it? (one word)", answer: "counterargument", hint: "You bring up the objection yourself, then respond." },
      ] } },
    { email: "emma.k12@synops-demo.test", courseTitle: "Algebra I (Grade 11 support)", key: "jeopardy", band: "912",
      instructions: "Choose a value, solve as a team, then reveal and score. Straight from your Algebra I lessons.",
      content: { title: "Algebra I Jeopardy", categories: [
        { name: "Solving", clues: [
          { value: 100, clue: "Solve: x + 7 = 12", answer: "x = 5" },
          { value: 200, clue: "Solve: 3x = 21", answer: "x = 7" },
          { value: 300, clue: "Solve: 2x − 4 = 10", answer: "x = 7" } ] },
        { name: "Slope", clues: [
          { value: 100, clue: "The slope in y = 4x + 2", answer: "4" },
          { value: 200, clue: "Slope between (0, 0) and (2, 6)", answer: "3" },
          { value: 300, clue: "A line rises 6 for every run of 3. Its slope?", answer: "2" } ] },
        { name: "Functions", clues: [
          { value: 100, clue: "In y = mx + b, b is called the…", answer: "y-intercept" },
          { value: 200, clue: "If f(x) = 2x + 1, find f(3)", answer: "7" },
          { value: 300, clue: "Is y = 3x + 1 linear or nonlinear?", answer: "Linear" } ] },
      ] } },
    // Second-subject games (gamification for each learner's other class).
    { email: "maya.k12@synops-demo.test", courseTitle: "Civics 6: How Government Works", key: "jeopardy", band: "68",
      instructions: "Pick a value, read the clue about U.S. government, answer as a team, then reveal and score.",
      content: { title: "How Government Works Jeopardy", categories: [
        { name: "Branches", clues: [
          { value: 100, clue: "This branch makes the laws", answer: "Legislative" },
          { value: 200, clue: "This branch carries out and enforces the laws", answer: "Executive" },
          { value: 300, clue: "This branch interprets laws and decides what they mean", answer: "Judicial" } ] },
        { name: "Who Does It", clues: [
          { value: 100, clue: "Congress is made up of the House and the…", answer: "Senate" },
          { value: 200, clue: "This person leads the executive branch", answer: "The President" },
          { value: 300, clue: "The highest court in the judicial branch", answer: "The Supreme Court" } ] },
        { name: "Citizens", clues: [
          { value: 100, clue: "A key right that lets you choose your leaders", answer: "The right to vote" },
          { value: 200, clue: "Serving on this helps make trials fair", answer: "A jury" },
          { value: 300, clue: "Splitting power so no branch gets too strong is called…", answer: "Separation of powers" } ] },
      ] } },
    { email: "leo.k12@synops-demo.test", courseTitle: "World History 6: Early Civilizations", key: "feud", band: "68",
      instructions: "Read the survey question about early civilizations. Tap the answers you think are most popular — three misses ends the round.",
      content: { title: "Early Civilizations Survey Feud", rounds: [
        { question: "Name something a river gave to early people.", answers: [{ text: "Water", points: 40 }, { text: "Food/farming", points: 30 }, { text: "Travel by boat", points: 18 }, { text: "Rich soil", points: 12 }], distractors: ["Gold", "Ice"] },
        { question: "Name an invention of early civilizations.", answers: [{ text: "Writing", points: 38 }, { text: "The wheel", points: 34 }, { text: "Written laws", points: 28 }], distractors: ["The internet", "Cars"] },
      ] } },
    { email: "jordan.k12@synops-demo.test", courseTitle: "U.S. History 8: The Constitution", key: "escape", band: "68",
      instructions: "You're unlocking the story of the Constitution. Solve each step in order. Use a hint only if you're stuck.",
      content: { title: "The Constitution Escape Room", intro: "Unlock the key ideas of the Constitution, one lock at a time!", stages: [
        { prompt: "The first plan of government that was too weak was the Articles of…", answer: "confederation", hint: "It comes before the Constitution and starts with C." },
        { prompt: "Which idea divides government into three branches?", answer: "Separation of powers", choices: ["Separation of powers", "Freedom of speech", "The Bill of Rights", "Federal taxes"], hint: "Each branch gets a separate job." },
        { prompt: "The first ten amendments are called the Bill of…", answer: "rights", hint: "It protects freedoms like speech and religion." },
      ] } },
    { email: "emma.k12@synops-demo.test", courseTitle: "U.S. Government (Grade 11): Foundations of Democracy", key: "jeopardy", band: "912",
      instructions: "Choose a value, answer as a team, then reveal and score. Straight from your U.S. Government lessons.",
      content: { title: "Foundations of Democracy Jeopardy", categories: [
        { name: "Power", clues: [
          { value: 100, clue: "Dividing power among three branches is called…", answer: "Separation of powers" },
          { value: 200, clue: "Dividing power between the nation and the states is called…", answer: "Federalism" },
          { value: 300, clue: "The system that lets each branch limit the others", answer: "Checks and balances" } ] },
        { name: "Lawmaking", clues: [
          { value: 100, clue: "A proposed law is called a…", answer: "Bill" },
          { value: 200, clue: "To advance, a bill must pass both the House and the…", answer: "Senate" },
          { value: 300, clue: "The President rejecting a bill is called a…", answer: "Veto" } ] },
        { name: "Citizens", clues: [
          { value: 100, clue: "The most common way citizens choose representatives", answer: "Voting" },
          { value: 200, clue: "Congress can override a veto with this fraction vote", answer: "Two-thirds" },
          { value: 300, clue: "Groups that organize to influence policy are called interest…", answer: "Groups" } ] },
      ] } },
  ];
  for (const g of gamePlan) {
    const cid = courseIdByTitle[g.courseTitle];
    if (!cid) continue;
    const tpl = GAME_TEMPLATES.find((t) => t.key === g.key);
    if (!tpl) continue;
    const [firstMod] = await db.select().from(modulesTable).where(eq(modulesTable.courseId, cid)).orderBy(asc(modulesTable.order)).limit(1);
    if (!firstMod) continue;
    const title = `🎮 Class Game: ${g.content.title as string}`;
    const html = tpl.build(g.content);
    // Remove any earlier pre-attached class game on this module with a different (e.g. generic) title,
    // so reseeding swaps stale demo games for the current relevant one instead of stacking duplicates.
    await db.delete(interactiveActivitiesTable).where(and(
      eq(interactiveActivitiesTable.moduleId, firstMod.id), eq(interactiveActivitiesTable.kind, "game"),
      like(interactiveActivitiesTable.title, "🎮 Class Game:%"), ne(interactiveActivitiesTable.title, title),
    ));
    const existing = await db.select().from(interactiveActivitiesTable).where(and(eq(interactiveActivitiesTable.moduleId, firstMod.id), eq(interactiveActivitiesTable.title, title)));
    if (existing[0]) {
      await db.update(interactiveActivitiesTable).set({ html, instructions: g.instructions, updatedAt: new Date() }).where(eq(interactiveActivitiesTable.id, existing[0].id));
    } else {
      await db.insert(interactiveActivitiesTable).values({
        organisationId: org.id, courseId: cid, moduleId: firstMod.id,
        title, instructions: g.instructions, html, source: "html", kind: "game",
        bloomsLevel: "Apply", difficulty: "intermediate", isLibrary: false,
        tags: ["game", `game:${g.key}`, `band:${g.band}`], published: true, createdByUserId: facultyId,
      });
    }
  }

  // 3e. A coach-assisted "Math Coach" activity for the Grade-6 math class: interactive problems with a
  // draggable number line and a Socratic coach that hints (never gives the answer). Its own surface at
  // /math-coach/:id, so it is stored as kind "math-coach" with the problems as JSON.
  const mcCourseId = courseIdByTitle["Math 6: Ratios & Rates"];
  if (mcCourseId) {
    const [mcMod] = await db.select().from(modulesTable).where(eq(modulesTable.courseId, mcCourseId)).orderBy(asc(modulesTable.order)).limit(1);
    if (mcMod) {
      const problems = { problems: [
        { prompt: "120 miles in 2 hours is how many miles per hour?", answer: "60", kind: "number", min: 0, max: 120, hint: "Divide the miles by the number of hours." },
        { prompt: "$6 for 3 pounds. What is the price per pound, in dollars?", answer: "2", kind: "number", min: 0, max: 10, hint: "Divide the total cost by the number of pounds." },
        { prompt: "The ratio of boys to girls is 3 to 4. If there are 12 boys, how many girls are there?", answer: "16", kind: "number", min: 0, max: 30, visual: "bar", bars: [{ label: "Boys", units: 3 }, { label: "Girls", units: 4 }], hint: "Make the Boys bar equal 12. What is each unit worth? Now read the Girls bar." },
        { prompt: "A car travels 150 miles on 5 gallons. How many miles per gallon is that?", answer: "30", kind: "number", min: 0, max: 60, hint: "Miles divided by gallons." },
        { prompt: "3 pens cost $1.50. How much do 5 pens cost, in dollars?", answer: "2.5", kind: "number", min: 0, max: 5, hint: "Find the cost of one pen first, then multiply by 5." },
        { prompt: "A map scale is 1 inch = 20 miles. How many miles is 3 inches?", answer: "60", kind: "number", min: 0, max: 100, hint: "Multiply the number of inches by 20." },
      ] };
      const title = "🧮 Math Coach: Ratios & Rates";
      const html = JSON.stringify(problems);
      const existing = await db.select().from(interactiveActivitiesTable).where(and(eq(interactiveActivitiesTable.moduleId, mcMod.id), eq(interactiveActivitiesTable.title, title)));
      if (existing[0]) {
        await db.update(interactiveActivitiesTable).set({ html, updatedAt: new Date() }).where(eq(interactiveActivitiesTable.id, existing[0].id));
      } else {
        await db.insert(interactiveActivitiesTable).values({
          organisationId: org.id, courseId: mcCourseId, moduleId: mcMod.id, title,
          instructions: "Solve each problem. Drag the dot on the number line or type your answer. Stuck? Ask the coach — it helps you with hints, never the answer!",
          html, source: "html", kind: "math-coach", bloomsLevel: "Apply", difficulty: "intermediate",
          isLibrary: false, tags: ["math-coach", "game:mathcoach", "band:68", "subject:Math"], published: true, createdByUserId: facultyId,
        });
      }
    }
  }

  // 3f. A balance-scale Math Coach for the Grade-11 Algebra class: solve linear equations by keeping
  // the scale balanced (do the same to both sides), with Socratic coaching.
  const algCourseId = courseIdByTitle["Algebra I (Grade 11 support)"];
  if (algCourseId) {
    const [algMod] = await db.select().from(modulesTable).where(eq(modulesTable.courseId, algCourseId)).orderBy(asc(modulesTable.order)).limit(1);
    if (algMod) {
      const problems = { problems: [
        { prompt: "Solve for x:  2x + 3 = 11", answer: "4", kind: "number", min: 0, max: 12, visual: "balance", eq: { a: 2, b: 3, c: 11 }, hint: "First get the x-boxes by themselves — clear the +3." },
        { prompt: "Solve for x:  4x = 20", answer: "5", kind: "number", min: 0, max: 12, visual: "balance", eq: { a: 4, b: 0, c: 20 }, hint: "Divide both sides by 4." },
        { prompt: "Solve for x:  3x − 6 = 9", answer: "5", kind: "number", min: 0, max: 12, visual: "balance", eq: { a: 3, b: -6, c: 9 }, hint: "Add 6 to both sides first, then divide." },
        { prompt: "Solve for x:  2x − 4 = 10", answer: "7", kind: "number", min: 0, max: 15, visual: "balance", eq: { a: 2, b: -4, c: 10 }, hint: "Add 4 to both sides, then divide by 2." },
        { prompt: "The slope of  y = 4x + 2  is…", answer: "4", kind: "number", min: 0, max: 10, hint: "In y = mx + b, m is the slope." },
        { prompt: "If  f(x) = 2x + 1,  find f(3).", answer: "7", kind: "number", min: 0, max: 15, hint: "Put 3 in place of x, then work it out." },
      ] };
      const title = "🧮 Math Coach: Solving Equations";
      const html = JSON.stringify(problems);
      const existing = await db.select().from(interactiveActivitiesTable).where(and(eq(interactiveActivitiesTable.moduleId, algMod.id), eq(interactiveActivitiesTable.title, title)));
      if (existing[0]) {
        await db.update(interactiveActivitiesTable).set({ html, updatedAt: new Date() }).where(eq(interactiveActivitiesTable.id, existing[0].id));
      } else {
        await db.insert(interactiveActivitiesTable).values({
          organisationId: org.id, courseId: algCourseId, moduleId: algMod.id, title,
          instructions: "Solve each equation by keeping the scale balanced — do the same to both sides until one x is left. Stuck? Ask the coach for a hint.",
          html, source: "html", kind: "math-coach", bloomsLevel: "Apply", difficulty: "advanced",
          isLibrary: false, tags: ["math-coach", "game:mathcoach", "band:912", "subject:Math"], published: true, createdByUserId: facultyId,
        });
      }
    }
  }

  // 4. Teacher (admin) + class staff.
  const adminId = await upsertUser({ email: K12_ADMIN_EMAIL, firstName: "Ms.", lastName: "Ramírez", role: "partner_admin", partnerId: partner.id, organisationId: null });
  const existingStaff = (await db.select().from(orgClassStaffTable).where(eq(orgClassStaffTable.classId, cls.id))).map((s) => s.staffId);
  if (!existingStaff.includes(adminId)) await db.insert(orgClassStaffTable).values({ classId: cls.id, staffId: adminId, role: "administrator" as const });

  // 5. Personas: each enrolled in BOTH of their courses (two subjects). Persona-level pass first
  //    (user, roster, reconcile enrolments to exactly this learner's course set), then a course-level
  //    pass for per-course progress, badges, and demo submissions.
  const uniqueEmails = [...new Set(ALL_COURSES.map((c) => c.persona.email))];
  const planEmails = uniqueEmails;
  const learnerIdByEmail: Record<string, string> = {};

  // 5a. Persona-level.
  for (const email of uniqueEmails) {
    const p = (ALL_COURSES.find((c) => c.persona.email === email) as K12Course).persona;
    const learnerId = await upsertUser({ email: p.email, firstName: p.firstName, lastName: p.lastName, role: "learner", partnerId: partner.id, organisationId: org.id, learningStyle: p.learningStyle, accommodations: p.accommodations });
    learnerIdByEmail[email] = learnerId;
    const myCourseIds = coursesByPersona[email] ?? [];

    // Reconcile: remove enrolments/progress for any course NOT in this learner's two-subject set.
    const enrolled = await db.select().from(enrolmentsTable).where(eq(enrolmentsTable.userId, learnerId));
    const staleCourseIds = enrolled.map((e) => e.courseId).filter((id) => !myCourseIds.includes(id));
    if (staleCourseIds.length) {
      await db.delete(enrolmentsTable).where(and(eq(enrolmentsTable.userId, learnerId), inArray(enrolmentsTable.courseId, staleCourseIds)));
      await db.delete(beatProgressTable).where(and(eq(beatProgressTable.userId, learnerId), inArray(beatProgressTable.courseId, staleCourseIds)));
      await db.delete(credentialsTable).where(eq(credentialsTable.userId, learnerId)); // clears badges from old courses
    }
    // Enrol in each of their courses.
    const enrolledIds = new Set(enrolled.map((e) => e.courseId));
    for (const cid of myCourseIds) {
      if (!enrolledIds.has(cid)) await db.insert(enrolmentsTable).values({ userId: learnerId, courseId: cid, status: "active" as const, enrolledAt: daysAgo(20) });
    }
    // Add the learner to the class roster so the Class Insights dashboard sees them.
    const inClass = await db.select().from(orgClassLearnersTable).where(and(eq(orgClassLearnersTable.classId, cls.id), eq(orgClassLearnersTable.learnerId, learnerId)));
    if (!inClass.length) await db.insert(orgClassLearnersTable).values({ classId: cls.id, learnerId });
  }

  // 5b. Course-level: pre-fill progress (each course to its own fraction), Maya's badge, and demo
  //     submissions for EVERY learner across BOTH subjects (quizzes + games + Math Coach) so each
  //     subject shows real assessed mastery on the accreditation/commendations report.
  const subPlan: Record<string, { score: number; days: number }> = {
    "mateo.k12@synops-demo.test": { score: 80, days: 4 },
    "sofia.k12@synops-demo.test": { score: 78, days: 5 },
    "aiden.k12@synops-demo.test": { score: 88, days: 2 },
    "maya.k12@synops-demo.test": { score: 92, days: 1 },
    "leo.k12@synops-demo.test": { score: 68, days: 3 },
    "jordan.k12@synops-demo.test": { score: 54, days: 9 },
    "emma.k12@synops-demo.test": { score: 85, days: 2 },
  };
  for (const c of ALL_COURSES) {
    const p = c.persona;
    const learnerId = learnerIdByEmail[p.email];
    const cid = courseIdByTitle[c.title];
    if (!learnerId || !cid) continue;

    const mods = await db.select().from(modulesTable).where(eq(modulesTable.courseId, cid)).orderBy(asc(modulesTable.order));
    const beats: { beatId: string; moduleId: string }[] = [];
    for (const m of mods) {
      const bs = await db.select().from(beatsTable).where(eq(beatsTable.moduleId, m.id)).orderBy(asc(beatsTable.createdAt));
      for (const b of bs) beats.push({ beatId: b.id, moduleId: m.id });
    }
    const viewCount = Math.round(beats.length * p.progressFraction);
    if (viewCount > 0) {
      const rows = beats.slice(0, viewCount).map((b, idx) => ({ userId: learnerId, beatId: b.beatId, moduleId: b.moduleId, courseId: cid, secondsSpent: 40 + (idx % 4) * 15, firstViewedAt: daysAgo(14), lastViewedAt: daysAgo(2) }));
      try { await db.insert(beatProgressTable).values(rows).onConflictDoNothing(); } catch { /* cosmetic */ }
    }
    // Maya (on-track) earns a badge for her first Math module.
    if (c.title === "Math 6: Ratios & Rates" && mods[0]) {
      const has = await db.select().from(credentialsTable).where(and(eq(credentialsTable.userId, learnerId), eq(credentialsTable.moduleId, mods[0].id)));
      if (has.length === 0) await db.insert(credentialsTable).values({ userId: learnerId, moduleId: mods[0].id, moduleTitle: mods[0].title, partnerId: partner.id, partnerName: "Synops Academy", status: "valid", masteryScore: "0.9100", evidenceSummary: "Completed the lesson and passed the check.", decayDate: daysFromNow(365) });
    }

    const sp = subPlan[p.email];
    if (sp) {
      const gacts = await db.select({ id: interactiveActivitiesTable.id, kind: interactiveActivitiesTable.kind }).from(interactiveActivitiesTable)
        .where(and(eq(interactiveActivitiesTable.courseId, cid), inArray(interactiveActivitiesTable.kind, ["quiz", "game", "math-coach"])));
      for (const a of gacts) {
        await db.delete(activitySubmissionsTable).where(and(eq(activitySubmissionsTable.userId, learnerId), eq(activitySubmissionsTable.activityId, a.id)));
        const score = a.kind === "math-coach" ? Math.max(40, sp.score - 8) : sp.score;
        await db.insert(activitySubmissionsTable).values({ userId: learnerId, activityId: a.id, payload: { demo: true }, score: String(score), submittedAt: daysAgo(sp.days) });
      }
    }
  }

  return {
    ok: true, partnerId: partner.id, courses: ALL_COURSES.length, learners: planEmails.length, standards: standardsCount,
    message: `Synops Academy K-12 ready: ${ALL_COURSES.length} courses (2 subjects × ${planEmails.length} learners), ${standardsCount} standards. Password ${DEMO_PASSWORD}.`,
  };
}
