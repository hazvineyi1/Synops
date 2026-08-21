import { Router } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/requireAuth";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { MUTALE_PERSONA, MUTALE_CONSTRAINTS } from "../lib/mrbCoach";
import { uploadObject, storageEnabled } from "../lib/supabaseStorage";

/**
 * Practice Credentials engine (MRB executive programme, "Option 5" blended action-learning system).
 *
 * This is deliberately NOT a content LMS. A Practice Credential runs the reverse of a course:
 *   experience -> reflection makes learning visible -> theory names it -> evidence demonstrates it ->
 *   a human reviewer recognises it.
 * So the model is credential-first and reflection-first, never module/lesson/assessment. Candidates
 * choose credentials, justify and sequence them, capture reflection over time (Gibbs), collect
 * evidence, self-check against the gateway (G1/G2/G3), and submit a portfolio to an INDEPENDENT
 * reviewer who returns developmental feedback with a "reviewed" or "referred for resubmission"
 * outcome. No pass/fail, no percentages.
 *
 * Tables are created via POST /practice/_migrate (raw SQL) because the shared @workspace/db schema is
 * not editable from here (same approach as the Learning Hub). All queries are raw SQL via db.execute.
 */

const router = Router();

export const PRACTICE_DDL = `
CREATE TABLE IF NOT EXISTS practice_credentials (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  partner_id text NOT NULL,
  code text NOT NULL,
  title text NOT NULL,
  summary text,
  activity_brief text,
  gateway_guidance text,
  example_assignment text,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS practice_credentials_partner_code_uq ON practice_credentials (partner_id, code);

CREATE TABLE IF NOT EXISTS candidate_credentials (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  candidate_id text NOT NULL,
  credential_id text NOT NULL,
  partner_id text NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  justification text,
  status text NOT NULL DEFAULT 'chosen',
  self_g1 boolean NOT NULL DEFAULT false,
  self_g2 boolean NOT NULL DEFAULT false,
  self_g3 boolean NOT NULL DEFAULT false,
  sequence_locked boolean NOT NULL DEFAULT false,
  reviewer_id text,
  submitted_at timestamp,
  reviewed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS candidate_credentials_uq ON candidate_credentials (candidate_id, credential_id);

CREATE TABLE IF NOT EXISTS reflection_entries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  candidate_credential_id text NOT NULL,
  stage text NOT NULL DEFAULT 'note',
  content text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now());
-- Authenticity provenance: how each reflection was actually captured, so a reviewer can trust that a
-- person did the thinking (typed live, over time) rather than pasting generated text in one sitting.
ALTER TABLE reflection_entries ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE reflection_entries ADD COLUMN IF NOT EXISTS typed_ms integer;
ALTER TABLE reflection_entries ADD COLUMN IF NOT EXISTS paste_count integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS evidence_items (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  candidate_credential_id text NOT NULL,
  kind text NOT NULL DEFAULT 'text',
  title text,
  body text,
  url text,
  created_at timestamp NOT NULL DEFAULT now());
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS file_data text;
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS file_type text;

-- Third-party attestation: a manager/peer/report confirms, via a magic link, that the real-world
-- leadership event genuinely happened and the candidate genuinely did it. The strongest anti-fake
-- signal, because it comes from outside the candidate's own account.
CREATE TABLE IF NOT EXISTS attestations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  candidate_credential_id text NOT NULL,
  token text NOT NULL,
  relationship text,
  prompt text,
  attester_name text,
  status text NOT NULL DEFAULT 'pending',
  response_name text,
  response_role text,
  response_comment text,
  responded_at timestamp,
  created_at timestamp NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS attestations_token_idx ON attestations(token);

CREATE TABLE IF NOT EXISTS credential_reviews (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  candidate_credential_id text NOT NULL,
  reviewer_id text NOT NULL,
  g1 boolean NOT NULL DEFAULT false,
  g2 boolean NOT NULL DEFAULT false,
  g3 boolean NOT NULL DEFAULT false,
  outcome text NOT NULL DEFAULT 'reviewed',
  feedback text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now());
-- Inter-rater reliability: a calibration review is a second, blind opinion on an already-reviewed
-- portfolio. It never changes the candidate's outcome; it only measures whether reviewers agree.
ALTER TABLE credential_reviews ADD COLUMN IF NOT EXISTS calibration boolean NOT NULL DEFAULT false;

-- Reviewer certification: a gold-standard set of portfolios with an expert reference verdict. A
-- reviewer scores each blind, and must agree closely with the reference before reviewing live.
CREATE TABLE IF NOT EXISTS cert_items (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  candidate_credential_id text NOT NULL,
  ref_g1 boolean NOT NULL DEFAULT false,
  ref_g2 boolean NOT NULL DEFAULT false,
  ref_g3 boolean NOT NULL DEFAULT false,
  ref_outcome text NOT NULL DEFAULT 'reviewed',
  note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS cert_attempts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  reviewer_id text NOT NULL,
  item_id text NOT NULL,
  g1 boolean NOT NULL DEFAULT false,
  g2 boolean NOT NULL DEFAULT false,
  g3 boolean NOT NULL DEFAULT false,
  outcome text NOT NULL DEFAULT 'reviewed',
  agree_count integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now());
`;

/** Rows helper: db.execute over a raw/parameterised sql template returns { rows }. */
async function rows<T = any>(q: any): Promise<T[]> {
  const r: any = await db.execute(q);
  return (r?.rows ?? []) as T[];
}

/** The partner a user belongs to: their own partnerId, else their organisation's partner. */
async function partnerOf(req: any): Promise<string | null> {
  const u = req.dbUser;
  if (u?.partnerId) return u.partnerId;
  const r = await rows<{ partner_id: string }>(sql`
    SELECT partner_id FROM organisations WHERE id = ${u?.organisationId ?? ""} LIMIT 1`);
  return r[0]?.partner_id ?? null;
}

const isStaff = (req: any) =>
  ["super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"].includes(req.dbUser?.role);

// One-time schema bootstrap (super admin). Safe to re-run.
router.post("/practice/_migrate", requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    await db.execute(sql.raw(PRACTICE_DDL));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Migration failed" });
  }
});

// ── Credential catalogue ──────────────────────────────────────────────────────
// GET /practice/credentials -- the credentials offered to this candidate's partner programme.
router.get("/practice/credentials", requireAuth, async (req, res) => {
  const pid = (typeof req.query.partnerId === "string" && req.query.partnerId && isStaff(req))
    ? req.query.partnerId
    : await partnerOf(req);
  if (!pid) { res.json([]); return; }
  const list = await rows(sql`
    SELECT id, code, title, summary, activity_brief, gateway_guidance, example_assignment, sort
    FROM practice_credentials WHERE partner_id = ${pid} ORDER BY sort, title`);
  res.json(list);
});

