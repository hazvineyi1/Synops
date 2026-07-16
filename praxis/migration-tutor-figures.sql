-- Reusable tutor "figures" library: photorealistic (or any) faces an instructional
-- designer uploads once, names, and reuses across cases; deletable. organisation_id NULL =
-- shared platform library (Hub authors); otherwise scoped to the author's org/partner.
-- The image is stored as a resized data URL (or an https URL). Additive + idempotent.

CREATE TABLE IF NOT EXISTS tutor_figures (
  id              text PRIMARY KEY,
  organisation_id text,
  created_by      text NOT NULL,
  name            text NOT NULL,
  image           text NOT NULL,
  gender          text,
  created_at      timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tutor_figures_org_idx ON tutor_figures (organisation_id);
