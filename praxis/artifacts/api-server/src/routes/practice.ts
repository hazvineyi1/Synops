import { Router } from "express";
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
  const { stage, content } = req.body ?? {};
  if (!content || !String(content).trim()) { res.status(400).json({ error: "content is required" }); return; }
  const ins = await rows(sql`
    INSERT INTO reflection_entries (candidate_credential_id, stage, content)
    VALUES (${req.params.id}, ${stage || "note"}, ${String(content).slice(0, 8000)}) RETURNING *`);
  res.status(201).json(ins[0]);
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
  const reflections = await rows(sql`SELECT stage, content, created_at FROM reflection_entries WHERE candidate_credential_id = ${req.params.id} ORDER BY created_at`);
  const evidence = await rows(sql`SELECT kind, title, body, url, created_at FROM evidence_items WHERE candidate_credential_id = ${req.params.id} ORDER BY created_at`);
  const reviews = await rows(sql`SELECT g1, g2, g3, outcome, feedback, created_at FROM credential_reviews WHERE candidate_credential_id = ${req.params.id} ORDER BY created_at DESC`);
  res.json({ ...head[0], reflections, evidence, reviews });
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

// ── Socratic coach (Mutale): action-learning / Gibbs thinking-partner ─────────────────────────────
// Shared by the web canvas and the WhatsApp channel so the coach is identical everywhere.
export async function mutaleCoachReply(messages: { role: string; content: string }[], credentialTitle?: string, activityBrief?: string): Promise<string> {
  const history = Array.isArray(messages) ? messages.slice(-16) : [];
  const system =
    `You are ${MUTALE_PERSONA}\n\n${MUTALE_CONSTRAINTS}\n\n` +
    `You are helping a candidate turn a real leadership experience into articulated learning and evidence for the Practice Credential "${credentialTitle ?? "leadership"}". ` +
    (activityBrief ? `The activity brief is: ${activityBrief}\n` : "") +
    `Work the reflective cycle (Gibbs) with them, one step at a time, in their own experience: description of what happened, feelings, evaluation (what was good or bad), analysis (bring in a leadership idea only when their decision needs it), then conclusion and next actions. ` +
    `Never lecture, never hand over the "right" answer or the "correct" leadership style, ask one question at a time, and help them name what they already know from practice. Do not grade; a human reviewer decides reviewed or resubmit. Keep replies short enough to read on a phone. Never use em dashes or en dashes.`;
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system,
    messages: history.length ? history.map((m) => ({ role: m.role === "assistant" ? "assistant" as const : "user" as const, content: String(m.content ?? "").slice(0, 4000) }))
      : [{ role: "user" as const, content: "I'm ready to start reflecting on my leadership experience." }],
  }, { timeout: 60000, maxRetries: 1 });
  return (msg.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("").replace(/[—–]/g, ", ").trim();
}

// POST /practice/coach -- turns a candidate's experience into articulated learning through questions.
router.post("/practice/coach", requireAuth, async (req, res) => {
  const { messages, credentialTitle, activityBrief } = req.body ?? {};
  try {
    res.json({ reply: await mutaleCoachReply(messages, credentialTitle, activityBrief) });
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

/** Capture a WhatsApp reflection message against a candidate credential (stage 'note'). */
export async function captureWhatsappReflection(candidateCredentialId: string, content: string): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO reflection_entries (candidate_credential_id, stage, content)
      VALUES (${candidateCredentialId}, 'note', ${content.slice(0, 8000)})`);
    await db.execute(sql`UPDATE candidate_credentials SET updated_at = now() WHERE id = ${candidateCredentialId}`);
  } catch {
    /* best effort */
  }
}

export default router;
