/**
 * SM-2 spaced-repetition algorithm (adapted).
 * grade: 0-3 (from a checkpoint grade).
 *   0 = no understanding, 1 = shaky, 2 = solid, 3 = mastery.
 * The learner never sees ef/interval/reps — they experience it as the
 * Coach knowing when to bring a concept back.
 */
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

  // Mastery moves toward a target set by the grade, but ASYMMETRICALLY: good answers pull it up
  // quickly while weaker ones only ease it down slowly, so earned progress is protected and a single
  // stumble never wipes it out. Consistent solid reasoning (grade 2) reaches ~0.78 (just short of
  // mastery), so reaching the 0.8 bar needs a clear, well-explained answer, which keeps it earned but
  // genuinely achievable rather than demoralising.
  const TARGET = [0, 0.45, 0.78, 1.0];
  const target = TARGET[Math.max(0, Math.min(3, Math.round(grade)))] ?? 0;
  const rate = target >= mastery ? 0.5 : 0.22; // learn fast, forget slowly
  const newMastery = mastery + (target - mastery) * rate;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + newInterval);

  return {
    mastery: Math.min(1, Math.max(0, newMastery)),
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