// ── Candidate credentials (chosen, justified, sequenced) ──────────────────────
// GET /practice/me -- the candidate's chosen credentials with progress + any returned feedback.
router.get("/practice/me", requireAuth, async (req, res) => {
  const uid = req.userId!;
  const list = await rows(sql`
    SELECT cc.*, pc.code, pc.title, pc.summary, pc.activity_brief, pc.gateway_guidance, pc.example_assignment,
      (SELECT count(*)::int FROM reflection_entries r WHERE r.candidate_credential_id = cc.id) AS reflection_count,
      (SELECT count(*)::int FROM evidence_items e WHERE e.candidate_credential_id = cc.id) AS evidence_count,
      (SELECT COALESCE(json_object_agg(stage, c), '{}'::json) FROM (SELECT stage, count(*)::int c FROM reflection_entries WHERE candidate_credential_id = cc.id GROUP BY stage) s) AS stage_counts,
      (SELECT feedback FROM credential_reviews cr WHERE cr.candidate_credential_id = cc.id ORDER BY cr.created_at DESC LIMIT 1) AS latest_feedback,
      (SELECT outcome FROM credential_reviews cr WHERE cr.candidate_credential_id = cc.id ORDER BY cr.created_at DESC LIMIT 1) AS latest_outcome
    FROM candidate_credentials cc
    JOIN practice_credentials pc ON pc.id = cc.credential_id
    WHERE cc.candidate_id = ${uid}
    ORDER BY cc.sort, cc.created_at`);
  res.json(list);
});

// POST /practice/me/credentials -- choose a credential (with justification + order).
router.post("/practice/me/credentials", requireAuth, async (req, res) => {
  const uid = req.userId!;
  const { credentialId, justification, sort } = req.body ?? {};
  if (!credentialId) { res.status(400).json({ error: "credentialId is required" }); return; }
  const cred = await rows<{ partner_id: string }>(sql`SELECT partner_id FROM practice_credentials WHERE id = ${credentialId} LIMIT 1`);
  if (!cred[0]) { res.status(404).json({ error: "Credential not found" }); return; }
  const inserted = await rows(sql`
    INSERT INTO candidate_credentials (candidate_id, credential_id, partner_id, sort, justification, status)
    VALUES (${uid}, ${credentialId}, ${cred[0].partner_id}, ${Number(sort) || 0}, ${justification ?? null}, 'chosen')
    ON CONFLICT (candidate_id, credential_id) DO UPDATE SET justification = EXCLUDED.justification, sort = EXCLUDED.sort, updated_at = now()
    RETURNING *`);
  res.status(201).json(inserted[0]);
});

// PATCH /practice/me/credentials/:id -- reorder / justify / self-check / lock. The candidate can
// reorder freely until they lock (they lock after settling their first two, per programme rule).
router.patch("/practice/me/credentials/:id", requireAuth, async (req, res) => {
  const uid = req.userId!;
  const own = await rows<{ id: string; sequence_locked: boolean }>(sql`
    SELECT id, sequence_locked FROM candidate_credentials WHERE id = ${req.params.id} AND candidate_id = ${uid} LIMIT 1`);
  if (!own[0]) { res.status(404).json({ error: "Not found" }); return; }
  const { sort, justification, selfG1, selfG2, selfG3, lockSequence, start } = req.body ?? {};
  await db.execute(sql`
    UPDATE candidate_credentials SET
      sort = COALESCE(${sort ?? null}, sort),
      justification = COALESCE(${justification ?? null}, justification),
      self_g1 = COALESCE(${typeof selfG1 === "boolean" ? selfG1 : null}, self_g1),
      self_g2 = COALESCE(${typeof selfG2 === "boolean" ? selfG2 : null}, self_g2),
      self_g3 = COALESCE(${typeof selfG3 === "boolean" ? selfG3 : null}, self_g3),
      sequence_locked = COALESCE(${lockSequence === true ? true : null}, sequence_locked),
      status = CASE WHEN ${start === true} AND status = 'chosen' THEN 'in_progress' ELSE status END,
      updated_at = now()
    WHERE id = ${req.params.id} AND candidate_id = ${uid}`);
  const upd = await rows(sql`SELECT * FROM candidate_credentials WHERE id = ${req.params.id}`);
  res.json(upd[0]);
});

// ── Reflection entries (Gibbs, captured over time and in bits) ─────────────────
router.get("/practice/me/credentials/:id/reflections", requireAuth, async (req, res) => {
  const uid = req.userId!;
  const own = await rows(sql`SELECT id FROM candidate_credentials WHERE id = ${req.params.id} AND candidate_id = ${uid} LIMIT 1`);
  if (!own[0]) { res.status(404).json({ error: "Not found" }); return; }
  const list = await rows(sql`SELECT id, stage, content, created_at FROM reflection_entries WHERE candidate_credential_id = ${req.params.id} ORDER BY created_at`);
  res.json(list);
});
router.post("/practice/me/credentials/:id/reflections", requireAuth, async (req, res) => {
  const uid = req.userId!;
  const own = await rows(sql`SELECT id FROM candidate_credentials WHERE id = ${req.params.id} AND candidate_id = ${uid} LIMIT 1`);
  if (!own[0]) { res.status(404).json({ error: "Not found" }); return; }
  const { stage, content, source, typedMs, pasteCount } = req.body ?? {};
  if (!content || !String(content).trim()) { res.status(400).json({ error: "content is required" }); return; }
  // Provenance is a best-effort trust signal, never a gate: 'typed' (live, in-app), 'pasted', or null.
  const src = source === "pasted" || source === "typed" || source === "whatsapp" ? source : null;
  const tms = Number.isFinite(Number(typedMs)) ? Math.max(0, Math.min(3_600_000, Math.round(Number(typedMs)))) : null;
  const pc = Number.isFinite(Number(pasteCount)) ? Math.max(0, Math.min(999, Math.round(Number(pasteCount)))) : 0;
  const ins = await rows(sql`
    INSERT INTO reflection_entries (candidate_credential_id, stage, content, source, typed_ms, paste_count)
    VALUES (${req.params.id}, ${stage || "note"}, ${String(content).slice(0, 8000)}, ${src}, ${tms}, ${pc}) RETURNING *`);
  res.status(201).json(ins[0]);
});

