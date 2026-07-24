import { db } from "@workspace/db";
import {
  sessionsTable,
  modulesTable,
  credentialsTable,
  conceptMasteryTable,
  evidenceRecordsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { gradeCheckpoint, type SocraticContext } from "./socraticEngine";
import { sm2Update, masteryStep } from "./sm2";
import { maybeCompleteEnrolment } from "./progressMath";

export const MASTERY_THRESHOLD = 0.8;

/**
 * Pacing floor for certification on the LEGACY / no-limit path (e.g. WhatsApp), where there is no
 * learner-chosen interaction count to end on. A high score alone is not enough: certification also
 * requires a minimum number of learner exchanges AND a minimum elapsed session time, so a rushed
 * couple of answers can never certify in seconds. Web sessions instead run for the learner's chosen
 * number of interactions and certify at the END (see the pacing option), so they do not use this
 * floor. Below either bar the mastery meter still climbs; only issuance is held.
 */
export const MIN_MASTERY_EXCHANGES = 5;
export const MIN_MASTERY_SESSION_MS = 3 * 60 * 1000;

interface CheckpointResult {
  grade: number;
  reasoning: string;
  newMastery: number;
  mastered: boolean;
}

/**
 * Grade the learner's latest answer, run SM-2 to update concept mastery and
 * schedule the next review, update the session, record evidence, and issue a
 * PraxisMark when genuine mastery is demonstrated. Shared by the web session
 * route and the WhatsApp channel so grading is identical everywhere.
 */
export async function applyCheckpoint(opts: {
  userId: string;
  session: typeof sessionsTable.$inferSelect;
  socraticCtx: SocraticContext;
  learnerResponse: string;
  historyOrdered: { role: string; content: string }[];
  tutorReply: string;
  isSelection?: boolean;
  /**
   * How this session decides when to certify:
   *  - hasLimit: the learner chose a fixed number of interactions. The session runs the whole way and
   *    certifies ONLY on the final interaction, and only if the session mastery reached the bar. It
   *    never certifies (or ends) early, however strong the answers.
   *  - isFinalInteraction: this answer is the learner's last one for a limited session.
   * When hasLimit is false (legacy / WhatsApp), the pacing floor above governs certification instead.
   */
  pacing?: { hasLimit: boolean; isFinalInteraction: boolean };
}): Promise<CheckpointResult> {
  const { userId, session, socraticCtx, learnerResponse, historyOrdered } = opts;

  // AI grading happens outside the transaction (it's a network call). When the learner picked a
  // multiple-choice option, grade the correctness of the choice (recognition), capped below mastery.
  const grade = await gradeCheckpoint(socraticCtx, learnerResponse, historyOrdered, opts.isSelection ?? false);
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, session.moduleId) });

  // Mastery, session status, and evidence mutate in one transaction so a partial failure never
  // leaves them inconsistent. The credential is issued separately, after commit (see below).
  const result = await db.transaction(async (tx) => {
    // Lock the existing concept row (if any) so concurrent checkpoints
    // (e.g. web + WhatsApp) serialize instead of clobbering each other.
    const existing = await tx.query.conceptMasteryTable.findFirst({
      where: and(
        eq(conceptMasteryTable.userId, userId),
        eq(conceptMasteryTable.moduleId, session.moduleId)
      ),
    });
    if (existing) {
      await tx
        .select({ id: conceptMasteryTable.id })
        .from(conceptMasteryTable)
        .where(eq(conceptMasteryTable.id, existing.id))
        .for("update");
    }

    const prev = existing ?? { mastery: "0", ef: "2.5", interval: 0, reps: 0 };
    const sm2 = sm2Update(
      Number(prev.mastery),
      Number(prev.ef),
      Number(prev.interval),
      Number(prev.reps),
      grade.grade
    );
    const now = new Date();

    // Conflict-safe upsert on the unique (userId, moduleId) pair.
    await tx
      .insert(conceptMasteryTable)
      .values({
        userId,
        moduleId: session.moduleId,
        moduleTitle: mod?.title ?? "",
        courseId: mod?.courseId ?? null,
        mastery: sm2.mastery.toString(),
        ef: sm2.ef.toString(),
        interval: sm2.interval,
        reps: sm2.reps,
        lastGrade: grade.grade,
        dueDate: sm2.dueDate,
        lastReviewedAt: now,
      })
      .onConflictDoUpdate({
        target: [conceptMasteryTable.userId, conceptMasteryTable.moduleId],
        set: {
          mastery: sm2.mastery.toString(),
          ef: sm2.ef.toString(),
          interval: sm2.interval,
          reps: sm2.reps,
          lastGrade: grade.grade,
          dueDate: sm2.dueDate,
          lastReviewedAt: now,
          updatedAt: now,
        },
      });

    // The SESSION mastery meter is session-local: it starts at 0 each session and climbs one measured
    // step per answer, based purely on THIS session's grades. It deliberately does NOT inherit the
    // persistent per-concept score, so mastery is earned by answering the chosen questions correctly
    // in this session (not carried in from past work), and can never read near-full after one answer.
    const newMastery = masteryStep(Number(session.masteryScore), grade.grade);
    const freshTurnCount = Number(session.turnCount) + 2;
    const learnerExchanges = Math.floor(freshTurnCount / 2);
    const elapsedMs = now.getTime() - new Date(session.createdAt).getTime();

    // Certification depends on how the session is paced.
    //  - A limited (web) session runs to the learner's chosen number of interactions and certifies
    //    ONLY on the final one, and only if the session mastery has reached the bar by then, i.e. the
    //    learner answered enough of their chosen questions well. It never certifies early.
    //  - A no-limit (legacy / WhatsApp) session uses the pacing floor: enough exchanges AND enough
    //    elapsed time, plus a solid final answer.
    const reachedBar = newMastery >= MASTERY_THRESHOLD;
    const pacingSatisfied = learnerExchanges >= MIN_MASTERY_EXCHANGES && elapsedMs >= MIN_MASTERY_SESSION_MS;
    const nowMastered = opts.pacing?.hasLimit
      ? !!opts.pacing.isFinalInteraction && reachedBar
      : reachedBar && grade.grade >= 2 && pacingSatisfied;
    const alreadyMastered = session.status === "mastered";

    await tx
      .update(sessionsTable)
      .set({
        masteryScore: newMastery.toString(),
        turnCount: sql`${sessionsTable.turnCount} + 2`,
        status: nowMastered ? "mastered" : "active",
        completedAt: nowMastered ? now : null,
      })
      .where(eq(sessionsTable.id, session.id));

    await tx.insert(evidenceRecordsTable).values({
      userId,
      sessionId: session.id,
      type: "session_response",
      description: `Grade ${grade.grade}/3: ${grade.reasoning}`,
      score: (grade.grade / 3).toFixed(4),
    });

    // NOTE: the credential is issued AFTER this transaction commits (below), never inside it. A
    // credential hiccup must never roll back the learner's hard-won mastery, and issuing inside the
    // tx risked exactly that (a failed insert poisons the whole transaction).
    return {
      grade: grade.grade,
      reasoning: grade.reasoning,
      newMastery,
      mastered: nowMastered,
      shouldIssueCredential: nowMastered && !alreadyMastered,
      moduleTitle: mod?.title ?? null,
      exchanges: learnerExchanges,
    };
  });

  // Issue the credential on its own connection, after the checkpoint has committed. issueCredential
  // is idempotent (findFirst guard + conflict-safe insert), so if it ever fails it simply retries on
  // the next mastered turn - the mastery + session state are already safely saved either way.
  if (result.shouldIssueCredential) {
    await issueCredential(db, {
      userId,
      moduleId: session.moduleId,
      moduleTitle: result.moduleTitle,
      masteryScore: result.newMastery.toString(),
      exchanges: result.exchanges,
    });
    // Mastering the last outstanding module (via the coach, with no beat_progress written) should
    // still flip the enrolment to completed. courseProgress now counts certified modules, so this
    // fires exactly when the course reads 100%. Best-effort: a completion hiccup must never surface
    // as a checkpoint failure to the learner, and it self-heals on the next progress read.
    if (mod?.courseId) {
      try {
        await maybeCompleteEnrolment(userId, mod.courseId);
      } catch {
        // Non-fatal
      }
    }
  }

  return { grade: result.grade, reasoning: result.reasoning, newMastery: result.newMastery, mastered: result.mastered };
}

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Issue a PraxisMark. Idempotent: if the learner already holds a valid
 * credential for this module, we do nothing rather than duplicate it.
 * Uses the caller-provided (post-update) mastery/exchange values so the
 * credential never records a stale score.
 */
