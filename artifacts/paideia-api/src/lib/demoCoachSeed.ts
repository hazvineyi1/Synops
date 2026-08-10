import { randomBytes } from "node:crypto";
import {
  db,
  studyUsersTable,
  studyLearnerProfilesTable,
  studyMaterialsTable,
  studyConceptsTable,
  studyFlashcardsTable,
  studyKnowledgeNodesTable,
  studyLearningPathsTable,
  studyLearningPathStepsTable,
  studyTutorConversationsTable,
  studyTutorMessagesTable,
} from "@workspace/paideia-db";
import { eq } from "drizzle-orm";
import { hashPassword } from "./studyAuth.js";
import { PRIVACY_POLICY_VERSION } from "./popia.js";
import { logger } from "./logger.js";

/**
 * One-click demo learner for Synops Coach. A single fixed identity with a completed diagnostic
 * (so the intake gate is skipped), an active learning path, a study material with concepts and
 * spaced-repetition flashcards, a small knowledge map and a coaching conversation — so a visitor
 * sees a working daily session immediately. Entered ONLY through the host-gated /auth/demo-login
 * button (random, unusable password). Idempotent: seeds once, rolls the user back on partial failure.
 */
export const DEMO_COACH_EMAIL = "demo.learner@synops-coach.test";

const CONCEPTS = [
  {
    title: "Cell membrane transport",
    difficulty: "medium",
    explanation: "The cell membrane is selectively permeable. Diffusion and osmosis move substances down a concentration gradient with no energy cost; active transport moves them against the gradient and needs ATP. Recognising which process applies is the key exam skill.",
    keyTerms: ["diffusion", "osmosis", "active transport", "concentration gradient", "selectively permeable"],
    mastery: 0.82,
  },
  {
    title: "Organelles and their functions",
    difficulty: "easy",
    explanation: "Each organelle has a job: the nucleus stores DNA and controls the cell, mitochondria release energy in respiration, ribosomes build proteins, and chloroplasts (plant cells) carry out photosynthesis. Exam questions reward linking structure to function.",
    keyTerms: ["nucleus", "mitochondrion", "ribosome", "chloroplast", "vacuole"],
    mastery: 0.9,
  },
  {
    title: "Osmosis and water potential",
    difficulty: "hard",
    explanation: "Osmosis is the net movement of water across a partially permeable membrane from a high to a low water potential. In practical questions, cells in a concentrated solution lose water and become flaccid or plasmolysed; in dilute solution they gain water and become turgid.",
    keyTerms: ["water potential", "turgid", "flaccid", "plasmolysis", "partially permeable"],
    mastery: 0.55,
  },
  {
    title: "Mitosis and the cell cycle",
    difficulty: "medium",
    explanation: "Mitosis produces two genetically identical daughter cells for growth and repair. The stages — prophase, metaphase, anaphase, telophase — are best remembered by what the chromosomes are doing, not just the names.",
    keyTerms: ["mitosis", "chromosome", "prophase", "metaphase", "anaphase", "telophase"],
    mastery: 0.4,
  },
];

const FLASHCARDS = [
  { c: 0, front: "In which direction does diffusion move particles?", back: "Down the concentration gradient (high → low), with no energy required.", hint: "Think 'downhill'.", due: -1 },
  { c: 0, front: "What does active transport need that diffusion does not?", back: "Energy from ATP, because it moves substances against the gradient.", hint: null, due: 2 },
  { c: 1, front: "Which organelle releases energy through respiration?", back: "The mitochondrion.", hint: "The 'powerhouse'.", due: -1 },
  { c: 1, front: "Where in the cell are proteins made?", back: "At the ribosomes.", hint: null, due: 4 },
  { c: 2, front: "Define osmosis.", back: "The net movement of water across a partially permeable membrane from high to low water potential.", hint: "It's diffusion — but of water.", due: -1 },
  { c: 2, front: "A plant cell in pure water becomes…?", back: "Turgid — it gains water and the vacuole pushes on the cell wall.", hint: null, due: 1 },
  { c: 3, front: "What does mitosis produce?", back: "Two genetically identical diploid daughter cells.", hint: "Identical, not halved.", due: -2 },
];

