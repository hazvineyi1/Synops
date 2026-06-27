/**
 * SM-2 spaced repetition algorithm
 * grade: 0-3 (from checkpoint grade)
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

  newEf = Math.max(1.3, ef + (0.1 - (3 - grade) * (0.08 + (3 - grade) * 0.02)));

  const newMastery = mastery * 0.6 + (grade / 3) * 0.4;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + newInterval);

  return {
    mastery: Math.min(1, Math.max(0, newMastery)),
    ef: newEf,
    interval: newInterval,
    reps: newReps,
    dueDate: dueDate.toISOString().slice(0, 10),
  };
}
