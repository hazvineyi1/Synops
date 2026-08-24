import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";

/**
 * Partner change requests.
 *
 * A partner never edits a platform course. Instead, while viewing a course they can REQUEST a change
 * (fix a banner, add activities, correct content, adjust an objective, etc.), tagged with exactly what
 * they were looking at (course + module + section). Those requests land in a super-admin review queue,
 * which shows an open-count badge and lets the super admin resolve each one. Self-creates its table.
 */
const router = Router();

const VALID_CATEGORIES = new Set([
  "banner", "content", "activity", "assessment", "objective", "reading", "accessibility", "other",
]);

async function ensureTable() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS change_requests (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    partner_id text,
    partner_name text,
    course_id text NOT NULL,
    course_title text,
    module_id text,
    module_title text,
    section text,
    category text NOT NULL,
    details text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    created_by text,
    created_by_name text,
    created_by_email text,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_by text,
    resolved_by_name text,
    resolved_at timestamptz,
    resolution_note text
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS change_requests_status_idx ON change_requests (status)`);
}

function actorName(u: { firstName?: string | null; lastName?: string | null; email?: string | null }): string {
  const n = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return n || (u.email ?? "Unknown");
}

// POST /change-requests — a partner-side staff member (partner_admin / org_admin / coach), or a super
// admin, files a change request against a course. The client sends the context it was viewing.
router.post("/change-requests", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  if (!["partner_admin", "org_admin", "coach", "super_admin"].includes(u.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const courseId = typeof req.body?.courseId === "string" ? req.body.courseId : "";
  const category = typeof req.body?.category === "string" ? req.body.category : "";
  const details = typeof req.body?.details === "string" ? req.body.details.trim() : "";
  if (!courseId || !VALID_CATEGORIES.has(category) || details.length < 3) {
    res.status(400).json({ error: "courseId, a valid category, and details are required." });
    return;
  }
  await ensureTable();
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);
  // Resolve the partner's display name so the super-admin queue shows who asked, without the client
  // having to know it.
  let partnerName = str(req.body?.partnerName);
  if (!partnerName && u.partnerId) {
    try {
      const pr = (await db.execute(sql`SELECT name FROM partners WHERE id = ${u.partnerId} LIMIT 1`)).rows as { name: string }[];
      partnerName = pr[0]?.name ?? null;
    } catch { /* best-effort */ }
  }
  const [row] = (await db.execute(sql`
    INSERT INTO change_requests
      (partner_id, partner_name, course_id, course_title, module_id, module_title, section, category, details, created_by, created_by_name, created_by_email)
    VALUES (
      ${u.partnerId ?? null}, ${partnerName}, ${courseId}, ${str(req.body?.courseTitle)},
      ${str(req.body?.moduleId)}, ${str(req.body?.moduleTitle)}, ${str(req.body?.section)},
      ${category}, ${details.slice(0, 4000)}, ${u.id}, ${actorName(u as any)}, ${u.email ?? null}
    ) RETURNING id`)).rows as { id: string }[];
  await logAudit(req, "change_request.create", "course", courseId, { category, module: str(req.body?.moduleTitle) });
  res.status(201).json({ ok: true, id: row?.id });
});

// GET /change-requests/mine — the caller's own submitted requests (partner staff track their status).
router.get("/change-requests/mine", requireAuth, async (req, res) => {
  await ensureTable();
  const rows = (await db.execute(sql`
    SELECT * FROM change_requests WHERE created_by = ${req.dbUser!.id} ORDER BY created_at DESC LIMIT 200`)).rows;
  res.json(rows);
});

// GET /change-requests/open-count — badge count for super admins.
router.get("/change-requests/open-count", requireAuth, async (req, res) => {
  if (req.dbUser!.role !== "super_admin") { res.json({ count: 0 }); return; }
  await ensureTable();
  const rows = (await db.execute(sql`SELECT count(*)::int AS n FROM change_requests WHERE status = 'open'`)).rows as { n: number }[];
  res.json({ count: rows[0]?.n ?? 0 });
});

// GET /change-requests?status=open|resolved|all — the super-admin review queue.
router.get("/change-requests", requireAuth, async (req, res) => {
  if (req.dbUser!.role !== "super_admin") { res.status(403).json({ error: "Forbidden" }); return; }
  await ensureTable();
  const status = typeof req.query.status === "string" ? req.query.status : "open";
  const rows = status === "all"
    ? (await db.execute(sql`SELECT * FROM change_requests ORDER BY (status='open') DESC, created_at DESC LIMIT 500`)).rows
    : (await db.execute(sql`SELECT * FROM change_requests WHERE status = ${status} ORDER BY created_at DESC LIMIT 500`)).rows;
  res.json(rows);
});

// PATCH /change-requests/:id — super admin resolves (or reopens) a request.
router.patch("/change-requests/:id", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  if (u.role !== "super_admin") { res.status(403).json({ error: "Forbidden" }); return; }
  await ensureTable();
  const status = req.body?.status === "resolved" || req.body?.status === "open" ? req.body.status : "resolved";
  const note = typeof req.body?.resolutionNote === "string" ? req.body.resolutionNote.trim().slice(0, 2000) : null;
  if (status === "resolved") {
    await db.execute(sql`UPDATE change_requests SET status='resolved', resolved_by=${u.id}, resolved_by_name=${actorName(u as any)}, resolved_at=now(), resolution_note=${note} WHERE id = ${req.params.id}`);
  } else {
    await db.execute(sql`UPDATE change_requests SET status='open', resolved_by=NULL, resolved_by_name=NULL, resolved_at=NULL, resolution_note=NULL WHERE id = ${req.params.id}`);
  }
  await logAudit(req, "change_request.update", "change_request", req.params.id, { status });
  res.json({ ok: true, status });
});

export default router;
