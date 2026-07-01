import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  teachersTable,
  resourceSharesTable,
  lessonPlansTable,
  worksheetsTable,
  quizzesTable,
  parentDraftsTable,
} from "@workspace/paideia-db";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { requireAuth, requireActiveTeacher } from "../../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireAuth, requireActiveTeacher);

const RESOURCE_KINDS = ["plan", "worksheet", "quiz", "parent-draft"] as const;
type ResourceKind = typeof RESOURCE_KINDS[number];

const createSchema = z.object({
  resourceType: z.enum(RESOURCE_KINDS),
  resourceId: z.string().uuid(),
  toEmail: z.string().email(),
  message: z.string().max(1000).optional(),
});

function tableFor(kind: ResourceKind) {
  switch (kind) {
    case "plan": return lessonPlansTable;
    case "worksheet": return worksheetsTable;
    case "quiz": return quizzesTable;
    case "parent-draft": return parentDraftsTable;
  }
}

async function loadResourceTitle(kind: ResourceKind, id: string, teacherId: string): Promise<string | null> {
  if (kind === "parent-draft") {
    const [row] = await db
      .select({ studentName: parentDraftsTable.studentName })
      .from(parentDraftsTable)
      .where(and(eq(parentDraftsTable.id, id), eq(parentDraftsTable.teacherId, teacherId)))
      .limit(1);
    return row ? `Message about ${row.studentName}` : null;
  }
  const t = tableFor(kind) as typeof lessonPlansTable;
  const [row] = await db
    .select({ title: t.title })
    .from(t)
    .where(and(eq(t.id, id), eq(t.teacherId, teacherId)))
    .limit(1);
  return row?.title ?? null;
}

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const teacherId = req.teacher!.id;
  const emailLower = parsed.data.toEmail.toLowerCase().trim();
  if (emailLower === req.teacher!.email.toLowerCase()) {
    res.status(400).json({ error: "You cannot share a resource with yourself." });
    return;
  }
  const title = await loadResourceTitle(parsed.data.resourceType, parsed.data.resourceId, teacherId);
  if (!title) { res.status(404).json({ error: "Resource not found in your library." }); return; }
  // Look up recipient teacher (may not exist yet - share still recorded).
  const recipient = (await db.select({ id: teachersTable.id }).from(teachersTable).where(eq(teachersTable.email, emailLower)).limit(1))[0];
  const [row] = await db
    .insert(resourceSharesTable)
    .values({
      resourceType: parsed.data.resourceType,
      resourceId: parsed.data.resourceId,
      fromTeacherId: teacherId,
      toEmail: emailLower,
      toTeacherId: recipient?.id ?? null,
      message: parsed.data.message ?? null,
    })
    .returning();
  res.status(201).json({
    share: { id: row.id, resourceType: row.resourceType, toEmail: row.toEmail, sharedAt: row.sharedAt.toISOString() },
    recipientExists: Boolean(recipient),
  });
});

router.get("/inbox", async (req, res) => {
  const teacherId = req.teacher!.id;
  const email = req.teacher!.email.toLowerCase();
  const rows = await db
    .select({
      id: resourceSharesTable.id,
      resourceType: resourceSharesTable.resourceType,
      resourceId: resourceSharesTable.resourceId,
      copiedResourceId: resourceSharesTable.copiedResourceId,
      message: resourceSharesTable.message,
      sharedAt: resourceSharesTable.sharedAt,
      viewedAt: resourceSharesTable.viewedAt,
      fromName: teachersTable.name,
      fromEmail: teachersTable.email,
    })
    .from(resourceSharesTable)
    .innerJoin(teachersTable, eq(resourceSharesTable.fromTeacherId, teachersTable.id))
    .where(or(eq(resourceSharesTable.toTeacherId, teacherId), eq(resourceSharesTable.toEmail, email)))
    .orderBy(desc(resourceSharesTable.sharedAt))
    .limit(200);
  res.json({
    items: rows.map((r) => ({
      ...r,
      sharedAt: r.sharedAt.toISOString(),
      viewedAt: r.viewedAt ? r.viewedAt.toISOString() : null,
    })),
  });
});

router.get("/outbox", async (req, res) => {
  const teacherId = req.teacher!.id;
  const rows = await db
    .select()
    .from(resourceSharesTable)
    .where(eq(resourceSharesTable.fromTeacherId, teacherId))
    .orderBy(desc(resourceSharesTable.sharedAt))
    .limit(200);
  res.json({
    items: rows.map((r) => ({ ...r, sharedAt: r.sharedAt.toISOString(), viewedAt: r.viewedAt ? r.viewedAt.toISOString() : null })),
  });
});

router.post("/:id/claim", async (req, res) => {
  const id = req.params["id"];
  if (!id) { res.status(400).json({ error: "Missing id" }); return; }
  const teacherId = req.teacher!.id;
  const email = req.teacher!.email.toLowerCase();
  const [share] = await db
    .select()
    .from(resourceSharesTable)
    .where(and(eq(resourceSharesTable.id, id), or(eq(resourceSharesTable.toTeacherId, teacherId), eq(resourceSharesTable.toEmail, email))))
    .limit(1);
  if (!share) { res.status(404).json({ error: "Share not found." }); return; }
  if (share.copiedResourceId) {
    res.json({ kind: share.resourceType, id: share.copiedResourceId, alreadyClaimed: true });
    return;
  }
  const kind = share.resourceType as ResourceKind;
  const t = tableFor(kind);
  const [original] = await db
    .select()
    .from(t as typeof lessonPlansTable)
    .where(eq((t as typeof lessonPlansTable).id, share.resourceId))
    .limit(1);
  if (!original) {
    await db
      .update(resourceSharesTable)
      .set({ viewedAt: new Date() })
      .where(eq(resourceSharesTable.id, share.id));
    res.status(410).json({ error: "Original resource is no longer available." });
    return;
  }
  const { id: _i, createdAt: _c, teacherId: _t, ...rest } = original as Record<string, unknown> as { id: string; createdAt: Date; teacherId: string; title?: string } & Record<string, unknown>;
  const titlePrefix = rest.title ? `${rest.title} (shared)` : undefined;
  const insertVals = { ...rest, teacherId, ...(titlePrefix ? { title: titlePrefix } : {}) } as typeof lessonPlansTable.$inferInsert;
  const [copy] = await db.insert(t as typeof lessonPlansTable).values(insertVals).returning();
  await db
    .update(resourceSharesTable)
    .set({ copiedResourceId: copy.id, toTeacherId: teacherId, viewedAt: new Date() })
    .where(eq(resourceSharesTable.id, share.id));
  res.status(201).json({ kind, id: copy.id });
});

router.get("/inbox-count", async (req, res) => {
  const teacherId = req.teacher!.id;
  const email = req.teacher!.email.toLowerCase();
  const rows = await db
    .select({ id: resourceSharesTable.id })
    .from(resourceSharesTable)
    .where(and(
      or(eq(resourceSharesTable.toTeacherId, teacherId), eq(resourceSharesTable.toEmail, email)),
      isNull(resourceSharesTable.viewedAt),
    ));
  res.json({ count: rows.length });
});

export default router;