export async function issueCredential(
  exec: DbOrTx,
  opts: {
    userId: string;
    moduleId: string;
    moduleTitle?: string | null;
    masteryScore: string;
    exchanges: number;
  }
) {
  const { userId, moduleId, masteryScore, exchanges } = opts;
  try {
    const resolvedTitle =
      opts.moduleTitle ??
      (await exec.query.modulesTable.findFirst({ where: eq(modulesTable.id, moduleId) }))?.title;
    if (!resolvedTitle) return;

    const existingCredential = await exec.query.credentialsTable.findFirst({
      where: and(
        eq(credentialsTable.userId, userId),
        eq(credentialsTable.moduleId, moduleId),
        eq(credentialsTable.status, "valid")
      ),
    });
    if (existingCredential) return; // idempotent — already certified

    const decayDate = new Date();
    decayDate.setMonth(decayDate.getMonth() + 12); // 12-month validity

    // Arbiter-less ON CONFLICT DO NOTHING: it catches a race (two concurrent mastered checkpoints for
    // the same learner) via the partial unique index (user_id, module_id) WHERE status='valid' when
    // that index is present, and - crucially - NEVER raises 42P10 if the index is somehow absent. The
    // earlier form named the partial index as the conflict arbiter, which errored (and, when this ran
    // inside the checkpoint transaction, rolled the whole checkpoint back) on any environment where
    // that index had not been created yet. The findFirst guard above already prevents the common
    // duplicate; this is the race backstop.
    await exec.insert(credentialsTable).values({
      userId,
      moduleId,
      moduleTitle: resolvedTitle,
      partnerId: "platform",
      partnerName: "Synops Praxis",
      masteryScore,
      evidenceSummary: `Achieved mastery through ${exchanges} Socratic exchanges`,
      decayDate,
      status: "valid",
    }).onConflictDoNothing();
  } catch {
    // Non-fatal
  }
}
