import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Add the DB-level integrity constraints the app-level check-then-insert logic can't guarantee under
 * concurrency (the platform runs the same learner on web + WhatsApp, so races are real):
 *   - one gradebook entry per (assignment, user)      -> no drift / last-write nondeterminism
 *   - one VALID credential per (user, module)          -> no double credential
 *   - one funded-seat assignment per (agreement, learner) -> no double-count against a grant
 *
 * The schema is managed by CREATE-IF-NOT-EXISTS + ALTER heals (no migration runner), so we add the
 * indexes here. CREATE UNIQUE INDEX fails if duplicates already exist, so each is preceded by a
 * dedupe that keeps the newest row. Idempotent and cheap once clean (dedupe finds nothing, the
 * index already exists). Runs once at boot, fire-and-forget; never throws.
 */
export async function ensureIntegrityConstraints(): Promise<void> {
  const steps: Array<[string, ReturnType<typeof sql>[]]> = [
    // Soft-lifecycle columns for account archive / delete. Added here (not via a migration runner)
    // so every full-row select of users stays valid the instant the new schema deploys.
    ["users", [
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_at timestamptz`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz`,
      // Opt-in TOTP two-factor auth (additive; existing logins are unaffected until a user enrols).
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret text`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes text[] NOT NULL DEFAULT '{}'`,
      // POPIA consent state (latest accepted policy version + when). Additive; the
      // consent gate treats existing rows (null) as "needs to accept".
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_version text`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS consented_at timestamptz`,
    ]],
    // POPIA: append-only consent audit. The current state is denormalised onto
    // users; this is the durable record of every acceptance.
    ["consent_events", [
      sql`CREATE TABLE IF NOT EXISTS consent_events (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        app text NOT NULL DEFAULT 'praxis',
        policy_version text NOT NULL,
        consented_at timestamptz NOT NULL DEFAULT now(),
        ip text,
        user_agent text
      )`,
      sql`CREATE INDEX IF NOT EXISTS consent_events_user_idx ON consent_events (user_id)`,
    ]],
    // POPIA: data-subject erasure requests. Approved by a super admin; partner-org
    // learners are routed to the partner, not deleted here.
    ["deletion_requests", [
      sql`CREATE TABLE IF NOT EXISTS deletion_requests (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        app text NOT NULL DEFAULT 'praxis',
        status text NOT NULL DEFAULT 'pending',
        reason text,
        route_to_partner boolean NOT NULL DEFAULT false,
        partner_id text,
        requested_at timestamptz NOT NULL DEFAULT now(),
        decided_by text,
        decided_at timestamptz,
        retention_note text
      )`,
      sql`CREATE INDEX IF NOT EXISTS deletion_requests_status_idx ON deletion_requests (status)`,
    ]],
    // Localization: static translation cache + native-speaker review workflow. Each
    // (source_hash, lang) is translated once and served from cache; status gates whether
    // a machine draft or an approved translation is shown.
    ["content_translations", [
      sql`CREATE TABLE IF NOT EXISTS content_translations (
        id text PRIMARY KEY,
        source_hash text NOT NULL,
        lang text NOT NULL,
        source_text text NOT NULL,
        translated_text text NOT NULL,
        status text NOT NULL DEFAULT 'machine',
        content_type text NOT NULL DEFAULT 'general',
        reviewed_by text,
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS content_translations_key_uidx ON content_translations (source_hash, lang)`,
      sql`CREATE INDEX IF NOT EXISTS content_translations_status_idx ON content_translations (status, lang)`,
    ]],
    // Multi-factor auth: a user may enrol several factors and any one satisfies the challenge.
    // The old TOTP-only columns on users are backfilled into mfa_factors below (never dropped).
    ["mfa_factors", [
      sql`CREATE TABLE IF NOT EXISTS mfa_factors (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        type text NOT NULL,
        label text NOT NULL DEFAULT '',
        secret text,
        credential jsonb,
        phone text,
        email text,
        verified_at timestamptz,
        last_used_at timestamptz,
        preferred boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      sql`CREATE INDEX IF NOT EXISTS mfa_factors_user_idx ON mfa_factors (user_id)`,
    ]],
    ["mfa_backup_codes", [
      sql`CREATE TABLE IF NOT EXISTS mfa_backup_codes (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        code_hash text NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      sql`CREATE INDEX IF NOT EXISTS mfa_backup_codes_user_idx ON mfa_backup_codes (user_id)`,
    ]],
    ["mfa_challenges", [
      sql`CREATE TABLE IF NOT EXISTS mfa_challenges (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        purpose text NOT NULL,
        code_hash text,
        challenge text,
        destination text,
        expires_at timestamptz NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        consumed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      sql`CREATE INDEX IF NOT EXISTS mfa_challenges_user_purpose_idx ON mfa_challenges (user_id, purpose)`,
    ]],
    // Ops-agent anomaly feed: always-on monitoring flags problems here (one active row per kind).
    ["ops_anomalies", [
      sql`CREATE TABLE IF NOT EXISTS ops_anomalies (
        id text PRIMARY KEY,
        kind text NOT NULL,
        severity text NOT NULL DEFAULT 'warning',
        status text NOT NULL DEFAULT 'active',
        title text NOT NULL,
        detail text NOT NULL DEFAULT '',
        metadata jsonb,
        first_seen_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        resolved_at timestamptz
      )`,
      sql`CREATE INDEX IF NOT EXISTS ops_anomalies_status_idx ON ops_anomalies (status, last_seen_at)`,
    ]],
    // Seat-licensing: mark where a seat entitlement came from (B2B pool vs. future B2C purchase).
    ["billing_subscriptions", [
      sql`ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'b2b_pool'`,
    ]],
    // Prompt-template review gate: a template only shapes live AI tutoring once approved.
    ["org_prompt_templates", [
      sql`ALTER TABLE org_prompt_templates ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'`,
      sql`ALTER TABLE org_prompt_templates ADD COLUMN IF NOT EXISTS reviewed_by text`,
      sql`ALTER TABLE org_prompt_templates ADD COLUMN IF NOT EXISTS reviewed_at timestamptz`,
      sql`CREATE INDEX IF NOT EXISTS org_prompt_templates_org_status_idx ON org_prompt_templates (organisation_id, status)`,
    ]],
    // Per-item grade type (points | pass_fail | completion) for the configurable gradebook.
    ["gradebook_items", [
      sql`ALTER TABLE gradebook_items ADD COLUMN IF NOT EXISTS grade_type text NOT NULL DEFAULT 'points'`,
    ]],
    // Coach sessions: the learner-chosen interaction limit, why the session ended, and the cached
    // end-of-session analysis. All nullable/additive so existing live sessions are untouched.
    ["sessions", [
      sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS planned_interactions integer`,
      sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ended_reason text`,
      sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS analysis jsonb`,
    ]],
    // Per-organisation grading overrides (course default + org override).
    ["gradebook_org_overrides", [
      sql`CREATE TABLE IF NOT EXISTS gradebook_org_overrides (
        id text PRIMARY KEY,
        course_id text NOT NULL,
        org_id text NOT NULL,
        source_type text NOT NULL,
        source_id text,
        grade_type text,
        item_type text,
        points_possible numeric(7,2),
        include_in_grade boolean,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS gradebook_org_overrides_uidx ON gradebook_org_overrides (course_id, org_id, source_type, source_id)`,
    ]],
    // Performance indexes for the hottest lookups (gradebook matrix, org courses, class rosters,
    // partner rosters). Non-unique, CREATE IF NOT EXISTS — cheap once present, big win at scale.
    ["perf_indexes", [
      sql`CREATE INDEX IF NOT EXISTS enrolments_course_idx ON enrolments (course_id)`,
      sql`CREATE INDEX IF NOT EXISTS enrolments_user_idx ON enrolments (user_id)`,
      sql`CREATE INDEX IF NOT EXISTS gradebook_items_course_idx ON gradebook_items (course_id)`,
      sql`CREATE INDEX IF NOT EXISTS gradebook_cells_item_idx ON gradebook_cells (item_id)`,
      sql`CREATE INDEX IF NOT EXISTS org_class_courses_class_idx ON org_class_courses (class_id)`,
      sql`CREATE INDEX IF NOT EXISTS org_class_learners_class_idx ON org_class_learners (class_id)`,
      sql`CREATE INDEX IF NOT EXISTS org_classes_org_idx ON org_classes (org_id)`,
      sql`CREATE INDEX IF NOT EXISTS users_partner_idx ON users (partner_id)`,
      sql`CREATE INDEX IF NOT EXISTS users_organisation_idx ON users (organisation_id)`,
    ]],
    ["gradebook_entries", [
      sql`DELETE FROM gradebook_entries a USING gradebook_entries b
          WHERE a.assignment_id = b.assignment_id AND a.user_id = b.user_id AND a.ctid < b.ctid`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS gradebook_entries_assignment_user_uidx
          ON gradebook_entries (assignment_id, user_id)`,
    ]],
    // Dedupe older valid credentials so the partial unique index below can be built. Two real bugs
    // lived here and silently broke credential issuance: (1) the column is credential_status, not
    // `status` (the Drizzle property name), so the query raised "column status does not exist"; and
    // (2) the demotion value 'superseded' is not in the credential_status enum (valid|expired|revoked),
    // so it raised "invalid input value for enum". Either error threw on this statement and, when it
    // shared a step with the CREATE INDEX, skipped the index entirely - so on a fresh production DB
    // the partial unique index never existed, which is exactly what made issueCredential's old
    // arbiter-named ON CONFLICT raise 42P10 and roll back the checkpoint. Demote to 'expired' (a real
    // enum value) and keep the index in its OWN step so it is created even if this dedupe ever fails.
    ["credentials_dedupe", [
      sql`UPDATE credentials c SET credential_status = 'expired'
          WHERE credential_status = 'valid' AND EXISTS (
            SELECT 1 FROM credentials c2
            WHERE c2.user_id = c.user_id AND c2.module_id = c.module_id
              AND c2.credential_status = 'valid' AND c2.issued_at > c.issued_at)`,
    ]],
    ["credentials_valid_uidx", [
      sql`CREATE UNIQUE INDEX IF NOT EXISTS credentials_user_module_valid_uidx
          ON credentials (user_id, module_id) WHERE credential_status = 'valid'`,
    ]],
    ["funded_seat_assignments", [
      sql`DELETE FROM funded_seat_assignments a USING funded_seat_assignments b
          WHERE a.agreement_id = b.agreement_id AND a.learner_id = b.learner_id AND a.ctid < b.ctid`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS funded_seat_agreement_learner_uidx
          ON funded_seat_assignments (agreement_id, learner_id)`,
    ]],
  ];

  for (const [table, stmts] of steps) {
    try {
      for (const s of stmts) await db.execute(s);
    } catch (err) {
      // A missing table (not yet created) or an odd column is fine — skip and keep the others.
      logger.warn({ err, table }, "integrity-constraint heal skipped");
    }
  }

  await backfillMfaFactors();
}

/**
 * Migrate existing inline TOTP enrolments (users.mfa_secret / mfa_backup_codes) into the new
 * mfa_factors / mfa_backup_codes tables, once. Purely additive and idempotent - it only inserts a
 * row when the user has no totp factor yet, so re-running does nothing and no existing authenticator
 * user is ever broken. The users.mfa_* columns are left in place as the compatibility mirror.
 */
async function backfillMfaFactors(): Promise<void> {
  try {
    // One totp factor per enrolled user who does not already have one.
    await db.execute(sql`
      INSERT INTO mfa_factors (id, user_id, type, label, secret, verified_at, created_at)
      SELECT gen_random_uuid()::text, u.id, 'totp', 'Authenticator app', u.mfa_secret, now(), now()
      FROM users u
      WHERE u.mfa_enabled = true AND u.mfa_secret IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM mfa_factors f WHERE f.user_id = u.id AND f.type = 'totp')`);
    // Backup-code hashes from the users array into the backup-codes table, once per user.
    await db.execute(sql`
      INSERT INTO mfa_backup_codes (id, user_id, code_hash, created_at)
      SELECT gen_random_uuid()::text, u.id, ch, now()
      FROM users u, unnest(u.mfa_backup_codes) AS ch
      WHERE u.mfa_enabled = true
        AND NOT EXISTS (SELECT 1 FROM mfa_backup_codes b WHERE b.user_id = u.id)`);
  } catch (err) {
    logger.warn({ err }, "mfa backfill skipped");
  }
}
