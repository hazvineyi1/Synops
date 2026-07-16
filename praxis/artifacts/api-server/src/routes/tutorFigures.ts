import { Router } from "express";
import { db } from "@workspace/db";
import { tutorFiguresTable, type TutorFigure } from "@workspace/db";
import { eq, or, isNull, desc, type SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { hasHubAccess, canAdministerOrg } from "../lib/roles";
import { logAudit } from "../lib/audit";

/**
 * Reusable tutor figures library. Instructional designers (Hub) manage a shared platform
 * library (organisationId null); Facilitators manage their own tenant's figures. Any of
 * them can pick from platform + their own figures when authoring a case.
 */
const router = Router();

type U = { id: string; role: string; organisationId?: string | null; partnerId?: string | null };

const canAuthor = (role: string) => hasHubAccess(role) || canAdministerOrg(role);

function ownsTenant(u: U, tenantId: string | null): boolean {
  if (!tenantId) return false;
  if (u.organisationId && tenantId === u.organisationId) return true;
  if (u.partnerId && tenantId === u.partnerId) return true;
  return false;
}

function canManageFigure(u: U, f: TutorFigure): boolean {
  if (hasHubAccess(u.role)) return true;
  return canAdministerOrg(u.role) && ownsTenant(u, f.organisationId);
}

function figureResponse(f: TutorFigure) {
  return { id: f.id, name: f.name, image: f.image, gender: f.gender, organisationId: f.organisationId, createdAt: f.createdAt.toISOString() };
}

// GET /tutor-figures — platform figures + the user's own tenant figures.
router.get("/tutor-figures", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  let rows: TutorFigure[];
  if (hasHubAccess(u.role)) {
    rows = await db.select().from(tutorFiguresTable).orderBy(desc(tutorFiguresTable.createdAt));
  } else {
    const conds: SQL[] = [isNull(tutorFiguresTable.organisationId) as SQL];
    if (u.organisationId) conds.push(eq(tutorFiguresTable.organisationId, u.organisationId));
    if (u.partnerId) conds.push(eq(tutorFiguresTable.organisationId, u.partnerId));
    rows = await db.select().from(tutorFiguresTable).where(or(...conds)).orderBy(desc(tutorFiguresTable.createdAt));
  }
  res.json(rows.map(figureResponse));
});

// POST /tutor-figures — save a new figure.
router.post("/tutor-figures", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  if (!canAuthor(u.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { name, image, gender } = req.body ?? {};
  if (!name || typeof name !== "string") { res.status(400).json({ error: "name is required" }); return; }
  if (!image || typeof image !== "string" || !/^(data:image\/|https?:\/\/)/.test(image)) {
    res.status(400).json({ error: "image must be a data:image URL or an https URL" }); return;
  }
  if (image.length > 3_000_000) { res.status(413).json({ error: "Image is too large. Please use a smaller photo." }); return; }

  // Hub authors save to the shared platform library; facilitators to their own tenant.
  const organisationId = hasHubAccess(u.role) ? null : (u.organisationId ?? u.partnerId ?? null);
  const [row] = await db
    .insert(tutorFiguresTable)
    .values({ organisationId, createdBy: u.id, name: name.slice(0, 80), image, gender: gender === "male" || gender === "female" ? gender : null })
    .returning();
  await logAudit(req, "tutor_figure.create", "tutor_figure", row.id, { name: row.name, organisationId });
  res.status(201).json(figureResponse(row));
});

// DELETE /tutor-figures/:id
router.delete("/tutor-figures/:id", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const f = await db.query.tutorFiguresTable.findFirst({ where: eq(tutorFiguresTable.id, req.params.id) });
  if (!f) { res.status(204).send(); return; }
  if (!canManageFigure(u, f)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(tutorFiguresTable).where(eq(tutorFiguresTable.id, f.id));
  await logAudit(req, "tutor_figure.delete", "tutor_figure", f.id, { name: f.name });
  res.status(204).send();
});

export default router;