// ── Attestation (third-party corroboration via magic link) ─────────────────────
// The candidate creates a request and shares the link with a real witness themselves (WhatsApp,
// email, in person). We do not send anything on the candidate's behalf.
router.get("/practice/me/credentials/:id/attestations", requireAuth, async (req, res) => {
  const uid = req.userId!;
  const own = await rows(sql`SELECT id FROM candidate_credentials WHERE id = ${req.params.id} AND candidate_id = ${uid} LIMIT 1`);
  if (!own[0]) { res.status(404).json({ error: "Not found" }); return; }
  const list = await rows(sql`SELECT id, token, relationship, prompt, attester_name, status, response_name, response_role, response_comment, responded_at, created_at FROM attestations WHERE candidate_credential_id = ${req.params.id} ORDER BY created_at DESC`);
  res.json(list);
});

router.post("/practice/me/credentials/:id/attestations", requireAuth, async (req, res) => {
  const uid = req.userId!;
  const own = await rows(sql`SELECT id FROM candidate_credentials WHERE id = ${req.params.id} AND candidate_id = ${uid} LIMIT 1`);
  if (!own[0]) { res.status(404).json({ error: "Not found" }); return; }
  const { relationship, prompt, attesterName } = req.body ?? {};
  if (!prompt || !String(prompt).trim()) { res.status(400).json({ error: "prompt is required" }); return; }
  const rel = ["manager", "peer", "report", "other"].includes(relationship) ? relationship : "other";
  const token = randomBytes(24).toString("hex");
  const ins = await rows(sql`
    INSERT INTO attestations (candidate_credential_id, token, relationship, prompt, attester_name)
    VALUES (${req.params.id}, ${token}, ${rel}, ${String(prompt).slice(0, 1000)}, ${attesterName ? String(attesterName).slice(0, 200) : null})
    RETURNING id, token, relationship, prompt, attester_name, status, created_at`);
  res.status(201).json(ins[0]);
});

router.delete("/practice/me/attestations/:aid", requireAuth, async (req, res) => {
  const uid = req.userId!;
  const own = await rows(sql`
    SELECT a.id FROM attestations a JOIN candidate_credentials cc ON cc.id = a.candidate_credential_id
    WHERE a.id = ${req.params.aid} AND cc.candidate_id = ${uid} LIMIT 1`);
  if (!own[0]) { res.status(404).json({ error: "Not found" }); return; }
  await db.execute(sql`DELETE FROM attestations WHERE id = ${req.params.aid}`);
  res.json({ ok: true });
});

// PUBLIC (no auth): the witness opens their magic link and sees only who is asking, and for what.
router.get("/practice/attest/:token", async (req, res) => {
  const found = await rows(sql`
    SELECT a.relationship, a.prompt, a.status, a.response_name, a.response_role, a.response_comment, a.responded_at,
      pc.title AS credential_title, u.first_name AS candidate_first_name
    FROM attestations a
    JOIN candidate_credentials cc ON cc.id = a.candidate_credential_id
    JOIN practice_credentials pc ON pc.id = cc.credential_id
    JOIN users u ON u.id = cc.candidate_id
    WHERE a.token = ${req.params.token} LIMIT 1`);
  if (!found[0]) { res.status(404).json({ error: "This attestation link is not valid." }); return; }
  res.json(found[0]);
});

// PUBLIC (no auth): the witness confirms or declines. One response only.
router.post("/practice/attest/:token", async (req, res) => {
  const found = await rows<{ id: string; status: string }>(sql`SELECT id, status FROM attestations WHERE token = ${req.params.token} LIMIT 1`);
  if (!found[0]) { res.status(404).json({ error: "This attestation link is not valid." }); return; }
  if (found[0].status !== "pending") { res.status(409).json({ error: "This attestation has already been answered." }); return; }
  const { name, role, comment, decision } = req.body ?? {};
  const status = decision === "confirm" ? "confirmed" : decision === "decline" ? "declined" : null;
  if (!status) { res.status(400).json({ error: "decision must be confirm or decline" }); return; }
  if (!name || !String(name).trim()) { res.status(400).json({ error: "Please enter your name." }); return; }
  await db.execute(sql`
    UPDATE attestations SET status = ${status}, response_name = ${String(name).slice(0, 200)},
      response_role = ${role ? String(role).slice(0, 200) : null}, response_comment = ${comment ? String(comment).slice(0, 2000) : null},
      responded_at = now() WHERE token = ${req.params.token}`);
  res.json({ ok: true, status });
});

// ── Evidence items ─────────────────────────────────────────────────────────────
router.get("/practice/me/credentials/:id/evidence", requireAuth, async (req, res) => {
  const uid = req.userId!;
  const own = await rows(sql`SELECT id FROM candidate_credentials WHERE id = ${req.params.id} AND candidate_id = ${uid} LIMIT 1`);
  if (!own[0]) { res.status(404).json({ error: "Not found" }); return; }
  const list = await rows(sql`SELECT id, kind, title, body, url, created_at FROM evidence_items WHERE candidate_credential_id = ${req.params.id} ORDER BY created_at`);
  res.json(list);
});
router.post("/practice/me/credentials/:id/evidence", requireAuth, async (req, res) => {
  const uid = req.userId!;
  const own = await rows(sql`SELECT id FROM candidate_credentials WHERE id = ${req.params.id} AND candidate_id = ${uid} LIMIT 1`);
  if (!own[0]) { res.status(404).json({ error: "Not found" }); return; }
  const { kind, title, body, url } = req.body ?? {};
  const ins = await rows(sql`
    INSERT INTO evidence_items (candidate_credential_id, kind, title, body, url)
    VALUES (${req.params.id}, ${kind || "text"}, ${title ?? null}, ${body ? String(body).slice(0, 8000) : null}, ${url ?? null}) RETURNING *`);
  res.status(201).json(ins[0]);
});
router.delete("/practice/me/evidence/:evidenceId", requireAuth, async (req, res) => {
  const uid = req.userId!;
  await db.execute(sql`
    DELETE FROM evidence_items WHERE id = ${req.params.evidenceId}
      AND candidate_credential_id IN (SELECT id FROM candidate_credentials WHERE candidate_id = ${uid})`);
  res.status(204).send();
});

const EVIDENCE_MAX_BYTES = 20 * 1024 * 1024;
const guessType = (name: string) => {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const map: Record<string, string> = {
    pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", heic: "image/heic", mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", txt: "text/plain",
  };
  return map[ext] ?? "application/octet-stream";
};

