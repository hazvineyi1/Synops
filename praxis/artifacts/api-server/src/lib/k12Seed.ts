import { db } from "@workspace/db";
import {
  partnersTable, brandThemesTable, organisationsTable, usersTable,
  coursesTable, modulesTable, beatsTable, moduleReadingsTable,
  caseScenariosTable, interactiveActivitiesTable, discussionsTable, assignmentsTable,
  coursePartnerAssignmentsTable, enrolmentsTable,
  orgClassesTable, orgClassCoursesTable, orgClassStaffTable,
  beatProgressTable, credentialsTable,
  unitStandardsTable, unitStandardMappingsTable,
} from "@workspace/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import { hashPassword } from "../lib/auth";
import { PRIVACY_POLICY_VERSION } from "../lib/popia";

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
}

// Early-reader "picture words" served as transparent cut-out PNGs by /api/kid-cutout (background
// removed once via remove.bg, cached; falls back to the original photo if no key is set). Absolute
// URLs because the quiz renders inside a srcdoc iframe where relative URLs don't resolve.
const CUTOUT_HOST = "https://praxis.synops-consulting.com";
const KID_PICS: Record<string, string> = {
  cat: `${CUTOUT_HOST}/api/kid-cutout/cat.png`,
  dog: `${CUTOUT_HOST}/api/kid-cutout/dog.png`,
  sun: `${CUTOUT_HOST}/api/kid-cutout/sun.png`,
  hat: `${CUTOUT_HOST}/api/kid-cutout/hat.png`,
};

