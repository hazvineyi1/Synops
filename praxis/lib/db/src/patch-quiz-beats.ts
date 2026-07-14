/**
 * Patch script — adds rich beats (quiz + reading) to existing modules.
 * Safe to re-run: uses ON CONFLICT DO NOTHING on id.
 */
import { db, beatsTable, modulesTable } from './index';
import { eq, sql } from 'drizzle-orm';

const richBeats = [
  // ── mod_cx_01: Check for Understanding ────────────────────────────────────
  {
    id: 'beat_c01_05',
    moduleId: 'mod_cx_01',
    type: 'close' as const,
    order: 5,
    title: 'Check for Understanding',
    narration: "Let's see how well you've understood the customer-centric mindset.",
    bulletPoints: [],
    scenario: null,
    visualData: {
      quiz: {
        question:
          'A customer has been waiting 15 minutes at a busy checkout. What is the MOST proactive response?',
        options: [
          { id: 'a', text: 'Wait for the customer to complain, then apologise.' },
          { id: 'b', text: 'Call a manager immediately and say nothing to the customer.' },
          {
            id: 'c',
            text: 'Acknowledge the wait before the customer says anything and offer a genuine apology.',
          },
          { id: 'd', text: 'Speed up scanning without acknowledging the customer.' },
        ],
        correctId: 'c',
        explanation:
          'Proactive service anticipates the customer\'s frustration and addresses it before it escalates. Acknowledging the wait unprompted shows empathy and builds trust — even if you cannot fix the problem immediately.',
      },
    },
  },

  // ── mod_biz_01: Check for Understanding ────────────────────────────────────
  {
    id: 'beat_b01_06',
    moduleId: 'mod_biz_01',
    type: 'close' as const,
    order: 6,
    title: 'Check for Understanding',
    narration: 'Test your understanding of the four core business functions.',
    bulletPoints: [],
    scenario: null,
    visualData: {
      quiz: {
        question:
          "Thandeka's catering business is growing but her staff are untrained and keep making mistakes at events. Which business function does she MOST urgently need to focus on?",
        options: [
          { id: 'a', text: 'Operations — she needs to streamline her cooking process.' },
          { id: 'b', text: 'Marketing — more clients will create pressure to improve.' },
          { id: 'c', text: 'Finance — she needs to track costs more carefully.' },
          {
            id: 'd',
            text: 'Human Resources — untrained staff directly cause poor customer experiences.',
          },
        ],
        correctId: 'd',
        explanation:
          "Human Resources covers building and developing teams. Staff quality directly affects operations and customer satisfaction. Training and managing people is Thandeka's most urgent gap — skilled staff will improve all other functions.",
      },
    },
  },

  // ── mod_cx_01: Reading — The Science of First Impressions ──────────────────
  {
    id: 'beat_c01_06',
    moduleId: 'mod_cx_01',
    type: 'points' as const,
    order: 6,
    title: 'The Science of First Impressions',
    narration:
      "Research shows customers form an impression of your service within the first 7 seconds of an interaction. That impression is extremely difficult to reverse — which is why every greeting, every glance, and every opening line matters far more than most people realise.",
    bulletPoints: [
      '7 seconds — the time it takes a customer to form a first impression of your service',
      '55% of that impression is driven by body language and posture, not words',
      'A warm, direct greeting reduces perceived wait times by up to 20%',
      'Customers who receive a proactive apology are 70% more likely to return, even after a bad experience',
      'The "halo effect" means one positive interaction colours the customer\'s memory of the entire visit',
    ],
    scenario: null,
    visualData: { subtype: 'reading' },
  },

  // ── mod_biz_01: Reading — South African Business Context ──────────────────
  {
    id: 'beat_b01_07',
    moduleId: 'mod_biz_01',
    type: 'points' as const,
    order: 7,
    title: 'Business in the South African Context',
    narration:
      "South Africa's economy is one of the most unequal in the world, which creates both unique challenges and extraordinary opportunities for small business owners. Understanding the local landscape is essential for any entrepreneur navigating this environment.",
    bulletPoints: [
      'Over 3 million informal businesses operate in South Africa — the informal sector employs roughly 18% of the working population',
      'The National Small Business Act defines small businesses across sectors by employee count and annual turnover',
      'SARS requires businesses with annual turnover above R1 million to register for VAT',
      'Government support structures include SEDA (Small Enterprise Development Agency) and the NYDA for youth entrepreneurs',
      'B-BBEE compliance is often a prerequisite for contracts with larger corporates and government entities',
    ],
    scenario: null,
    visualData: { subtype: 'reading' },
  },
];

async function run() {
  console.log('Patching beats...');

  for (const beat of richBeats) {
    // Insert with conflict on PK — safe to re-run
    await db
      .insert(beatsTable)
      .values({
        id: beat.id,
        moduleId: beat.moduleId,
        type: beat.type,
        order: beat.order,
        title: beat.title,
        narration: beat.narration,
        bulletPoints: beat.bulletPoints,
        scenario: beat.scenario,
        visualData: beat.visualData,
      })
      .onConflictDoNothing();
    console.log(`  ✓ ${beat.id}`);
  }

  // Sync beatCounts
  const moduleIds = [...new Set(richBeats.map(b => b.moduleId))];
  for (const moduleId of moduleIds) {
    const rows = await db
      .select({ id: beatsTable.id })
      .from(beatsTable)
      .where(eq(beatsTable.moduleId, moduleId));
    await db
      .update(modulesTable)
      .set({ beatCount: rows.length, updatedAt: new Date() })
      .where(eq(modulesTable.id, moduleId));
    console.log(`  ✓ ${moduleId} beatCount → ${rows.length}`);
  }

  console.log('Done.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
