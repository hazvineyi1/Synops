/**
 * Learner engagement as a whole-number percentage: distinct learners who hold at least one active
 * enrolment, over the total learner headcount.
 *
 * It must be derived from DISTINCT ACTIVE LEARNERS, never from raw active-enrolment counts. A single
 * learner can be enrolled in several courses, so active enrolments (e.g. 16) can exceed the learner
 * headcount (e.g. 7); feeding enrolments into this ratio produced 228%, which was then clamped to a
 * meaningless flat 100%. Passing distinct active learners keeps the result a real 0-100 figure.
 *
 * Guards: non-finite inputs or a zero/negative denominator return 0; the numerator is floored at 0
 * and the result is capped at 100 so a data drift where active > total can never render above 100%.
 */
export function computeEngagementRate(activeLearners: number, learners: number): number {
  if (!Number.isFinite(activeLearners) || !Number.isFinite(learners) || learners <= 0) return 0;
  const active = Math.max(0, activeLearners);
  return Math.min(100, Math.round((active / learners) * 100));
}