// ── COURSES (one per persona; two comprehensive lessons each) ────────────────
const COURSES: K12Course[] = [
  // 0) MATEO · Grade 1 · just starting out (K-2 band) ─────────────────────────
  {
    title: "Letters & First Words (Grade 1)", subject: "English Language Arts", emoji: "🔤", grade: 1, gradeLabel: "Grade 1",
    framework: "Common Core State Standards — Grade 1 Foundational Reading",
    intro: "Let's find letters and read our first words — just look and tap! No reading out loud needed.",
    outcome: "Recognize letters and match simple words to their pictures.",
    tags: ["ela", "reading", "letters", "grade 1", "common core"],
    persona: { email: "mateo.k12@synops-demo.test", firstName: "Mateo", lastName: "Flores", grade: 1, gradeLabel: "Grade 1", learningStyle: "kinesthetic", accommodations: ["simplified_language", "concrete_examples", "chunked_content", "positive_reinforcement"], progressFraction: 0.35 },
    modules: [
      { title: "Finding letters", outcome: "Find and name letters.", hook: "Letters are everywhere! Can you find the letter B?", minutes: 5,
        standards: [{ code: "CCSS.ELA-LITERACY.RF.1.1", title: "Demonstrate understanding of the organization and basic features of print" }],
        points: ["Every letter has a name", "Big letters (A) and small letters (a) are partners", "We can find letters all around us"],
        reading: "Letters are the building blocks of reading! Every letter has a **big** shape and a **small** shape. Big **A** and small **a** are the same letter — they are partners.\n\nLook for letters everywhere — on signs, on books, on toys. When you see one, just **tap** it. You're a letter detective! 🕵️⭐",
        quiz: [
          { q: "Which one is the letter B?", options: ["B", "D", "P", "R"], answer: 0 },
          { q: "Which one is a small (little) letter?", options: ["a", "A", "T", "M"], answer: 0 },
          { q: "The big partner for small 'm' is…", options: ["M", "E", "O", "S"], answer: 0 },
          { q: "Which one is a letter?", options: ["S", "5", "?", "7"], answer: 0 },
        ],
        caseContext: "", caseOpening: "" },
      { title: "Reading picture words", outcome: "Match a word to its picture.", hook: "See the picture, then tap the word that matches!", minutes: 5,
        standards: [{ code: "CCSS.ELA-LITERACY.RF.1.3", title: "Know and apply grade-level phonics and word analysis skills in decoding words" }],
        points: ["Words name the things we see", "Look at the picture, then find the word", "You can read short words!"],
        reading: "Words tell us the names of things. When you see a picture, you can find the word that matches it!\n\nA 🐱 is a **cat**. A 🌞 is the **sun**. A 🐶 is a **dog**. Look at the picture, then tap the right word. You're reading! 📖⭐",
        quiz: [
          { q: "Which word matches this picture?", img: KID_PICS.cat, options: ["cat", "dog", "sun", "hat"], answer: 0 },
          { q: "Which word matches this picture?", img: KID_PICS.sun, options: ["sun", "run", "six", "sit"], answer: 0 },
          { q: "Which word matches this picture?", img: KID_PICS.dog, options: ["dog", "log", "dig", "day"], answer: 0 },
          { q: "Which word matches this picture?", img: KID_PICS.hat, options: ["hat", "ham", "hop", "cat"], answer: 0 },
        ],
        caseContext: "", caseOpening: "" },
    ],
  },
  // 1) SOFÍA · Grade 3 · Spanish-speaking English learner ─────────────────────
  {
    title: "Reading Lab (Grade 3)", subject: "English Language Arts", emoji: "📚", grade: 3, gradeLabel: "Grade 3",
    framework: "Common Core State Standards — Grade 3 ELA/Literacy",
    intro: "Every story and every article is trying to tell you something. In this reading lab you'll learn to find the big idea and to figure out tricky new words all by yourself — like a reading detective!",
    outcome: "Find the main idea of a text and use clues to understand new words.",
    tags: ["ela", "reading", "grade 3", "common core"],
    persona: { email: "sofia.k12@synops-demo.test", firstName: "Sofía", lastName: "Ramírez", grade: 3, gradeLabel: "Grade 3", learningStyle: "visual", accommodations: ["simplified_language", "concrete_examples", "scaffolded_questions", "positive_reinforcement", "chunked_content"], progressFraction: 0.4 },
    modules: [
      { title: "Finding the main idea", outcome: "Say what a short text is mostly about in one sentence.",
        hook: "A whole page about pandas — what is it MOSTLY about?", minutes: 8,
        standards: [{ code: "CCSS.ELA-LITERACY.RI.3.2", title: "Determine the main idea; recount key details" }],
        points: ["The main idea is what the whole text is MOSTLY about", "Key details are the little facts that tell you more", "Ask: what would I tell a friend this was about?"],
        reading: "When you read, your brain is always asking one big question: **what is this mostly about?** That answer is the **main idea**.\n\nImagine a page all about pandas. It tells you pandas eat bamboo, pandas live in China, and baby pandas are tiny and pink. Those are **key details** — little facts. But the **main idea** ties them together: *pandas are special animals with their own special needs.*\n\nHere's a detective trick: after you read, cover the page and tell a friend in ONE sentence what it was about. If you say \"it was about pandas and how they live,\" you found the main idea! The details are the clues; the main idea is the case you solved. 🕵️",
        quiz: [
          { q: "The main idea is…", options: ["One small fact", "What the text is MOSTLY about", "The title only", "The longest word"], answer: 1 },
          { q: "A text says lions hunt, lions roar, and lions live in groups. The main idea is…", options: ["Lions are loud", "How lions live", "Lions are orange", "One lion"], answer: 1 },
          { q: "Key details are…", options: ["The big idea", "Little facts that tell you more", "The page number", "The author"], answer: 1 },
          { q: "A good way to find the main idea is to…", options: ["Count the words", "Tell a friend in one sentence what it was about", "Look at the last letter", "Skip it"], answer: 1 },
        ],
        caseContext: "Sofía read a short text: 'Bees are busy. Bees make honey. Bees help flowers grow. Bees live together in a hive.' She thinks the main idea is 'bees make honey.' Gently help her see the bigger idea that ties ALL the sentences together, using simple words and encouragement.",
        caseOpening: "You found a great detail — bees DO make honey! But look at ALL the sentences. What are they ALL about together?" },
      { title: "New words from clues", outcome: "Use the words around a new word to guess what it means.",
        hook: "You read a word you've never seen. What do you do — give up? No way!", minutes: 8,
        standards: [{ code: "CCSS.ELA-LITERACY.L.3.4", title: "Determine the meaning of unknown words using context clues" }],
        points: ["Context clues are the other words around the tricky word", "Read the whole sentence, not just the hard word", "Guess, then check if your guess makes sense"],
        reading: "What do you do when you hit a word you don't know? You become a **word detective** and look for **context clues** — the other words nearby that give you hints.\n\nRead this: *\"The puppy was so **timid** that it hid behind the couch when guests came.\"* Even if you don't know **timid**, the clues help: it *hid* when people came. So timid must mean *shy or scared.* You solved it without a dictionary!\n\nThe steps are simple: (1) read the WHOLE sentence, not just the hard word; (2) look for clues about what's happening; (3) make your best guess; (4) reread to check it makes sense. Little by little, you'll understand harder and harder books. You've got this. 🌟",
        quiz: [
          { q: "Context clues are…", options: ["The other words around a tricky word", "The page number", "Pictures only", "The title"], answer: 0 },
          { q: "\"The soup was so bland it needed salt.\" Bland probably means…", options: ["Too spicy", "Without much flavor", "Very hot", "Frozen"], answer: 1 },
          { q: "When you meet a new word, first you should…", options: ["Skip the whole page", "Read the whole sentence for clues", "Close the book", "Guess a random word"], answer: 1 },
          { q: "After you guess a word's meaning, you should…", options: ["Stop reading", "Reread to check it makes sense", "Erase it", "Ask nobody"], answer: 1 },
        ],
        caseContext: "Sofía reads: 'The gigantic elephant could not fit through the tiny door.' She doesn't know 'gigantic' and wants to give up. Coach her to use the clues (an elephant, can't fit a tiny door) to figure out gigantic means very big — with warm encouragement and simple language.",
        caseOpening: "Let's be word detectives! An elephant that can't fit a tiny door — what does that tell you about how BIG 'gigantic' is?" },
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

// ── Interactive quiz player (sandboxed HTML). ────────────────────────────────
function quizHtml(title: string, items: { q: string; options: string[]; answer: number; img?: string }[]): string {
  const data = JSON.stringify(items).replace(/</g, "\\u003c");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{--indigo:#4F46E5;--amber:#F59E0B;--ink:#1f2430;--ok:#15803d;--no:#b91c1c}*{box-sizing:border-box}body{font-family:Inter,system-ui,sans-serif;color:var(--ink);margin:0;padding:18px;background:#FBF7EF}h2{margin:.2rem 0 1rem;font-size:1.15rem}.q{background:#fff;border:1px solid #ece7db;border-radius:14px;padding:14px 16px;margin:0 0 12px}.qt{font-weight:600;margin:0 0 10px}.opt{display:block;width:100%;text-align:left;border:1px solid #e2ddcf;background:#fff;border-radius:10px;padding:11px 12px;margin:6px 0;font:inherit;cursor:pointer;transition:.15s}.opt:hover{border-color:var(--indigo)}.opt.sel{border-color:var(--indigo);background:#eef0fb}.opt.correct{border-color:var(--ok);background:#e9f7ee}.opt.wrong{border-color:var(--no);background:#fdecec}.bar{height:10px;background:#eee;border-radius:6px;overflow:hidden;margin:14px 0 6px}.fill{height:100%;width:0;background:var(--amber);transition:.4s}button.go{background:var(--indigo);color:#fff;border:0;border-radius:10px;padding:11px 18px;font:inherit;font-weight:600;cursor:pointer}.score{font-weight:700;font-size:1.05rem;margin:4px 0}.hint{color:#6b7280;font-size:.9rem}.qimg{display:block;width:170px;height:170px;object-fit:contain;border-radius:22px;margin:0 auto 12px;background:#eef0fb;padding:10px;filter:drop-shadow(0 5px 9px rgba(0,0,0,.18))}</style>
<h2>${title}</h2><div id="app"></div><div class="bar"><div class="fill" id="f"></div></div><p id="s" class="hint">Pick an answer for each question.</p><button class="go" id="submit">Check my answers</button>
<script>const items=${data};const app=document.getElementById('app');const picks=new Array(items.length).fill(-1);let done=false;items.forEach((it,qi)=>{const d=document.createElement('div');d.className='q';d.innerHTML=(it.img?'<img class="qimg" src="'+it.img+'" alt="picture to read">':'')+'<p class="qt">'+(qi+1)+'. '+it.q+'</p>';it.options.forEach((o,oi)=>{const b=document.createElement('button');b.className='opt';b.textContent=o;b.onclick=()=>{if(done)return;picks[qi]=oi;[...d.querySelectorAll('.opt')].forEach(x=>x.classList.remove('sel'));b.classList.add('sel');upd();};d.appendChild(b);});app.appendChild(d);});function upd(){const n=picks.filter(p=>p>=0).length;document.getElementById('f').style.width=Math.round(n/items.length*100)+'%';}function report(s){try{parent.postMessage({type:'activity_result',score:s,payload:{picks}},'*');}catch(e){}}document.getElementById('submit').onclick=()=>{if(done)return;let right=0;const qs=[...document.querySelectorAll('.q')];items.forEach((it,qi)=>{const opts=[...qs[qi].querySelectorAll('.opt')];opts.forEach((b,oi)=>{b.disabled=true;if(oi===it.answer)b.classList.add('correct');if(picks[qi]===oi&&oi!==it.answer)b.classList.add('wrong');});if(picks[qi]===it.answer)right++;});const pct=Math.round(right/items.length*100);done=true;document.getElementById('f').style.width='100%';document.getElementById('s').innerHTML='<span class="score">You got '+right+' of '+items.length+' right ('+pct+'%). '+(pct>=75?'Great work! 🎉':'Review the lesson and try again.')+'</span>';report(pct);};</script>`;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function firstOrNull<T>(rows: T[]): T | null { return rows.length ? rows[0]! : null; }

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

    await db.insert(beatsTable).values([
      { moduleId: mod.id, type: "title_card", order: 0, title: m.title, narration: `${m.hook}  By the end of this lesson you'll be able to: ${m.outcome}` },
      { moduleId: mod.id, type: "points", order: 1, title: "Big ideas", narration: `Keep the question in mind: ${m.hook}`, bulletPoints: m.points },
      { moduleId: mod.id, type: "close", order: 2, title: "You've got this", narration: `Nice work — you can now ${m.outcome.toLowerCase()} Try the practice, then move on.` },
    ]);
    await db.update(modulesTable).set({ beatCount: 3 }).where(eq(modulesTable.id, mod.id));

    const body = `# ${m.title}\n\n**Think about this:** ${m.hook}\n\n**By the end you can:** ${m.outcome}\n\n${m.reading}\n\n## Big ideas\n\n${m.points.map((p) => `- ${p}`).join("\n")}\n\n**Aligned to:** ${m.standards.map((s) => s.code).join(", ")}`;
    await db.insert(moduleReadingsTable).values({
      moduleId: mod.id, courseId: course.id, title: `Lesson: ${m.title}`,
      kind: "note", content: body, chars: body.length, order: 0, published: true, createdBy: facultyId,
    });

    // Interactive quiz (every module → satisfies the "interactive" completeness component).
    await db.insert(interactiveActivitiesTable).values({
      organisationId: orgId, courseId: course.id, moduleId: mod.id,
      title: `${m.title}: quick check`,
      instructions: "Answer each question, then check your work. You can retry as many times as you like.",
      html: quizHtml(`${m.title}: quick check`, m.quiz), source: "html", kind: "quiz",
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
  let standardsCount = 0;
  const courseByPersona: Record<string, string> = {};
  for (const c of COURSES) {
    const existing = firstOrNull(await db.select().from(coursesTable).where(and(eq(coursesTable.title, c.title), eq(coursesTable.tenantId, "platform"))));
    const courseId = existing ? existing.id : await createK12Course(c, org.id, facultyId);
    courseByPersona[c.persona.email] = courseId;
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
  const k12CourseIds = Object.values(courseByPersona);
  if (k12CourseIds.length) {
    const k12Mods = await db.select({ id: modulesTable.id }).from(modulesTable).where(inArray(modulesTable.courseId, k12CourseIds));
    const k12ModIds = k12Mods.map((m) => m.id);
    if (k12ModIds.length) await db.delete(caseScenariosTable).where(inArray(caseScenariosTable.moduleId, k12ModIds));
  }

  // 3c. Refresh the quiz activity HTML on REUSED courses so content edits (e.g. real-photo picture
  // questions) actually propagate — existing courses are reused, not recreated, on reseed.
  for (const c of COURSES) {
    const cid = courseByPersona[c.persona.email];
    if (!cid) continue;
    const cmods = await db.select().from(modulesTable).where(eq(modulesTable.courseId, cid)).orderBy(asc(modulesTable.order));
    for (let i = 0; i < cmods.length && i < c.modules.length; i++) {
      const m = c.modules[i];
      await db.update(interactiveActivitiesTable)
        .set({ html: quizHtml(`${m.title}: quick check`, m.quiz) })
        .where(and(eq(interactiveActivitiesTable.moduleId, cmods[i].id), eq(interactiveActivitiesTable.kind, "quiz")));
    }
  }

  // 4. Teacher (admin) + class staff.
  const adminId = await upsertUser({ email: K12_ADMIN_EMAIL, firstName: "Ms.", lastName: "Ramírez", role: "partner_admin", partnerId: partner.id, organisationId: null });
  const existingStaff = (await db.select().from(orgClassStaffTable).where(eq(orgClassStaffTable.classId, cls.id))).map((s) => s.staffId);
  if (!existingStaff.includes(adminId)) await db.insert(orgClassStaffTable).values({ classId: cls.id, staffId: adminId, role: "administrator" as const });

  // 5. Personas: each enrolled ONLY in their course; reconcile away any stale enrolments.
  const planEmails = COURSES.map((c) => c.persona.email);
  for (const c of COURSES) {
    const p = c.persona;
    const learnerId = await upsertUser({ email: p.email, firstName: p.firstName, lastName: p.lastName, role: "learner", partnerId: partner.id, organisationId: org.id, learningStyle: p.learningStyle, accommodations: p.accommodations });
    const myCourseId = courseByPersona[p.email];

    // Reconcile: remove enrolments/progress for any course NOT in this learner's plan (clean re-seed).
    const enrolled = await db.select().from(enrolmentsTable).where(eq(enrolmentsTable.userId, learnerId));
    const staleCourseIds = enrolled.map((e) => e.courseId).filter((id) => id !== myCourseId);
    if (staleCourseIds.length) {
      await db.delete(enrolmentsTable).where(and(eq(enrolmentsTable.userId, learnerId), inArray(enrolmentsTable.courseId, staleCourseIds)));
      await db.delete(beatProgressTable).where(and(eq(beatProgressTable.userId, learnerId), inArray(beatProgressTable.courseId, staleCourseIds)));
      await db.delete(credentialsTable).where(eq(credentialsTable.userId, learnerId)); // clears badges from old courses
    }

    // Enrol in their own course.
    const already = enrolled.some((e) => e.courseId === myCourseId);
    if (!already) await db.insert(enrolmentsTable).values({ userId: learnerId, courseId: myCourseId, status: "active" as const, enrolledAt: daysAgo(20) });

    // Pre-fill progress up to their fraction.
    const mods = await db.select().from(modulesTable).where(eq(modulesTable.courseId, myCourseId)).orderBy(asc(modulesTable.order));
    const beats: { beatId: string; moduleId: string }[] = [];
    for (const m of mods) {
      const bs = await db.select().from(beatsTable).where(eq(beatsTable.moduleId, m.id)).orderBy(asc(beatsTable.createdAt));
      for (const b of bs) beats.push({ beatId: b.id, moduleId: m.id });
    }
    const viewCount = Math.round(beats.length * p.progressFraction);
    if (viewCount > 0) {
      const rows = beats.slice(0, viewCount).map((b, idx) => ({ userId: learnerId, beatId: b.beatId, moduleId: b.moduleId, courseId: myCourseId, secondsSpent: 40 + (idx % 4) * 15, firstViewedAt: daysAgo(14), lastViewedAt: daysAgo(2) }));
      try { await db.insert(beatProgressTable).values(rows).onConflictDoNothing(); } catch { /* cosmetic */ }
    }
    // Maya (on-track) earns a badge for her first module.
    if (p.email === "maya.k12@synops-demo.test" && mods[0]) {
      const has = await db.select().from(credentialsTable).where(and(eq(credentialsTable.userId, learnerId), eq(credentialsTable.moduleId, mods[0].id)));
      if (has.length === 0) await db.insert(credentialsTable).values({ userId: learnerId, moduleId: mods[0].id, moduleTitle: mods[0].title, partnerId: partner.id, partnerName: "Synops Academy", status: "valid", masteryScore: "0.9100", evidenceSummary: "Completed the lesson and passed the check.", decayDate: daysFromNow(365) });
    }
  }

  return {
    ok: true, partnerId: partner.id, courses: COURSES.length, learners: planEmails.length, standards: standardsCount,
    message: `Synops Academy K-12 ready: ${COURSES.length} courses (grades 3-11), ${standardsCount} standards, ${planEmails.length} learner personas. Password ${DEMO_PASSWORD}.`,
  };
}
