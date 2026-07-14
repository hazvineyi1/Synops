import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// GET /users/me
router.get("/users/me", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  res.json({
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    partnerId: user.partnerId,
    organisationId: user.organisationId,
    createdAt: user.createdAt.toISOString(),
  });
});

// PATCH /users/me
router.patch("/users/me", requireAuth, async (req, res) => {
  const { firstName, lastName } = req.body;
  const [updated] = await db
    .update(usersTable)
    .set({ firstName, lastName, updatedAt: new Date() })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  res.json({
    id: updated.id,
    clerkId: updated.clerkId,
    email: updated.email,
    firstName: updated.firstName,
    lastName: updated.lastName,
    avatarUrl: updated.avatarUrl,
    role: updated.role,
    partnerId: updated.partnerId,
    organisationId: updated.organisationId,
    createdAt: updated.createdAt.toISOString(),
  });
});

export default router;
