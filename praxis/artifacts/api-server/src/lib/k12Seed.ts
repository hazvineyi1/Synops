import { db } from "@workspace/db";
import {
  partnersTable, brandThemesTable, organisationsTable, usersTable,
  coursesTable, modulesTable, beatsTable, moduleReadingsTable,
  caseScenariosTable, interactiveActivitiesTable,
  coursePartnerAssignmentsTable, enrolmentsTable,
  orgClassesTable, orgClassCoursesTable, orgClassStaffTable,
  beatProgressTable, credentialsTable,
  unitStandardsTable, unitStandardMappingsTable,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { hashPassword } from "../lib/auth";
import { PRIVACY_POLICY_VERSION } from "../lib/popia";

/**
 * Public K-12 demo tenant "Synops Academy (Grade 6)" — the investor/prospect link for the K-12
 * story, served at praxis.synops-consulting.com/k12. It stands on its own partner (slug synops-k12)
 * with real Grade 6 courses across Math, ELA, Science, Social Studies and History, each aligned to
 * US standards (Common Core / NGSS / C3). Two demo learners:
 *   - Maya Chen: a standard 6th grader, on-track, with two subjects already COMPLETE (earned badges).
 *   - Leo Rivera: a learner with accommodations configured, to demonstrate the accessibility layer.
 * Idempotent: reuse-by-title / upsert, safe to re-run.
 */
const DEMO_SLUG = "synops-k12";
const ORG_NAME = "Synops Academy (Grade 6)";
const CLASS_NAME = "Grade 6 · Homeroom 2026";
const DEMO_PASSWORD = "SynopsDemo123";

export const K12_PARTNER_SLUG = DEMO_SLUG;
export const K12_LEARNER_EMAIL = "maya.k12@synops-demo.test";
export const K12_LEARNER_ALT_EMAIL = "leo.k12@synops-demo.test";
export const K12_ADMIN_EMAIL = "teacher.k12@synops-demo.test";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

// Bright, friendly-but-credible K-12 brand: indigo + sunny amber on warm paper.
const BRAND = {
  displayName: "Synops Academy",
  primaryColor: "#3730A3",   // indigo (headers/buttons; carries white text)
  secondaryColor: "#FBF7EF", // warm paper surface
  accentColor: "#F59E0B",    // sunny amber accent
  logoUrl: null as string | null,
  faviconUrl: null as string | null,
  fontFamily: "Inter, system-ui, sans-serif",
  credentialTitle: "Synops Academy Badge",
  emailSenderName: "Synops Academy",
};

// ── Standard shape: a US standard (Common Core / NGSS / C3) represented in the compliance model. ──
interface Std { code: string; title: string }
interface K12Module {
  title: string;
  outcome: string;
  hook: string;            // a fun, concrete scenario a 6th grader recognises
  points: string[];
  reading: string;         // the lesson body (markdown)
  minutes: number;
  standards: Std[];
  quiz?: { q: string; options: string[]; answer: number }[]; // module 0 gets an interactive quiz
}
interface K12Course {
  title: string;
  subject: string;
  emoji: string;
  framework: string;       // human label shown in the reader
  intro: string;
  outcome: string;
  tags: string[];
  caseObjective: string;
  caseContext: string;
  caseOpening: string;
  modules: K12Module[];
}

const COURSES: K12Course[] = [
  // ── MATH ──────────────────────────────────────────────────────────────────
  {
    title: "Math 6: Ratios, Fractions & Expressions",
    subject: "Mathematics", emoji: "➗",
    framework: "Common Core State Standards — Grade 6 Mathematics",
    intro: "Sixth-grade math is where numbers start to describe the real world: how fast, how much, how many for how many. In three short lessons you'll compare with ratios, divide fractions, and write your first algebraic expressions — using pizza, playlists, and road trips, not just worksheets.",
    outcome: "Use ratios and rates, divide fractions, and write and read simple algebraic expressions.",
    tags: ["math", "grade 6", "ratios", "fractions", "expressions", "common core"],
    caseObjective: "Reason about a real ratio-and-rate problem and defend the answer.",
    caseContext: "A food truck sells 3 tacos for $5. A student says '9 tacos should be $15, and 12 tacos should be $20.' Walk the learner through whether that reasoning holds, using a ratio table and unit rate, and help them catch where a classmate might slip up.",
    caseOpening: "Before we calculate anything — what stays the same no matter how many tacos you buy? Talk me through your thinking.",
    modules: [
      { title: "Ratios and rates", outcome: "Describe a relationship between two quantities using a ratio, and find a unit rate.",
        hook: "Your favorite playlist plays 3 songs every 12 minutes. How long for 10 songs?",
        minutes: 8, standards: [
          { code: "CCSS.MATH.CONTENT.6.RP.A.1", title: "Understand the concept of a ratio and use ratio language" },
          { code: "CCSS.MATH.CONTENT.6.RP.A.2", title: "Understand unit rate and use rate language" },
          { code: "CCSS.MATH.CONTENT.6.RP.A.3", title: "Use ratio and rate reasoning to solve real-world problems" },
        ],
        points: [
          "A ratio compares two amounts — 3 songs to 12 minutes, written 3:12 or 3/12",
          "A unit rate tells you 'per one' — here, 1 song every 4 minutes",
          "A ratio table lets you scale up safely: 3→12, 6→24, 9→36",
        ],
        reading: "A **ratio** compares two quantities. If your playlist plays 3 songs every 12 minutes, the ratio of songs to minutes is 3 to 12. You can write it three ways: 3:12, 3 to 12, or the fraction 3/12.\n\nA **unit rate** answers 'how much for exactly one?' Divide to find it: 12 minutes ÷ 3 songs = 4 minutes per song. Now any question is easy — 10 songs take 10 × 4 = 40 minutes.\n\nA **ratio table** keeps you organized when you scale up or down. Start with 3 songs / 12 min, then double, triple, and so on. The trick that makes ratios trustworthy: whatever you multiply the top by, you multiply the bottom by the same amount.",
        quiz: [
          { q: "A recipe uses 2 cups of flour for every 3 eggs. What is the ratio of flour to eggs?", options: ["3:2", "2:3", "2:5", "6:1"], answer: 1 },
          { q: "A car goes 150 miles on 5 gallons. What is the unit rate (miles per gallon)?", options: ["30 mpg", "150 mpg", "5 mpg", "75 mpg"], answer: 0 },
          { q: "If 3 songs take 12 minutes, how long do 9 songs take (same rate)?", options: ["24 min", "27 min", "36 min", "40 min"], answer: 2 },
          { q: "Which of these is the SAME ratio as 4:6?", options: ["2:3", "6:4", "8:10", "4:12"], answer: 0 },
        ],
      },
      { title: "Dividing fractions", outcome: "Divide a fraction by a fraction and explain what the answer means.",
        hook: "You have 3/4 of a pizza and each serving is 1/8. How many servings can you make?",
        minutes: 8, standards: [
          { code: "CCSS.MATH.CONTENT.6.NS.A.1", title: "Interpret and compute quotients of fractions; solve word problems involving division of fractions by fractions" },
        ],
        points: [
          "Dividing asks 'how many of THIS fit into THAT?'",
          "To divide by a fraction, multiply by its reciprocal (flip it)",
          "3/4 ÷ 1/8 = 3/4 × 8/1 = 24/4 = 6 servings",
        ],
        reading: "Dividing by a fraction sounds scary, but the question is friendly: **how many of the small piece fit into the big piece?** You have 3/4 of a pizza and each serving is 1/8. How many 1/8-servings fit into 3/4?\n\nThe rule: **to divide by a fraction, multiply by its reciprocal** (flip the second fraction). So 3/4 ÷ 1/8 becomes 3/4 × 8/1 = 24/4 = **6 servings**. \n\nWhy does flipping work? Dividing by 1/8 is the same as asking how many eighths there are — and there are 8 eighths in every whole, so you multiply by 8. Always check that your answer makes sense: 6 small servings from most of a pizza sounds about right.",
      },
      { title: "Writing expressions with variables", outcome: "Write and read algebraic expressions that use a letter to stand for a number.",
        hook: "Tickets cost $9 each. How do you write the cost for ANY number of tickets?",
        minutes: 8, standards: [
          { code: "CCSS.MATH.CONTENT.6.EE.A.2", title: "Write, read, and evaluate expressions in which letters stand for numbers" },
          { code: "CCSS.MATH.CONTENT.6.EE.B.6", title: "Use variables to represent numbers and write expressions when solving a real-world problem" },
        ],
        points: [
          "A variable is a letter that stands in for a number that can change",
          "'$9 per ticket for t tickets' is written 9t (9 times t)",
          "Reading matters: 9 + t, 9t, and t/9 all mean different things",
        ],
        reading: "A **variable** is just a letter holding a spot for a number you don't know yet — or a number that can change. If tickets cost $9 each and you buy **t** tickets, the total cost is **9t**, which means 9 × t.\n\nThe power of a variable is that one short expression covers every case: 9t works whether you buy 2 tickets ($18) or 40 tickets ($360). You **evaluate** it by substituting a number for the letter.\n\nReading expressions carefully is a real skill. '9 more than t' is t + 9. '9 times t' is 9t. 't shared among 9' is t/9. Same numbers, very different meanings — the words tell you which operation to use.",
      },
    ],
  },
  // ── ELA ───────────────────────────────────────────────────────────────────
  {
    title: "English Language Arts 6: Reading & Writing",
    subject: "English Language Arts", emoji: "📖",
    framework: "Common Core State Standards — Grade 6 ELA/Literacy",
    intro: "Great readers don't just find out what happens — they figure out what a story means and prove it with evidence. In three lessons you'll uncover theme, back up your ideas with quotes, and write an argument that could change someone's mind.",
    outcome: "Determine theme, cite textual evidence, and write a clear evidence-based argument.",
    tags: ["ela", "grade 6", "reading", "writing", "theme", "evidence", "common core"],
    caseObjective: "Identify a theme and defend it with specific evidence from a short text.",
    caseContext: "A student read a fable where a proud lion is saved by a tiny mouse he once mocked. The student says 'the theme is that mice are nice.' Coach the learner toward a real theme statement (a lesson about life, not a plot summary) and push them to point to specific moments that support it.",
    caseOpening: "Is 'mice are nice' a lesson about life, or just something that happened in the story? What's the difference?",
    modules: [
      { title: "Finding the theme", outcome: "State the theme of a story as a lesson about life, not a summary of the plot.",
        hook: "A story ends with a bragging hare losing a race to a slow, steady tortoise. What's the lesson?",
        minutes: 8, standards: [
          { code: "CCSS.ELA-LITERACY.RL.6.2", title: "Determine a theme or central idea and how it is conveyed through details" },
        ],
        points: [
          "Theme is the life lesson, not a one-sentence plot summary",
          "Ask: what does a character learn, or what does the story teach us?",
          "State it as a general truth: 'Steady effort beats overconfidence.'",
        ],
        reading: "Every good story is *about* something bigger than its plot. The **theme** is the lesson about life or human nature that the story reveals. The plot of the tortoise and the hare is 'a slow tortoise beats a fast hare.' The **theme** is 'steady effort beats overconfidence.'\n\nHere's the test: a plot summary tells what *happened*; a theme tells what it *means* for people in general. Theme almost never names the characters. 'The hare was lazy' is plot. 'Underestimating others can cost you' is theme.\n\nTo find a theme, watch what a character learns, how they change, or what the ending rewards and punishes. Then say it as a general truth you could apply to your own life.",
        quiz: [
          { q: "Which of these is a THEME, not a plot summary?", options: ["The tortoise won the race.", "A hare took a nap during a race.", "Overconfidence can lead to failure.", "There was a race between two animals."], answer: 2 },
          { q: "The best way to find a theme is to ask:", options: ["What color was the setting?", "What lesson does the story teach about life?", "How many characters were there?", "When was it written?"], answer: 1 },
          { q: "A good theme statement usually…", options: ["Names the main character", "Retells the ending", "States a general truth about life", "Lists the events in order"], answer: 2 },
          { q: "'Kindness comes back to you' is an example of a…", options: ["Setting", "Theme", "Plot summary", "Character trait"], answer: 1 },
        ],
      },
      { title: "Citing textual evidence", outcome: "Support a claim about a text with a specific, well-chosen quotation.",
        hook: "You say a character is brave. A friend says 'prove it.' What do you point to?",
        minutes: 8, standards: [
          { code: "CCSS.ELA-LITERACY.RL.6.1", title: "Cite textual evidence to support analysis of what the text says" },
          { code: "CCSS.ELA-LITERACY.RI.6.1", title: "Cite textual evidence to support analysis of informational text" },
        ],
        points: [
          "A claim is what you believe; evidence is the proof from the text",
          "Quote the smallest exact words that prove your point",
          "Then explain HOW the quote supports your claim",
        ],
        reading: "When you make a **claim** about a text — 'this character is brave' — you have to back it up with **textual evidence**: the actual words from the story. Opinions without evidence don't convince anyone.\n\nGood evidence is *specific* and *short*. Instead of 'she did brave stuff,' quote the exact moment: 'she stepped in front of her little brother as the dog charged.' Pick the smallest quote that proves your point.\n\nThe final step is the one students skip: **explain the link**. After the quote, say how it proves your claim. 'Stepping in front of danger to protect someone shows courage.' Claim, evidence, explanation — that's the whole move.",
      },
      { title: "Writing an argument", outcome: "Write a short argument with a clear claim, reasons, and evidence.",
        hook: "Should schools start an hour later? Convince someone who disagrees.",
        minutes: 9, standards: [
          { code: "CCSS.ELA-LITERACY.W.6.1", title: "Write arguments to support claims with clear reasons and relevant evidence" },
        ],
        points: [
          "Start with a clear claim — the position you're arguing",
          "Give reasons, and support each with evidence",
          "Answer the other side, then finish with a strong closing",
        ],
        reading: "An **argument** isn't a fight — it's a clear case for what you believe, built so a reasonable person might agree. It starts with a **claim**: your position, stated plainly. 'Schools should start an hour later.'\n\nNext come **reasons**, each backed by **evidence**. Reason: teens need more sleep. Evidence: studies show middle schoolers who start later have better attendance and grades. Two or three solid reasons beat ten weak ones.\n\nStrong writers also handle the **other side**: name an objection ('buses would need new schedules') and answer it. Then close by restating your claim with confidence. Claim, reasons, evidence, counter-argument, conclusion — a shape you can reuse for any argument you'll ever write.",
      },
    ],
  },
  // ── SCIENCE ────────────────────────────────────────────────────────────────
  {
    title: "Science 6: Earth, Life & Matter",
    subject: "Science", emoji: "🔬",
    framework: "Next Generation Science Standards — Middle School",
    intro: "Science is how we explain the world with evidence. In three lessons you'll track why weather happens, map how energy flows through a food web, and zoom in on the tiny particles that make up everything around you.",
    outcome: "Explain weather and climate patterns, model energy flow in ecosystems, and describe matter and its changes.",
    tags: ["science", "grade 6", "ngss", "weather", "ecosystems", "matter"],
    caseObjective: "Use a food-web model to predict the effect of a change in an ecosystem.",
    caseContext: "In a meadow food web, hawks eat snakes, snakes eat mice, and mice eat grass and seeds. A student says 'if all the hawks left, nothing else would change.' Coach the learner to trace the energy and predict what actually happens to snakes, mice, and grass — and why ecosystems are connected.",
    caseOpening: "If the hawks disappear, what's the very first population that changes — and does it go up or down?",
    modules: [
      { title: "Weather and climate", outcome: "Explain how the sun, water, and air drive weather, and how weather differs from climate.",
        hook: "Why does a hot afternoon sometimes end in a thunderstorm?",
        minutes: 8, standards: [
          { code: "NGSS.MS-ESS2-5", title: "Collect data to provide evidence for how air masses interacting cause weather" },
          { code: "NGSS.MS-ESS2-6", title: "Develop a model to describe how unequal heating and rotation cause patterns" },
        ],
        points: [
          "The sun heats the Earth unevenly, and that drives moving air",
          "Warm air rises and holds water vapor; when it cools, clouds and rain form",
          "Weather is day-to-day; climate is the pattern over many years",
        ],
        reading: "**Weather** is what the atmosphere is doing right now — sunny, rainy, windy. It's powered by the **sun**, which heats Earth's surface unevenly. Warm air rises, cooler air rushes in to replace it, and that moving air is **wind**.\n\nWater is the other key player. Warm air holds **water vapor**. When that air rises and cools, the vapor condenses into tiny droplets — clouds — and if the droplets grow heavy enough, it rains. That hot afternoon thunderstorm? The ground heated the air, it shot upward carrying moisture, and cooled fast at high altitude.\n\n**Climate** is different from weather: it's the *average* pattern over decades. A single snowy day doesn't change a desert's climate. Weather is your mood today; climate is your personality.",
        quiz: [
          { q: "What is the main energy source that drives weather?", options: ["The moon", "The sun", "Ocean tides", "Earth's core"], answer: 1 },
          { q: "What happens when warm, moist air rises and cools?", options: ["It sinks immediately", "Water vapor condenses into clouds", "It turns into wind only", "Nothing changes"], answer: 1 },
          { q: "Which describes CLIMATE, not weather?", options: ["It's raining right now", "It's windy this afternoon", "This region is dry most of the year", "A storm is coming tonight"], answer: 2 },
          { q: "Wind is mostly caused by…", options: ["Uneven heating of Earth's surface", "The moon's gravity", "Trees moving", "Rivers flowing"], answer: 0 },
        ],
      },
      { title: "Ecosystems and food webs", outcome: "Model how energy flows from producers to consumers in a food web.",
        hook: "Grass never chases anything, so where does a hawk's energy really come from?",
        minutes: 8, standards: [
          { code: "NGSS.MS-LS2-1", title: "Analyze data to provide evidence for the effects of resource availability on organisms" },
          { code: "NGSS.MS-LS2-3", title: "Develop a model to describe the cycling of matter and flow of energy" },
        ],
        points: [
          "Producers (plants) capture the sun's energy through photosynthesis",
          "Energy flows: producers → herbivores → predators",
          "Remove one part and the whole web shifts — everything is connected",
        ],
        reading: "Every ecosystem runs on **energy that starts with the sun**. **Producers** — plants and algae — capture sunlight and make food through photosynthesis. They're the foundation of every food web.\n\n**Consumers** get their energy by eating. Herbivores (mice, rabbits) eat producers; predators (snakes, hawks) eat other consumers. So a hawk's energy really came from the sun → grass → mouse → snake → hawk. Energy **flows** one direction along the chain, and a lot is lost as heat at each step, which is why there are always fewer predators than prey.\n\nThe big idea is **connection**. Remove the hawks and the snakes multiply, the mice get hunted harder, and the grass grows back — one change ripples through the whole web.",
      },
      { title: "Matter and its interactions", outcome: "Describe matter as made of particles and identify physical vs. chemical changes.",
        hook: "Ice, water, and steam are all the same stuff — so what actually changed?",
        minutes: 8, standards: [
          { code: "NGSS.MS-PS1-1", title: "Develop models to describe the atomic composition of molecules" },
          { code: "NGSS.MS-PS1-4", title: "Develop a model that predicts changes in particle motion with temperature" },
        ],
        points: [
          "All matter is made of tiny particles (atoms and molecules) in motion",
          "Adding heat makes particles move faster — solid → liquid → gas",
          "Physical change = same substance; chemical change = new substance",
        ],
        reading: "Everything around you is **matter**, and all matter is made of unimaginably tiny **particles** — atoms and molecules — that are always moving. How fast they move depends on **temperature**.\n\nIn a **solid** like ice, particles are locked in place, just vibrating. Add heat and they move faster and slide past each other — that's a **liquid**. Add more and they break free and fly around — a **gas** (steam). Ice, water, and steam are the *same* water molecules; only the particle motion changed. That's a **physical change**.\n\nA **chemical change** is different: the particles rearrange into a *new* substance. Burning wood makes ash and smoke — you can't get the wood back. Rust, cooking an egg, and a firework are all chemical changes.",
      },
    ],
  },
  // ── SOCIAL STUDIES ──────────────────────────────────────────────────────────
  {
    title: "Social Studies 6: Civics, Geography & Economics",
    subject: "Social Studies", emoji: "🌍",
    framework: "C3 Framework (NCSS) — Grades 6–8",
    intro: "Social studies is about how people live together — where they settle, how they govern themselves, and how they choose what to make and buy. In three lessons you'll read the world like a geographer, an economist, and a citizen.",
    outcome: "Use geographic thinking, explain the purpose of government and citizenship, and reason about economic choices.",
    tags: ["social studies", "grade 6", "civics", "geography", "economics", "c3"],
    caseObjective: "Weigh an economic trade-off and justify a decision using opportunity cost.",
    caseContext: "A student council has $500 and must choose between new library books or new sports equipment — it can't fully fund both. Coach the learner to name the opportunity cost of each choice and make a reasoned recommendation the council could defend to the whole school.",
    caseOpening: "Whatever the council picks, what exactly are they giving up? That's the real cost.",
    modules: [
      { title: "Thinking like a geographer", outcome: "Use the five themes of geography to describe a place.",
        hook: "Why did the world's first cities all grow up next to rivers?",
        minutes: 8, standards: [
          { code: "C3.D2.Geo.1.6-8", title: "Construct maps to represent and explain spatial patterns" },
          { code: "C3.D2.Geo.2.6-8", title: "Explain how physical characteristics of places influence human settlement" },
        ],
        points: [
          "Location (where), Place (what it's like), Region (what's similar)",
          "Movement (people, goods, ideas) and Human-Environment Interaction",
          "Geography shapes where and how people live",
        ],
        reading: "Geographers read the world with **five themes**. **Location** answers 'where?' — on a map or by landmarks. **Place** describes what makes it special: its landforms, climate, and people. **Region** groups places that share features, like 'the desert Southwest.'\n\n**Movement** tracks how people, goods, and ideas travel between places — trade routes, migration, the internet. **Human-Environment Interaction** looks at how people change their surroundings and adapt to them: building dams, farming, wearing coats in winter.\n\nWhy did ancient cities cluster on rivers? Every theme explains it: rivers gave a good *location*, fertile *place*, easy *movement* of goods by boat, and a way to *interact* with the environment through irrigation. Geography quietly shapes almost everything about how people live.",
        quiz: [
          { q: "Which theme of geography answers 'where is it?'", options: ["Place", "Location", "Movement", "Region"], answer: 1 },
          { q: "Building an irrigation canal to water crops is an example of…", options: ["Location", "Region", "Human-Environment Interaction", "Place"], answer: 2 },
          { q: "Grouping states into 'the Midwest' uses which theme?", options: ["Region", "Movement", "Location", "Place"], answer: 0 },
          { q: "Why did many early cities form near rivers?", options: ["Rivers looked nice", "Water, fertile soil, and easy transport", "Rivers were cold", "To avoid other people"], answer: 1 },
        ],
      },
      { title: "Government and citizenship", outcome: "Explain why governments exist and what it means to be a good citizen.",
        hook: "Who decides the rules at your school — and what if there were none?",
        minutes: 8, standards: [
          { code: "C3.D2.Civ.1.6-8", title: "Distinguish the powers and responsibilities of citizens and institutions" },
          { code: "C3.D2.Civ.2.6-8", title: "Explain the roles of citizens in participating in government" },
        ],
        points: [
          "Governments make rules, provide services, and settle disputes",
          "Citizens have rights AND responsibilities",
          "Democracy depends on people participating",
        ],
        reading: "A **government** is how a community makes and enforces shared rules. Without one, disputes have no fair way to get settled and shared needs — roads, safety, schools — go unmet. Governments **make laws**, **provide services**, and **resolve conflicts** peacefully.\n\nBeing a **citizen** is a two-way street. You have **rights** — like free speech and fair treatment — but also **responsibilities**: following laws, respecting others' rights, and helping the community. \n\nIn a **democracy**, power ultimately comes from the people, so participation matters: voting, speaking up, serving on a jury, or just staying informed. A democracy is only as strong as the citizens who take part in it.",
      },
      { title: "Making economic choices", outcome: "Explain scarcity and opportunity cost and use them to reason about a decision.",
        hook: "You have $10 and want both a game and a hoodie. What does choosing one really cost?",
        minutes: 8, standards: [
          { code: "C3.D2.Eco.1.6-8", title: "Explain how economic decisions affect the well-being of individuals and society" },
          { code: "C3.D2.Eco.2.6-8", title: "Evaluate alternative approaches using opportunity cost" },
        ],
        points: [
          "Scarcity: unlimited wants, limited resources — so we must choose",
          "Opportunity cost: what you give up when you pick one thing",
          "Good decisions weigh the trade-offs",
        ],
        reading: "Economics starts with one hard truth: **scarcity**. People have unlimited wants but limited money, time, and resources — so everyone has to **choose**. You can't buy the game *and* the hoodie with $10.\n\nEvery choice has an **opportunity cost**: the value of the next-best thing you gave up. If you buy the game, the opportunity cost is the hoodie you didn't get. It's not just about money — spending Saturday practicing has the opportunity cost of the hangout you skipped.\n\nSmart decision-makers name the trade-off out loud. They ask: what am I really giving up, and is what I'm getting worth more to me? That single question — used by shoppers, businesses, and governments alike — is the heart of economics.",
      },
    ],
  },
  // ── HISTORY ─────────────────────────────────────────────────────────────────
  {
    title: "World History 6: Ancient Civilizations",
    subject: "History", emoji: "🏛️",
    framework: "C3 Framework (NCSS) — Grades 6–8, World History",
    intro: "Long before phones and cities, humans figured out how to farm, build, write, and govern. In three lessons you'll travel from the first farmers to the pyramids of Egypt to the ideas of ancient Greece that still shape your world.",
    outcome: "Trace how farming changed human life and describe key contributions of ancient Egypt and Greece.",
    tags: ["history", "grade 6", "ancient civilizations", "egypt", "greece", "c3"],
    caseObjective: "Explain how one ancient innovation changed the way people lived.",
    caseContext: "A student says 'farming was just about growing food.' Coach the learner to see the bigger chain reaction the Agricultural Revolution set off — settling down, surplus food, specialized jobs, cities, writing — and to defend which change mattered most.",
    caseOpening: "Once people could grow more food than they needed, what became possible that never was before?",
    modules: [
      { title: "Early humans and the first farms", outcome: "Explain how the shift to farming (the Agricultural Revolution) changed human life.",
        hook: "For most of history humans chased their food. Then they planted it. What changed?",
        minutes: 8, standards: [
          { code: "C3.D2.His.1.6-8", title: "Analyze connections among events and developments in broad historical contexts" },
          { code: "C3.D2.His.2.6-8", title: "Classify series of historical events by cause and effect" },
        ],
        points: [
          "Early humans were hunter-gatherers who moved to follow food",
          "Farming let people settle in one place and store surplus food",
          "Surplus food → more people, new jobs, and the first villages",
        ],
        reading: "For hundreds of thousands of years, humans were **hunter-gatherers** — they hunted animals and gathered plants, moving constantly to follow their food. Then, around 10,000 years ago, came one of the biggest changes in human history: people learned to **farm**.\n\nThe **Agricultural Revolution** meant people could stay in one place and grow more food than they needed right away — a **surplus**. Surplus changed everything. With stored food, populations grew. Not everyone had to hunt, so some people could become potters, builders, or leaders — the first **specialized jobs**.\n\nSettled villages grew into towns, and towns into the first cities. Almost everything we call 'civilization' — writing, government, trade — traces back to the day people stopped chasing their food and started planting it.",
        quiz: [
          { q: "Before farming, most humans were…", options: ["City builders", "Hunter-gatherers", "Kings", "Sailors"], answer: 1 },
          { q: "A 'surplus' of food means…", options: ["Not enough food", "Exactly enough food", "More food than needed right away", "Spoiled food"], answer: 2 },
          { q: "Why did farming let some people take new jobs like pottery?", options: ["They got bored", "Surplus food meant not everyone had to find food", "Kings ordered it", "They ran out of animals"], answer: 1 },
          { q: "The Agricultural Revolution led most directly to…", options: ["The first permanent villages and cities", "The invention of cars", "The end of humans", "Colder weather"], answer: 0 },
        ],
      },
      { title: "Ancient Egypt and Mesopotamia", outcome: "Describe key achievements of early river civilizations.",
        hook: "How do you build a pyramid — or invent writing — with no machines?",
        minutes: 8, standards: [
          { code: "C3.D2.His.3.6-8", title: "Use questions about individuals and groups to analyze why their perspectives differed" },
        ],
        points: [
          "Both grew along rivers (the Nile; the Tigris and Euphrates)",
          "Mesopotamia gave us early writing (cuneiform) and the wheel",
          "Egypt built pyramids and used hieroglyphic writing",
        ],
        reading: "The first great civilizations grew up along **rivers**, whose yearly floods left rich soil for farming. In **Mesopotamia** (modern Iraq), between the Tigris and Euphrates rivers, people built some of the world's first cities. They invented **cuneiform**, one of the earliest forms of **writing**, pressing marks into clay tablets — which meant ideas and records could finally outlive the person who spoke them. They also gave us the **wheel** and early math.\n\nAlong the **Nile River**, **ancient Egypt** flourished for thousands of years. Egyptians built the massive **pyramids** as tombs for their pharaohs — engineering marvels made without modern machines. They wrote in **hieroglyphics**, made paper from papyrus, and developed advanced medicine and astronomy. Both civilizations show a pattern: rivers made farming possible, farming made cities possible, and cities made writing, building, and government possible.",
      },
      { title: "Ancient Greece", outcome: "Explain ideas from ancient Greece that still shape the modern world.",
        hook: "Why do we still use the word 'democracy' — a word invented 2,500 years ago?",
        minutes: 8, standards: [
          { code: "C3.D2.His.14.6-8", title: "Explain multiple causes and effects of events and developments in the past" },
          { code: "C3.D2.His.16.6-8", title: "Organize applicable evidence into a coherent argument about the past" },
        ],
        points: [
          "Athens developed early democracy — rule by the people",
          "Greek thinkers advanced philosophy, math, and science",
          "Greek ideas about government and reason still shape us today",
        ],
        reading: "Ancient **Greece** wasn't one country but many independent **city-states**, like **Athens** and **Sparta**. Around 2,500 years ago, Athens developed one of the world's first **democracies** — a word that literally means 'rule by the people.' Citizens gathered to debate and vote on laws directly. It wasn't perfect (many people, including enslaved people and women, couldn't take part), but the idea that ordinary people should have a say was revolutionary and still shapes governments today.\n\nGreek **thinkers** changed how humans understand the world. Philosophers like Socrates asked hard questions about right and wrong; mathematicians like Pythagoras found patterns still taught in your math class; and early scientists looked for natural explanations instead of only myths. When you vote, reason through a problem, or use geometry, you're using ideas that trace back to ancient Greece.",
      },
    ],
  },
];

// ── Interactive quiz player (self-contained HTML in the sandboxed activity iframe). ──
function quizHtml(title: string, items: { q: string; options: string[]; answer: number }[]): string {
  const data = JSON.stringify(items).replace(/</g, "\\u003c");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--indigo:#3730A3;--amber:#F59E0B;--ink:#1f2430;--ok:#15803d;--no:#b91c1c}
*{box-sizing:border-box}body{font-family:Inter,system-ui,sans-serif;color:var(--ink);margin:0;padding:18px;background:#FBF7EF}
h2{margin:.2rem 0 1rem;font-size:1.15rem}.q{background:#fff;border:1px solid #ece7db;border-radius:14px;padding:14px 16px;margin:0 0 12px}
.qt{font-weight:600;margin:0 0 10px}.opt{display:block;width:100%;text-align:left;border:1px solid #e2ddcf;background:#fff;border-radius:10px;padding:10px 12px;margin:6px 0;font:inherit;cursor:pointer;transition:.15s}
.opt:hover{border-color:var(--indigo)}.opt.sel{border-color:var(--indigo);background:#eef0fb}
.opt.correct{border-color:var(--ok);background:#e9f7ee}.opt.wrong{border-color:var(--no);background:#fdecec}
.bar{height:10px;background:#eee;border-radius:6px;overflow:hidden;margin:14px 0 6px}.fill{height:100%;width:0;background:var(--amber);transition:.4s}
button.go{background:var(--indigo);color:#fff;border:0;border-radius:10px;padding:11px 18px;font:inherit;font-weight:600;cursor:pointer}
.score{font-weight:700;font-size:1.05rem;margin:4px 0}.hint{color:#6b7280;font-size:.9rem}
</style>
<h2>${title}</h2><div id="app"></div>
<div class="bar"><div class="fill" id="f"></div></div><p id="s" class="hint">Pick an answer for each question.</p>
<button class="go" id="submit">Check my answers</button>
<script>
const items=${data};const app=document.getElementById('app');const picks=new Array(items.length).fill(-1);let done=false;
items.forEach((it,qi)=>{const d=document.createElement('div');d.className='q';d.innerHTML='<p class="qt">'+(qi+1)+'. '+it.q+'</p>';
it.options.forEach((o,oi)=>{const b=document.createElement('button');b.className='opt';b.textContent=o;b.onclick=()=>{if(done)return;picks[qi]=oi;
[...d.querySelectorAll('.opt')].forEach(x=>x.classList.remove('sel'));b.classList.add('sel');upd();};d.appendChild(b);});app.appendChild(d);});
function upd(){const ans=picks.filter(p=>p>=0).length;document.getElementById('f').style.width=Math.round(ans/items.length*100)+'%';}
function report(score){try{parent.postMessage({type:'activity_result',score:score,payload:{picks:picks}},'*');}catch(e){}}
document.getElementById('submit').onclick=()=>{if(done)return;let right=0;const qs=[...document.querySelectorAll('.q')];
items.forEach((it,qi)=>{const opts=[...qs[qi].querySelectorAll('.opt')];opts.forEach((b,oi)=>{b.disabled=true;if(oi===it.answer)b.classList.add('correct');if(picks[qi]===oi&&oi!==it.answer)b.classList.add('wrong');});if(picks[qi]===it.answer)right++;});
const pct=Math.round(right/items.length*100);done=true;document.getElementById('f').style.width='100%';
document.getElementById('s').innerHTML='<span class="score">You got '+right+' of '+items.length+' right ('+pct+'%). '+(pct>=75?'Great work! 🎉':'Review the lesson and try again.')+'</span>';report(pct);};
</script>`;
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
    // Pre-consent every synthetic K-12 demo identity so the one-click demo lands straight in the
    // classroom without the POPIA privacy gate (these are non-production accounts, no real data).
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

async function createK12Course(c: K12Course, orgId: string, facultyId: string): Promise<{ courseId: string; moduleIds: string[] }> {
  const outcomes = c.modules.map((m) => m.outcome);
  const description = `${c.emoji} ${c.intro}\n\nCourse goal: ${c.outcome}`;
  const [course] = await db.insert(coursesTable).values({
    title: c.title, description, tenantId: "platform", status: "published",
    // "Grade 6" tag drives the US grade-level label in the UI (see courseLevelLabel); nqfLevel stays
    // 6 only as an internal sort key. This is what makes the tenant read as American K-12, not NQF.
    competencyTags: [...c.tags, c.subject, "Grade 6"], objectives: outcomes, nqfLevel: 6,
  }).returning();

  const moduleIds: string[] = [];
  let firstModuleId = "";
  for (let mi = 0; mi < c.modules.length; mi++) {
    const m = c.modules[mi];
    const [mod] = await db.insert(modulesTable).values({
      courseId: course.id, title: m.title, status: "published", lessonType: "slides",
      modality: "async", order: mi, objectives: [m.outcome], estimatedMinutes: m.minutes,
      description: `${c.subject} · Grade 6. Goal: ${m.outcome}`,
    }).returning();
    moduleIds.push(mod.id);
    if (mi === 0) firstModuleId = mod.id;

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

    // Standards: create (idempotent by code) and map to this module.
    for (const s of m.standards) {
      let std = firstOrNull(await db.select().from(unitStandardsTable).where(eq(unitStandardsTable.code, s.code)));
      if (!std) [std] = await db.insert(unitStandardsTable).values({
        code: s.code, title: s.title, framework: "other", nqfLevel: 6, description: `${c.framework} · ${c.subject}`,
      }).returning();
      const mapped = await db.select().from(unitStandardMappingsTable)
        .where(and(eq(unitStandardMappingsTable.unitStandardId, std.id), eq(unitStandardMappingsTable.targetId, mod.id)));
      if (mapped.length === 0) await db.insert(unitStandardMappingsTable).values({ unitStandardId: std.id, targetType: "module", targetId: mod.id });
      // Also map to the course so the course-level report shows coverage.
      const mappedCourse = await db.select().from(unitStandardMappingsTable)
        .where(and(eq(unitStandardMappingsTable.unitStandardId, std.id), eq(unitStandardMappingsTable.targetId, course.id)));
      if (mappedCourse.length === 0) await db.insert(unitStandardMappingsTable).values({ unitStandardId: std.id, targetType: "course", targetId: course.id });
    }

    // Module 0 gets an interactive quiz.
    if (m.quiz && m.quiz.length) {
      await db.insert(interactiveActivitiesTable).values({
        organisationId: orgId, courseId: course.id, moduleId: mod.id,
        title: `${m.title}: quick check`,
        instructions: "Answer each question, then check your work. You can retry as many times as you like.",
        html: quizHtml(`${m.title}: quick check`, m.quiz), source: "html", kind: "quiz",
        bloomsLevel: "Understand", difficulty: "foundational",
        isLibrary: false, tags: c.tags, published: true, createdByUserId: facultyId,
      });
    }
  }
  await db.update(coursesTable).set({ moduleCount: c.modules.length }).where(eq(coursesTable.id, course.id));

  // One AI Socratic tutor case per course (attached to the first module).
  await db.insert(caseScenariosTable).values({
    organisationId: orgId, moduleId: firstModuleId, createdBy: facultyId, createdByName: "Synops Academy",
    title: `Tutor challenge: ${c.subject}`,
    learningObjective: c.caseObjective,
    contextBlock: c.caseContext,
    openingQuestion: c.caseOpening,
    focusAreas: outcomes.slice(0, 3),
    difficulty: "foundational",
    status: "published", isLibrary: true, tags: c.tags,
    guidingInstructions: `You are a friendly, patient tutor for a 6th grader. Coach with questions, never hand over the answer. Use everyday examples, keep sentences short, and celebrate good thinking. Keep it age-appropriate and encouraging.`,
  });

  return { courseId: course.id, moduleIds };
}

export async function seedK12(): Promise<{ ok: boolean; partnerId?: string; courses?: number; learners?: number; standards?: number; message: string }> {
  // 1. Partner + brand.
  let partner = firstOrNull(await db.select().from(partnersTable).where(eq(partnersTable.slug, DEMO_SLUG)));
  if (!partner) {
    [partner] = await db.insert(partnersTable).values({
      name: "Synops Academy", slug: DEMO_SLUG, status: "active", contactEmail: "k12@synops-consulting.com",
    }).returning();
  }
  await applyBrand(partner.id);

  // 2. Organisation + homeroom class + faculty author.
  let org = firstOrNull(await db.select().from(organisationsTable)
    .where(and(eq(organisationsTable.partnerId, partner.id), eq(organisationsTable.name, ORG_NAME))));
  if (!org) [org] = await db.insert(organisationsTable).values({
    name: ORG_NAME, partnerId: partner.id, industry: "K-12 Education",
  }).returning();

  let cls = firstOrNull(await db.select().from(orgClassesTable).where(eq(orgClassesTable.orgId, org.id)));
  if (!cls) [cls] = await db.insert(orgClassesTable).values({
    orgId: org.id, partnerId: partner.id, name: CLASS_NAME,
  }).returning();

  const facultyId = await upsertUser({ email: "faculty.k12@synops-demo.test", firstName: "Ms.", lastName: "Rivera", role: "instructional_designer", partnerId: partner.id, organisationId: org.id });

  // 3. Courses (idempotent by title) + assign to the partner + register on the class.
  const courseIds: string[] = [];
  let standardsCount = 0;
  for (const c of COURSES) {
    const existing = firstOrNull(await db.select().from(coursesTable).where(and(eq(coursesTable.title, c.title), eq(coursesTable.tenantId, "platform"))));
    const courseId = existing ? existing.id : (await createK12Course(c, org.id, facultyId)).courseId;
    courseIds.push(courseId);
    // Idempotently ensure the "Grade 6" tag on courses seeded before this label existed, so a re-run
    // upgrades them to the US grade-level display without recreating content.
    if (existing && !(existing.competencyTags ?? []).some((t) => /^\s*grade\s+\d+/i.test(t))) {
      await db.update(coursesTable).set({ competencyTags: [...(existing.competencyTags ?? []), "Grade 6"] }).where(eq(coursesTable.id, courseId));
    }
    standardsCount += c.modules.reduce((n, m) => n + m.standards.length, 0);
    const hasAssign = await db.select().from(coursePartnerAssignmentsTable)
      .where(and(eq(coursePartnerAssignmentsTable.courseId, courseId), eq(coursePartnerAssignmentsTable.partnerId, partner.id)));
    if (hasAssign.length === 0) await db.insert(coursePartnerAssignmentsTable).values({ courseId, partnerId: partner.id, assignedBy: facultyId });
    const linked = (await db.select().from(orgClassCoursesTable).where(eq(orgClassCoursesTable.classId, cls.id))).map((x) => x.courseId);
    if (!linked.includes(courseId)) await db.insert(orgClassCoursesTable).values({ classId: cls.id, courseId });
  }

  // 4. Admin (a teacher) + class staff.
  const adminId = await upsertUser({ email: K12_ADMIN_EMAIL, firstName: "Ms.", lastName: "Rivera", role: "partner_admin", partnerId: partner.id, organisationId: null });
  const existingStaff = (await db.select().from(orgClassStaffTable).where(eq(orgClassStaffTable.classId, cls.id))).map((s) => s.staffId);
  if (!existingStaff.includes(adminId)) await db.insert(orgClassStaffTable).values({ classId: cls.id, staffId: adminId, role: "administrator" as const });

  // 5. Two learners: Maya (standard) and Leo (accommodations profile).
  const mayaId = await upsertUser({ email: K12_LEARNER_EMAIL, firstName: "Maya", lastName: "Chen", role: "learner", partnerId: partner.id, organisationId: org.id, learningStyle: "visual" });
  const leoId = await upsertUser({
    email: K12_LEARNER_ALT_EMAIL, firstName: "Leo", lastName: "Rivera", role: "learner", partnerId: partner.id, organisationId: org.id,
    learningStyle: "auditory",
    accommodations: ["scaffolded_questions", "simplified_language", "chunked_content", "concrete_examples", "extended_processing", "predictable_structure", "positive_reinforcement"],
  });

  // 6. Enrol both learners in all courses; pre-fill progress. Maya completes Math + ELA (with badges).
  const beatsByCourse: Record<string, { beatId: string; moduleId: string }[]> = {};
  const modulesByCourse: Record<string, { id: string; title: string }[]> = {};
  for (const courseId of courseIds) {
    const mods = await db.select().from(modulesTable).where(eq(modulesTable.courseId, courseId)).orderBy(asc(modulesTable.order));
    modulesByCourse[courseId] = mods.map((m) => ({ id: m.id, title: m.title }));
    const flat: { beatId: string; moduleId: string }[] = [];
    for (const m of mods) {
      const bs = await db.select().from(beatsTable).where(eq(beatsTable.moduleId, m.id)).orderBy(asc(beatsTable.createdAt));
      for (const b of bs) flat.push({ beatId: b.id, moduleId: m.id });
    }
    beatsByCourse[courseId] = flat;
  }

  async function enrolAndProgress(userId: string, plan: { courseId: string; fraction: number; complete: boolean; badges: boolean }[], startDay: number) {
    const already = (await db.select().from(enrolmentsTable).where(eq(enrolmentsTable.userId, userId))).map((e) => e.courseId);
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      if (!already.includes(p.courseId)) {
        await db.insert(enrolmentsTable).values({
          userId, courseId: p.courseId, status: p.complete ? ("completed" as const) : ("active" as const),
          enrolledAt: daysAgo(startDay - i * 3), completedAt: p.complete ? daysAgo(2) : null,
        });
      }
      const beats = beatsByCourse[p.courseId] ?? [];
      const viewCount = p.complete ? beats.length : Math.round(beats.length * p.fraction);
      if (viewCount > 0) {
        const rows = beats.slice(0, viewCount).map((b, idx) => ({
          userId, beatId: b.beatId, moduleId: b.moduleId, courseId: p.courseId,
          secondsSpent: 45 + (idx % 4) * 15, firstViewedAt: daysAgo(startDay - i * 3 - 1), lastViewedAt: daysAgo(Math.max(1, 20 - i * 3)),
        }));
        try { await db.insert(beatProgressTable).values(rows).onConflictDoNothing(); } catch { /* cosmetic */ }
      }
      // Badges: a valid credential per module of a completed course.
      if (p.badges) {
        for (const m of modulesByCourse[p.courseId] ?? []) {
          const has = await db.select().from(credentialsTable).where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.moduleId, m.id)));
          if (has.length === 0) await db.insert(credentialsTable).values({
            userId, moduleId: m.id, moduleTitle: m.title, partnerId: partner!.id, partnerName: "Synops Academy",
            status: "valid", masteryScore: "0.9200", evidenceSummary: "Completed all lesson beats and passed the practice check.",
            decayDate: daysFromNow(365),
          });
        }
      }
    }
  }

  // Maya: Math + ELA fully complete with badges; Science/Social/History in progress.
  await enrolAndProgress(mayaId, [
    { courseId: courseIds[0], fraction: 1, complete: true, badges: true },   // Math
    { courseId: courseIds[1], fraction: 1, complete: true, badges: true },   // ELA
    { courseId: courseIds[2], fraction: 0.66, complete: false, badges: false }, // Science
    { courseId: courseIds[3], fraction: 0.33, complete: false, badges: false }, // Social Studies
    { courseId: courseIds[4], fraction: 0.5, complete: false, badges: false },  // History
  ], 40);

  // Leo: steady early progress across the board (accommodations demo, not a completion demo).
  await enrolAndProgress(leoId, courseIds.map((courseId, i) => ({ courseId, fraction: [0.5, 0.33, 0.33, 0.2, 0.33][i] ?? 0.33, complete: false, badges: false })), 28);

  return {
    ok: true, partnerId: partner.id, courses: courseIds.length, learners: 2, standards: standardsCount,
    message: `Synops K-12 ready: ${courseIds.length} courses, ${standardsCount} standards mapped, 2 learners. Maya ${K12_LEARNER_EMAIL} (2 subjects complete + badges), Leo ${K12_LEARNER_ALT_EMAIL} (accommodations). Password ${DEMO_PASSWORD}.`,
  };
}
