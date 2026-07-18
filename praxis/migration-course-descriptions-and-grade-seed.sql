-- Live-data update for the learner-experience batch. Two parts, both idempotent and safe to
-- re-run. TYPE this into the Railway Postgres Console (Synops DB) -- do not paste. Dollar
-- quoting ($d$...$d$) is used so the apostrophes in the descriptions need no escaping.
--
-- Part 1 mirrors the richer descriptions now in seed.ts onto the LIVE courses (seed.ts only
-- affects a fresh seed, never the running database).
-- Part 2 seeds realistic grades for Customer Service Excellence (course_cx) so the gradebook
-- and "My grades & progress" show real mastery instead of "Not enough data".

-- === Part 1: substantive course descriptions ===
UPDATE courses SET description = $d$Frontline service is where a brand is won or lost, and in South Africa that frontline spans many languages, wide differences in expectation, and customers who remember how they were treated. This course builds the practical skills to deliver service that keeps customers coming back: reading a customer's real need, communicating clearly across cultures and channels, and staying calm and effective when a conversation turns difficult. You will work through the LEAPS model for de-escalating complaints, practise service recovery on realistic scenarios, and learn to turn an unhappy customer into a loyal one. By the end you can handle in-person, phone and digital service with confidence, resolve conflict without losing the relationship, and represent your organisation the way it wants to be remembered.$d$ WHERE id = 'course_cx';

UPDATE courses SET description = $d$Most small businesses fail not for lack of a good idea but for lack of the fundamentals that keep the idea alive. This course gives you those fundamentals in the South African context: how to plan a venture, read and manage its finances, reach customers, run day-to-day operations, and lead the people who make it work. You will build a working business plan, interpret a simple cash-flow statement, and make the everyday trade-offs that decide whether a business grows or stalls. Grounded in local realities from informal trading to compliance and funding, it prepares you to start, run or manage a business on a solid footing rather than by guesswork.$d$ WHERE id = 'course_biz';

UPDATE courses SET description = $d$Money decisions made without understanding compound quietly into debt, missed opportunity and stress. This course builds the financial confidence every working person needs: how to budget honestly, borrow wisely, save with intent, and tell a good financial product from a costly one. You will analyse a real personal budget, work through the true cost of credit, and build simple habits that hold up under a tight month. Practical and jargon-free, it connects everyday choices, a store card, a loan, a stokvel, a payslip deduction, to their long-term effect, so you leave able to manage your own money and understand the numbers behind your workplace.$d$ WHERE id = 'course_finlit';

UPDATE courses SET description = $d$Digital fluency is now a baseline workplace skill, not a bonus. This course takes you from the everyday essentials of professional email, file management and safe passwords to the collaboration tools modern teams actually run on: shared documents, video meetings and cloud storage. You will practise the habits that mark a capable digital worker: writing clear messages, keeping work organised and findable, and staying safe online. By the end you move around the digital workplace with confidence rather than hesitation.$d$ WHERE id = 'course_digital';

-- === Part 2: seed grades for course_cx ===
-- Make sure every enrolled learner has an entry for every published assignment in the course.
-- gradebook_entries has no unique constraint, so guard with NOT EXISTS instead of ON CONFLICT.
INSERT INTO gradebook_entries (id, user_id, course_id, assignment_id, possible_score, missing)
SELECT gen_random_uuid()::text, e.user_id, a.course_id, a.id, a.points_possible, true
FROM enrolments e
JOIN assignments a ON a.course_id = e.course_id AND a.published = true
WHERE e.course_id = 'course_cx'
  AND NOT EXISTS (
    SELECT 1 FROM gradebook_entries g WHERE g.user_id = e.user_id AND g.assignment_id = a.id
  );

-- Set a stable, realistic score (68..92, capped at the assignment's possible score) on those
-- entries. The score is derived from a hash of (user_id, assignment_id), so re-running is
-- deterministic -- the same learner always gets the same mark rather than a new random one.
UPDATE gradebook_entries g
SET score = LEAST(
      g.possible_score,
      68 + (('x' || substr(md5(g.user_id || g.assignment_id), 1, 4))::bit(16)::int % 25)
    ),
    missing = false
FROM assignments a
WHERE g.assignment_id = a.id
  AND a.course_id = 'course_cx'
  AND a.published = true;

-- Verify: one row per learner/assignment with a score set.
SELECT count(*) AS graded_entries, round(avg(score), 1) AS avg_score
FROM gradebook_entries g
JOIN assignments a ON a.id = g.assignment_id
WHERE a.course_id = 'course_cx' AND g.score IS NOT NULL;
