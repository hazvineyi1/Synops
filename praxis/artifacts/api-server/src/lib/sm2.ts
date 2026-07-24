/**
 * SM-2 spaced-repetition algorithm (adapted).
 * grade: 0-3 (from a checkpoint grade).
 *   0 = no understanding, 1 = shaky, 2 = solid, 3 = mastery.
 * The learner never sees ef/interval/reps — they experience it as the
 * Coach knowing when to bring a concept back.
 */
/**
 * MEASURED INTERVALS: the largest amount the visible mastery meter may move on a single answer. A
 * strong answer used to leap the bar (from 0 a single grade-3 jumped to 0.5), which read as a jackpot
 * rather than earned, steady progress. Capping the per-turn gain makes the meter climb in measured
 * steps the learner can feel move with each response. Chosen so a run of clear-mastery answers reaches
 * the 0.8 bar in about five exchanges, aligning with the certification pacing floor (MIN_MASTERY_
 * EXCHANGES). It only bounds the STEP; the non-punitive invariant (never decreases) is unchanged.
 */
export const MAX_MASTERY_STEP = 0.16;

/**
 * One measured, non-punitive mastery step from a grade. Shared by SM-2 (the persistent per-concept
 * score used for scheduling) AND by the per-SESSION mastery meter, so both move the same measured way.
 *
 * NON-PUNITIVE: a weak or incorrect answer never DECREASES the score - it can award progress (a strong
 * answer) or award nothing (a weak one), never a negative delta. MEASURED: the step is capped at
 * MAX_MASTERY_STEP so the meter climbs in intervals the learner can feel rather than leaping the bar on
 * one answer. Grade 2 (solid, incl. a correct multiple-choice pick) tops out at 0.85 so mastery CAN
 * cross the 0.8 bar over a few good turns; grade 3 reaches full mastery.
 */
export function masteryStep(prevMastery: number, grade: number): number {
  const TARGET = [0, 0.5, 0.85, 1.0];
  const target = TARGET[Math.max(0, Math.min(3, Math.round(grade)))] ?? 0;
  const gained = target > prevMastery ? Math.min((target - prevMastery) * 0.5, MAX_MASTERY_STEP) : 0;
  // max(prev, ...) is belt-and-braces: the score is guaranteed never to fall below where it was.
  const next = Math.min(1, Math.max(prevMastery, prevMastery + gained));
  // Round to the mastery column's 4-decimal precision. This also stops float drift from repeated
  // additions (five 0.16 steps sum to 0.79999... which would wrongly read as below the 0.8 bar).
  return Math.round(next * 10000) / 10000;
}

export function sm2Update(
  mastery: number,
  ef: number,
  interval: number,
  reps: number,
  grade: number
): { mastery: number; ef: number; interval: number; reps: number; dueDate: string } {
  let newReps = reps;
  let newInterval = interval;
  let newEf = ef;

  if (grade < 1) {
    newReps = 0;
    newInterval = 1;
  } else {
    if (newReps === 0) newInterval = 1;
    else if (newReps === 1) newInterval = 3;
    else newInterval = Math.round(interval * ef);
    newReps += 1;
  }

  // Ease-factor adjustment (SM-2), clamped to a 0-3 grade range.
  newEf = Math.max(1.3, ef + (0.1 - (3 - grade) * (0.08 + (3 - grade) * 0.02)));

  // The persistent per-concept mastery moves one measured, non-punitive step (see masteryStep). The
  // spaced-repetition scheduling above still reacts to a weak answer (reps/interval reset), so the
  // tutoring cadence is unchanged; only the visible mastery score is protected from decreasing.
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + newInterval);

  return {
    mastery: masteryStep(mastery, grade),
    ef: Math.round(newEf * 100) / 100,
    interval: newInterval,
    reps: newReps,
    dueDate: dueDate.toISOString().slice(0, 10),
  };
}

export function isDue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return true;
  const today = new Date().toISOString().slice(0, 10);
  return dueDate <= today;
}
