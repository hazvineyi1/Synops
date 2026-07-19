-- Learning Hub persistence: content library, course templates, course->partner assignments.
-- Run ONCE against the Praxis Postgres. Additive and idempotent (IF NOT EXISTS), safe to re-run.

CREATE TABLE IF NOT EXISTS learning_content (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title        text NOT NULL,
  kind         text NOT NULL,
  meta         text,
  url          text,
  storage_path text,
  tags         text,
  reviewed     boolean NOT NULL DEFAULT false,
  added_by     text NOT NULL,
  created_at   timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_templates (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title       text NOT NULL,
  level       text NOT NULL,
  modality    text NOT NULL,
  modules     integer NOT NULL DEFAULT 1,
  hours       integer NOT NULL DEFAULT 1,
  standard    text,
  description text,
  kind        text NOT NULL DEFAULT 'course',
  created_at  timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_assignments (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  course_id   text NOT NULL,
  partner_id  text NOT NULL,
  assigned_by text,
  assigned_at timestamp NOT NULL DEFAULT now()
);

-- Prevent duplicate grants of the same course to the same partner.
CREATE UNIQUE INDEX IF NOT EXISTS course_assignments_course_partner_uq
  ON course_assignments (course_id, partner_id);

-- ── Seed starting templates / content / assignments (idempotent) ──────────────
INSERT INTO course_templates (id, title, level, modality, modules, hours, standard, description, kind) VALUES
  ('tpl_cs',  'Customer Service Excellence',    'Foundational', 'Hybrid',    6, 24, 'Services SETA US 252210', 'Frontline service skills, complaint handling and service recovery.', 'course'),
  ('tpl_ds',  'Digital Skills Foundations',     'Foundational', 'Online',    8, 32, 'MICT SETA - NQF 3',       'Core computer, internet and productivity skills for the workplace.',  'course'),
  ('tpl_ll',  'Team Leadership',                'Intermediate', 'Hybrid',    5, 20, 'Services SETA - NQF 5',   'Supervisory leadership, delegation and performance conversations.',   'course'),
  ('tpl_fl',  'Financial Literacy at Work',     'Foundational', 'Online',    4, 12, 'BANKSETA - NQF 4',        'Budgeting, credit, and workplace financial decision-making.',         'course'),
  ('tpl_ohs', 'Occupational Health & Safety',   'Foundational', 'In-person', 4, 16, 'OHS Act 85 of 1993',      'Workplace hazard identification, PPE and incident reporting.',        'course'),
  ('tpl_lesson_bloom', 'Lesson template: Bloom-aligned module', 'Intermediate', 'Online', 1, 2, 'Bloom Taxonomy', 'Reusable module scaffold: objectives, formative check, application task.', 'lesson')
ON CONFLICT (id) DO NOTHING;

INSERT INTO course_assignments (id, course_id, partner_id, assigned_by) VALUES
  ('ca_seed_1', 'tpl_cs',  'partner_talentforge', 'Seed'),
  ('ca_seed_2', 'tpl_ds',  'partner_talentforge', 'Seed'),
  ('ca_seed_3', 'tpl_ohs', 'partner_skillbridge', 'Seed')
ON CONFLICT (course_id, partner_id) DO NOTHING;

INSERT INTO learning_content (id, title, kind, meta, url, tags, reviewed, added_by) VALUES
  ('ct_v1', 'Traditional vs Digital Marketing (source lecture)', 'video',    '04:22 - 148 MB', NULL, 'marketing,lecture',   true,  'Instructional Design'),
  ('ct_v2', 'Customer Service Role-play Walkthrough',            'video',    '11:38 - 402 MB', NULL, 'customer-service',    false, 'Instructional Design'),
  ('ct_d1', 'Financial Literacy Workbook',                        'document', 'PDF - 2.1 MB',   NULL, 'finance,workbook',    true,  'Instructional Design'),
  ('ct_d2', 'OHS Compliance Checklist',                           'document', 'DOCX - 340 KB',  NULL, 'safety,compliance',   true,  'Instructional Design'),
  ('ct_l1', 'SETA Unit Standard 114974 reference',                'link',     'saqa.org.za',    'https://www.saqa.org.za', 'seta,reference', true, 'Instructional Design')
ON CONFLICT (id) DO NOTHING;
