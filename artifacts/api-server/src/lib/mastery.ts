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
import { sm2Update } from "./sm2";

export const MASTERY_THRESHOLD = 0.8;

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
}): Promise<CheckpointResult> {
  const { userId, session, socraticCtx, learnerResponse, historyOrdered } = opts;

  // AI grading happens outside the transaction (it's a network call).
  const grade = await gradeCheckpoint(socraticCtx, learnerResponse, historyOrdered);
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, session.moduleId) });

  // Everything that mutates state runs in one transaction so a partial
  // failure never leaves mastery, evidence, and credentials inconsistent.
  return await db.transaction(async (tx) => {
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

    const newMastery = sm2.mastery;
    const nowMastered = newMastery >= MASTERY_THRESHOLD && grade.grade >= 3;
    const freshTurnCount = Number(session.turnCount) + 2;
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

    if (nowMastered && !alreadyMastered) {
      await issueCredential(tx, {
        userId,
        moduleId: session.moduleId,
        moduleTitle: mod?.title,
        masteryScore: newMastery.toString(),
        exchanges: Math.floor(freshTurnCount / 2),
      });
    }

    return { grade: grade.grade, reasoning: grade.reasoning, newMastery, mastered: nowMastered };
  });
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
    });
  } catch {
    // Non-fatal
  }
}