// Files small enough to keep inline in the database (base64). Supabase, when configured, takes
// larger files; this keeps uploads working with zero external setup for the common case (photos of
// documents, short voice notes, PDFs).
const EVIDENCE_DB_MAX_BYTES = 5 * 1024 * 1024;

// POST /practice/me/credentials/:id/evidence/upload -- attach a file (document, photo of your work,
// a voice note) as evidence. Low-data friendly: the candidate can prepare offline and upload once.
// Uses Supabase Storage if configured, otherwise stores the file in the database (up to 5MB).
router.post("/practice/me/credentials/:id/evidence/upload", requireAuth, async (req, res) => {
  const uid = req.userId!;
  const own = await rows(sql`SELECT id FROM candidate_credentials WHERE id = ${req.params.id} AND candidate_id = ${uid} LIMIT 1`);
  if (!own[0]) { res.status(404).json({ error: "Not found" }); return; }
  const { filename, dataBase64, title } = req.body ?? {};
  if (!filename || !dataBase64) { res.status(400).json({ error: "filename and dataBase64 are required" }); return; }
  const buf = Buffer.from(dataBase64, "base64");
  const sizeNote = `${(buf.length / 1024 / 1024).toFixed(1)} MB`;
  const type = guessType(String(filename));
  try {
    if (storageEnabled()) {
      if (buf.length > EVIDENCE_MAX_BYTES) { res.status(400).json({ error: "That file is too large (20MB maximum). Use a link for anything bigger." }); return; }
      const safe = String(filename).replace(/[^A-Za-z0-9._-]/g, "_");
      const { url } = await uploadObject(`practice-evidence/${uid}/${Date.now()}-${safe}`, buf, type);
      const ins = await rows(sql`
        INSERT INTO evidence_items (candidate_credential_id, kind, title, body, url) VALUES (${req.params.id}, 'file', ${title || filename}, ${sizeNote}, ${url}) RETURNING *`);
      res.status(201).json(ins[0]);
      return;
    }
    // Database fallback (no Supabase configured): keep the file inline, served by the download route.
    if (buf.length > EVIDENCE_DB_MAX_BYTES) { res.status(400).json({ error: "That file is too large (5MB maximum here). Use a link for anything bigger." }); return; }
    const ins = await rows<{ id: string }>(sql`
      INSERT INTO evidence_items (candidate_credential_id, kind, title, body, file_data, file_type)
      VALUES (${req.params.id}, 'file', ${title || filename}, ${sizeNote}, ${dataBase64}, ${type}) RETURNING id`);
    const newId = ins[0]?.id;
    await db.execute(sql`UPDATE evidence_items SET url = ${`/api/practice/evidence/${newId}/download`} WHERE id = ${newId}`);
    const full = await rows(sql`SELECT id, kind, title, body, url, created_at FROM evidence_items WHERE id = ${newId}`);
    res.status(201).json(full[0]);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
});

// GET /practice/evidence/:id/download -- stream a database-stored evidence file. The owning candidate
// or any staff reviewer may fetch it. Served as a direct link (cookie auth), so it downloads inline.
router.get("/practice/evidence/:id/download", requireAuth, async (req, res) => {
  const uid = req.userId!;
  const row = await rows<{ title: string | null; file_data: string | null; file_type: string | null; candidate_id: string }>(sql`
    SELECT e.title, e.file_data, e.file_type, cc.candidate_id
    FROM evidence_items e JOIN candidate_credentials cc ON cc.id = e.candidate_credential_id
    WHERE e.id = ${req.params.id} LIMIT 1`);
  const r = row[0];
  if (!r || !r.file_data) { res.status(404).json({ error: "Not found" }); return; }
  if (r.candidate_id !== uid && !isStaff(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const buf = Buffer.from(r.file_data, "base64");
  res.setHeader("Content-Type", r.file_type || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${(r.title || "evidence").replace(/[^A-Za-z0-9._-]/g, "_")}"`);
  res.send(buf);
});

// POST /practice/me/credentials/:id/submit -- send the portfolio to an independent reviewer's queue.
router.post("/practice/me/credentials/:id/submit", requireAuth, async (req, res) => {
  const uid = req.userId!;
  const own = await rows<{ id: string; partner_id: string; reviewer_id: string | null }>(sql`
    SELECT id, partner_id, reviewer_id FROM candidate_credentials WHERE id = ${req.params.id} AND candidate_id = ${uid} LIMIT 1`);
  if (!own[0]) { res.status(404).json({ error: "Not found" }); return; }
  // Assign to the partner's reviewer with the smallest current queue (<=16), keeping any prior reviewer.
  let reviewerId = own[0].reviewer_id;
  if (!reviewerId) {
    const r = await rows<{ id: string }>(sql`
      SELECT u.id,
        (SELECT count(*)::int FROM candidate_credentials q WHERE q.reviewer_id = u.id AND q.status = 'submitted') AS load
      FROM users u
      WHERE u.role = 'coach' AND u.organisation_id IN (SELECT id FROM organisations WHERE partner_id = ${own[0].partner_id})
      ORDER BY load ASC LIMIT 1`);
    reviewerId = r[0]?.id ?? null;
  }
  await db.execute(sql`
    UPDATE candidate_credentials SET status = 'submitted', reviewer_id = ${reviewerId}, submitted_at = now(), updated_at = now()
    WHERE id = ${req.params.id} AND candidate_id = ${uid}`);
  res.json({ ok: true, assigned: !!reviewerId });
});

// ── Reviewer (independent of tutors): queue, one portfolio, developmental feedback ────────────────
// GET /practice/queue -- this reviewer's queue (<=16), or all submitted for a super admin.
router.get("/practice/queue", requireAuth, async (req, res) => {
  if (!isStaff(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const uid = req.userId!;
  const mine = req.dbUser?.role === "super_admin"
    ? sql`cc.status = 'submitted'`
    : sql`cc.status = 'submitted' AND cc.reviewer_id = ${uid}`;
  const list = await rows(sql`
    SELECT cc.id, cc.candidate_id, cc.submitted_at, pc.code, pc.title,
      u.first_name, u.last_name, u.email,
      (SELECT count(*)::int FROM reflection_entries r WHERE r.candidate_credential_id = cc.id) AS reflection_count,
      (SELECT count(*)::int FROM evidence_items e WHERE e.candidate_credential_id = cc.id) AS evidence_count
    FROM candidate_credentials cc
    JOIN practice_credentials pc ON pc.id = cc.credential_id
    JOIN users u ON u.id = cc.candidate_id
    WHERE ${mine}
    ORDER BY cc.submitted_at ASC
    LIMIT 16`);
  res.json(list);
});

// GET /practice/portfolio/:id -- full portfolio for a reviewer (reflections + evidence + gateway).
router.get("/practice/portfolio/:id", requireAuth, async (req, res) => {
  if (!isStaff(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const head = await rows(sql`
    SELECT cc.*, pc.code, pc.title, pc.summary, pc.activity_brief, pc.gateway_guidance, pc.example_assignment,
      u.first_name, u.last_name, u.email
    FROM candidate_credentials cc
    JOIN practice_credentials pc ON pc.id = cc.credential_id
    JOIN users u ON u.id = cc.candidate_id
    WHERE cc.id = ${req.params.id} LIMIT 1`);
  if (!head[0]) { res.status(404).json({ error: "Not found" }); return; }
  const reflections = await rows(sql`SELECT stage, content, created_at, source, typed_ms, paste_count FROM reflection_entries WHERE candidate_credential_id = ${req.params.id} ORDER BY created_at`);
  const evidence = await rows(sql`SELECT kind, title, body, url, created_at FROM evidence_items WHERE candidate_credential_id = ${req.params.id} ORDER BY created_at`);
  const reviews = await rows(sql`SELECT g1, g2, g3, outcome, feedback, created_at FROM credential_reviews WHERE candidate_credential_id = ${req.params.id} ORDER BY created_at DESC`);
  const attestations = await rows(sql`SELECT relationship, prompt, status, response_name, response_role, response_comment, responded_at, created_at FROM attestations WHERE candidate_credential_id = ${req.params.id} ORDER BY created_at`);
  res.json({ ...head[0], reflections, evidence, reviews, attestations });
});

// POST /practice/portfolio/:id/review -- record a gateway-based, developmental review. No pass/fail:
// outcome is 'reviewed' or 'referred' (for resubmission); both carry developmental feedback.
router.post("/practice/portfolio/:id/review", requireAuth, async (req, res) => {
  if (!isStaff(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const uid = req.userId!;
  const { g1, g2, g3, outcome, feedback } = req.body ?? {};
  const finalOutcome = outcome === "referred" ? "referred" : "reviewed";
  if (!feedback || !String(feedback).trim()) { res.status(400).json({ error: "Developmental feedback is required for every outcome." }); return; }
  const exists = await rows(sql`SELECT id FROM candidate_credentials WHERE id = ${req.params.id} LIMIT 1`);
  if (!exists[0]) { res.status(404).json({ error: "Not found" }); return; }
  await db.execute(sql`
    INSERT INTO credential_reviews (candidate_credential_id, reviewer_id, g1, g2, g3, outcome, feedback)
    VALUES (${req.params.id}, ${uid}, ${!!g1}, ${!!g2}, ${!!g3}, ${finalOutcome}, ${String(feedback).slice(0, 8000)})`);
  await db.execute(sql`
    UPDATE candidate_credentials SET status = ${finalOutcome}, reviewed_at = now(), updated_at = now() WHERE id = ${req.params.id}`);
  res.json({ ok: true, outcome: finalOutcome });
});

// ── Inter-rater reliability (calibration) ─────────────────────────────────────
// GET /practice/calibration-queue -- already-reviewed portfolios this reviewer can give a blind second
// opinion on (they were not the primary reviewer and have not calibrated it). Never affects candidates.
router.get("/practice/calibration-queue", requireAuth, async (req, res) => {
  if (!isStaff(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const uid = req.userId!;
  const isSuper = req.dbUser?.role === "super_admin";
  const pid = isSuper ? null : await partnerOf(req);
  const scope = isSuper ? sql`TRUE` : sql`cc.partner_id = ${pid}`;
  const list = await rows(sql`
    SELECT cc.id, cc.candidate_id, pc.code, pc.title, u.first_name, u.last_name, u.email,
      (SELECT count(*)::int FROM credential_reviews cr WHERE cr.candidate_credential_id = cc.id AND cr.calibration = true) AS calibration_count
    FROM candidate_credentials cc
    JOIN practice_credentials pc ON pc.id = cc.credential_id
    JOIN users u ON u.id = cc.candidate_id
    WHERE cc.status IN ('reviewed','referred') AND ${scope}
      AND EXISTS (SELECT 1 FROM credential_reviews cr WHERE cr.candidate_credential_id = cc.id AND cr.calibration = false AND cr.reviewer_id <> ${uid})
      AND NOT EXISTS (SELECT 1 FROM credential_reviews cr WHERE cr.candidate_credential_id = cc.id AND cr.reviewer_id = ${uid})
    ORDER BY cc.reviewed_at DESC NULLS LAST
    LIMIT 20`);
  res.json(list);
});

// POST /practice/portfolio/:id/calibrate-review -- record a blind second opinion. No developmental
// feedback, no status change: this only measures whether reviewers agree.
router.post("/practice/portfolio/:id/calibrate-review", requireAuth, async (req, res) => {
  if (!isStaff(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const uid = req.userId!;
  const { g1, g2, g3, outcome } = req.body ?? {};
  const finalOutcome = outcome === "referred" ? "referred" : "reviewed";
  const cc = await rows(sql`SELECT id FROM candidate_credentials WHERE id = ${req.params.id} LIMIT 1`);
  if (!cc[0]) { res.status(404).json({ error: "Not found" }); return; }
  const already = await rows(sql`SELECT id FROM credential_reviews WHERE candidate_credential_id = ${req.params.id} AND reviewer_id = ${uid} LIMIT 1`);
  if (already[0]) { res.status(409).json({ error: "You have already reviewed this portfolio." }); return; }
  const primary = await rows(sql`SELECT id FROM credential_reviews WHERE candidate_credential_id = ${req.params.id} AND calibration = false LIMIT 1`);
  if (!primary[0]) { res.status(400).json({ error: "No primary review to calibrate against yet." }); return; }
  await db.execute(sql`
    INSERT INTO credential_reviews (candidate_credential_id, reviewer_id, g1, g2, g3, outcome, feedback, calibration)
    VALUES (${req.params.id}, ${uid}, ${!!g1}, ${!!g2}, ${!!g3}, ${finalOutcome}, '', true)`);
  res.json({ ok: true });
});

// GET /practice/irr -- inter-rater reliability across every portfolio with both a primary and a
// calibration review: how often two independent reviewers agree, per gateway and on the outcome.
router.get("/practice/irr", requireAuth, async (req, res) => {
  if (req.dbUser?.role !== "super_admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const pairs = await rows<{ id: string; title: string; first_name: string | null; last_name: string | null; email: string; p_g1: boolean; p_g2: boolean; p_g3: boolean; p_outcome: string; c_g1: boolean; c_g2: boolean; c_g3: boolean; c_outcome: string }>(sql`
    SELECT cc.id, pc.title, u.first_name, u.last_name, u.email,
      p.g1 AS p_g1, p.g2 AS p_g2, p.g3 AS p_g3, p.outcome AS p_outcome,
      c.g1 AS c_g1, c.g2 AS c_g2, c.g3 AS c_g3, c.outcome AS c_outcome
    FROM candidate_credentials cc
    JOIN practice_credentials pc ON pc.id = cc.credential_id
    JOIN users u ON u.id = cc.candidate_id
    JOIN LATERAL (SELECT g1, g2, g3, outcome FROM credential_reviews WHERE candidate_credential_id = cc.id AND calibration = false ORDER BY created_at LIMIT 1) p ON true
    JOIN LATERAL (SELECT g1, g2, g3, outcome FROM credential_reviews WHERE candidate_credential_id = cc.id AND calibration = true ORDER BY created_at LIMIT 1) c ON true`);
  const n = pairs.length;
  const agg = { g1: 0, g2: 0, g3: 0, outcome: 0 };
  const disagreements: any[] = [];
  for (const p of pairs) {
    const g1a = p.p_g1 === p.c_g1, g2a = p.p_g2 === p.c_g2, g3a = p.p_g3 === p.c_g3, oa = p.p_outcome === p.c_outcome;
    if (g1a) agg.g1++;
    if (g2a) agg.g2++;
    if (g3a) agg.g3++;
    if (oa) agg.outcome++;
    if (!g1a || !g2a || !g3a || !oa) disagreements.push({ id: p.id, title: p.title, name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email, primary: { g1: p.p_g1, g2: p.p_g2, g3: p.p_g3, outcome: p.p_outcome }, calibration: { g1: p.c_g1, g2: p.c_g2, g3: p.c_g3, outcome: p.c_outcome } });
  }
  const pct = (x: number) => (n ? Math.round((x / n) * 100) : 0);
  res.json({ pairs: n, agreement: { g1: pct(agg.g1), g2: pct(agg.g2), g3: pct(agg.g3), outcome: pct(agg.outcome) }, disagreements });
});

// ── Reviewer certification (calibration set) ──────────────────────────────────
const CERT_THRESHOLD = 80; // percent agreement across all reference items required to certify.

// super_admin designates a portfolio, with an expert reference verdict, as a gold-standard item.
router.post("/practice/certification/items", requireAuth, async (req, res) => {
  if (req.dbUser?.role !== "super_admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const { candidateCredentialId, g1, g2, g3, outcome, note } = req.body ?? {};
  if (!candidateCredentialId) { res.status(400).json({ error: "candidateCredentialId is required" }); return; }
  const ref = outcome === "referred" ? "referred" : "reviewed";
  const ins = await rows(sql`
    INSERT INTO cert_items (candidate_credential_id, ref_g1, ref_g2, ref_g3, ref_outcome, note)
    VALUES (${candidateCredentialId}, ${!!g1}, ${!!g2}, ${!!g3}, ${ref}, ${note ? String(note).slice(0, 500) : null})
    RETURNING id`);
  res.status(201).json(ins[0]);
});

// Active certification items. Blind for a reviewer (no reference verdict), full for a super admin.
router.get("/practice/certification/items", requireAuth, async (req, res) => {
  if (!isStaff(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const uid = req.userId!;
  const isSuper = req.dbUser?.role === "super_admin";
  const list = await rows<any>(sql`
    SELECT ci.id, ci.candidate_credential_id, ci.note, ci.ref_g1, ci.ref_g2, ci.ref_g3, ci.ref_outcome, pc.title,
      (SELECT count(*)::int FROM cert_attempts a WHERE a.item_id = ci.id AND a.reviewer_id = ${uid}) AS attempted
    FROM cert_items ci
    JOIN candidate_credentials cc ON cc.id = ci.candidate_credential_id
    JOIN practice_credentials pc ON pc.id = cc.credential_id
    WHERE ci.active = true ORDER BY ci.created_at`);
  const out = list.map((r) => isSuper ? r : { id: r.id, candidate_credential_id: r.candidate_credential_id, note: r.note, title: r.title, attempted: r.attempted });
  res.json(out);
});

// A reviewer submits their verdict on a certification item; agreement vs the reference is scored.
router.post("/practice/certification/items/:itemId/attempt", requireAuth, async (req, res) => {
  if (!isStaff(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const uid = req.userId!;
  const { g1, g2, g3, outcome } = req.body ?? {};
  const ref = await rows<{ ref_g1: boolean; ref_g2: boolean; ref_g3: boolean; ref_outcome: string }>(sql`SELECT ref_g1, ref_g2, ref_g3, ref_outcome FROM cert_items WHERE id = ${req.params.itemId} AND active = true LIMIT 1`);
  if (!ref[0]) { res.status(404).json({ error: "Not found" }); return; }
  const fo = outcome === "referred" ? "referred" : "reviewed";
  const agree = Number(!!g1 === ref[0].ref_g1) + Number(!!g2 === ref[0].ref_g2) + Number(!!g3 === ref[0].ref_g3) + Number(fo === ref[0].ref_outcome);
  await db.execute(sql`INSERT INTO cert_attempts (reviewer_id, item_id, g1, g2, g3, outcome, agree_count) VALUES (${uid}, ${req.params.itemId}, ${!!g1}, ${!!g2}, ${!!g3}, ${fo}, ${agree})`);
  res.json({ ok: true, agree, of: 4 });
});

// This reviewer's certification status: score against the reference set and whether they are certified.
router.get("/practice/certification/me", requireAuth, async (req, res) => {
  if (!isStaff(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const uid = req.userId!;
  const itemsTotal = (await rows<{ c: number }>(sql`SELECT count(*)::int c FROM cert_items WHERE active = true`))[0]?.c ?? 0;
  const attempts = await rows<{ item_id: string; agree_count: number }>(sql`
    SELECT DISTINCT ON (item_id) item_id, agree_count FROM cert_attempts WHERE reviewer_id = ${uid} ORDER BY item_id, created_at DESC`);
  const itemsAttempted = attempts.length;
  const matched = attempts.reduce((s, a) => s + a.agree_count, 0);
  const score = itemsTotal ? Math.round((matched / (itemsTotal * 4)) * 100) : 0;
  const certified = itemsTotal > 0 && itemsAttempted >= itemsTotal && score >= CERT_THRESHOLD;
  res.json({ itemsTotal, itemsAttempted, score, threshold: CERT_THRESHOLD, certified });
});

// super_admin: roster of reviewers and their certification standing.
router.get("/practice/certification/reviewers", requireAuth, async (req, res) => {
  if (req.dbUser?.role !== "super_admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const itemsTotal = (await rows<{ c: number }>(sql`SELECT count(*)::int c FROM cert_items WHERE active = true`))[0]?.c ?? 0;
  const roster = await rows<{ first_name: string | null; last_name: string | null; email: string; items: number; matched: number }>(sql`
    SELECT u.first_name, u.last_name, u.email,
      count(DISTINCT la.item_id)::int AS items, COALESCE(sum(la.agree_count), 0)::int AS matched
    FROM users u
    JOIN LATERAL (SELECT DISTINCT ON (item_id) item_id, agree_count FROM cert_attempts WHERE reviewer_id = u.id ORDER BY item_id, created_at DESC) la ON true
    WHERE u.role IN ('coach', 'super_admin')
    GROUP BY u.first_name, u.last_name, u.email`);
  const reviewers = roster.map((r) => {
    const score = itemsTotal ? Math.round((r.matched / (itemsTotal * 4)) * 100) : 0;
    return { name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email, items: r.items, itemsTotal, score, certified: itemsTotal > 0 && r.items >= itemsTotal && score >= CERT_THRESHOLD };
  });
  res.json({ itemsTotal, reviewers });
});

// POST /practice/portfolio/:id/prescreen -- a calibration aid for reviewers. An AI reads the portfolio
// against the SAME explicit three-gateway rubric every time, so different reviewers reach consistent
// judgements. It returns a per-gateway verdict with rationale, concrete gaps, and a DRAFT of
// developmental feedback the reviewer edits. Advisory only, the human decides and owns the words.
router.post("/practice/portfolio/:id/prescreen", requireAuth, async (req, res) => {
  if (!isStaff(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const head = await rows<{ title: string; activity_brief: string | null; gateway_guidance: string | null }>(sql`
    SELECT pc.title, pc.activity_brief, pc.gateway_guidance FROM candidate_credentials cc
    JOIN practice_credentials pc ON pc.id = cc.credential_id WHERE cc.id = ${req.params.id} LIMIT 1`);
  if (!head[0]) { res.status(404).json({ error: "Not found" }); return; }
  const reflections = await rows<{ stage: string; content: string }>(sql`SELECT stage, content FROM reflection_entries WHERE candidate_credential_id = ${req.params.id} ORDER BY created_at`);
  const evidence = await rows<{ kind: string; title: string | null; body: string | null; url: string | null }>(sql`SELECT kind, title, body, url FROM evidence_items WHERE candidate_credential_id = ${req.params.id} ORDER BY created_at`);
  const attest = await rows<{ status: string; relationship: string; response_name: string | null }>(sql`SELECT status, relationship, response_name FROM attestations WHERE candidate_credential_id = ${req.params.id}`);

  const portfolioText =
    `Credential: ${head[0].title}\n` +
    (head[0].activity_brief ? `Activity brief: ${head[0].activity_brief}\n` : "") +
    (head[0].gateway_guidance ? `Gateway guidance: ${head[0].gateway_guidance}\n` : "") +
    `\nReflections (${reflections.length}):\n` + reflections.map((r) => `- (${r.stage}) ${r.content}`).join("\n") +
    `\n\nEvidence (${evidence.length}):\n` + evidence.map((e) => `- [${e.kind}] ${[e.title, e.body, e.url].filter(Boolean).join(" ")}`).join("\n") +
    `\n\nAttestations: ` + (attest.length ? attest.map((a) => `${a.relationship} ${a.status}${a.response_name ? ` by ${a.response_name}` : ""}`).join("; ") : "none");

  const system =
    "You are a calibration aid for an independent reviewer of a leadership Practice Credential portfolio. " +
    "You apply the SAME three-gateway rubric every time so different reviewers reach consistent judgements. You never decide the outcome, a human does. There are no marks or percentages.\n\n" +
    "The rubric. Judge each gateway as met, partial or unmet, with a one-line rationale grounded in the candidate's own words:\n" +
    "G1 Relevant activity: the candidate has actually done something substantial and first-hand that is relevant to this credential, not hypothetical and not only reading.\n" +
    "G2 Personal contribution: the candidate's own actions and decisions are identifiable and central, their 'I', not only the team's 'we'.\n" +
    "G3 Learning from practice: the reflection shows genuine learning, an insight or changed understanding, not only a description of events.\n\n" +
    "Then list concrete, specific gaps the candidate could close, and draft warm developmental feedback (150 to 220 words) that names strengths and the single most useful next step. Developmental, never a grade. Never use em dashes or en dashes.\n\n" +
    "Return ONLY valid JSON, no prose around it, of the form: " +
    '{"g1":{"verdict":"met","rationale":"..."},"g2":{"verdict":"partial","rationale":"..."},"g3":{"verdict":"unmet","rationale":"..."},"gaps":["...","..."],"draftFeedback":"..."}';

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 900, system,
      messages: [{ role: "user", content: portfolioText.slice(0, 12000) }],
    }, { timeout: 60000, maxRetries: 1 });
    const raw = (msg.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("").replace(/[—–]/g, ", ");
    const m = raw.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : null;
    if (!parsed) { res.status(502).json({ error: "Could not parse the pre-screen." }); return; }
    res.json(parsed);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Pre-screen unavailable" });
  }
});

// ── Socratic coach (Mutale): action-learning / Gibbs thinking-partner ─────────────────────────────
// Shared by the web canvas and the WhatsApp channel so the coach is identical everywhere.
// The learning science that governs Mutale. Kept explicit so the coach individualizes and offloads
// the RIGHT things: it carries structure and memory for the learner, never the thinking itself.
const MUTALE_SPINE =
  "How you coach, the learning science that governs you:\n" +
  "1. The experiential cycle. Move the person one step at a time through their own experience: concrete experience (what they did and felt), reflective observation (looking back), abstract conceptualization (naming the idea or principle), then active experimentation (what they will try next). This is Kolb, built on Dewey's learning by doing, Lewin's action and reflection, and Piaget's assimilation and accommodation. Never run ahead of where they are in the cycle.\n" +
  "2. Cognitive offloading, used well (Risko and Gilbert). You may carry the LOW-value load for them: remember what they have already said, hold the thread, structure the cycle, offer a word only when a decision needs it. You must NEVER carry the HIGH-value cognition: the noticing, the reflecting, the naming, the deciding. Beneficial offloading frees their working memory to think; detrimental offloading replaces their thinking and stops the learning. When you feel the pull to hand over the answer, that is detrimental offloading. Ask a question instead.\n" +
  "3. Predictive processing. Help them surface what they expected to happen, then notice the gap between that expectation and what actually happened. The surprise, the prediction error, is where the insight and the aha live. Point them toward it, do not resolve it for them.\n" +
  "4. Connectivism. Learning is also connection. Where it helps, prompt them to connect this to other people, cases and resources in their network, not only to what is in their own head.\n" +
  "5. Cognitive twin and co-regulation. You hold a growing model of how THIS person leads, from their prior practice and their own words. Use it to make every question personal to them. Share the effort and the emotion of thinking with them, co-regulate it, but never take the thinking over.\n";

export async function mutaleCoachReply(messages: { role: string; content: string }[], credentialTitle?: string, activityBrief?: string, learnerContext?: string): Promise<string> {
  const history = Array.isArray(messages) ? messages.slice(-16) : [];
  const system =
    `You are ${MUTALE_PERSONA}\n\n${MUTALE_CONSTRAINTS}\n\n${MUTALE_SPINE}\n` +
    (learnerContext ? `Your model of this person (do not read it back to them; use it to individualize every question):\n${learnerContext}\n\n` : "") +
    `You are helping them turn a real leadership experience into articulated learning and evidence for the Practice Credential "${credentialTitle ?? "leadership"}". ` +
    (activityBrief ? `The activity brief is: ${activityBrief}\n` : "") +
    `Ask one question at a time, grounded in their own experience and their prior practice. Never lecture, never hand over the right answer or the correct leadership style, and never grade, a human reviewer decides reviewed or resubmit. Keep replies short enough to read on a phone. Never use em dashes or en dashes.`;
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system,
    messages: history.length ? history.map((m) => ({ role: m.role === "assistant" ? "assistant" as const : "user" as const, content: String(m.content ?? "").slice(0, 4000) }))
      : [{ role: "user" as const, content: "I'm ready to start reflecting on my leadership experience." }],
  }, { timeout: 60000, maxRetries: 1 });
  return (msg.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("").replace(/[—–]/g, ", ").trim();
}

// POST /practice/coach -- turns a candidate's experience into articulated learning through questions,
// individualised from the candidate's own prior-practice reason and reflection so far (their twin).
router.post("/practice/coach", requireAuth, async (req, res) => {
  const uid = req.userId!;
  const { messages, candidateCredentialId } = req.body ?? {};
  let title: string | undefined = req.body?.credentialTitle;
  let brief: string | undefined = req.body?.activityBrief;
  let context: string | undefined;
  if (candidateCredentialId) {
    try {
      const head = await rows<{ justification: string | null; title: string; activity_brief: string | null }>(sql`
        SELECT cc.justification, pc.title, pc.activity_brief
        FROM candidate_credentials cc JOIN practice_credentials pc ON pc.id = cc.credential_id
        WHERE cc.id = ${candidateCredentialId} AND cc.candidate_id = ${uid} LIMIT 1`);
      if (head[0]) {
        title = head[0].title; brief = head[0].activity_brief ?? undefined;
        const refs = await rows<{ stage: string; content: string }>(sql`SELECT stage, content FROM reflection_entries WHERE candidate_credential_id = ${candidateCredentialId} ORDER BY created_at`);
        const u = await rows<{ first_name: string | null }>(sql`SELECT first_name FROM users WHERE id = ${uid} LIMIT 1`);
        const parts = [`Name: ${u[0]?.first_name || "the candidate"}.`];
        if (head[0].justification) parts.push(`Why they chose this credential (their own prior-practice reason): ${head[0].justification}`);
        if (refs.length) parts.push(`Their reflection so far, in their own words: ${refs.map((r) => `(${r.stage}) ${r.content}`).join(" | ")}`);
        context = parts.join("\n");
      }
    } catch { /* individualise best-effort; fall back to a generic coach */ }
  }
  try {
    res.json({ reply: await mutaleCoachReply(messages, title, brief, context) });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Coach unavailable" });
  }
});

/** The candidate's active credential for capturing WhatsApp reflection: their most recently touched
 * in-progress credential, else their first chosen one. Returns the row id + title + brief, or null. */
export async function activeCandidateCredential(candidateId: string): Promise<{ id: string; title: string; activity_brief: string | null } | null> {
  try {
    const r = await rows<{ id: string; title: string; activity_brief: string | null }>(sql`
      SELECT cc.id, pc.title, pc.activity_brief
      FROM candidate_credentials cc JOIN practice_credentials pc ON pc.id = cc.credential_id
      WHERE cc.candidate_id = ${candidateId} AND cc.status IN ('in_progress','chosen')
      ORDER BY (cc.status = 'in_progress') DESC, cc.updated_at DESC LIMIT 1`);
    return r[0] ?? null;
  } catch {
    return null;
  }
}

/** The candidate's choosable credentials (in progress or chosen), in their own order. */
export async function listCandidateCredentials(candidateId: string): Promise<{ id: string; title: string }[]> {
  try {
    return await rows<{ id: string; title: string }>(sql`
      SELECT cc.id, pc.title FROM candidate_credentials cc JOIN practice_credentials pc ON pc.id = cc.credential_id
      WHERE cc.candidate_id = ${candidateId} AND cc.status IN ('in_progress','chosen') ORDER BY cc.sort, cc.created_at`);
  } catch { return []; }
}

/** Make a credential the active one (newest updated_at wins in activeCandidateCredential) + start it. */
export async function touchCandidateCredential(id: string): Promise<void> {
  try {
    await db.execute(sql`UPDATE candidate_credentials SET updated_at = now(), status = CASE WHEN status = 'chosen' THEN 'in_progress' ELSE status END WHERE id = ${id}`);
  } catch { /* best effort */ }
}

/** Capture a WhatsApp reflection message against a candidate credential (stage 'note'). */
export async function captureWhatsappReflection(candidateCredentialId: string, content: string): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO reflection_entries (candidate_credential_id, stage, content, source)
      VALUES (${candidateCredentialId}, 'note', ${content.slice(0, 8000)}, 'whatsapp')`);
    await db.execute(sql`UPDATE candidate_credentials SET updated_at = now() WHERE id = ${candidateCredentialId}`);
  } catch {
    /* best effort */
  }
}

export default router;
