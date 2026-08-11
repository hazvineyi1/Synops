import { db } from "@workspace/db";
import {
  partnersTable, brandThemesTable, organisationsTable, usersTable,
  coursesTable, modulesTable, beatsTable, moduleReadingsTable,
  caseScenariosTable, interactiveActivitiesTable, discussionsTable, assignmentsTable,
  coursePartnerAssignmentsTable, enrolmentsTable, activitySubmissionsTable,
  orgClassesTable, orgClassCoursesTable, orgClassStaffTable, orgClassLearnersTable,
  beatProgressTable, credentialsTable,
  unitStandardsTable, unitStandardMappingsTable,
  interactiveVideoQuestionsTable,
} from "@workspace/db";
import { eq, and, asc, inArray, ne, like } from "drizzle-orm";
import { hashPassword } from "../lib/auth";
import { PRIVACY_POLICY_VERSION } from "../lib/popia";
import { GAME_TEMPLATES, type Band } from "./gameTemplates";

/**
 * Public K-12 demo tenant "Synops Academy", the investor/prospect link at
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
  standards: Std[]; quiz: { q: string; options: string[]; answer: number; img?: string; emoji?: string }[];
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

// Real photos on a quiz ONLY where a photo is genuinely on-topic, currently the science modules,
// where the objects (fish, tree, sun, ball) actually illustrate the concept. Everything else carries
// its visuals a better way: the young reading course has real picture-words, young math uses countable
// emoji in the questions, and every class has a curated video clip + a themed game. This avoids the
// "recycled / not applicable" problem of stamping a generic photo onto abstract questions.
const MODULE_IMAGES: Record<string, string[]> = {
  "Food webs": ["fish", "tree", "sun"],
  "Energy flow": ["sun", "fish", "tree"],
  "Speed and Energy of Motion": ["ball", "sun"],
  "How Energy Moves From Place to Place": ["sun", "ball"],
};

// Demo interactive checkpoints, a question that pops mid-clip on a few Khan videos so the clips are
// active, not passive. Keyed by module title. (Teachers add their own via the module video panel.)
const VIDEO_CHECKPOINTS: Record<string, { t: number; stem: string; options: string[]; correct: number; feedback: string }[]> = {
  "Ratios and rates": [{ t: 45, stem: "A ratio compares two amounts. Which shows the ratio of 2 cats to 3 dogs?", options: ["2 to 3", "3 to 2", "2 + 3", "5"], correct: 0, feedback: "Right, a ratio compares the two amounts, in order." }],
  "Why Civilizations Began Near Rivers": [{ t: 30, stem: "Why did the first cities grow up next to rivers?", options: ["For water and good farmland", "To hide from enemies", "To find gold", "Purely by chance"], correct: 0, feedback: "Exactly, rivers gave water and rich soil for farming." }],
  "Food webs": [{ t: 40, stem: "In a food web, where does the energy start?", options: ["The sun and plants", "Top predators", "Decomposers only", "Rocks and soil"], correct: 0, feedback: "Yes, energy flows from the sun to plants, then onward." }],
  "The Three Branches of Government": [
    { t: 35, stem: "Which branch of government makes the laws?", options: ["The legislative branch", "The executive branch", "The judicial branch", "The military"], correct: 0, feedback: "Yes, Congress, the legislative branch, writes the laws." },
    { t: 75, stem: "Why did the framers split the government into three branches?", options: ["To keep any one branch from becoming too powerful", "To make voting slower", "To copy other countries", "To give the President all the power"], correct: 0, feedback: "Exactly, separating the powers keeps the branches in balance." }],
  "Why the Framers Wrote the Constitution": [
    { t: 35, stem: "What was the main problem with the Articles of Confederation?", options: ["The national government was too weak", "It gave the President too much power", "It created too many courts", "It banned state governments"], correct: 0, feedback: "Right, the weak national government could not tax or keep order." },
    { t: 80, stem: "\"Separation of powers\" means the government is…", options: ["Divided into three branches with different jobs", "Run by one strong leader", "Controlled by the states only", "Led by the military"], correct: 0, feedback: "Correct, dividing power guards against any one part becoming a tyrant." }],
  "Solving linear equations": [
    { t: 40, stem: "To keep an equation balanced, whatever you do to one side you must also do to…", options: ["the other side", "only the left side", "the answer", "neither side"], correct: 0, feedback: "Right, do the same to BOTH sides so the equation stays balanced." },
    { t: 80, stem: "To solve 3x + 4 = 19, what is a good first step?", options: ["Subtract 4 from both sides", "Divide both sides by 4", "Add 4 to both sides", "Multiply both sides by 3"], correct: 0, feedback: "Yes, undo the +4 first, then divide by 3 to get x = 5." }],
  "Separation of Powers, Checks and Balances, and Federalism": [
    { t: 40, stem: "Separation of powers divides the government into how many branches?", options: ["Three", "Two", "One", "Five"], correct: 0, feedback: "Correct, legislative, executive, and judicial." },
    { t: 90, stem: "Federalism divides power between…", options: ["The national government and the states", "The Senate and the House", "Two political parties", "The President and the courts"], correct: 0, feedback: "Right, power is shared between the nation and the states." }],
};

// ── COURSES (one per persona; two comprehensive lessons each) ────────────────
const COURSES: K12Course[] = [
  // 0) MATEO · Grade 1 · just starting out (K-2 band) ─────────────────────────
  {
    title: "Grade 1 Reading Adventure", subject: "English Language Arts", emoji: "🔤", grade: 1, gradeLabel: "Grade 1",
    framework: "Common Core State Standards, Grade 1 Foundational Reading",
    intro: "A five-part reading adventure! Find first letters, read picture words, then spell them in a puzzle, look, tap, and earn stars.",
    outcome: "Recognize beginning letters, read common one-syllable words, and spell them.",
    tags: ["ela", "reading", "letters", "grade 1", "common core"],
    persona: { email: "mateo.k12@synops-demo.test", firstName: "Mateo", lastName: "Flores", grade: 1, gradeLabel: "Grade 1", learningStyle: "kinesthetic", accommodations: ["simplified_language", "concrete_examples", "chunked_content", "positive_reinforcement"], progressFraction: 0.15 },
    modules: [
      { title: "First letters: A B C D", outcome: "Find the first letter (A, B, C, D).", hook: "Apple starts with A! Ball starts with B!", minutes: 12,
        standards: [{ code: "CCSS.ELA-LITERACY.RF.1.1", title: "Demonstrate understanding of the organization and basic features of print" }],
        points: ["Every word starts with a letter", "Look at the picture, then find the first letter", "apple → A, ball → B, cat → C, dog → D"],
        reading: "Every word starts with a letter! 🔤\n\n**Apple** starts with **A**. A says \"ah.\" 🍎\n**Ball** starts with **B**. B says \"buh.\" ⚽\n**Cat** starts with **C**. C says \"kuh.\" 🐱\n**Dog** starts with **D**. D says \"duh.\" 🐶\n\n[[fig:letter-sound|Every letter makes a sound: A says \"ah\" like apple]]\n\nSay each letter out loud. Then look at the picture and tap its first letter. You're a letter detective! 🔎⭐",
        quiz: [
          { q: "Which letter does this word start with?", img: KID_PICS.apple, options: ["A", "E", "O", "S"], answer: 0 },
          { q: "Which letter does this word start with?", img: KID_PICS.ball, options: ["B", "D", "P", "R"], answer: 0 },
          { q: "Which letter does this word start with?", img: KID_PICS.cat, options: ["C", "O", "S", "G"], answer: 0 },
          { q: "Which letter does this word start with?", img: KID_PICS.dog, options: ["D", "B", "P", "O"], answer: 0 },
        ],
        caseContext: "", caseOpening: "" },
      { title: "First letters: F H S T", outcome: "Find the first letter (F, H, S, T).", hook: "Fish starts with F! Tree starts with T!", minutes: 12, game: "memory",
        standards: [{ code: "CCSS.ELA-LITERACY.RF.1.1", title: "Demonstrate understanding of the organization and basic features of print" }],
        points: ["More first letters", "fish → F, hat → H, sun → S, tree → T", "Look and tap the first letter"],
        reading: "More first letters! 🔤\n\n**Fish** starts with **F**. F says \"fff.\" 🐟\n**Hat** starts with **H**. H says \"huh.\" 🎩\n**Sun** starts with **S**. S says \"sss.\" ☀️\n**Tree** starts with **T**. T says \"tuh.\" 🌳\n\nSay each sound out loud. Then look at the picture and tap its first letter. Keep going, superstar! ⭐",
        quiz: [
          { q: "Which letter does this word start with?", img: KID_PICS.fish, options: ["F", "E", "T", "L"], answer: 0 },
          { q: "Which letter does this word start with?", img: KID_PICS.hat, options: ["H", "N", "M", "K"], answer: 0 },
          { q: "Which letter does this word start with?", img: KID_PICS.sun, options: ["S", "C", "Z", "E"], answer: 0 },
          { q: "Which letter does this word start with?", img: KID_PICS.tree, options: ["T", "F", "I", "L"], answer: 0 },
        ],
        caseContext: "", caseOpening: "" },
      { title: "Reading words: cat, dog, sun, hat", outcome: "Match a word to its picture.", hook: "See the picture, then tap the word that matches!", minutes: 12, game: "match",
        standards: [{ code: "CCSS.ELA-LITERACY.RF.1.3", title: "Know and apply grade-level phonics and word analysis skills in decoding words" }],
        points: ["Words name the things we see", "Look at the picture, then find the word", "You can read short words!"],
        reading: "Words name the things we see! 📖\n\nA **cat** goes \"meow.\" 🐱\nA **dog** goes \"woof.\" 🐶\nThe **sun** is bright and warm. ☀️\nA **hat** goes on your head. 🎩\n\nSound out each word slowly: c-a-t, cat! Then look at the picture and tap the word that matches. You're reading! ⭐",
        quiz: [
          { q: "Which word matches this picture?", img: KID_PICS.cat, options: ["cat", "dog", "sun", "hat"], answer: 0 },
          { q: "Which word matches this picture?", img: KID_PICS.dog, options: ["dog", "log", "dig", "day"], answer: 0 },
          { q: "Which word matches this picture?", img: KID_PICS.sun, options: ["sun", "run", "six", "sit"], answer: 0 },
          { q: "Which word matches this picture?", img: KID_PICS.hat, options: ["hat", "ham", "hop", "cat"], answer: 0 },
        ],
        caseContext: "", caseOpening: "" },
      { title: "Reading words: apple, ball, fish, tree", outcome: "Read more picture words.", hook: "Read even more words, you're a reading star!", minutes: 12, game: "find",
        standards: [{ code: "CCSS.ELA-LITERACY.RF.1.3", title: "Know and apply grade-level phonics and word analysis skills in decoding words" }],
        points: ["More picture words", "Look at the picture, then find the word", "You're a reading star!"],
        reading: "More words to read! 🌟\n\nAn **apple** is crunchy and sweet. 🍎\nA **ball** can bounce and roll. ⚽\nA **fish** swims in the water. 🐟\nA **tree** is big and tall. 🌳\n\nSound out each word slowly: f-i-sh, fish! Then look at the picture and tap the word that matches. You're a reading star! ⭐",
        quiz: [
          { q: "Which word matches this picture?", img: KID_PICS.apple, options: ["apple", "ant", "arm", "ax"], answer: 0 },
          { q: "Which word matches this picture?", img: KID_PICS.ball, options: ["ball", "bell", "bat", "bus"], answer: 0 },
          { q: "Which word matches this picture?", img: KID_PICS.fish, options: ["fish", "fox", "fan", "fig"], answer: 0 },
          { q: "Which word matches this picture?", img: KID_PICS.tree, options: ["tree", "two", "toy", "top"], answer: 0 },
        ],
        caseContext: "", caseOpening: "" },
      { title: "Word Puzzle", outcome: "Spell the words you learned.", hook: "Now for a puzzle, build the words letter by letter!", minutes: 12, game: "puzzle",
        standards: [{ code: "CCSS.ELA-LITERACY.RF.1.3", title: "Know and apply grade-level phonics and word analysis skills in decoding words" }],
        points: ["Look at the picture", "Tap the letters in the right order", "Spell the whole word!"],
        reading: "Now for a puzzle! 🧩\n\nLook at the picture. Say the word slowly. Listen for each sound. Then tap the letters in the right order to spell the word.\n\nTry **cat**: c… a… t… cat! You spelled it! 🎉\n\nTake your time. You can do it! ⭐",
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
    framework: "Common Core State Standards, Grade 3 ELA/Literacy",
    intro: "¡Una aventura de lectura en español! En cada lección lees un texto corto y juegas de una forma distinta, clasificas ideas, unes palabras con su significado y usas pistas del contexto para descubrir palabras nuevas. Todo en español (o en inglés si prefieres).",
    outcome: "Encontrar la idea principal, aprender vocabulario y usar pistas del contexto.",
    tags: ["lectura", "español", "grade 3", "common core"],
    persona: { email: "sofia.k12@synops-demo.test", firstName: "Sofía", lastName: "Ramírez", grade: 3, gradeLabel: "Grade 3", learningStyle: "visual", accommodations: ["simplified_language", "concrete_examples", "scaffolded_questions", "positive_reinforcement", "chunked_content"], progressFraction: 0.15 },
    modules: [
      { title: "La idea principal", outcome: "Distinguir la idea principal de los detalles de un texto.",
        hook: "Un texto tiene UNA idea grande y muchos detalles pequeños. ¿Puedes separarlos?", minutes: 25, video: "https://www.youtube.com/watch?v=PyCTNOq8SmU", game: "sort",
        standards: [{ code: "CCSS.ELA-LITERACY.RI.3.2", title: "Determine the main idea; recount key details" }],
        points: ["La idea principal es de qué trata CASI todo el texto", "Los detalles son datos pequeños que apoyan la idea principal", "Un texto tiene una idea principal, pero muchos detalles"],
        reading: "Cuando lees, tu cerebro busca la **idea principal**: de qué trata *casi todo* el texto. Lo demás son **detalles**, datos pequeños que dan más información sobre esa idea.\n\n[[fig:main-idea|La idea principal sostiene todos los detalles]]\n\nLee esto: *Los delfines son mamíferos marinos muy inteligentes. Usan sonidos para hablar entre ellos, nadan muy rápido y salen a la superficie para respirar aire.* La **idea principal** es que *los delfines son mamíferos muy inteligentes*. Que usen sonidos o que respiren aire son **detalles**.\n\nAhora otro: *Un volcán es una montaña que puede expulsar lava caliente. La lava es roca derretida, y algunos volcanes están escondidos bajo el mar.* ¿Cuál es la idea grande? *Un volcán puede expulsar lava.* Lo demás son detalles.\n\n**Un truco para encontrarla:** pregúntate *\"¿de qué habla el texto una y otra vez?\"* Esa repetición te lleva a la idea principal. Muchas veces está en la **primera oración** del párrafo, pero no siempre, por eso hay que leer todo.\n\n**Un ejemplo más:** *\"Las abejas son insectos muy trabajadores. Vuelan de flor en flor todo el día, hacen miel y ayudan a que crezcan las plantas.\"* La idea principal es *las abejas son muy trabajadoras*. \"Hacen miel\" y \"ayudan a las plantas\" son detalles que lo demuestran.\n\n**Aplícalo en tu vida:** cuando le cuentas a alguien de qué se trató una película, dices la idea principal, no cada escena. Así funciona también con lo que lees, y hasta cuando le cuentas tu día a tu familia.\n\n**Para recordar:** (1) lee todo el texto, (2) pregúntate de qué trata *casi todo*, (3) esa es la idea principal, (4) lo demás son detalles que la apoyan.\n\n**Piensa:** ¿cuál fue la idea principal de tu cuento favorito? Ahora, en el juego, lee cada tarjeta y decide: ¿es la **idea principal** o un **detalle**? 🕵️",
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
        hook: "Palabras nuevas: veloz, enorme, frágil… ¿sabes qué significan?", minutes: 25, game: "ememory",
        standards: [{ code: "CCSS.ELA-LITERACY.L.3.4", title: "Determine the meaning of words and phrases" }],
        points: ["Mientras más palabras conoces, mejor entiendes lo que lees", "Cada palabra tiene un significado exacto", "Une cada palabra con lo que significa"],
        reading: "Los buenos lectores conocen muchas palabras. Mientras más palabras sabes, mejor entiendes lo que lees y mejor puedes contar tus ideas. A esto le llamamos tu **vocabulario**.\n\n[[fig:word-key|Cada palabra nueva es una llave que abre más cuentos]]\n\n**Palabras nuevas de tercer grado**, fíjate cómo se usan en una oración:\n\nUn guepardo es **veloz**: corre muy rápido. Una ballena es **enorme**: es muy grande. Un vaso de vidrio es **frágil**: se rompe con facilidad. Un bombero es **valiente**: no siente miedo cuando ayuda. El sol es **brillante**: da mucha luz. Y una biblioteca es **silenciosa**: casi no hace ruido.\n\n**Palabras que significan casi lo mismo (sinónimos):** a veces dos palabras significan algo parecido. *Veloz* es parecido a *rápido*. *Enorme* es parecido a *gigante*. *Contento* es parecido a *feliz*. Conocer sinónimos te ayuda a no repetir siempre la misma palabra cuando escribes.\n\n**Cómo aprender una palabra nueva:** (1) mírala en una oración, (2) piensa qué significa, (3) dilo con tus propias palabras, y (4) úsala tú en una oración. ¡Así se te queda!\n\n**Aplícalo:** hoy, cuando leas o escuches una palabra que no conoces, pregúntale a alguien o búscala. Cada palabra nueva es como una llave que abre más cuentos.\n\nEn el juego, une cada palabra con su significado. ¡Tú puedes! 📖⭐",
        quiz: [
          { q: "veloz", options: ["muy rápido"], answer: 0, emoji: "🐆" },
          { q: "enorme", options: ["muy grande"], answer: 0, emoji: "🐋" },
          { q: "frágil", options: ["que se rompe con facilidad"], answer: 0, emoji: "🥚" },
          { q: "valiente", options: ["que no siente miedo"], answer: 0, emoji: "🦁" },
          { q: "brillante", options: ["que da mucha luz"], answer: 0, emoji: "☀️" },
          { q: "silencioso", options: ["que casi no hace ruido"], answer: 0, emoji: "🤫" },
        ],
        caseContext: "", caseOpening: "" },
      { title: "Pistas del contexto", outcome: "Usar las palabras cercanas para descubrir una palabra nueva.",
        hook: "Lees una palabra que nunca has visto. ¿Te rindes? ¡Claro que no!", minutes: 25, game: "ladder",
        standards: [{ code: "CCSS.ELA-LITERACY.L.3.4", title: "Determine the meaning of unknown words using context clues" }],
        points: ["Las pistas del contexto son las otras palabras cercanas", "Lee toda la oración, no solo la palabra difícil", "Adivina y luego revisa si tiene sentido"],
        reading: "¿Qué haces cuando encuentras una palabra que no conoces? ¡Te vuelves **detective de palabras** y buscas **pistas del contexto**, las otras palabras cercanas que te dan pistas de lo que significa!\n\n[[fig:context-clues|Las palabras cercanas son pistas para descubrir la palabra difícil]]\n\n**Ejemplo 1:** *\"El perrito era tan **tímido** que se escondió detrás del sofá cuando llegaron las visitas.\"* Aunque no conozcas la palabra **tímido**, las pistas ayudan: se *escondió* cuando llegó gente. ¡Entonces tímido significa *penoso o asustado*! Lo resolviste sin diccionario.\n\n**Ejemplo 2:** *\"La fruta estaba **madura** y dulce, lista para comer.\"* Las pistas *dulce* y *lista para comer* te dicen que **madura** significa *que ya está lista, en su punto*.\n\n**Ejemplo 3:** *\"Caminamos por un sendero **angosto**, donde solo cabía una persona a la vez.\"* Si solo cabe una persona, **angosto** significa *estrecho, no ancho*.\n\n**Tipos de pistas que puedes buscar:** a veces la oración da un *ejemplo*, a veces da lo *contrario* (\"no era grande, era diminuto\"), y a veces explica la palabra justo después.\n\n**Los 4 pasos del detective:** (1) lee toda la oración, (2) busca las pistas cercanas, (3) adivina el significado, (4) vuelve a leer para ver si tiene sentido.\n\n**Aplícalo:** la próxima vez que leas y encuentres una palabra difícil, no te saltes, ¡sé detective! En el juego, usa las pistas para descubrir cada palabra nueva. 🌟",
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
    framework: "Common Core State Standards, Grade 4 Mathematics",
    intro: "Welcome to Number Quest! Every lesson is a level. You'll earn stars for each step, follow a clear map, and always know exactly what comes next. Ready, steady, let's begin.",
    outcome: "Understand multiplication as equal groups and use arrays to find totals.",
    tags: ["math", "multiplication", "grade 4", "common core"],
    persona: { email: "aiden.k12@synops-demo.test", firstName: "Aiden", lastName: "Walsh", grade: 4, gradeLabel: "Grade 4", learningStyle: "kinesthetic", accommodations: ["predictable_structure", "chunked_content", "explicit_transitions", "positive_reinforcement", "literal_language", "extended_processing"], progressFraction: 0.5 },
    modules: [
      { title: "Level 1: Equal groups", outcome: "See multiplication as a number of equal groups.", video: "https://www.youtube.com/watch?v=RNxwasijbAo",
        hook: "4 baskets. 3 apples in each. How many apples, WITHOUT counting one by one?", minutes: 25,
        standards: [{ code: "CCSS.MATH.CONTENT.4.OA.A.1", title: "Interpret a multiplication equation as a comparison / equal groups" }],
        points: ["Multiplication is a fast way to add equal groups", "4 × 3 means 4 groups of 3", "The answer is called the product"],
        reading: "Multiplication is a fast, reliable way to add **equal groups**. An equal group is a group that has the **same number** of things in it every time.\n\n## What multiplication means\nWhen you have equal groups, you do not have to count every single object. You count the **groups**, count **how many are in each group**, and multiply. We write it with a times sign: **4 × 3** means **4 groups of 3**. The first number tells you how many groups there are. The second number tells you how many are in each group.\n\n## A worked example\nPicture **4 baskets**. Each basket has **3 apples**. You *could* count one apple at a time: 1, 2, 3, 4, 5, 6… but that is slow and easy to get wrong. Instead, think **4 groups of 3**. You can add the groups: 3 + 3 + 3 + 3 = **12**. Or you can multiply: 4 × 3 = **12**. Both give the same answer. The answer to a multiplication problem has a name: the **product**. So the product of 4 × 3 is 12.\n\n[[fig:equal-groups|Equal groups: count the groups, count how many in each, then multiply]]\n\n## The one rule: the groups must be equal\nThis is the most important rule. Every group must be the **same size**. 4 baskets with 3 apples in each works, because every basket has exactly 3. But 4 baskets where one has 3 apples, one has 5, and one has 1 does **not** work for multiplication, because the groups are not equal. When groups are not equal, you have to add them one at a time instead.\n\n## Where you see equal groups\nEqual groups are all around you. 3 packs of gum with 5 pieces each is 3 × 5 = 15 pieces. 2 hands with 5 fingers each is 2 × 5 = 10 fingers. 6 cars with 4 wheels each is 6 × 4 = 24 wheels. Once you learn to spot equal groups, you can multiply to find the total quickly.\n\n## Watch for this\nA common mistake is to **add** the two numbers instead of multiplying. 4 × 3 is **not** 4 + 3 = 7. It means 4 groups of 3, which is 12. If you read the problem as \"4 groups of 3,\" the meaning stays clear.\n\n## The big idea\nCount the groups. Count how many are in each group. Check that the groups are equal. Then multiply to find the product. That is the whole quest for this level, and you are ready. ⭐",
        quiz: [
          { q: "4 × 3 means…", options: ["4 plus 3", "4 groups of 3", "3 minus 4", "43"], answer: 1 },
          { q: "The answer to a multiplication problem is called the…", options: ["Sum", "Product", "Total groups", "Difference"], answer: 1 },
          { q: "5 bags with 2 marbles each is…", options: ["5 × 2 = 10", "5 + 2 = 7", "2 − 5", "52"], answer: 0 },
          { q: "For multiplication, the groups must be…", options: ["Different sizes", "Equal sizes", "Very big", "Empty"], answer: 1 },
        ],
        caseContext: "Aiden sees 3 plates with 4 cookies on each. He starts counting cookies one at a time. Coach him, with short, clear, literal steps and lots of encouragement, to see it as 3 groups of 4, i.e. 3 × 4 = 12. Keep each message to one small step.",
        caseOpening: "Step 1: How many plates are there? Just tell me that number." },
      { title: "Level 2: Arrays", outcome: "Use a rectangle array of rows and columns to find a total.",
        hook: "Chairs in 5 rows, 4 in each row. How many chairs?", minutes: 25,
        standards: [{ code: "CCSS.MATH.CONTENT.3.MD.C.7", title: "Relate area to multiplication using arrays of rows and columns" }],
        points: ["An array is objects lined up in rows and columns", "Rows × columns = the total", "Arrays make multiplication easy to SEE"],
        reading: "An **array** is a neat rectangle of objects lined up in **rows** and **columns**. An array turns multiplication into a picture you can actually see and count.\n\n## What an array is\nA **row** goes across, from left to right. A **column** goes down, from top to bottom. In an array, every row has the **same number** of objects, and every column has the same number too. That even, rectangle shape is what makes an array so useful: because the rows are equal, you can multiply.\n\n## A worked example\nImagine a classroom with **5 rows** of chairs and **4 chairs in each row**. You do not need to count every chair. Count the **rows** (5) and count how many are in **each row** (4), then multiply: **rows × columns = 5 × 4 = 20** chairs. If you counted by hand you would also get 20, but multiplying is faster and you are less likely to make a mistake.\n\n[[fig:array|An array lines things up in rows and columns; rows × columns = the total]]\n\n## Rows times columns\nThe rule for every array is the same: **rows × columns = the total**. 3 rows of 6 stickers is 3 × 6 = 18 stickers. An egg carton with 2 rows of 6 eggs is 2 × 6 = 12 eggs. It does not matter what the objects are; if they sit in equal rows and columns, you multiply the two numbers.\n\n## Arrays in real life\nArrays are everywhere once you look: eggs in a carton, windows on a building, tiles on a floor, chocolate squares in a bar, and desks in a classroom. Each of these is a rectangle of equal rows, so each one is a multiplication waiting to happen.\n\n## Watch for this\nBe careful to multiply, not add. 5 rows of 4 is 5 × 4 = 20, not 5 + 4 = 9. Also make sure the rows really are equal; if the last row is missing a chair, the array is not complete, and you would need to subtract the empty spot.\n\n## The big idea\nCount the rows. Count how many are in each row. Multiply rows × columns to get the total. That single rule solves every array. Level complete! 🏆",
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
    framework: "Common Core State Standards, Grade 6 Mathematics",
    intro: "Sixth-grade math describes the real world: how fast, how much, how many for how many. In two lessons you'll master ratios and rates using playlists, recipes, and road trips.",
    outcome: "Use ratios and unit rates to solve real-world problems.",
    tags: ["math", "ratios", "rates", "grade 6", "common core"],
    persona: { email: "maya.k12@synops-demo.test", firstName: "Maya", lastName: "Chen", grade: 6, gradeLabel: "Grade 6", learningStyle: "reading_writing", accommodations: [], progressFraction: 0.75 },
    modules: [
      { title: "Ratios and rates", outcome: "Describe a relationship with a ratio and find a unit rate.", video: "https://www.youtube.com/watch?v=bIKmw0aTmYc",
        hook: "Your playlist plays 3 songs every 12 minutes. How long for 10 songs?", minutes: 25,
        standards: [{ code: "CCSS.MATH.CONTENT.6.RP.A.1", title: "Understand the concept of a ratio and use ratio language" }, { code: "CCSS.MATH.CONTENT.6.RP.A.2", title: "Understand unit rate and use rate language" }],
        points: ["A ratio compares two amounts, written 3:12, 3/12, or '3 to 12', order matters", "Equivalent ratios describe the same relationship at a different scale (3:12 = 1:4)", "A unit rate is the 'per one' amount, divide to find it", "Once you have the unit rate, scale up or down by multiplying", "Unit rates let you compare things that aren't the same size (the 'better buy')"],
        reading: "When you say \"3 songs every 12 minutes,\" \"2 cups of flour for every 3 eggs,\" or \"$5 for 3 tacos,\" you are using a **ratio**, a comparison of two amounts. This lesson builds the one routine that solves them all.\n\n## What a ratio is\nA **ratio** compares two quantities. If a playlist plays **3 songs every 12 minutes**, the ratio of songs to minutes is **3 to 12**. You can write the same ratio three ways: in words (**3 to 12**), with a colon (**3 : 12**), or as a fraction (**3/12**).\n\n[[fig:ratio-tape|A ratio compares two amounts, like 2 cats to 3 dogs, written 2 : 3]]\n\n**Order matters.** \"Songs to minutes\" is 3 : 12, but \"minutes to songs\" is 12 : 3. Always read which quantity comes first.\n\n## Equivalent ratios\nJust like fractions, ratios can be **simplified**. Divide both numbers by the same amount: 3 : 12 → divide both by 3 → **1 : 4**. So \"3 songs to 12 minutes\" is the *same relationship* as \"1 song to 4 minutes.\" These are **equivalent ratios**, the same rate at a different scale.\n\nA **ratio table** lists equivalent ratios so you can read any answer straight off it: 1 song = 4 min, 2 songs = 8 min, 3 songs = 12 min, 5 songs = 20 min, 10 songs = **40 min**. Every pair keeps the same relationship.\n\n## Unit rate: \"per one\"\nA **unit rate** answers **\"how much for exactly one?\"** You find it by **dividing**: 12 minutes ÷ 3 songs = **4 minutes per song**. Once you know the unit rate, every question becomes a single multiplication: 10 songs → 10 × 4 = **40 minutes**; 7 songs → 7 × 4 = **28 minutes**.\n\n## Worked example, a recipe\nA recipe uses **2 cups of flour for 3 eggs**. How much flour for **9 eggs**?\n1. Relationship: flour : eggs = 2 : 3.\n2. 9 eggs is 3 × 3 eggs, so multiply the flour by 3 as well: 2 × 3 = **6 cups**.\nCheck with a unit rate: 2 ÷ 3 ≈ 0.67 cups per egg; 9 × 0.67 ≈ 6 cups. ✓\n\n## Worked example, the better buy\nRates help you make real decisions. A 12-ounce juice costs $3.00; a 20-ounce juice costs $4.40. Which is the better deal? Find the **price per ounce** (the unit rate): $3.00 ÷ 12 = **$0.25 per ounce**; $4.40 ÷ 20 = **$0.22 per ounce**. The 20-ounce bottle costs less per ounce, so it's the better buy. Unit rates let you compare things that aren't the same size.\n\n## Watch for this\nThe most common slip is dividing the wrong way. \"Minutes per song\" divides minutes by songs; \"songs per minute\" divides songs by minutes. Decide which \"per one\" you want **before** you divide.\n\n## The big idea\nSet up the ratio in the right order → find the unit rate by dividing → scale up or down by multiplying. That one routine, **ratio, divide, multiply**, solves rates everywhere: miles per hour, points per game, price per ounce.",
        quiz: [
          { q: "A recipe uses 2 cups flour for 3 eggs. The ratio of flour to eggs is…", options: ["3:2", "2:3", "2:5", "6:1"], answer: 1 },
          { q: "Simplify the ratio 6:9 to its simplest form.", options: ["3:2", "2:3", "6:9", "1:2"], answer: 1 },
          { q: "150 miles on 5 gallons is a unit rate of…", options: ["30 mpg", "150 mpg", "5 mpg", "75 mpg"], answer: 0 },
          { q: "3 songs take 12 min. How long for 9 songs?", options: ["24 min", "27 min", "36 min", "40 min"], answer: 2 },
          { q: "Which is the SAME ratio as 4:6?", options: ["2:3", "6:4", "8:10", "4:12"], answer: 0 },
          { q: "A 12-ounce juice costs $3.00. What is the price per ounce?", options: ["$0.25", "$0.36", "$2.50", "$4.00"], answer: 0 },
          { q: "A car travels 60 miles in 1 hour. How far in 4 hours at the same rate?", options: ["240 miles", "120 miles", "64 miles", "15 miles"], answer: 0 },
          { q: "Which is the better buy (lower price per ounce)?", options: ["$4 for 8 oz", "$5 for 20 oz", "They cost the same", "You can't tell"], answer: 1 },
        ],
        caseContext: "A food truck sells 3 tacos for $5. A classmate says 9 tacos should be $15 and 12 tacos $20. Walk Maya through checking this with a unit rate and a ratio table, and where the reasoning could slip.",
        caseOpening: "Before we calculate, what stays the same no matter how many tacos you buy?" },
      { title: "Solving rate problems", outcome: "Use a ratio table or unit rate to solve a multi-step problem.",
        hook: "Which is the better buy: 12 oz for $3, or 20 oz for $4.60?", minutes: 25,
        standards: [{ code: "CCSS.MATH.CONTENT.6.RP.A.3", title: "Use ratio and rate reasoning to solve real-world problems" }],
        points: ["A ratio table scales both numbers together", "Compare unit rates to find the better deal", "Watch the units, dollars per ounce vs ounces per dollar"],
        reading: "Once you understand ratios and unit rates, the next step is using them to solve real, multi-step problems: comparing deals, scaling recipes, and planning trips. The secret is to stay **organized** so the numbers never get tangled.\n\n## Ratio tables keep numbers in step\nA **ratio table** lists equivalent ratios side by side. Its one rule keeps you honest: whatever you multiply the top row by, you must multiply the bottom row by too. Because both rows move together, every column shows the same relationship, and you can read any answer straight off the table.\n\n## Worked example: a ratio table\nA printer makes 4 pages every 10 seconds. How long for 20 pages? Build a table starting at 4 pages : 10 seconds. Multiply both by 5: 20 pages : **50 seconds**. Or find the unit rate first (10 ÷ 4 = 2.5 seconds per page) and multiply: 20 × 2.5 = 50 seconds. Same answer, two organized paths.\n\n## Unit rates and the better buy\nFor 'better buy' problems, find the **unit rate**, the price for exactly one unit, for each option, then compare. The lower price per unit is the better deal, even if its total price is higher.\n\n## Worked example: the better buy\nOption A: 12 ounces for $3.00 → $3.00 ÷ 12 = **$0.25 per ounce**. Option B: 20 ounces for $4.60 → $4.60 ÷ 20 = **$0.23 per ounce**. Option B costs less **per ounce**, so it is the better buy, even though it costs more in total. Buying more only saves money if the price per unit is lower.\n\n[[fig:double-number-line|A double number line pairs two quantities so you can read a unit rate and compare deals]]\n\n## Watch your units\nThe most common slip is comparing the wrong thing. 'Dollars per ounce' and 'ounces per dollar' answer different questions and can point to opposite winners. Decide which unit rate you want **before** you divide, compute it the same way for every choice, then compare like with like.\n\n## The big idea\nOrganize with a ratio table or a unit rate, keep both quantities in step, and always compare the same unit. Do that and you can solve any rate problem: best deals, recipe scaling, speed, and more.",
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
    framework: "Next Generation Science Standards, Middle School Life Science",
    intro: "Every living thing is connected. In two short lessons you'll map how energy flows through a food web and see why changing one thing changes everything.",
    outcome: "Model how energy flows through an ecosystem and predict the effect of a change.",
    tags: ["science", "ecosystems", "food web", "grade 6", "ngss"],
    persona: { email: "leo.k12@synops-demo.test", firstName: "Leo", lastName: "Rivera", grade: 6, gradeLabel: "Grade 6", learningStyle: "auditory", accommodations: ["simplified_language", "chunked_content", "scaffolded_questions", "extended_processing", "concrete_examples", "positive_reinforcement"], progressFraction: 0.4 },
    modules: [
      { title: "Food webs", outcome: "Trace how energy moves from the sun to plants to animals.", video: "https://www.youtube.com/watch?v=qIgL05zOx5U",
        hook: "Grass never chases anything. So where does a hawk's energy really come from?", minutes: 25,
        standards: [{ code: "NGSS.MS-LS2-3", title: "Develop a model to describe the cycling of matter and flow of energy" }],
        points: ["Producers (plants) capture the sun's energy", "Energy flows: producers → herbivores → predators", "A food web links many food chains together"],
        reading: "Every ecosystem runs on energy. And that energy starts in one place: the **sun**. Let's follow it, one step at a time.\n\n## It all starts with the sun\nThe sun pours energy onto Earth every day. Living things cannot use sunlight directly as food, though. Something has to catch it first and turn it into food. That job belongs to the producers.\n\n## Producers make the food\n**Producers** are plants and algae. They catch sunlight and use it to make their own food. Because they make food, producers are the **base** of every food chain. Grass, trees, and tiny algae are all producers.\n\n[[fig:food-web|Energy flows one way: Sun → Plant → Bug → Bird]]\n\n## Consumers eat to get energy\n**Consumers** cannot make their own food, so they eat. A **herbivore**, like a mouse or a grasshopper, eats plants. A **predator**, like a snake or a hawk, eats other animals. Either way, eating is how a consumer gets its energy.\n\n## Following a food chain\nNow answer the hook. A hawk's energy did not come from nowhere. Follow it back: **sun → grass → mouse → snake → hawk**. The grass caught the sun's energy. The mouse ate the grass. The snake ate the mouse. The hawk ate the snake. Energy **flows one way**, from the sun up the chain.\n\n## From chains to a web\nMost animals eat more than one thing. A mouse might be eaten by a snake, a hawk, or an owl. When you link many food chains together, you get a **food web**. A web shows how all the living things in a place are connected.\n\n## Watch for this\nEnergy flows **one way**, from the sun to producers to consumers. It does not flow backward. A hawk does not send energy back to the grass. Also, producers get their energy from the **sun**, not from the soil or from eating other plants.\n\n## The big idea\nEverything is connected. Follow the arrows in a food web and you can trace any animal's energy all the way back to the sun.",
        quiz: [
          { q: "Producers get their energy from…", options: ["Eating animals", "The sun", "The soil only", "Other producers"], answer: 1 },
          { q: "Energy in a food chain flows…", options: ["In a circle", "One way, from producers to consumers", "From predators to plants", "Randomly"], answer: 1 },
          { q: "A mouse that eats seeds is a…", options: ["Producer", "Herbivore (consumer)", "Predator only", "The sun"], answer: 1 },
          { q: "A food web is…", options: ["One single chain", "Many food chains linked together", "A spider's home", "A list of plants"], answer: 1 },
        ],
        caseContext: "In a meadow web, hawks eat snakes, snakes eat mice, mice eat grass. Leo thinks removing the hawks changes nothing. Coach him, in short, simple steps with concrete examples and extra thinking time, to trace what happens to snakes, then mice, then grass.",
        caseOpening: "Take your time. If the hawks are gone, which animal is suddenly safer, snakes or mice?" },
      { title: "Energy flow", outcome: "Explain why there are fewer predators than prey.",
        hook: "Why are there tons of grasshoppers but only a few hawks?", minutes: 25,
        standards: [{ code: "NGSS.MS-LS2-1", title: "Analyze data for the effects of resource availability on organisms" }],
        points: ["Energy is lost as heat at every step", "Only some energy passes to the next level", "So each level up has fewer living things"],
        reading: "Here is a puzzle. In one field there are **thousands** of grasshoppers, **hundreds** of frogs, but only a **few** hawks. Why are there so many small animals and so few big ones? Let's find out, step by step.\n\n## A puzzle in the field\nCount the living things at each level of a food chain and you always see the same shape: lots at the bottom, fewer in the middle, and very few at the top. This is true in a field, a forest, or an ocean. Something must be limiting how many big animals a place can feed.\n\n## Energy is lost at every step\nThe answer is **energy loss**. At every step of a food chain, an animal uses most of its energy just to live: moving, breathing, staying warm, growing. That used-up energy leaves the body as **heat**. Only a small part of the energy, often only about one-tenth, is stored and passed on to the next animal that eats it.\n\n## Less energy as you go up\nSo the energy shrinks at each level. Producers (plants) have the **most** energy. Herbivores that eat plants get **less**. Predators that eat herbivores get **even less**. By the time you reach the top predator, there is only a little energy left, so the land can feed only a few of them.\n\n## The energy pyramid\nScientists draw this idea as an **energy pyramid**. It is **wide at the bottom**, where plants hold lots of energy, and **narrow at the top**, where only a little energy remains for the top predators. The shape shows exactly why big predators are rare.\n\n## Why it matters\nThis is why a big lake full of tiny algae can feed only a few large fish, and why a huge grassland supports only a small number of lions or hawks. The bottom of the pyramid must be large to support even a small top.\n\n## Watch for this\nThe animals at the top are not rare because they are lazy or because prey hide. They are rare because **energy is lost** at each step, so little is left for them. Remember: producers hold the most energy, not the top predators.\n\n## The big idea\nEnergy is lost as heat at every step of a food chain, so each level up has less energy and fewer living things. That is why there are tons of grasshoppers but only a few hawks.",
        quiz: [
          { q: "At each step of a food chain, energy is…", options: ["Created", "Mostly lost as heat", "Doubled", "Frozen"], answer: 1 },
          { q: "There are fewer predators than prey because…", options: ["Predators are lazy", "Less energy reaches the top", "Prey hide", "Predators sleep"], answer: 1 },
          { q: "Which level has the MOST energy?", options: ["Top predators", "Producers (plants)", "Herbivores", "They're equal"], answer: 1 },
          { q: "An energy pyramid is…", options: ["Narrow at bottom", "Wide at bottom, narrow at top", "A perfect square", "Upside down"], answer: 1 },
        ],
        caseContext: "Leo wonders why a lake can feed millions of tiny algae but only a few big fish. Coach him gently, in small steps, to connect it to energy being lost at each level.",
        caseOpening: "Let's go slow. Where does the energy in the lake start, with the algae or the fish?" },
    ],
  },
  // 5) JORDAN · Grade 8 · dysgraphia / slow processing ─────────────────────────
  {
    title: "Writing & Argument (Grade 8)", subject: "English Language Arts", emoji: "✍️", grade: 8, gradeLabel: "Grade 8",
    framework: "Common Core State Standards, Grade 8 ELA/Literacy",
    intro: "A strong argument can change minds. Over two lessons you'll build a clear claim backed by evidence, then learn to answer the other side, the move that makes writing persuasive.",
    outcome: "Write an argument with a clear claim, evidence, and a counterargument.",
    tags: ["ela", "writing", "argument", "grade 8", "common core"],
    persona: { email: "jordan.k12@synops-demo.test", firstName: "Jordan", lastName: "Bell", grade: 8, gradeLabel: "Grade 8", learningStyle: "auditory", accommodations: ["extended_processing", "scaffolded_questions", "chunked_content", "concrete_examples"], progressFraction: 0.35 },
    modules: [
      { title: "Claim and evidence", outcome: "State a clear claim and support it with specific evidence.",
        hook: "You say later school start times are better. A skeptic says 'prove it.' What now?", minutes: 25,
        standards: [{ code: "CCSS.ELA-LITERACY.W.8.1", title: "Write arguments to support claims with clear reasons and relevant evidence" }],
        points: ["A claim is the position you're arguing", "Evidence is specific proof, facts, data, examples", "Always explain HOW the evidence supports the claim"],
        reading: "An **argument** is a clear case for something you believe, built carefully so a reasonable person might agree with you. A strong argument is not louder shouting; it is a claim backed by proof and a clear explanation. This lesson breaks that into three parts you can use every time.\n\n## What an argument is\nAn argument tries to convince a thoughtful reader who does not already agree with you. That means your job is not just to *state* your opinion, but to give the reader good reasons to accept it. Take your time; a clear argument is built one part at a time.\n\n## Start with a claim\nEvery argument starts with a **claim**, your position, stated plainly. For example: *\"Schools should start later.\"* A good claim is a statement you can argue about. \"Schools exist\" is just a fact. \"What time is school?\" is a question. \"Schools should start later\" is a claim, because a reasonable person could agree or disagree.\n\n## Back it with evidence\nA claim by itself convinces no one. You need **evidence**: specific facts, data, or examples. Weak: \"It's just better.\" Strong: *\"Studies show teens who start school later have better attendance and higher grades.\"* Good evidence is **specific** and **relevant**, it points directly at your claim and gives real proof, not just a feeling.\n\n## Don't skip the link\nHere is the step most writers skip: the **link** (also called the explanation). After you give evidence, you must explain **how** it supports your claim. For example: \"Better attendance and higher grades show that later start times actually help students succeed.\" Without the link, the reader has to guess why your evidence matters.\n\n## Putting the chain together\nThe whole move is a chain: **claim → evidence → explanation**. \"Schools should start later (claim). Studies show teens with later start times have better attendance and grades (evidence). That proves later starts help students succeed (explanation).\" Master that chain and you can argue almost anything.\n\n[[fig:essay-structure|An argument essay has a shape: an intro with your claim, body paragraphs with evidence, and a conclusion]]\n\n## Watch for this\nDo not confuse an opinion with evidence. \"I think it's better\" is still just your claim repeated. Real evidence comes from facts, data, or clear examples, and it must be **relevant** to the exact claim you are making.\n\n## The big idea\nA strong argument states a clear claim, backs it with specific and relevant evidence, and explains how that evidence supports the claim. Claim, evidence, explanation, that chain is the heart of persuasive writing.",
        quiz: [
          { q: "A claim is…", options: ["A random fact", "The position you're arguing", "A question", "The title"], answer: 1 },
          { q: "The best evidence is…", options: ["Vague and general", "Specific and relevant", "Only your opinion", "Off-topic"], answer: 1 },
          { q: "After giving evidence, a strong writer…", options: ["Stops immediately", "Explains how it supports the claim", "Changes the subject", "Repeats the claim only"], answer: 1 },
          { q: "Which is a claim?", options: ["Schools exist.", "Schools should start later.", "What time is school?", "Buses are yellow."], answer: 1 },
        ],
        caseContext: "Jordan wants to argue that his town needs a new skate park but only writes 'it would be fun.' Coach him, with extended thinking time and small scaffolded steps, to turn that into a claim plus one specific piece of evidence.",
        caseOpening: "No rush. 'It would be fun' is a start. WHO would it help, and how? Let's find one specific reason." },
      { title: "Answering the other side", outcome: "Name an objection and respond to it (counterargument).",
        hook: "The best way to win an argument? Bring up the OTHER side yourself.", minutes: 25,
        standards: [{ code: "CCSS.ELA-LITERACY.W.8.1.B", title: "Support claims with logical reasoning, acknowledging counterclaims" }],
        points: ["A counterargument is the other side's strongest point", "Name it fairly, then respond with reasons", "Handling objections makes you more convincing, not less"],
        reading: "In the last lesson you learned to build a claim with evidence. Now comes the move that turns a good argument into a convincing one, and it feels backwards at first: strong writers **bring up the other side themselves**. This is called the **counterargument**.\n\n## The surprising move\nMost people think the way to win is to hide the other side. Skilled writers do the opposite. They name the strongest objection out loud, then answer it. Facing the other side head-on makes *your* side look stronger, not weaker.\n\n## What a counterargument is\nA **counterargument** is the other side's **strongest** point, the best reason someone might disagree with you. Notice the word *strongest*. A weak, silly objection is easy to knock down and convinces no one. Picking the real objection shows you understand the whole issue.\n\n## Name the objection fairly\nFirst, state the other side **fairly**, without twisting it. Say you argue for later school start times. A reader might think, *\"But buses would need new schedules.\"* Instead of hoping no one notices, you name it plainly: \"Some people worry that later start times would disrupt bus schedules.\"\n\n## Then respond with reasons\nNext, you **respond** with reasons: \"But many districts have already adjusted their bus routes successfully, and the benefit to students' health and grades outweighs the inconvenience.\" You do not ignore the objection and you do not just agree with it, you answer it with evidence and reasoning.\n\n## Why it works\nBringing up the other side works for two reasons. First, it shows you have **thought it through**, which makes you more trustworthy. Second, it takes the wind out of your critic's sails before they even speak, because you already answered their best point.\n\n## Watch for this\nDo not name a counterargument and then leave it hanging, that actually helps the other side. Always follow it with a response. And do not pick a fake, easy objection; answer the real one fairly.\n\n## The big idea\nNaming the other side's strongest point fairly, then answering it with reasons, is the counterargument. It makes your writing more convincing, not less, because it proves you have considered the whole issue.",
        quiz: [
          { q: "A counterargument is…", options: ["Your own claim again", "The other side's strongest point", "A spelling rule", "The conclusion"], answer: 1 },
          { q: "You should present the other side…", options: ["Never", "Fairly, then respond to it", "As a joke", "Only if forced"], answer: 1 },
          { q: "Addressing objections makes your argument…", options: ["Weaker", "More convincing", "Shorter only", "Off-topic"], answer: 1 },
          { q: "After naming a counterargument, you should…", options: ["Ignore it", "Respond with reasons", "Agree and quit", "Change topics"], answer: 1 },
        ],
        caseContext: "Jordan argues the school day should be shorter, but ignores the obvious objection (less learning time). Coach him to name that objection fairly and craft a reasonable response.",
        caseOpening: "Someone WILL say 'a shorter day means less learning.' Let's not dodge it, how could you answer that fairly?" },
    ],
  },
  // 6) EMMA · Grade 11 · low vision + dyscalculia ──────────────────────────────
  {
    title: "Algebra I (Grade 11 support)", subject: "Mathematics", emoji: "📐", grade: 11, gradeLabel: "Grade 11",
    framework: "Common Core State Standards, High School Algebra",
    intro: "Algebra is the language of patterns and change. In two lessons you'll solve linear equations step by step and read slope as a real rate of change, with every step shown clearly.",
    outcome: "Solve one-variable linear equations and interpret slope as a rate of change.",
    tags: ["math", "algebra", "linear equations", "grade 11", "common core"],
    persona: { email: "emma.k12@synops-demo.test", firstName: "Emma", lastName: "Novak", grade: 11, gradeLabel: "Grade 11", learningStyle: "visual", accommodations: ["concrete_examples", "extended_processing", "scaffolded_questions", "chunked_content"], progressFraction: 0.55 },
    modules: [
      { title: "Solving linear equations", outcome: "Solve a one-variable equation by keeping it balanced.", video: "https://www.youtube.com/watch?v=f15zA0PhSek",
        hook: "3x + 4 = 19. What is x, and how do you know you're right?", minutes: 25,
        standards: [{ code: "CCSS.MATH.CONTENT.HSA.REI.B.3", title: "Solve linear equations in one variable" }],
        points: ["An equation is a balance: do the same to both sides", "Undo operations in reverse order", "Check by substituting your answer back in"],
        reading: "Solving an equation can feel like a mystery: how do you find the hidden value of *x*? The secret is that an equation is really a **balance**, and if you keep it balanced, the answer reveals itself one clear step at a time.\n\n## An equation is a balance\nThink of an **equation** as a balance scale. The equals sign (=) is the middle of the scale, and the two sides weigh exactly the same. In **3x + 4 = 19**, the left side and the right side are equal. Your goal is to get *x* by itself on one side while keeping the scale level.\n\n[[fig:balance-scale|An equation balances: do the same to both sides to keep them equal]]\n\n## The golden rule\nHere is the one rule that never changes: **whatever you do to one side, you must do to the other side too.** If you subtract 4 from the left, you must subtract 4 from the right. If you divide the left by 3, you divide the right by 3. Doing the same thing to both sides keeps the scale balanced and keeps the equation true.\n\n## Undo in reverse order\nTo get *x* alone, you **undo** the operations, and order matters. You undo addition and subtraction **first**, then multiplication and division. This is the reverse of the order you would use to build the expression. Take it one step at a time; there is no rush.\n\n## Worked example: 3x + 4 = 19\nStart: **3x + 4 = 19**.\nStep 1: Undo the **+ 4** by subtracting 4 from both sides → 3x = 15.\nStep 2: Undo the **× 3** by dividing both sides by 3 → **x = 5**.\nThat is the answer: x = 5. Notice how each step kept both sides balanced.\n\n## Always check your answer\nChecking is not optional; it is how you *know* you are right. Put your answer back into the original equation: 3(5) + 4 = 15 + 4 = **19**. ✓ The two sides match, so x = 5 is correct. If they did not match, you would know to look for a slip.\n\n## Watch for this\nThe most common mistake is changing only one side, which tips the balance and breaks the equation. Another is undoing in the wrong order. Undo the **+ or −** before the **× or ÷**, and always do the same move to both sides.\n\n## The big idea\nAn equation is a balance. Do the same operation to both sides, undo the operations in reverse order to isolate *x*, and then substitute your answer back to check. That routine solves every one-variable linear equation, every time.",
        quiz: [
          { q: "Solving 2x + 3 = 11, first you…", options: ["Divide by 2", "Subtract 3 from both sides", "Add 3", "Multiply by 2"], answer: 1 },
          { q: "In x/4 = 5, x equals…", options: ["20", "9", "1.25", "45"], answer: 0 },
          { q: "To keep an equation true, you must…", options: ["Change only one side", "Do the same to both sides", "Ignore the equals sign", "Add anything"], answer: 1 },
          { q: "The best way to know your answer is right is to…", options: ["Guess", "Substitute it back and check", "Ask a friend", "Move on"], answer: 1 },
        ],
        caseContext: "Emma solves 5x − 2 = 18 and gets x = 4. Coach her to check her work by substituting, discover it doesn't balance, and find x = 4 correctly (5·4−2 = 18 ✓, actually correct). Use clear, concrete steps.",
        caseOpening: "Let's verify. Put x = 4 back into 5x − 2. What do you get?" },
      { title: "Slope as rate of change", outcome: "Read slope as how much y changes per unit of x.",
        hook: "A phone plan charges $30 plus $10 per gig. What's the 'slope', and what does it mean?", minutes: 25,
        standards: [{ code: "CCSS.MATH.CONTENT.HSF.IF.B.6", title: "Calculate and interpret the average rate of change" }],
        points: ["Slope = rise over run = change in y ÷ change in x", "Slope is a rate: how fast y changes as x grows", "In y = mx + b, m is the slope"],
        reading: "You have probably heard that **slope** tells you how steep a line is. That is true, but the more useful idea is this: slope is a **rate of change**. It tells you how much one quantity changes each time another goes up by one. Once you read slope that way, graphs start to describe the real world.\n\n## What slope really is\n**Slope** measures how much *y* (the up-and-down amount) changes for each single step in *x* (the left-and-right amount). A big slope means the line climbs quickly; a small slope means it climbs slowly. A slope tells a story: *for every one more x, y changes by this much.*\n\n## Rise over run\nYou calculate slope as **rise over run**: the change in *y* divided by the change in *x*. \"Rise\" is how far the line goes up; \"run\" is how far it goes across. So slope = (change in y) ÷ (change in x). For example, if a line rises 6 while it runs 3, the slope is 6 ÷ 3 = **2**.\n\n## Worked example: the phone plan\nA phone plan costs **$30 plus $10 per gigabyte**. Every extra gig adds **$10** to the bill, so the **slope is 10**, meaning 10 dollars per gig. That $10 per gig *is* the rate of change. The starting $30 is the amount before you use any data; it is called the **y-intercept**.\n\n## Reading y = mx + b\nMany lines are written as **y = mx + b**. In this form, **m** is the **slope** (the rate of change) and **b** is where the line **starts** (the y-intercept). In the phone plan, y = 10x + 30: the 10 is the slope (cost per gig) and the 30 is the start-up cost. Spotting m and b lets you read a line at a glance.\n\n## Slope as a rate everywhere\nReading slope as a rate turns abstract lines into real meaning. It can be **dollars per gigabyte**, **miles per hour**, **degrees per minute**, or **dollars saved per week**. Different situations, but the same idea: how fast one thing changes as another grows.\n\n## Watch for this\nDo not confuse the slope with the starting value. In y = mx + b, the **slope is m**, the number multiplied by x, not b. In a plan that is \"$20 plus $5 per month,\" the slope is **5** (the per-month rate), while 20 is just the starting amount.\n\n## The big idea\nSlope is a rate of change: rise over run, or the change in y for each step in x. In y = mx + b it is the m. Reading slope as \"how fast y changes as x grows\" turns any line into a real-world rate you can understand.",
        quiz: [
          { q: "Slope is…", options: ["Change in y ÷ change in x", "x times y", "The y-intercept", "Always 1"], answer: 0 },
          { q: "In y = mx + b, the slope is…", options: ["b", "m", "x", "y"], answer: 1 },
          { q: "A plan is $20 + $5 per month. The slope is…", options: ["20", "5", "25", "0"], answer: 1 },
          { q: "Slope as a rate of change tells you…", options: ["The starting value", "How fast y changes as x grows", "The color of the line", "Nothing useful"], answer: 1 },
        ],
        caseContext: "Emma sees the line y = 15 + 8x for a gym (a $15 join fee plus $8 per visit) and isn't sure what 8 means. Coach her, with a concrete real-world framing, to read 8 as the cost per visit (the rate of change).",
        caseOpening: "In y = 15 + 8x, the 8 is attached to x, the number of visits. So what does 8 cost you each time?" },
    ],
  },
];

// ── SECOND SUBJECT per learner (each persona takes TWO different subjects, e.g. math + civics,
//    science + history) so every K-12 class spans two subjects, fully built and gamified. ──────────
const SECOND_COURSES: K12Course[] = [
  {
    title: "Grade 1 Math: Counting & Adding", subject: "Mathematics", emoji: "🔢", grade: 1, gradeLabel: "Grade 1",
    framework: "Common Core State Standards, Grade 1 Operations & Algebraic Thinking",
    intro: "Let's learn to count and add small numbers. We will use our fingers, toys, and pictures to see how numbers grow.",
    outcome: "I can count on from a number and add two numbers within 10.",
    tags: ["math", "counting", "addition", "grade 1", "common core"],
    persona: { email: "mateo.k12@synops-demo.test", firstName: "Mateo", lastName: "Flores", grade: 1, gradeLabel: "Grade 1", learningStyle: "kinesthetic", accommodations: ["simplified_language", "concrete_examples", "chunked_content", "positive_reinforcement"], progressFraction: 0.1 },
    modules: [
      { title: "Count and Add", outcome: "I can count the pictures and add to 10.", hook: "🍎🍎 and 🍎🍎🍎, how many apples?", minutes: 12, game: "choice",
        standards: [{ code: "CCSS.MATH.CONTENT.1.OA.C.6", title: "Add and subtract within 20" }],
        points: ["Adding puts two groups together.", "Count them ALL to find how many.", "The last number you say is the answer."],
        reading: "Adding means we put things together and count them all! 🎉\n\n🍎🍎 and 🍎 makes 🍎🍎🍎. Count them: 1, 2, 3. That is **3**!\n\nLet's try more. 🐟🐟 and 🐟🐟 makes four fish. Count: 1, 2, 3, 4. That is **4**!\n\nPoint to each one and count out loud. The **last** number you say is the answer. You can do it! ⭐",
        quiz: [
          { q: "🍎🍎 and 🍎🍎🍎, how many?", options: ["4", "5", "6", "3"], answer: 1 },
          { q: "🐟🐟🐟🐟 and 🐟, how many?", options: ["5", "4", "6", "3"], answer: 0 },
          { q: "⭐⭐⭐ and ⭐⭐⭐, how many?", options: ["7", "5", "6", "4"], answer: 2 },
          { q: "🎈🎈 and 🎈🎈, how many?", options: ["3", "5", "2", "4"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
      { title: "Ten and Some More", outcome: "I can make a teen number as ten and some more.", hook: "🔟 and 🍎🍎, what number?", minutes: 12, game: "choice",
        standards: [{ code: "CCSS.MATH.CONTENT.1.NBT.B.2", title: "Understand place value: tens and ones" }],
        points: ["A teen number is ten and some more.", "Ten and 1 more is 11. Ten and 2 more is 12.", "Start at ten, then count on!"],
        reading: "Big-kid numbers! A teen number is **ten and some more**. 🎉\n\n🔟 and 🍎 is **eleven (11)**.\n🔟 and 🍎🍎 is **twelve (12)**.\n🔟 and 🍎🍎🍎 is **thirteen (13)**.\n\n[[fig:ten-frame|Ten and 2 more makes 12]]\n\nStart at ten. Then count on the extra ones: 11, 12, 13… First say \"ten,\" then keep going. You are a number star! ⭐",
        quiz: [
          { q: "🔟 and 🍎🍎, what number?", options: ["2", "12", "20", "10"], answer: 1 },
          { q: "Ten and 4 more, what number?", options: ["14", "40", "4", "11"], answer: 0 },
          { q: "🔟 and 🍎🍎🍎🍎🍎, what number?", options: ["50", "5", "15", "16"], answer: 2 },
          { q: "Ten and 1 more, what number?", options: ["10", "1", "12", "11"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
    ],
  },
  {
    title: "Matemáticas (Grado 3): Multiplicación", subject: "Matemáticas", emoji: "✖️", grade: 3, gradeLabel: "Grade 3", lang: "es",
    framework: "Common Core State Standards, Grade 3 Mathematics",
    intro: "Vamos a aprender qué es la multiplicación. Verás que multiplicar es una forma rápida de sumar grupos iguales.",
    outcome: "Puedo explicar la multiplicación como grupos iguales y resolver problemas sencillos.",
    tags: ["matematicas", "multiplicacion", "grade 3", "common core"],
    persona: { email: "sofia.k12@synops-demo.test", firstName: "Sofía", lastName: "Ramírez", grade: 3, gradeLabel: "Grade 3", learningStyle: "visual", accommodations: ["simplified_language", "concrete_examples", "scaffolded_questions", "positive_reinforcement", "chunked_content"], progressFraction: 0.1 },
    modules: [
      { title: "Grupos Iguales", outcome: "Puedo mostrar una multiplicación como grupos iguales de objetos.", video: "https://www.youtube.com/watch?v=nnBBmOaBn_s", hook: "¿Cómo puedes contar 3 cajas con 4 galletas cada una sin contar una por una?", minutes: 25, game: "choice",
        standards: [{ code: "CCSS.MATH.CONTENT.3.OA.A.1", title: "Interpret products as equal groups" }],
        points: ["Multiplicar es juntar grupos que tienen la misma cantidad.", "3 × 4 quiere decir 3 grupos de 4 cosas.", "Multiplicar es una suma rápida de grupos iguales."],
        reading: "La **multiplicación** es una manera rápida de sumar **grupos iguales**. Un grupo igual es un grupo que tiene siempre la misma cantidad de cosas.\n\nImagina que tienes **3 platos**, y en cada plato hay **4 galletas**🍪. Puedes contar de una en una: 1, 2, 3, 4... pero es lento.\n\nEs más fácil escribir **3 × 4**. Esto quiere decir \"**3 grupos de 4**\". El primer número dice **cuántos grupos** hay. El segundo número dice **cuántos hay en cada grupo**.\n\nPara resolverlo, puedes sumar los grupos: 4 + 4 + 4 = **12**. Entonces 3 × 4 = **12**. Hay 12 galletas en total.\n\n[[fig:equal-groups|3 grupos de 4 galletas = 12]]\n\n**Dibújalo en tu mente (arreglo):** también puedes imaginar filas y columnas, como un cartón de huevos:\n🥚🥚🥚🥚\n🥚🥚🥚🥚\n🥚🥚🥚🥚\nSon **3 filas de 4** = 3 × 4 = 12. ¡Lo puedes contar de las dos formas y da igual!\n\n[[fig:array|Un arreglo de 3 filas y 4 columnas también es 3 × 4 = 12]]\n\n**Otro ejemplo:** 5 × 2 son **5 grupos de 2**: 2 + 2 + 2 + 2 + 2 = **10**.\n\n**Un truco:** 4 × 3 es lo mismo que 3 × 4. Puedes cambiar el orden y el resultado no cambia. ¡Eso te ahorra tiempo!\n\nEl signo **×** significa \"veces\". Así que 3 × 4 se lee \"3 veces 4\". **Para recordar:** busca grupos iguales, cuenta cuántos grupos y cuántos hay en cada uno, y multiplica. En el juego, encuentra el total de cada grupo. 🎯",
        quiz: [
          { q: "¿Qué significa 3 × 4?", options: ["3 grupos de 4", "3 más 4", "4 menos 3", "3 grupos de 3"], answer: 0 },
          { q: "Hay 2 cajas con 5 lápices cada una. ¿Cuántos lápices hay?", options: ["7", "25", "10", "12"], answer: 2 },
          { q: "En 5 × 2, ¿qué nos dice el primer número (5)?", options: ["Cuántos hay en cada grupo", "El total", "Cuántos grupos hay", "Cuánto sobra"], answer: 2 },
          { q: "¿Cuál suma es igual a 4 × 3?", options: ["4 + 3", "3 + 3 + 3 + 3", "4 + 4", "3 + 4 + 3"], answer: 1 },
          { q: "Hay 3 platos con 4 galletas cada uno. ¿Cuántas galletas hay en total?", options: ["7", "12", "9", "34"], answer: 1 },
          { q: "El signo × se lee…", options: ["más", "menos", "veces", "entre"], answer: 2 },
        ], caseContext: "", caseOpening: "" },
      { title: "Problemas con Multiplicación", outcome: "Puedo resolver problemas de la vida real usando la multiplicación.", hook: "Si cada mesa tiene la misma cantidad de sillas, ¿cómo sabes cuántas sillas hay en total?", minutes: 25, game: "pair",
        standards: [{ code: "CCSS.MATH.CONTENT.3.OA.A.3", title: "Use multiplication to solve word problems" }],
        points: ["Busca grupos iguales dentro del problema.", "Multiplica el número de grupos por lo que hay en cada grupo.", "El resultado es el total de todas las cosas juntas."],
        reading: "Muchos problemas de la vida real usan **grupos iguales**. Cuando veas grupos que tienen la misma cantidad, puedes usar la **multiplicación** para hallar el total.\n\n**Problema 1:** \"Ana tiene **4 bolsas**. En cada bolsa hay **6 manzanas**🍎. ¿Cuántas manzanas tiene en total?\"\nBusca los grupos iguales: hay **4 grupos** (las bolsas) y cada uno tiene **6 manzanas**. Escribimos **4 × 6**. Resuélvelo: 6 + 6 + 6 + 6 = **24**. ¡Ana tiene **24 manzanas**!\n\n[[fig:equal-groups|Cuando los grupos son iguales, multiplica en vez de contar uno por uno]]\n\n**Problema 2:** \"En el salón hay **5 mesas** y en **cada** mesa hay **3 sillas**. ¿Cuántas sillas hay?\"\n5 grupos de 3 → **5 × 3** = 15. Hay **15 sillas**.\n\n**La palabra mágica: \"cada\".** Cuando un problema dice \"cada\", casi siempre puedes multiplicar, porque los grupos son iguales. Búscala: *cada* bolsa, *cada* mesa, *cada* caja…\n\n**Los 3 pasos para resolver:** (1) ¿cuántos grupos hay?, (2) ¿cuántos hay en cada grupo?, (3) multiplica los dos números.\n\n**Cuidado:** si los grupos NO son iguales (una bolsa con 6 y otra con 2), no puedes multiplicar directo, tendrías que sumar. Por eso primero revisa que sean iguales.\n\n**Aplícalo:** mira a tu alrededor, huevos en un cartón, ruedas en los carros, dedos en las manos… ¡hay grupos iguales por todas partes! En el juego, une cada problema con su total. 🧮",
        quiz: [
          { q: "Hay 3 mesas con 5 sillas cada una. ¿Cuántas sillas hay?", options: ["8", "15", "35", "10"], answer: 1 },
          { q: "¿Qué palabra te ayuda a saber que los grupos son iguales?", options: ["menos", "cada", "resta", "mitad"], answer: 1 },
          { q: "Un problema dice: 5 cajas, 2 pelotas en cada caja. ¿Qué multiplicación usas?", options: ["5 + 2", "5 × 2", "2 − 5", "5 × 5"], answer: 1 },
          { q: "¿Cuánto es 6 × 3?", options: ["9", "18", "12", "63"], answer: 1 },
          { q: "Hay 4 bolsas con 6 manzanas cada una. ¿Cuántas manzanas hay en total?", options: ["10", "24", "18", "46"], answer: 1 },
          { q: "¿Cuál es el PRIMER paso para resolver un problema de grupos iguales?", options: ["Restar los números", "Encontrar cuántos grupos hay", "Adivinar el total", "Sumar una sola vez"], answer: 1 },
        ], caseContext: "", caseOpening: "" },
    ],
  },
  {
    title: "Science 4: Energy & Motion", subject: "Science", emoji: "⚡", grade: 4, gradeLabel: "Grade 4",
    framework: "Next Generation Science Standards, Grade 4 Physical Science",
    intro: "In this course you will learn about energy and how things move. We will go step by step, with clear examples you can picture.",
    outcome: "I can explain how the speed of an object relates to its energy and describe how energy transfers.",
    tags: ["science", "energy", "motion", "grade 4", "ngss"],
    persona: { email: "aiden.k12@synops-demo.test", firstName: "Aiden", lastName: "Walsh", grade: 4, gradeLabel: "Grade 4", learningStyle: "kinesthetic", accommodations: ["predictable_structure", "chunked_content", "explicit_transitions", "positive_reinforcement", "literal_language", "extended_processing"], progressFraction: 0.4 },
    modules: [
      { title: "Speed and Energy of Motion", outcome: "I can explain that a faster object has more energy of motion.", hook: "Which hurts more if it bumps you: a slow rolling ball or a fast rolling ball?", minutes: 25, game: "choice",
        standards: [{ code: "NGSS.4-PS3-1", title: "Relate the speed of an object to its energy" }],
        points: ["Energy of motion is the energy a moving object has.", "A faster object has more energy of motion.", "A slower object has less energy of motion."],
        reading: "**Energy** is the ability to make something happen or to make something move. When an object is moving, it carries a special kind of energy called **energy of motion**. Scientists sometimes call this *kinetic energy*, but the plain idea is simple: moving things carry energy.\n\n## What energy of motion is\nAnything that moves has energy of motion: a rolling ball, a running dog, a falling leaf, a car on the road. A thing that is sitting completely still has **no** energy of motion, because it is not moving. The moment it starts to move, it gains energy of motion.\n\n## The rule: faster means more energy\nHere is the main rule. A moving object that goes **faster** has **more** energy of motion. A moving object that goes **slower** has **less** energy of motion. Speed and energy of motion go together: as one goes up, so does the other.\n\n[[fig:speed-energy|A faster object carries more energy of motion than a slower one]]\n\n## A worked example\nThink about a soccer ball. If you tap it gently, it rolls slowly, so it has only a little energy of motion. If you kick it hard, it rolls fast, so it has a lot of energy of motion. You can actually *see* the difference when the ball hits a row of paper cups. A slow ball might knock over only one cup. A fast ball can knock over many cups, because it is carrying more energy and passes more of it to the cups.\n\n## Energy of motion in real life\nThis rule is everywhere. A fast bike is harder to stop than a slow bike. A fast baseball stings your hand more than a slow toss. A car going faster needs a longer distance to stop. In every case, more speed means more energy of motion.\n\n## Watch for this\nEnergy of motion is about **movement**, not about size or color or weight alone. A ball sitting still, no matter how big, has no energy of motion until it moves. And when a car slows down, its energy of motion gets **smaller**, not bigger.\n\n## The big idea\nMoving things carry energy of motion. Faster movement means more energy; slower movement means less. That one rule is always true for moving objects.",
        quiz: [
          { q: "Which object has MORE energy of motion?", options: ["A ball rolling slowly", "A ball rolling fast", "A ball sitting still", "A ball in a box"], answer: 1 },
          { q: "What is energy of motion?", options: ["The energy a moving object has", "The color of an object", "The size of an object", "The weight of a still object"], answer: 0 },
          { q: "If a car slows down, its energy of motion...", options: ["gets bigger", "stays exactly the same", "gets smaller", "turns into light"], answer: 2 },
          { q: "A fast ball knocks over more cups than a slow ball because it has...", options: ["less energy", "no energy", "the same energy", "more energy"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
      { title: "How Energy Moves From Place to Place", outcome: "I can name ways energy transfers, such as sound, light, heat, and collisions.", hook: "How does the heat from a stove get to your hands without touching the stove?", minutes: 25, game: "pair",
        standards: [{ code: "NGSS.4-PS3-2", title: "Observe energy transferred from place to place" }],
        points: ["Energy can move from one place to another. This is called a transfer.", "Energy transfers by sound, light, heat, and collisions.", "When objects bump, energy passes from one to the other."],
        reading: "Energy does not stay in one spot. It can **transfer**, which is a science word that means it moves from one place to another. Learning the main ways energy transfers helps you explain a lot of everyday things.\n\n## What a transfer is\nA **transfer** happens when energy leaves one object and arrives at another. The energy does not disappear and it is not used up; it simply travels from here to there. Once you know this, you can trace where energy came from and where it went.\n\n[[fig:energy-transfer|Energy transfers by sound, light, heat, and collisions]]\n\n## Four ways energy moves\n**Sound.** When you clap, energy moves through the air as sound waves. Your ears catch that energy, which is how you hear the clap.\n\n**Light.** The Sun sends energy to Earth as light. The light travels all the way through space and reaches your eyes and skin.\n\n**Heat.** A warm cup of cocoa gives heat energy to your cold hands. The energy always moves from the **hotter** thing to the **cooler** thing.\n\n**Collisions.** When one marble rolls and bumps another, energy transfers from the first marble to the second. The second marble then starts to move.\n\n## A worked example\nThink about the stove question. Heat energy leaves the hot stove and moves through the air and the pot to reach your hands, even without touching the burner. That is a **heat** transfer, moving from hotter to cooler. If you drop a spoon and hear a clang, that is a **sound** transfer carrying energy to your ears.\n\n## Energy transfer in your day\nYou see transfers all day: sunlight warming a window (light, then heat), a bumper car pushing another car (collision), a drum passing sound to your ears, a radiator warming a room. Each is energy moving from one place to another.\n\n## Watch for this\nRemember that energy is **not** destroyed when it transfers. It moves. Also, heat always flows from the warmer object to the cooler one, never the other way. If your cocoa warms your hands, the cocoa is giving energy away and slowly cooling down.\n\n## The big idea\nEnergy transfers by sound, light, heat, and collisions. In every case, energy leaves one place and arrives at another. Nothing disappears; the energy just moves.",
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
    framework: "C3 Framework for Social Studies, Civics",
    intro: "Government shapes daily life, from schools to roads. In this course you will learn how the U.S. government is organized and what it means to be an active citizen.",
    outcome: "I can describe the three branches of government and explain the rights and responsibilities of citizens.",
    tags: ["civics", "government", "citizenship", "grade 6", "c3"],
    persona: { email: "maya.k12@synops-demo.test", firstName: "Maya", lastName: "Chen", grade: 6, gradeLabel: "Grade 6", learningStyle: "reading_writing", accommodations: [], progressFraction: 0.5 },
    modules: [
      { title: "The Three Branches of Government", outcome: "I can identify the three branches of government and the job of each one.", video: "https://www.youtube.com/watch?v=F6ZhV09DgMA", hook: "Why does one group get to make laws, another enforce them, and a third decide what they mean?", minutes: 25, game: "choice",
        standards: [{ code: "C3.D2.CIV.1.6-8", title: "Distinguish the powers and responsibilities of citizens and institutions" }],
        points: ["The government is split into three branches with different jobs.", "Legislative makes laws, executive enforces them, judicial interprets them.", "Separating power keeps any one branch from becoming too strong."],
        reading: "The United States government is divided into **three branches**. Each branch has its own clear job, and together they run the country. This design is not an accident; it is meant to keep power balanced so that no single group can control everything.\n\n## Three branches, three jobs\nThink of the three branches as three teams with three different responsibilities: one team **writes** the rules, one team **carries out** the rules, and one team **decides what the rules mean**. Keeping these jobs separate is the heart of the whole system.\n\n## The legislative branch makes laws\nThe **legislative branch** is **Congress**. Its job is to **make laws**. Congress has two parts: the **Senate** and the **House of Representatives**. The people in Congress are elected by citizens, so the laws come from representatives the public chose. Congress also controls how the government spends money.\n\n## The executive branch enforces laws\nThe **executive branch** is led by the **President**. Its job is to **carry out and enforce** the laws that Congress makes. The President also leads the military, meets with other countries' leaders, and represents the nation to the world. Agencies like the postal service and the parks are part of this branch.\n\n## The judicial branch interprets laws\nThe **judicial branch** is the **courts**, including the **Supreme Court**. Its job is to **interpret laws**, to decide what a law means when people disagree, and to judge whether a law follows the Constitution.\n\n[[fig:three-branches|The three branches of government, each has its own job, and each checks the others]]\n\n## Why divide the power?\nThe framers of the Constitution worried that too much power in one place could lead to unfairness, the way a king could rule however he wished. By giving each branch a separate role, they built a system where the branches **check** one another. For example, Congress writes a law, the President can approve or reject it, and the courts can decide whether it is allowed by the Constitution. No branch acts entirely alone.\n\n## Watch for this\nDo not mix up the jobs. Congress does not enforce laws, and the President does not personally decide court cases. The quick way to remember: **legislative = make**, **executive = enforce**, **judicial = interpret**.\n\n## The big idea\nThree branches, three jobs, checking each other. Splitting the government this way keeps any one branch from becoming too strong and protects the freedom of the people.",
        quiz: [
          { q: "Which branch makes the laws?", options: ["Executive", "Legislative", "Judicial", "Military"], answer: 1 },
          { q: "What is the main job of the judicial branch?", options: ["To interpret laws and decide what they mean", "To elect the President", "To write new laws", "To collect taxes"], answer: 0 },
          { q: "The President is the head of which branch?", options: ["Legislative", "Judicial", "Executive", "Congress"], answer: 2 },
          { q: "Why did the framers split the government into three branches?", options: ["To make voting slower", "To copy other countries exactly", "To give the President all power", "To keep any one branch from becoming too strong"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
      { title: "The Roles of Citizens", outcome: "I can explain the rights and responsibilities citizens have in a democracy.", hook: "What does a democracy ask of you in return for your freedoms?", minutes: 25, game: "pair",
        standards: [{ code: "C3.D2.CIV.2.6-8", title: "Explain the roles of citizens in a democracy" }],
        points: ["Citizens have rights, such as free speech and the right to vote.", "Citizens also have responsibilities, like voting and jury duty.", "A democracy works best when citizens take part."],
        reading: "In a **democracy**, the people hold the power. That is what the word means: rule by the people. But holding power is not only about freedom, it also comes with duties. Citizens have both **rights** and **responsibilities**, and the two go hand in hand.\n\n## Democracy: the people hold power\nIn a democracy, the government's authority comes from the citizens. Leaders are chosen by the people and are supposed to act for the people. That makes every citizen an important part of how the country is run.\n\n## Rights: freedoms the government protects\n**Rights** are freedoms that the government must protect and cannot take away unfairly. Citizens have the right to **free speech**, the right to practice their religion, the right to a fair trial, and the right to **vote** for their leaders. These rights let people share ideas, worship as they choose, and help decide the direction of the country.\n\n## Responsibilities: what citizens owe back\n**Responsibilities** are duties that citizens are expected to fulfill so the system keeps working. **Voting** in elections is one of the most important. Serving on a **jury** helps make sure trials are fair. Citizens are also expected to obey laws, pay taxes, stay informed about issues, and treat others with respect.\n\n## Rights and responsibilities work together\nEvery right has a matching responsibility. You have the **right** to vote, and also the **responsibility** to learn about the candidates before you do. You have the **right** to free speech, and the **responsibility** to let others speak too. Rights without responsibilities would fall apart, and responsibilities without rights would not be fair.\n\n## A real example\nImagine a town deciding whether to build a new park. Citizens use their **right** to speak at a meeting and their **right** to vote on the plan. They also meet their **responsibility** to learn the facts and listen to neighbors who disagree. Because people took part, the decision reflects what the community actually wants.\n\n## Watch for this\nA right is a freedom you *have*; a responsibility is a duty you are expected to *do*. Voting is special because it is **both**, a right you are free to use and a responsibility that keeps democracy healthy. Do not confuse the two, and do not think freedoms come with no duties attached.\n\n## The big idea\nCitizens have rights the government must protect and responsibilities they are expected to meet. When people take both seriously, the government reflects the will of the people. A democracy is strongest when its citizens participate.",
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
    framework: "C3 Framework for Social Studies, History",
    intro: "Long ago, the first cities and civilizations began. In this course you will learn where they started, why, and the amazing things they invented.",
    outcome: "I can explain why early civilizations began near rivers and name key inventions they created.",
    tags: ["history", "civilizations", "mesopotamia", "grade 6", "c3"],
    persona: { email: "leo.k12@synops-demo.test", firstName: "Leo", lastName: "Rivera", grade: 6, gradeLabel: "Grade 6", learningStyle: "auditory", accommodations: ["simplified_language", "chunked_content", "scaffolded_questions", "extended_processing", "concrete_examples", "positive_reinforcement"], progressFraction: 0.35 },
    modules: [
      { title: "Why Civilizations Began Near Rivers", outcome: "I can explain why the first civilizations grew up next to rivers.", video: "https://www.youtube.com/watch?v=9GQdh2eGP-Y", hook: "Why did people long ago choose to build their first cities right next to rivers?", minutes: 25, game: "choice",
        standards: [{ code: "C3.D2.HIS.1.6-8", title: "Analyze connections among events and developments in broad historical contexts" }],
        points: ["Rivers gave people water to drink and to grow food.", "Good farming near rivers meant extra food and bigger towns.", "Mesopotamia and Egypt both grew along great rivers."],
        reading: "Long ago, people did not live in big cities. They moved around to hunt and gather food. Then something changed. People started building the first **civilizations**, and almost all of them grew up next to **rivers**. Let's find out why, step by step.\n\n## What a civilization is\nA **civilization** is a large group of people who live together in cities, share rules, and build things together. To have a city, you need something very important first: a steady supply of food and water. That is exactly what a river provides.\n\n## Rivers gave water\nA river gives people **water** every day. They can drink it, cook with it, and give it to their animals. They can also carry it to their fields to water crops. Without water nearby, a large group of people cannot survive in one place.\n\n## Rivers made great farmland\nMany rivers **flood** each year. When the water goes back down, it leaves behind rich, dark soil called silt. This soil is excellent for **farming**. Seeds planted in it grow well, so people could raise lots of crops close to home.\n\n[[fig:river-civ|A river gives water and rich soil for farming, so the first cities grew up along its banks]]\n\n## Extra food changed everything\nGood farming means **extra food**, more than the farmers need. This is the key idea. When there is extra food, not everyone has to farm. Some people can become builders, traders, priests, or leaders. Jobs spread out, towns grow, and towns become cities. Extra food is what let civilization begin.\n\n## Two famous river civilizations\n**Mesopotamia** grew between two rivers, the **Tigris** and the **Euphrates**. **Egypt** grew along the **Nile River**, which flooded every year and left perfect farmland. Rivers also gave both places a way to **travel and trade by boat**.\n\n## Watch for this\nRivers were not chosen because they had gold or because they were good hiding spots. They were chosen for **water** and **rich soil for farming**. Those two gifts made large settled life possible.\n\n## The big idea\nRivers gave early people water, rich farmland, extra food, and a way to travel. Those gifts are why the first civilizations began and grew strong along riverbanks.",
        quiz: [
          { q: "Why did early civilizations begin near rivers?", options: ["Rivers gave water and good soil for farming", "Rivers were always cold", "Rivers had gold in them", "Rivers were easy to hide in"], answer: 0 },
          { q: "Mesopotamia grew between which two rivers?", options: ["The Nile and the Amazon", "The Tigris and the Euphrates", "The Mississippi and the Ohio", "The Thames and the Seine"], answer: 1 },
          { q: "Egypt's civilization grew along which river?", options: ["The Tigris", "The Euphrates", "The Nile", "The Amazon"], answer: 2 },
          { q: "What happened when farming near rivers gave people extra food?", options: ["Everyone had to keep farming", "People left the cities", "Rivers dried up", "Some people could become builders, traders, or leaders"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
      { title: "Inventions of Early Civilizations", outcome: "I can name important inventions of early civilizations and why they mattered.", hook: "Which everyday things you use today were first invented thousands of years ago?", minutes: 25, game: "pair",
        standards: [{ code: "C3.D2.HIS.2.6-8", title: "Classify series of historical events and developments as examples of change and/or continuity" }],
        points: ["Early people invented writing to keep records.", "The wheel helped them move goods and travel.", "Written laws helped keep order in growing cities."],
        reading: "As cities grew bigger, people ran into new problems. How do you remember thousands of trades? How do you move heavy loads? How do you keep so many people fair and safe? Early civilizations solved these problems with **inventions**, and we still use their ideas today.\n\n## Why cities needed inventions\nA small group can remember things and settle arguments by talking. A city with thousands of people cannot. Bigger groups needed new tools and new ideas just to keep everyday life running. Necessity pushed people to invent.\n\n## Writing: saving information\nOne of the biggest inventions was **writing**. In **Mesopotamia**, people pressed marks into soft **clay** to record trades, stories, and laws. Writing let people **save information** so it would not be forgotten when someone died or moved away. For the first time, knowledge could be stored and passed on.\n\n## The wheel: moving goods\nAnother huge invention was the **wheel**. With wheels, people built carts that could carry heavy goods and travel much farther than a person could carry by hand. This made **trade** easier and faster, so cities could exchange food, tools, and ideas.\n\n## Written laws: keeping order\nEarly civilizations also created **written laws**. When many people live close together, they need clear rules to stay fair and safe. One famous set was the **Code of Hammurabi**. Because the laws were written down, **everyone could know the rules**, and leaders could keep order fairly instead of deciding differently each time.\n\n## Why these inventions still matter\nLook around and you will see their descendants: books and phones store information, just as clay tablets did. Cars and carts still roll on wheels. Courts still use written laws. Modern life is built on top of these ancient ideas.\n\n## Watch for this\nThese inventions were not just clever gadgets; each one solved a real problem of living in a large group. Writing was for **remembering**, the wheel was for **moving**, and laws were for **fairness and order**. Remember what each one was *for*.\n\n## The big idea\nWriting, the wheel, and written laws were giant steps forward. They helped cities remember, trade, and stay fair, so civilizations could grow and last. Many modern ideas began with these early inventions.",
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
    framework: "C3 Framework for Social Studies, Civics & History",
    intro: "The U.S. Constitution is the plan for American government. In this course you will explore why it was written and how it protects people's freedoms.",
    outcome: "I can explain why the Constitution was written and describe the Bill of Rights and separation of powers.",
    tags: ["us history", "constitution", "government", "grade 8", "c3"],
    persona: { email: "jordan.k12@synops-demo.test", firstName: "Jordan", lastName: "Bell", grade: 8, gradeLabel: "Grade 8", learningStyle: "auditory", accommodations: ["extended_processing", "scaffolded_questions", "chunked_content", "concrete_examples"], progressFraction: 0.3 },
    modules: [
      { title: "Why the Framers Wrote the Constitution", outcome: "I can explain why the Constitution was created and what separation of powers means.", video: "https://www.youtube.com/watch?v=s4GUt8G4Wd8", hook: "What made America's first plan of government fail, and how did the framers fix it?", minutes: 25, game: "choice",
        standards: [{ code: "C3.D2.CIV.4.6-8", title: "Explain the origins, functions, and structure of the Constitution" }],
        points: ["The first government under the Articles of Confederation was too weak.", "The Constitution created a stronger national government.", "Separation of powers divides government into three branches."],
        reading: "After winning independence from Britain, the United States faced a hard question: how should a free country govern itself? Their first answer did not work well, so a group of leaders wrote a new plan, the Constitution, that still guides the country today. Here is the story of why.\n\n## A new country needs a plan\nWinning the war was only the beginning. Thirteen separate states now had to work together as one country. They needed a **plan of government**, a set of rules for how decisions would be made, how taxes would be collected, and how disputes would be settled.\n\n## The first plan was too weak\nThe first plan was the **Articles of Confederation**. It made the national government very **weak** on purpose, because Americans feared a strong government like the king they had just fought. But the weak government could not **collect taxes**, could not keep order, and could not settle arguments between states. The young country struggled and nearly fell apart.\n\n## The framers write a new plan\nIn **1787**, leaders called **framers** met at the **Constitutional Convention** to fix these problems. They wrote a new plan: the **Constitution**. It created a **stronger** national government, one that could tax, defend the country, and settle disputes between states, while still answering to the people.\n\n## Separation of powers\nThe framers still feared giving one person or group too much power. Their solution was **separation of powers**: dividing the government into **three branches** with different jobs. The **legislative** branch makes laws, the **executive** branch enforces them, and the **judicial** branch interprets them.\n\n[[fig:three-branches|Separation of powers splits government into three branches, each checking the others]]\n\n## Checks and balances\nThe branches can also limit one another, a system called **checks and balances**. For example, Congress passes a law, the President can veto it, and the courts can rule whether it follows the Constitution. By separating and balancing power, the framers hoped to protect freedom and stop any leader from becoming a **tyrant**.\n\n## Watch for this\nDo not mix up the two plans. The **Articles of Confederation** came first and was too weak; the **Constitution** replaced it and made the national government stronger, but with power carefully divided. Both facts matter.\n\n## The big idea\nThe framers wrote the Constitution because the Articles of Confederation left the government too weak. Their new plan created a stronger government but split its power among three branches that check each other, so no one could seize total control. The Constitution remains the foundation of American government today.",
        quiz: [
          { q: "What was a major problem with the Articles of Confederation?", options: ["The national government was too weak", "It gave the President total power", "It banned all state governments", "It created too many courts"], answer: 0 },
          { q: "What does \"separation of powers\" mean?", options: ["One leader holds all power", "Government is divided into three branches with different jobs", "States cannot make any laws", "The military runs the country"], answer: 1 },
          { q: "Where and when did the framers write the Constitution?", options: ["In 1776 during the Revolution", "In 1812 during a war", "At the Constitutional Convention in 1787", "In 1865 after the Civil War"], answer: 2 },
          { q: "Why did the framers use checks and balances?", options: ["To make government slower for no reason", "To copy the Articles exactly", "To give Congress all the power", "To keep any one branch from becoming too powerful"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
      { title: "The Bill of Rights", outcome: "I can describe the Bill of Rights and identify key freedoms it protects.", hook: "Why did Americans demand a list of freedoms before they would accept the Constitution?", minutes: 25, game: "pair",
        standards: [{ code: "C3.D2.CIV.8.6-8", title: "Analyze the purposes of rules and laws (the Bill of Rights)" }],
        points: ["The Bill of Rights is the first ten amendments to the Constitution.", "It protects freedoms like speech, religion, and the press.", "It limits government power to protect individual rights."],
        reading: "The Constitution set up the government, but many Americans were not ready to approve it. Something was missing. They wanted a clear promise that the new government could not take away their **freedoms**. That promise became the Bill of Rights.\n\n## Why people demanded a list of rights\nWhen the Constitution was first written, many Americans worried it did not clearly protect individual freedoms. They had just fought a war against a government that abused its power, and they did not want to risk it again. To win their support, leaders **promised** to add a written list of protected rights. That list became the **Bill of Rights**, the first **ten amendments** to the Constitution.\n\n[[fig:bill-of-rights|The Bill of Rights, the first ten amendments, protecting freedoms like speech and religion]]\n\n## What an amendment is\nAn **amendment** is an addition or change to the Constitution. Because an amendment can add new protections, it lets the Constitution grow over time. The Bill of Rights was **ratified** (officially approved) in **1791**.\n\n## The famous First Amendment\nThe **First Amendment** is one of the most important. It protects freedom of **speech**, **religion**, and the **press**, plus the right to **assemble** (gather peacefully) and to **petition** the government. These freedoms let people share ideas, worship as they choose, and criticize their leaders without fear of punishment.\n\n## Other protections\nOther amendments protect people too. Some guarantee a **fair trial** by jury. Others protect homes against **unfair searches**. Together they set limits on what the government is allowed to do to a person.\n\n## The real purpose: limiting government\nHere is the key idea. The main purpose of the Bill of Rights is to **limit the power of government**. By writing down rights the government **cannot** take away, it protects each person's freedom. These protections still shape American life, schools, and courtrooms today.\n\n## Watch for this\nThe Bill of Rights is not a list of the Presidents and it is not the plan for the three branches, that plan is the main body of the Constitution. The Bill of Rights is specifically the **first ten amendments**, and its job is to **protect freedoms and limit government power**.\n\n## The big idea\nAmericans demanded the Bill of Rights, the first ten amendments, to guarantee freedoms like speech and religion and to limit what the government could do. It protects individual rights and still guides American law today.",
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
    framework: "C3 Framework for Social Studies, Civics (High School)",
    intro: "American democracy rests on how power is divided and how citizens shape policy. In this course you will analyze the constitutional structure and the lawmaking process.",
    outcome: "I can explain how the Constitution distributes and limits power and evaluate how citizens influence policy.",
    tags: ["government", "democracy", "federalism", "grade 11", "c3"],
    persona: { email: "emma.k12@synops-demo.test", firstName: "Emma", lastName: "Novak", grade: 11, gradeLabel: "Grade 11", learningStyle: "visual", accommodations: ["concrete_examples", "extended_processing", "scaffolded_questions", "chunked_content"], progressFraction: 0.45 },
    modules: [
      { title: "Separation of Powers, Checks and Balances, and Federalism", outcome: "I can explain how the Constitution distributes and constrains political power.", video: "https://www.youtube.com/watch?v=APcKEHAPYEg", hook: "How does a written document stop any single person or level of government from seizing total control?", minutes: 25, game: "choice",
        standards: [{ code: "C3.D2.CIV.4.9-12", title: "Explain how constitutions distribute and constrain political power" }],
        points: ["Separation of powers divides government into three branches.", "Checks and balances let each branch limit the others.", "Federalism divides power between national and state governments."],
        reading: "How can a piece of paper stop a president, a congress, or a state from seizing total control? The U.S. Constitution answers this with three connected principles that spread power out so thinly that no single person or level of government can dominate. Understanding these three ideas explains almost everything about how American government is structured.\n\n## Three principles, one goal\nThe three principles are **separation of powers**, **checks and balances**, and **federalism**. Their shared goal is the same: keep power **divided** so liberty is protected. Think of them as three different walls the framers built against tyranny.\n\n## Separation of powers\n**Separation of powers** divides governing authority among three branches, each with a distinct job. The **legislative** branch (Congress) makes laws. The **executive** branch (the President) enforces them. The **judicial** branch (the courts) interprets them. Because no single branch holds all three powers, no branch can rule alone.\n\n[[fig:separation-powers|Three branches, each able to check the others, power is shared, never concentrated]]\n\n## Checks and balances\n**Checks and balances** let each branch **restrain** the others. Congress passes a bill, but the President can **veto** it; Congress can then override that veto with a **two-thirds** vote in both chambers. The courts can rule a law **unconstitutional**. These overlapping powers force the branches to cooperate and stop any one of them from going too far.\n\n## Federalism\n**Federalism** divides power between the **national government** and the **states**. Some powers belong to the national government (such as coining money and running the military). Others belong mostly to the states (such as running schools and issuing driver's licenses). Some powers, like collecting taxes, are **shared**. This adds a second dimension of divided power, not just among branches, but between levels of government.\n\n## Why they work together\nEach principle blocks a different path to too much power. Separation of powers stops one branch from doing everything. Checks and balances stop one branch from overpowering the others. Federalism stops the national government from controlling everything the states do. Together they make it very hard for any person or group to gain **unchecked control**, which is exactly the point.\n\n## Watch for this\nKeep the three straight. **Separation of powers** and **checks and balances** are about the three *branches*. **Federalism** is about the split between the *nation and the states*. A president vetoing a bill is checks and balances; a state running its own schools is federalism.\n\n## The big idea\nSeparation of powers, checks and balances, and federalism all divide power, among branches and between levels of government. They work together to keep any single person or group from gaining unchecked control, which safeguards democratic government.",
        quiz: [
          { q: "What does federalism divide power between?", options: ["The national government and the states", "The Senate and the House only", "Two political parties", "The President and the Vice President"], answer: 0 },
          { q: "Which is an example of checks and balances?", options: ["States running their own schools", "The President vetoing a bill from Congress", "Citizens voting in an election", "A city passing a parking rule"], answer: 1 },
          { q: "Under separation of powers, which branch interprets laws?", options: ["Legislative", "Executive", "Judicial", "Federal"], answer: 2 },
          { q: "Why do these three principles work together?", options: ["To give Congress unlimited power", "To eliminate state governments", "To speed up all decisions", "To keep any person or group from gaining unchecked control"], answer: 3 },
        ], caseContext: "", caseOpening: "" },
      { title: "How a Bill Becomes a Law and How Citizens Influence Policy", outcome: "I can trace how a bill becomes a law and evaluate how citizens influence policy.", hook: "Between an idea and an official law, how many hurdles must an idea clear, and where can citizens push?", minutes: 25, game: "pair",
        standards: [{ code: "C3.D2.CIV.8.9-12", title: "Evaluate social and political systems, citing evidence" }],
        points: ["A bill must pass both houses of Congress and be signed by the President.", "Committees, debate, and votes shape a bill along the way.", "Citizens influence policy through voting, advocacy, and public opinion."],
        reading: "An idea for a new law does not become a law overnight. It has to clear a series of hurdles, and at almost every hurdle, ordinary citizens have a chance to push. Learning the path shows you both **how** laws are made and **where** your voice can matter most.\n\n## From idea to law\nMost ideas for laws never make it. The process is deliberately full of checkpoints, so only ideas with real support survive. That can feel slow, but it is a feature, not a bug: it forces debate and agreement before the country adopts a new rule.\n\n## It starts with a bill\n[[fig:bill-to-law|A bill travels from Congress to committee to both chambers to the President before it becomes law]]\n\nFirst, a member of Congress introduces a **bill**, a written proposal for a law. Anyone can suggest an idea to their representative, but only a member of Congress can formally introduce it. That single step turns an idea into an official proposal.\n\n## Committees do the heavy lifting\nThe bill goes to a **committee**, a small group of lawmakers who specialize in that topic. There it is **studied, debated, and revised**. This is where much of the real work, and much of the filtering, happens. **Many bills stop here** and never move forward.\n\n## Passing both chambers\nIf the committee approves it, the full chamber debates and votes. To advance, a bill must pass **both** the House **and** the Senate, usually in matching form. Needing both chambers to agree is another check that keeps rushed or one-sided bills from becoming law.\n\n## The President's choice\nOnce both chambers pass it, the bill goes to the **President**, who can **sign** it into law or **veto** it. If the President vetoes it, Congress can still **override** the veto with a **two-thirds** vote in both chambers. So even a presidential rejection is not always the end.\n\n## Where citizens push\nCitizens shape this process at many points. They **vote** for representatives who share their views. They **contact lawmakers**, sign petitions, join interest groups, and shape **public opinion** through media and peaceful protest. Evidence from real campaigns shows that sustained public pressure can move lawmakers to pass a bill, or to block one.\n\n## Watch for this\nA bill is not a law just because one chamber likes it, or because the President supports it. It must pass **both** the House and the Senate first. And remember that a veto can be overridden, so the President does not have the final word by default.\n\n## The big idea\nA bill must survive committee, pass both chambers of Congress, and get the President's signature (or a veto override) to become law. Because the path has so many checkpoints, citizens who vote, contact lawmakers, and shape public opinion can influence policy at many steps along the way.",
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
function gameHtml(title: string, items: { q: string; options: string[]; answer: number; img?: string; emoji?: string }[], mode: string, lang = "en"): string {
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
function renderLadder(){total=items.length;setStars();hint.textContent=L('Answer to climb the ladder! 🪜','¡Responde para subir la escalera! 🪜');var i=0;function step(){app.innerHTML='';var head=document.createElement('div');head.className='q';head.style.textAlign='center';head.innerHTML='<div style="font-weight:800;font-size:1.15rem;color:#4F46E5">🪜 '+L('Step','Escalón')+' '+(i+1)+' / '+total+'</div><div style="font-size:.85rem;color:#6b7280">'+L('Keep climbing!','¡Sigue subiendo!')+'</div>';app.appendChild(head);var it=items[i];var d=document.createElement('div');d.className='q';d.innerHTML=(it.img?'<img class="qimg" src="'+it.img+'">':'')+'<p class="qt">'+it.q+'</p>';shuffle(it.options.map(function(o,k){return{o:o,k:k};})).forEach(function(p){var b=document.createElement('button');b.className='opt';b.innerHTML='<span>'+p.o+'</span><span class="mk"></span>';b.onclick=function(){if(d.dataset.done)return;var mk=b.querySelector('.mk');if(p.k===it.answer){b.classList.add('correct');mk.textContent='✅';d.dataset.done='1';[].slice.call(d.querySelectorAll('.opt')).forEach(function(x){if(x!==b)x.disabled=true;});burst(b,'balloon');stars++;setStars();i++;if(i>=total)setTimeout(function(){finish(L('You reached the top!','¡Llegaste a la cima!'));},750);else setTimeout(step,850);}else{b.classList.add('wrong');mk.textContent='❌';setTimeout(function(){b.classList.remove('wrong');mk.textContent='';},700);}};d.appendChild(b);});app.appendChild(d);}step();}
if(MODE==='find')renderFind();else if(MODE==='match')renderMatch();else if(MODE==='memory')renderMemory();else if(MODE==='puzzle')renderPuzzle();else if(MODE==='pair')renderPair();else if(MODE==='sort')renderSort();else if(MODE==='ladder')renderLadder();else if(MODE==='ememory')renderEmemory();else renderChoice();
function renderEmemory(){var pe=items.filter(function(x){return x.emoji;});total=pe.length;setStars();hint.textContent=L('Flip two cards to find each word and its picture! 👆','¡Voltea dos cartas para unir cada palabra con su dibujo! 👆');var cards=[];pe.forEach(function(it){cards.push({key:it.q,type:'emoji',e:it.emoji});cards.push({key:it.q,type:'word'});});cards=shuffle(cards);var grid=document.createElement('div');grid.className='mgrid';app.appendChild(grid);var first=null,lock=false,matched=0;cards.forEach(function(cd){var b=document.createElement('button');b.className='card';b.innerHTML='<span class="face">?</span>';b.onclick=function(){if(lock||b.classList.contains('open')||b.classList.contains('done'))return;b.classList.add('open');b.querySelector('.face').innerHTML=cd.type==='emoji'?'<span style="font-size:2.4rem">'+cd.e+'</span>':'<span style="font-size:1rem;font-weight:800;padding:0 4px">'+cd.key+'</span>';if(!first){first=b;first.__key=cd.key;}else{lock=true;if(first.__key===cd.key&&first!==b){setTimeout(function(){first.classList.add('done');b.classList.add('done');burst(b,'balloon');stars++;setStars();matched++;first=null;lock=false;if(matched===total)setTimeout(function(){finish(L('Amazing memory!','¡Qué buena memoria!'));},550);},400);}else{setTimeout(function(){first.classList.remove('open');first.querySelector('.face').innerHTML='?';b.classList.remove('open');b.querySelector('.face').innerHTML='?';first=null;lock=false;},850);}}};grid.appendChild(b);});}</script>`;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function firstOrNull<T>(rows: T[]): T | null { return rows.length ? rows[0]! : null; }

// Localise a string by course language so a Spanish course reads Spanish end-to-end (headers, beat
// titles, narration), not just the game instructions.
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

// A quiz activity's title + instructions, in the course language and stating the learning objective, // so EVERY activity has clear, localized instructions and a stated objective (not a bare English label).
function quizTitle(m: K12Module, lang?: string): string {
  return TL(lang, `${m.title}: practice check`, `${m.title}: repaso`);
}
function quizInstructions(m: K12Module, lang?: string): string {
  return TL(lang,
    `Objective: ${m.outcome} Answer each question and check your work, you can retry as many times as you like.`,
    `Objetivo: ${m.outcome} Responde cada pregunta y revisa tu trabajo, puedes intentarlo las veces que quieras.`);
}

// Give every quiz question a relevant background-removed photograph (served cut-out via /api/kid-cutout),
// so EVERY class shows real photos, not only the reading courses. Keyed by module title → the cut-out
// keys to cycle through its questions; falls back to no image if a module isn't mapped (e.g. the picture
// reading courses already carry their own per-item images).
function withImages(m: K12Module): K12Module["quiz"] {
  const keys = MODULE_IMAGES[m.title];
  if (!keys || !keys.length) return m.quiz;
  return m.quiz.map((q, i) => (q.img ? q : { ...q, img: CUT(keys[i % keys.length]!) }));
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
  const description = `${c.emoji} ${c.intro}\n\n${TL(c.lang, "Course goal", "Meta del curso")}: ${c.outcome}`;
  const [course] = await db.insert(coursesTable).values({
    title: c.title, description, tenantId: "platform", status: "published",
    competencyTags: [...c.tags, c.subject, c.gradeLabel], objectives: outcomes, nqfLevel: c.grade,
  }).returning();

  for (let mi = 0; mi < c.modules.length; mi++) {
    const m = c.modules[mi];
    const [mod] = await db.insert(modulesTable).values({
      courseId: course.id, title: m.title, status: "published", lessonType: "slides",
      modality: "async", order: mi, objectives: [m.outcome], estimatedMinutes: m.minutes,
      description: `${c.subject} · ${c.gradeLabel}. ${TL(c.lang, "Goal", "Meta")}: ${m.outcome}`,
    }).returning();

    const lang = c.lang;
    await db.insert(beatsTable).values([
      { moduleId: mod.id, type: "title_card", order: 0, title: m.title, narration: TL(lang, `${m.hook}  By the end of this lesson you'll be able to: ${m.outcome}`, `${m.hook}  Al terminar esta lección podrás: ${m.outcome}`) },
      { moduleId: mod.id, type: "points", order: 1, title: TL(lang, "Big ideas", "Ideas importantes"), narration: TL(lang, `Keep the question in mind: ${m.hook}`, `Ten presente la pregunta: ${m.hook}`), bulletPoints: m.points },
      { moduleId: mod.id, type: "close", order: 2, title: TL(lang, "You've got this", "¡Tú puedes!"), narration: TL(lang, `Nice work, you can now ${m.outcome.toLowerCase()} Try the practice, then move on.`, `¡Buen trabajo! Ya puedes ${m.outcome.toLowerCase()} Haz la práctica y sigue adelante.`) },
      // Optional teaching video (YouTube), surfaced as a "Watch" step in the young lesson view.
      ...(m.video ? [{ moduleId: mod.id, type: "video" as const, order: 3, title: TL(lang, "Watch", "Ver"), narration: TL(lang, `Watch this short video, then keep going: ${m.hook}`, `Mira este video corto y luego continúa: ${m.hook}`), videoUrl: m.video }] : []),
    ]);
    await db.update(modulesTable).set({ beatCount: m.video ? 4 : 3 }).where(eq(modulesTable.id, mod.id));

    const body = readingBody(m, lang);
    await db.insert(moduleReadingsTable).values({
      moduleId: mod.id, courseId: course.id, title: TL(lang, `Lesson: ${m.title}`, `Lección: ${m.title}`),
      kind: "note", content: body, chars: body.length, order: 0, published: true, createdBy: facultyId,
    });

    // Interactive quiz (every module → satisfies the "interactive" completeness component).
    await db.insert(interactiveActivitiesTable).values({
      organisationId: orgId, courseId: course.id, moduleId: mod.id,
      title: quizTitle(m, c.lang),
      instructions: quizInstructions(m, c.lang),
      html: gameHtml(quizTitle(m, c.lang), withImages(m), m.game ?? "choice", c.lang ?? "en"), source: "html", kind: "quiz",
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
    title: TL(c.lang, `Show what you learned: ${c.subject}`, `Muestra lo que aprendiste: ${c.subject}`),
    description: TL(c.lang, `A short, friendly wrap-up task for ${c.title}.`, `Una tarea corta y amigable para cerrar ${c.title}.`),
    instructions: TL(c.lang,
      `Objective: ${c.outcome} In your own words (or a quick recording), explain the most important thing you learned in this course and give one example.`,
      `Objetivo: ${c.outcome} Con tus propias palabras (o una grabación corta), explica lo más importante que aprendiste en este curso y da un ejemplo.`),
    submissionType: "file_upload", pointsPossible: "100", published: true, position: 0,
  });
  await db.insert(discussionsTable).values({
    courseId: course.id, authorId: facultyId, moduleId: null,
    title: TL(c.lang, `Class discussion: ${c.title}`, `Conversación de clase: ${c.title}`),
    body: TL(c.lang,
      `Share one thing that surprised you in this course, and reply kindly to a classmate.`,
      `Comparte algo que te sorprendió en este curso y responde con amabilidad a un compañero.`),
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
    // module), leaving a course with fewer modules than it should have, which idempotent reuse
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

  // 3a2. Reconcile the class roster of COURSES: drop stale attachments left by earlier seeds (old
  // duplicate courses like "Reading Lab") so the class, and the public commendations page, shows
  // exactly the current two-subjects-per-learner set, nothing orphaned.
  {
    const planCourseIds = Object.values(courseIdByTitle);
    const attached = await db.select().from(orgClassCoursesTable).where(eq(orgClassCoursesTable.classId, cls.id));
    const staleAttach = attached.filter((a) => !planCourseIds.includes(a.courseId)).map((a) => a.courseId);
    if (staleAttach.length) await db.delete(orgClassCoursesTable).where(and(eq(orgClassCoursesTable.classId, cls.id), inArray(orgClassCoursesTable.courseId, staleAttach)));
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
  // edits actually propagate, existing courses are reused, not recreated, on reseed.
  for (const c of ALL_COURSES) {
    const cid = courseIdByTitle[c.title];
    if (!cid) continue;
    // Refresh the COURSE description too (localized "Meta del curso" label), so a reused Spanish
    // course never keeps a stale English "Course goal:" from an earlier seed.
    await db.update(coursesTable).set({ description: `${c.emoji} ${c.intro}\n\n${TL(c.lang, "Course goal", "Meta del curso")}: ${c.outcome}` }).where(eq(coursesTable.id, cid));
    const cmods = await db.select().from(modulesTable).where(eq(modulesTable.courseId, cid)).orderBy(asc(modulesTable.order));
    for (let i = 0; i < cmods.length && i < c.modules.length; i++) {
      const m = c.modules[i];
      const modId = cmods[i].id;
      const lang = c.lang;
      await db.update(interactiveActivitiesTable)
        .set({ title: quizTitle(m, lang), instructions: quizInstructions(m, lang), html: gameHtml(quizTitle(m, lang), withImages(m), m.game ?? "choice", lang ?? "en") })
        .where(and(eq(interactiveActivitiesTable.moduleId, modId), eq(interactiveActivitiesTable.kind, "quiz")));
      const body = readingBody(m, lang);
      await db.update(moduleReadingsTable).set({ title: TL(lang, `Lesson: ${m.title}`, `Lección: ${m.title}`), content: body, chars: body.length }).where(eq(moduleReadingsTable.moduleId, modId));
      await db.update(modulesTable).set({ title: m.title, objectives: [m.outcome], estimatedMinutes: m.minutes, description: TL(lang, `${c.subject} · ${c.gradeLabel}. Goal: ${m.outcome}`, `${c.subject} · ${c.gradeLabel}. Meta: ${m.outcome}`) }).where(eq(modulesTable.id, modId));
      // Converge the story beats in place (keeps beatIds → pre-filled progress intact) so a language or
      // title change propagates, and reconcile the optional video beat (remove it if the module no longer
      // has a video, add it if it gained one).
      await db.update(beatsTable).set({ title: m.title, narration: TL(lang, `${m.hook}  By the end of this lesson you'll be able to: ${m.outcome}`, `${m.hook}  Al terminar esta lección podrás: ${m.outcome}`) }).where(and(eq(beatsTable.moduleId, modId), eq(beatsTable.order, 0)));
      await db.update(beatsTable).set({ title: TL(lang, "Big ideas", "Ideas importantes"), narration: TL(lang, `Keep the question in mind: ${m.hook}`, `Ten presente la pregunta: ${m.hook}`), bulletPoints: m.points }).where(and(eq(beatsTable.moduleId, modId), eq(beatsTable.order, 1)));
      await db.update(beatsTable).set({ title: TL(lang, "You've got this", "¡Tú puedes!"), narration: TL(lang, `Nice work, you can now ${m.outcome.toLowerCase()} Try the practice, then move on.`, `¡Buen trabajo! Ya puedes ${m.outcome.toLowerCase()} Haz la práctica y sigue adelante.`) }).where(and(eq(beatsTable.moduleId, modId), eq(beatsTable.order, 2)));
      const vbeats = await db.select().from(beatsTable).where(and(eq(beatsTable.moduleId, modId), eq(beatsTable.type, "video")));
      if (!m.video && vbeats.length) {
        await db.delete(beatsTable).where(and(eq(beatsTable.moduleId, modId), eq(beatsTable.type, "video")));
      } else if (m.video && !vbeats.length) {
        await db.insert(beatsTable).values({ moduleId: modId, type: "video", order: 3, title: TL(lang, "Watch", "Ver"), narration: TL(lang, `Watch this short video, then keep going: ${m.hook}`, `Mira este video corto y luego continúa: ${m.hook}`), videoUrl: m.video });
      }
      await db.update(modulesTable).set({ beatCount: m.video ? 4 : 3 }).where(eq(modulesTable.id, modId));

      // Interactive checkpoints on the module's video (idempotent: rebuild the demo set each reseed).
      const cps = VIDEO_CHECKPOINTS[m.title];
      if (m.video && cps) {
        const [vb] = await db.select().from(beatsTable).where(and(eq(beatsTable.moduleId, modId), eq(beatsTable.type, "video"))).limit(1);
        if (vb) {
          await db.delete(interactiveVideoQuestionsTable).where(eq(interactiveVideoQuestionsTable.beatId, vb.id));
          for (const cp of cps) {
            await db.insert(interactiveVideoQuestionsTable).values({
              beatId: vb.id, videoTimestamp: String(cp.t), questionType: "multiple_choice", stem: cp.stem,
              options: cp.options.map((t, i) => ({ id: `o${i}`, text: t })), correctOptionIds: [`o${cp.correct}`],
              feedbackCorrect: cp.feedback, pauseOnReach: true, required: true, points: String(1),
            });
          }
        }
      }
    }
  }

  // 3d. Pre-attach a grade-appropriate game to each NON-young course so games are visibly part of the
  // classes out of the box (no teacher action needed). Young early/elementary courses (Mateo, Sofía,
  // Aiden) are skipped on purpose: their lesson view auto-launches the module's first activity, so a
  // bonus game must never displace the guided quiz. Idempotent: refreshed in place by title.
  // Each game's content is written to REVIEW that specific course, not generic trivia, so the game is
  // clearly relevant to the lesson it sits in.
  const gamePlan: { email: string; courseTitle: string; key: string; band: Band; instructions: string; content: Record<string, unknown> }[] = [
    { email: "maya.k12@synops-demo.test", courseTitle: "Math 6: Ratios & Rates", key: "jeopardy", band: "68",
      instructions: "Pick a value, read the clue, work it out as a team, then reveal and score. All about ratios and rates!",
      content: { title: "Ratios & Rates Jeopardy", categories: [
        { name: "Ratios", clues: [
          { value: 100, clue: "The ratio 6 cats to 9 dogs, simplified", answer: "2 to 3", options: ["2 to 3", "3 to 2", "6 to 9", "2 to 5"] },
          { value: 200, clue: "A recipe uses 2 cups flour to 3 cups sugar. Flour-to-sugar ratio?", answer: "2 : 3", options: ["2 : 3", "3 : 2", "2 : 5", "5 : 3"] },
          { value: 300, clue: "Boys to girls is 3 : 4. If there are 12 boys, how many girls?", answer: "16", options: ["16", "9", "12", "20"] } ] },
        { name: "Unit Rates", clues: [
          { value: 100, clue: "120 miles in 2 hours is how many miles per hour?", answer: "60 mph", options: ["60 mph", "240 mph", "30 mph", "2 mph"] },
          { value: 200, clue: "$6 for 3 pounds is what price per pound?", answer: "$2 per pound", options: ["$2 per pound", "$3 per pound", "$18 per pound", "$0.50 per pound"] },
          { value: 300, clue: "A car goes 150 miles on 5 gallons. Miles per gallon?", answer: "30 mpg", options: ["30 mpg", "15 mpg", "150 mpg", "5 mpg"] } ] },
        { name: "Proportions", clues: [
          { value: 100, clue: "Solve: 2/4 = x/8", answer: "x = 4", options: ["x = 4", "x = 2", "x = 8", "x = 16"] },
          { value: 200, clue: "3 pens cost $1.50. How much for 5 pens?", answer: "$2.50", options: ["$2.50", "$4.50", "$1.50", "$7.50"] },
          { value: 300, clue: "Map scale 1 inch = 20 miles. How far is 3.5 inches?", answer: "70 miles", options: ["70 miles", "60 miles", "35 miles", "23.5 miles"] } ] },
      ] } },
    { email: "leo.k12@synops-demo.test", courseTitle: "Science 6: Ecosystems", key: "feud", band: "68",
      instructions: "Read the survey question about ecosystems. Tap the answers you think are most popular, three misses ends the round.",
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
          { value: 100, clue: "Solve: x + 7 = 12", answer: "x = 5", options: ["x = 5", "x = 19", "x = 7", "x = 12"] },
          { value: 200, clue: "Solve: 3x = 21", answer: "x = 7", options: ["x = 7", "x = 18", "x = 24", "x = 63"] },
          { value: 300, clue: "Solve: 2x − 4 = 10", answer: "x = 7", options: ["x = 7", "x = 3", "x = 5", "x = 12"] } ] },
        { name: "Slope", clues: [
          { value: 100, clue: "The slope in y = 4x + 2", answer: "4", options: ["4", "2", "6", "1/4"] },
          { value: 200, clue: "Slope between (0, 0) and (2, 6)", answer: "3", options: ["3", "2", "6", "1/3"] },
          { value: 300, clue: "A line rises 6 for every run of 3. Its slope?", answer: "2", options: ["2", "3", "6", "18"] } ] },
        { name: "Functions", clues: [
          { value: 100, clue: "In y = mx + b, b is called the…", answer: "y-intercept", options: ["y-intercept", "slope", "x-intercept", "coefficient"] },
          { value: 200, clue: "If f(x) = 2x + 1, find f(3)", answer: "7", options: ["7", "6", "5", "9"] },
          { value: 300, clue: "Is y = 3x + 1 linear or nonlinear?", answer: "Linear", options: ["Linear", "Nonlinear", "Quadratic", "Exponential"] } ] },
      ] } },
    // Second-subject games (gamification for each learner's other class).
    { email: "maya.k12@synops-demo.test", courseTitle: "Civics 6: How Government Works", key: "jeopardy", band: "68",
      instructions: "Pick a value, read the clue about U.S. government, answer as a team, then reveal and score.",
      content: { title: "How Government Works Jeopardy", categories: [
        { name: "Branches", clues: [
          { value: 100, clue: "This branch makes the laws", answer: "Legislative", options: ["Legislative", "Executive", "Judicial", "Federal"] },
          { value: 200, clue: "This branch carries out and enforces the laws", answer: "Executive", options: ["Executive", "Legislative", "Judicial", "Congress"] },
          { value: 300, clue: "This branch interprets laws and decides what they mean", answer: "Judicial", options: ["Judicial", "Legislative", "Executive", "Military"] } ] },
        { name: "Who Does It", clues: [
          { value: 100, clue: "Congress is made up of the House and the…", answer: "Senate", options: ["Senate", "Supreme Court", "Cabinet", "President"] },
          { value: 200, clue: "This person leads the executive branch", answer: "The President", options: ["The President", "The Chief Justice", "The Speaker", "A Senator"] },
          { value: 300, clue: "The highest court in the judicial branch", answer: "The Supreme Court", options: ["The Supreme Court", "Congress", "The White House", "A district court"] } ] },
        { name: "Citizens", clues: [
          { value: 100, clue: "A key right that lets you choose your leaders", answer: "The right to vote", options: ["The right to vote", "The right to a jury", "Freedom of speech", "The right to travel"] },
          { value: 200, clue: "Serving on this helps make trials fair", answer: "A jury", options: ["A jury", "A committee", "The Senate", "A campaign"] },
          { value: 300, clue: "Splitting power so no branch gets too strong is called…", answer: "Separation of powers", options: ["Separation of powers", "Federalism", "Democracy", "Voting"] } ] },
      ] } },
    { email: "leo.k12@synops-demo.test", courseTitle: "World History 6: Early Civilizations", key: "feud", band: "68",
      instructions: "Read the survey question about early civilizations. Tap the answers you think are most popular, three misses ends the round.",
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
          { value: 100, clue: "Dividing power among three branches is called…", answer: "Separation of powers", options: ["Separation of powers", "Federalism", "Checks and balances", "Democracy"] },
          { value: 200, clue: "Dividing power between the nation and the states is called…", answer: "Federalism", options: ["Federalism", "Separation of powers", "Checks and balances", "Bicameralism"] },
          { value: 300, clue: "The system that lets each branch limit the others", answer: "Checks and balances", options: ["Checks and balances", "Federalism", "Separation of powers", "Veto power"] } ] },
        { name: "Lawmaking", clues: [
          { value: 100, clue: "A proposed law is called a…", answer: "Bill", options: ["Bill", "Veto", "Statute", "Amendment"] },
          { value: 200, clue: "To advance, a bill must pass both the House and the…", answer: "Senate", options: ["Senate", "President", "Supreme Court", "Cabinet"] },
          { value: 300, clue: "The President rejecting a bill is called a…", answer: "Veto", options: ["Veto", "Filibuster", "Override", "Ratification"] } ] },
        { name: "Citizens", clues: [
          { value: 100, clue: "The most common way citizens choose representatives", answer: "Voting", options: ["Voting", "Vetoing", "Lobbying", "Protesting"] },
          { value: 200, clue: "Congress can override a veto with this fraction vote", answer: "Two-thirds", options: ["Two-thirds", "One-half", "Three-fourths", "One-third"] },
          { value: 300, clue: "Groups that organize to influence policy are called interest…", answer: "Groups", options: ["Groups", "Parties", "Committees", "Branches"] } ] },
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
          instructions: "Solve each problem. Drag the dot on the number line or type your answer. Stuck? Ask the coach, it helps you with hints, never the answer!",
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
        { prompt: "Solve for x:  2x + 3 = 11", answer: "4", kind: "number", min: 0, max: 12, visual: "balance", eq: { a: 2, b: 3, c: 11 }, hint: "First get the x-boxes by themselves, clear the +3." },
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
          instructions: "Solve each equation by keeping the scale balanced, do the same to both sides until one x is left. Stuck? Ask the coach for a hint.",
          html, source: "html", kind: "math-coach", bloomsLevel: "Apply", difficulty: "advanced",
          isLibrary: false, tags: ["math-coach", "game:mathcoach", "band:912", "subject:Math"], published: true, createdByUserId: facultyId,
        });
      }
    }
  }

  // 3g. A Spanish Socratic "Tutor de Mates" for Sofía's Grade-3 multiplication course, a number-line
  // problem set with a coach that hints in Spanish (never the answer). Adds a genuinely different game
  // type (guided problem-solving) to her class, fully in Spanish.
  const sofiaMathId = courseIdByTitle["Matemáticas (Grado 3): Multiplicación"];
  if (sofiaMathId) {
    const [smMod] = await db.select().from(modulesTable).where(eq(modulesTable.courseId, sofiaMathId)).orderBy(asc(modulesTable.order)).limit(1);
    if (smMod) {
      const problems = { problems: [
        { prompt: "Hay 3 platos y en cada plato hay 4 galletas. ¿Cuántas galletas hay en total?", answer: "12", kind: "number", min: 0, max: 30, hint: "Cuenta cuántos grupos (platos) hay y cuántas galletas en cada uno; luego multiplica." },
        { prompt: "Ana tiene 4 bolsas. En cada bolsa hay 6 manzanas. ¿Cuántas manzanas tiene en total?", answer: "24", kind: "number", min: 0, max: 40, hint: "Son 4 grupos de 6. Puedes sumar 6 cuatro veces." },
        { prompt: "Hay 5 mesas y en cada mesa hay 3 sillas. ¿Cuántas sillas hay?", answer: "15", kind: "number", min: 0, max: 30, hint: "5 grupos de 3. La palabra 'cada' te dice que los grupos son iguales." },
        { prompt: "2 cajas y en cada caja hay 5 lápices. ¿Cuántos lápices hay?", answer: "10", kind: "number", min: 0, max: 20, hint: "2 grupos de 5." },
        { prompt: "¿Cuánto es 6 × 3?", answer: "18", kind: "number", min: 0, max: 30, hint: "6 × 3 son 6 grupos de 3: suma 3 seis veces." },
        { prompt: "Hay 3 filas y en cada fila hay 4 estrellas. ¿Cuántas estrellas hay?", answer: "12", kind: "number", min: 0, max: 24, hint: "3 filas de 4 es lo mismo que 3 × 4." },
      ] };
      const title = "🧮 Tutor de Mates: Multiplicación";
      const html = JSON.stringify(problems);
      const existing = await db.select().from(interactiveActivitiesTable).where(and(eq(interactiveActivitiesTable.moduleId, smMod.id), eq(interactiveActivitiesTable.title, title)));
      if (existing[0]) {
        await db.update(interactiveActivitiesTable).set({ html, updatedAt: new Date() }).where(eq(interactiveActivitiesTable.id, existing[0].id));
      } else {
        await db.insert(interactiveActivitiesTable).values({
          organisationId: org.id, courseId: sofiaMathId, moduleId: smMod.id, title,
          instructions: "Resuelve cada problema. Arrastra el punto en la recta numérica o escribe tu respuesta. ¿Atascado? Pregúntale al tutor, te ayuda con pistas, ¡nunca con la respuesta!",
          html, source: "html", kind: "math-coach", bloomsLevel: "Apply", difficulty: "beginner",
          isLibrary: false, tags: ["math-coach", "game:mathcoach", "band:35", "subject:Math", "lang:es"], published: true, createdByUserId: facultyId,
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
