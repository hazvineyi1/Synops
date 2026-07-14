import { Router } from "express";
import { db } from "@workspace/db";
import { coursePagesTable, usersTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// GET /courses/:courseId/pages
router.get("/courses/:courseId/pages", requireAuth, async (req, res) => {
  const rows = await db
    .select({ page: coursePagesTable, author: usersTable })
    .from(coursePagesTable)
    .leftJoin(usersTable, eq(coursePagesTable.authorId, usersTable.id))
    .where(eq(coursePagesTable.courseId, req.params.courseId))
    .orderBy(asc(coursePagesTable.position));
  res.json(rows.map(r => ({ ...r.page, author: r.author ? { id: r.author.id, firstName: r.author.firstName, lastName: r.author.lastName } : null })));
});

// POST /courses/:courseId/pages
router.post("/courses/:courseId/pages", requireAuth, async (req, res) => {
  const { title, body, published, frontPage, position } = req.body;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [page] = await db.insert(coursePagesTable).values({
    courseId: req.params.courseId, authorId: req.userId!, title, slug,
    body: body ?? "", published: published ?? false, frontPage: frontPage ?? false, position: position ?? 0,
  }).returning();
  res.status(201).json(page);
});

// GET /courses/:courseId/pages/:pageIdOrSlug
router.get("/courses/:courseId/pages/:pageIdOrSlug", requireAuth, async (req, res) => {
  const { courseId, pageIdOrSlug } = req.params;
  const byId = await db.query.coursePagesTable.findFirst({
    where: and(eq(coursePagesTable.courseId, courseId), eq(coursePagesTable.id, pageIdOrSlug)),
  });
  const page = byId ?? await db.query.coursePagesTable.findFirst({
    where: and(eq(coursePagesTable.courseId, courseId), eq(coursePagesTable.slug, pageIdOrSlug)),
  });
  if (!page) { res.status(404).json({ error: "Not found" }); return; }
  res.json(page);
});

// PATCH /courses/:courseId/pages/:pageId
router.patch("/courses/:courseId/pages/:pageId", requireAuth, async (req, res) => {
  const { title, body, published, frontPage, position } = req.body;
  const [updated] = await db.update(coursePagesTable)
    .set({ title, body, published, frontPage, position, updatedAt: new Date() })
    .where(eq(coursePagesTable.id, req.params.pageId))
    .returning();
  res.json(updated);
});

// DELETE /courses/:courseId/pages/:pageId
router.delete("/courses/:courseId/pages/:pageId", requireAuth, async (req, res) => {
  await db.delete(coursePagesTable).where(eq(coursePagesTable.id, req.params.pageId));
  res.status(204).send();
});

export default router;