const MATERIAL_TEXT = `Cell Biology — Unit 2

Cells are the basic unit of life. This unit covers cell structure, transport across membranes, and cell division.

1. Cell structure. Animal and plant cells share a nucleus, cytoplasm, cell membrane, mitochondria and ribosomes. Plant cells also have a cell wall, a permanent vacuole and (in green tissue) chloroplasts.

2. Transport. Substances cross the selectively permeable membrane by diffusion, osmosis and active transport. Diffusion and osmosis are passive; active transport uses energy from respiration.

3. Osmosis. Water moves from a region of higher water potential to lower water potential across a partially permeable membrane. This explains why cells swell or shrink in different solutions.

4. Cell division. Mitosis produces two identical cells for growth and repair, passing through prophase, metaphase, anaphase and telophase.`;

export async function ensureCoachDemoSeed(): Promise<{ created: boolean }> {
  const [existing] = await db.select().from(studyUsersTable).where(eq(studyUsersTable.email, DEMO_COACH_EMAIL)).limit(1);
  if (existing) return { created: false };

  const passwordHash = hashPassword(randomBytes(24).toString("hex"));
  const [user] = await db.insert(studyUsersTable).values({
    email: DEMO_COACH_EMAIL,
    passwordHash,
    name: "Sam Moyo",
    subscriptionStatus: "active",
    subscriptionTier: "pro",
    consentVersion: PRIVACY_POLICY_VERSION,
    consentedAt: new Date(),
    ageBand: "adult",
    lastActiveAt: new Date(),
  }).returning();

  try {
    // Completed diagnostic intake → skips the onboarding gate.
    await db.insert(studyLearnerProfilesTable).values({
      userId: user!.id,
      goals: ["Pass IGCSE Biology with a strong grade", "Stop forgetting definitions under exam pressure"],
      examTarget: "IGCSE Biology",
      studyStyle: "balanced",
      preferredSessionLength: 25,
      preferredDifficulty: "mixed",
      weakAreas: ["Osmosis and water potential", "Mitosis stages"],
      strongAreas: ["Organelle functions"],
      interests: ["medicine", "sports science"],
      dailyStudyMinutes: 30,
      examDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 45),
      hoursPerWeek: 6,
      baselineLevel: "solid",
      calibrationSelfRating: "mid",
      failureMode: "cram",
      coachPersonality: "warm",
    });

    // Material + concepts
    const [material] = await db.insert(studyMaterialsTable).values({
      userId: user!.id,
      title: "Cell Biology — Unit 2 Notes",
      sourceType: "paste",
      contentText: MATERIAL_TEXT,
      strategy: {
        summary: "A focused unit on cell structure, membrane transport and division. Prioritise osmosis and mitosis, your two weaker areas.",
        sessionMinutes: 25,
        modalityMix: { text: 0.3, audio: 0.1, visual: 0.3, practice: 0.3 },
        activities: [
          { order: 1, title: "Read: transport across membranes", description: "Skim section 2, then close the page and list the three transport types.", modality: "read", estimatedMinutes: 6 },
          { order: 2, title: "Practice: osmosis scenarios", description: "Predict turgid vs flaccid for four cell-in-solution cases.", modality: "practice", estimatedMinutes: 8 },
          { order: 3, title: "Recall: mitosis stages", description: "Order the four stages from memory and describe each in one line.", modality: "reflect", estimatedMinutes: 6 },
        ],
        tips: ["Draw the process before writing the definition.", "Say the water-potential rule out loud until it is automatic."],
        generatedAt: new Date().toISOString(),
      },
    }).returning();

    const conceptIds: string[] = [];
    for (const c of CONCEPTS) {
      const [row] = await db.insert(studyConceptsTable).values({
        userId: user!.id,
        materialId: material!.id,
        title: c.title,
        explanation: c.explanation,
        difficulty: c.difficulty,
        keyTerms: c.keyTerms,
      }).returning();
      conceptIds.push(row!.id);
    }

    // Flashcards (some due now for a live review queue)
    const now = Date.now();
    await db.insert(studyFlashcardsTable).values(
      FLASHCARDS.map((f) => ({
        userId: user!.id,
        materialId: material!.id,
        conceptId: conceptIds[f.c]!,
        front: f.front,
        back: f.back,
        hint: f.hint,
        intervalDays: f.due <= 0 ? 1 : Math.max(1, f.due),
        repetitions: f.due <= 0 ? 1 : 2,
        easeFactor: 2.5,
        nextReviewAt: new Date(now + f.due * 24 * 60 * 60 * 1000),
        lastReviewedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
        reviewCount: f.due <= 0 ? 1 : 2,
      })),
    );

    // Knowledge map nodes (one per concept)
    const nodeIds: string[] = [];
    for (let i = 0; i < CONCEPTS.length; i++) {
      const c = CONCEPTS[i]!;
      const [row] = await db.insert(studyKnowledgeNodesTable).values({
        userId: user!.id,
        label: c.title,
        description: c.explanation.slice(0, 140),
        category: "biology",
        masteryLevel: c.mastery,
        confidenceScore: Math.max(0.2, c.mastery - 0.1),
        reviewCount: 3,
        lastAssessedAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
      }).returning();
      nodeIds.push(row!.id);
    }

    // Active learning path + steps (mix of completed / in-progress / available / locked)
    const [path] = await db.insert(studyLearningPathsTable).values({
      userId: user!.id,
      title: "IGCSE Biology — Cells sprint",
      description: "A guided path through Unit 2, weighted toward your weaker areas.",
      goal: "Master cell transport and division before the mock exam.",
      status: "active",
      nodeSequence: nodeIds.map((id, i) => ({ nodeId: id, order: i, estimatedMinutes: 15, status: (i < 2 ? "completed" : i === 2 ? "in_progress" : "pending") as "pending" | "in_progress" | "completed" })),
      totalEstimatedMinutes: 70,
      completedMinutes: 26,
    }).returning();

    const steps: Array<{ stepType: string; title: string; description: string; est: number; status: string; node: number; mastery: number | null }> = [
      { stepType: "read_material", title: "Read: organelles & functions", description: "Section 1 — link each structure to its job.", est: 8, status: "completed", node: 1, mastery: 0.9 },
      { stepType: "flashcard_review", title: "Review: organelle flashcards", description: "Clear today's due cards for organelles.", est: 6, status: "completed", node: 1, mastery: 0.88 },
      { stepType: "practice_questions", title: "Practice: membrane transport", description: "Six questions on diffusion, osmosis and active transport.", est: 12, status: "in_progress", node: 0, mastery: null },
      { stepType: "tutor_session", title: "Coach: osmosis & water potential", description: "Work through the water-potential rule with the coach.", est: 15, status: "available", node: 2, mastery: null },
      { stepType: "mastery_check", title: "Mastery check: mitosis stages", description: "Prove you can order and describe all four stages.", est: 10, status: "locked", node: 3, mastery: null },
      { stepType: "spaced_review", title: "Spaced review: whole unit", description: "A mixed recall set across every concept.", est: 12, status: "locked", node: 3, mastery: null },
    ];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]!;
      await db.insert(studyLearningPathStepsTable).values({
        userId: user!.id,
        pathId: path!.id,
        nodeId: nodeIds[s.node]!,
        conceptId: conceptIds[s.node]!,
        order: i,
        stepType: s.stepType,
        title: s.title,
        description: s.description,
        estimatedMinutes: s.est,
        status: s.status,
        completedAt: s.status === "completed" ? new Date(now - (steps.length - i) * 24 * 60 * 60 * 1000) : null,
        masteryScore: s.mastery,
      });
    }

    // A coaching conversation so the Coach page isn't empty
    const [conv] = await db.insert(studyTutorConversationsTable).values({
      userId: user!.id,
      title: "Osmosis — why does the potato strip shrink?",
      socraticMode: true,
      scope: "all_material",
    }).returning();
    await db.insert(studyTutorMessagesTable).values([
      { conversationId: conv!.id, role: "user", content: "Why does a potato strip in salty water get smaller and floppy?" },
      { conversationId: conv!.id, role: "assistant", content: "Good question — let's reason it out. Compared with the potato cells, does the salty water have more or less water potential?", usedPersonalization: true, citations: [{ type: "concept", title: "Osmosis and water potential" }] },
      { conversationId: conv!.id, role: "user", content: "Less water potential, because it's concentrated." },
      { conversationId: conv!.id, role: "assistant", content: "Exactly. So which way does water move across the membrane — into the cells or out of them — and what does that do to the strip?", usedPersonalization: true, citations: [{ type: "concept", title: "Osmosis and water potential" }] },
    ]);

    return { created: true };
  } catch (err) {
    logger.error({ err }, "demo coach seed failed; rolling back user row");
    await db.delete(studyUsersTable).where(eq(studyUsersTable.id, user!.id)).catch(() => {});
    throw err;
  }
}
