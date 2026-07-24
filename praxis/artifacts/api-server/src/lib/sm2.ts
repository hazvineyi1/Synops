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

  // Mastery moves toward a target set by the grade. NON-PUNITIVE INVARIANT: a weak or incorrect
  // answer never DECREASES the mastery percentage - it can only award progress (a strong answer) or
  // award nothing (a weak one), never a negative delta. So we move toward the target only when that
  // target is above where the learner already is, and otherwise hold steady. This keeps every point
  // of progress earned-and-kept: a single stumble can never wipe out ground the learner has won, and
  // the meter the learner watches only ever holds or climbs. (The spaced-repetition scheduling above
  // still reacts to a weak answer - reps/interval reset so the concept comes back sooner - so the
  // tutoring cadence is unchanged; only the visible mastery score is protected from decreasing.)
  // Grade 2 (solid, including a correct multiple-choice pick) tops out at 0.85 so mastery CAN cross
  // the 0.8 bar with a few good turns rather than walling just below it; grade 3 reaches full mastery.
  const TARGET = [0, 0.5, 0.85, 1.0];
  const target = TARGET[Math.max(0, Math.min(3, Math.round(grade)))] ?? 0;
  // Only climb toward a higher target; a lower target contributes 0 (never a subtraction). The step
  // is capped at MAX_MASTERY_STEP so the meter climbs in measured intervals the learner can feel,
  // rather than leaping most of the way on one strong answer.
  const gained = target > mastery ? Math.min((target - mastery) * 0.5, MAX_MASTERY_STEP) : 0;
  const newMastery = mastery + gained;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + newInterval);

  return {
    // max(mastery, ...) is belt-and-braces: the score is guaranteed to never fall below where it was.
    mastery: Math.min(1, Math.max(mastery, newMastery)),
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
